import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { createServer, get } from "node:http";
import express from "express";
import request from "supertest";
import archiver from "archiver";
import { parse } from "csv-parse/sync";
import { describe, it, expect, vi } from "vitest";
import { dollarCents, parseAuditFiles, readAuditZip, receiveAuditUpload, type AuditFiles, type UploadFile } from "./contractAuditFiles";
import { planAuditImport, auditReport, signedNoon } from "./contractAuditPlan";
import { auditBatches, auditCsvTables, csv, dollars, legacyDay, safeArchiveName, streamAuditExport } from "./contractAuditExport";
import type { AuditData } from "./contractAuditData";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";
import { registerContractAudit, auditSize } from "../routes/contractAudit";

const templateZip = readFileSync(new URL("../../../../attached_assets/contract-import-template_1791932139984.zip", import.meta.url));
const replacements: Record<string, string> = {
  "<College Hills customer_id>": "customer-a", "<old Maintenance id (the ended one)>": "legacy-a",
  "<new Maintenance id>": "legacy-b", "<Chemical id>": "legacy-c", "<Snow id>": "legacy-d",
};
async function fixture() {
  const entries = await readAuditZip(templateZip);
  const documents = entries.find(f => f.name.endsWith("/documents.csv"))!.data.toString();
  for (const [i, placeholder] of [...new Set(documents.match(/<[^>]+>/g))].entries()) replacements[placeholder] = `doc-${i}`;
  const upload = entries.map(f => ({ ...f, data: Buffer.from(f.data.toString().replace(/<[^>]+>/g, text => replacements[text] ?? text)) }));
  return { files: await parseAuditFiles(upload), upload };
}
function data(): AuditData {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    customers: [{ id: "customer-a", companyId: "company-a", name: "College Hills", isParent: "false", propertyManagementCompanyId: null, street: "Main", city: "Denver", state: "CO", zip: "80000" }],
    contacts: [], contracts: ["legacy-a", "legacy-b", "legacy-c", "legacy-d"].map((id, i) => ({
      id, companyId: "company-a", customerId: "customer-a", serviceType: i === 2 ? "Chemical" : i === 3 ? "Snow" : "Maintenance",
      startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-09-30T06:00:00Z"), updatedAt: now, mobilizationFeeAmount: 1500,
    })),
    amounts: [], services: [], sheets: [],
    documents: [0, 1].map(i => ({ id: `doc-${i}`, companyId: "company-a", contractId: i ? "legacy-b" : "legacy-a",
      version: 1, filename: "signed.pdf", mimeType: "application/pdf", fileSize: 123, uploadedBy: "admin-a",
      uploadedAt: now, storageObjectPath: `/objects/doc-${i}` })),
    agreements: [], terms: [], termDocs: [], history: [], links: [],
    card: RATE_CARD_DEFAULTS.map(({ key, ...rate }, sortOrder) => ({ ...rate, rateKey: key, active: true, sortOrder, companyId: "company-a", id: key })),
  } as unknown as AuditData;
}
function change(files: AuditFiles, file: string, column: string, value: string, index = 0) {
  files.tables[file][index].values[column] = value;
}
async function zip(entries: UploadFile[]) {
  const archive = archiver("zip");
  const chunks: Buffer[] = [];
  archive.on("data", chunk => chunks.push(chunk));
  const end = new Promise<Buffer>((resolve, reject) => { archive.on("end", () => resolve(Buffer.concat(chunks))); archive.on("error", reject); });
  entries.forEach(f => archive.append(f.data, { name: f.name }));
  await archive.finalize();
  return end;
}

