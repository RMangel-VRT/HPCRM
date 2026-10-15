import { describe, expect, it, vi } from "vitest";
import { parseAuditFiles, type AuditFiles } from "./contractAuditFiles";
import { planAuditImport, auditReport } from "./contractAuditPlan";
import { destructiveAgreementIssues } from "./contractAuditEligibility";
import type { AuditData } from "./contractAuditData";
import { parentEntries } from "./contractParentFixture";
import { renewalZip } from "./contractRenewalFixture";

vi.mock("../db", () => ({ db: {} }));

function data(): AuditData {
  const date = new Date("2026-01-01T00:00:00Z");
  return {
    customers: [{ id: "parent", name: "Bank", isParent: "true" },
      { id: "one", name: "Branch 1", parentCustomerId: "parent" }, { id: "two", name: "Branch 2", parentCustomerId: "parent" }],
    agreements: [1, 2].map(i => ({ id: `a${i}`, customerId: i === 1 ? "one" : "two", importRef: `branch-${i}` })),
    terms: [1, 2].map(i => ({ id: `t${i}`, agreementId: `a${i}`, seasonLabel: `Imported ${i}`, updatedAt: date })),
    history: [1, 2].map(i => ({ termId: `t${i}`, oldStatus: null, note: "Imported from audit (branches.zip)", createdAt: date })),
    contracts: [1, 2].map(i => ({ id: `old${i}`, customerId: i === 1 ? "one" : "two", updatedAt: date })),
    links: [1, 2].map(i => ({ termId: `t${i}`, legacyContractId: `old${i}` })),
    documents: [1, 2].map(i => ({ id: `doc${i}`, contractId: `old${i}`, filename: `signed${i}.pdf`, companyId: "company",
      storageObjectPath: `/objects/shared${i}`, uploadedAt: date, uploadedBy: "admin", version: 1, mimeType: "application/pdf", fileSize: 10 })),
    termDocs: [], card: [], contacts: [], amounts: [], services: [], sheets: [], scope: [], rates: [], billing: [],
  } as unknown as AuditData;
}
async function files(): Promise<AuditFiles> {
  return parseAuditFiles(parentEntries("parent", ["old1", "old2"], ["doc1", "doc2"], true));
}
describe("audit-only removal parsing and shared destructive eligibility", () => {
  it("accepts optional removal CSV in ZIP and multi-CSV without making it required", async () => {
    const entries = parentEntries("parent", ["old1", "old2"], ["doc1", "doc2"], true);
    const csv = await parseAuditFiles(entries);
    const zipped = await parseAuditFiles([{ name: "parent.zip", data: await renewalZip(entries) }]);
    expect(csv.errors).toEqual([]); expect(zipped.errors).toEqual([]);
    expect(zipped.tables).toEqual(csv.tables);
    expect((await parseAuditFiles(entries.filter(f => f.name !== "remove_agreements.csv"))).errors).toEqual([]);
  });
  it.each([
    ["unknown\nref", "Missing required column: agreement_ref"],
    ["agreement_ref,agreement_ref\nx,x", "Missing or duplicate column headers"],
    ['agreement_ref\n"broken', "Malformed CSV"],
    ["agreement_ref,extra\nx,y", "Unknown column: extra"],
  ])("retains strict CSV diagnostics for %s", async (text, error) => {
    const entries = parentEntries("parent", [], [], true);
    entries[5].data = Buffer.from(text);
    const parsed = await parseAuditFiles(entries);
    expect(parsed.errors.some(e => e.file === "remove_agreements.csv" && e.message.includes(error))).toBe(true);
  });
  it("rejects removals in renewal mode", async () => {
    const parsed = await parseAuditFiles([
      { name: "renewals.csv", data: Buffer.from("contract_ref,renews_term_id,start_date,end_date,status\nr,t,2027-01-01,2027-12-31,draft") },
      { name: "remove_agreements.csv", data: Buffer.from("agreement_ref\nbranch-1") },
    ]);
    expect(parsed.mode).toBe("renewal");
    expect(parsed.errors).toContainEqual(expect.objectContaining({ file: "remove_agreements.csv", message: "remove_agreements.csv is only allowed in audit imports" }));
  });
  it("plans safely releasable links and parent ownership without uncovered warnings", async () => {
    const p = planAuditImport(await files(), data());
    expect(p.errors).toEqual([]); expect(p.warnings).toEqual([]);
    expect(auditReport(p, true)).toMatchObject({ summary: { removed: 2, terms: 1 }, removals: [
      { ref: "branch-1", customerName: "Branch 1", seasons: 1 }, { ref: "branch-2", seasons: 1 },
    ] });
  });
  it.each(["missing", "duplicate", "blank", "both"])("rejects %s references with file and row", async kind => {
    const f = await files(), rows = f.tables["remove_agreements.csv"];
    if (kind === "missing") rows[0].values.agreement_ref = "foreign-or-unknown";
    if (kind === "duplicate") rows.push({ ...rows[0], row: 4 });
    if (kind === "blank") rows[0].values = {};
    if (kind === "both") f.tables["contracts.csv"][0].values.agreement_ref = "branch-1";
    const error = kind === "missing" ? "No imported contract with this reference." : kind === "duplicate" ? "Duplicate" : kind === "blank" ? "Required" : "both";
    const p = planAuditImport(f, data());
    expect(p.errors.some(e => e.file === "remove_agreements.csv" && e.row && e.message.includes(error))).toBe(true);
  });
  it.each(["Created in the Contract Center", "Renewed from 2026 at +3%", "Imported signed renewal (renewals.zip)"])("blocks removal and replacement identically for %s", async note => {
    const d = data(); d.history[0].note = note;
    const removal = planAuditImport(await files(), d);
    const f = await files(); delete f.tables["remove_agreements.csv"];
    Object.assign(f.tables["contracts.csv"][0].values, { agreement_ref: "branch-1", customer_id: "one", legacy_contract_ids: "old1" });
    f.tables["documents.csv"] = [];
    const replacement = planAuditImport(f, d);
    const expected = destructiveAgreementIssues(d, "a1").errors[0];
    expect(expected).toContain("Imported 1"); expect(expected).toContain("t1");
    expect(removal.errors.some(e => e.message === expected)).toBe(true);
    expect(replacement.errors.some(e => e.message === expected)).toBe(true);
    expect(removal.errors.some(e => e.message.includes("linked outside"))).toBe(true);
  });
  it("blocks direct documents by filename and ID but permits unchanged shared metadata", async () => {
    const d = data(), source = d.documents[0];
    d.termDocs.push({ ...source, id: "term-doc", termId: "t1", createdAt: source.uploadedAt } as any);
    expect(destructiveAgreementIssues(d, "a1").errors).toEqual([]);
    d.termDocs[0].filename = "new-direct.pdf";
    const expected = destructiveAgreementIssues(d, "a1").errors[0];
    expect(expected).toContain("new-direct.pdf (term-doc)");
    expect(planAuditImport(await files(), d).errors.some(e => e.message === expected)).toBe(true);
  });
  it("rejects unrelated legacy/document records and warns about uncovered direct-child legacy records", async () => {
    const d = data(); d.customers[2].parentCustomerId = null;
    let p = planAuditImport(await files(), d);
    expect(p.errors.some(e => e.message.includes("cross-customer legacy"))).toBe(true);
    expect(p.errors.some(e => e.message.includes("cross-customer document"))).toBe(true);
    d.customers[2].parentCustomerId = "parent";
    d.contracts.push({ ...d.contracts[0], id: "uncovered", serviceType: "Maintenance", startDate: new Date("2025-01-01"), endDate: null } as any);
    p = planAuditImport(await files(), d);
    expect(p.warnings.some(e => e.message.includes("Old contract uncovered"))).toBe(true);
  });
});
