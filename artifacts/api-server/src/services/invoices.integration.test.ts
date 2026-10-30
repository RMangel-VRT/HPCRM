import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, users, settings, invoices, invoiceLines, invoiceNumberSequences, invoiceEvents,
  invoiceQboPushes, invoiceSends, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { createDraftInvoice, patchDraftInvoice, createInvoiceLine, patchInvoiceLine, deleteInvoiceLine,
  reorderInvoiceLines, cancelDraftInvoice, setInvoiceStatus } from "./invoices";
import { readInvoice, listInvoices, readInvoiceEvents } from "./invoiceReads";
import { isInvoiceCenterEnabled } from "./invoiceFeature";
import { postgresCode } from "./estimateErrors";
import { registerInvoiceRoutes } from "../routes/invoices";
import type { InvoicePrefix, InvoiceStatus } from "@workspace/db/invoice-contracts";

const a = `invoice-${randomUUID()}`, b = `invoice-${randomUUID()}`, actor = randomUUID();
let customerA: string, customerB: string, parent: string;
const fresh = (prefix: InvoicePrefix = "MA", customerId = customerA) =>
  createDraftInvoice(a, actor, { customerId, prefix, kind: "standalone", title: "Disposable IC1 draft" });
const manual = { category: "plants" as const, description: "Captured line", unit: "ea", quantity: "2.5", rateCents: 33 };
type Draft = Awaited<ReturnType<typeof fresh>>;
function appFor(company = a, role: string | null = "admin") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId: company, activeRole: role } as Express.User; next();
  });
  registerInvoiceRoutes(app); return app;
}
async function pgFailure(work: () => PromiseLike<unknown>, expected = "23514") {
  let code: string | undefined;
  try { await work(); } catch (error) { code = postgresCode(error); }
  expect(code).toBe(expected);
}
async function sourceLine(d: Draft, sourceId: string, overrides = {}) {
  return db.insert(invoiceLines).values({ companyId: a, invoiceId: d.id, category: "plants",
    description: "Source fixture", unit: "ea", quantity: "1", rateCents: 10, amountCents: 10,
    sourceType: "ticket", sourceId, ...overrides }).returning();
}
beforeAll(async () => {
  await db.insert(companies).values([{ id: a, name: "Disposable invoice A", slug: a }, { id: b, name: "Disposable invoice B", slug: b }]);
  await db.insert(users).values({ id: actor, name: "Casey Example", passwordHash: "not-a-login" });
  const base = { street: "Test", city: "Test", state: "CO", zip: "00000" };
  const rows = await db.insert(customers).values([
    { ...base, companyId: a, name: "Invoice customer A" },
    { ...base, companyId: b, name: "Invoice customer B" },
    { ...base, companyId: a, name: "Invoice parent", isParent: "true" },
  ]).returning();
  [customerA, customerB, parent] = rows.map(r => r.id);
  await db.insert(settings).values({ companyId: a, companyName: "Disposable A", featureFlags: '{"invoiceCenter":true}' });
});
afterAll(async () => {
  // customer RESTRICT is intentional; delete only this suite's disposable invoices
  // before cascading the fixture companies.
  await db.delete(invoices).where(inArray(invoices.companyId, [a, b]));
  await db.delete(companies).where(inArray(companies.id, [a, b]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
});
describe("real PostgreSQL invoice drafts", () => {
  it("reruns migration twice without changing schema or data", async () => {
    const migration = await readFile(new URL("../../../../.migration-backup/migrations/0060_invoices.sql", import.meta.url), "utf8");
    const before = await db.execute(sql`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE tablename LIKE 'invoice%' ORDER BY tablename,indexname`);
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
    const after = await db.execute(sql`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE tablename LIKE 'invoice%' ORDER BY tablename,indexname`);
    expect(after.rows).toEqual(before.rows);
    expect(await db.select().from(invoiceNumberSequences).where(eq(invoiceNumberSequences.companyId, a))).toEqual([]);
  });
  it("allocates the first three committed development numbers independently per prefix", async () => {
    const numbers: Record<string, string[]> = { MA: [], SN: [] };
    for (const prefix of ["MA", "SN"] as const) for (let i = 0; i < 3; i++) {
      const draft = await fresh(prefix);
      numbers[prefix].push(draft.number);
      expect(draft).toMatchObject({ status: "draft", sourceSummary: "Manual", revision: 0, subtotalCents: 0,
        billToSnapshot: null, workLocationSnapshot: null, taxCents: null, totalCents: null, balanceCents: null });
      expect((await readInvoiceEvents(a, draft.id))[0].kind).toBe("created");
    }
    expect(numbers).toEqual({ MA: ["MA-1001", "MA-1002", "MA-1003"], SN: ["SN-1001", "SN-1002", "SN-1003"] });
    console.info("IC1 disposable development fixture numbers", JSON.stringify(numbers));
  });
  it("serializes ten concurrent creates to unique contiguous numbers", async () => {
    const drafts = await Promise.all(Array.from({ length: 10 }, () => fresh()));
    expect(drafts.map(d => d.invoiceSeq).sort((x, y) => x - y)).toEqual(Array.from({ length: 10 }, (_, i) => 1004 + i));
  });
  it("retains cancelled numbers and does not reuse them", async () => {
    const draft = await fresh();
    const cancelled = await cancelDraftInvoice(a, actor, draft.id, "Duplicate request");
    expect(cancelled.number).toBe(draft.number);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Duplicate request" });
    expect(cancelled.cancelledAt).toMatch(/T/);
    expect((await fresh()).invoiceSeq).toBe(draft.invoiceSeq + 1);
  });
  it("accepts parent bill-to customers and rejects foreign customer IDs before allocating", async () => {
    expect((await fresh("MA", parent)).customerId).toBe(parent);
    const before = await db.select().from(invoiceNumberSequences).where(eq(invoiceNumberSequences.companyId, a));
    await expect(fresh("MA", customerB)).rejects.toMatchObject({ status: 404, error: "NOT_FOUND" });
    expect(await db.select().from(invoiceNumberSequences).where(eq(invoiceNumberSequences.companyId, a))).toEqual(before);
  });
  it("rolls back counter allocation and invoice on failed actor FK", async () => {
    const before = await db.select().from(invoiceNumberSequences).where(eq(invoiceNumberSequences.companyId, a));
    await pgFailure(() => createDraftInvoice(a, "missing-actor", {
      customerId: customerA, kind: "standalone", prefix: "MA", title: "Rollback",
    }), "23503");
    expect(await db.select().from(invoiceNumberSequences).where(eq(invoiceNumberSequences.companyId, a))).toEqual(before);
  });
  it("adds exact half-up manual amounts and first-name attribution with JSON timestamps", async () => {
    const d = await fresh(), detail = await createInvoiceLine(a, actor, d.id, manual);
    expect(detail.lines[0]).toMatchObject({ quantity: "2.50", amountCents: 83, sourceLabel: "Added by Casey", sourceType: "manual", sourceId: null, live: true });
    expect(detail.subtotalCents).toBe(83);
    expect(typeof detail.createdAt).toBe("string"); expect(typeof detail.lines[0].createdAt).toBe("string");
    expect(detail.pushReadiness.problems).toEqual([{ code: "CUSTOMER_NOT_LINKED" }]);
    expect((await readInvoiceEvents(a, d.id))[0]).toMatchObject({ kind: "line_added", detail: { lineId: detail.lines[0].id } });
  });
  it("preserves omissions, clears explicit nulls and recomputes after every line PATCH", async () => {
    const d = await fresh(), detail = await createInvoiceLine(a, actor, d.id, manual), id = detail.lines[0].id;
    const renamed = await patchInvoiceLine(a, actor, d.id, id, { description: "Changed" });
    expect(renamed.lines[0]).toMatchObject({ description: "Changed", quantity: "2.50", rateCents: 33, amountCents: 83 });
    const cleared = await patchInvoiceLine(a, actor, d.id, id, { quantity: null });
    expect(cleared.lines[0]).toMatchObject({ quantity: null, rateCents: 33, amountCents: null });
    expect(cleared.subtotalCents).toBe(0);
    expect(cleared.pushReadiness.problems).toContainEqual({ code: "UNPRICED_LINE", lineIds: [id] });
    const rateClear = await patchInvoiceLine(a, actor, d.id, id, { quantity: "1", rateCents: null });
    expect(rateClear.lines[0]).toMatchObject({ quantity: "1.00", rateCents: null, amountCents: null });
    expect((await patchInvoiceLine(a, actor, d.id, id, { rateCents: 0 })).lines[0].amountCents).toBe(0);
  });
  it("enforces both prefix directions on creates and category edits", async () => {
    const ma = await fresh(), sn = await fresh("SN");
    await expect(createInvoiceLine(a, actor, ma.id, { ...manual, category: "snow_services" })).rejects.toMatchObject({ status: 409, error: "PREFIX_CATEGORY_MISMATCH" });
    await expect(createInvoiceLine(a, actor, sn.id, manual)).rejects.toMatchObject({ status: 409, error: "PREFIX_CATEGORY_MISMATCH" });
    const line = (await createInvoiceLine(a, actor, sn.id, { ...manual, category: "snow_contract" })).lines[0];
    await expect(patchInvoiceLine(a, actor, sn.id, line.id, { category: "plants" })).rejects.toMatchObject({ status: 409, error: "PREFIX_CATEGORY_MISMATCH" });
  });
  it("requires zero lines to change customer and validates company membership", async () => {
    const d = await fresh();
    await patchDraftInvoice(a, actor, d.id, { customerId: parent, title: "Parent", txnDate: "2028-02-29", memo: "Memo", poNumber: "PO" });
    await createInvoiceLine(a, actor, d.id, manual);
    await expect(patchDraftInvoice(a, actor, d.id, { customerId: customerA })).rejects.toMatchObject({ error: "CUSTOMER_CHANGE_REQUIRES_EMPTY_INVOICE" });
    expect((await patchDraftInvoice(a, actor, d.id, { memo: null })).poNumber).toBe("PO");
    const empty = await fresh();
    await expect(patchDraftInvoice(a, actor, empty.id, { customerId: customerB })).rejects.toMatchObject({ status: 404 });
  });
  it("rejects cross-invoice and cross-company line edits/deletes atomically", async () => {
    const d = await fresh(), other = await fresh(), line = (await createInvoiceLine(a, actor, d.id, manual)).lines[0];
    await expect(patchInvoiceLine(a, actor, other.id, line.id, { description: "Wrong" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteInvoiceLine(a, actor, other.id, line.id)).rejects.toMatchObject({ status: 404 });
    await expect(patchInvoiceLine(b, actor, d.id, line.id, { rateCents: 0 })).rejects.toMatchObject({ status: 404 });
    expect((await readInvoice(a, d.id)).lines[0].amountCents).toBe(83);
  });
  it("validates complete reorder membership before any ordering or event writes", async () => {
    const d = await fresh();
    await createInvoiceLine(a, actor, d.id, manual);
    const two = await createInvoiceLine(a, actor, d.id, { ...manual, description: "Second" });
    const ids = two.lines.map(l => l.id), events = await readInvoiceEvents(a, d.id);
    for (const bad of [[], [ids[0]], [ids[0], ids[0]], [ids[0], "foreign"]]) {
      await expect(reorderInvoiceLines(a, actor, d.id, bad)).rejects.toMatchObject({ error: "INVALID_LINE_ORDER" });
      expect((await readInvoice(a, d.id)).lines).toEqual(two.lines);
      expect(await readInvoiceEvents(a, d.id)).toEqual(events);
    }
    const reversed = await reorderInvoiceLines(a, actor, d.id, [...ids].reverse());
    expect(reversed.lines.map(l => l.id)).toEqual([...ids].reverse());
    expect(reversed.lines.map(l => l.displayOrder)).toEqual([0, 1]);
    expect((await readInvoiceEvents(a, d.id))[0].kind).toBe("lines_reordered");
  });
  it("serializes concurrent line additions without losing order or subtotal", async () => {
    const d = await fresh();
    await Promise.all(Array.from({ length: 5 }, () => createInvoiceLine(a, actor, d.id, manual)));
    const detail = await readInvoice(a, d.id);
    expect(detail.subtotalCents).toBe(5 * 83);
    expect(detail.lines.map(l => l.displayOrder)).toEqual([0, 1, 2, 3, 4]);
    const deleted = await deleteInvoiceLine(a, actor, d.id, detail.lines[0].id);
    expect(deleted.lines).toHaveLength(4); expect(deleted.subtotalCents).toBe(4 * 83);
    expect((await readInvoiceEvents(a, d.id))[0].kind).toBe("line_removed");
  });
  it("rolls back line, subtotal, timestamp and event on extension or subtotal overflow", async () => {
    const d = await fresh();
    const full = await createInvoiceLine(a, actor, d.id, { ...manual, quantity: "1", rateCents: 2147483647 });
    const history = await readInvoiceEvents(a, d.id);
    for (const input of [{ ...manual, quantity: "2", rateCents: 2147483647 }, { ...manual, quantity: "1", rateCents: 1 }]) {
      await expect(createInvoiceLine(a, actor, d.id, input)).rejects.toThrow(RangeError);
      expect(await readInvoice(a, d.id)).toEqual(full);
      expect(await readInvoiceEvents(a, d.id)).toEqual(history);
    }
    await expect(patchInvoiceLine(a, actor, d.id, full.lines[0].id, { quantity: "2" })).rejects.toThrow(RangeError);
    expect(await readInvoice(a, d.id)).toEqual(full);
  });
  it("rejects every non-draft edit after status is changed through the single writer", async () => {
    const d = await fresh(), detail = await createInvoiceLine(a, actor, d.id, manual), lineId = detail.lines[0].id;
    await db.transaction(tx => setInvoiceStatus(tx, a, d.id, "issued"));
    const operations = [
      () => patchDraftInvoice(a, actor, d.id, { title: "No" }),
      () => createInvoiceLine(a, actor, d.id, manual),
      () => patchInvoiceLine(a, actor, d.id, lineId, { rateCents: 1 }),
      () => deleteInvoiceLine(a, actor, d.id, lineId),
      () => reorderInvoiceLines(a, actor, d.id, [lineId]),
      () => cancelDraftInvoice(a, actor, d.id, "No"),
    ];
    for (const op of operations) await expect(op()).rejects.toMatchObject({ status: 409, error: "INVOICE_NOT_DRAFT" });
    expect((await request(appFor()).patch(`/api/invoices/${d.id}`).send({ title: "No" })).body).toEqual({ error: "INVOICE_NOT_DRAFT" });
  });
  it.each(["draft", "issued", "void", "cancelled", "superseded"] as const)("maintains every line's liveness for status %s", async (target: InvoiceStatus) => {
    const d = await fresh();
    await createInvoiceLine(a, actor, d.id, manual); await createInvoiceLine(a, actor, d.id, manual);
    await db.transaction(tx => setInvoiceStatus(tx, a, d.id, target));
    const detail = await readInvoice(a, d.id);
    expect(detail.status).toBe(target);
    expect(detail.lines.every(l => l.live === (target === "draft" || target === "issued"))).toBe(true);
  });
  it("cancels and releases every live source atomically; uniqueness permits rebilling only afterwards", async () => {
    const d = await fresh(), other = await fresh(), sourceId = randomUUID();
    await sourceLine(d, sourceId);
    await sourceLine(d, randomUUID());
    await createInvoiceLine(a, actor, d.id, manual);
    await pgFailure(() => sourceLine(other, sourceId), "23505");
    const cancelled = await cancelDraftInvoice(a, actor, d.id, "Release source");
    expect(cancelled.lines).toHaveLength(3); expect(cancelled.lines.every(l => !l.live)).toBe(true);
    expect((await sourceLine(other, sourceId))[0].live).toBe(true);
    expect((await readInvoiceEvents(a, d.id))[0]).toMatchObject({ kind: "cancelled", detail: { reason: "Release source" } });
  });
  it("rolls back status/liveness/cancellation audit on event failure", async () => {
    const d = await fresh(); const detail = await createInvoiceLine(a, actor, d.id, manual);
    await pgFailure(() => cancelDraftInvoice(a, "missing-actor", d.id, "Must roll back"), "23503");
    expect(await readInvoice(a, d.id)).toEqual(detail);
  });
  it("enforces schema CHECKs and number/source uniqueness in PostgreSQL", async () => {
    const d = await fresh();
    for (const change of [{ invoicePrefix: "IR" }, { invoiceSeq: 0 }, { revision: -1 }, { kind: "other" },
      { kind: "monthly", periodMonth: null }, { periodMonth: "2026-10-02" }, { qboState: "bad" }, { deliveryState: "bad" }, { paymentState: "bad" }]) {
      await pgFailure(() => db.update(invoices).set(change as never).where(eq(invoices.id, d.id)));
    }
    await db.update(invoices).set({ kind: "monthly", periodMonth: "2026-11-01" }).where(eq(invoices.id, d.id));
    for (const overrides of [{ quantity: "0" }, { rateCents: -1 }, { amountCents: null }, { quantity: null },
      { category: "bad" }, { sourceType: "manual" }, { sourceId: null }, { sourceType: "bad" }])
      await pgFailure(() => sourceLine(d, randomUUID(), overrides));
    await pgFailure(() => db.insert(invoices).values({ companyId: a, customerId: customerA, kind: "standalone", title: "Dupe",
      invoicePrefix: d.invoicePrefix, invoiceSeq: d.invoiceSeq }), "23505");
    await pgFailure(() => db.insert(invoices).values({ companyId: a, customerId: customerA, kind: "standalone", title: "Live dupe",
      invoicePrefix: d.invoicePrefix, invoiceSeq: d.invoiceSeq, revision: 1 }), "23505");
    await pgFailure(() => db.insert(invoiceNumberSequences).values({ companyId: a, prefix: "IR" as never }));
    await pgFailure(() => db.insert(invoiceQboPushes).values({ companyId: a, invoiceId: d.id, revision: 0, operation: "bad", idempotencyKey: randomUUID(), status: "pending" }));
    await pgFailure(() => db.insert(invoiceSends).values({ companyId: a, invoiceId: d.id, revision: 0, toAddresses: [], status: "bad" }));
  });
  it("keeps frozen snapshots and QBO mirrors untouched, including linked-customer readiness", async () => {
    await db.update(customers).set({ qboCustomerId: `fixture-${randomUUID()}` }).where(eq(customers.id, parent));
    const d = await fresh("MA", parent), detail = await createInvoiceLine(a, actor, d.id, manual);
    expect(detail.pushReadiness).toEqual({ ready: true, problems: [] });
    expect(detail).toMatchObject({ billToSnapshot: null, workLocationSnapshot: null, taxCents: null,
      totalCents: null, balanceCents: null, qboInvoiceId: null, qboLastSyncedAt: null, issuedAt: null });
    expect(await db.select().from(invoiceQboPushes).where(eq(invoiceQboPushes.companyId, a))).toEqual([]);
    expect(await db.select().from(invoiceSends).where(eq(invoiceSends.companyId, a))).toEqual([]);
  });
  it("scopes detail/history/list and route company expectations", async () => {
    const d = await fresh();
    await expect(readInvoice(b, d.id)).rejects.toMatchObject({ status: 404 });
    await expect(readInvoiceEvents(b, d.id)).rejects.toMatchObject({ status: 404 });
    expect(await listInvoices(b, {})).toEqual([]);
    await db.insert(settings).values({ companyId: b, companyName: "Disposable B", featureFlags: '{"invoiceCenter":true}' });
    expect((await request(appFor(b)).get(`/api/invoices/${d.id}`)).status).toBe(404);
    expect((await request(appFor()).patch(`/api/invoices/${d.id}`).set("X-Company-Id", b).send({ title: "Wrong" })).status).toBe(409);
  });
  it("filters/searches list deterministically and returns newest history first", async () => {
    const d = await fresh("SN"); await patchDraftInvoice(a, actor, d.id, { title: "Unique needle%literal" });
    for (const query of [{ search: d.number }, { search: "Unique needle%literal" }, { customerId: customerA, prefix: "SN" as const, status: "draft" as const }]) {
      const rows = await listInvoices(a, query);
      expect(rows.some(r => r.id === d.id)).toBe(true);
      expect(rows.every(r => r.companyId === a)).toBe(true);
    }
    expect((await listInvoices(a, { search: "Invoice customer A" })).length).toBeGreaterThan(1);
    expect(await listInvoices(a, { search: "missing-needle" })).toEqual([]);
    const history = await readInvoiceEvents(a, d.id);
    expect(history.map(e => e.kind)).toEqual(["header_updated", "created"]);
    expect(typeof history[0].createdAt).toBe("string");
    const listQueries: string[] = [], original = pool.query.bind(pool);
    // Real query budget, independent of list size; restore before next test.
    const spy = vi.spyOn(pool, "query").mockImplementation(((...args: Parameters<typeof pool.query>) => {
      listQueries.push(String(args[0])); return original(...args);
    }) as typeof pool.query);
    try { await listInvoices(a, {}); expect(listQueries.length).toBeLessThanOrEqual(2); expect(listQueries.length).toBeGreaterThan(0); }
    finally { spy.mockRestore(); }
  });
  it("fails closed on absent, malformed and non-boolean flags, and enforces real route roles", async () => {
    for (const flags of ["{}", "null", "[]", "broken", '{"invoiceCenter":"true"}', '{"invoiceCenter":1}', '{"invoiceCenter":false}']) {
      await db.update(settings).set({ featureFlags: flags }).where(eq(settings.companyId, a));
      expect(await isInvoiceCenterEnabled(a)).toBe(false);
      const response = await request(appFor()).get("/api/invoices");
      expect(response.status).toBe(404); expect(response.body).toEqual({ error: "INVOICE_CENTER_DISABLED" });
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(await isInvoiceCenterEnabled("missing-company")).toBe(false);
    await db.update(settings).set({ featureFlags: '{"invoiceCenter":true}' }).where(eq(settings.companyId, a));
    expect((await request(appFor(a, "field")).get("/api/invoices")).status).toBe(403);
    expect((await request(appFor(a, null)).get("/api/invoices")).status).toBe(401);
    expect((await request(appFor(a, "office")).get("/api/invoices")).status).toBe(200);
  });
  it("rejects empty/unknown PATCHes through the real service and route", async () => {
    const d = await fresh();
    await expect(patchDraftInvoice(a, actor, d.id, {})).rejects.toThrow();
    await expect(patchInvoiceLine(a, actor, d.id, "x", {})).rejects.toThrow();
    expect((await request(appFor()).patch(`/api/invoices/${d.id}`).send({ title: "x", subtotalCents: 10 })).status).toBe(400);
    expect((await request(appFor()).post("/api/invoices").send({ customerId: customerA, kind: "monthly", title: "No" })).status).toBe(400);
  });
  it("serves the complete HTTP create/edit/reorder/delete/cancel/history draft flow", async () => {
    const app = appFor(a, "office");
    const created = await request(app).post("/api/invoices").set("X-Company-Id", a)
      .send({ customerId: customerA, kind: "standalone", title: "HTTP draft" });
    expect(created.status).toBe(201);
    const path = `/api/invoices/${created.body.id}`;
    expect((await request(app).patch(path).send({ memo: "Updated", poNumber: "PO" })).status).toBe(200);
    const line1 = await request(app).post(`${path}/lines`).send(manual);
    const line2 = await request(app).post(`${path}/lines`).send({ ...manual, quantity: null });
    expect(line1.status).toBe(201); expect(line2.status).toBe(201);
    const ids: string[] = line2.body.lines.map((l: { id: string }) => l.id);
    const patched = await request(app).patch(`${path}/lines/${ids[1]}`).send({ quantity: "1", rateCents: 10 });
    expect(patched.status).toBe(200); expect(patched.body.subtotalCents).toBe(93);
    const reordered = await request(app).post(`${path}/lines/reorder`).send({ lineIds: [...ids].reverse() });
    expect(reordered.status).toBe(200);
    expect(reordered.body.lines.map((l: { id: string }) => l.id)).toEqual([...ids].reverse());
    const deleted = await request(app).delete(`${path}/lines/${ids[0]}`);
    expect(deleted.status).toBe(200); expect(deleted.body.subtotalCents).toBe(10);
    expect((await request(app).get(path)).body).toEqual(deleted.body);
    const cancelled = await request(app).post(`${path}/cancel`).send({ reason: "Fixture finished" });
    expect(cancelled.status).toBe(200); expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.lines.every((l: { live: boolean }) => !l.live)).toBe(true);
    const events = await request(app).get(`${path}/events`);
    expect(events.status).toBe(200);
    expect(events.body.map((e: { kind: string }) => e.kind)).toEqual([
      "cancelled", "line_removed", "lines_reordered", "line_updated", "line_added", "line_added", "header_updated", "created",
    ]);
  });
});
