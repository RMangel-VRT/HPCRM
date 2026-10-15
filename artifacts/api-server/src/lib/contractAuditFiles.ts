import type { Request } from "express";
import Busboy from "busboy";
import type { Readable } from "node:stream";
import { parse } from "csv-parse/sync";
import yauzl from "yauzl";

export const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const IMPORT_HEADERS: Record<string, string[]> = {
  "renewals.csv": "contract_ref renews_term_id customer_name season_label start_date end_date status signed_date snow_pricing snow_flat_price legal_name managing_agent_name project_contact contact_phone contact_email project_address po snow_triggers notes renewal_increase_pct needs_review review_note".split(" "),
  "contracts.csv": "contract_ref agreement_ref customer_id customer_name line form season_label start_date end_date status signed_date renews_ref snow_pricing snow_flat_price managing_agent_name legal_name project_contact contact_phone contact_email project_address po snow_triggers legacy_contract_ids needs_review review_note notes".split(" "),
  "payments.csv": ["contract_ref", "payment_line", ...MONTHS],
  "rates.csv": "contract_ref rate_key price price_text minimum unit label category line".split(" "),
  "scope.csv": ["contract_ref", "service_key", "included", "quantity", "unit", ...MONTHS, "label", "notes"],
  "documents.csv": ["contract_ref", "document_id", "kind"],
};
export type Diagnostic = { file: string; row?: number; column?: string; contractRef?: string; message: string };
export type CsvRow = { file: string; row: number; values: Record<string, string> };
export type UploadFile = { name: string; data: Buffer };
export type AuditFiles = { filename: string; mode?: "audit" | "renewal"; pdfs?: Record<string, Buffer>; tables: Record<string, CsvRow[]>; manifest?: { exportedAt: string }; errors: Diagnostic[] };
const LIMIT = 10 * 1024 * 1024;
const EXPANDED_LIMIT = 30 * 1024 * 1024;
const RENEWAL_LIMIT = 40 * 1024 * 1024;
export const PDF_LIMIT = 15 * 1024 * 1024;
export function safeImportPath(name: string) {
  return !name.includes("\\") && !/[\x00-\x1f\x7f]/.test(name) && !name.startsWith("/") &&
    !/^[A-Za-z]:/.test(name) && !name.replace(/\/$/, "").split("/").some(p => !p || p === ".." || p === ".");
}

/** Exact decimal arithmetic, bounded to the PostgreSQL integer money columns. */
export function dollarCents(value: string): number {
  const text = value.trim().replace(/^\$/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) throw new Error("Expected non-negative dollars with at most two decimal places");
  const [whole, fraction = ""] = text.replace(/,/g, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > 2147483647n) throw new Error("Money exceeds the integer cents limit");
  return Number(cents);
}

export function receiveAuditUpload(req: Request, detectMode = false): Promise<UploadFile[]> {
  return new Promise((resolve, reject) => {
    let bus: ReturnType<typeof Busboy>;
    const limit = detectMode ? RENEWAL_LIMIT : LIMIT;
    try { bus = Busboy({ headers: req.headers, limits: { fileSize: limit, files: 6, fields: 0, parts: 6 } }); }
    catch { reject(new Error("Expected multipart files")); return; }
    const files: UploadFile[] = [];
    let total = 0, failure = "";
    const fail = (message: string) => { failure ||= message; };
    bus.on("file", (_field, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("limit", () => fail(`Upload exceeds ${detectMode ? 40 : 10} MB`));
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > limit) fail(`Upload exceeds ${detectMode ? 40 : 10} MB`);
        if (!failure) chunks.push(chunk);
      });
      stream.on("end", () => files.push({ name: info.filename, data: Buffer.concat(chunks) }));
      stream.on("error", () => fail("Could not read upload"));
    });
    bus.on("filesLimit", () => fail("Too many uploaded files"));
    bus.on("partsLimit", () => fail("Too many uploaded parts"));
    bus.on("fieldsLimit", () => fail("Only file parts are supported"));
    bus.on("error", () => reject(new Error("Malformed multipart upload")));
    const aborted = () => { bus.destroy(); reject(new Error("Upload disconnected")); };
    req.once("aborted", aborted);
    bus.on("close", () => {
      req.off("aborted", aborted);
      failure ? reject(new Error(failure)) : resolve(files);
    });
    req.pipe(bus);
  });
}

