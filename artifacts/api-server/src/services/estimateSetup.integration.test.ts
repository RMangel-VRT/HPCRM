import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { companies, customers, agreements, agreementTerms, rateCardItems, termRates, qboItemCache, qboUmbrellaItems, estimateQuickItems, UMBRELLA_KEYS, createQuickItemSchema, pool as schemaPool } from "@workspace/db";
const state = vi.hoisted(() => ({ qbo: vi.fn(), failLocal: false, reads: 0 }));
vi.mock("./qboClient", () => ({ qboRequest: state.qbo }));
vi.mock("../db", async original => {
  const actual = await original<typeof import("../db")>();
  return { ...actual, db: new Proxy(actual.db, {
    get(target, prop) {
      if (prop === "select") state.reads++;
      if (prop === "transaction") return (work: (tx: unknown) => Promise<unknown>) => target.transaction(tx => work(new Proxy(tx, {
        get(t, p) {
          if (p === "update") return (...args: Parameters<typeof tx.update>) => {
            if (state.failLocal) throw new Error("Simulated local persistence failure");
            return t.update(...args);
          };
          const value = Reflect.get(t, p); return typeof value === "function" ? value.bind(t) : value;
        },
      })));
      const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
    },
  }) };
});
import { db, pool } from "../db";
import { cachedItems, createItem, linkItem, listUmbrellas, provisionUmbrellas, pullItems, unlinkItem } from "./qboItems";
import { estimateQuickCatalog } from "./estimateQuickItems";
import { loadEstimateRateContext, previewEstimateRates, resolveEstimateRate } from "./estimateRates";
import { companyToday, addCalendarDays } from "../lib/companyDay";

const a = `estimate-test-${randomUUID()}`, b = `estimate-test-${randomUUID()}`;
const remote = (Id: string, overrides: Record<string, unknown> = {}) => ({ Id, Name: `Item ${Id}`, Type: "Service", Active: true, IncomeAccountRef: { name: "Services" }, ...overrides });
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const itemsReply = (items: unknown[]) => reply({ QueryResponse: { Item: items } });
const cached = (qboId: string, overrides = {}) => ({ companyId: a, qboId, name: `Old ${qboId}`, type: "Service", active: true, fetchedAt: new Date("2026-01-01T00:00:00Z"), ...overrides });
async function cacheRows(companyId = a) { return db.select().from(qboItemCache).where(eq(qboItemCache.companyId, companyId)); }

