import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, propertyManagementCompanies, qboConnections, qboCustomerCache, qboCustomerReviews, pool as schemaPool,
  type Customer, type QboConnection } from "@workspace/db";
import { db, pool } from "../db";
import { compareRemote } from "./qboCustomerComparison";
import { crmToQboFields, normalize, qboToFields } from "./qboCustomerMap";
import { resolveBillTo } from "./customerBilling";
import { invoiceBillTo } from "./invoiceBillTo";

const remote = vi.hoisted(() => vi.fn());
vi.mock("./qboClient", () => ({ qboRequest: remote, isQboWriteEnabled: vi.fn().mockResolvedValue(false) }));
import { customerSyncStatus, ingestQboCustomers, raiseCustomerReview, runFullCustomerPull,
  runIncrementalCustomerSync, runInitialCustomerSync, sweepQboCustomers, withCustomerSyncLock } from "./qboCustomerSync";

// Real PostgreSQL, synthetic company-owned fixtures only. Every remote request is mocked.
const companyIds: string[] = [];
let a: string, b: string;
const baseline = new Date("2026-01-02T00:00:00Z");
const addr = { Line1: "1 Billing Way", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80000" };
const raw = (overrides: Record<string, unknown> = {}) => ({
  Id: "q1", DisplayName: "QBO billing name", SyncToken: "1", Active: true, BillAddr: addr,
  PrimaryEmailAddr: { Address: "ap@example.test" },
  MetaData: { CreateTime: "2026-01-01T00:00:00Z", LastUpdatedTime: "2026-01-03T00:00:00Z" }, ...overrides,
});
const response = (rows: unknown[]) => ({ ok: true, json: async () => ({ QueryResponse: { Customer: rows } }) });
async function conn(companyId: string) {
  return (await db.select().from(qboConnections).where(eq(qboConnections.companyId, companyId)))[0];
}
async function setConn(companyId: string, values: Partial<QboConnection>) {
  await db.update(qboConnections).set(values).where(eq(qboConnections.companyId, companyId));
}
async function makeCustomer(companyId = a, values: Partial<Customer> = {}) {
  return (await db.insert(customers).values({ companyId, name: "Property name", street: "2 Property St", city: "Denver", state: "CO", zip: "80000",
    qboCustomerId: "q1", ...values }).returning())[0];
}
async function reload(id: string, companyId = a) {
  return (await db.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, id))))[0];
}
async function reviews(companyId = a) {
  return db.select().from(qboCustomerReviews).where(eq(qboCustomerReviews.companyId, companyId));
}
async function cache(companyId = a) {
  return db.select().from(qboCustomerCache).where(eq(qboCustomerCache.companyId, companyId));
}
async function ready(companyId = a) {
  await setConn(companyId, { customerBaselineAt: baseline, customerCdcCursor: new Date(), customerFullPullAt: new Date() });
}
async function linked() {
  const q = normalize(qboToFields(raw()));
  return makeCustomer(a, { billingName: q.displayName, billingEmails: q.emails,
    billToMode: "custom", billStreet: addr.Line1, billCity: addr.City, billState: "CO", billZip: "80000",
    qboBaseline: q, qboSyncToken: "1" });
}
beforeAll(async () => {
  // Verify these tests never run against a schema lacking the task's dev migration.
  await db.execute(sql`select normalized from qbo_customer_cache limit 0`);
});
beforeEach(async () => {
  remote.mockReset();
  a = `cq2-${randomUUID()}`; b = `cq2-${randomUUID()}`;
  companyIds.push(a, b);
  await db.insert(companies).values([{ id: a, slug: a, name: "CQ2 synthetic A" }, { id: b, slug: b, name: "CQ2 synthetic B" }]);
  await db.insert(qboConnections).values([a, b].map(companyId => ({
    companyId, realmId: "synthetic", accessTokenEnc: "not-a-token", refreshTokenEnc: "not-a-token",
    tokenExpiresAt: new Date(), status: "connected" as const,
  })));
});
afterAll(async () => {
  if (companyIds.length) await db.delete(companies).where(inArray(companies.id, companyIds));
  await pool.end(); await schemaPool.end();
});

