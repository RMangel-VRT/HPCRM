import { describe, it, expect, vi } from "vitest";
import archiver from "archiver";
import { parse } from "csv-parse/sync";
vi.mock("../db", () => ({ db: {} }));
vi.mock("../objectStorage", () => ({ ObjectStorageService: class {} }));
import { parseAuditFiles, readAuditZip, PDF_LIMIT, type UploadFile, type AuditFiles } from "./contractAuditFiles";
import { planRenewalImport, renewalReport } from "./contractRenewalPlan";
import { currentCsvTables, auditCsvTables, SEASON_COLUMNS, streamCurrentExport } from "./contractAuditExport";
import { renewalRates, expandPayments } from "./contractCenterService";
import type { AuditData } from "./contractAuditData";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";
import { listSummary } from "./contractCenterPersistence";
import express from "express";
import request from "supertest";

const file = (name: string, text: string | Buffer): UploadFile => ({ name, data: Buffer.isBuffer(text) ? text : Buffer.from(text) });
const main = (extra = "") => file("renewals.csv", "contract_ref,renews_term_id,start_date,end_date,status,signed_date" + extra +
  "\nr,source,2026-11-01,2027-10-31,signed,2026-10-14");
const payment = file("payments.csv", "contract_ref,payment_line,jan,feb\nr,Grounds maintenance,100.01,200.02");
const pdf = file("files/signed.pdf", "%PDF-1.4\n%%EOF");
const docs = file("documents.csv", "contract_ref,file,kind\nr,files/signed.pdf,signed");
async function zip(entries: UploadFile[]) {
  const a = archiver("zip"), chunks: Buffer[] = [];
  const end = new Promise<Buffer>((resolve, reject) => {
    a.on("data", c => chunks.push(c)); a.on("end", () => resolve(Buffer.concat(chunks))); a.on("error", reject);
  });
  entries.forEach(f => a.append(f.data, { name: f.name })); await a.finalize(); return end;
}
async function input(extra: UploadFile[] = []) {
  return parseAuditFiles([file("renewal.zip", await zip([main(), payment, docs, pdf, ...extra]))]);
}
function data(): AuditData {
  const now = new Date("2025-01-01T00:00:00Z");
  const card = RATE_CARD_DEFAULTS.map(({ key, ...r }, sortOrder) => ({ ...r, rateKey: key, sortOrder,
    id: key, companyId: "company", active: true, createdAt: now, updatedAt: now }));
  const source = { id: "source", companyId: "company", agreementId: "agreement", seasonLabel: "2025–26",
    startDate: "2025-11-01", endDate: "2026-10-31", status: "signed", renewedFromTermId: null,
    legalName: "Source legal name", projectContact: "Source contact", notes: "Source notes",
    snowPricing: null, snowFlatPriceCents: null, createdAt: now, updatedAt: now, signedAt: now };
  return { customers: [{ id: "customer", companyId: "company", name: "Ute Creek", isParent: "false" }],
    agreements: [{ id: "agreement", companyId: "company", customerId: "customer", line: "landscape", form: "ours", importRef: "keep-me" }],
    terms: [source], card, scope: [{ id: "scope", termId: "source", companyId: "company", serviceKey: "other:custom",
      line: "landscape", included: true, quantity: 12, monthSpread: Array(12).fill(1), details: { label: "Source custom" }, sortOrder: 5 }],
    rates: card.slice(0, 2).map(c => ({ ...c, termId: "source", cardPriceCents: c.priceCents, cardPriceText: c.priceText })),
    billing: expandPayments([{ component: "Old pattern", months: [{ month: 11, amountCents: 12345 }] }], source.startDate, source.endDate)
      .map(b => ({ ...b, termId: source.id })),
    termDocs: [], history: [], contracts: [], contacts: [], documents: [], links: [], amounts: [], services: [], sheets: [],
  } as unknown as AuditData;
}
function addRenewal(d: AuditData, status: string, imported = false) {
  d.terms.push({ ...d.terms[0], id: "existing", renewedFromTermId: "source", status,
    startDate: "2026-11-01", endDate: "2027-10-31" } as AuditData["terms"][number]);
  if (imported) d.history.push({ termId: "existing", oldStatus: null, note: "Imported signed renewal (old.zip)" } as AuditData["history"][number]);
}
describe("renewal upload boundaries", () => {
  it("accepts renewal ZIP PDFs and CSV-only renewals without requiring optional tables", async () => {
    const f = await input(); expect(f.errors).toEqual([]); expect(f.mode).toBe("renewal"); expect(f.pdfs?.[pdf.name]).toEqual(pdf.data);
    expect((await parseAuditFiles([main(), payment])).errors).toEqual([]);
  });
  it("rejects both main tables with the exact error", async () => {
    const f = await input([file("contracts.csv", "contract_ref\nx")]);
    expect(f.errors.map(e => e.message)).toEqual(["Import either contracts.csv or renewals.csv, not both."]);
  });
  it.each(["files/../evil.pdf", "/files/evil.pdf", "files\\evil.pdf", "files//evil.pdf", "files/./evil.pdf", "C:/evil.pdf"])("rejects unsafe complete paths: %s", async name => {
    const f = await parseAuditFiles([main(), file(name, pdf.data)]);
    expect(f.errors.some(e => /[Uu]nsafe/.test(e.message))).toBe(true);
  });
  it.each(["outside.pdf", "nested/files/a.pdf", "files/a.exe"])("rejects unsupported PDF locations/files: %s", async name => {
    expect((await input([file(name, pdf.data)])).errors.length).toBeGreaterThan(0);
  });
  it("rejects non-PDF bytes, loose PDFs, oversized PDFs, duplicate tables and legacy document IDs", async () => {
    expect((await input([file("files/fake.pdf", "not PDF")])).errors[0].message).toMatch(/Invalid PDF/);
    expect((await parseAuditFiles([main(), pdf])).errors[0].message).toMatch(/inside the ZIP/);
    const huge = Buffer.alloc(PDF_LIMIT + 1); huge.write("%PDF-");
    expect((await input([file("files/large.pdf", huge)])).errors[0].message).toMatch(/15 MB/);
    expect((await input([file("nested/payments.csv", payment.data)])).errors[0].message).toMatch(/Duplicate/);
    const legacy = await parseAuditFiles([main(), file("documents.csv", "contract_ref,document_id,kind\nr,old,signed")]);
    expect(legacy.errors.some(e => e.column === "document_id")).toBe(true);
  });
  it("keeps strict CSV validation with file and row diagnostics", async () => {
    for (const text of ["contract_ref,contract_ref\nr,r", "unknown\nx", 'contract_ref\n"unterminated', "contract_ref\nr,extra"]) {
      const f = await parseAuditFiles([file("renewals.csv", text)]);
      expect(f.errors.every(e => e.file === "renewals.csv" && e.row)).toBe(true); expect(f.errors.length).toBeGreaterThan(0);
    }
    expect((await parseAuditFiles([file("renewals.csv", Buffer.from([0xff]))])).errors[0].message).toMatch(/Malformed/);
  });
  it("enforces 40MB uploaded, 60MB expanded, 60 entries, preserving audit bounds", async () => {
    const huge = await parseAuditFiles([main(), file("payments.csv", Buffer.alloc(40 * 1024 * 1024))]);
    expect(huge.errors[0].message).toBe("Upload exceeds 40 MB");
    const entries = Array.from({ length: 60 }, (_, i) => file(`files/${i}.pdf`, pdf.data));
    expect((await input(entries)).errors[0].message).toMatch(/file-count/);
    const expanded = [main(), ...Array.from({ length: 4 }, (_, i) => file(`files/${i}.pdf`,
      Buffer.concat([pdf.data, Buffer.alloc(15 * 1024 * 1024 - pdf.data.length)]))), file("README.md", "exceeds")];
    expect((await parseAuditFiles([file("big.zip", await zip(expanded))])).errors[0].message).toMatch(/expanded/);
    const audit = await parseAuditFiles([file("contracts.csv", "contract_ref\nx"), file("README.md", Buffer.alloc(10 * 1024 * 1024))]);
    expect(audit.errors[0].message).toBe("Upload exceeds 10 MB");
    await expect(readAuditZip(await zip(entries.slice(0, 21)))).rejects.toThrow(/file-count/);
  });
  it("accepts exactly 60 entries and a 15MB PDF", async () => {
    const large = Buffer.alloc(PDF_LIMIT); large.write("%PDF-1.4");
    const f = await parseAuditFiles([file("boundary.zip", await zip([main(), file("files/large.pdf", large),
      ...Array.from({ length: 58 }, (_, i) => file(`folder${i}/README.md`, ""))]))]);
    expect(f.errors).toEqual([]); expect(f.pdfs?.["files/large.pdf"].length).toBe(PDF_LIMIT);
  });
  it.each(["symlink", "encrypted", "size-lie"])("rejects %s ZIP entries before planning", async kind => {
    const bytes = await zip([main(), pdf]);
    for (let i = 0; i < bytes.length - 46; i++) if (bytes.readUInt32LE(i) === 0x02014b50) {
      if (kind === "symlink") bytes.writeUInt32LE((0xa1ff << 16) >>> 0, i + 38);
      if (kind === "encrypted") bytes.writeUInt16LE(bytes.readUInt16LE(i + 8) | 1, i + 8);
      if (kind === "size-lie") bytes.writeUInt32LE(1, i + 24);
      break;
    }
    const f = await parseAuditFiles([file("unsafe.zip", bytes)]);
    expect(f.errors.length).toBeGreaterThan(0);
  });
});
describe("renewal preview validation and carry-forward", () => {
  it("preserves source fields, rates and exact scope without any automatic increase", async () => {
    const f = await input(), d = data(); f.tables["renewals.csv"][0].values.renewal_increase_pct = "3.00";
    const before = structuredClone(d), p = planRenewalImport(f, d), t = p.customers[0].terms[0];
    expect(p.errors).toEqual([]); expect(p.warnings).toEqual([]); expect(d).toEqual(before);
    expect(t.values).toMatchObject({ legalName: "Source legal name", projectContact: "Source contact",
      notes: "Source notes", annualPriceCents: 30003, renewalIncreasePct: "3.00",
      signedAt: new Date("2026-10-14T18:00:00Z") });
    expect(t.rates).toEqual(renewalRates(d.rates, d.card, "landscape").rates);
    expect(t.scope).toEqual(d.scope.map(({ id, termId, companyId, ...s }) => s));
    expect(t.billing.map(b => b.amountCents)).toEqual([10001, 20002]);
    expect(renewalReport(p, true)).toMatchObject({ mode: "renewal", dryRun: true, summary: { terms: 1, replaced: 0 } });
  });
  it("overrides only supplied cells of one rate, including a partial custom rate", async () => {
    const f = await input(), d = data(), key = d.rates[0].rateKey;
    d.rates.push({ ...d.rates[0], rateKey: "custom_ice", label: "Ice", priceCents: 29500, priceText: null,
      cardPriceCents: null, cardPriceText: null });
    f.tables["rates.csv"] = [{ file: "rates.csv", row: 2, values: { contract_ref: "r", rate_key: key, price: "123.45" } },
      { file: "rates.csv", row: 3, values: { contract_ref: "r", rate_key: "custom_ice", price: "299" } }];
    const p = planRenewalImport(f, d); expect(p.errors).toEqual([]);
    const expected = renewalRates(d.rates, d.card, "landscape").rates.map(r =>
      r.rateKey === key ? { ...r, priceCents: 12345 } : r.rateKey === "custom_ice" ? { ...r, priceCents: 29900 } : r);
    expect(p.customers[0].terms[0].rates).toEqual(expected);
  });
  it("replaces all scope when rows are supplied and warns on mismatching distribution", async () => {
    const f = await input(); f.tables["scope.csv"] = [{ file: "scope.csv", row: 2, values: {
      contract_ref: "r", service_key: "other:new", label: "New", included: "true", quantity: "2", jan: "1" } }];
    const p = planRenewalImport(f, data()); expect(p.errors).toEqual([]);
    expect(p.customers[0].terms[0].scope).toHaveLength(1);
    expect(p.customers[0].terms[0].scope[0].serviceKey).toBe("other:new");
    expect(p.warnings[0]).toMatchObject({ file: "scope.csv", row: 2, column: "quantity" });
  });
  it.each([
    ["contract_ref", "", "Required"], ["renews_term_id", "foreign", "Unknown renewal source"],
    ["start_date", "2025-11-01", "after the source"], ["start_date", "2026-02-30", "Invalid"],
    ["end_date", "2026-01-01", "dates"], ["status", "active", "draft, sent or signed"],
    ["signed_date", "", "require signed_date"], ["signed_date", "not-date", "Invalid"],
    ["needs_review", "yes", "true or false"], ["snow_pricing", "flat_rate", "Landscape"],
    ["snow_flat_price", "1.001", "two decimal"], ["renewal_increase_pct", "foo", "percentage"],
    ["renewal_increase_pct", "1000", "percentage"],
  ])("reports row context for %s=%s", async (column, value, message) => {
    const f = await input(); f.tables["renewals.csv"][0].values[column] = value;
    const p = planRenewalImport(f, data());
    expect(p.errors.some(e => e.file === "renewals.csv" && e.row === 2 && e.message.toLowerCase().includes(message.toLowerCase()))).toBe(true);
  });
  it.each(["lost", "cancelled"])("rejects %s sources", async status => {
    const d = data(); d.terms[0].status = status as typeof d.terms[0]["status"];
    expect(planRenewalImport(await input(), d).errors[0]).toMatchObject({ file: "renewals.csv", row: 2, column: "renews_term_id" });
  });
  it.each(["signed", "active", "renewed", "draft", "sent"])("rejects existing %s renewals", async status => {
    const d = data(); addRenewal(d, status);
    const p = planRenewalImport(await input(), d);
    expect(p.errors[0]).toMatchObject({ file: "renewals.csv", row: 2 });
    if (["draft", "sent"].includes(status)) expect(p.errors[0].message).toBe("A draft or sent renewal already exists; cancel it in the Contract Center first, or import this as its replacement next time");
  });
  it("recognizes already-imported history before conflicting-renewal checks", async () => {
    const d = data(); addRenewal(d, "signed", true); addRenewal(d, "draft");
    const p = planRenewalImport(await input(), d);
    expect(p.errors).toEqual([]); expect(p.warnings[0]).toMatchObject({ file: "renewals.csv", row: 2, message: "Already imported; skipped" });
    expect(renewalReport(p, true).summary.terms).toBe(0);
    d.history[0].note = "Created normally"; expect(planRenewalImport(await input(), d).errors.length).toBeGreaterThan(0);
  });
  it("rejects parent customers and duplicate refs/source IDs", async () => {
    const f = await input(), d = data(); d.customers[0].isParent = "true";
    const duplicate = structuredClone(f.tables["renewals.csv"][0]); duplicate.row = 3; f.tables["renewals.csv"].push(duplicate);
    const errors = planRenewalImport(f, d).errors;
    for (const message of ["Parent", "Duplicate contract_ref", "Two rows"])
      expect(errors.some(e => e.file === "renewals.csv" && e.row && e.message.includes(message))).toBe(true);
  });
  it("warns for gap/overlap, name mismatch and missing signed attachment with source context", async () => {
    const f = await input(); const v = f.tables["renewals.csv"][0].values;
    v.start_date = "2026-10-30"; v.customer_name = "Wrong"; f.tables["documents.csv"] = [];
    const p = planRenewalImport(f, data()); expect(p.errors).toEqual([]);
    expect(p.warnings).toHaveLength(3); expect(p.warnings.every(w => w.file === "renewals.csv" && w.row === 2)).toBe(true);
    expect(p.warnings[0].message).toContain("2025–26: 2025-11-01 – 2026-10-31");
  });
  it("requires new payments except for snow-only T&M, carrying snow values unchanged", async () => {
    const f = await input(), d = data(); f.tables["payments.csv"] = [];
    expect(planRenewalImport(f, d).errors.some(e => e.message.includes("Payments must"))).toBe(true);
    d.agreements[0].line = "snow"; d.terms[0].snowPricing = "time_and_materials";
    expect(planRenewalImport(f, d).errors).toEqual([]);
    d.terms[0].snowPricing = "flat_rate"; d.terms[0].snowFlatPriceCents = 12345;
    f.tables["payments.csv"] = [{ file: "payments.csv", row: 2, values: { contract_ref: "r", payment_line: "Snow", jan: "100" } }];
    expect(planRenewalImport(f, d).customers[0].terms[0].values.snowFlatPriceCents).toBe(12345);
    d.terms[0].snowPricing = "time_and_materials"; d.terms[0].snowFlatPriceCents = null;
    f.tables["payments.csv"][0].values.jan = "0";
    expect(planRenewalImport(f, d).errors.some(e => e.file === "payments.csv" && e.row === 2)).toBe(true);
  });
  it.each([
    ["payments.csv", { payment_line: "Pay", jan: "1.001" }, "two decimal"],
    ["payments.csv", { payment_line: "" }, "Required"],
    ["scope.csv", { service_key: "unknown", included: "true" }, "scope"],
    ["scope.csv", { service_key: "other:bad space", included: "true" }, "slug"],
    ["scope.csv", { service_key: "other:ok", label: "Okay", included: "true", quantity: "-1" }, "integer"],
    ["rates.csv", { rate_key: "unknown", price: "100" }, "custom_"],
    ["rates.csv", { rate_key: "custom_new", price: "100" }, "Custom rates require"],
    ["documents.csv", { file: "files/missing.pdf", kind: "signed" }, "PDF"],
    ["documents.csv", { file: "files/signed.pdf", kind: "bad" }, "kind"],
  ])("reports child error %s", async (name, values, message) => {
    const f = await input(); f.tables[name] = [{ file: name, row: 3, values: { contract_ref: "r", ...values } }];
    expect(planRenewalImport(f, data()).errors.some(e => e.file === name && e.row === 3 && e.message.includes(message))).toBe(true);
  });
  it("checks orphan child refs and duplicate child keys", async () => {
    const f = await input(); f.tables["payments.csv"].push({ ...f.tables["payments.csv"][0], row: 3 });
    expect(planRenewalImport(f, data()).errors.some(e => e.file === "payments.csv" && e.message.includes("Duplicate payment"))).toBe(true);
    f.tables["payments.csv"][1].values = { contract_ref: "unknown", payment_line: "Pay", jan: "100" };
    expect(planRenewalImport(f, data()).errors.some(e => e.file === "payments.csv" && e.row === 3 && e.message === "Unknown contract_ref")).toBe(true);
  });
});
describe("current export", () => {
  it("shares exact season columns with audit and exports every term, first-year patterns and only rate differences", () => {
    const d = data(); addRenewal(d, "signed");
    d.rates[0].priceCents = 11111;
    const tables = currentCsvTables(d), rows = parse(tables["contract_center.csv"], { columns: true }) as Record<string, string>[];
    expect(Object.keys(rows[0])).toEqual(SEASON_COLUMNS); expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ customer_id: "customer", customer_name: "Ute Creek", import_ref: "keep-me", term_id: "source", documents: "0" });
    expect(parse(auditCsvTables(d, ["customer"]).tables["contract_center.csv"])[0]).toEqual(SEASON_COLUMNS);
    expect((parse(tables["term_payments.csv"], { columns: true }) as Record<string, string>[])[0]).toMatchObject({ term_id: "source", nov: "123.45", jan: "0.00" });
    const rates = parse(tables["term_rates.csv"], { columns: true }) as Record<string, string>[]; expect(rates).toHaveLength(1);
    expect(rates[0].price).toBe("111.11"); expect(Object.keys(tables)).toHaveLength(4);
  });
  it("sorts customer/name then season date and exports parent, history links, document counts and read-time status", () => {
    const d = data(); addRenewal(d, "signed");
    d.customers.push({ ...d.customers[0], id: "parent", name: "Parent office" });
    d.customers[0].parentCustomerId = "parent";
    d.customers.push({ ...d.customers[0], id: "a", name: "=A customer" });
    d.agreements.push({ ...d.agreements[0], id: "a-agreement", customerId: "a" });
    d.terms.push({ ...d.terms[0], id: "a-term", agreementId: "a-agreement", startDate: "2024-01-01", endDate: "2024-12-31" });
    d.termDocs.push({ termId: "source" } as AuditData["termDocs"][number]);
    const rows = parse(currentCsvTables(d)["contract_center.csv"], { columns: true }) as Record<string, string>[];
    expect(rows.map(r => r.term_id)).toEqual(["a-term", "source", "existing"]);
    expect(rows[0].customer_name).toBe("'=A customer");
    expect(rows[0].display_status).toBe("expired");
    expect(rows[1]).toMatchObject({ parent_customer_name: "Parent office", documents: "1" });
    expect(rows[2].renewed_from_term_id).toBe("source");
    expect(rows[2].signed_at).toBe("2025-01-01T00:00:00.000Z");
  });
  it("recovers January–December from the first cycle, not later-year billing or the multi-year total", () => {
    const d = data();
    d.billing = [...d.billing, ...d.billing.map(b => ({ ...b, month: b.month.replace("2025", "2026"), amountCents: 99999 }))];
    const rows = parse(currentCsvTables(d)["term_payments.csv"], { columns: true }) as Record<string, string>[];
    expect(rows).toHaveLength(1); expect(rows[0].nov).toBe("123.45");
    expect(rows[0].dec).toBe("0.00");
  });
  it("streams a ZIP with the four current CSVs and no legacy files", async () => {
    const app = express(); app.get("/", async (_req, res) => { await streamCurrentExport(res, data()); });
    const response = await request(app).get("/").buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => callback(null, Buffer.concat(chunks)));
    });
    expect(response.status).toBe(200);
    const entries = await readAuditZip(response.body);
    expect(entries.map(f => f.name).sort()).toEqual(["contract_center.csv", "rate_card.csv", "term_payments.csv", "term_rates.csv"]);
  });
  it("signed renewal of expired source becomes current and leaves renewal due", () => {
    const d = data(); d.terms[0].endDate = "2026-09-30";
    expect(listSummary(d.terms, "2026-10-14").current?.displayStatus).toBe("expired");
    addRenewal(d, "signed", true); d.terms[0].status = "renewed";
    const summary = listSummary(d.terms, "2026-10-14");
    expect(summary.current?.id).toBe("existing"); expect(summary.current?.displayStatus).toBe("signed");
    expect(summary.renewalDue).toBe(false);
  });
});
