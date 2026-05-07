import express from "express";
import type { Express, RequestHandler } from "express";
import heicConvert from "heic-convert";
import { randomUUID } from "crypto";
import type { UserWithContext } from "../auth";
import type { IStorage } from "../storage";
import * as extraBillableAccess from "../lib/extraBillableAccess";
import { objectStorageClient, signObjectURL } from "../objectStorage";
import { logger } from "../lib/logger";

export const ALLOWED_ROLES = [
  "admin",
  "office",
  "field_manager",
  "field",
  "chemical_manager",
  "landscape_supervisor",
];
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Signed URL TTL — 1 hour (matches Slice 3 spec). */
export const SIGNED_URL_TTL_SEC = 60 * 60;
/** Accepted upstream Content-Types for the raw-body upload route. */
export const ACCEPTED_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream",
];

export interface PhotoRouteDeps {
  storage: Pick<
    IStorage,
    "getCampaignById" | "getCampaignItemById" | "updateCampaignItem" | "getCampaignCrewById" | "getCampaignCrewMembers"
  >;
  /**
   * Test seam — uploads `buf` to the configured object store under the
   * provided full storage key (which already includes the bucket prefix
   * if the production helper was used).
   */
  uploadToStorage?: (storageKey: string, buf: Buffer) => Promise<void>;
  deleteFromStorage?: (storageKey: string) => Promise<void>;
  signGetUrl?: (storageKey: string) => Promise<string>;
  processImage?: (buf: Buffer) => Promise<Buffer>;
  /** Resolves the storage key path. Tests inject a stable value. */
  buildStorageKey?: (companyId: string, itemId: string, filename: string) => string;
  authenticate?: RequestHandler;
}

function detectMime(buf: Buffer): "jpeg" | "png" | "heic" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  // ISO BMFF "ftyp" box at byte 4 — covers HEIC/HEIF/AVIF; we treat all as
  // HEIC and route them through heic-convert (it returns 415 for unsupported
  // brands which we then surface as 422).
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "heic";
  // RIFF .... WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";
  return null;
}

