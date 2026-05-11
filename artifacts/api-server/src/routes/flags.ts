// Flag composer (mobile) + admin Flags inbox (web).
import express, { type Express, type Request, type Response } from "express";
import Busboy from "busboy";
import { z } from "zod/v4";
import { and, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import heicConvert from "heic-convert";
import { randomUUID } from "crypto";

import { db } from "../db";
import {
  crews,
  customers,
  tickets,
  users,
  companyUsers,
  flags,
  flagPhotos,
  FLAG_TAGS,
  FLAG_TAG_VALUES,
  FLAG_STATUSES,
  FLAG_NOTE_MAX_LENGTH,
} from "@workspace/db";
import { requireMobileAuth, MOBILE_ALLOWED_ROLES } from "../mobileAuth";
import type { UserWithContext } from "../auth";
import { objectStorageClient, signObjectURL } from "../objectStorage";
import { logger } from "../lib/logger";
import { sendEmail } from "../services/emailService";

const SIGNED_URL_TTL_SEC = 60 * 60;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_FLAG = 8;

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
    logger.warn({ err, storageKey }, "Failed to sign flag photo URL");
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

function adminOrOffice(req: Request, res: Response): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const u = req.user as UserWithContext;
  if (u.activeRole !== "admin" && u.activeRole !== "office" && !u.isSuperAdminBool) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return u;
}

function serializeFlagPhoto(p: typeof flagPhotos.$inferSelect, signedUrl: string | null) {
  return {
    id: p.id,
    flagId: p.flagId,
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

type FlagWithMeta = typeof flags.$inferSelect & {
  createdByName?: string | null;
  crewName?: string | null;
  propertyName?: string | null;
  assignedToName?: string | null;
};

function serializeFlag(
  f: FlagWithMeta,
  photos: { id: string; signedUrl: string | null; storageKey: string }[],
) {
  return {
    id: f.id,
    companyId: f.companyId,
    tag: f.tag,
    note: f.note,
    status: f.status,
    propertyId: f.propertyId,
    propertyName: f.propertyName ?? null,
    ticketId: f.ticketId,
    crewId: f.crewId,
    crewName: f.crewName ?? null,
    createdByUserId: f.createdByUserId,
    createdByName: f.createdByName ?? null,
    assignedToUserId: f.assignedToUserId,
    assignedToName: f.assignedToName ?? null,
    resolution: f.resolution,
    resolvedAt: f.resolvedAt ? f.resolvedAt.toISOString() : null,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    photos,
  };
}

// ── Image processing (resize + EXIF strip + JPEG re-encode) ────────────────
async function processAndUploadPhoto(args: {
  buf: Buffer;
  companyId: string;
  flagId: string;
}): Promise<
  | { ok: true; storageKey: string; bytes: number; width: number | null; height: number | null }
  | { ok: false; status: number; message: string }
> {
  let buf = args.buf;
  const mime = detectMime(buf);
  if (!mime) return { ok: false, status: 415, message: "Invalid file type — only JPEG, PNG, WebP, and HEIC are accepted" };
  if (mime === "heic") {
    try {
      buf = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.85 }));
    } catch (err) {
      logger.error({ err }, "Flag photo HEIC convert failed");
      return { ok: false, status: 422, message: "Could not process HEIC photo" };
    }
  }
  let width: number | null = null;
  let height: number | null = null;
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    buf = out.data;
    width = out.info.width ?? null;
    height = out.info.height ?? null;
  } catch (err) {
    logger.error({ err }, "Flag photo sharp processing failed");
    return { ok: false, status: 422, message: "Could not process photo" };
  }

  const bucketId = getBucketId();
  if (!bucketId) return { ok: false, status: 500, message: "Object storage not configured" };
  const storageKey = `flag-photos/${args.companyId}/${args.flagId}/${randomUUID()}.jpg`;
  try {
    await objectStorageClient
      .bucket(bucketId)
      .file(storageKey)
      .save(buf, { contentType: "image/jpeg", resumable: false });
  } catch (err) {
    logger.error({ err, storageKey }, "Flag photo upload to GCS failed");
    return { ok: false, status: 500, message: "Failed to upload photo" };
  }
  return { ok: true, storageKey, bytes: buf.length, width, height };
}

