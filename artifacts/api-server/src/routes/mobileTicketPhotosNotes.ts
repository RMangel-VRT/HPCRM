import express, { type Express, type Request, type Response } from "express";
import Busboy from "busboy";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import heicConvert from "heic-convert";
import { randomUUID } from "crypto";

import { db } from "../db";
import {
  crews,
  tickets,
  ticketPhotos,
  ticketNotes,
  ticketWorkItems,
} from "@workspace/db";
import { requireMobileAuth, MOBILE_ALLOWED_ROLES } from "../mobileAuth";
import type { UserWithContext } from "../auth";
import { objectStorageClient, signObjectURL } from "../objectStorage";
import { logger } from "../lib/logger";

/** Signed URL TTL — 1 hour minimum per Slice 3 spec. */
export const SIGNED_URL_TTL_SEC = 60 * 60;

/** Per-photo upload cap. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Roles that may delete any uploader's photo or note (admin-style). */
const ADMIN_DELETE_ROLES = new Set<string>(["admin", "office", "field_manager"]);

const ACCEPTED_RAW_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream",
];

function detectMime(buf: Buffer): "jpeg" | "png" | "heic" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "heic";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";
  return null;
}

function getBucketId(): string | null {
  return process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || null;
}

async function signGetUrl(storageKey: string): Promise<string | null> {
  const bucketName = getBucketId();
  if (!bucketName) return null;
  try {
    return await signObjectURL({
      bucketName,
      objectName: storageKey,
      method: "GET",
      ttlSec: SIGNED_URL_TTL_SEC,
    });
  } catch (err) {
    logger.warn({ err, storageKey }, "Failed to sign mobile ticket photo URL");
    return null;
  }
}

async function resolveSupervisorCrewId(userId: string, companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: crews.id })
    .from(crews)
    .where(and(
      eq(crews.companyId, companyId),
      eq(crews.supervisorUserId, userId),
      eq(crews.isActive, true),
    ))
    .limit(1);
  return row?.id ?? null;
}

/** Mobile ticket guard: ticket exists, in caller's company, and on their crew. */
async function loadMobileTicketForCaller(
  req: Request,
  res: Response,
): Promise<{ user: UserWithContext; ticket: typeof tickets.$inferSelect } | null> {
  const u = req.user as UserWithContext;
  if (!MOBILE_ALLOWED_ROLES.has(u.activeRole)) {
    res.status(403).json({ message: "Mobile access is for crew supervisors" });
    return null;
  }
  const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);
  if (!crewId) {
    res.status(403).json({ message: "You are not currently assigned to a crew." });
    return null;
  }
  const ticketId = String(req.params.id);
  const [t] = await db
    .select()
    .from(tickets)
    .where(and(
      eq(tickets.id, ticketId),
      eq(tickets.companyId, u.activeCompanyId),
      eq(tickets.crewId, crewId),
    ));
  if (!t) {
    res.status(404).json({ message: "Ticket not found for your crew" });
    return null;
  }
  return { user: u, ticket: t };
}

function serializePhoto(p: typeof ticketPhotos.$inferSelect, signedUrl: string | null) {
  return {
    id: p.id,
    ticketId: p.ticketId,
    storageKey: p.storageKey,
    contentType: p.contentType,
    byteSize: p.byteSize,
    width: p.width,
    height: p.height,
    capturedAt: p.capturedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    uploadedByUserId: p.uploadedByUserId,
    signedUrl,
    signedUrlExpiresAt: signedUrl ? new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString() : null,
  };
}

