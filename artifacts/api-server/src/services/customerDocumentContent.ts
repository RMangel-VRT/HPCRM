import yauzl from "yauzl";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { CUSTOMER_DOCUMENT_MAX_BYTES } from "../../../../lib/db/src/customerDocumentContracts";

export class CustomerDocumentError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const invalid = () => new CustomerDocumentError(422, "DOCUMENT_INVALID_CONTENT");
const officeMime = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Read Office's actual package structure, not merely PK magic or an extension.
 * Bounded lazy ZIP traversal prevents decompression bombs and arbitrary ZIPs.
 */
async function officeType(buffer: Buffer): Promise<"docx" | "xlsx"> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(invalid()); return; }
      let entries = 0, expanded = 0, settled = false;
      const xml = new Map<string, string>(), names = new Set<string>();
      const fail = () => { if (!settled) { settled = true; zip.close(); reject(invalid()); } };
      zip.on("error", fail);
      zip.on("entry", entry => {
        entries++; expanded += entry.uncompressedSize;
        if (entries > 2000 || expanded > 100 * 1024 * 1024 || (entry.generalPurposeBitFlag & 1) ||
          /(^\/|\\|(^|\/)\.\.(\/|$)|vbaProject\.bin$)/i.test(entry.fileName) || names.has(entry.fileName)) { fail(); return; }
        names.add(entry.fileName);
        if (!["[Content_Types].xml", "_rels/.rels", "word/document.xml", "xl/workbook.xml"].includes(entry.fileName)) {
          zip.readEntry(); return;
        }
        if (entry.uncompressedSize > 4 * 1024 * 1024) { fail(); return; }
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) { fail(); return; }
          const chunks: Buffer[] = []; let size = 0;
          stream.on("data", chunk => { size += chunk.length; if (size > 4 * 1024 * 1024) { stream.destroy(); fail(); } else chunks.push(chunk); });
          stream.on("error", fail);
          stream.on("end", () => { xml.set(entry.fileName, Buffer.concat(chunks).toString("utf8")); if (!settled) zip.readEntry(); });
        });
      });
      zip.on("end", () => {
        if (settled) return;
        const types = xml.get("[Content_Types].xml") ?? "", rels = xml.get("_rels/.rels") ?? "";
        const docx = types.includes(officeMime.docx.replace(".document", ".document.main+xml")) &&
          /<(?:\w+:)?document\b/.test(xml.get("word/document.xml") ?? "") && rels.includes("word/document.xml");
        const xlsx = types.includes(officeMime.xlsx.replace(".sheet", ".sheet.main+xml")) &&
          /<(?:\w+:)?workbook\b/.test(xml.get("xl/workbook.xml") ?? "") && rels.includes("xl/workbook.xml");
        settled = true;
        if (docx === xlsx) reject(invalid()); else resolve(docx ? "docx" : "xlsx");
      });
      zip.readEntry();
    });
  });
}

export async function validateCustomerDocument(buffer: Buffer) {
  if (buffer.length > CUSTOMER_DOCUMENT_MAX_BYTES) throw new CustomerDocumentError(413, "DOCUMENT_TOO_LARGE");
  if (!buffer.length) throw invalid();
  if (buffer.subarray(0, 5).toString() === "%PDF-" && buffer.subarray(-2048).includes(Buffer.from("%%EOF")))
    return { buffer, mimeType: "application/pdf", fileType: "pdf" };
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const fileType = await officeType(buffer);
    return { buffer, fileType, mimeType: officeMime[fileType] };
  }
  let bytes = buffer;
  const brand = buffer.subarray(4, 12).toString("ascii");
  if (brand.startsWith("ftyp") && /heic|heix|hevc|hevx|mif1|msf1/.test(buffer.subarray(8, 64).toString("ascii"))) {
    try { bytes = Buffer.from(await heicConvert({ buffer, format: "JPEG", quality: 0.9 })); } catch { throw invalid(); }
  }
  try {
    const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
    if (!["jpeg", "png"].includes(meta.format ?? "")) throw invalid();
    // Force a full decode, not just header parsing, and strip unsafe trailing data.
    bytes = meta.format === "png" ? await sharp(bytes).png().toBuffer() : await sharp(bytes).jpeg().toBuffer();
    if (bytes.length > CUSTOMER_DOCUMENT_MAX_BYTES) throw new CustomerDocumentError(413, "DOCUMENT_TOO_LARGE");
    return { buffer: bytes, mimeType: meta.format === "png" ? "image/png" : "image/jpeg", fileType: meta.format === "png" ? "png" : "jpg" };
  } catch (error) {
    if (error instanceof CustomerDocumentError) throw error;
    throw invalid();
  }
}