// ── Multipart parsing — file fields under `photos` (1..N) plus text fields ─
type ParsedMultipart = {
  files: { buffer: Buffer; mimetype: string }[];
  fields: Record<string, string>;
};

async function parseMultipart(req: Request, res: Response): Promise<ParsedMultipart | null> {
  const ctype = (req.header("content-type") || "").toLowerCase();
  if (!ctype.startsWith("multipart/form-data")) {
    res.status(415).json({ message: "multipart/form-data required" });
    return null;
  }
  return await new Promise<ParsedMultipart | null>((resolve) => {
    let bb: ReturnType<typeof Busboy>;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: { files: MAX_PHOTOS_PER_FLAG, fileSize: MAX_UPLOAD_BYTES },
      });
    } catch (err) {
      logger.warn({ err }, "Flag multipart init failed");
      res.status(400).json({ message: "Invalid multipart upload" });
      resolve(null);
      return;
    }
    const files: ParsedMultipart["files"] = [];
    const fields: Record<string, string> = {};
    let truncated = false;
    let tooManyFiles = false;
    let settled = false;
    const finish = (val: ParsedMultipart | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    bb.on("file", (_name: string, stream: NodeJS.ReadableStream, info: { mimeType: string }) => {
      const chunks: Buffer[] = [];
      stream.on("data", (d: Buffer) => chunks.push(d));
      stream.on("limit", () => { truncated = true; });
      stream.on("end", () => {
        if (chunks.length > 0) {
          files.push({ buffer: Buffer.concat(chunks), mimetype: info.mimeType });
        }
      });
    });
    bb.on("filesLimit", () => { tooManyFiles = true; });
    bb.on("field", (name: string, value: string) => { fields[name] = value; });
    bb.on("error", (err: unknown) => {
      logger.warn({ err }, "Flag multipart parse error");
      if (!res.headersSent) res.status(400).json({ message: "Could not parse upload" });
      finish(null);
    });
    bb.on("close", () => {
      if (truncated) {
        if (!res.headersSent) res.status(413).json({ message: "Photo exceeds 10 MB limit" });
        finish(null);
        return;
      }
      if (tooManyFiles) {
        if (!res.headersSent) res.status(413).json({ message: `At most ${MAX_PHOTOS_PER_FLAG} photos per flag` });
        finish(null);
        return;
      }
      finish({ files, fields });
    });
    req.pipe(bb);
  });
}

