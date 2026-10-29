import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, customers, users, tickets, ticketTypes, ticketTypeStatuses, estimates, estimateVersions, estimateSections, estimateLines,
  estimateNumberCounters, plantCatalogItems, hardscapeCatalogItems, irrigationCatalogItems, estimateQuickItems,
  agreements, agreementTerms, rateCardItems, termRates, pool as schemaPool, type EstimateLine } from "@workspace/db";
import { db, pool } from "../db";
import { registerEstimateRoutes } from "../routes/estimates";
import { registerEstimateSetupRoutes } from "../routes/estimateSetup";
import { createEstimate, createSection, deleteSection, retitleEstimate } from "./estimates";
import { readEstimate } from "./estimateReads";
import { companyToday } from "../lib/companyDay";
import { postgresCode } from "./estimateErrors";

const a = `builder-${randomUUID()}`, b = `builder-${randomUUID()}`, actor = randomUUID();
let customerA: string, customerB: string, parent: string, typeA: string, typeB: string, statusA: string, statusB: string;
function appFor(company = a, role = "admin") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: actor, activeCompanyId: company, activeRole: role } as Express.User; next();
  });
  // Production ordering: static routes before the new :id route.
  registerEstimateSetupRoutes(app); registerEstimateRoutes(app); return app;
}
type Draft = Awaited<ReturnType<typeof createEstimate>>;
const fresh = (company = a, customerId = customerA, title = "Verification draft") => createEstimate(company, actor, { customerId, title });
const versionPath = (d: Draft) => `/api/estimates/${d.id}/versions/${d.version.id}`;
const allLines = (d: Draft): Array<EstimateLine & { needsPrice: boolean }> => d.version.sections.flatMap(s => s.lines);
const postLine = (d: Draft, body: Record<string, unknown>, company = a) => request(appFor(company)).post(`${versionPath(d)}/lines`).send({ sectionId: d.version.sections[0].id, quantity: "1", ...body });
async function ticket(companyId = a, customerId: string | null = customerA, typeId = typeA, currentStatusId = statusA) {
  return (await db.insert(tickets).values({ companyId, customerId, ticketTypeId: typeId, currentStatusId, title: "Disposable estimate request", createdById: actor }).returning())[0];
}
async function hardscape(companyId = a, overrides = {}) {
  return (await db.insert(hardscapeCatalogItems).values({ companyId, name: "Paver", category: "Stone", sku: randomUUID(), unit: "sqft", retailPriceCents: 33, wholesaleCostCents: 10, ...overrides }).returning())[0];
}
async function plant(companyId = a, overrides = {}) {
  return (await db.insert(plantCatalogItems).values({ companyId, productCode: randomUUID(), varietyKey: "test-variety", rawDescription: "Test shrub", commonName: "Test shrub", category: "shrub", sizeLabel: "5 gal", wholesaleCost: "12.34", salePrice: "99.00", ...overrides }).returning())[0];
}
async function quick(kind: "equipment" | "fee" = "equipment", companyId = a, overrides = {}) {
  return (await db.insert(estimateQuickItems).values({ companyId, kind, label: randomUUID(), defaultUnit: "day", defaultRateCents: 12345, umbrellaKey: kind === "equipment" ? "landscape_labor" : "fees_surcharges", ...overrides }).returning())[0];
}
async function card(rateKey: string, overrides = {}) {
  return (await db.insert(rateCardItems).values({ companyId: a, rateKey, label: "Irrigation technician", category: "Labor", line: "irrigation", unit: "hour", priceCents: 12000, ...overrides }).returning())[0];
}
async function term(customerId = customerA, overrides = {}) {
  const [agreement] = await db.insert(agreements).values({ companyId: a, customerId }).returning();
  return (await db.insert(agreementTerms).values({ companyId: a, agreementId: agreement.id, line: "landscape", seasonLabel: "Verification", startDate: "2020-01-01", endDate: "2099-12-31", billingType: "time_and_materials", status: "active", ...overrides }).returning())[0];
}
async function uniqueFailure(work: () => Promise<unknown>) {
  let code: string | undefined;
  try { await work(); } catch (err) { code = postgresCode(err); }
  expect(code).toBe("23505");
}