describe("audit file boundaries", () => {
  it("enforces the multipart aggregate 10 MB boundary and disallows fields", async () => {
    const app = express();
    app.post("/upload", async (req, res) => {
      try { res.json({ files: (await receiveAuditUpload(req)).length }); }
      catch (error) { res.status(400).json({ message: (error as Error).message }); }
    });
    const oversized = await request(app).post("/upload").attach("files", Buffer.alloc(6 * 1024 * 1024), "contracts.csv")
      .attach("files", Buffer.alloc(5 * 1024 * 1024), "payments.csv");
    expect(oversized.status).toBe(400); expect(oversized.body.message).toContain("10 MB");
    expect((await request(app).post("/upload").field("not-a-file", "bad")).status).toBe(400);
  });
  it.each([["$1,500.00", 150000], ["1645", 164500], ["0.10", 10], ["1,500.00", 150000], ["21474836.47", 2147483647]])("parses %s exactly", (v, n) => expect(dollarCents(v)).toBe(n));
  it.each(["1.005", "-1", "1e3", "1,50", "21474836.48", "NaN", "", "$", ".10"])("rejects money %s", v => expect(() => dollarCents(v)).toThrow());
  it("accepts the supplied nested template and diagnoses unfilled placeholders", async () => {
    const files = await parseAuditFiles([{ name: "template.zip", data: templateZip }]);
    expect(files.errors).toEqual([]);
    expect(planAuditImport(files, data()).errors.some(e => e.message.includes("placeholder"))).toBe(true);
  });
  it("rejects unknown columns, duplicate data files, missing tables and malformed CSV", async () => {
    const { upload } = await fixture();
    const unknown = await parseAuditFiles(upload.map(f => f.name.endsWith("payments.csv") ? { ...f, data: Buffer.from("contract_ref,payment_line,bogus\na,A,2") } : f));
    expect(unknown.errors.some(e => e.column === "bogus")).toBe(true);
    expect((await parseAuditFiles([...upload, upload[1]])).errors.some(e => e.message.includes("Duplicate"))).toBe(true);
    expect((await parseAuditFiles([{ name: "contracts.csv", data: Buffer.from('contract_ref\n"unterminated') }])).errors.some(e => e.message.includes("Malformed"))).toBe(true);
    expect((await parseAuditFiles([{ name: "unknown.csv", data: Buffer.alloc(0) }])).errors.some(e => e.message.includes("Unsupported"))).toBe(true);
  });
  it("rejects unsafe paths, too many entries and expanded ZIP bombs", async () => {
    // Archiver sanitizes traversal; alter equal-length central/local paths afterwards.
    const safe = await zip([{ name: "aa/contracts.csv", data: Buffer.from("x") }]);
    const malicious = Buffer.from(safe.toString("latin1").replaceAll("aa/contracts.csv", "../contracts.csv"), "latin1");
    await expect(readAuditZip(malicious)).rejects.toThrow();
    await expect(readAuditZip(await zip(Array.from({ length: 21 }, (_, i) => ({ name: `${i}.csv`, data: Buffer.from("x") }))))).rejects.toThrow("file-count");
    await expect(readAuditZip(await zip([{ name: "contracts.csv", data: Buffer.alloc(31 * 1024 * 1024) }]))).rejects.toThrow("expanded-size");
  });
});

