import sharp from "sharp";

export const safeExhibitImage = (uri: string | null | undefined) =>
  uri && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : null;

/** Decode, rotate, bound both dimensions, strip metadata and compress before embedding. */
export async function exhibitImageUri(bytes: Buffer): Promise<string> {
  const compressed = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 75 }).toBuffer();
  return `data:image/jpeg;base64,${compressed.toString("base64")}`;
}