function serializeNote(n: typeof ticketNotes.$inferSelect) {
  return {
    id: n.id,
    ticketId: n.ticketId,
    body: n.body,
    authorUserId: n.authorUserId,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Parse a single uploaded image off either a multipart/form-data request
 * (preferred — `file` field, like the OpenAPI contract) or a raw image body
 * (fallback for low-overhead mobile uploads). Returns `null` and writes the
 * error response if the request is malformed.
 */
async function readUploadedImage(
  req: Request,
  res: Response,
): Promise<Buffer | null> {
  const ctype = (req.header("content-type") || "").toLowerCase();
  if (ctype.startsWith("multipart/form-data")) {
    return await new Promise<Buffer | null>((resolve) => {
      let bb: ReturnType<typeof Busboy>;
      try {
        bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } });
      } catch (err) {
        logger.warn({ err }, "Mobile photo multipart init failed");
        res.status(400).json({ message: "Invalid multipart upload" });
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      let fileSeen = false;
      let truncated = false;
      let settled = false;
      const finish = (val: Buffer | null) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      bb.on("file", (_name, stream) => {
        fileSeen = true;
        stream.on("data", (d: Buffer) => chunks.push(d));
        stream.on("limit", () => { truncated = true; });
        stream.on("end", () => undefined);
      });
      bb.on("error", (err: unknown) => {
        logger.warn({ err }, "Mobile photo multipart parse error");
        if (!res.headersSent) res.status(400).json({ message: "Could not parse upload" });
        finish(null);
      });
      bb.on("close", () => {
        if (truncated) {
          if (!res.headersSent) res.status(413).json({ message: "Photo exceeds 10 MB limit" });
          finish(null);
          return;
        }
        if (!fileSeen || chunks.length === 0) {
          if (!res.headersSent) res.status(400).json({ message: "No file in upload" });
          finish(null);
          return;
        }
        finish(Buffer.concat(chunks));
      });
      req.pipe(bb);
    });
  }
  // Raw body — already collected by express.raw() middleware.
  if (!ACCEPTED_RAW_CONTENT_TYPES.some((t) => ctype.startsWith(t))) {
    res.status(415).json({ message: "Unsupported content type" });
    return null;
  }
  const body = req.body;
  const buf: Buffer = Buffer.isBuffer(body)
    ? body
    : body
      ? Buffer.from(body as ArrayBuffer)
      : Buffer.alloc(0);
  if (buf.length === 0) {
    res.status(400).json({ message: "No file data received" });
    return null;
  }
  return buf;
}

