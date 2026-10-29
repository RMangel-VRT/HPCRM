import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agreements, agreementTerms, termDocuments, termLegacySources, termStatusHistory, termBillingMonths,
  customers, contracts, contractDocuments } from "@workspace/db";
import { db, pool } from "../db";
import { createAuditFixture, removeAuditFixture } from "./contractAuditFixture";
import { loadAuditData } from "./contractAuditData";
import { planAuditImport } from "./contractAuditPlan";
import { executeAuditImport } from "./contractAuditExecution";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import * as persistence from "./contractCenterPersistence";
import { ObjectStorageService } from "../objectStorage";

const enabled = process.env.CONTRACT_AUDIT_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("disposable development audit import", () => {
  it("persists forward coverage after resolving out-of-order audited seasons", async () => {
    const f = await createAuditFixture();
    try {
      const source = f.files.tables["contracts.csv"][0], target = f.files.tables["contracts.csv"][1];
      const document = f.files.tables["documents.csv"].find(r => r.values.contract_ref === source.values.contract_ref)!;
      document.values.covers_through_ref = target.values.contract_ref;
      f.files.tables["contracts.csv"].reverse();
      const result = await executeAuditImport(f.files, f.companyId, f.userId);
      expect(result.errors).toEqual([]); expect(result.failures).toEqual([]);
      const [agreement] = await db.select().from(agreements).where(eq(agreements.companyId, f.companyId));
      const detail = await persistence.fullDetail(db, f.companyId, agreement.id);
      expect(detail.terms[0].documents[0].coversThroughTermId).toBe(detail.terms[1].id);
      expect(detail.terms[1].coveredBy[0]).toMatchObject({ id: detail.terms[0].documents[0].id,
        fromTermId: detail.terms[0].id, fromSeasonLabel: detail.terms[0].seasonLabel });
    } finally { await removeAuditFixture(f.companyId, f.userId); }
  });
  let fixture: Awaited<ReturnType<typeof createAuditFixture>>;
  const createdCustomers: string[] = [];
  beforeAll(async () => { fixture = await createAuditFixture(); }, 30000);
  afterAll(async () => { if (fixture) await removeAuditFixture(fixture.companyId, fixture.userId); await pool.end(); });
  const app = (role = "admin", company?: string, authenticated = true, superAdmin = false) => {
    const server = express(); server.use(express.json());
    server.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => authenticated, user: { id: fixture.userId,
        activeRole: role, activeCompanyId: company ?? fixture.companyId, isSuperAdminBool: superAdmin } }); next();
    });
    registerContractCenterRoutes(server); return server;
  };
  const upload = (server: ReturnType<typeof app>, dryRun?: boolean) => {
    const req = request(server).post(`/api/admin/contract-center/import${dryRun === undefined ? "" : `?dryRun=${dryRun}`}`);
    for (const file of fixture.upload.filter(f => f.name.endsWith(".csv"))) req.attach("files", file.data, file.name.split("/").pop()!);
    return req;
  };
  it("keeps imported seasonal histories independent despite same-transaction predecessor chains", async () => {
    const f = await createAuditFixture();
    try {
      const result = await executeAuditImport(f.files, f.companyId, f.userId);
      expect(result.failures).toEqual([]);
      const [a] = await db.select().from(agreements).where(eq(agreements.companyId, f.companyId));
      const server = express(); server.use(express.json());
      server.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId, activeRole: "admin",
          activeCompanyId: f.companyId, isSuperAdminBool: false } });
        next();
      });
      registerContractCenterRoutes(server);
      const api = request(server), base = "/api/contract-center";
      let detail = (await api.get(`${base}/contracts/${a.id}`)).body;
      const first = detail.terms[0], second = detail.terms[1];
      expect(second.renewedFromTermId).toBe(first.id);
      expect(second.createdAtExact).toBe(first.createdAtExact);
      for (const t of detail.terms) {
        expect(t.renewalSet).toMatchObject({ firstTermId: t.id, year: 1, length: 1 });
        expect(t).not.toHaveProperty("signedDocumentTermId");
        expect(t.coveredBy).toEqual([]);
      }
      const status = await api.post(`${base}/terms/${second.id}/status`).send({ to: "signed" });
      expect(status.status).toBe(200);
      // Exercise the real document route/DB with only external object I/O mocked.
      vi.spyOn(ObjectStorageService.prototype, "normalizeObjectEntityPath").mockReturnValue("/objects/disposable-import-signed");
      vi.spyOn(ObjectStorageService.prototype, "getObjectEntityFile").mockResolvedValue({} as never);
      vi.spyOn(ObjectStorageService.prototype, "trySetObjectEntityAclPolicy").mockResolvedValue("/objects/disposable-import-signed");
      // The middleware grants an authorized upload binding for each imported season.
      const bindingServer = express(); bindingServer.use(express.json());
      bindingServer.use((req, _res, next) => {
        Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId, activeRole: "admin", activeCompanyId: f.companyId },
          session: { contractCenterUploads: { "/objects/disposable-import-signed": { companyId: f.companyId, termId: req.path.split("/")[4] } } } });
        next();
      });
      registerContractCenterRoutes(bindingServer);
      for (const t of [first, second]) {
        const doc = await request(bindingServer).post(`${base}/terms/${t.id}/documents`).send({ uploadURL: "/objects/disposable-import-signed",
          kind: "signed", filename: "disposable.pdf", fileSize: 10, mimeType: "application/pdf" });
        expect(doc.status).toBe(201); expect(doc.body.termId).toBe(t.id);
      }
      detail = (await api.get(`${base}/contracts/${a.id}`)).body;
      expect(detail.terms.every((t: { renewalSet: { length: number } }) => t.renewalSet.length === 1)).toBe(true);
    } finally { vi.restoreAllMocks(); await removeAuditFixture(f.companyId, f.userId); }
  });
  it("authorizes before multipart/DB work and scopes exports/imports to company", async () => {
    for (const role of ["office", "field_manager", "mapping", "crew_supervisor"]) {
      expect((await request(app(role)).get("/api/admin/contract-center/audit-export/batches")).status).toBe(403);
      expect((await request(app(role)).get("/api/admin/contract-center/audit-export?batch=1")).status).toBe(403);
      expect((await request(app(role)).post("/api/admin/contract-center/import")).status).toBe(403);
    }
    expect((await request(app("admin", undefined, false)).get("/api/admin/contract-center/audit-export/batches")).status).toBe(401);
    expect((await request(app("field", undefined, true, true)).get("/api/admin/contract-center/audit-export/batches")).status).toBe(200);
    expect((await request(app("admin", "unrelated-company")).get("/api/admin/contract-center/audit-export/batches")).body).toEqual([]);
    const foreign = await upload(app("admin", "unrelated-company"));
    expect(foreign.body.errors.some((e: { message: string }) => e.message.includes("Unknown customer"))).toBe(true);
    expect((await request(app()).get("/api/admin/contract-center/audit-export?batch=0")).status).toBe(400);
    expect((await request(app()).get("/api/admin/contract-center/audit-export?batch=1&size=51")).status).toBe(400);
  });
  it("multipart defaults to no-write Preview; errors block all writes even for real requests", async () => {
    const preview = await upload(app());
    expect(preview.body).toMatchObject({ dryRun: true, errors: [], summary: { terms: 2 } });
    expect(await db.select().from(agreements).where(eq(agreements.companyId, fixture.companyId))).toHaveLength(0);
    const invalid = structuredClone(fixture.files);
    invalid.tables["contracts.csv"][0].values.status = "bad";
    expect((await executeAuditImport(invalid, fixture.companyId, fixture.userId)).errors.length).toBeGreaterThan(0);
    expect(await db.select().from(agreements).where(eq(agreements.companyId, fixture.companyId))).toHaveLength(0);
  });
  it("imports, reimports, preserves child metadata/history/links, and resolves legacy navigation", async () => {
    const sourcesBefore = await db.select().from(contracts).where(eq(contracts.companyId, fixture.companyId));
    const docsBefore = await db.select().from(contractDocuments).where(eq(contractDocuments.companyId, fixture.companyId));
    const result = await upload(app(), false);
    expect(result.body.errors).toEqual([]); expect(result.body.failures).toEqual([]);
    expect(result.body.successes).toHaveLength(1);
    const [agreement] = await db.select().from(agreements).where(eq(agreements.companyId, fixture.companyId));
    expect(agreement.propertyManagementCompanyId).toBe(fixture.managementId);
    const detail = await request(app()).get(`/api/contract-center/contracts/${agreement.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.terms.map((t: { annualPriceCents: number }) => t.annualPriceCents)).toEqual([1950000, 4151500]);
    expect(detail.body.terms[1].billingMonths).toHaveLength(31);
    expect(detail.body.terms[1].rates.length).toBeGreaterThan(17);
    expect(detail.body.terms[1].scope.length).toBeGreaterThan(0);
    expect(detail.body.terms[1].history[0]).toMatchObject({ changedBy: fixture.userId, note: expect.stringContaining("Imported from audit") });
    expect(detail.body.terms[1].renewedFromTermId).toBe(detail.body.terms[0].id);
    const importedDocs = await db.select().from(termDocuments).where(eq(termDocuments.companyId, fixture.companyId));
    expect(importedDocs).toHaveLength(2);
    importedDocs.forEach(doc => {
      const old = docsBefore.find(d => d.storageObjectPath === doc.storageObjectPath)!;
      expect(doc).toMatchObject({ filename: old.filename, mimeType: old.mimeType, fileSize: old.fileSize,
        uploadedBy: old.uploadedBy, createdAt: old.uploadedAt, version: old.version });
    });
    const historyBefore = detail.body.terms[1].history[0].id;
    const reimport = await upload(app(), false);
    expect(reimport.body.failures).toEqual([]);
    const all = await db.select().from(agreements).where(eq(agreements.companyId, fixture.companyId));
    expect(all).toHaveLength(1); expect(all[0].id).not.toBe(agreement.id);
    expect(await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, fixture.companyId))).toHaveLength(2);
    expect(await db.select().from(termLegacySources).where(eq(termLegacySources.companyId, fixture.companyId))).toHaveLength(4);
    expect(await db.select().from(termStatusHistory).where(eq(termStatusHistory.companyId, fixture.companyId))).toHaveLength(2);
    expect((await db.select().from(termStatusHistory).where(eq(termStatusHistory.companyId, fixture.companyId))).some(h => h.id === historyBefore)).toBe(false);
    const redirect = await request(app()).get(`/api/contract-center/contracts/by-legacy/${fixture.oldIds[1]}`);
    expect(redirect.status).toBe(200); expect(redirect.body.agreementId).toBe(all[0].id);
    const provenance = await request(app()).get("/api/contract-center/copy-status");
    expect(provenance.body.copiedContracts).toBe(4); expect(provenance.body.firstCopiedAt).toBeTruthy();
    expect(await db.select().from(contracts).where(eq(contracts.companyId, fixture.companyId))).toEqual(sourcesBefore);
    expect(await db.select().from(contractDocuments).where(eq(contractDocuments.companyId, fixture.companyId))).toEqual(docsBefore);
    expect(await db.select().from(termBillingMonths).where(eq(termBillingMonths.companyId, fixture.companyId))).toHaveLength(40);
  });
  it("preserves null-ref contracts and revalidates edited history, outside ownership and source conflicts", async () => {
    const [untouched] = await db.insert(agreements).values({ companyId: fixture.companyId, customerId: fixture.customerId }).returning();
    const [term] = await db.select().from(agreementTerms).where(eq(agreementTerms.companyId, fixture.companyId));
    await db.update(agreementTerms).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(agreementTerms.id, term.id));
    const preview = planAuditImport(fixture.files, await loadAuditData(fixture.companyId));
    expect(preview.warnings.some(w => w.message.includes("no import_ref"))).toBe(true);
    expect(preview.warnings.some(w => w.message.includes("edited after"))).toBe(true);
    const [other] = await db.insert(customers).values({ companyId: fixture.companyId, name: "Other Audit Customer", street: "1", city: "Denver", state: "CO", zip: "80000" }).returning();
    createdCustomers.push(other.id);
    const stolen = structuredClone(fixture.files);
    stolen.tables["contracts.csv"].forEach(r => r.values.customer_id = other.id);
    expect((await executeAuditImport(stolen, fixture.companyId, fixture.userId)).errors.some(e => e.message.includes("another customer"))).toBe(true);
    const moved = structuredClone(fixture.files);
    moved.tables["contracts.csv"].forEach(r => r.values.agreement_ref = "another-reference");
    expect((await executeAuditImport(moved, fixture.companyId, fixture.userId)).errors.some(e => e.message.includes("outside"))).toBe(true);
    const reimport = await executeAuditImport(fixture.files, fixture.companyId, fixture.userId);
    expect(reimport.failures).toEqual([]);
    expect(await db.select().from(agreements).where(eq(agreements.id, untouched.id))).toHaveLength(1);
  });
  it("concurrent reimports cannot duplicate agreements or steal another customer's agreement", async () => {
    const results = await Promise.all([executeAuditImport(fixture.files, fixture.companyId, fixture.userId), executeAuditImport(fixture.files, fixture.companyId, fixture.userId)]);
    expect(results.every(r => r.failures.length === 0)).toBe(true);
    expect(await db.select().from(agreements).where(and(eq(agreements.companyId, fixture.companyId), eq(agreements.importRef, "college-hills")))).toHaveLength(1);
    expect(await db.select().from(termLegacySources).where(eq(termLegacySources.companyId, fixture.companyId))).toHaveLength(4);
  });
  it("rolls back customer B only and continues committing customer A", async () => {
    const second = structuredClone(fixture.files);
    const id = createdCustomers[0];
    second.tables["contracts.csv"].forEach(r => {
      r.values.customer_id = id; r.values.agreement_ref = "customer-b"; r.values.contract_ref += "-b";
      if (r.values.renews_ref) r.values.renews_ref += "-b";
      delete r.values.legacy_contract_ids; r.values.legal_name = "force-customer-b-failure";
    });
    for (const file of ["payments.csv", "scope.csv", "rates.csv"]) second.tables[file].forEach(r => r.values.contract_ref += "-b");
    second.tables["documents.csv"] = [];
    const combined = structuredClone(fixture.files);
    for (const file of Object.keys(combined.tables)) combined.tables[file].push(...second.tables[file]);
    const original = persistence.writeTerm;
    const spy = vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (args[4].legalName === "force-customer-b-failure") throw new Error("Injected development failure");
      return original(...args);
    });
    try {
      const result = await executeAuditImport(combined, fixture.companyId, fixture.userId);
      expect(result.errors).toEqual([]); expect(result.successes).toHaveLength(1); expect(result.failures).toHaveLength(1);
      expect(result.failures[0].customerId).toBe(id);
      expect(await db.select().from(agreements).where(eq(agreements.importRef, "customer-b"))).toHaveLength(0);
    } finally { spy.mockRestore(); }
    // Verify the named DB constraint (not just application-level uniqueness).
    const constraint = await db.execute(sql`select conname from pg_constraint where conname = 'agreements_company_import_ref_unique'`);
    expect(constraint.rows).toHaveLength(1);
  });
  it("blocks reimport when an imported season has a newly attached Contract Center document", async () => {
    const [agreement] = await db.select().from(agreements).where(and(eq(agreements.companyId, fixture.companyId), eq(agreements.importRef, "college-hills")));
    const [term] = await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, agreement.id));
    const [document] = await db.insert(termDocuments).values({ companyId: fixture.companyId, termId: term.id,
      kind: "other", filename: "new-direct-attachment.pdf", storageObjectPath: "/objects/disposable-direct-no-blob",
      mimeType: "application/pdf", fileSize: 42, uploadedBy: fixture.userId }).returning();
    const before = await request(app()).get(`/api/contract-center/contracts/${agreement.id}`);
    const result = await upload(app(), false);
    expect(result.body.errors.some((e: { message: string }) => e.message.includes("attached in Contract Center"))).toBe(true);
    expect((await request(app()).get(`/api/contract-center/contracts/${agreement.id}`)).body).toEqual(before.body);
    expect(await db.select().from(termDocuments).where(eq(termDocuments.id, document.id))).toEqual([document]);
    await db.delete(termDocuments).where(eq(termDocuments.id, document.id)); // disposable fixture only
  });
  it("leaves a real Contract Center renewal and its documents unchanged when omitted from reimport CSVs", async () => {
    const [agreement] = await db.select().from(agreements).where(and(eq(agreements.companyId, fixture.companyId), eq(agreements.importRef, "college-hills")));
    const terms = await db.select().from(agreementTerms).where(eq(agreementTerms.agreementId, agreement.id));
    const latest = terms.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const detail = await request(app()).get(`/api/contract-center/contracts/${agreement.id}`);
    const firstId = detail.body.terms.find((t: { id: string }) => t.id === latest.id).renewalSet.firstTermId;
    expect(firstId).toBe(latest.id);
    expect((await request(app()).post(`/api/contract-center/terms/${firstId}/status`).send({ to: "signed" })).status).toBe(200);
    const renewed = await request(app()).post(`/api/contract-center/contracts/${agreement.id}/renew`).send({ increasePct: 3, roundTo: "dollar" });
    expect(renewed.status).toBe(201);
    const renewal = renewed.body.terms.find((t: { renewedFromTermId: string }) => t.renewedFromTermId === latest.id);
    expect(renewal.renewedFromTermId).toBe(latest.id);
    const renewalBefore = await db.select().from(agreementTerms).where(eq(agreementTerms.id, renewal.id));
    const [document] = await db.insert(termDocuments).values({ companyId: fixture.companyId, termId: renewal.id,
      kind: "signed", filename: "renewal-direct-attachment.pdf", storageObjectPath: "/objects/disposable-renewal-no-blob",
      mimeType: "application/pdf", fileSize: 123, uploadedBy: fixture.userId }).returning();
    const before = await request(app()).get(`/api/contract-center/contracts/${agreement.id}`);
    const preview = await upload(app());
    expect(preview.body.errors.some((e: { message: string }) => e.message.includes("created in Contract Center"))).toBe(true);
    const real = await upload(app(), false);
    expect(real.body.errors.some((e: { message: string }) => e.message.includes("created in Contract Center"))).toBe(true);
    expect((await request(app()).get(`/api/contract-center/contracts/${agreement.id}`)).body).toEqual(before.body);
    expect(await db.select().from(agreementTerms).where(eq(agreementTerms.id, renewal.id))).toEqual(renewalBefore);
    expect(await db.select().from(termDocuments).where(eq(termDocuments.id, document.id))).toEqual([document]);
  });
}, 60000);
