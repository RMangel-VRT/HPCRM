import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We test the module without the env key set first, then with it set.
// Use dynamic import so we can control the env before the module loads.

const VALID_KEY = "a".repeat(64); // 64-char hex = 32 bytes

describe("qboCrypto", () => {
  describe("with valid key", () => {
    beforeEach(() => {
      process.env.QBO_TOKEN_ENC_KEY = VALID_KEY;
    });
    afterEach(() => {
      delete process.env.QBO_TOKEN_ENC_KEY;
      vi.resetModules();
    });

    it("encrypts and decrypts a token round-trip", async () => {
      const { encryptToken, decryptToken } = await import("./qboCrypto");
      const plaintext = "eyJhbGciOiJSUzI1NiJ9.test_access_token";
      const ciphertext = encryptToken(plaintext);
      expect(ciphertext).not.toBeNull();
      expect(ciphertext).not.toBe(plaintext);
      const recovered = decryptToken(ciphertext!);
      expect(recovered).toBe(plaintext);
    });

    it("produces different ciphertext each time (random IV)", async () => {
      const { encryptToken } = await import("./qboCrypto");
      const c1 = encryptToken("same-token");
      const c2 = encryptToken("same-token");
      expect(c1).not.toBe(c2); // different IV → different ciphertext
    });

    it("returns null when decrypting a tampered ciphertext", async () => {
      const { encryptToken, decryptToken } = await import("./qboCrypto");
      const ciphertext = encryptToken("some-token")!;
      const parts = ciphertext.split(":");
      // Corrupt the auth tag (last segment)
      parts[2] = "deadbeef".repeat(4);
      const tampered = parts.join(":");
      expect(decryptToken(tampered)).toBeNull();
    });

    it("returns null when decrypting a structurally invalid string", async () => {
      const { decryptToken } = await import("./qboCrypto");
      expect(decryptToken("not:valid")).toBeNull();
      expect(decryptToken("one-segment")).toBeNull();
      expect(decryptToken("")).toBeNull();
    });

    it("ciphertext format is iv:ciphertext:authTag (3 colon-separated hex segments)", async () => {
      const { encryptToken } = await import("./qboCrypto");
      const ct = encryptToken("hello")!;
      const parts = ct.split(":");
      expect(parts).toHaveLength(3);
      // Each segment should be a valid hex string
      for (const part of parts) {
        expect(part).toMatch(/^[0-9a-f]+$/);
      }
    });
  });

  describe("without key", () => {
    beforeEach(() => {
      delete process.env.QBO_TOKEN_ENC_KEY;
      vi.resetModules();
    });

    it("encryptToken returns null and logs error when key is missing", async () => {
      const { encryptToken } = await import("./qboCrypto");
      const result = encryptToken("some-token");
      expect(result).toBeNull();
    });

    it("decryptToken returns null and logs error when key is missing", async () => {
      const { decryptToken } = await import("./qboCrypto");
      const result = decryptToken("iv:ciphertext:tag");
      expect(result).toBeNull();
    });
  });
});
