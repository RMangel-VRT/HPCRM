import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { companies, customers, propertyManagementCompanies, qboConnections, qboCustomerReviews, settings,
  pool as libraryPool, type Customer } from "@workspace/db";
import { db, pool } from "../db";
import { customerPatchApp, managementCompanyPatchApp } from "../test/customerPatchApp";
import { normalize, qboToFields } from "./qboCustomerMap";

// Real API pool and real write-flag queries. Only remote requests are mocked.
const remote = vi.hoisted(() => vi.fn());
vi.mock("./qboClient", async original => ({
  ...await original<typeof import("./qboClient")>(), qboRequest: remote,
}));
import { queueCustomerPush, retryPendingCustomerPushes, waitForCustomerPushes } from "./qboCustomerPush";
import { withCustomerSyncLock } from "./qboCustomerSync";
import { markPending, writeCustomer } from "./qboCustomerWrites";
import { logger } from "../lib/logger";

// No connection has been acquired yet. Exercise the ACTUAL exported API pool
// with five connections, not a substitute library db or a mocked executor.
pool.options.max = 5;
const ids: string[] = [];
let companyId: string;
const address = { Line1: "1 St", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80000" };
const baseline = normalize(qboToFields({ Id: "synthetic", SyncToken: "1", DisplayName: "Synthetic",
  BillAddr: address, ShipAddr: address }));
const response = (body: unknown) => new Response(JSON.stringify(body));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
async function seedCompany(enabled = false) {
  const id = `cq32-${randomUUID()}`; ids.push(id);
  await db.insert(companies).values({ id, slug: id, name: "Synthetic queue regression" });
  await db.insert(settings).values({ companyId: id, companyName: "Synthetic queue regression",
    featureFlags: JSON.stringify({ qbo_write: enabled }) });
  await db.insert(qboConnections).values({ companyId: id, realmId: "synthetic",
    accessTokenEnc: "synthetic", refreshTokenEnc: "synthetic", tokenExpiresAt: new Date(),
    status: "connected", customerBaselineAt: new Date(0) });
  return id;
}
async function seedCustomers(n: number, extra: Partial<Customer> = {}, company = companyId) {
  return db.insert(customers).values(Array.from({ length: n }, (_, i) => ({
    companyId: company, name: "Synthetic", street: "1 St", city: "Denver", state: "CO", zip: "80000",
    status: "active" as const, qboCustomerId: `synthetic-${randomUUID()}`, qboSyncToken: "1",
    qboBaseline: baseline, billingPhone: `303555${String(i).padStart(4, "0")}`,
    qboSyncState: "pending_push" as const, ...extra,
  }))).returning();
}
const get = async (id: string) => (await db.select().from(customers).where(eq(customers.id, id)))[0];
async function responsive() {
  const start = performance.now();
  await Promise.race([db.execute(sql`select 1`), new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("Unrelated API query stalled")), 2000);
    timer.unref();
  })]);
  expect(performance.now() - start).toBeLessThan(2000);
  expect(pool.totalCount).toBeLessThanOrEqual(5);
  return Math.round(performance.now() - start);
}
beforeEach(async () => {
  remote.mockReset();
  remote.mockImplementation(async (_company, method, _path, payload) => {
    expect(method).toBe("POST");
    // Simulate independent qboRequest connection/token access while lock is held.
    await db.select().from(qboConnections).where(eq(qboConnections.companyId, _company));
    return response({ Customer: { Id: payload.Id, SyncToken: "2", DisplayName: "Synthetic",
      BillAddr: address, ShipAddr: address } });
  });
  companyId = await seedCompany();
});
afterAll(async () => {
  for (const id of ids) {
    await waitForCustomerPushes(id);
    await db.delete(companies).where(eq(companies.id, id));
  }
  await pool.end(); await libraryPool.end();
}, 60_000);

