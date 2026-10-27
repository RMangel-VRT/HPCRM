import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agreements, agreementTerms, customers, contracts, contractDocuments, termDocuments, termLegacySources, termStatusHistory } from "@workspace/db";
import { db, pool } from "../db";
import { createParentFixture } from "./contractParentFixture";
import { removeAuditFixture } from "./contractAuditFixture";
import { parseAuditFiles } from "./contractAuditFiles";
import { planAuditImport } from "./contractAuditPlan";
import * as data from "./contractAuditData";
import { executeAuditImport } from "./contractAuditExecution";
import { registerContractCenterRoutes } from "../routes/contractCenter";
import * as persistence from "./contractCenterPersistence";
import { executeRenewalImport } from "./contractRenewalExecution";
import { logger } from "./logger";
import { ObjectStorageService } from "../objectStorage";

const enabled = process.env.CONTRACT_AUDIT_DB_TEST === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("parent consolidation — disposable development verification", () => {
  let f: Awaited<ReturnType<typeof createParentFixture>>;
  beforeEach(async () => { f = await createParentFixture(); }, 30000);
  afterEach(async () => { vi.restoreAllMocks(); if (f) await removeAuditFixture(f.companyId, f.userId); });
  afterAll(() => pool.end());
  function app(role = "admin", companyId?: string) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => {
      Object.assign(req, { isAuthenticated: () => true, user: { id: f.userId, activeCompanyId: companyId ?? f.companyId, activeRole: role } }); next();
    });
    registerContractCenterRoutes(a); return a;
  }
  async function post(dryRun: boolean, entries = f.entries) {
    const req = request(app()).post(`/api/admin/contract-center/import?dryRun=${dryRun}`);
    for (const entry of entries) req.attach("files", entry.data, entry.name);
    return req;
  }
  async function snapshot() {
    const d = await data.loadAuditData(f.companyId);
    return { agreements: d.agreements, terms: d.terms, docs: d.termDocs, links: d.links, history: d.history };
  }
  it("previews without writes, atomically transfers links/doc metadata, redirects, shows branches and renews the parent", async () => {
    const before = await snapshot(), legacy = await db.select().from(contracts).where(eq(contracts.companyId, f.companyId));
    const docs = await db.select().from(contractDocuments).where(eq(contractDocuments.companyId, f.companyId));
    const storageDelete = vi.spyOn(ObjectStorageService.prototype, "deletePrivatePath");
    const storageSave = vi.spyOn(ObjectStorageService.prototype, "saveBufferToPrivatePath");
    const preview = await post(true, [...f.entries, { name: "manifest.json", data: Buffer.from('{"exportedAt":"2026-10-15T00:00:00Z"}') }]);
    expect(preview.body).toMatchObject({ errors: [], summary: { removed: 2, terms: 1 }, removals: [
      { ref: "branch-1", seasons: 1 }, { ref: "branch-2", seasons: 1 },
    ] });
    expect(preview.body.warnings.some((w: any) => w.message.includes("isn't covered"))).toBe(false);
    expect(await snapshot()).toEqual(before);
    const log = vi.spyOn(logger, "info");
    const result = await post(false);
    expect(result.body).toMatchObject({ errors: [], failures: [], summary: { removed: 2 }, removed: expect.any(Array) });
    expect(result.body.removed).toHaveLength(2);
    expect(storageDelete).not.toHaveBeenCalled(); expect(storageSave).not.toHaveBeenCalled();
    const after = await snapshot();
    expect(after.agreements).toHaveLength(1); expect(after.agreements[0].customerId).toBe(f.parentId);
    expect(after.agreements.every(a => !before.agreements.some(b => b.id === a.id))).toBe(true);
    expect(after.links).toHaveLength(4); expect(after.docs).toHaveLength(2);
    after.docs.forEach(d => expect(docs.some(old => d.storageObjectPath === old.storageObjectPath &&
      d.createdAt.getTime() === old.uploadedAt.getTime() && d.version === old.version)).toBe(true));
    expect(after.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ note: "Replaces imported contracts: branch-1, branch-2", changedBy: f.userId }),
      expect.objectContaining({ note: expect.stringContaining("Imported from audit (") }),
    ]));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ importingAdmin: f.userId,
      removals: expect.arrayContaining([expect.objectContaining({ ref: "branch-1" })]) }), "Imported contract removals committed");
    for (const id of f.oldIds)
      expect((await request(app()).get(`/api/contract-center/contracts/by-legacy/${id}`)).body.agreementId).toBe(after.agreements[0].id);
    for (const id of [f.customerId, f.branch2Id]) {
      expect((await request(app()).get(`/api/contract-center/contracts?customerId=${id}`)).body).toEqual([]);
      const inherited = await request(app()).get(`/api/contract-center/contracts?customerId=${id}&includeParent=true`);
      expect(inherited.body).toMatchObject([{ viaParent: true, locationCount: 2, customerId: f.parentId,
        payments: expect.arrayContaining([expect.objectContaining({ component: id === f.customerId ? "FB01 – Branch 1" : "FB02 – Branch 2" })]) }]);
    }
    const own = await request(app()).get(`/api/contract-center/contracts?customerId=${f.parentId}`);
    expect(own.body[0].viaParent).toBeUndefined(); expect(own.body[0].locationCount).toBe(2);
    const renewal = await parseAuditFiles([
      { name: "renewals.csv", data: Buffer.from(`contract_ref,renews_term_id,start_date,end_date,status\nnext,${after.terms[0].id},2027-01-01,2027-12-31,sent`) },
      { name: "payments.csv", data: Buffer.from("contract_ref,payment_line,jan\nnext,Bank,1400") },
    ]);
    const renewed = await executeRenewalImport(renewal, f.companyId, f.userId);
    expect(renewed.errors).toEqual([]); expect(renewed.failures).toEqual([]); expect(renewed.successes[0].terms).toBe(1);
    expect(await db.select().from(contracts).where(eq(contracts.companyId, f.companyId))).toEqual(legacy);
    expect(await db.select().from(contractDocuments).where(eq(contractDocuments.companyId, f.companyId))).toEqual(docs);
    // The renewal import does not make its newly added season destructively replaceable.
    const removal = structuredClone(f.files);
    removal.tables["remove_agreements.csv"] = [{ file: "remove_agreements.csv", row: 2, values: { agreement_ref: "parent" } }];
    removal.tables["contracts.csv"][0].values.agreement_ref = "another-parent";
    expect(planAuditImport(removal, await data.loadAuditData(f.companyId)).errors.some(e => e.message.includes("created in Contract Center"))).toBe(true);
  });
  it("initial errors prevent every removal and addition, including unknown/foreign references and overlap", async () => {
    const before = await snapshot();
    const files = structuredClone(f.files);
    files.tables["remove_agreements.csv"].push({ file: "remove_agreements.csv", row: 4, values: { agreement_ref: "unknown-or-foreign" } });
    files.tables["contracts.csv"][0].values.agreement_ref = "branch-1";
    const result = await executeAuditImport(files, f.companyId, f.userId);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: "remove_agreements.csv", row: 4, message: "No imported contract with this reference." }),
      expect.objectContaining({ message: expect.stringContaining("both remove_agreements.csv and contracts.csv") }),
    ]));
    expect(result.successes).toEqual([]); expect(await snapshot()).toEqual(before);
    const foreign = planAuditImport(f.files, await data.loadAuditData("not-this-company"));
    expect(foreign.errors.filter(e => e.message === "No imported contract with this reference.")).toHaveLength(2);
    expect((await request(app("office")).post("/api/admin/contract-center/import")).status).toBe(403);
  });
  it("keeps unrelated-customer legacy/document ownership restrictions", async () => {
    await db.update(customers).set({ parentCustomerId: null }).where(eq(customers.id, f.branch2Id));
    const plan = planAuditImport(f.files, await data.loadAuditData(f.companyId));
    expect(plan.errors.some(e => e.column === "legacy_contract_ids" && e.message.includes("cross-customer"))).toBe(true);
    expect(plan.errors.some(e => e.column === "document_id" && e.message.includes("cross-customer"))).toBe(true);
    expect((await executeAuditImport(f.files, f.companyId, f.userId)).successes).toEqual([]);
  });
  it("rolls back deletions and earlier additions when any later customer write fails; never logs committed removals", async () => {
    const extra = structuredClone(f.files);
    const main = extra.tables["contracts.csv"][0];
    extra.tables["contracts.csv"].push({ ...main, values: { ...main.values, contract_ref: "failure", agreement_ref: "failure",
      customer_id: f.branch2Id, legacy_contract_ids: "", legal_name: "force-failure" } });
    extra.tables["payments.csv"].push({ ...extra.tables["payments.csv"][0],
      values: { ...extra.tables["payments.csv"][0].values, contract_ref: "failure" } });
    const before = await snapshot(), original = persistence.writeTerm, log = vi.spyOn(logger, "info");
    vi.spyOn(persistence, "writeTerm").mockImplementation(async (...args) => {
      if (args[4].legalName === "force-failure") throw new Error("Injected disposable failure");
      return original(...args);
    });
    const result = await executeAuditImport(extra, f.companyId, f.userId);
    expect(result.errors).toEqual([]); expect(result.successes).toEqual([]); expect(result.failures).toHaveLength(1);
    expect(result.failures[0].error).toContain("Entire upload rolled back");
    expect("removed" in result && result.removed).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(log).not.toHaveBeenCalledWith(expect.anything(), "Imported contract removals committed");
  });
  it.each(["season", "document", "hierarchy"])("rechecks stale %s eligibility after waiting for the company lock", async kind => {
    let unlock!: () => void, acquired!: () => void, initialRead!: () => void;
    const gate = new Promise<void>(r => acquired = r), release = new Promise<void>(r => unlock = r);
    const read = new Promise<void>(r => initialRead = r);
    const holder = db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contract-audit:${f.companyId}`}))`);
      acquired(); await release;
    });
    await gate;
    const original = data.loadAuditData;
    vi.spyOn(data, "loadAuditData").mockImplementation(async (...args) => {
      const d = await original(...args); if (!args[1]) initialRead(); return d;
    });
    const pending = executeAuditImport(f.files, f.companyId, f.userId);
    try {
      await read;
      const d = await original(f.companyId), term = d.terms[0];
      if (kind === "hierarchy") await db.update(customers).set({ parentCustomerId: null }).where(eq(customers.id, f.branch2Id));
      else await db.transaction(async tx => {
        await persistence.lockAgreement(tx, f.companyId, term.agreementId);
        if (kind === "season") await persistence.writeTerm(tx, f.companyId, f.userId, null, {
          agreementId: term.agreementId, line: term.line, form: term.form, seasonLabel: "Manual 2027", startDate: "2027-01-01", endDate: "2027-12-31", status: "draft", billingType: "equal_monthly",
        }, "Created in the Contract Center");
        else await tx.insert(termDocuments).values({ companyId: f.companyId, termId: term.id, kind: "other",
          filename: "manual-protected.pdf", storageObjectPath: "/objects/disposable-no-blob", mimeType: "application/pdf", uploadedBy: f.userId });
      });
    } finally { unlock(); await holder; await pending; }
    const before = await snapshot(), result = await pending;
    expect(result.successes).toEqual([]); expect(result.failures).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
  });
  it("serializes competing consolidations without duplicate transfers or partial results", async () => {
    const results = await Promise.all([1, 2].map(() => executeAuditImport(f.files, f.companyId, f.userId)));
    expect(results.filter(r => r.successes.length === 1)).toHaveLength(1);
    expect(results.filter(r => r.failures.length || r.errors.length)).toHaveLength(1);
    const after = await snapshot(); expect(after.agreements).toHaveLength(1); expect(after.links).toHaveLength(4);
  });
}, 60000);
