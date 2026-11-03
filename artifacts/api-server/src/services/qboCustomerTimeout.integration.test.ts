import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { companies, customers, qboConnections, qboCustomerCache, qboCustomerReviews, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { normalize, qboToFields } from "./qboCustomerMap";

// Real request deadline, real PostgreSQL locks; no live credentials or network.
vi.mock("./qboCrypto", () => ({ decryptToken: () => "synthetic", encryptToken: (token: string) => `enc:${token}` }));
vi.mock("./qboClient", async importOriginal => ({
  ...await importOriginal<typeof import("./qboClient")>(),
  isQboWriteEnabled: async () => true,
}));
import { pushCustomer } from "./qboCustomerPush";
import { runInitialCustomerSync } from "./qboCustomerSync";
import request from "supertest";
import { customerPatchApp } from "../test/customerPatchApp";

const ids: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => {
  if (ids.length) await db.delete(companies).where(inArray(companies.id, ids));
  await pool.end(); await schemaPool.end();
});
describe("request deadline and company write lock", () => {
  it("commits OAuth rotation independently when initial local reconciliation subsequently rolls back", async () => {
    const companyId = `cq31-rotation-${randomUUID()}`; ids.push(companyId);
    await db.insert(companies).values({ id: companyId, slug: companyId, name: "Synthetic rotation" });
    await db.insert(qboConnections).values({ companyId, realmId: "synthetic", accessTokenEnc: "before",
      refreshTokenEnc: "before", tokenExpiresAt: new Date(0), status: "connected", environment: "sandbox" });
    vi.stubEnv("QBO_CLIENT_ID", "synthetic");
    vi.stubEnv("QBO_CLIENT_SECRET", "synthetic");
    vi.stubEnv("QBO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("QBO_ENVIRONMENT", "sandbox");
    vi.stubEnv("QBO_TOKEN_ENC_KEY", "a".repeat(64));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fresh", refresh_token: "rotated",
        expires_in: 3600, x_refresh_token_expires_in: 8640000 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ QueryResponse: { Customer: [{
        Id: "q1", SyncToken: "1", DisplayName: "Synthetic", MetaData: { CreateTime: "not-a-date" },
      }] } })));
    vi.stubGlobal("fetch", fetch);
    await expect(runInitialCustomerSync(companyId, "synthetic")).rejects.toThrow("Invalid QuickBooks customer timestamp");
    const [after] = await db.select().from(qboConnections).where(eq(qboConnections.companyId, companyId));
    expect(after.refreshTokenEnc).toBe("enc:rotated");
    expect(after.customerBaselineAt).toBeNull();
    expect(after.customerCdcCursor).toBeNull();
    expect(await db.select().from(qboCustomerCache).where(eq(qboCustomerCache.companyId, companyId))).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("a real 30-second request abort fails only the push and releases a waiting customer save", async () => {
    const companyId = `cq31-timeout-${randomUUID()}`; ids.push(companyId);
    await db.insert(companies).values({ id: companyId, slug: companyId, name: "Synthetic timeout" });
    await db.insert(qboConnections).values({ companyId, realmId: "synthetic", accessTokenEnc: "synthetic",
      refreshTokenEnc: "synthetic", tokenExpiresAt: new Date(Date.now() + 3_600_000),
      status: "connected", customerBaselineAt: new Date(0), environment: "sandbox" });
    const address = { Line1: "1 St", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80000" };
    const baseline = normalize(qboToFields({ Id: "q1", SyncToken: "1", DisplayName: "Test", BillAddr: address, ShipAddr: address }));
    const [c] = await db.insert(customers).values({ companyId, name: "Test", street: "1 St", city: "Denver",
      state: "CO", zip: "80000", qboCustomerId: "q1", qboSyncToken: "1", qboBaseline: baseline,
      billingPhone: "3035550101", qboSyncState: "pending_push" }).returning();
    let entered!: () => void;
    const fetching = new Promise<void>(r => { entered = r; });
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      entered();
    })));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pushing = pushCustomer(companyId, c.id, { reason: "scheduler" });
    await fetching;
    let saved = false;
    // A nonbilling customer save must wait while a bounded push owns the lock.
    const saving = request(customerPatchApp(companyId)).patch(`/api/customers/${c.id}`)
      .send({ ranking: "preferred" }).then(result => { saved = true; return result; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(saved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pushing).toMatchObject({ state: "error", review: "push_failed" });
    expect((await saving).status).toBe(200);
    expect(saved).toBe(true);
    const [review] = await db.select().from(qboCustomerReviews).where(and(
      eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.customerId, c.id)));
    expect(review.message).toMatch(/30 seconds/);
    const [after] = await db.select().from(customers).where(eq(customers.id, c.id));
    expect(after.ranking).toBe("preferred");
  });
});