describe("comparison and mirror ingestion", () => {
  it("implements all four comparison cases", () => {
    const q = normalize(qboToFields(raw()));
    const b = { ...q, phone: "111", mobile: "111", companyName: "old", contactName: "old" };
    const c = { ...q, phone: "222", mobile: "111", companyName: q.companyName, contactName: "crm" };
    const actual = compareRemote(q, c, b, ["displayName", "phone", "mobile", "companyName", "contactName"]);
    expect(actual.fields.displayName).toBeUndefined(); // q == b
    expect(actual.fields.phone?.bothChanged).toBe(true);
    expect(actual.fields.mobile?.bothChanged).toBe(false);
    expect(actual.baseline.companyName).toBe(q.companyName); // q == c, q != b
    expect(actual.fields.companyName).toBeUndefined();
    expect(actual.fields.contactName?.bothChanged).toBe(true);
  });
  it("pre-baseline ingestion upserts all kinds cache-only, including bound inactive/deleted records", async () => {
    const c = await linked();
    const before = await reload(c.id);
    await ingestQboCustomers(a, [raw({ Active: false, SyncToken: "2" }),
      raw({ Id: "sub", ParentRef: { value: "parent" }, Job: true, MetaData: { CreateTime: "2026-12-01T00:00:00Z" } }),
      raw({ Id: "new", MetaData: { CreateTime: "2026-12-01T00:00:00Z" } })]);
    await ingestQboCustomers(a, [{ Id: "q1", status: "Deleted" }]);
    expect(await reload(c.id)).toEqual(before);
    expect(await reviews()).toEqual([]);
    expect(await cache()).toHaveLength(3);
    expect((await cache()).find(r => r.qboId === "q1")?.active).toBe(false);
    expect((await conn(a)).customerBaselineAt).toBeNull();
    expect((await conn(a)).customerCdcCursor).toBeNull();
  });
  it("own-write echoes do not raise field-change reviews", async () => {
    await ready(); const c = await linked();
    await ingestQboCustomers(a, [raw({ PrimaryEmailAddr: { Address: "echo@example.test" } })]);
    expect(await reviews()).toEqual([]);
    expect((await reload(c.id)).billingEmails).toEqual(["ap@example.test"]);
  });
  it("merges repeated QBO changes into one current snapshot without changing CRM billing", async () => {
    await ready(); const c = await linked();
    await ingestQboCustomers(a, [raw({ SyncToken: "2", PrimaryEmailAddr: { Address: "first@example.test" } })]);
    await ingestQboCustomers(a, [raw({ SyncToken: "3", PrimaryEmailAddr: { Address: "latest@example.test" }, PrimaryPhone: { FreeFormNumber: "555-1234" } })]);
    const rows = await reviews();
    expect(rows).toHaveLength(1);
    expect(rows[0].fields?.emails).toMatchObject({ qbo: ["latest@example.test"], crm: ["ap@example.test"], bothChanged: false });
    expect(rows[0].fields?.phone).toBeDefined();
    expect(rows[0].qboSnapshot).toMatchObject({ emails: ["latest@example.test"] });
    const after = await reload(c.id);
    expect(after.billingEmails).toEqual(c.billingEmails);
    expect(after.qboSyncToken).toBe("1");
  });
  it("advances agreeing-field baseline but retains the token when another field needs review", async () => {
    await ready(); const c = await linked();
    await db.update(customers).set({ billingPhone: "555" }).where(eq(customers.id, c.id));
    await ingestQboCustomers(a, [raw({ SyncToken: "2", PrimaryPhone: { FreeFormNumber: "555" }, PrimaryEmailAddr: { Address: "changed@example.test" } })]);
    expect((await reload(c.id)).qboBaseline).toMatchObject({ phone: "555" });
    expect((await reload(c.id)).qboSyncToken).toBe("1");
    expect((await reviews())[0].fields?.phone).toBeUndefined();
  });
  it("stores tokens when there is no new review and never auto-creates CRM customers", async () => {
    await ready(); const c = await linked();
    await ingestQboCustomers(a, [raw({ SyncToken: "2" }), raw({ Id: "unbound" })]);
    expect((await reload(c.id)).qboSyncToken).toBe("2");
    expect(await db.select().from(customers).where(eq(customers.companyId, a))).toHaveLength(1);
  });
  it("does not mistake jsonb address key order or CRM-only edits for a QuickBooks change", async () => {
    await ready(); const c = await linked();
    await db.update(customers).set({ billStreet: "CRM-only address edit" }).where(eq(customers.id, c.id));
    await ingestQboCustomers(a, [raw({ SyncToken: "2" })]);
    expect(await reviews()).toEqual([]);
    expect((await reload(c.id)).billStreet).toBe("CRM-only address edit");
    expect((await reload(c.id)).qboSyncToken).toBe("2");
  });
  it("new top-level records and sub-customers require creation strictly after baseline", async () => {
    await ready();
    for (const sub of [false, true]) for (const [key, time] of [["old", "2026-01-01"], ["equal", "2026-01-02"], ["new", "2026-01-03"]]) {
      await ingestQboCustomers(a, [raw({ Id: `${sub}-${key}`, ...(sub ? { ParentRef: { value: "p" }, Job: true } : {}),
        MetaData: { CreateTime: `${time}T00:00:00Z` } })]);
    }
    expect((await reviews()).map(r => [r.qboId, r.kind]).sort()).toEqual([
      ["false-new", "new_in_qbo"], ["true-new", "sub_customer"],
    ]);
    expect(await cache()).toHaveLength(6);
    expect(await db.select().from(customers).where(eq(customers.companyId, a))).toHaveLength(0);
  });
  it("raises inactive and deleted bound reviews without CRM lifecycle mutations", async () => {
    await ready(); const c = await linked();
    await ingestQboCustomers(a, [raw({ Active: false, SyncToken: "2" })]);
    await ingestQboCustomers(a, [{ Id: "q1", status: "Deleted" }]);
    expect((await reviews()).map(r => r.kind)).toEqual(expect.arrayContaining(["qbo_inactive", "qbo_removed"]));
    expect((await reload(c.id)).status).toBe("active");
    expect((await cache())[0].normalized).toMatchObject({ displayName: "QBO billing name" });
  });
  it("keeps companies isolated even for identical QBO IDs", async () => {
    await ready(a); await ready(b); await linked();
    const other = await makeCustomer(b, { billingEmails: ["other@example.test"] });
    await ingestQboCustomers(a, [raw({ SyncToken: "2", PrimaryEmailAddr: { Address: "remote@example.test" } })]);
    expect(await cache(b)).toEqual([]); expect(await reviews(b)).toEqual([]);
    expect((await reload(other.id, b)).billingEmails).toEqual(["other@example.test"]);
    expect((await customerSyncStatus(b)).openReviews).toBe(0);
  });
});

