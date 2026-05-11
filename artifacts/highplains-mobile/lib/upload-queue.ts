import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { ApiError, apiRequest, loadToken } from "./api";

// ─── Persistence model ──────────────────────────────────────────────────────
//
// `QueueItem` lives in AsyncStorage under `QUEUE_KEY`. Photo binaries live in
// `FileSystem.documentDirectory + "queue/"` and are referenced by `fileUri`.
// Notes are persisted by value (no separate file).
//
// On app start the queue auto-resumes. While items remain, a periodic flusher
// retries them with exponential backoff. Each item carries a `clientId` that
// the server uses as an idempotency key so a retried POST does not create a
// duplicate row.

export type QueuePhotoItem = {
  kind: "photo";
  id: string;            // local UUID — also the server's X-Client-Id
  ticketId: string;
  fileUri: string;       // file:// in queue dir (or web blob URL)
  contentType: string;   // 'image/jpeg' typically
  capturedAt: string;    // ISO
  attempts: number;
  nextAttemptAt: number; // epoch ms; <= Date.now() means ready
  lastError?: string;
};

export type QueueNoteItem = {
  kind: "note";
  id: string;            // local UUID — also the server's clientId
  ticketId: string;
  body: string;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
};

// Mobile v1 Slice 4 — flag composer entry. A flag is posted as a single
// multipart request to /api/m/flags carrying tag + optional note + 1..N
// already-resized JPEG file URIs. Photos are pre-processed (EXIF stripped /
// resized) by the composer before enqueue so the worker just streams bytes.
export type QueueFlagItem = {
  kind: "flag";
  id: string;            // local UUID — also the server's clientId
  ticketId: string;      // mirrors photo/note shape so listItemsForTicket works; "" if none
  tag: string;
  note: string | null;
  propertyId: string | null;
  ticketLinkId: string | null; // optional ticket FK on the flag itself
  fileUris: string[];    // file:// in queue dir (or web blob URLs)
  capturedAt: string;    // ISO
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
};

export type QueueItem = QueuePhotoItem | QueueNoteItem | QueueFlagItem;

const QUEUE_KEY = "hp.upload-queue.v1";
const QUEUE_DIR = `${FileSystem.documentDirectory ?? ""}queue/`;
const BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 60_000, 300_000] as const;
const TICK_MS = 5_000;

let queue: QueueItem[] = [];
let loaded = false;
let loadingPromise: Promise<void> | null = null;
let flushPromise: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try { l(); } catch { /* listener errors must not break the queue */ }
  }
}

function nowMs(): number {
  return Date.now();
}

function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

async function ensureQueueDir(): Promise<void> {
  if (Platform.OS === "web") return; // FileSystem dir not used on web
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
    }
  } catch {
    /* best-effort */
  }
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  emit();
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) queue = parsed as QueueItem[];
      }
    } catch {
      queue = [];
    }
    await ensureQueueDir();
    loaded = true;
    startTimer();
  })();
  return loadingPromise;
}

function startTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flush();
  }, TICK_MS);
}

