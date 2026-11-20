import { createHmac, timingSafeEqual } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { RequestHandler } from "express";
import type { File } from "@google-cloud/storage";
import { z } from "zod/v4";
import { ObjectNotFoundError, ObjectStorageService, signObjectURL } from "../../objectStorage";
import { publicAppUrl } from "../../lib/publicAppUrl";

const refSchema = z.object({
  kind: z.enum(["campaign", "ticket"]),
  companyId: z.string().regex(/^[\w-]{1,128}$/),
  id: z.string().regex(/^[\w-]{1,128}$/),
  filename: z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:jpg|jpeg|png)$/i),
  generation: z.string().regex(/^[1-9]\d{0,15}$/).refine(value => Number.isSafeInteger(Number(value))),
}).strict();
type PhotoRef = z.infer<typeof refSchema>;
type PhotoOwner = { id: string; companyId: string; completionPhotoStorageKeys?: string[] | null };
const objects = new ObjectStorageService();
const mimeType = (filename: string) => /\.png$/i.test(filename) ? "image/png" : "image/jpeg";
const namespace = (kind: PhotoRef["kind"]) => kind === "campaign" ? "visit-photos" : "ticket-photos";
const objectKey = ({ kind, companyId, id, filename }: Omit<PhotoRef, "generation">) =>
  `${namespace(kind)}/${companyId}/${id}/${filename}`;

function signature(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Email image signing is not configured");
  return createHmac("sha256", secret).update(`email-completion-photo:v1:${payload}`).digest("base64url");
}

function signRef(ref: PhotoRef) {
  const payload = Buffer.from(JSON.stringify(ref)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function readRef(token: string): PhotoRef {
  const match = /^([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || !timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(match[1])))) throw new ObjectNotFoundError();
  return refSchema.parse(JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")));
}

const fileFor = (ref: Omit<PhotoRef, "generation">) => ref.kind === "campaign"
  ? objects.getObjectEntityFile(`/objects/${objectKey(ref)}`)
  : objects.getTicketCompletionPhotoFile(objectKey(ref));

async function hasImageSignature(file: File, type: ReturnType<typeof mimeType>) {
  const [magic] = await file.download({ start: 0, end: 7, validation: false });
  return type === "image/png"
    ? magic.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : magic.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
}

/**
 * Accept only completion-photo fields from a persisted, company-scoped owner, never a
 * request body or a free-form key. Previews keep using short-lived storage URLs.
 */
export async function completionPhotoUrls(kind: PhotoRef["kind"], owner: PhotoOwner, purpose: "send" | "preview") {
  const keys = owner.completionPhotoStorageKeys;
  if (!keys?.length) return [];
  const home = kind === "campaign" ? `${objects.getPrivateObjectDir().replace(/\/$/, "")}/` : "";
  const urls = await Promise.all([...new Set(keys)].map(async key => {
    const filename = key.split("/").at(-1);
    const parsed = refSchema.omit({ generation: true }).safeParse({ kind, companyId: owner.companyId, id: owner.id, filename });
    if (!parsed.success || key.replace(/^\//, "") !== `${home}${objectKey(parsed.data)}`.replace(/^\//, "")) return null;
    try {
      const file = await fileFor(parsed.data);
      const [metadata] = await file.getMetadata();
      const type = mimeType(parsed.data.filename);
      if (metadata.contentType !== type || metadata.contentEncoding) return null;
      if (purpose === "preview") return await signObjectURL({
        bucketName: file.bucket.name, objectName: file.name, method: "GET", ttlSec: 900,
      });
      const ref = refSchema.parse({ ...parsed.data, generation: String(metadata.generation) });
      if (!await hasImageSignature(file.bucket.file(file.name, { generation: ref.generation }), type)) return null;
      return `${publicAppUrl()}/email-img/${signRef(ref)}`;
    } catch (error) {
      if (error instanceof ObjectNotFoundError || (error as { code?: unknown })?.code === 404) return null;
      throw error;
    }
  }));
  return urls.filter((url): url is string => !!url);
}

export const serveCompletionPhoto: RequestHandler<{ token: string }> = async (req, res) => {
  try {
    const ref = readRef(req.params.token);
    const file = await fileFor(ref);
    // Pin the bytes that were shared. A change at the same path cannot replace an
    // already-issued image or change what is served between validation and streaming.
    const version = file.bucket.file(file.name, { generation: ref.generation });
    const [metadata] = await version.getMetadata();
    const type = mimeType(ref.filename);
    const size = Number(metadata.size);
    if (metadata.contentType !== type || metadata.contentEncoding || !Number.isSafeInteger(size) || size < 8
      || !await hasImageSignature(version, type)) throw new ObjectNotFoundError();
    res.set({
      "Content-Type": type,
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    if (req.method === "HEAD") { res.end(); return; }
    await pipeline(version.createReadStream(), res);
  } catch {
    if (!res.headersSent && !res.destroyed) {
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Type");
      res.status(404).set("Cache-Control", "no-store").end();
    } else if (!res.destroyed) res.destroy();
  }
};