describe("initial, full and incremental synchronization", () => {
  it("initial sync hydrates empty billing fields only, preserves conflicts/pending push and is idempotent", async () => {
    const c = await makeCustomer(a, { billingEmails: ["keep@example.test"], billingPhone: "123" });
    remote.mockResolvedValue(response([raw({ PrimaryPhone: { FreeFormNumber: "999" }, SalesTermRef: { value: "term" } })]));
    const result = await runInitialCustomerSync(a, "synthetic-user");
    const after = await reload(c.id);
    expect(after.billingName).toBe("QBO billing name");
    expect(after.billingEmails).toEqual(["keep@example.test"]);
    expect(after.billingPhone).toBe("123");
    expect(after.billToMode).toBe("custom"); expect(after.billStreet).toBe("1 Billing Way");
    expect(after.qboTermId).toBe("term"); expect(after.qboSyncState).toBe("pending_push");
    expect(after.qboSyncToken).toBe("1"); expect(after.qboBaseline).toMatchObject({ termId: "term" });
    expect(result.linkedUpdated).toBe(1); expect(result.reviewsRaised).toBe(1);
    const established = (await conn(a)).customerBaselineAt;
    await runInitialCustomerSync(a, "synthetic-user");
    expect(await reviews()).toHaveLength(1);
    expect((await conn(a)).customerBaselineAt).toEqual(established);
    expect((await reload(c.id)).billingEmails).toEqual(["keep@example.test"]);
  });
  it("uses in_sync only when all owned normalized fields agree", async () => {
    const c = await makeCustomer(a, { street: addr.Line1 });
    remote.mockResolvedValue(response([raw({ ShipAddr: addr })]));
    await runInitialCustomerSync(a, "actor");
    expect((await reload(c.id)).qboSyncState).toBe("in_sync");
    expect((await reload(c.id)).billToMode).toBe("property");
  });
  it("an initial-sync retry never refills billing fields cleared in CRM after reconciliation", async () => {
    const c = await makeCustomer();
    remote.mockResolvedValue(response([raw()]));
    await runInitialCustomerSync(a, "actor");
    await db.update(customers).set({ billingEmails: [], billingName: null, billingPhone: null })
      .where(eq(customers.id, c.id));
    const before = await reload(c.id), originalBaseline = (await conn(a)).customerBaselineAt;
    const retry = await runInitialCustomerSync(a, "actor");
    const after = await reload(c.id);
    expect(retry.linkedUpdated).toBe(0);
    expect(after.billingEmails).toEqual([]); expect(after.billingName).toBeNull();
    expect(after.billingPhone).toBeNull();
    expect(after.qboBaseline).toEqual(before.qboBaseline);
    expect(after.qboSyncToken).toBe(before.qboSyncToken);
    expect((await conn(a)).customerBaselineAt).toEqual(originalBaseline);
  });
  it("an initial-sync retry reviews remote changes without advancing unresolved baselines or tokens", async () => {
    const c = await makeCustomer(a, { billingEmails: ["keep@example.test"] });
    remote.mockResolvedValue(response([raw()]));
    await runInitialCustomerSync(a, "actor");
    const before = await reload(c.id), originalReviews = await reviews();
    expect(originalReviews).toHaveLength(1);
    remote.mockResolvedValue(response([raw({ SyncToken: "2", PrimaryEmailAddr: { Address: "new-qbo@example.test" } })]));
    const retry = await runInitialCustomerSync(a, "actor");
    const after = await reload(c.id), open = await reviews();
    expect(retry.linkedUpdated).toBe(0); expect(retry.reviewsRaised).toBe(1);
    expect(after.billingEmails).toEqual(["keep@example.test"]);
    expect(after.qboBaseline).toEqual(before.qboBaseline);
    expect(after.qboSyncToken).toBe(before.qboSyncToken);
    expect(open).toHaveLength(1); expect(open[0].id).toBe(originalReviews[0].id);
    expect(open[0].fields?.emails).toMatchObject({
      qbo: ["new-qbo@example.test"], crm: ["keep@example.test"], baseline: ["ap@example.test"], bothChanged: true,
    });
    expect(open[0].qboSnapshot).toMatchObject({ emails: ["new-qbo@example.test"] });
  });
  it("preserves existing custom address components and live management-company choices", async () => {
    const c = await makeCustomer(a, { billToMode: "custom", billStreet: "Keep Street", billCity: "Keep City" });
    remote.mockResolvedValue(response([raw()]));
    await runInitialCustomerSync(a, "actor");
    const after = await reload(c.id);
    expect(after.billStreet).toBe("Keep Street"); expect(after.billCity).toBe("Keep City");
    expect(after.billState).toBe("CO"); expect((await reviews())[0].fields?.billAddr).toBeDefined();
  });
  it("management-company addresses stay live while differing remote addresses are reviewed, not copied", async () => {
    const [pm] = await db.insert(propertyManagementCompanies).values({ companyId: a, name: "Directory Owner",
      street: "Live directory street", city: "Denver", state: "CO", zip: "80000" }).returning();
    const c = await makeCustomer(a, { billToMode: "management_company", propertyManagementCompanyId: pm.id });
    remote.mockResolvedValue(response([raw({ ShipAddr: { ...addr, Line1: c.street } })]));
    await runInitialCustomerSync(a, "actor");
    const after = await reload(c.id);
    expect(after.billToMode).toBe("management_company"); expect(after.billStreet).toBeNull();
    expect(after.qboSyncState).toBe("pending_push");
    expect((await reviews())[0].fields?.billAddr).toMatchObject({ crm: { street: "c/o Directory Owner", street2: "Live directory street" } });
  });
  it("initial-sync retries retain the original baseline and flag only post-baseline unbound subjects", async () => {
    await ready();
    remote.mockResolvedValue(response([
      raw({ Id: "old-sub", ParentRef: { value: "p" } }),
      raw({ Id: "new-sub", ParentRef: { value: "p" }, MetaData: { CreateTime: "2026-01-03T00:00:00Z" } }),
      raw({ Id: "new-top", MetaData: { CreateTime: "2026-01-03T00:00:00Z" } }),
    ]));
    await runInitialCustomerSync(a, "actor"); await runInitialCustomerSync(a, "actor");
    expect((await conn(a)).customerBaselineAt).toEqual(baseline);
    expect((await reviews()).map(r => r.kind).sort()).toEqual(["new_in_qbo", "sub_customer"]);
  });
  it("lists master-parent linked branch exceptions and leaves their metadata untouched", async () => {
    const parent = await makeCustomer(a, { qboCustomerId: null, isParent: "true", branchBillingMode: "master" });
    const branch = await makeCustomer(a, { parentCustomerId: parent.id });
    remote.mockResolvedValue(response([raw()]));
    const result = await runInitialCustomerSync(a, "actor");
    expect(result.branchesLinkedUnderMasterParent).toEqual([{ customerId: branch.id, name: branch.name, qboId: "q1" }]);
    expect(await reload(branch.id)).toEqual(branch);
    await ingestQboCustomers(a, [raw({ SyncToken: "2" })]);
    expect(await reload(branch.id)).toEqual(branch); expect(await reviews()).toEqual([]);
  });
  it("ordinary full pulls before baseline never hydrate or establish baseline/cursor or reviews", async () => {
    const c = await makeCustomer();
    remote.mockResolvedValue(response([raw({ Active: false })]));
    await runFullCustomerPull(a);
    expect(await reload(c.id)).toEqual(c);
    const after = await conn(a);
    expect(after.customerBaselineAt).toBeNull(); expect(after.customerCdcCursor).toBeNull();
    expect(after.customerFullPullAt).toBeInstanceOf(Date); expect(await reviews()).toEqual([]);
  });
  it("skips incremental before initial sync without a remote request", async () => {
    expect(await runIncrementalCustomerSync(a)).toMatchObject({ skipped: true });
    expect(remote).not.toHaveBeenCalled();
  });
  it("advances CDC cursor to request start only after successful ingestion, including deletion", async () => {
    await ready(); await linked();
    const before = new Date();
    remote.mockResolvedValue({ ok: true, json: async () => ({ CDCResponse: [{ QueryResponse: [{ Customer: [{ Id: "q1", status: "Deleted" }] }] }] }) });
    await runIncrementalCustomerSync(a);
    expect((await conn(a)).customerCdcCursor!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(remote.mock.calls[0][2]).toMatch(/^\/cdc\?entities=Customer/);
    expect((await reviews())[0].kind).toBe("qbo_removed");
  });
  it("keeps CDC cursor and mirrors unchanged on ingest failure or malformed/failed response", async () => {
    await ready(); const before = await conn(a);
    for (const reply of [
      { ok: false, status: 500 },
      { ok: true, json: async () => ({ Fault: {}, CDCResponse: [] }) },
      { ok: true, json: async () => ({ CDCResponse: [{ QueryResponse: [{ Customer: [raw(), { DisplayName: "No Id" }] }] }] }) },
    ]) {
      remote.mockResolvedValue(reply);
      await expect(runIncrementalCustomerSync(a)).rejects.toBeDefined();
      expect((await conn(a)).customerCdcCursor).toEqual(before.customerCdcCursor);
      expect(await cache()).toEqual([]);
    }
  });
  it("uses a full pull for cursors older than 29 days and resets the cursor", async () => {
    await ready(); await setConn(a, { customerCdcCursor: new Date(Date.now() - 30 * 86400_000) });
    remote.mockResolvedValue(response([raw()]));
    await runIncrementalCustomerSync(a);
    expect(remote.mock.calls[0][2]).toMatch(/^\/query/);
    expect((await conn(a)).customerCdcCursor!.getTime()).toBeGreaterThan(Date.now() - 10_000);
  });
  it("paginates active/inactive full results and deactivates only missing cache rows", async () => {
    await ready(); await makeCustomer(a, { qboCustomerId: "inactive" }); await makeCustomer(a, { qboCustomerId: "missing" });
    await ingestQboCustomers(a, [raw({ Id: "missing" })]);
    const first = Array.from({ length: 1000 }, (_, i) => raw({ Id: `page-${i}` }));
    remote.mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response([raw({ Id: "inactive", Active: false })]));
    const result = await runFullCustomerPull(a);
    expect(result).toMatchObject({ pulled: 1001, inserted: 1001, updated: 0, deactivated: 1, staleBindings: 1, inactiveBindings: 1 });
    expect(decodeURIComponent(remote.mock.calls[0][2])).toContain("Active IN (true,false)");
    expect(decodeURIComponent(remote.mock.calls[1][2])).toContain("STARTPOSITION 1001");
    expect((await reviews()).map(r => r.kind)).toEqual(expect.arrayContaining(["qbo_inactive", "qbo_removed"]));
  }, 60_000);
  it("failed/incomplete full pagination never deactivates cache, commits ingestion, or advances timestamps", async () => {
    await ready(); await ingestQboCustomers(a, [raw({ Id: "keep" })]);
    const before = await conn(a);
    for (const bad of [{ ok: false, status: 500 }, { ok: true, json: async () => ({}) }]) {
      remote.mockReset();
      remote.mockResolvedValueOnce(response(Array.from({ length: 1000 }, (_, i) => raw({ Id: String(i) })))).mockResolvedValueOnce(bad);
      await expect(runFullCustomerPull(a)).rejects.toBeDefined();
      expect((await cache()).map(c => [c.qboId, c.active])).toEqual([["keep", true]]);
      expect((await conn(a)).customerFullPullAt).toEqual(before.customerFullPullAt);
      expect((await conn(a)).customerCdcCursor).toEqual(before.customerCdcCursor);
    }
  });
  it("scheduler contains per-company failures and ignores connected companies without baseline", async () => {
    // Fixtures from prior tests are retained for cleanup; suspend them for this sweep.
    await db.update(qboConnections).set({ status: "revoked" }).where(inArray(qboConnections.companyId, companyIds));
    await setConn(a, { status: "connected", customerBaselineAt: baseline, customerFullPullAt: new Date(0) });
    await setConn(b, { status: "connected", customerBaselineAt: baseline, customerFullPullAt: new Date(0) });
    remote.mockImplementation(async (id: string) => { if (id === a) throw new Error("synthetic failure"); return response([raw()]); });
    await sweepQboCustomers([a, b]);
    expect((await conn(a)).customerCdcCursor).toBeNull();
    expect((await conn(b)).customerFullPullAt!.getTime()).toBeGreaterThan(0);
    const calls = remote.mock.calls.length;
    await sweepQboCustomers([a, b]); // reread under lock suppresses duplicate work for B
    expect(remote.mock.calls.slice(calls).map(c => c[0])).toEqual([a]);
  });
});