/** No filesystem extraction; lazy entries and actual byte counts bound ZIP bombs. */
export function readAuditZip(data: Buffer, detectMode = false): Promise<UploadFile[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(new Error("Invalid ZIP archive")); return; }
      let count = 0, expanded = 0, settled = false;
      let activeStream: Readable | undefined;
      const files: UploadFile[] = [];
      const fail = (message: string) => {
        if (settled) return;
        settled = true; activeStream?.destroy(); zip.close(); reject(new Error(message));
      };
      zip.on("error", () => fail("Unreadable ZIP archive"));
      zip.on("end", () => {
        if (settled) return;
        const renewal = detectMode && files.some(f => f.name.split("/").pop() === "renewals.csv");
        if (!renewal && (count > 20 || expanded > EXPANDED_LIMIT)) return fail("ZIP exceeds expanded-size or file-count limit");
        settled = true; zip.close(); resolve(files);
      });
      zip.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName;
        const bound = detectMode ? 60 * 1024 * 1024 : EXPANDED_LIMIT;
        if (++count > (detectMode ? 60 : 20) || entry.uncompressedSize > bound || expanded + entry.uncompressedSize > bound)
          return fail("ZIP exceeds expanded-size or file-count limit");
        if (!safeImportPath(name))
          return fail("Unsafe ZIP entry path");
        if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) return fail("ZIP symbolic links are not supported");
        const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (![0, 0x8000, 0x4000].includes(unixType)) return fail("Unsupported ZIP file type");
        if (entry.generalPurposeBitFlag & 1) return fail("Encrypted ZIP entries are not supported");
        if (name.endsWith("/")) { zip.readEntry(); return; }
        if (/\.pdf$/i.test(name) && entry.uncompressedSize > PDF_LIMIT) return fail("PDF exceeds 15 MB");
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return fail("Cannot read ZIP entry");
          if (settled) { stream.destroy(); return; }
          activeStream = stream;
          const chunks: Buffer[] = [];
          let entryBytes = 0;
          stream.on("data", (chunk: Buffer) => {
            expanded += chunk.length;
            entryBytes += chunk.length;
            if (expanded > bound || (/\.pdf$/i.test(name) && entryBytes > PDF_LIMIT)) { stream.destroy(); fail("ZIP exceeds expanded-size or PDF limit"); }
            else chunks.push(chunk);
          });
          stream.on("error", () => fail("Cannot decompress ZIP entry"));
          stream.on("end", () => { activeStream = undefined; if (!settled) { files.push({ name, data: Buffer.concat(chunks) }); zip.readEntry(); } });
        });
      });
      zip.readEntry();
    });
  });
}