function splitStorageKey(fullKey: string): { bucketName: string; objectName: string } {
  const parts = fullKey.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function defaultBuildStorageKey(companyId: string, itemId: string, filename: string): string {
  // Match the convention used by /completion-photos/upload — anchor under
  // PRIVATE_OBJECT_DIR so storage keys carry the bucket prefix.
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  const relative = `extra-billable-photos/${companyId}/${itemId}/${filename}`;
  return privateDir.endsWith("/") ? `${privateDir}${relative}` : `${privateDir}/${relative}`;
}

/** Per-item storage prefix used to validate keys on read/delete. */
function itemKeyContains(companyId: string, itemId: string): string {
  return `extra-billable-photos/${companyId}/${itemId}/`;
}

export function registerExtraBillablePhotoRoutes(app: Express, deps: PhotoRouteDeps): void {
  const { storage } = deps;

  const defaultProcess = async (buf: Buffer): Promise<Buffer> => {
    const sharp = (await import("sharp")).default;
    return sharp(buf)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  };
  const processImage = deps.processImage ?? defaultProcess;
  const buildStorageKey = deps.buildStorageKey ?? defaultBuildStorageKey;

  const uploadToStorage = deps.uploadToStorage ?? (async (fullKey: string, buf: Buffer) => {
    const { bucketName, objectName } = splitStorageKey(fullKey);
    if (!bucketName) throw new Error("PRIVATE_OBJECT_DIR not set; cannot resolve bucket");
    await objectStorageClient
      .bucket(bucketName)
      .file(objectName)
      .save(buf, { contentType: "image/jpeg", resumable: false });
  });

  const deleteFromStorage = deps.deleteFromStorage ?? (async (fullKey: string) => {
    const { bucketName, objectName } = splitStorageKey(fullKey);
    if (!bucketName) return;
    try {
      await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
    } catch (err) {
      // Non-fatal: drop reference even if GCS delete fails (orphaned objects
      // are acceptable; ghost references are not).
      logger.warn({ err, fullKey }, "EB photo storage delete failed (non-fatal)");
    }
  });

  const signGetUrl = deps.signGetUrl ?? (async (fullKey: string) => {
    const { bucketName, objectName } = splitStorageKey(fullKey);
    if (!bucketName) throw new Error("PRIVATE_OBJECT_DIR not set; cannot resolve bucket");
    return signObjectURL({ bucketName, objectName, method: "GET", ttlSec: SIGNED_URL_TTL_SEC });
  });

  type Ctx = {
    user: UserWithContext;
    item: { id: string; campaignId: string; assignedCampaignCrewId?: string | null; photos?: string[] | null };
  };

  async function loadAndAuthorize(
    req: express.Request,
    res: express.Response,
    mode: "read" | "write",
  ): Promise<Ctx | null> {
    const isAuthed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : Boolean(req.user);
    if (!isAuthed) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    const user = req.user as UserWithContext;
    if (!user || !ALLOWED_ROLES.includes(user.activeRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return null;
    }
    const { campaignId, itemId } = req.params as { campaignId: string; itemId: string };
    const campaign = await storage.getCampaignById(campaignId, user.activeCompanyId);
    if (!campaign || campaign.category !== "extra_billable") {
      res.status(404).json({ error: "Extra-billable campaign not found" });
      return null;
    }
    const item = await storage.getCampaignItemById(itemId, user.activeCompanyId);
    if (!item || item.campaignId !== campaignId) {
      res.status(404).json({ error: "Item not found" });
      return null;
    }
    const allowed = await extraBillableAccess.canAccessExtraBillableCampaignItem(
      storage as never,
      { id: (user as unknown as { id: string }).id, activeRole: user.activeRole, activeCompanyId: user.activeCompanyId },
      { assignedCampaignCrewId: item.assignedCampaignCrewId },
      mode,
    );
    if (!allowed) {
      res.status(403).json({ error: "extraBillablePhotoForbidden" });
      return null;
    }
    return { user, item: item as Ctx["item"] };
  }

  // ── POST /api/campaigns/:campaignId/items/:itemId/photos/drop ───────────────
  // Raw byte body (no multipart) — matches the existing
  // /completion-photos/upload contract. Photos are appended to
  // campaign_items.photos[] (separate from completionPhotoStorageKeys).
  // No per-item cap is enforced.
  app.post(
    "/api/campaigns/:campaignId/items/:itemId/photos/drop",
    express.raw({ type: ACCEPTED_CONTENT_TYPES, limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const ctx = await loadAndAuthorize(req, res, "write");
      if (!ctx) return;
      try {
        const body = req.body;
        const fileBuffer: Buffer = Buffer.isBuffer(body)
          ? body
          : body
            ? Buffer.from(body as ArrayBuffer)
            : Buffer.alloc(0);
        if (fileBuffer.length === 0) {
          return res.status(400).json({ error: "No file data received" });
        }

        let buf = fileBuffer;
        const mime = detectMime(buf);
        if (!mime) {
          return res.status(415).json({ error: "extraBillablePhotoInvalidType" });
        }
        if (mime === "heic") {
          try {
            buf = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.85 }));
          } catch (err) {
            // Conversion failure is a processing failure (not a media-type
            // rejection) — surface as 422 per spec.
            logger.error({ err }, "EB photo HEIC convert failed");
            return res.status(422).json({ error: "extraBillablePhotoUploadFailed" });
          }
        }
        try {
          buf = await processImage(buf);
        } catch (err) {
          logger.error({ err }, "EB photo sharp processing failed");
          return res.status(422).json({ error: "extraBillablePhotoUploadFailed" });
        }

        const filename = `${randomUUID()}.jpg`;
        const storageKey = buildStorageKey(ctx.user.activeCompanyId, ctx.item.id, filename);
        await uploadToStorage(storageKey, buf);

        const existing: string[] = (ctx.item.photos as string[] | null) || [];
        const updated = [...existing, storageKey];
        await storage.updateCampaignItem(ctx.item.id, ctx.user.activeCompanyId, { photos: updated });
        return res.json({ storageKey, photos: updated });
      } catch (err) {
        logger.error({ err }, "EB photo upload failed");
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // ── DELETE /api/campaigns/:campaignId/items/:itemId/photos/*storageKey ──────
  app.delete(
    "/api/campaigns/:campaignId/items/:itemId/photos/*storageKey",
    async (req, res) => {
      const ctx = await loadAndAuthorize(req, res, "write");
      if (!ctx) return;
      try {
        const raw = req.params["storageKey"] as unknown;
        const storageKey = Array.isArray(raw) ? (raw as string[]).join("/") : (raw as string);
        const expectedContains = itemKeyContains(ctx.user.activeCompanyId, ctx.item.id);
        // The stored key carries a bucket prefix, so use `includes` against
        // the unique per-item path segment rather than `startsWith`.
        if (!storageKey || !storageKey.includes(expectedContains)) {
          return res.status(403).json({ error: "Storage key does not match expected scope" });
        }
        const existing: string[] = (ctx.item.photos as string[] | null) || [];
        if (!existing.includes(storageKey)) {
          return res.status(404).json({ error: "Photo not found on this item" });
        }
        await deleteFromStorage(storageKey);
        const updated = existing.filter((k) => k !== storageKey);
        await storage.updateCampaignItem(ctx.item.id, ctx.user.activeCompanyId, { photos: updated });
        return res.json({ photos: updated });
      } catch (err) {
        logger.error({ err }, "EB photo delete failed");
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // ── GET /api/campaigns/:campaignId/items/:itemId/photo-urls ─────────────────
  app.get(
    "/api/campaigns/:campaignId/items/:itemId/photo-urls",
    async (req, res) => {
      const ctx = await loadAndAuthorize(req, res, "read");
      if (!ctx) return;
      try {
        const keys: string[] = (ctx.item.photos as string[] | null) || [];
        const expectedContains = itemKeyContains(ctx.user.activeCompanyId, ctx.item.id);
        const filtered = keys.filter((k) => k.includes(expectedContains));
        const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
        const urls = await Promise.all(
          filtered.map(async (storageKey) => {
            try {
              return { storageKey, signedUrl: await signGetUrl(storageKey), expiresAt };
            } catch {
              return { storageKey, signedUrl: null as string | null, expiresAt: null as string | null };
            }
          }),
        );
        return res.json(urls);
      } catch (err) {
        logger.error({ err }, "EB photo URLs failed");
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