describe("audit planner canonical rules", () => {
  it("uses unchanged worked business values and exact annual/billing totals", async () => {
    const { files } = await fixture();
    const plan = planAuditImport(files, data());
    expect(plan.errors).toEqual([]);
    const terms = plan.customers[0].agreements[0].terms;
    expect(terms.map(t => t.values.annualPriceCents)).toEqual([1950000, 4151500]);
    expect(terms[1].billing.filter(b => b.component === "Grounds maintenance")).toHaveLength(18);
    expect(terms[1].billing.filter(b => b.component === "Chemical")).toHaveLength(13);
    expect(terms[1].billing.some(b => b.month === "2026-03-01")).toBe(false);
    expect(terms[1].values.status).toBe("sent");
    expect(terms[1].values.needsReview).toBe(true);
    expect(terms[1].renewsRef).toBe(terms[0].contractRef);
    expect(auditReport(plan, true).summary).toMatchObject({ customers: 1, agreements: 1, terms: 2, errors: 0 });
  });
  it.each([
    ["contracts.csv", "customer_id", "outside", "Unknown customer"],
    ["contracts.csv", "start_date", "2026-02-30", "date"],
    ["contracts.csv", "start_date", "", "Required"],
    ["contracts.csv", "line", "unknown", "Unknown line"],
    ["contracts.csv", "form", "unknown", "Unknown form"],
    ["contracts.csv", "status", "unknown", "Unknown status"],
    ["contracts.csv", "signed_date", "2026-02-30", "date"],
    ["contracts.csv", "needs_review", "yes", "true or false"],
    ["contracts.csv", "snow_pricing", "bad", "pricing"],
    ["contracts.csv", "renews_ref", "college-hills-2026-27", "earlier"],
    ["contracts.csv", "legacy_contract_ids", "other", "legacy"],
    ["payments.csv", "contract_ref", "missing", "Unknown contract_ref"],
    ["payments.csv", "jan", "1.005", "decimal"],
    ["rates.csv", "rate_key", "off_card", "custom_"],
    ["rates.csv", "rate_key", "custom_new", "require"],
    ["scope.csv", "service_key", "missing", "scope"],
    ["scope.csv", "quantity", "-1", "integer"],
    ["scope.csv", "included", "yes", "true or false"],
    ["documents.csv", "document_id", "other", "document"],
    ["documents.csv", "kind", "unknown", "kind"],
  ])("diagnoses %s %s", async (file, column, value, expected) => {
    const { files } = await fixture(); change(files, file, column, value);
    const errors = planAuditImport(files, data()).errors;
    expect(errors.some(e => e.file === file && e.row && e.message.toLowerCase().includes(expected.toLowerCase()))).toBe(true);
  });
  it("accepts differing seasonal forms within one customer's agreement", async () => {
    const { files } = await fixture();
    const rows = files.tables["contracts.csv"];
    rows[0].values.form = "theirs"; rows[1].values.form = "ours";
    const plan = planAuditImport(files, data());
    expect(plan.errors).toEqual([]);
    expect(plan.customers[0].agreements[0].terms.map(t => t.values.form)).toEqual(["theirs", "ours"]);
  });
  it("checks duplicate refs and inconsistent agreements without rejecting parents", async () => {
    const { files } = await fixture();
    change(files, "contracts.csv", "contract_ref", "college-hills-2025-26", 1);
    change(files, "contracts.csv", "form", "ours", 1);
    const d = data(); d.customers[0].isParent = "true";
    const messages = planAuditImport(files, d).errors.map(e => e.message);
    expect(messages.some(m => m.includes("Duplicate"))).toBe(true);
    // Different seasonal forms are valid; only the customer must agree.
    expect(messages.some(m => m.includes("agree"))).toBe(false);
    expect(messages.some(m => m.includes("Parent"))).toBe(false);
  });
  it("rejects zero-valued payment rows for snow T&M and invalid child refs", async () => {
    const { files } = await fixture();
    files.tables["contracts.csv"].forEach(r => r.values.line = "snow");
    files.tables["payments.csv"].forEach(r => Object.keys(r.values).filter(k => !["contract_ref", "payment_line"].includes(k)).forEach(k => r.values[k] = "0"));
    expect(planAuditImport(files, data()).errors.some(e => e.message.includes("no payment rows"))).toBe(true);
  });
  it("rejects duplicated and cross-customer sources/documents and outside linked agreements", async () => {
    const { files } = await fixture();
    change(files, "contracts.csv", "legacy_contract_ids", "legacy-a", 1);
    change(files, "documents.csv", "document_id", "doc-0", 1);
    const d = data();
    d.links.push({ termId: "outside", legacyContractId: "legacy-a" } as AuditData["links"][number]);
    d.contracts.find(c => c.id === "legacy-a")!.customerId = "other";
    const errors = planAuditImport(files, d).errors.map(e => e.message);
    expect(errors.some(m => m.includes("outside"))).toBe(true);
    expect(errors.some(m => m.includes("Legacy contract used"))).toBe(true);
    expect(errors.some(m => m.includes("Document used"))).toBe(true);
    expect(errors.some(m => m.includes("cross-customer"))).toBe(true);
  });
  it("preserves blank card overrides, no scope and custom scope details", async () => {
    const { files } = await fixture();
    const row = files.tables["rates.csv"][0]; delete row.values.price;
    files.tables["scope.csv"] = [];
    const plan = planAuditImport(files, data());
    expect(plan.errors).toEqual([]);
    const term = plan.customers[0].agreements[0].terms[0];
    const rate = term.rates.find(r => r.rateKey === row.values.rate_key)!;
    expect(rate.priceCents).toBe(rate.cardPriceCents);
    expect(term.scope).toEqual([]);
  });
  it("blocks replacement of Contract Center-created seasons and newly attached documents", async () => {
    const { files } = await fixture(); const d = data();
    d.agreements.push({ id: "existing", customerId: "customer-a", importRef: "college-hills" } as AuditData["agreements"][number]);
    d.terms.push({ id: "manual-renewal", agreementId: "existing", seasonLabel: "2027–28" } as AuditData["terms"][number]);
    expect(planAuditImport(files, d).errors.some(e => e.message.includes("created in Contract Center"))).toBe(true);
    d.history.push({ termId: "manual-renewal", oldStatus: null, note: "Imported from audit (old.zip)", createdAt: new Date("2026-01-01") } as AuditData["history"][number]);
    d.terms[0].updatedAt = new Date("2026-01-01");
    const legacy = d.documents[0];
    d.termDocs.push({ ...legacy, id: "imported-doc", termId: "manual-renewal", createdAt: legacy.uploadedAt, kind: "signed", masterId: null });
    expect(planAuditImport(files, d).errors).toEqual([]);
    d.termDocs.push({ ...d.termDocs[0], id: "manual-doc", filename: "new signed document.pdf", storageObjectPath: "/objects/new" });
    expect(planAuditImport(files, d).errors.some(e => e.message.includes("attached in Contract Center") && e.row && e.column === "agreement_ref")).toBe(true);
  });
  it("warns for mismatch, overlap, scope, untouched contracts, source drift, uncovered contracts and edits", async () => {
    const { files } = await fixture(); const d = data();
    change(files, "contracts.csv", "customer_name", "Wrong name");
    change(files, "contracts.csv", "status", "signed");
    change(files, "contracts.csv", "end_date", "2026-05-01");
    change(files, "scope.csv", "quantity", "999");
    files.manifest = { exportedAt: "2025-01-01T00:00:00Z" };
    change(files, "contracts.csv", "legacy_contract_ids", "legacy-b;legacy-c", 1);
    d.agreements.push({ id: "untouched", customerId: "customer-a", importRef: null } as AuditData["agreements"][number],
      { id: "replaced", customerId: "customer-a", importRef: "college-hills" } as AuditData["agreements"][number]);
    d.terms.push({ id: "edited", agreementId: "replaced", updatedAt: new Date("2026-02-01"), seasonLabel: "2025" } as AuditData["terms"][number]);
    d.history.push({ termId: "edited", createdAt: new Date("2026-01-01"), note: "Imported from audit (old.zip)" } as AuditData["history"][number]);
    const warnings = planAuditImport(files, d).warnings;
    for (const text of ["name", "overlap", "distribution", "no import_ref", "Changed in the old system", "isn't covered", "edited after"])
      expect(warnings.some(w => w.message.includes(text))).toBe(true);
    expect(warnings.every(w => w.file && w.row)).toBe(true);
  });
  it("maps active to signed and stores noon Colorado with DST", async () => {
    expect(signedNoon("2026-01-15").toISOString()).toBe("2026-01-15T19:00:00.000Z");
    expect(signedNoon("2026-07-15").toISOString()).toBe("2026-07-15T18:00:00.000Z");
    const { files } = await fixture(); change(files, "contracts.csv", "status", "active");
    expect(planAuditImport(files, data()).customers[0].agreements[0].terms[0].values.status).toBe("signed");
  });
});