describe("PostgreSQL race safety and invoice reader gate", () => {
  it("advisory lock prevents overlap across independent transactions and nested calls reuse it", async () => {
    let entered!: () => void, release!: () => void;
    const hasEntered = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = withCustomerSyncLock(a, async tx => {
      await withCustomerSyncLock(a, async nested => expect(nested).toBe(tx));
      entered(); await gate;
    });
    await hasEntered;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS got", [`qbo-customers:${a}`]);
      expect(locked.rows[0].got).toBe(false);
      const other = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS got", [`qbo-customers:${b}`]);
      expect(other.rows[0].got).toBe(true);
      await client.query("ROLLBACK");
    } finally { client.release(); release(); await first; }
    await withCustomerSyncLock(a, async () => undefined);
  });
  it("overlapping manual full pulls serialize remote reads as well as ingestion", async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
    remote.mockImplementationOnce(async () => { entered(); await gate; return response([raw()]); }).mockResolvedValue(response([raw()]));
    const first = runFullCustomerPull(a); await started;
    const second = runFullCustomerPull(a);
    await new Promise(r => setTimeout(r, 60));
    expect(remote).toHaveBeenCalledTimes(1);
    release(); await Promise.all([first, second]);
    expect(remote).toHaveBeenCalledTimes(2); expect(await cache()).toHaveLength(1);
  });
  it("both partial unique indexes converge QBO-only and customer-only open evidence safely", async () => {
    const c = await makeCustomer();
    await withCustomerSyncLock(a, async tx => {
      await raiseCustomerReview(tx, a, null, "q1", "changed_in_qbo", { phone: { qbo: "1", crm: "2", baseline: null, bothChanged: true } }, {});
      await raiseCustomerReview(tx, a, c.id, null, "changed_in_qbo", { mobile: { qbo: "3", crm: "4", baseline: null, bothChanged: true } }, {});
    });
    await Promise.all([1, 2].map(() => withCustomerSyncLock(a, tx =>
      raiseCustomerReview(tx, a, c.id, "q1", "changed_in_qbo", { emails: { qbo: ["latest"], crm: [], baseline: [], bothChanged: false } }, { current: true }))));
    const open = (await reviews()).filter(r => r.status === "open");
    expect(open).toHaveLength(1);
    expect(Object.keys(open[0].fields!)).toEqual(expect.arrayContaining(["phone", "mobile", "emails"]));
    expect(open[0]).toMatchObject({ customerId: c.id, qboId: "q1", qboSnapshot: { current: true } });
  });
  it("an insert racing a non-service producer merges its uniqueness conflict into the open review", async () => {
    const c = await makeCustomer(), client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO qbo_customer_reviews(company_id,qbo_id,kind,fields)
        VALUES ($1,'q1','changed_in_qbo',$2::jsonb)`, [a, JSON.stringify({ phone: { qbo: "1", crm: "2", baseline: null, bothChanged: true } })]);
      const racing = withCustomerSyncLock(a, tx => raiseCustomerReview(tx, a, c.id, "q1", "changed_in_qbo",
        { emails: { qbo: ["latest"], crm: [], baseline: [], bothChanged: false } }, { latest: true }));
      await new Promise(r => setTimeout(r, 60));
      await client.query("COMMIT"); await racing;
      const open = (await reviews()).filter(r => r.status === "open");
      expect(open).toHaveLength(1);
      expect(Object.keys(open[0].fields!)).toEqual(expect.arrayContaining(["phone", "emails"]));
      expect(open[0].customerId).toBe(c.id);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("invoice reads the legacy mirror before baseline and live CRM after, including master parents and incomplete fallback", async () => {
    const c = await makeCustomer();
    await ingestQboCustomers(a, [raw()]);
    const bill = () => db.transaction(tx => invoiceBillTo(tx, a, c));
    expect(await bill()).toEqual({ name: c.name, address: "1 Billing Way\nDenver CO 80000" });
    await ready();
    expect(await bill()).toEqual({ name: c.name, address: "2 Property St\nDenver, CO 80000" });
    const parent = await makeCustomer(a, { qboCustomerId: null, billingName: "Master Billing", isParent: "true", billToMode: "custom",
      billStreet: "Parent Billing", billCity: "Boulder", billState: "CO", billZip: "80301" });
    c.parentCustomerId = parent.id;
    expect(await bill()).toEqual({ name: "Master Billing", address: "Parent Billing\nBoulder, CO 80301" });
    await db.update(customers).set({ billCity: null }).where(eq(customers.id, parent.id));
    expect(await bill()).toEqual({ name: "Master Billing", address: "2 Property St\nDenver CO 80000" });
  });
  it("migration reapplies in an isolated rolled-back schema and has SET NULL customer deletion", async () => {
    const client = await pool.connect(), schema = `cq2_test_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}", public;
        CREATE TABLE companies (id varchar PRIMARY KEY);
        CREATE TABLE customers (id varchar PRIMARY KEY);
        CREATE TABLE users (id varchar PRIMARY KEY);
        CREATE TABLE qbo_customer_cache (id varchar PRIMARY KEY);
        CREATE TABLE qbo_connections (id varchar PRIMARY KEY);`);
      const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0068_qbo_customer_sync.sql", import.meta.url), "utf8");
      await client.query(migration); await client.query(migration);
      await client.query("INSERT INTO companies VALUES ('a'); INSERT INTO customers VALUES ('c');");
      await client.query("INSERT INTO qbo_customer_reviews(company_id,customer_id,qbo_id,kind) VALUES ('a','c','q','changed_in_qbo')");
      await client.query("DELETE FROM customers WHERE id='c'");
      expect((await client.query("SELECT customer_id, status FROM qbo_customer_reviews")).rows).toEqual([{ customer_id: null, status: "open" }]);
      expect((await client.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname=$1 AND indexname LIKE 'qbo_customer_reviews_open_%'", [schema])).rows[0].n).toBe(2);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});
