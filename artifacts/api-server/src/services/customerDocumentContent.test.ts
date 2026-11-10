import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { validateCustomerDocument } from "./customerDocumentContent";
import { customerDocumentRelativePath } from "./customerDocumentObjects";
import { readDocumentGrant, signDocumentGrant } from "./customerDocumentGrants";
import { CUSTOMER_DOCUMENT_MAX_BYTES } from "../../../../lib/db/src/customerDocumentContracts";

async function zip(files: Record<string, string>) {
  const archive = archiver("zip"), stream = new PassThrough(), chunks: Buffer[] = [];
  stream.on("data", chunk => chunks.push(chunk));
  archive.pipe(stream);
  const ended = new Promise<Buffer>((resolve, reject) => { stream.on("end", () => resolve(Buffer.concat(chunks))); archive.on("error", reject); });
  for (const [name, contents] of Object.entries(files)) archive.append(contents, { name });
  await archive.finalize(); return ended;
}
describe("CP5 actual content and private path validation", () => {
  it("accepts PDF and rejects renamed executable/text/truncated PDF and empty content", async () => {
    expect(await validateCustomerDocument(Buffer.from("%PDF-1.7\nfixture\n%%EOF"))).toMatchObject({ mimeType: "application/pdf" });
    for (const data of ["MZarbitrary.exe", "", "%PDF-broken", "<svg></svg>", "PKrandom"]) {
      await expect(validateCustomerDocument(Buffer.from(data))).rejects.toMatchObject({ code: "DOCUMENT_INVALID_CONTENT" });
    }
  });
  it("measures actual bytes and decodes PNG/JPEG, stripping trailing data", async () => {
    await expect(validateCustomerDocument(Buffer.alloc(CUSTOMER_DOCUMENT_MAX_BYTES + 1))).rejects.toMatchObject({ status: 413 });
    for (const format of ["png", "jpeg"] as const) {
      const buffer = await sharp({ create: { width: 3, height: 3, channels: 3, background: "green" } })[format]().toBuffer();
      const result = await validateCustomerDocument(Buffer.concat([buffer, Buffer.from("TRAILER")]));
      expect(result.mimeType).toBe(`image/${format}`); expect(result.buffer.includes(Buffer.from("TRAILER"))).toBe(false);
    }
    const gif = await sharp({ create: { width: 3, height: 3, channels: 3, background: "green" } }).gif().toBuffer();
    await expect(validateCustomerDocument(gif)).rejects.toMatchObject({ status: 422 });
  });
  it.each(["docx", "xlsx"] as const)("checks %s package relationships/content types and rejects arbitrary ZIPs", async kind => {
    const doc = kind === "docx";
    const path = doc ? "word/document.xml" : "xl/workbook.xml";
    const mime = doc ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
    const files = { "[Content_Types].xml": `<Types><Override ContentType="${mime}"/></Types>`,
      "_rels/.rels": `<Relationships><Relationship Target="${path}"/></Relationships>`,
      [path]: doc ? "<w:document/>" : "<workbook/>" };
    expect((await validateCustomerDocument(await zip(files))).fileType).toBe(kind);
    await expect(validateCustomerDocument(await zip({ "file.txt": "not office" }))).rejects.toMatchObject({ status: 422 });
    await expect(validateCustomerDocument(await zip({ ...files, "word/vbaProject.bin": "macro" }))).rejects.toMatchObject({ status: 422 });
    await expect(validateCustomerDocument(await zip({ ...files, "_rels/.rels": "" }))).rejects.toMatchObject({ status: 422 });
  });
  it("supports legacy paths but rejects unrelated namespaces, customers, buckets and traversal", () => {
    const parse = (path: string) => customerDocumentRelativePath(path, "co", "cu", "/bucket/.private");
    expect(parse("/bucket/.private/map-documents/co/cu/file.pdf")).toBe("map-documents/co/cu/file.pdf");
    expect(parse("/objects/map-documents/co/cu/file.pdf")).toBe("map-documents/co/cu/file.pdf");
    for (const path of ["/objects/map-documents/co/other/a", "/objects/map-documents/other/cu/a", "/other/.private/map-documents/co/cu/a",
      "/objects/map-layers/co/cu/a", "/objects/uploads/a", "/objects/map-documents/co/cu/../a"]) expect(() => parse(path)).toThrow();
  });
  it("signed grants bind parallel uploads to session and reject tampering", () => {
    const grant = { id: "4ead64f2-e57b-45cf-8c70-5fd68f364be2", companyId: "co", customerId: "cu", userId: "user", path: "path", filename: "a.pdf", expires: Date.now() + 1000 };
    const token = signDocumentGrant(grant, "session");
    expect(readDocumentGrant(token, "session")).toEqual(grant);
    expect(() => readDocumentGrant(token, "other")).toThrow();
    expect(() => readDocumentGrant(token + "x", "session")).toThrow();
  });
});