describe("audit exports and routes", () => {
  it("neutralizes Excel formulas in every text cell while retaining IDs and decimal money", () => {
    const formula = '=HYPERLINK("https://example.invalid/leak","open")';
    const d = data(); d.customers[0].name = formula;
    d.contracts[0].notes = "\t=1+1";
    const exported = auditCsvTables(d, ["customer-a"]).tables;
    const decoded = (text: string) => parse(text, { columns: true }) as Record<string, string>[];
    const customers = decoded(exported["customers.csv"]);
    const contracts = decoded(exported["old_contracts.csv"]);
    expect(customers[0].name).toBe(`'${formula}`);
    expect(customers[0].customer_id).toBe("customer-a");
    expect(contracts[0].notes).toBe("'\t=1+1");
    for (const text of [formula, "+HYPERLINK(\"https://example.invalid\")", "-1+WEBSERVICE(\"https://example.invalid\")",
      "@SUM(1,2)", "  =1+1", "\r=1+1", "\t=1+1"]) {
      expect(decoded(csv(["value"], [[text]]))[0].value).toBe(`'${text}`);
    }
    expect(decoded(csv(["id", "amount", "credit"], [["legacy-a", "19500.00", "-1.50"]]))[0])
      .toEqual({ id: "legacy-a", amount: "19500.00", credit: "-1.50" });
    expect(dollars(-150)).toBe("-1.50");
  });
  it("stable case-insensitive name/id batches, eight tables and UTC/raw dates", () => {
    const d = data();
    d.customers.push({ ...d.customers[0], id: "customer-b", name: "alpha" }, { ...d.customers[0], id: "customer-c", name: "ALPHA" });
    d.contracts.push({ ...d.contracts[0], id: "b", customerId: "customer-b" }, { ...d.contracts[0], id: "c", customerId: "customer-c" });
    expect(auditBatches(d, 1).map(b => b.customerIds[0])).toEqual(["customer-b", "customer-c", "customer-a"]);
    expect(legacyDay(new Date("2026-04-01T00:00:00Z"))).toBe("2026-04-01");
    const tables = auditCsvTables(d, ["customer-a"]).tables;
    expect(Object.keys(tables)).toHaveLength(8);
    expect(tables["old_contracts.csv"]).toContain("2026-04-01T00:00:00.000Z");
    expect(tables["old_contracts.csv"]).toContain("15.00");
    expect(csv(["name"], [['a,"b"\nc']])).toBe('name\r\n"a,""b""\nc"\r\n');
    expect(safeArchiveName("../a/b:*?")).not.toMatch(/[\/:*?]/);
  });
  it("streams metadata-only and recovers unreadable objects without revealing exception text", async () => {
    for (const documents of [false, true]) {
      const app = express(); const open = vi.fn(async () => Readable.from((async function* () { throw new Error("secret credentials"); })()));
      app.get("/export", async (_req, res) => streamAuditExport(res, data(), 1, 10, documents, "test", open));
      const response = await request(app).get("/export").buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      expect(response.status).toBe(200);
      const entries = await readAuditZip(response.body);
      expect(entries.some(e => e.name === "manifest.json")).toBe(true);
      expect(entries.filter(e => e.name.endsWith(".csv"))).toHaveLength(8);
      if (documents) {
        expect(entries.filter(e => e.name.endsWith("__MISSING.txt"))).toHaveLength(2);
        expect(entries.map(e => e.data.toString()).join("")).not.toContain("secret credentials");
      } else expect(open).not.toHaveBeenCalled();
    }
  });
  it("destroys storage streams and finishes work when the download disconnects", async () => {
    let source!: Readable;
    let markOpened!: () => void;
    const opened = new Promise<void>(done => { markOpened = done; });
    let markCompleted!: () => void;
    const completed = new Promise<void>(done => { markCompleted = done; });
    const server = createServer((_req, res) => {
      const open = async () => {
        source = new Readable({ read() {} }); markOpened();
        return source;
      };
      void streamAuditExport(res as unknown as express.Response, data(), 1, 10, true, "test", open).finally(markCompleted);
    });
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    const port = (server.address() as { port: number }).port;
    const download = get(`http://127.0.0.1:${port}/`, res => res.resume());
    download.on("error", () => {});
    try {
      await opened; download.destroy();
      await Promise.race([completed, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Export did not release disconnected streams")), 1500))]);
      expect(source.destroyed).toBe(true);
    } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  });
  it("streams every version's original bytes under sanitized document-ID filenames", async () => {
    const d = data();
    d.customers[0].name = "../../Bad:Name" + "x".repeat(200);
    d.documents[0].filename = "../signed.pdf";
    const content = Buffer.from("%PDF-fixture-original");
    const app = express();
    app.get("/export", async (_req, res) => streamAuditExport(res, d, 1, 10, true, "test", async () => Readable.from([content])));
    const response = await request(app).get("/export").buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    const docs = (await readAuditZip(response.body)).filter(f => f.name.startsWith("documents/"));
    expect(docs).toHaveLength(2);
    docs.forEach((doc, i) => {
      expect(doc.name.split("/")[1].length).toBeLessThanOrEqual(120);
      expect(doc.name.split("/")[2]).toMatch(new RegExp(`^doc-${i}__`));
      expect(doc.data.equals(content)).toBe(true);
    });
  });
  it.each(["office", "field", "mapping"])("forbids %s before DB/upload work", async role => {
    const app = express();
    registerContractAudit(app, (_req, res) => { res.status(403).json({ message: `Forbidden ${role}` }); return null; });
    for (const route of ["/audit-export/batches", "/audit-export"])
      expect((await request(app).get(`/api/admin/contract-center${route}`)).status).toBe(403);
    expect((await request(app).post("/api/admin/contract-center/import")).status).toBe(403);
  });
  it.each(["0", "51", "1.5", "no"])("rejects batch size %s", size => expect(() => auditSize(size)).toThrow());
});
