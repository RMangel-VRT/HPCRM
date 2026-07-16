import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "../lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer | null {
  const raw = process.env.QBO_TOKEN_ENC_KEY;
  if (!raw) {
    logger.error("QBO_TOKEN_ENC_KEY env var is missing — token encryption unavailable");
    return null;
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    logger.error(
      { keyLength: buf.length },
      "QBO_TOKEN_ENC_KEY must be a 64-character hex string (32 bytes for AES-256)"
    );
    return null;
  }
  return buf;
}

export function encryptToken(plaintext: string): string | null {
  const key = getKey();
  if (!key) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptToken(encoded: string): string | null {
  const key = getKey();
  if (!key) return null;
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    logger.error("QBO token decode failed: unexpected format");
    return null;
  }
  const [ivHex, ciphertextHex, tagHex] = parts;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    logger.error({ err }, "QBO token decryption failed (tampered or wrong key)");
    return null;
  }
}
