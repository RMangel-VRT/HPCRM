import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectStorageService, objectStorageClient } from "../objectStorage";
import { CustomerDocumentObjects } from "./customerDocumentObjects";

afterEach(() => vi.restoreAllMocks());
describe("CP5 stored-object cleanup", () => {
  it("deletes only the scoped legacy object, treats missing objects as idempotent and propagates failures", async () => {
    vi.spyOn(ObjectStorageService.prototype, "getPrivateObjectDir").mockReturnValue("/bucket/.private");
    const remove = vi.fn().mockResolvedValue([{}]);
    const file = vi.fn().mockReturnValue({ delete: remove });
    const bucket = vi.spyOn(objectStorageClient, "bucket").mockReturnValue({ file } as any);
    const objects = new CustomerDocumentObjects();
    await objects.remove("/bucket/.private/map-documents/company/customer/map.pdf", "company", "customer");
    expect(bucket).toHaveBeenCalledExactlyOnceWith("bucket");
    expect(file).toHaveBeenCalledExactlyOnceWith(".private/map-documents/company/customer/map.pdf");
    expect(remove).toHaveBeenCalledExactlyOnceWith({ ignoreNotFound: true });
    // GCS ignoreNotFound resolves on a missing object; same request remains safe.
    await objects.remove("/objects/map-documents/company/customer/map.pdf", "company", "customer");
    remove.mockRejectedValueOnce(new Error("storage outage"));
    await expect(objects.remove("/objects/map-documents/company/customer/map.pdf", "company", "customer")).rejects.toThrow("storage outage");
    for (const path of ["/objects/uploads/contract", "/objects/map-layers/company/customer/file",
      "/objects/map-documents/company/other/file", "/objects/map-documents/other/customer/file"]) {
      await expect(objects.remove(path, "company", "customer")).rejects.toMatchObject({ status: 404 });
    }
    expect(remove).toHaveBeenCalledTimes(3);
  });
  it("bounds actual streamed bytes instead of accepting a forged metadata size", async () => {
    vi.spyOn(ObjectStorageService.prototype, "getPrivateObjectDir").mockReturnValue("/bucket/.private");
    vi.spyOn(ObjectStorageService.prototype, "getObjectEntityFile").mockResolvedValue({
      createReadStream: () => (async function* () { yield Buffer.alloc(25 * 1024 * 1024); yield Buffer.from("x"); })(),
    } as any);
    await expect(new CustomerDocumentObjects().read("/objects/map-documents/co/cu/file", "co", "cu"))
      .rejects.toMatchObject({ status: 413 });
  });
});