export async function parseAuditFiles(upload: UploadFile[]): Promise<AuditFiles> {
  const result: AuditFiles = { filename: upload.map(f => f.name).join(", ").slice(0, 300), mode: "audit", pdfs: {}, tables: {}, errors: [] };
  const error = (file: string, message: string, row = 1, column?: string) => result.errors.push({ file, row, column, message });
  let files = upload;
  if (!files.length) error("upload", "Select one ZIP or the five CSV files");
  const uploadedBytes = files.reduce((n, f) => n + f.data.length, 0);
  if (uploadedBytes > RENEWAL_LIMIT) {
    error("upload", "Upload exceeds 40 MB"); return result;
  }
  const zipped = files.some(f => /\.zip$/i.test(f.name));
  if (zipped) {
    if (files.length !== 1) { error("upload", "Upload one ZIP, not ZIP and CSV files together"); return result; }
    try { files = await readAuditZip(files[0].data, true); }
    catch (e) { error(upload[0].name, (e as Error).message); return result; }
  }
  const names = files.map(f => f.name.split("/").pop());
  if (names.includes("contracts.csv") && names.includes("renewals.csv")) {
    error("upload", "Import either contracts.csv or renewals.csv, not both."); return result;
  }
  result.mode = names.includes("renewals.csv") ? "renewal" : "audit";
  if (result.mode === "audit" && uploadedBytes > LIMIT) { error("upload", "Upload exceeds 10 MB"); return result; }
  const seen = new Set<string>();
  const paths = new Set<string>();
  for (const file of files) {
    if (!safeImportPath(file.name)) { error(file.name, "Unsafe import path"); continue; }
    if (paths.has(file.name)) { error(file.name, "Duplicate data file"); continue; }
    paths.add(file.name);
    const name = file.name.split("/").pop()!;
    if (result.mode === "renewal" && /\.pdf$/i.test(name)) {
      if (!zipped || !file.name.startsWith("files/")) error(file.name, "PDFs must be inside the ZIP under files/");
      else if (file.data.length > PDF_LIMIT) error(file.name, "PDF exceeds 15 MB");
      else if (!file.data.subarray(0, 5).equals(Buffer.from("%PDF-"))) error(file.name, "Invalid PDF file");
      else result.pdfs![file.name] = file.data;
      continue;
    }
    if (name === "README.md") continue;
    if (!IMPORT_HEADERS[name] && name !== "manifest.json") { error(file.name, "Unsupported data file"); continue; }
    if (seen.has(name)) { error(file.name, "Duplicate data file"); continue; }
    seen.add(name);
    if (name === "manifest.json") {
      try {
        const manifest = JSON.parse(file.data.toString("utf8"));
        if (!manifest || typeof manifest.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(manifest.exportedAt) || !Number.isFinite(Date.parse(manifest.exportedAt)))
          throw new Error();
        result.manifest = manifest;
      } catch { error(name, "Manifest must contain an ISO exportedAt timestamp"); }
      continue;
    }
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const records = parse(decoder.decode(file.data), { bom: true, skip_empty_lines: true, info: true, max_record_size: 100000 }) as unknown as Array<{ record: string[]; info: { lines: number } }>;
      const headers = records.shift()?.record ?? [];
      if (!headers.length || new Set(headers).size !== headers.length) { error(name, "Missing or duplicate column headers"); continue; }
      const allowed = name === "documents.csv" && result.mode === "renewal" ? ["contract_ref", "file", "kind"] : IMPORT_HEADERS[name];
      headers.forEach(h => { if (!allowed.includes(h)) error(name, `Unknown column: ${h}`, 1, h); });
      const required = name === "renewals.csv" ? ["contract_ref", "renews_term_id", "start_date", "end_date", "status"]
        : name === "contracts.csv" ? ["contract_ref", "agreement_ref", "customer_id", "line", "form", "start_date", "end_date", "status"]
        : name === "payments.csv" ? ["contract_ref", "payment_line"] : name === "rates.csv" ? ["contract_ref", "rate_key"]
        : name === "scope.csv" ? ["contract_ref", "service_key", "included"] : ["contract_ref", result.mode === "renewal" ? "file" : "document_id", "kind"];
      required.forEach(h => { if (!headers.includes(h)) error(name, `Missing required column: ${h}`, 1, h); });
      result.tables[name] = records.map(({ record, info }) => ({ file: name, row: info.lines,
        values: Object.fromEntries(headers.flatMap((h, i) => record[i]?.trim() ? [[h, record[i].trim()]] : [])) }));
    } catch (e) {
      const csvError = e as { lines?: number };
      error(name, "Malformed CSV: check quoting, record length and UTF-8 encoding", csvError.lines ?? 1);
    }
  }
  const main = result.mode === "renewal" ? "renewals.csv" : "contracts.csv";
  (result.mode === "renewal" ? [main] : Object.keys(IMPORT_HEADERS).filter(n => n !== "renewals.csv"))
    .forEach(name => { if (!seen.has(name)) error(name, "Missing import table"); });
  if (!result.tables[main]?.length) error(main, "At least one season is required");
  return result;
}
