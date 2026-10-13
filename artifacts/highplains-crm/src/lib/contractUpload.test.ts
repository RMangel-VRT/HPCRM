import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", () => api);
import { uploadContractFile, validateContractFile } from "./contractUpload";

const file = new File(["x"], "c.pdf", { type: "application/pdf" });
beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockImplementation(async (_m: string, url: string) => ({ json: async () => (url.endsWith("upload-url") ? { uploadURL: "https://s/u" } : { id: "d" }) }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
});

describe("uploadContractFile", () => {
  it("keeps the legacy customer flow: PDF put then register without extras", async () => {
    await uploadContractFile({ file, uploadUrlPath: "/api/contracts/9/documents/upload-url", registerPath: "/api/contracts/9/documents" });
    expect((fetch as any).mock.calls[0][1].headers["Content-Type"]).toBe("application/pdf");
    expect(api.apiRequest).toHaveBeenLastCalledWith("POST", "/api/contracts/9/documents",
      { uploadURL: "https://s/u", filename: "c.pdf", fileSize: 1, mimeType: "application/pdf" });
  });
  it("sends the term document kind", async () => {
    await uploadContractFile({ file, uploadUrlPath: "/t/upload-url", registerPath: "/t/documents", extraBody: { kind: "signed" } });
    expect(api.apiRequest.mock.calls[1][2]).toMatchObject({ kind: "signed", filename: "c.pdf" });
  });
  it("surfaces storage and registration failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(uploadContractFile({ file, uploadUrlPath: "/u", registerPath: "/r" })).rejects.toThrow("Upload failed");
    expect(api.apiRequest).toHaveBeenCalledTimes(1);
  });
  it("validates type and size like the legacy page", () => {
    expect(validateContractFile({ type: "text/plain", size: 1 })).toBe("type");
    expect(validateContractFile({ type: "application/pdf", size: 21 * 1024 * 1024 })).toBe("size");
    expect(validateContractFile({ type: "application/pdf", size: 5 })).toBeNull();
  });
});