beforeAll(async () => {
  await db.insert(companies).values([{ id: a, name: "Disposable builder A", slug: a }, { id: b, name: "Disposable builder B", slug: b }]);
  await db.insert(users).values({ id: actor, name: "Disposable builder actor", passwordHash: "not-a-login" });
  const base = { street: "Test", city: "Test", state: "CO", zip: "00000" };
  const rows = await db.insert(customers).values([
    { ...base, companyId: a, name: "Builder customer A" },
    { ...base, companyId: b, name: "Builder customer B" },
    { ...base, companyId: a, name: "Builder parent", isParent: "true" },
  ]).returning();
  [customerA, customerB, parent] = rows.map(r => r.id);
  const types = await db.insert(ticketTypes).values([
    { companyId: a, name: "Renamed identity", typeKey: "estimate_request" },
    { companyId: b, name: "Renamed identity", typeKey: "estimate_request" },
  ]).returning();
  [typeA, typeB] = types.map(t => t.id);
  const statuses = await db.insert(ticketTypeStatuses).values([
    { ticketTypeId: typeA, name: "Open", displayOrder: 0 },
    { ticketTypeId: typeB, name: "Open", displayOrder: 0 },
  ]).returning();
  [statusA, statusB] = statuses.map(s => s.id);
});
afterAll(async () => {
  // Tickets restrict type/status deletion; delete them before company cascades.
  await db.delete(tickets).where(inArray(tickets.companyId, [a, b]));
  await db.delete(companies).where(inArray(companies.id, [a, b]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
});

describe("real PostgreSQL estimate model and constraints", () => {
  it("guarded migration reruns twice with all lifecycle columns intact", async () => {
    const migration = await readFile(new URL("../../../../.migration-backup/migrations/0056_estimates.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(migration));
    const d = await fresh();
    expect(d.version).toMatchObject({ status: "draft", sentAt: null, sentMethod: null, acceptedAt: null, acceptanceMethod: null,
      declinedAt: null, supersededAt: null, frozenSubtotalCents: null, frozenCostKnownCents: null, frozenCostUnknownLines: null });
    expect(d.version.sections).toHaveLength(1); expect(d.version.sections[0].name).toBe("Main");
  });
  it("database enforces number, version, one-draft, one-accepted and live-ticket uniques", async () => {
    const t = await ticket(), d = await createEstimate(a, actor, { customerId: customerA, title: "Uniques", ticketId: t.id });
    await uniqueFailure(() => db.insert(estimates).values({ companyId: a, customerId: customerA, estimateNumber: d.estimateNumber, title: "Duplicate" }));
    await uniqueFailure(() => db.insert(estimates).values({ companyId: a, customerId: customerA, ticketId: t.id, estimateNumber: "other", title: "Duplicate" }));
    await uniqueFailure(() => db.insert(estimateVersions).values({ companyId: a, estimateId: d.id, versionNumber: 2 }));
    await uniqueFailure(() => db.insert(estimateVersions).values({ companyId: a, estimateId: d.id, versionNumber: 1, status: "sent" }));
    await db.insert(estimateVersions).values({ companyId: a, estimateId: d.id, versionNumber: 2, status: "accepted" });
    await uniqueFailure(() => db.insert(estimateVersions).values({ companyId: a, estimateId: d.id, versionNumber: 3, status: "accepted" }));
    await db.update(estimates).set({ voidedAt: new Date() }).where(eq(estimates.id, d.id));
    const replacement = await createEstimate(a, actor, { customerId: customerA, title: "Replacement", ticketId: t.id });
    expect(replacement.id).not.toBe(d.id);
    expect((await db.select().from(tickets).where(eq(tickets.id, t.id)))[0].estimateNumber).toBe(replacement.estimateNumber);
  });
  it("database CHECK constraints reject invalid state, methods, type, source, quantity, cents and umbrella", async () => {
    const d = await fresh();
    for (const update of ["status = 'bogus'", "sent_method = 'sms'", "acceptance_method = 'sms'"]) {
      await expect(db.execute(sql.raw(`UPDATE estimate_versions SET ${update} WHERE id = '${d.version.id}'`))).rejects.toBeDefined();
    }
    const response = await postLine(d, { lineType: "custom", name: "Manual", unit: "ea", unitPriceCents: 1, umbrellaKey: "fees_surcharges" });
    const lineId = allLines(response.body)[0].id;
    for (const update of ["line_type = 'bogus'", "price_source = 'live'", "quantity = 0", "unit_price_cents = -1", "unit_cost_cents = -1", "umbrella_key = 'bogus'"]) {
      await expect(db.execute(sql.raw(`UPDATE estimate_lines SET ${update} WHERE id = '${lineId}'`))).rejects.toBeDefined();
    }
  });
  it("numbering is atomic, sequential per company/Colorado year under concurrent creates", async () => {
    const boundary = new Date("2031-01-01T06:59:59Z");
    const inputs = Array.from({ length: 12 }, (_, i) => createEstimate(a, actor, { customerId: customerA, title: `Concurrent ${i}` }, boundary));
    const created = await Promise.all(inputs);
    expect(new Set(created.map(d => d.estimateNumber)).size).toBe(12);
    const numbers = created.map(d => Number(d.estimateNumber.split("-")[2])).sort((x, y) => x - y);
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(created.every(d => d.estimateNumber.startsWith("EST-2030-"))).toBe(true);
    const [nextYear, other] = await Promise.all([
      createEstimate(a, actor, { customerId: customerA, title: "Next year" }, new Date("2031-01-01T07:00:00Z")),
      createEstimate(b, actor, { customerId: customerB, title: "Other company" }, boundary),
    ]);
    expect(nextYear.estimateNumber).toBe("EST-2031-0001"); expect(other.estimateNumber).toBe("EST-2030-0001");
  });
  it("concurrent ticket creation returns one full document and 409 with existing ID, without counter gaps or mirror damage", async () => {
    const t = await ticket();
    const before = (await db.select().from(estimateNumberCounters).where(and(eq(estimateNumberCounters.companyId, a), eq(estimateNumberCounters.year, Number(companyToday().slice(0, 4))))))[0]?.lastValue ?? 0;
    const responses = await Promise.all(Array.from({ length: 5 }, () => request(appFor()).post("/api/estimates").send({ customerId: customerA, title: "Race", ticketId: t.id })));
    const success = responses.find(r => r.status === 201)!;
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    for (const failed of responses.filter(r => r.status !== 201)) {
      expect(failed.status).toBe(409); expect(failed.body.existingEstimateId).toBe(success.body.id);
    }
    const counter = (await db.select().from(estimateNumberCounters).where(and(eq(estimateNumberCounters.companyId, a), eq(estimateNumberCounters.year, Number(companyToday().slice(0, 4))))))[0];
    expect(counter.lastValue).toBe(before + 1);
    expect((await db.select().from(tickets).where(eq(tickets.id, t.id)))[0].estimateNumber).toBe(success.body.estimateNumber);
  });
  it("validates company, parent, matching ticket customer and seeded identity", async () => {
    const foreign = await ticket(b, customerB, typeB, statusB), noCustomer = await ticket(a, null), own = await ticket();
    const [customType] = await db.insert(ticketTypes).values({ companyId: a, name: "Estimate Request", typeKey: "project" }).returning();
    const wrong = await ticket(a, customerA, customType.id);
    const app = appFor();
    for (const [body, status] of [
      [{ customerId: customerB, title: "Foreign" }, 404],
      [{ customerId: "missing", title: "Missing" }, 404],
      [{ customerId: parent, title: "Parent" }, 400],
      [{ customerId: customerA, title: "Foreign ticket", ticketId: foreign.id }, 404],
      [{ customerId: customerA, title: "Null customer", ticketId: noCustomer.id }, 400],
      [{ customerId: parent, title: "Mismatch", ticketId: own.id }, 400],
      [{ customerId: customerA, title: "Wrong type", ticketId: wrong.id }, 400],
    ] as const) expect((await request(app).post("/api/estimates").send(body)).status).toBe(status);
    const parentTicket = await ticket(a, parent);
    expect((await request(app).post("/api/estimates").send({ customerId: parent, title: "Parent ticket", ticketId: parentTicket.id })).body.error).toBe("PARENT_CUSTOMER_NOT_ALLOWED");
  });
});

describe("immutable snapshots and exact totals over HTTP", () => {
  it("captures size-specific plants with palette defaults and exact prices/costs", async () => {
    const d = await fresh(), p = await plant();
    const response = await postLine(d, { lineType: "plant", plantCatalogItemId: p.id, quantity: "2.5" });
    expect(response.status).toBe(201);
    expect(allLines(response.body)[0]).toMatchObject({ plantCatalogItemId: p.id, name: "Test shrub 5 gal", detail: "Plant Library · shrub · 5 gal", unit: "ea",
      quantity: "2.50", unitPriceCents: 2468, unitCostCents: 1234, extendedCents: 6170, umbrellaKey: "plants", priceSource: "catalog", includeInPalette: true, needsPrice: false });
    expect(response.body.version.totals).toMatchObject({ subtotalCents: 6170, costKnownCents: 3085, costUnknownLines: 0, materialMarginPct: 50 });
    for (const ref of [p.varietyKey, p.productCode]) expect((await postLine(d, { lineType: "plant", plantCatalogItemId: ref })).status).toBe(404);
  });
  it("plant zero cost is known; sale fallback and missing-price needsPrice are captured", async () => {
    const d = await fresh();
    for (const [overrides, price, cost, needsPrice] of [
      [{ wholesaleCost: "0.00" }, 0, 0, true],
      [{ wholesaleCost: null, salePrice: "9.87" }, 987, null, false],
      [{ wholesaleCost: null, salePrice: null }, 0, null, true],
    ] as const) {
      const p = await plant(a, overrides);
      const response = await postLine(d, { lineType: "plant", plantCatalogItemId: p.id });
      expect(response.status).toBe(201);
      expect(allLines(response.body).find(l => l.plantCatalogItemId === p.id)).toMatchObject({ unitPriceCents: price, unitCostCents: cost, needsPrice });
    }
  });
  it("hardscape and irrigation snapshot source units, details, umbrellas and nullable costs", async () => {
    const d = await fresh(), h = await hardscape();
    const [i] = await db.insert(irrigationCatalogItems).values({ companyId: a, externalSku: randomUUID(), name: "Valve", category: "Valves", unit: "ea", retailPriceCents: null, wholesaleCostCents: null }).returning();
    const first = await postLine(d, { lineType: "hardscape", hardscapeCatalogItemId: h.id, quantity: "2.5" });
    expect(allLines(first.body)[0]).toMatchObject({ name: h.name, detail: `Stone · ${h.sku}`, unit: "sqft", unitPriceCents: 33, unitCostCents: 10, extendedCents: 83, umbrellaKey: "landscape_materials", includeInPalette: false });
    const second = await postLine(d, { lineType: "irrigation", irrigationCatalogItemId: i.id });
    expect(allLines(second.body)[1]).toMatchObject({ name: "Valve", detail: `Valves · ${i.externalSku}`, unit: "ea", unitPriceCents: 0, unitCostCents: null, umbrellaKey: "irrigation_materials", needsPrice: true });
  });
  it("quick list enforces matching kind, captures null rate and allows free equipment, fee and custom entries", async () => {
    const d = await fresh(), equipment = await quick(), fee = await quick("fee", a, { defaultRateCents: null });
    for (const row of [equipment, fee]) {
      const response = await postLine(d, { lineType: row.kind, quickItemId: row.id });
      expect(response.status).toBe(201);
      expect(allLines(response.body).find(l => l.quickItemId === row.id)).toMatchObject({ name: row.label, unit: "day", unitPriceCents: row.defaultRateCents ?? 0, unitCostCents: null, umbrellaKey: row.umbrellaKey, priceSource: "quick_list", needsPrice: row.defaultRateCents === null });
    }
    expect((await postLine(d, { lineType: "fee", quickItemId: equipment.id })).status).toBe(404);
    for (const lineType of ["equipment", "fee", "custom"]) {
      const response = await postLine(d, { lineType, name: `Free ${lineType}`, detail: "As entered", unit: "flat", unitPriceCents: 0, umbrellaKey: "fees_surcharges" });
      expect(response.status).toBe(201);
      expect(allLines(response.body).at(-1)).toMatchObject({ priceSource: "manual", unitPriceCents: 0, needsPrice: false, includeInPalette: false });
    }
  });
  it("labor uses transaction context, contract-first governing term, term IDs and card-line umbrella", async () => {
    const d = await fresh(), key = randomUUID(), rate = await card(key), t = await term();
    await db.insert(termRates).values({ companyId: a, termId: t.id, rateKey: key, line: "irrigation", category: "Labor", label: "Negotiated technician", unit: "hour", priceCents: 9000 });
    const response = await postLine(d, { lineType: "labor", rateKey: key, quantity: "2" });
    expect(response.status).toBe(201);
    expect(allLines(response.body)[0]).toMatchObject({ name: "Negotiated technician", unit: "hour", unitPriceCents: 9000, termId: t.id, rateKey: key, priceSource: "contract", umbrellaKey: "irrigation_labor" });
    await db.update(rateCardItems).set({ priceCents: 100, line: "landscape" }).where(eq(rateCardItems.id, rate.id));
    await db.delete(agreementTerms).where(eq(agreementTerms.id, t.id));
    const persisted = allLines(await readEstimate(a, d.id))[0];
    expect(persisted).toMatchObject({ termId: null, unitPriceCents: 9000, priceSource: "contract", umbrellaKey: "irrigation_labor" });
  });
  it("missing governing key falls back to card, never older negotiated rates; text-only rates retain source", async () => {
    const d = await fresh(), key = randomUUID();
    await card(key, { priceCents: null, priceText: "Quote on inspection", line: "landscape" });
    const old = await term(customerA, { startDate: "2021-01-01" });
    await db.insert(termRates).values({ companyId: a, termId: old.id, rateKey: key, line: "landscape", category: "Labor", label: "Older", unit: "hour", priceCents: 1 });
    const current = await term(customerA, { startDate: "2025-01-01" });
    const response = await postLine(d, { lineType: "labor", rateKey: key });
    expect(response.status).toBe(201);
    expect(allLines(response.body)[0]).toMatchObject({ priceSource: "rate_card", detail: "Quote on inspection", unitPriceCents: 0, needsPrice: true, umbrellaKey: "landscape_labor", termId: null });
    await db.insert(termRates).values({ companyId: a, termId: current.id, rateKey: key, line: "landscape", category: "Labor", label: "Text contract", unit: "hour", priceCents: null, priceText: "Time and materials" });
    const second = await postLine(d, { lineType: "labor", rateKey: key });
    expect(allLines(second.body).at(-1)).toMatchObject({ priceSource: "contract", detail: "Time and materials", unitPriceCents: 0, needsPrice: true, termId: current.id });
    expect((await postLine(d, { lineType: "labor", rateKey: randomUUID() })).status).toBe(422);
  });
  it("rejects foreign and inactive sources for every backed material/quick type", async () => {
    const d = await fresh();
    const cases = [
      ["plant", "plantCatalogItemId", await plant(b), await plant(a, { isActive: false })],
      ["hardscape", "hardscapeCatalogItemId", await hardscape(b), await hardscape(a, { isActive: false })],
      ["equipment", "quickItemId", await quick("equipment", b), await quick("equipment", a, { isActive: false })],
      ["fee", "quickItemId", await quick("fee", b), await quick("fee", a, { isActive: false })],
    ] as const;
    for (const [lineType, key, foreign, inactive] of cases) {
      for (const row of [foreign, inactive]) expect((await postLine(d, { lineType, [key]: row.id })).status).toBe(404);
    }
    for (const [companyId, isActive] of [[b, true], [a, false]] as const) {
      const [row] = await db.insert(irrigationCatalogItems).values({ companyId, isActive, name: "No access", category: "Test", externalSku: randomUUID() }).returning();
      expect((await postLine(d, { lineType: "irrigation", irrigationCatalogItemId: row.id })).status).toBe(404);
    }
    expect(allLines(await readEstimate(a, d.id))).toHaveLength(0);
  });
  it("source updates and deletions never recalculate snapshots, all source FKs set null", async () => {
    const d = await fresh(), p = await plant(), h = await hardscape(), q = await quick();
    const [i] = await db.insert(irrigationCatalogItems).values({ companyId: a, name: "Original", category: "Test", externalSku: randomUUID(), retailPriceCents: 900 }).returning();
    for (const input of [{ lineType: "plant", plantCatalogItemId: p.id }, { lineType: "hardscape", hardscapeCatalogItemId: h.id }, { lineType: "irrigation", irrigationCatalogItemId: i.id }, { lineType: "equipment", quickItemId: q.id }]) expect((await postLine(d, input)).status).toBe(201);
    const before = await readEstimate(a, d.id);
    await db.update(plantCatalogItems).set({ commonName: "Changed", wholesaleCost: "900" }).where(eq(plantCatalogItems.id, p.id));
    await db.update(hardscapeCatalogItems).set({ retailPriceCents: 999, unit: "changed" }).where(eq(hardscapeCatalogItems.id, h.id));
    expect(allLines(await readEstimate(a, d.id))).toEqual(allLines(before));
    await db.delete(plantCatalogItems).where(eq(plantCatalogItems.id, p.id));
    await db.delete(hardscapeCatalogItems).where(eq(hardscapeCatalogItems.id, h.id));
    await db.delete(irrigationCatalogItems).where(eq(irrigationCatalogItems.id, i.id));
    await db.delete(estimateQuickItems).where(eq(estimateQuickItems.id, q.id));
    const after = allLines(await readEstimate(a, d.id));
    expect(after.map(({ plantCatalogItemId: _p, hardscapeCatalogItemId: _h, irrigationCatalogItemId: _i, quickItemId: _q, ...rest }) => rest))
      .toEqual(allLines(before).map(({ plantCatalogItemId: _p, hardscapeCatalogItemId: _h, irrigationCatalogItemId: _i, quickItemId: _q, ...rest }) => rest));
    for (const line of after) expect([line.plantCatalogItemId, line.hardscapeCatalogItemId, line.irrigationCatalogItemId, line.quickItemId]).toEqual([null, null, null, null]);
  });
});

describe("serialized draft edits, read payloads and isolation", () => {
  it("edits sections, moves lines within version, preserves PATCH values/nulls and returns authoritative payloads", async () => {
    const d = await fresh(), p = await plant(), app = appFor();
    const added = await createSection(a, d.id, d.version.id, "Second");
    const second = added.version.sections[1].id, first = added.version.sections[0].id;
    const plantResponse = await postLine(d, { lineType: "plant", plantCatalogItemId: p.id });
    const plantLine = allLines(plantResponse.body)[0];
    const path = `${versionPath(d)}/lines/${plantLine.id}`;
    const palette = await request(app).patch(path).send({ includeInPalette: false, paletteTypeLabel: "Accent" });
    expect(palette.status).toBe(200);
    expect(allLines(palette.body)[0]).toMatchObject({ includeInPalette: false, paletteTypeLabel: "Accent", priceSource: "catalog", quantity: "1.00", unitPriceCents: 2468 });
    const moved = await request(app).patch(path).send({ quantity: "2.5", paletteTypeLabel: null, sectionId: second, sortOrder: -1 });
    expect(moved.status).toBe(200);
    expect(moved.body.version.sections[0].lines).toHaveLength(0);
    expect(moved.body.version.sections[1].lines[0]).toMatchObject({ quantity: "2.50", paletteTypeLabel: null, includeInPalette: false, priceSource: "catalog", extendedCents: 6170 });
    expect(moved.body.version.totals.bySection).toEqual({ [first]: 0, [second]: 6170 });
    const unchanged = await request(app).patch(path).send({ unitPriceCents: 2468 });
    expect(allLines(unchanged.body)[0].priceSource).toBe("catalog");
    const manual = await request(app).patch(path).send({ unitPriceCents: 0 });
    expect(allLines(manual.body)[0]).toMatchObject({ priceSource: "manual", extendedCents: 0, needsPrice: false });
    for (const field of ["name", "detail", "unit", "umbrellaKey"]) {
      expect((await request(app).patch(path).send({ [field]: field === "umbrellaKey" ? "plants" : "Override" })).status).toBe(400);
    }
    const edited = await request(app).patch(`${versionPath(d)}/sections/${second}`).send({ name: "Renamed", sortOrder: -10 });
    expect(edited.body.version.sections[0]).toMatchObject({ id: second, name: "Renamed", sortOrder: -10 });
    const removed = await request(app).delete(`${versionPath(d)}/sections/${second}`);
    expect(removed.status).toBe(200); expect(allLines(removed.body)).toHaveLength(0);
    expect(removed.body.version.totals.subtotalCents).toBe(0);
    expect((await request(app).delete(`${versionPath(d)}/sections/${first}`)).status).toBe(409);
    expect(new Date(removed.body.updatedAt).getTime()).toBeGreaterThanOrEqual(d.updatedAt.getTime());
  });
  it("manual display fields are allowed only for equipment/fee/custom; palette fields are plant-only", async () => {
    const d = await fresh(), app = appFor();
    for (const lineType of ["equipment", "fee", "custom"]) {
      const added = await postLine(d, { lineType, name: lineType, detail: "Keep?", unit: "ea", unitPriceCents: 50, umbrellaKey: "fees_surcharges" });
      const line = allLines(added.body).at(-1)!;
      const path = `${versionPath(d)}/lines/${line.id}`;
      for (const patch of [{ includeInPalette: false }, { paletteTypeLabel: null }]) expect((await request(app).patch(path).send(patch)).status).toBe(400);
      const edited = await request(app).patch(path).send({ name: "Edited", detail: null, unit: "day", umbrellaKey: "landscape_labor" });
      expect(allLines(edited.body).find(l => l.id === line.id)).toMatchObject({ name: "Edited", detail: null, unit: "day", umbrellaKey: "landscape_labor", quantity: "1.00", unitPriceCents: 50 });
      const deleted = await request(app).delete(path);
      expect(deleted.status).toBe(200); expect(allLines(deleted.body).find(l => l.id === line.id)).toBeUndefined();
    }
    const h = await hardscape();
    const added = await postLine(d, { lineType: "hardscape", hardscapeCatalogItemId: h.id });
    const id = allLines(added.body)[0].id;
    for (const patch of [{ name: "No" }, { includeInPalette: true }]) expect((await request(app).patch(`${versionPath(d)}/lines/${id}`).send(patch)).status).toBe(400);
  });
  it("concurrent last-section deletions serialize to one success and one refusal", async () => {
    const d = await fresh(), added = await createSection(a, d.id, d.version.id, "Other");
    const results = await Promise.allSettled(added.version.sections.map(s => deleteSection(a, d.id, d.version.id, s.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409, error: "LAST_SECTION" });
    expect((await readEstimate(a, d.id)).version.sections).toHaveLength(1);
  });
  it("draft and void gates cover every mutation; retitling a sent nonvoid container is allowed", async () => {
    const d = await fresh(), added = await postLine(d, { lineType: "custom", name: "x", unit: "ea", unitPriceCents: 1, umbrellaKey: "plants" });
    const line = allLines(added.body)[0], app = appFor(), base = versionPath(d), section = d.version.sections[0].id;
    const writes = [
      ["post", `${base}/sections`, { name: "Other" }],
      ["patch", `${base}/sections/${section}`, { name: "Other" }],
      ["delete", `${base}/sections/${section}`, {}],
      ["post", `${base}/lines`, { sectionId: section, lineType: "custom", name: "x", unit: "ea", quantity: "1", unitPriceCents: 1, umbrellaKey: "plants" }],
      ["patch", `${base}/lines/${line.id}`, { quantity: "2" }],
      ["delete", `${base}/lines/${line.id}`, {}],
    ] as const;
    for (const status of ["sent", "accepted", "declined", "superseded", "void"] as const) {
      await db.update(estimateVersions).set({ status }).where(eq(estimateVersions.id, d.version.id));
      for (const [method, url, body] of writes) {
        const response = await request(app)[method](url).send(body);
        expect(response.status).toBe(409); expect(response.body.error).toBe("VERSION_LOCKED");
      }
    }
    expect((await retitleEstimate(a, d.id, "Still editable title")).title).toBe("Still editable title");
    await db.update(estimates).set({ voidedAt: new Date() }).where(eq(estimates.id, d.id));
    for (const [method, url, body] of [...writes, ["patch", `/api/estimates/${d.id}`, { title: "No" }]] as const) {
      const response = await request(app)[method](url).send(body);
      expect(response.status).toBe(409); expect(response.body.error).toBe("ESTIMATE_VOIDED");
    }
  });
  it("cross-estimate/version/section/line ownership and same-version moves are enforced", async () => {
    const d = await fresh(), other = await fresh(), app = appFor();
    const added = await postLine(d, { lineType: "custom", name: "x", unit: "ea", unitPriceCents: 1, umbrellaKey: "plants" });
    const line = allLines(added.body)[0];
    const [historical] = await db.insert(estimateVersions).values({ companyId: a, estimateId: d.id, versionNumber: 2, status: "sent" }).returning();
    const [section] = await db.insert(estimateSections).values({ companyId: a, versionId: historical.id, name: "Historical" }).returning();
    for (const sectionId of [section.id, other.version.sections[0].id]) {
      expect((await request(app).patch(`${versionPath(d)}/lines/${line.id}`).send({ sectionId })).status).toBe(404);
      expect((await postLine(d, { lineType: "custom", name: "x", unit: "ea", unitPriceCents: 1, umbrellaKey: "plants", sectionId })).status).toBe(404);
    }
    expect((await request(app).delete(`${versionPath(other)}/lines/${line.id}`)).status).toBe(404);
    expect((await request(app).patch(`${versionPath(d)}/sections/${other.version.sections[0].id}`).send({ name: "No" })).status).toBe(404);
    expect((await request(app).post(`/api/estimates/${d.id}/versions/${other.version.id}/sections`).send({ name: "No" })).status).toBe(404);
    expect((await request(app).delete(`${versionPath(d)}/sections/${section.id}`)).status).toBe(404);
    expect(allLines(await readEstimate(a, d.id))[0].sectionId).toBe(d.version.sections[0].id);
  });
  it("overflow rolls back the line and timestamps, including aggregate and cost overflow", async () => {
    const d = await fresh(), app = appFor();
    expect((await postLine(d, { lineType: "custom", name: "Overflow", unit: "ea", quantity: "9999999999.99", unitPriceCents: 2147483647, umbrellaKey: "plants" })).status).toBe(422);
    expect(allLines(await readEstimate(a, d.id))).toHaveLength(0);
    const first = await postLine(d, { lineType: "custom", name: "Max", unit: "ea", unitPriceCents: 2147483647, umbrellaKey: "plants" });
    expect(first.status).toBe(201);
    const before = await readEstimate(a, d.id);
    expect((await postLine(d, { lineType: "custom", name: "One too many", unit: "ea", unitPriceCents: 1, umbrellaKey: "plants" })).status).toBe(422);
    const line = allLines(before)[0];
    expect((await request(app).patch(`${versionPath(d)}/lines/${line.id}`).send({ quantity: "2" })).status).toBe(422);
    expect(await readEstimate(a, d.id)).toEqual(before);
    const h = await hardscape(a, { wholesaleCostCents: 2147483647, retailPriceCents: 0 });
    expect((await postLine(d, { lineType: "hardscape", hardscapeCatalogItemId: h.id, quantity: "2" })).status).toBe(422);
  });
  it("lists filter and order documents, use frozen non-draft totals, and expose historical detail", async () => {
    const marker = randomUUID(), app = appFor();
    const t = await ticket(), first = await createEstimate(a, actor, { customerId: customerA, title: marker, ticketId: t.id });
    await postLine(first, { lineType: "custom", name: "One", unit: "ea", unitPriceCents: 123, umbrellaKey: "plants" });
    await db.update(estimateVersions).set({ status: "sent", frozenSubtotalCents: 999 }).where(eq(estimateVersions.id, first.version.id));
    const [v2] = await db.insert(estimateVersions).values({ companyId: a, estimateId: first.id, versionNumber: 2, status: "declined", frozenSubtotalCents: 777 }).returning();
    await db.insert(estimateSections).values({ companyId: a, versionId: v2.id, name: "Historical empty" });
    const second = await fresh(a, customerA, marker), third = await fresh(a, customerA, marker);
    await db.update(estimates).set({ voidedAt: new Date() }).where(eq(estimates.id, third.id));
    await retitleEstimate(a, first.id, `${marker} edited`);
    const listed = await request(app).get("/api/estimates").query({ search: marker, customerId: customerA });
    expect(listed.body.map((d: { id: string }) => d.id)).toEqual([first.id, second.id]);
    expect(listed.body[0]).toMatchObject({ customerName: "Builder customer A", currentVersionNumber: 1, currentVersionStatus: "sent", subtotalCents: 999 });
    expect((await request(app).get("/api/estimates").query({ search: marker, includeVoid: "true" })).body).toHaveLength(3);
    expect((await request(app).get("/api/estimates").query({ ticketId: t.id })).body.map((d: { id: string }) => d.id)).toEqual([first.id]);
    expect((await request(app).get("/api/estimates").query({ search: first.estimateNumber })).body[0].id).toBe(first.id);
    const current = await request(app).get(`/api/estimates/${first.id}`);
    expect(current.body.versions).toHaveLength(2); expect(current.body.version.totals.subtotalCents).toBe(123);
    const historical = await request(app).get(`/api/estimates/${first.id}?version=2`);
    expect(historical.body.version).toMatchObject({ id: v2.id, status: "declined", totals: { subtotalCents: 0 } });
    expect((await request(app).get(`/api/estimates/${first.id}?version=3`)).status).toBe(404);
    expect((await request(app).get(`/api/estimates/${first.id}?version=1.1`)).status).toBe(400);
    expect((await request(app).get("/api/estimates?includeVoid=maybe")).status).toBe(400);
  });
  it("company isolation holds on every ID operation and filtered list; expected-company mismatch cannot write", async () => {
    const d = await fresh(b, customerB), app = appFor();
    const response = await postLine(d, { lineType: "custom", name: "Foreign", unit: "ea", unitPriceCents: 1, umbrellaKey: "plants" }, b);
    const line = allLines(response.body)[0], base = versionPath(d);
    const calls = [
      ["get", `/api/estimates/${d.id}`, {}], ["patch", `/api/estimates/${d.id}`, { title: "No" }],
      ["post", `${base}/sections`, { name: "No" }], ["patch", `${base}/sections/${d.version.sections[0].id}`, { name: "No" }],
      ["delete", `${base}/sections/${d.version.sections[0].id}`, {}],
      ["post", `${base}/lines`, { sectionId: d.version.sections[0].id, lineType: "custom", name: "No", unit: "ea", unitPriceCents: 1, quantity: "1", umbrellaKey: "plants" }],
      ["patch", `${base}/lines/${line.id}`, { quantity: "2" }], ["delete", `${base}/lines/${line.id}`, {}],
    ] as const;
    for (const [method, url, body] of calls) {
      const result = await request(app)[method](url).send(body);
      expect(result.status).toBe(404); expect(result.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(app).get("/api/estimates").query({ customerId: customerB })).body).toEqual([]);
    expect((await request(app).post("/api/estimates").set("X-Company-Id", b).send({ customerId: customerA, title: "No" })).status).toBe(409);
    expect((await request(appFor(a, "office")).get("/api/estimates")).status).toBe(200);
  });
  it("static rates preview route is not intercepted by :id", async () => {
    const result = await request(appFor()).get(`/api/estimates/rates/preview?customerId=${customerA}`);
    expect(result.status).toBe(200); expect(Array.isArray(result.body.items)).toBe(true);
  });
  it("ticket deletion sets null; customer deletion cascades estimate/version/section/line records", async () => {
    const [customer] = await db.insert(customers).values({ companyId: a, name: "Delete verification", street: "Test", city: "Test", state: "CO", zip: "00000" }).returning();
    const t = await ticket(a, customer.id), d = await createEstimate(a, actor, { customerId: customer.id, title: "Delete", ticketId: t.id });
    await postLine(d, { lineType: "custom", name: "Delete", unit: "ea", unitPriceCents: 1, umbrellaKey: "plants" });
    await db.delete(tickets).where(eq(tickets.id, t.id));
    expect((await readEstimate(a, d.id)).ticketId).toBeNull();
    await db.delete(customers).where(eq(customers.id, customer.id));
    expect(await db.select().from(estimates).where(eq(estimates.id, d.id))).toHaveLength(0);
    expect(await db.select().from(estimateVersions).where(eq(estimateVersions.estimateId, d.id))).toHaveLength(0);
    expect(await db.select().from(estimateSections).where(eq(estimateSections.versionId, d.version.id))).toHaveLength(0);
    expect(await db.select().from(estimateLines).where(eq(estimateLines.versionId, d.version.id))).toHaveLength(0);
  });
});