export function registerMobileTicketPhotosNotesRoutes(app: Express): void {
  // ── GET /api/m/tickets/:id/photos ───────────────────────────────────────────
  app.get("/api/m/tickets/:id/photos", requireMobileAuth(), async (req, res) => {
    const ctx = await loadMobileTicketForCaller(req, res);
    if (!ctx) return;
    const rows = await db
      .select()
      .from(ticketPhotos)
      .where(eq(ticketPhotos.ticketId, ctx.ticket.id))
      .orderBy(desc(ticketPhotos.createdAt));
    const out = await Promise.all(rows.map(async (p) => serializePhoto(p, await signGetUrl(p.storageKey))));
    res.json(out);
  });

  // ── POST /api/m/tickets/:id/photos ──────────────────────────────────────────
  // Preferred: multipart/form-data with a single `file` field (per OpenAPI).
  // Also accepts raw image bytes for low-overhead mobile uploads.
  // Headers:
  //   X-Client-Id: <uuid>     (idempotency key from the upload queue)
  //   X-Captured-At: <ISO8601> (optional; defaults to server now)
  app.post(
    "/api/m/tickets/:id/photos",
    requireMobileAuth(),
    // Only invoke express.raw for non-multipart requests so multipart bodies
    // remain a readable stream for busboy.
    (req, res, next) => {
      const ctype = (req.header("content-type") || "").toLowerCase();
      if (ctype.startsWith("multipart/form-data")) return next();
      return express.raw({ type: ACCEPTED_RAW_CONTENT_TYPES, limit: MAX_UPLOAD_BYTES })(req, res, next);
    },
    async (req, res) => {
      const ctx = await loadMobileTicketForCaller(req, res);
      if (!ctx) return;

      const clientIdHdr = req.header("X-Client-Id") || req.header("x-client-id") || null;
      const clientId = clientIdHdr && clientIdHdr.length <= 200 ? clientIdHdr : null;

      // Idempotency — same (ticketId, clientId) returns the existing row.
      if (clientId) {
        const [existing] = await db
          .select()
          .from(ticketPhotos)
          .where(and(eq(ticketPhotos.ticketId, ctx.ticket.id), eq(ticketPhotos.clientId, clientId)));
        if (existing) {
          res.status(200).json(serializePhoto(existing, await signGetUrl(existing.storageKey)));
          return;
        }
      }

      const fileBuffer = await readUploadedImage(req, res);
      if (!fileBuffer) return;

      let buf = fileBuffer;
      const mime = detectMime(buf);
      if (!mime) {
        res.status(415).json({ message: "Invalid file type — only JPEG, PNG, WebP, and HEIC are accepted" });
        return;
      }
      if (mime === "heic") {
        try {
          buf = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.85 }));
        } catch (err) {
          logger.error({ err }, "Mobile photo HEIC convert failed");
          res.status(422).json({ message: "Could not process HEIC photo" });
          return;
        }
      }

      let width: number | null = null;
      let height: number | null = null;
      try {
        const sharp = (await import("sharp")).default;
        // Resize, auto-orient, strip metadata (sharp default), encode JPEG.
        const pipeline = sharp(buf)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 });
        const out = await pipeline.toBuffer({ resolveWithObject: true });
        buf = out.data;
        width = out.info.width ?? null;
        height = out.info.height ?? null;
      } catch (err) {
        logger.error({ err }, "Mobile photo sharp processing failed");
        res.status(422).json({ message: "Could not process photo" });
        return;
      }

      const bucketId = getBucketId();
      if (!bucketId) {
        res.status(500).json({ message: "Object storage not configured" });
        return;
      }

      const storageKey = `ticket-photos/${ctx.user.activeCompanyId}/${ctx.ticket.id}/${randomUUID()}.jpg`;
      try {
        await objectStorageClient
          .bucket(bucketId)
          .file(storageKey)
          .save(buf, { contentType: "image/jpeg", resumable: false });
      } catch (err) {
        logger.error({ err, storageKey }, "Mobile photo upload to GCS failed");
        res.status(500).json({ message: "Failed to upload photo" });
        return;
      }

      const capturedAtHdr = req.header("X-Captured-At") || req.header("x-captured-at");
      let capturedAt = new Date();
      if (capturedAtHdr) {
        const d = new Date(capturedAtHdr);
        if (!Number.isNaN(d.getTime())) capturedAt = d;
      }

      try {
        const [created] = await db
          .insert(ticketPhotos)
          .values({
            companyId: ctx.user.activeCompanyId,
            ticketId: ctx.ticket.id,
            uploadedByUserId: ctx.user.id,
            storageKey,
            contentType: "image/jpeg",
            byteSize: buf.length,
            width,
            height,
            capturedAt,
            clientId,
          })
          .returning();
        res.status(201).json(serializePhoto(created, await signGetUrl(storageKey)));
      } catch (err: unknown) {
        // Idempotency race — another worker landed first; return existing row.
        if (clientId && typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
          const [existing] = await db
            .select()
            .from(ticketPhotos)
            .where(and(eq(ticketPhotos.ticketId, ctx.ticket.id), eq(ticketPhotos.clientId, clientId)));
          if (existing) {
            res.status(200).json(serializePhoto(existing, await signGetUrl(existing.storageKey)));
            return;
          }
        }
        logger.error({ err }, "Mobile photo insert failed");
        res.status(500).json({ message: "Failed to record photo" });
      }
    },
  );

  // ── DELETE /api/m/photos/:photoId ───────────────────────────────────────────
  // Uploader can always delete their own photo; admin / office / field_manager
  // can delete any photo in their company.
  app.delete("/api/m/photos/:photoId", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const photoId = String(req.params.photoId);
    const [p] = await db
      .select()
      .from(ticketPhotos)
      .where(and(eq(ticketPhotos.id, photoId), eq(ticketPhotos.companyId, u.activeCompanyId)));
    if (!p) {
      res.status(404).json({ message: "Photo not found" });
      return;
    }
    if (p.uploadedByUserId !== u.id && !ADMIN_DELETE_ROLES.has(u.activeRole)) {
      res.status(403).json({ message: "You can't delete this photo" });
      return;
    }
    const bucketId = getBucketId();
    if (bucketId) {
      try {
        await objectStorageClient.bucket(bucketId).file(p.storageKey).delete({ ignoreNotFound: true });
      } catch (err) {
        logger.warn({ err, storageKey: p.storageKey }, "Mobile photo GCS delete failed (non-fatal)");
      }
    }
    await db.delete(ticketPhotos).where(eq(ticketPhotos.id, p.id));
    res.sendStatus(204);
  });

  // ── GET /api/m/tickets/:id/notes ────────────────────────────────────────────
  app.get("/api/m/tickets/:id/notes", requireMobileAuth(), async (req, res) => {
    const ctx = await loadMobileTicketForCaller(req, res);
    if (!ctx) return;
    const rows = await db
      .select()
      .from(ticketNotes)
      .where(eq(ticketNotes.ticketId, ctx.ticket.id))
      .orderBy(desc(ticketNotes.createdAt));
    res.json(rows.map(serializeNote));
  });

  const noteBodySchema = z.object({
    body: z.string().min(1).max(5000),
    clientId: z.string().max(200).optional(),
  });

  // ── POST /api/m/tickets/:id/notes ───────────────────────────────────────────
  app.post("/api/m/tickets/:id/notes", requireMobileAuth(), async (req, res) => {
    const ctx = await loadMobileTicketForCaller(req, res);
    if (!ctx) return;
    const parsed = noteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid note", errors: parsed.error.flatten() });
      return;
    }
    const clientId = parsed.data.clientId ?? null;

    if (clientId) {
      const [existing] = await db
        .select()
        .from(ticketNotes)
        .where(and(eq(ticketNotes.ticketId, ctx.ticket.id), eq(ticketNotes.clientId, clientId)));
      if (existing) {
        res.status(200).json(serializeNote(existing));
        return;
      }
    }

    try {
      const [created] = await db
        .insert(ticketNotes)
        .values({
          companyId: ctx.user.activeCompanyId,
          ticketId: ctx.ticket.id,
          authorUserId: ctx.user.id,
          body: parsed.data.body.trim(),
          clientId,
        })
        .returning();
      res.status(201).json(serializeNote(created));
    } catch (err: unknown) {
      if (clientId && typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        const [existing] = await db
          .select()
          .from(ticketNotes)
          .where(and(eq(ticketNotes.ticketId, ctx.ticket.id), eq(ticketNotes.clientId, clientId)));
        if (existing) {
          res.status(200).json(serializeNote(existing));
          return;
        }
      }
      logger.error({ err }, "Mobile note insert failed");
      res.status(500).json({ message: "Failed to record note" });
    }
  });

  // ── DELETE /api/m/notes/:noteId ─────────────────────────────────────────────
  // Author can always delete their own note; admin / office / field_manager
  // can delete any note in their company.
  app.delete("/api/m/notes/:noteId", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const noteId = String(req.params.noteId);
    const [n] = await db
      .select()
      .from(ticketNotes)
      .where(and(eq(ticketNotes.id, noteId), eq(ticketNotes.companyId, u.activeCompanyId)));
    if (!n) {
      res.status(404).json({ message: "Note not found" });
      return;
    }
    if (n.authorUserId !== u.id && !ADMIN_DELETE_ROLES.has(u.activeRole)) {
      res.status(403).json({ message: "You can't delete this note" });
      return;
    }
    await db.delete(ticketNotes).where(eq(ticketNotes.id, n.id));
    res.sendStatus(204);
  });

  // ── Web admin: list mobile photos & notes for a ticket ──────────────────────
  // These reuse session auth (no mobile bearer). Used by the web TicketDetail
  // page to surface what the field crew captured on the mobile app.
  app.get("/api/tickets/:id/mobile-photos", async (req, res) => {
    const isAuthed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : Boolean(req.user);
    if (!isAuthed) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const u = req.user as UserWithContext;
    const ticketId = String(req.params.id);
    const [t] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.companyId, u.activeCompanyId)));
    if (!t) {
      res.status(404).json({ message: "Ticket not found" });
      return;
    }
    const rows = await db
      .select()
      .from(ticketPhotos)
      .where(eq(ticketPhotos.ticketId, ticketId))
      .orderBy(desc(ticketPhotos.createdAt));
    const out = await Promise.all(rows.map(async (p) => serializePhoto(p, await signGetUrl(p.storageKey))));
    res.json(out);
  });

  app.get("/api/tickets/:id/mobile-notes", async (req, res) => {
    const isAuthed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : Boolean(req.user);
    if (!isAuthed) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const u = req.user as UserWithContext;
    const ticketId = String(req.params.id);
    const [t] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.companyId, u.activeCompanyId)));
    if (!t) {
      res.status(404).json({ message: "Ticket not found" });
      return;
    }
    const rows = await db
      .select()
      .from(ticketNotes)
      .where(eq(ticketNotes.ticketId, ticketId))
      .orderBy(desc(ticketNotes.createdAt));
    res.json(rows.map(serializeNote));
  });
}

/**
 * Helper used by `/api/m/work-items/:id` PATCH (in `crewsAndMobile.ts`) to
 * enforce the photo-required rule. Returns `true` if the work item requires
 * a photo and there is no `ticket_photos` row for the same ticket captured
 * after the ticket's `startedAt` (or any photo if `startedAt` is null).
 */
export async function workItemMissingRequiredPhoto(workItemId: string): Promise<boolean> {
  const [row] = await db
    .select({
      photoRequired: ticketWorkItems.photoRequired,
      ticketId: ticketWorkItems.ticketId,
      startedAt: tickets.startedAt,
    })
    .from(ticketWorkItems)
    .innerJoin(tickets, eq(ticketWorkItems.ticketId, tickets.id))
    .where(eq(ticketWorkItems.id, workItemId));
  if (!row || !row.photoRequired) return false;
  const photos = await db
    .select({ id: ticketPhotos.id, capturedAt: ticketPhotos.capturedAt })
    .from(ticketPhotos)
    .where(eq(ticketPhotos.ticketId, row.ticketId));
  if (photos.length === 0) return true;
  if (!row.startedAt) return false; // any photo counts when start time is unknown
  return !photos.some((p) => p.capturedAt.getTime() >= row.startedAt!.getTime());
}
