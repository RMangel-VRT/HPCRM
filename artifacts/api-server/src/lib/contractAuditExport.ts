import archiver from "archiver";
import { PassThrough, type Readable } from "node:stream";
import type { Response } from "express";
import type { AuditData } from "./contractAuditData";
import { MONTHS } from "./contractAuditFiles";
import { ObjectStorageService } from "../objectStorage";
import { companyToday } from "./companyDay";

export function csv(headers: string[], rows: unknown[][]): string {
  const quote = (v: unknown) => {
    let text = v === null || v === undefined ? "" : String(v);
    // RFC quoting does not stop Excel from evaluating cell formulas. Prefix
    // untrusted formula-leading text before quoting, including whitespace/control
    // prefixes. Plain decimal numbers remain usable as money in the audit.
    if (typeof v !== "number" && !/^-?\d+(?:\.\d+)?$/.test(text) &&
        (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)))
      text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
}
export const dollars = (value: number | null | undefined) => value == null ? "" : `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;
const iso = (date: Date | null | undefined) => date?.toISOString() ?? "";
export const legacyDay = (date: Date | null | undefined) => iso(date).slice(0, 10);
export function safeArchiveName(name: string) {
  return name.replace(/[\/\\:*?"<>|\x00-\x1f]/g, "-").trim().slice(0, 120).replace(/^\.+$/, "-") || "unnamed";
}
export function auditBatches(data: AuditData, size: number) {
  const ids = new Set(data.contracts.map(c => c.customerId));
  const sorted = data.customers.filter(c => ids.has(c.id)).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en") || a.id.localeCompare(b.id, "en"));
  return Array.from({ length: Math.ceil(sorted.length / size) }, (_, i) => {
    const group = sorted.slice(i * size, (i + 1) * size);
    const customers = new Set(group.map(c => c.id));
    const contracts = new Set(data.contracts.filter(c => customers.has(c.customerId)).map(c => c.id));
    const docs = data.documents.filter(d => contracts.has(d.contractId));
    return { batch: i + 1, firstName: group[0].name, lastName: group.at(-1)!.name,
      customers: group.length, documents: docs.length, bytes: docs.reduce((n, d) => n + d.fileSize, 0), customerIds: [...customers] };
  });
}
const RATE_COLUMNS = ["generalLabor", "operatorLabor", "irrigationLabor", "emergencyGeneralLabor", "emergencyIrrigationLabor",
  "handShovelLabor", "plowTruck", "atv", "skidSteer", "snowBlower", "iceMeltMaterial", "iceMeltApplicationLabor"] as const;
const snake = (key: string) => key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
export function auditCsvTables(data: AuditData, customerIds: string[]) {
  const ids = new Set(customerIds), customers = data.customers.filter(c => ids.has(c.id));
  const old = data.contracts.filter(c => ids.has(c.customerId)), contractIds = new Set(old.map(c => c.id));
  const documents = data.documents.filter(d => contractIds.has(d.contractId));
  const documentPath = (d: typeof documents[number]) => {
    const customerId = old.find(c => c.id === d.contractId)!.customerId;
    const name = customers.find(c => c.id === customerId)!.name;
    return `documents/${safeArchiveName(name)}/${safeArchiveName(d.id)}__${safeArchiveName(d.filename)}`;
  };
  const agreements = data.agreements.filter(a => ids.has(a.customerId)), agreementIds = new Set(agreements.map(a => a.id));
  const tables: Record<string, string> = {
    "customers.csv": csv(["customer_id", "name", "parent_customer_id", "is_parent", "management_company", "address", "city", "state", "zip", "primary_contact_name", "primary_contact_phone", "primary_contact_email"],
      customers.map(c => { const contact = data.contacts.find(p => p.customerId === c.id && p.isPrimary === "true");
        return [c.id, c.name, c.parentCustomerId, c.isParent, c.managementCompany, c.street, c.city, c.state, c.zip, contact?.name, contact?.phones?.join(";"), contact?.emails?.join(";")]; })),
    "old_contracts.csv": csv("contract_id customer_id customer_name service_type billing_pattern start_date end_date start_raw end_raw status po notes mobilization_fee updated_at".split(" "),
      old.map(c => [c.id, c.customerId, customers.find(r => r.id === c.customerId)?.name, c.serviceType, c.billingPattern,
        legacyDay(c.startDate), legacyDay(c.endDate), iso(c.startDate), iso(c.endDate), c.status, c.po, c.notes, dollars(c.mobilizationFeeAmount), iso(c.updatedAt)])),
    "old_monthly_amounts.csv": csv(["contract_id", "month", "amount"],
      data.amounts.filter(r => contractIds.has(r.contractId)).map(r => [r.contractId, r.month, dollars(r.amount)])),
    "old_services.csv": csv(["contract_id", "service_type", "annual_count", ...MONTHS, "service_parameters"],
      data.services.filter(r => contractIds.has(r.contractId)).map(r => [r.contractId, r.serviceType, r.annualCount,
        ...MONTHS.map((_, i) => r.monthlyDistribution[i] ?? 0), JSON.stringify(r.serviceParameters)])),
    "old_rate_sheets.csv": csv(["customer_id", ...RATE_COLUMNS.map(snake)],
      data.sheets.filter(r => ids.has(r.customerId)).map(r => [r.customerId, ...RATE_COLUMNS.map(k => dollars(r[k]))])),
    "old_documents.csv": csv("document_id contract_id customer_id version filename mime_type file_size uploaded_at zip_path".split(" "),
      documents.map(d => [d.id, d.contractId, old.find(c => c.id === d.contractId)!.customerId, d.version, d.filename, d.mimeType, d.fileSize, iso(d.uploadedAt), documentPath(d)])),
    "contract_center.csv": csv("agreement_id import_ref term_id line form season start end status annual_price".split(" "),
      data.terms.filter(t => agreementIds.has(t.agreementId)).map(t => { const a = agreements.find(a => a.id === t.agreementId)!;
        return [a.id, a.importRef, t.id, a.line, a.form, t.seasonLabel, t.startDate, t.endDate, t.status, dollars(t.annualPriceCents)]; })),
    "rate_card.csv": csv("rate_key line category label price price_text unit minimum active".split(" "),
      data.card.map(r => [r.rateKey, r.line, r.category, r.label, dollars(r.priceCents), r.priceText, r.unit, r.minimum, r.active])),
  };
  return { tables, documents: documents.map(d => ({ document: d, path: documentPath(d) })) };
}

export async function streamAuditExport(res: Response, data: AuditData, batch: number, size: number, documents: boolean,
  appVersion: string, openObject?: (path: string) => Promise<Readable>) {
  const batches = auditBatches(data, size), selected = batches[batch - 1];
  if (!selected) { res.status(400).json({ message: "Batch is outside the available range" }); return; }
  const archive = archiver("zip", { zlib: { level: 6 } });
  const sources = new Set<Readable>();
  let disconnected = false;
  const cleanup = () => { disconnected = true; archive.abort(); for (const stream of sources) stream.destroy(); };
  const close = () => { if (!res.writableFinished) cleanup(); };
  res.once("close", close);
  res.once("error", cleanup);
  const finished = new Promise<void>(resolve => {
    res.once("finish", resolve); res.once("close", resolve); res.once("error", resolve);
  });
  archive.once("error", () => { cleanup(); res.destroy(); });
  archive.on("warning", () => { cleanup(); res.destroy(); });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="contract-audit-batch-${batch}-of-${batches.length}-${companyToday()}.zip"`);
  archive.pipe(res);
  const exportedAt = new Date().toISOString();
  archive.append(JSON.stringify({ exportedAt, batch, batches: batches.length, size, customerIds: selected.customerIds, appVersion }, null, 2), { name: "manifest.json" });
  const contents = auditCsvTables(data, selected.customerIds);
  for (const [name, text] of Object.entries(contents.tables)) archive.append(text, { name });
  const storage = documents && !openObject ? new ObjectStorageService() : null;
  try {
    if (documents) for (const { document, path } of contents.documents) {
      if (disconnected) break;
      // Stage one document stream into the archive. A failed stream becomes a
      // truncated entry plus a diagnostic, never an archive-level stream error.
      let source: Readable | undefined, pass: PassThrough | undefined;
      try {
        source = openObject ? await openObject(document.storageObjectPath)
          : (await storage!.getObjectEntityFile(document.storageObjectPath)).createReadStream();
        if (disconnected) { source.destroy(); break; }
        pass = new PassThrough(); sources.add(source); sources.add(pass);
        archive.append(pass, { name: path });
        // Do not use pipeline here: it destroys the archive input on source failure.
        await new Promise<void>((resolve, reject) => {
          source!.once("error", () => { pass!.end(); reject(new Error("Unreadable object")); });
          source!.once("end", resolve);
          source!.once("close", () => { if (!source!.readableEnded) { pass!.end(); reject(new Error("Object stream closed")); } });
          source!.pipe(pass!);
        });
      } catch {
        if (!disconnected) archive.append(`Document ${document.id} could not be read from storage. Re-check the source document; no stored file was changed.\n`,
          { name: path.slice(0, path.lastIndexOf("/") + 1) + `${safeArchiveName(document.id)}__MISSING.txt` });
      } finally { if (source) { sources.delete(source); source.destroy(); } if (pass) sources.delete(pass); }
    }
    if (!disconnected) await archive.finalize();
    await finished;
  } catch { cleanup(); res.destroy(); }
  finally { res.off("close", close); res.off("error", cleanup); }
}