describe("estimate setup SQL and company-scoped persistence", () => {
  beforeAll(async () => {
    await db.insert(companies).values([{ id: a, name: "Disposable estimate verification A", slug: a }, { id: b, name: "Disposable estimate verification B", slug: b }]);
  });
  beforeEach(async () => {
    state.failLocal = false; state.qbo.mockReset();
    for (const table of [qboItemCache, qboUmbrellaItems, estimateQuickItems]) await db.delete(table).where(inArray(table.companyId, [a, b]));
  });
  afterAll(async () => {
    state.failLocal = false;
    await db.delete(companies).where(inArray(companies.id, [a, b]));
    await Promise.all([pool.end(), schemaPool.end()]);
  });
  it("migration reruns safely and runtime provisioning supplies exactly six rows to future companies", async () => {
    const migration = await readFile(new URL("../../../../.migration-backup/migrations/0053_estimate_setup.sql", import.meta.url), "utf8");
    // Entire migration includes guarded DDL and idempotent seed DML.
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
    await provisionUmbrellas(a); await provisionUmbrellas(a); await provisionUmbrellas(b);
    const rows = await listUmbrellas(a);
    expect(rows.map(r => r.key)).toEqual([...UMBRELLA_KEYS]);
    expect(rows.map(r => r.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect((await listUmbrellas(b))).toHaveLength(6);
  });
  it("full both-state pagination commits accurate upserts/deactivation and linked snapshots", async () => {
    await provisionUmbrellas(a); await provisionUmbrellas(b);
    await db.insert(qboItemCache).values([cached("kept"), cached("gone"), cached("foreign", { companyId: b })]);
    await linkItem(a, "plants", "kept"); await linkItem(a, "fees_surcharges", "gone");
    const first = Array.from({ length: 1000 }, (_, i) => remote(String(i), { Type: "NonInventory" }));
    state.qbo.mockResolvedValueOnce(itemsReply(first)).mockResolvedValueOnce(itemsReply([remote("kept", { Name: "Renamed", Active: false })]));
    const result = await pullItems(a);
    expect(result).toMatchObject({ pulled: 1001, inserted: 1000, updated: 1, deactivated: 1, missingUmbrellas: ["fees_surcharges"], inactiveUmbrellas: ["plants"] });
    const queries = state.qbo.mock.calls.map(call => decodeURIComponent(call[2]));
    expect(queries[0]).toContain("Active IN (true,false) STARTPOSITION 1 MAXRESULTS 1000");
    expect(queries[1]).toContain("STARTPOSITION 1001");
    const umbrellas = await listUmbrellas(a);
    expect(umbrellas.find(r => r.key === "plants")).toMatchObject({ qboItemName: "Renamed", bindingStatus: "inactive" });
    expect(umbrellas.find(r => r.key === "fees_surcharges")).toMatchObject({ qboItemId: "gone", bindingStatus: "missing", qboSyncedAt: null });
    expect((await cacheRows(b))[0].active).toBe(true);
    expect((await cachedItems(a, "renamed", "Service")).items.map(i => i.qboId)).toEqual(["kept"]);
  }, 30000);
  it("failed later pages and malformed remote data cannot deactivate cache or modify snapshots", async () => {
    await db.insert(qboItemCache).values(cached("safe")); await linkItem(a, "plants", "safe");
    const before = await listUmbrellas(a);
    state.qbo.mockResolvedValueOnce(itemsReply(Array.from({ length: 1000 }, (_, i) => remote(String(i)))))
      .mockResolvedValueOnce(reply({ Fault: {} }, 503));
    await expect(pullItems(a)).rejects.toMatchObject({ status: 502 });
    expect(await cacheRows()).toEqual([expect.objectContaining({ qboId: "safe", active: true })]);
    expect(await listUmbrellas(a)).toEqual(before);
    state.qbo.mockResolvedValueOnce(itemsReply([{ Id: "bad" }]));
    await expect(pullItems(a)).rejects.toMatchObject({ status: 502 });
    expect((await cacheRows())[0].active).toBe(true);
  });
  it("successful empty pulls deactivate old items only after success and preserve the six rows", async () => {
    await db.insert(qboItemCache).values(cached("gone")); await linkItem(a, "plants", "gone");
    state.qbo.mockResolvedValue(itemsReply([]));
    expect(await pullItems(a)).toMatchObject({ pulled: 0, deactivated: 1, missingUmbrellas: ["plants"] });
    expect((await cacheRows())[0].active).toBe(false);
    expect(await listUmbrellas(a)).toHaveLength(6);
  });
  it("links only active supported company-owned items; unlink clears binding but never permanent rows", async () => {
    await db.insert(qboItemCache).values([cached("ok"), cached("inactive", { active: false }), cached("inventory", { type: "Inventory" }), cached("foreign", { companyId: b })]);
    await expect(linkItem(a, "plants", "foreign")).rejects.toMatchObject({ status: 404 });
    await expect(linkItem(a, "plants", "inactive")).rejects.toMatchObject({ status: 400 });
    await expect(linkItem(a, "plants", "inventory")).rejects.toMatchObject({ status: 400 });
    await linkItem(a, "plants", "ok"); await unlinkItem(a, "plants");
    const rows = await listUmbrellas(a);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ key: "plants", qboItemId: null, qboItemName: null, qboItemType: null, qboSyncedAt: null });
    expect(state.qbo).not.toHaveBeenCalled();
  });
  it("escaped exact-name precheck includes inactive matches and exposes link eligibility without posting", async () => {
    state.qbo.mockResolvedValueOnce(itemsReply([remote("duplicate", { Name: "Owner's Fee" })]));
    await expect(createItem(a, { key: "fees_surcharges", name: "Owner's Fee", incomeAccountId: "inc" }))
      .rejects.toMatchObject({ status: 409, details: { canLink: true, candidate: { qboId: "duplicate" } } });
    expect(decodeURIComponent(state.qbo.mock.calls[0][2])).toContain("Name = 'Owner''s Fee' AND Active IN (true,false)");
    expect(state.qbo).toHaveBeenCalledTimes(1);
    expect(await cacheRows()).toEqual([]);
    state.qbo.mockResolvedValueOnce(itemsReply([remote("inactive", { Active: false })]));
    await expect(createItem(a, { key: "plants", name: "Existing", incomeAccountId: "inc" })).rejects.toMatchObject({ status: 409, details: { canLink: false } });
  });
  it("precheck failure never proceeds to a remote write", async () => {
    state.qbo.mockResolvedValueOnce(reply({}, 502));
    await expect(createItem(a, { key: "plants", name: "Plant", incomeAccountId: "inc" })).rejects.toMatchObject({ status: 502 });
    expect(state.qbo).toHaveBeenCalledTimes(1);
  });
  it("success creates and binds together with the default type and active Income account", async () => {
    state.qbo.mockResolvedValueOnce(itemsReply([]))
      .mockResolvedValueOnce(reply({ QueryResponse: { Account: [{ Id: "inc", Name: "Services", Active: true }] } }))
      .mockResolvedValueOnce(reply({ Item: remote("created") }));
    await createItem(a, { key: "landscape_labor", name: "Labor", incomeAccountId: "inc" });
    expect(state.qbo.mock.calls[2]).toEqual([a, "POST", "/item", { Name: "Labor", Type: "Service", IncomeAccountRef: { value: "inc" } }]);
    expect(await cacheRows()).toEqual([expect.objectContaining({ qboId: "created" })]);
    expect((await listUmbrellas(a)).find(r => r.key === "landscape_labor")).toMatchObject({ qboItemId: "created", bindingStatus: "active" });
  });
  it("rejects invalid income accounts before creating", async () => {
    state.qbo.mockResolvedValueOnce(itemsReply([])).mockResolvedValueOnce(reply({ QueryResponse: { Account: [] } }));
    await expect(createItem(a, { key: "plants", name: "Plant", incomeAccountId: "other" })).rejects.toMatchObject({ status: 400 });
    expect(state.qbo).toHaveBeenCalledTimes(2);
  });
  it.each(["6240", "9999"])("QBO fault %s never creates a binding or cache row", async code => {
    state.qbo.mockResolvedValueOnce(itemsReply([]))
      .mockResolvedValueOnce(reply({ QueryResponse: { Account: [{ Id: "inc", Name: "Income" }] } }))
      .mockResolvedValueOnce(reply({ Fault: { Error: [{ code, Detail: "Failure" }] } }, 400));
    await expect(createItem(a, { key: "plants", name: "Plant", incomeAccountId: "inc" })).rejects.toMatchObject({ status: code === "6240" ? 409 : 502 });
    expect(await cacheRows()).toEqual([]);
    expect((await listUmbrellas(a))[0].qboItemId).toBeNull();
  });
  it("remote success with local failure rolls back both local writes and reports pull/link recovery", async () => {
    state.qbo.mockResolvedValueOnce(itemsReply([]))
      .mockResolvedValueOnce(reply({ QueryResponse: { Account: [{ Id: "inc", Name: "Income" }] } }))
      .mockImplementationOnce(async () => { state.failLocal = true; return reply({ Item: remote("remote-created", { Type: "NonInventory" }) }); });
    await expect(createItem(a, { key: "plants", name: "Plant", incomeAccountId: "inc" })).rejects.toMatchObject({ status: 502, details: { recoveryRequired: true } });
    state.failLocal = false;
    expect(await cacheRows()).toEqual([]);
    expect((await listUmbrellas(a))[0].qboItemId).toBeNull();
    expect(state.qbo.mock.calls[2][3].Type).toBe("NonInventory");
  });
  it("serializes overlapping pulls so an older remote snapshot cannot commit after a newer one", async () => {
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const barrier = new Promise<void>(r => { release = r; });
    state.qbo.mockImplementationOnce(async () => { entered(); await barrier; return itemsReply([remote("same", { Name: "First" })]); })
      .mockResolvedValueOnce(itemsReply([remote("same", { Name: "Second" })]));
    const first = pullItems(a); await started;
    const second = pullItems(a);
    release(); await Promise.all([first, second]);
    expect((await cacheRows())[0].name).toBe("Second");
  });
  it("enforces SQL constraints, case-insensitive company-wide labels, nullable rates, soft activation and ID scope", async () => {
    const item = await estimateQuickCatalog.create(a, createQuickItemSchema.parse({ kind: "equipment", label: "Skid Steer" }));
    expect(item.defaultRateCents).toBeNull();
    await expect(estimateQuickCatalog.create(a, createQuickItemSchema.parse({ kind: "fee", label: "skid steer" }))).rejects.toBeDefined();
    const other = await estimateQuickCatalog.create(b, createQuickItemSchema.parse({ kind: "fee", label: "SKID STEER" }));
    expect(await estimateQuickCatalog.update(a, other.id, { label: "Denied" })).toBeUndefined();
    await estimateQuickCatalog.update(a, item.id, { defaultRateCents: 12345 });
    await estimateQuickCatalog.update(a, item.id, { label: "New label" });
    expect((await estimateQuickCatalog.list(a))[0]).toMatchObject({ defaultRateCents: 12345, kind: "equipment", umbrellaKey: "landscape_labor" });
    await estimateQuickCatalog.update(a, item.id, { defaultRateCents: null, isActive: false });
    await estimateQuickCatalog.update(a, item.id, { isActive: true });
    expect((await estimateQuickCatalog.list(a))[0]).toMatchObject({ defaultRateCents: null, isActive: true });
    expect(await estimateQuickCatalog.list(a, "fee")).toEqual([]);
    await expect(db.execute(sql`insert into estimate_quick_items(company_id,kind,label,umbrella_key) values (${a},'fleet','Invalid','plants')`)).rejects.toBeDefined();
  });
  it("batches actual resolver reads, uses term-owned line, and excludes foreign customers and rates", async () => {
    const cA = randomUUID(), cB = randomUUID(), agreementA = randomUUID(), snowAgreement = randomUUID(), agreementB = randomUUID();
    const termA = randomUUID(), snowTerm = randomUUID(), termB = randomUUID(), today = companyToday();
    await db.insert(customers).values([{ id: cA, companyId: a, name: "Rate verification A", street: "Test", city: "Test", state: "CO", zip: "00000" },
      { id: cB, companyId: b, name: "Rate verification B", street: "Test", city: "Test", state: "CO", zip: "00000" }]);
    await db.insert(agreements).values([{ id: agreementA, companyId: a, customerId: cA },
      { id: snowAgreement, companyId: a, customerId: cA }, { id: agreementB, companyId: b, customerId: cB }]);
    const base = { seasonLabel: "Verification", status: "active" as const, startDate: addCalendarDays(today, -30), endDate: addCalendarDays(today, 30), billingType: "time_and_materials" as const };
    await db.insert(agreementTerms).values([{ ...base, id: termA, companyId: a, agreementId: agreementA, line: "landscape" },
      { ...base, id: snowTerm, companyId: a, agreementId: snowAgreement, line: "snow", startDate: today },
      { ...base, id: termB, companyId: b, agreementId: agreementB, line: "landscape" }]);
    const labor = { rateKey: "test_labor", line: "irrigation" as const, category: "Labor", label: "Labor", unit: "hour", priceCents: 10000 };
    await db.insert(rateCardItems).values([{ ...labor, companyId: a }, { ...labor, companyId: b, priceCents: 99999 },
      { ...labor, companyId: a, rateKey: "test_material", category: "Materials" }]);
    await db.insert(termRates).values([{ ...labor, companyId: a, termId: termA, priceCents: null, priceText: "Contract manual" },
      { ...labor, companyId: a, termId: snowTerm, priceCents: 11111 }, { ...labor, companyId: b, termId: termB, priceCents: 22222 }]);
    expect(await resolveEstimateRate(a, cA, "test_labor")).toMatchObject({ source: "contract", termId: termA, rateCents: null, priceText: "Contract manual", cardRateCents: 10000 });
    state.reads = 0;
    const context = await loadEstimateRateContext(a, cA);
    expect(state.reads).toBe(4);
    expect(context.rates.every(r => r.companyId === a)).toBe(true);
    expect((await previewEstimateRates(a, cA)).items).toHaveLength(1);
    await expect(previewEstimateRates(a, cB)).rejects.toMatchObject({ status: 404 });
    await db.update(agreementTerms).set({ status: "draft" }).where(and(eq(agreementTerms.companyId, a), eq(agreementTerms.id, termA)));
    expect((await previewEstimateRates(a, cA)).items[0]).toMatchObject({ source: "rate_card", rateCents: 10000 });
  });
});