it.each([false, true])("30 same-company enqueues finish on max-five API pool, writes=%s", async enabled => {
  expect(pool).not.toBe(libraryPool);
  expect(pool.options.max).toBe(5);
  await db.update(settings).set({ featureFlags: JSON.stringify({ qbo_write: enabled }) }).where(eq(settings.companyId, companyId));
  const rows = await seedCustomers(30);
  const entered = deferred(), release = deferred();
  const normal = remote.getMockImplementation()!;
  remote.mockImplementation(async (...args) => { entered.resolve(); await release.promise; return normal(...args); });
  const start = performance.now();
  await withCustomerSyncLock(companyId, async () => {
    for (const c of rows) queueCustomerPush(companyId, c.id);
  });
  // Include scheduler retries while the normal worker is active.
  const retrying = retryPendingCustomerPushes(companyId);
  if (enabled) await entered.promise;
  let queryMs: number;
  try { queryMs = await responsive(); } finally { release.resolve(); }
  await retrying; await waitForCustomerPushes(companyId);
  const after = await db.select().from(customers).where(eq(customers.companyId, companyId));
  expect(after.every(c => c.qboSyncState === (enabled ? "in_sync" : "pending_push"))).toBe(true);
  expect(remote).toHaveBeenCalledTimes(enabled ? 30 : 0);
  expect(pool.waitingCount).toBe(0);
  logger.info({ enabled, count: 30, elapsedMs: Math.round(performance.now() - start), queryMs,
    poolMax: pool.options.max }, "CQ3.2 bulk");
}, 60_000);

it("management-company HTTP address edit with 15 customers returns before remote work completes", async () => {
  await db.update(settings).set({ featureFlags: '{"qbo_write":true}' }).where(eq(settings.companyId, companyId));
  const [management] = await db.insert(propertyManagementCompanies).values({ companyId, name: "Synthetic manager",
    street: "1 St", city: "Denver", state: "CO", zip: "80000" }).returning();
  await seedCustomers(15, { propertyManagementCompanyId: management.id, billToMode: "management_company" });
  const entered = deferred(), release = deferred();
  const normal = remote.getMockImplementation()!;
  remote.mockImplementation(async (...args) => { entered.resolve(); await release.promise; return normal(...args); });
  const start = performance.now();
  const result = await request(managementCompanyPatchApp(companyId))
    .patch(`/api/property-management-companies/${management.id}`).send({ zip: "80001" }).timeout(5000);
  try {
    expect(result.status).toBe(200);
    await entered.promise;
    const queryMs = await responsive();
    expect(remote).toHaveBeenCalledTimes(1);
    logger.info({ linked: 15, responseMs: Math.round(performance.now() - start), queryMs }, "CQ3.2 management PATCH");
  } finally { release.resolve(); await waitForCustomerPushes(companyId); }
  expect(remote).toHaveBeenCalledTimes(15);
}, 60_000);

it("real held lock returns HTTP 503 near 15s; background stays pending with no review and recovers", async () => {
  const [c] = await seedCustomers(1);
  const [management] = await db.insert(propertyManagementCompanies).values({ companyId, name: "Held manager" }).returning();
  const holder = await pool.connect();
  await holder.query("BEGIN");
  await holder.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`qbo-customers:${companyId}`]);
  const start = performance.now();
  try {
    const retrying = retryPendingCustomerPushes(companyId);
    const saving = request(customerPatchApp(companyId)).patch(`/api/customers/${c.id}`).send({ ranking: "preferred" });
    const directory = request(managementCompanyPatchApp(companyId))
      .patch(`/api/property-management-companies/${management.id}`).send({ zip: "80001" });
    const running = Promise.all([saving, directory, retrying]);
    await responsive();
    const [result, managerResult] = await running;
    const elapsed = performance.now() - start;
    expect(result.status).toBe(503);
    expect(managerResult.status).toBe(503);
    expect(result.body.message).toBe("Customer sync busy, try again");
    expect(managerResult.body.message).toBe("Customer sync busy, try again");
    expect(elapsed).toBeGreaterThan(14_000); expect(elapsed).toBeLessThan(19_000);
    expect((await get(c.id)).qboSyncState).toBe("pending_push");
    expect(await db.select().from(qboCustomerReviews).where(eq(qboCustomerReviews.companyId, companyId))).toEqual([]);
    expect(pool.waitingCount).toBe(0);
    logger.info({ elapsedMs: Math.round(elapsed), statuses: [result.status, managerResult.status] }, "CQ3.2 lock contention");
  } finally { await holder.query("ROLLBACK"); holder.release(); }
  await db.update(settings).set({ featureFlags: '{"qbo_write":true}' }).where(eq(settings.companyId, companyId));
  await retryPendingCustomerPushes(companyId);
  await responsive();
  expect((await get(c.id)).qboSyncState).toBe("in_sync");
  expect(remote).toHaveBeenCalledTimes(1);
}, 30_000);