function genId(): string {
  // RFC4122-ish UUIDv4 without extra deps.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Public enqueue API ─────────────────────────────────────────────────────

export async function enqueuePhoto(args: {
  ticketId: string;
  sourceFileUri: string; // file:// from image picker / image manipulator
  contentType?: string;
  capturedAt?: Date;
}): Promise<string> {
  await ensureLoaded();
  const id = genId();
  let fileUri = args.sourceFileUri;
  if (Platform.OS !== "web") {
    // Copy into our queue dir so the picker's cache file can be cleaned up.
    try {
      const ext = (args.contentType?.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const dest = `${QUEUE_DIR}${id}.${ext}`;
      await FileSystem.copyAsync({ from: args.sourceFileUri, to: dest });
      fileUri = dest;
    } catch {
      // Fall back to the source URI; if it disappears the upload will fail
      // (and surface as a retryable error).
    }
  }
  const item: QueuePhotoItem = {
    kind: "photo",
    id,
    ticketId: args.ticketId,
    fileUri,
    contentType: args.contentType ?? "image/jpeg",
    capturedAt: (args.capturedAt ?? new Date()).toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  };
  queue.push(item);
  await persist();
  void flush();
  return id;
}

export async function enqueueNote(args: { ticketId: string; body: string }): Promise<string> {
  await ensureLoaded();
  const id = genId();
  const item: QueueNoteItem = {
    kind: "note",
    id,
    ticketId: args.ticketId,
    body: args.body,
    attempts: 0,
    nextAttemptAt: 0,
  };
  queue.push(item);
  await persist();
  void flush();
  return id;
}

export async function enqueueFlag(args: {
  tag: string;
  note: string | null;
  propertyId: string | null;
  ticketId: string | null;
  sourceFileUris: string[]; // already resized + EXIF-stripped JPEGs
  capturedAt?: Date;
}): Promise<string> {
  await ensureLoaded();
  const id = genId();
  const fileUris: string[] = [];
  for (const src of args.sourceFileUris) {
    if (Platform.OS === "web") {
      fileUris.push(src);
      continue;
    }
    try {
      const dest = `${QUEUE_DIR}${id}-${fileUris.length}.jpg`;
      await FileSystem.copyAsync({ from: src, to: dest });
      fileUris.push(dest);
    } catch {
      fileUris.push(src);
    }
  }
  const item: QueueFlagItem = {
    kind: "flag",
    id,
    ticketId: args.ticketId ?? "",
    tag: args.tag,
    note: args.note,
    propertyId: args.propertyId,
    ticketLinkId: args.ticketId,
    fileUris,
    capturedAt: (args.capturedAt ?? new Date()).toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  };
  queue.push(item);
  await persist();
  void flush();
  return id;
}

export async function removeItem(id: string): Promise<void> {
  await ensureLoaded();
  const idx = queue.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const item = queue[idx];
  queue.splice(idx, 1);
  if (item.kind === "photo" && item.fileUri.startsWith(QUEUE_DIR)) {
    try { await FileSystem.deleteAsync(item.fileUri, { idempotent: true }); } catch {}
  } else if (item.kind === "flag") {
    for (const uri of item.fileUris) {
      if (uri.startsWith(QUEUE_DIR)) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      }
    }
  }
  await persist();
}

export async function retryNow(id?: string): Promise<void> {
  await ensureLoaded();
  for (const item of queue) {
    if (id && item.id !== id) continue;
    item.nextAttemptAt = 0;
    item.attempts = 0;
    item.lastError = undefined;
  }
  await persist();
  void flush();
}

export type QueueStatus = {
  total: number;
  pending: number;   // waiting to upload
  failing: number;   // attempted at least once and currently backing off
  itemsByTicket: Record<string, { photos: number; notes: number; failing: number }>;
};

/** Snapshot of all queue items for a given ticket — read-only. */
export function listItemsForTicket(ticketId: string): QueueItem[] {
  return queue.filter((i) => i.ticketId === ticketId).slice();
}

/** Per-item-success listeners — fired once per item as it lands on the
 * server, so React Query can invalidate the affected ticket's photos/notes
 * cache immediately rather than waiting for the whole queue to drain. */
type SuccessListener = (item: QueueItem) => void;
const successListeners = new Set<SuccessListener>();
export function onItemUploaded(fn: SuccessListener): () => void {
  successListeners.add(fn);
  return () => { successListeners.delete(fn); };
}

/** Snapshot of all currently-failing queue items across all tickets. */
export function listFailingItems(): QueueItem[] {
  const t = nowMs();
  return queue.filter((i) => i.attempts > 0 && i.nextAttemptAt > t).slice();
}

/** React hook variant of {@link listFailingItems}. */
export function useFailingQueueItems(): QueueItem[] {
  const [items, setItems] = useState<QueueItem[]>(() => listFailingItems());
  useEffect(() => {
    let mounted = true;
    void ensureLoaded().then(() => {
      if (mounted) setItems(listFailingItems());
    });
    const fn = () => setItems(listFailingItems());
    listeners.add(fn);
    return () => {
      mounted = false;
      listeners.delete(fn);
    };
  }, []);
  return items;
}

export function getStatus(): QueueStatus {
  const status: QueueStatus = { total: queue.length, pending: 0, failing: 0, itemsByTicket: {} };
  for (const item of queue) {
    status.pending++;
    const isFailing = item.attempts > 0 && item.nextAttemptAt > nowMs();
    if (isFailing) status.failing++;
    const bucket = (status.itemsByTicket[item.ticketId] ??= { photos: 0, notes: 0, failing: 0 });
    if (item.kind === "photo") bucket.photos++;
    else if (item.kind === "note") bucket.notes++;
    // flags are tracked in the queue but not surfaced in the per-ticket
    // photo/note counters since they belong to the flags inbox, not the ticket.
    if (isFailing) bucket.failing++;
  }
  return status;
}

// ─── Hook for UI consumers ──────────────────────────────────────────────────

export function useQueueStatus(): QueueStatus {
  const [status, setStatus] = useState<QueueStatus>(() => getStatus());
  useEffect(() => {
    let mounted = true;
    void ensureLoaded().then(() => {
      if (mounted) setStatus(getStatus());
    });
    const fn = () => setStatus(getStatus());
    listeners.add(fn);
    return () => {
      mounted = false;
      listeners.delete(fn);
    };
  }, []);
  return status;
}

/** Subscribe to queue items for a single ticket. */
export function useTicketQueueItems(ticketId: string): QueueItem[] {
  const [items, setItems] = useState<QueueItem[]>(() => listItemsForTicket(ticketId));
  useEffect(() => {
    let mounted = true;
    void ensureLoaded().then(() => {
      if (mounted) setItems(listItemsForTicket(ticketId));
    });
    const fn = () => setItems(listItemsForTicket(ticketId));
    listeners.add(fn);
    return () => {
      mounted = false;
      listeners.delete(fn);
    };
  }, [ticketId]);
  return items;
}

// ─── Upload worker ──────────────────────────────────────────────────────────

async function uploadPhoto(item: QueuePhotoItem): Promise<void> {
  let body: ArrayBuffer | Blob;
  if (Platform.OS === "web") {
    const resp = await fetch(item.fileUri);
    body = await resp.blob();
  } else {
    const base64 = await FileSystem.readAsStringAsync(item.fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Decode base64 → Uint8Array → ArrayBuffer (RN fetch supports ArrayBuffer).
    body = base64ToArrayBuffer(base64);
  }
  await apiRequest(`/api/m/tickets/${item.ticketId}/photos`, {
    method: "POST",
    headers: {
      "Content-Type": item.contentType,
      "X-Client-Id": item.id,
      "X-Captured-At": item.capturedAt,
    },
    body: body as BodyInit,
  });
}

async function uploadNote(item: QueueNoteItem): Promise<void> {
  await apiRequest(`/api/m/tickets/${item.ticketId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body: item.body, clientId: item.id }),
  });
}

async function uploadFlag(item: QueueFlagItem): Promise<void> {
  // Rebuild the multipart payload on every attempt so a retry after the
  // process was killed still works (the file URIs survive across launches
  // because they point into QUEUE_DIR).
  const form = new FormData();
  form.append("tag", item.tag);
  if (item.note) form.append("note", item.note);
  if (item.propertyId) form.append("propertyId", item.propertyId);
  if (item.ticketLinkId) form.append("ticketId", item.ticketLinkId);
  form.append("clientId", item.id);
  for (let i = 0; i < item.fileUris.length; i++) {
    const uri = item.fileUris[i];
    if (Platform.OS === "web") {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      form.append("photos", blob, `flag-${i}.jpg`);
    } else {
      // RN-supported FormData file shape — TS doesn't model this on web's
      // FormData type, hence the cast.
      (form as unknown as { append: (n: string, v: unknown, fn?: string) => void }).append(
        "photos",
        { uri, name: `flag-${i}.jpg`, type: "image/jpeg" },
        `flag-${i}.jpg`,
      );
    }
  }
  await apiRequest(`/api/m/flags`, { method: "POST", body: form as unknown as BodyInit });
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Avoid relying on `atob` polyfills — use Buffer when available, manual
  // table decode otherwise.
  // RN provides global Buffer in many setups; fall back to manual decode.
  const g = globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => Uint8Array } };
  if (g.Buffer) {
    const u8 = g.Buffer.from(base64, "base64");
    const ab = new ArrayBuffer(u8.byteLength);
    new Uint8Array(ab).set(u8);
    return ab;
  }
  const binary = (globalThis as unknown as { atob: (s: string) => string }).atob(base64);
  const ab = new ArrayBuffer(binary.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return ab;
}

async function flush(): Promise<void> {
  await ensureLoaded();
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    // Skip entirely until we have a token — we're either logged out or still
    // hydrating. The next tick will pick this up.
    const token = await loadToken();
    if (!token) return;
    const now = nowMs();
    let dirty = false;
    for (const item of queue.slice()) {
      if (item.nextAttemptAt > now) continue;
      try {
        if (item.kind === "photo") await uploadPhoto(item);
        else if (item.kind === "note") await uploadNote(item);
        else await uploadFlag(item);
        // Success — drop from queue (and clean up the file(s) on disk).
        const idx = queue.findIndex((i) => i.id === item.id);
        if (idx !== -1) {
          const removed = queue.splice(idx, 1)[0];
          if (removed.kind === "photo" && removed.fileUri.startsWith(QUEUE_DIR)) {
            try { await FileSystem.deleteAsync(removed.fileUri, { idempotent: true }); } catch {}
          } else if (removed.kind === "flag") {
            for (const uri of removed.fileUris) {
              if (uri.startsWith(QUEUE_DIR)) {
                try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
              }
            }
          }
        }
        dirty = true;
        // Notify per-item listeners (used by UI to invalidate the affected
        // ticket's cached photos/notes immediately).
        for (const fn of successListeners) {
          try { fn(item); } catch {}
        }
      } catch (err) {
        item.attempts += 1;
        item.lastError = err instanceof Error ? err.message : String(err);
        item.nextAttemptAt = nowMs() + backoffFor(item.attempts - 1);
        // 4xx (except 401/408/429) is a permanent failure — drop the item to
        // stop retrying forever. We keep 401 retryable because the auth layer
        // may recover.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500
            && err.status !== 401 && err.status !== 408 && err.status !== 429) {
          const idx = queue.findIndex((i) => i.id === item.id);
          if (idx !== -1) {
            const removed = queue.splice(idx, 1)[0];
            if (removed.kind === "photo" && removed.fileUri.startsWith(QUEUE_DIR)) {
              try { await FileSystem.deleteAsync(removed.fileUri, { idempotent: true }); } catch {}
            } else if (removed.kind === "flag") {
              for (const uri of removed.fileUris) {
                if (uri.startsWith(QUEUE_DIR)) {
                  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
                }
              }
            }
          }
        }
        dirty = true;
      }
    }
    if (dirty) await persist();
  })();
  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }
}

export async function flushNow(): Promise<void> {
  await flush();
}