// ── Email notification on flag creation ────────────────────────────────────
async function notifyOfficeOfNewFlag(args: {
  flag: typeof flags.$inferSelect;
  createdByName: string | null;
  propertyName: string | null;
  crewName: string | null;
  tagLabel: string;
  photoCount: number;
  firstPhotoUrl: string | null;
}): Promise<void> {
  try {
    const recipients = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(companyUsers)
      .innerJoin(users, eq(companyUsers.userId, users.id))
      .where(and(
        eq(companyUsers.companyId, args.flag.companyId),
        eq(companyUsers.status, "active"),
        inArray(companyUsers.role, ["admin", "office"]),
      ));
    if (recipients.length === 0) return;

    const baseUrl =
      process.env.APP_PUBLIC_URL ||
      (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}` : "");
    const flagUrl = `${baseUrl}/dashboard/flags/${args.flag.id}`;
    const fromLabel = args.crewName ?? args.createdByName ?? "the field";
    const atLabel = args.propertyName ?? "an unspecified property";
    const subject = `New field flag from ${fromLabel} at ${atLabel}`;
    const lines: string[] = [
      `A new field flag was just submitted.`,
      ``,
      `Tag: ${args.tagLabel}`,
      args.propertyName ? `Property: ${args.propertyName}` : null,
      args.crewName ? `Crew: ${args.crewName}` : null,
      args.createdByName ? `Reported by: ${args.createdByName}` : null,
      args.flag.note ? `Note: ${args.flag.note}` : null,
      `Photos: ${args.photoCount}`,
      args.firstPhotoUrl ? `First photo: ${args.firstPhotoUrl}` : null,
      ``,
      flagUrl ? `Open in CRM: ${flagUrl}` : null,
    ].filter((l): l is string => l !== null);
    const text = lines.join("\n");
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a;">
        <h2 style="color:#1a4d1a; margin:0 0 12px;">New field flag</h2>
        <table style="border-collapse:collapse; font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Tag</td><td><strong>${escapeHtml(args.tagLabel)}</strong></td></tr>
          ${args.propertyName ? `<tr><td style="padding:4px 12px 4px 0; color:#64748b;">Property</td><td>${escapeHtml(args.propertyName)}</td></tr>` : ""}
          ${args.crewName ? `<tr><td style="padding:4px 12px 4px 0; color:#64748b;">Crew</td><td>${escapeHtml(args.crewName)}</td></tr>` : ""}
          ${args.createdByName ? `<tr><td style="padding:4px 12px 4px 0; color:#64748b;">Reported by</td><td>${escapeHtml(args.createdByName)}</td></tr>` : ""}
          <tr><td style="padding:4px 12px 4px 0; color:#64748b;">Photos</td><td>${args.photoCount}</td></tr>
        </table>
        ${args.flag.note ? `<p style="margin:16px 0; padding:12px; background:#f8fafc; border-left:3px solid #1a4d1a;">${escapeHtml(args.flag.note)}</p>` : ""}
        ${args.firstPhotoUrl ? `<p style="margin:16px 0;"><a href="${args.firstPhotoUrl}"><img src="${args.firstPhotoUrl}" alt="Field flag photo" style="max-width:480px; width:100%; height:auto; border-radius:6px; border:1px solid #e2e8f0;" /></a></p>` : ""}
        ${flagUrl ? `<p style="margin:20px 0 0;"><a href="${flagUrl}" style="background:#1a4d1a; color:white; padding:10px 16px; border-radius:6px; text-decoration:none; display:inline-block;">Open in CRM</a></p>` : ""}
      </div>
    `;

    await Promise.all(
      recipients
        .filter((r) => r.email)
        .map((r) =>
          sendEmail(r.email!, subject, html, text, {
            companyId: args.flag.companyId,
            sentById: args.flag.createdByUserId ?? undefined,
            variables: {},
          }).catch((err) => {
            logger.warn({ err, recipientId: r.id }, "Flag notification email failed");
          }),
        ),
    );
  } catch (err) {
    logger.warn({ err, flagId: args.flag.id }, "Flag notification dispatch failed");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const flagTagSchema = z.enum(FLAG_TAG_VALUES as readonly [string, ...string[]]);
const flagStatusSchema = z.enum(FLAG_STATUSES as readonly [string, ...string[]]);

export function registerFlagsRoutes(app: Express): void {
  app.get("/api/m/flag-tags", requireMobileAuth(), (_req, res) => {
    res.json({ tags: FLAG_TAGS, noteMaxLength: FLAG_NOTE_MAX_LENGTH });
  });
  app.get("/api/flags/customer-search", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.json([]);
      return;
    }
    const like = `%${q}%`;
    const rows = await db
      .select({
        id: customers.id,
        name: customers.name,
        street: customers.street,
        city: customers.city,
        state: customers.state,
      })
      .from(customers)
      .where(and(eq(customers.companyId, u.activeCompanyId), ilike(customers.name, like)))
      .orderBy(customers.name)
      .limit(10);
    res.json(rows);
  });

  app.get("/api/flag-tags", (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    res.json({ tags: FLAG_TAGS, statuses: FLAG_STATUSES, noteMaxLength: FLAG_NOTE_MAX_LENGTH });
  });

  // ── POST /api/m/flags ───────────────────────────────────────────────────────
  // multipart/form-data:
  //   fields: tag, note?, propertyId?, ticketId?, clientId?
  //   files:  photos (1..MAX_PHOTOS_PER_FLAG); ≥1 required
  app.post("/api/m/flags", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    if (!MOBILE_ALLOWED_ROLES.has(u.activeRole)) {
      res.status(403).json({ message: "Mobile access is for crew supervisors" });
      return;
    }
    const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);

    const parsed = await parseMultipart(req, res);
    if (!parsed) return;

    const tagParse = flagTagSchema.safeParse(parsed.fields.tag);
    if (!tagParse.success) {
      res.status(400).json({ message: "Invalid or missing tag" });
      return;
    }
    const note = (parsed.fields.note ?? "").trim();
    if (note.length > FLAG_NOTE_MAX_LENGTH) {
      res.status(400).json({ message: `Note must be ${FLAG_NOTE_MAX_LENGTH} characters or fewer` });
      return;
    }
    if (parsed.files.length === 0) {
      res.status(400).json({ message: "At least one photo is required" });
      return;
    }
    const propertyId = parsed.fields.propertyId?.trim() || null;
    const ticketId = parsed.fields.ticketId?.trim() || null;
    const clientId = (parsed.fields.clientId ?? "").trim().slice(0, 200) || null;

    // Idempotency — same (companyId, clientId) returns the existing row.
    if (clientId) {
      const [existing] = await db
        .select()
        .from(flags)
        .where(and(eq(flags.companyId, u.activeCompanyId), eq(flags.clientId, clientId)));
      if (existing) {
        const photoRows = await db
          .select()
          .from(flagPhotos)
          .where(eq(flagPhotos.flagId, existing.id))
          .orderBy(desc(flagPhotos.createdAt));
        const serialized = await Promise.all(
          photoRows.map(async (p) => serializeFlagPhoto(p, await signGetUrl(p.storageKey))),
        );
        res.status(200).json(serializeFlag(existing as FlagWithMeta, serialized));
        return;
      }
    }

    // Validate optional FK references stay within the caller's company.
    if (propertyId) {
      const [c] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, propertyId), eq(customers.companyId, u.activeCompanyId)));
      if (!c) {
        res.status(400).json({ message: "Property not found" });
        return;
      }
    }
    if (ticketId) {
      const [tr] = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, ticketId), eq(tickets.companyId, u.activeCompanyId)));
      if (!tr) {
        res.status(400).json({ message: "Ticket not found" });
        return;
      }
    }

    // Pre-allocate the flag id so photo storage keys can be scoped by it
    // before the DB insert. flags + flag_photos rows are then inserted in a
    // single transaction so a partial failure cannot leave a flag with 0 photos.
    const flagId = randomUUID();

    const photoResults: { storageKey: string; bytes: number; width: number | null; height: number | null }[] = [];
    const cleanupUploadedObjects = async () => {
      const bucketId = getBucketId();
      if (!bucketId) return;
      for (const pr of photoResults) {
        try { await objectStorageClient.bucket(bucketId).file(pr.storageKey).delete({ ignoreNotFound: true }); } catch {}
      }
    };
    for (const f of parsed.files) {
      const r = await processAndUploadPhoto({ buf: f.buffer, companyId: u.activeCompanyId, flagId });
      if (!r.ok) {
        await cleanupUploadedObjects();
        res.status(r.status).json({ message: r.message });
        return;
      }
      photoResults.push({ storageKey: r.storageKey, bytes: r.bytes, width: r.width, height: r.height });
    }

    let created: typeof flags.$inferSelect;
    let insertedPhotos: (typeof flagPhotos.$inferSelect)[];
    try {
      const txResult = await db.transaction(async (tx) => {
        const [createdRow] = await tx
          .insert(flags)
          .values({
            id: flagId,
            companyId: u.activeCompanyId,
            createdByUserId: u.id,
            crewId,
            propertyId,
            ticketId,
            tag: tagParse.data,
            note: note.length > 0 ? note : null,
            status: "new",
            clientId,
          })
          .returning();
        const photoRows = await tx
          .insert(flagPhotos)
          .values(
            photoResults.map((p) => ({
              companyId: u.activeCompanyId,
              flagId: createdRow.id,
              uploadedByUserId: u.id,
              storageKey: p.storageKey,
              contentType: "image/jpeg",
              byteSize: p.bytes,
              width: p.width,
              height: p.height,
            })),
          )
          .returning();
        return { createdRow, photoRows };
      });
      created = txResult.createdRow;
      insertedPhotos = txResult.photoRows;
    } catch (err: unknown) {
      // Idempotency race on (companyId, clientId).
      if (clientId && typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        const [existing] = await db
          .select()
          .from(flags)
          .where(and(eq(flags.companyId, u.activeCompanyId), eq(flags.clientId, clientId)));
        if (existing) {
          await cleanupUploadedObjects();
          res.status(200).json(serializeFlag(existing as FlagWithMeta, []));
          return;
        }
      }
      logger.error({ err }, "Flag insert failed");
      await cleanupUploadedObjects();
      res.status(500).json({ message: "Failed to create flag" });
      return;
    }

    // Resolve denorm fields for the response + email body.
    let propertyName: string | null = null;
    if (propertyId) {
      const [p] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, propertyId));
      propertyName = p?.name ?? null;
    }
    let crewName: string | null = null;
    if (crewId) {
      const [c] = await db.select({ name: crews.name }).from(crews).where(eq(crews.id, crewId));
      crewName = c?.name ?? null;
    }
    const tagLabel = tagParse.data.replace(/_/g, " ");

    const serializedPhotos = await Promise.all(
      insertedPhotos.map(async (p) => serializeFlagPhoto(p, await signGetUrl(p.storageKey))),
    );

    void notifyOfficeOfNewFlag({
      flag: created,
      createdByName: u.name ?? null,
      propertyName,
      crewName,
      tagLabel,
      photoCount: insertedPhotos.length,
      firstPhotoUrl: serializedPhotos[0]?.signedUrl ?? null,
    });

    res.status(201).json(
      serializeFlag(
        { ...created, propertyName, crewName, createdByName: u.name ?? null } as FlagWithMeta,
        serializedPhotos,
      ),
    );
  });

  // ── POST /api/m/flags/:id/photos ────────────────────────────────────────────
  // Multipart /OR/ raw image bytes (consistent with Slice 3 ticket photos).
  app.post(
    "/api/m/flags/:id/photos",
    requireMobileAuth(),
    (req, res, next) => {
      const ctype = (req.header("content-type") || "").toLowerCase();
      if (ctype.startsWith("multipart/form-data")) return next();
      return express.raw({ type: ACCEPTED_RAW_CONTENT_TYPES, limit: MAX_UPLOAD_BYTES })(req, res, next);
    },
    async (req, res) => {
      const u = req.user as UserWithContext;
      if (!MOBILE_ALLOWED_ROLES.has(u.activeRole)) {
        res.status(403).json({ message: "Mobile access is for crew supervisors" });
        return;
      }
      const flagId = String(req.params.id);
      const [f] = await db
        .select()
        .from(flags)
        .where(and(eq(flags.id, flagId), eq(flags.companyId, u.activeCompanyId)));
      if (!f) {
        res.status(404).json({ message: "Flag not found" });
        return;
      }
      if (f.createdByUserId !== u.id) {
        res.status(403).json({ message: "You can only add photos to your own flags" });
        return;
      }

      const clientIdHdr = req.header("X-Client-Id") || req.header("x-client-id") || null;
      const clientId = clientIdHdr && clientIdHdr.length <= 200 ? clientIdHdr : null;
      if (clientId) {
        const [existing] = await db
          .select()
          .from(flagPhotos)
          .where(and(eq(flagPhotos.flagId, flagId), eq(flagPhotos.clientId, clientId)));
        if (existing) {
          res.status(200).json(serializeFlagPhoto(existing, await signGetUrl(existing.storageKey)));
          return;
        }
      }

      // Read either multipart `file` field or raw body (mirrors slice 3).
      const ctype = (req.header("content-type") || "").toLowerCase();
      let buf: Buffer | null = null;
      if (ctype.startsWith("multipart/form-data")) {
        const parsed = await parseMultipart(req, res);
        if (!parsed) return;
        if (parsed.files.length === 0) {
          res.status(400).json({ message: "No file in upload" });
          return;
        }
        buf = parsed.files[0].buffer;
      } else {
        const body = req.body;
        const b: Buffer = Buffer.isBuffer(body) ? body : body ? Buffer.from(body as ArrayBuffer) : Buffer.alloc(0);
        if (b.length === 0) {
          res.status(400).json({ message: "No file data received" });
          return;
        }
        buf = b;
      }

      const r = await processAndUploadPhoto({ buf, companyId: u.activeCompanyId, flagId });
      if (!r.ok) {
        res.status(r.status).json({ message: r.message });
        return;
      }
      try {
        const [created] = await db
          .insert(flagPhotos)
          .values({
            companyId: u.activeCompanyId,
            flagId,
            uploadedByUserId: u.id,
            storageKey: r.storageKey,
            contentType: "image/jpeg",
            byteSize: r.bytes,
            width: r.width,
            height: r.height,
            clientId,
          })
          .returning();
        res.status(201).json(serializeFlagPhoto(created, await signGetUrl(created.storageKey)));
      } catch (err: unknown) {
        if (clientId && typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
          const [existing] = await db
            .select()
            .from(flagPhotos)
            .where(and(eq(flagPhotos.flagId, flagId), eq(flagPhotos.clientId, clientId)));
          if (existing) {
            res.status(200).json(serializeFlagPhoto(existing, await signGetUrl(existing.storageKey)));
            return;
          }
        }
        logger.error({ err }, "Flag photo insert failed");
        res.status(500).json({ message: "Failed to record photo" });
      }
    },
  );

  // ── GET /api/m/properties/search ────────────────────────────────────────────
  // Lightweight property autocomplete for the mobile composer's property
  // pre-fill picker. Returns up to 20 results scoped to the caller's company.
  app.get("/api/m/properties/search", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const q = String(req.query.q ?? "").trim();
    if (q.length < 1) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({
        id: customers.id,
        name: customers.name,
        street: customers.street,
        city: customers.city,
        state: customers.state,
      })
      .from(customers)
      .where(and(eq(customers.companyId, u.activeCompanyId), ilike(customers.name, `%${q}%`)))
      .limit(20);
    res.json(rows);
  });

  // ── GET /api/flags/unread-count ─────────────────────────────────────────────
  app.get("/api/flags/unread-count", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(flags)
      .where(and(eq(flags.companyId, u.activeCompanyId), eq(flags.status, "new")));
    res.json({ count: row?.n ?? 0 });
  });

  // ── GET /api/flags  (admin inbox) ───────────────────────────────────────────
  app.get("/api/flags", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    const crewId = typeof req.query.crewId === "string" && req.query.crewId.length > 0 ? req.query.crewId : undefined;
    const propertyId = typeof req.query.propertyId === "string" && req.query.propertyId.length > 0 ? req.query.propertyId : undefined;
    const dateFromStr = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
    const dateToStr = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
    const limitRaw = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offsetRaw = Number.parseInt(String(req.query.offset ?? "0"), 10);
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const conds = [eq(flags.companyId, u.activeCompanyId)];
    if (status && (FLAG_STATUSES as readonly string[]).includes(status)) {
      conds.push(eq(flags.status, status));
    }
    if (tag && (FLAG_TAG_VALUES as readonly string[]).includes(tag)) {
      conds.push(eq(flags.tag, tag));
    }
    if (crewId) conds.push(eq(flags.crewId, crewId));
    if (propertyId) conds.push(eq(flags.propertyId, propertyId));
    if (dateFromStr) {
      const d = new Date(dateFromStr);
      if (!isNaN(d.getTime())) conds.push(gte(flags.createdAt, d));
    }
    if (dateToStr) {
      const d = new Date(dateToStr);
      if (!isNaN(d.getTime())) {
        // dateTo treated as inclusive end-of-day when caller passed a date-only string
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateToStr)) d.setHours(23, 59, 59, 999);
        conds.push(lte(flags.createdAt, d));
      }
    }
    const createdByUser = users;
    const rows = await db
      .select({
        flag: flags,
        createdByName: createdByUser.name,
        crewName: crews.name,
        propertyName: customers.name,
      })
      .from(flags)
      .leftJoin(createdByUser, eq(flags.createdByUserId, createdByUser.id))
      .leftJoin(crews, eq(flags.crewId, crews.id))
      .leftJoin(customers, eq(flags.propertyId, customers.id))
      .where(and(...conds))
      .orderBy(desc(flags.createdAt))
      .limit(limit)
      .offset(offset);

    const flagIds = rows.map((r) => r.flag.id);
    const allPhotos = flagIds.length === 0
      ? []
      : await db.select().from(flagPhotos).where(inArray(flagPhotos.flagId, flagIds)).orderBy(desc(flagPhotos.createdAt));
    const photosByFlag = new Map<string, typeof flagPhotos.$inferSelect[]>();
    for (const p of allPhotos) {
      const arr = photosByFlag.get(p.flagId) ?? [];
      arr.push(p);
      photosByFlag.set(p.flagId, arr);
    }

    const items = await Promise.all(
      rows.map(async (r) => {
        const photos = photosByFlag.get(r.flag.id) ?? [];
        const serialized = await Promise.all(
          photos.map(async (p) => serializeFlagPhoto(p, await signGetUrl(p.storageKey))),
        );
        return serializeFlag(
          { ...r.flag, createdByName: r.createdByName, crewName: r.crewName, propertyName: r.propertyName } as FlagWithMeta,
          serialized,
        );
      }),
    );

    const [{ n: total }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(flags)
      .where(and(...conds));

    res.json({ items, total: total ?? 0, limit, offset });
  });

  // ── GET /api/flags/:id  (admin detail) ──────────────────────────────────────
  app.get("/api/flags/:id", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const createdByUser = users;
    const assignedToUser = users;
    const [row] = await db
      .select({
        flag: flags,
        createdByName: createdByUser.name,
        crewName: crews.name,
        propertyName: customers.name,
      })
      .from(flags)
      .leftJoin(createdByUser, eq(flags.createdByUserId, createdByUser.id))
      .leftJoin(crews, eq(flags.crewId, crews.id))
      .leftJoin(customers, eq(flags.propertyId, customers.id))
      .where(and(eq(flags.id, req.params.id), eq(flags.companyId, u.activeCompanyId)));
    if (!row) {
      res.status(404).json({ message: "Flag not found" });
      return;
    }
    let assignedToName: string | null = null;
    if (row.flag.assignedToUserId) {
      const [a] = await db.select({ name: assignedToUser.name }).from(assignedToUser).where(eq(assignedToUser.id, row.flag.assignedToUserId));
      assignedToName = a?.name ?? null;
    }
    const photos = await db
      .select()
      .from(flagPhotos)
      .where(eq(flagPhotos.flagId, row.flag.id))
      .orderBy(desc(flagPhotos.createdAt));
    const serialized = await Promise.all(
      photos.map(async (p) => serializeFlagPhoto(p, await signGetUrl(p.storageKey))),
    );
    res.json(
      serializeFlag(
        {
          ...row.flag,
          createdByName: row.createdByName,
          crewName: row.crewName,
          propertyName: row.propertyName,
          assignedToName,
        } as FlagWithMeta,
        serialized,
      ),
    );
  });

  // ── PATCH /api/flags/:id  (admin status / assignment / resolution) ──────────
  const patchSchema = z.object({
    status: flagStatusSchema.optional(),
    assignedToUserId: z.string().nullable().optional(),
    resolution: z.string().max(2000).nullable().optional(),
  });
  app.patch("/api/flags/:id", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid update", errors: parsed.error.flatten() });
      return;
    }

    if (parsed.data.assignedToUserId) {
      const [m] = await db
        .select()
        .from(companyUsers)
        .where(and(
          eq(companyUsers.userId, parsed.data.assignedToUserId),
          eq(companyUsers.companyId, u.activeCompanyId),
        ));
      if (!m) {
        res.status(400).json({ message: "Assignee must be a member of this company" });
        return;
      }
    }

    const update: Partial<typeof flags.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.status !== undefined) {
      update.status = parsed.data.status;
      if (parsed.data.status === "resolved" || parsed.data.status === "dismissed") {
        update.resolvedAt = new Date();
      } else {
        update.resolvedAt = null;
      }
    }
    if (parsed.data.assignedToUserId !== undefined) {
      update.assignedToUserId = parsed.data.assignedToUserId;
    }
    if (parsed.data.resolution !== undefined) {
      update.resolution = parsed.data.resolution;
    }

    const [updated] = await db
      .update(flags)
      .set(update)
      .where(and(eq(flags.id, req.params.id), eq(flags.companyId, u.activeCompanyId)))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Flag not found" });
      return;
    }
    res.json({ ok: true, flag: updated });
  });
}