it("pending ids deduplicate in order; an in-flight re-enqueue gets its own turn", async () => {
  await db.update(settings).set({ featureFlags: '{"qbo_write":true}' }).where(eq(settings.companyId, companyId));
  const [first, second, third] = await seedCustomers(3);
  const entered = deferred(), release = deferred();
  const order: string[] = [];
  const normal = remote.getMockImplementation()!;
  remote.mockImplementation(async (...args) => {
    order.push(args[3].Id);
    if (order.length === 1) { entered.resolve(); await release.promise; }
    return normal(...args);
  });
  await withCustomerSyncLock(companyId, async () => {
    for (const c of [first, second, second, third, second]) queueCustomerPush(companyId, c.id);
  });
  await entered.promise;
  // The edit waits for the first push, then commits and registers another turn.
  const edited = withCustomerSyncLock(companyId, tx => writeCustomer(tx, first.id, companyId, { billingPhone: "999" }));
  release.resolve(); await edited; await waitForCustomerPushes(companyId);
  expect(order).toEqual([first.qboCustomerId, second.qboCustomerId, third.qboCustomerId, first.qboCustomerId]);
  expect((await get(first.id)).qboBaseline).toMatchObject({ phone: "999" });
});

it("rollback discards work, nested locks reuse tx, and a failure does not strand the next id", async () => {
  const [c, next] = await seedCustomers(2);
  const discardedCalls = vi.spyOn(pool, "connect");
  await expect(withCustomerSyncLock(companyId, async tx => {
    await withCustomerSyncLock(companyId, async nested => { expect(nested).toBe(tx); await markPending(nested, c); });
    throw new Error("rollback");
  })).rejects.toThrow("rollback");
  await waitForCustomerPushes(companyId);
  expect(discardedCalls).toHaveBeenCalledTimes(1);
  discardedCalls.mockRestore();
  const calls = vi.spyOn(pool, "connect");
  await withCustomerSyncLock(companyId, async () => {
    queueCustomerPush(companyId, "missing-customer"); queueCustomerPush(companyId, next.id);
  });
  await waitForCustomerPushes(companyId);
  // Writer + failed item + next item, but never an escaped write-flag query.
  expect(calls).toHaveBeenCalledTimes(3);
  calls.mockRestore();
  expect((await get(next.id)).qboSyncState).toBe("pending_push");
  expect(remote).not.toHaveBeenCalled();
});

it("another company drains while the first company's remote request is blocked", async () => {
  await db.update(settings).set({ featureFlags: '{"qbo_write":true}' }).where(eq(settings.companyId, companyId));
  const [c] = await seedCustomers(1);
  const other = await seedCompany(false);
  const [d] = await seedCustomers(1, {}, other);
  const entered = deferred(), release = deferred();
  const normal = remote.getMockImplementation()!;
  remote.mockImplementation(async (...args) => { entered.resolve(); await release.promise; return normal(...args); });
  await withCustomerSyncLock(companyId, async () => queueCustomerPush(companyId, c.id));
  await entered.promise;
  try {
    await withCustomerSyncLock(other, async () => queueCustomerPush(other, d.id));
    await waitForCustomerPushes(other);
    await responsive();
    await expect(withCustomerSyncLock(other, () => withCustomerSyncLock(companyId, async () => {})))
      .rejects.toThrow("CUSTOMER_SYNC_COMPANY_MISMATCH");
  } finally { release.resolve(); await waitForCustomerPushes(companyId); }
});
