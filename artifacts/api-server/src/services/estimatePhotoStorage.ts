import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { z } from "zod/v4";
import { ESTIMATE_PHOTO_MAX_BYTES, estimatePhotoUploadSchema } from "@workspace/db/estimate-contracts";
import { ESTIMATE_PHOTO_PREFIX, ObjectNotFoundError, ObjectStorageService } from "../objectStorage";
import { EstimateError } from "./estimateErrors";

const grantSchema = estimatePhotoUploadSchema.extend({
  id: z.uuid(), companyId: z.string(), estimateId: z.string(), versionId: z.string(),
  userId: z.string(), expires: z.number(),
});
export type EstimatePhotoGrant = z.infer<typeof grantSchema>;
const stagingPath = (id: string) => `${ESTIMATE_PHOTO_PREFIX}pending/${id}`;

function mac(payload: string, sessionId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session signing is not configured");
  return createHmac("sha256", secret).update(`estimate-photo:${sessionId}:${payload}`).digest("base64url");
}
export function signEstimatePhotoGrant(grant: EstimatePhotoGrant, sessionId: string) {
  const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return `${payload}.${mac(payload, sessionId)}`;
}
export function readEstimatePhotoGrant(token: string, sessionId: string): EstimatePhotoGrant | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined || token.length > 4096) return null;
  const expected = Buffer.from(mac(payload, sessionId)), actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try { return grantSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString())); }
  catch { return null; }
}

export interface EstimatePhotoObjects {
  start(id: string): Promise<{ uploadUrl: string }>;
  readUpload(grant: EstimatePhotoGrant): Promise<Buffer>;
  save(relativePath: string, bytes: Buffer): Promise<void>;
  remove(relativePath: string): Promise<void>;
}
export class PrivateEstimatePhotoObjects implements EstimatePhotoObjects {
  private readonly objects = new ObjectStorageService();
  async start(id: string) {
    const { uploadUrl } = await this.objects.getScopedUploadURL(stagingPath(id));
    return { uploadUrl };
  }
  async readUpload(grant: EstimatePhotoGrant) {
    let file;
    try { file = await this.objects.getObjectEntityFile(`/objects/${stagingPath(grant.id)}`, { allowEstimatePhoto: true }); }
    catch (error) {
      if (error instanceof ObjectNotFoundError) throw new EstimateError(404, "PHOTO_UPLOAD_MISSING");
      throw error;
    }
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== grant.fileSize || !metadata.generation) throw new EstimateError(422, "INVALID_PHOTO");
    // Pin the verified generation so a second PUT cannot swap in larger bytes.
    const stream = file.bucket.file(file.name, { generation: metadata.generation }).createReadStream();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > grant.fileSize || size > ESTIMATE_PHOTO_MAX_BYTES) throw new EstimateError(422, "INVALID_PHOTO");
      chunks.push(bytes);
    }
    if (size !== grant.fileSize) throw new EstimateError(422, "INVALID_PHOTO");
    return Buffer.concat(chunks);
  }
  async save(relativePath: string, bytes: Buffer) {
    await this.objects.saveBufferToPrivatePath(relativePath, bytes, "image/jpeg");
  }
  remove(relativePath: string) { return this.objects.deletePrivatePath(relativePath); }
}
export const removeEstimatePhotoStaging = (objects: EstimatePhotoObjects, id: string) => objects.remove(stagingPath(id));

/** Decode actual pixels, reject non-raster content, strip metadata and bound
 * storage and PDF input. HEIC/HEIF use the existing CRM conversion before PUT. */
export async function normalizeEstimatePhoto(bytes: Buffer) {
  try {
    const image = sharp(bytes, { limitInputPixels: 80_000_000 });
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp", "gif", "tiff", "heif"].includes(format)) throw new Error("Unsupported image");
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" }).jpeg({ quality: 82 }).toBuffer();
  } catch { throw new EstimateError(422, "INVALID_PHOTO"); }
}
