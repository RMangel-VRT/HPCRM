import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agreementTerms, agreements, termDocuments, termStatusHistory, termScopeLines, termRates, termBillingMonths, contracts } from "@workspace/db";
import { db, pool } from "../db";
import { ObjectStorageService } from "../objectStorage";
import { createRenewalFixture, seedRenewalSource, addRenewalCustomer, renewalEntries, renewalZip } from "./contractRenewalFixture";
import { removeAuditFixture } from "./contractAuditFixture";
import { loadAuditData } from "./contractAuditData";
import { parseAuditFiles, readAuditZip } from "./contractAuditFiles";
import { planRenewalImport } from "./contractRenewalPlan";
import { executeRenewalImport } from "./contractRenewalExecution";
import { fullDetail, listSummary } from "./contractCenterPersistence";
import * as persistence from "./contractCenterPersistence";
import { registerContractCenterRoutes } from "../routes/contractCenter";

const enabled = process.env.CONTRACT_RENEWAL_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("disposable renewal import database transactions", () => {
  let f: Awaited<ReturnType<typeof createRenewalFixture>>;
  beforeAll(async () => { f = await createRenewalFixture(); }, 30000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { if (f) await removeAuditFixture(f.companyId, f.userId); await pool.end(); });
  function memoryStorage() {
    const paths = new Set<string>();
    const save = vi.fn(async (path: string) => { paths.add(path); return path; });
    const remove = vi.fn(async (path: string) => { paths.delete(path); });
    return { paths, save, remove, service: {
      saveBufferToPrivatePath: save, deletePrivatePath: remove, trySetObjectEntityAclPolicy: vi.fn(async () => "/objects/mock"),
    } as unknown as ObjectStorageService };
  }
  async function fresh(status = "signed") {
    const s = await seedRenewalSource(f.companyId, f.userId, f.customerId);
    const entries = renewalEntries(s.source.id, s.rateKey, status);
    return { ...s, files: await parseAuditFiles([{ name: "fresh.zip", data: await renewalZip(entries) }]) };
  }
  function server(role = "admin", companyId?: string, superAdmin = false) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId,
      activeRole: role, activeCompanyId: companyId ?? f.companyId, isSuperAdminBool: superAdmin } }); next(); });
    registerContractCenterRoutes(app); return app;
  }
  it("rejects office and other non-admins before reading uploads on both endpoints", async () => {
    for (const role of ["office", "field_manager", "mapping", "crew_supervisor", "shop_manager"]) {
      expect((await request(server(role)).get("/api/admin/contract-center/current-export")).status).toBe(403);
      expect((await request(server(role)).post("/api/admin/contract-center/import")).status).toBe(403);
    }
    expect((await request(server("office", undefined, true)).get("/api/admin/contract-center/current-export")).status).toBe(200);
    const foreign = await request(server("admin", "foreign")).post("/api/admin/contract-center/import").attach("files", f.zip, "renewal.zip");
    expect(foreign.body.errors[0]).toMatchObject({ file: "renewals.csv", row: 2, message: "Unknown renewal source in active company" });
    const empty = await request(server("admin", "foreign")).get("/api/admin/contract-center/current-export")
      .buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    const tables = await readAuditZip(empty.body);
    expect(tables.find(t => t.name === "contract_center.csv")!.data.toString()).not.toContain(f.source.id);
    expect(tables.find(t => t.name === "contract_center.csv")!.data.toString().trim().split("\n")).toHaveLength(1);
  });
  it("defaults to a no-write preview and rejects invalid real uploads without storage writes", async () => {
    const before = await loadAuditData(f.companyId), save = vi.spyOn(ObjectStorageService.prototype, "saveBufferToPrivatePath");
    const preview = await request(server()).post("/api/admin/contract-center/import").attach("files", f.zip, "renewal.zip");
    expect(preview.body).toMatchObject({ dryRun: true, mode: "renewal", errors: [], summary: { terms: 1 } });
    const invalidEntries = f.entries.map(e => e.name === "renewals.csv" ? { ...e, data: Buffer.from(e.data.toString().replace(",signed,", ",lost,")) } : e);
    const invalid = await request(server()).post("/api/admin/contract-center/import?dryRun=false")
      .attach("files", await renewalZip(invalidEntries), "invalid.zip");
    expect(invalid.body.errors.length).toBeGreaterThan(0); expect(save).not.toHaveBeenCalled();
    expect(await loadAuditData(f.companyId)).toEqual(before);
  });
  it("creates a signed season with documents/history, preserves old children and import reference, and repeat skips without uploads", async () => {
    const before = await fullDetail(db, f.companyId, f.agreement.id);
    const legacy = await db.select().from(contracts).where(eq(contracts.companyId, f.companyId));
    const storage = memoryStorage(), result = await executeRenewalImport(f.files, f.companyId, f.userId, storage.service);
    expect(result.failures).toEqual([]); expect(result.successes[0].terms).toBe(1);
    const after = await fullDetail(db, f.companyId, f.agreement.id);
    expect(after.importRef).toBe(before.importRef); expect(after.terms).toHaveLength(2);
    const source = after.terms.find(t => t.id === f.source.id)!, term = after.terms.find(t => t.id !== f.source.id)!;
    for (const key of ["scope", "rates", "billingMonths", "documents"] as const) expect(source[key]).toEqual(before.terms[0][key]);
    expect(source.status).toBe("renewed"); expect(source.history[0].note).toBe("Renewed by 2026–27 (imported)");
    expect(term).toMatchObject({ status: "signed", renewedFromTermId: source.id, annualPriceCents: 123600, renewalIncreasePct: "3.00",
      legalName: "Original legal name", notes: "Historical notes", signedAt: new Date("2026-10-14T18:00:00Z") });
    expect(term.history[0].note).toBe("Imported signed renewal (renewal.zip)");
    expect(term.documents[0]).toMatchObject({ kind: "signed", version: 1, uploadedBy: f.userId, mimeType: "application/pdf" });
    expect(term.documents[0].storageObjectPath).toMatch(/^\/objects\/contract-renewals\//);
    expect(listSummary(after.terms, "2026-10-14")).toMatchObject({ current: { id: term.id }, renewalDue: false, recentSigned: { id: term.id } });
    const repeat = await executeRenewalImport(f.files, f.companyId, f.userId, storage.service);
    expect(repeat.errors).toEqual([]); expect(repeat.successes[0].terms).toBe(0);
    expect(repeat.warnings.some(w => w.message === "Already imported; skipped")).toBe(true);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(await fullDetail(db, f.companyId, f.agreement.id)).toEqual(after);
    expect(await db.select().from(contracts).where(eq(contracts.companyId, f.companyId))).toEqual(legacy);
  });
  it.each(["sent", "draft"])("%s renewal leaves the source completely unchanged", async status => {
    const s = await fresh(status), before = await fullDetail(db, f.companyId, s.agreement.id), storage = memoryStorage();
    const result = await executeRenewalImport(s.files, f.companyId, f.userId, storage.service); expect(result.failures).toEqual([]);
    const after = await fullDetail(db, f.companyId, s.agreement.id);
    expect(after.terms.find(t => t.id === s.source.id)).toEqual(before.terms[0]);
    expect(after.terms.find(t => t.id !== s.source.id)?.status).toBe(status);
  });
  it("concurrent imports serialize and revalidate idempotency under agreement locks", async () => {
    const s = await fresh(), storage = memoryStorage();
    const results = await Promise.all([executeRenewalImport(s.files, f.companyId, f.userId, storage.service),
      executeRenewalImport(s.files, f.companyId, f.userId, storage.service)]);
    expect(results.flatMap(r => r.failures)).toEqual([]);
    expect(results.reduce((n, r) => n + r.successes[0].terms, 0)).toBe(1);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect((await fullDetail(db, f.companyId, s.agreement.id)).terms).toHaveLength(2);
  });
  it("rechecks changed eligibility after locking and performs no uploads", async () => {
    const s = await fresh(), storage = memoryStorage(), original = persistence.lockAgreement;
    expect(planRenewalImport(s.files, await loadAuditData(f.companyId)).errors).toEqual([]);
    vi.spyOn(persistence, "lockAgreement").mockImplementation(async (tx, company, id) => {
      const row = await original(tx, company, id);
      await tx.update(agreementTerms).set({ status: "cancelled" }).where(eq(agreementTerms.id, s.source.id));
      return row;
    });
    const result = await executeRenewalImport(s.files, f.companyId, f.userId, storage.service);
    expect(result.failures).toHaveLength(1); expect(result.successes).toHaveLength(0); expect(storage.save).not.toHaveBeenCalled();
    expect((await fullDetail(db, f.companyId, s.agreement.id)).terms).toHaveLength(1);
  });
  it("rebuilds carry-forward fields from fresh source data under lock", async () => {
    const s = await fresh("sent"), storage = memoryStorage(), original = persistence.lockAgreement;
    vi.spyOn(persistence, "lockAgreement").mockImplementation(async (tx, company, id) => {
      const row = await original(tx, company, id);
      await tx.update(agreementTerms).set({ notes: "Changed since Preview" }).where(eq(agreementTerms.id, s.source.id)); return row;
    });
    expect((await executeRenewalImport(s.files, f.companyId, f.userId, storage.service)).failures).toEqual([]);
    expect((await fullDetail(db, f.companyId, s.agreement.id)).terms.find(t => t.id !== s.source.id)?.notes).toBe("Changed since Preview");
  });
  it("customer B rollback removes only B objects and database rows; committed A survives", async () => {
    const a = await fresh(), b = await addRenewalCustomer(f.companyId, f.userId), storage = memoryStorage();
    const entriesA = renewalEntries(a.source.id, a.rateKey, "signed", "a");
    const entriesB = renewalEntries(b.source.id, b.rateKey, "signed", "b");
    const entries = entriesA.map(e => e.name.endsWith(".csv") ? { ...e,
      data: Buffer.from(e.data.toString() + "\n" + entriesB.find(x => x.name === e.name)!.data.toString().split("\n").slice(1).join("\n")) } : e);
    const files = await parseAuditFiles([{ name: "two.zip", data: await renewalZip(entries) }]);
    const original = persistence.writeTerm;
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (args[3]?.id === b.source.id) throw new Error("Sensitive storage/SQL exception must not escape");
      return original(...args);
    });
    const beforeB = await fullDetail(db, f.companyId, b.agreement.id);
    const result = await executeRenewalImport(files, f.companyId, f.userId, storage.service);
    expect(result.successes).toHaveLength(1); expect(result.failures).toHaveLength(1);
    expect(result.failures[0].error).not.toContain("Sensitive");
    expect(storage.save).toHaveBeenCalledTimes(2); expect(storage.remove).toHaveBeenCalledTimes(1); expect(storage.paths.size).toBe(1);
    expect((await fullDetail(db, f.companyId, a.agreement.id)).terms).toHaveLength(2);
    expect(await fullDetail(db, f.companyId, b.agreement.id)).toEqual(beforeB);
  });
  it("handles storage save/ACL and cleanup failures without false success or leaking exceptions", async () => {
    const s = await fresh(), storage = memoryStorage();
    storage.save.mockImplementation(async () => { throw new Error("secret credentials"); });
    storage.remove.mockRejectedValue(new Error("secret delete credentials"));
    const before = await fullDetail(db, f.companyId, s.agreement.id);
    const result = await executeRenewalImport(s.files, f.companyId, f.userId, storage.service);
    expect(result.successes).toEqual([]); expect(result.failures[0].error).toContain("could not be removed");
    expect(JSON.stringify(result)).not.toContain("credentials"); expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(await fullDetail(db, f.companyId, s.agreement.id)).toEqual(before);
  });
});
