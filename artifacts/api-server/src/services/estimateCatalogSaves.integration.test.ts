import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { companies, customers, estimateVersions, estimateQuickItems, estimateServiceCategories,
  hardscapeCatalogItems, estimates, createEstimateLineSchema, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { registerEstimateRoutes } from "../routes/estimates";
import { createEstimate, createLine } from "./estimates";

let a: string, b: string, customerId: string, categoryId: string;
function appFor(company: string | null = a, role: string | null = "admin") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { activeCompanyId: company, activeRole: role } as Express.User; next();
  });
  registerEstimateRoutes(app); return app;
}
const matches = (query: Record<string, string | undefined>, company = a) =>
  request(appFor(company)).get("/api/estimates/catalog-matches").query(query);
const fresh = () => createEstimate(a, null, { customerId, title: "Catalog save verification" });
type Draft = Awaited<ReturnType<typeof fresh>>;
const body = (d: Draft, extra = {}) => ({
  sectionId: d.version.sections[0].id, quantity: "2.5", lineType: "custom", name: randomUUID(),
  detail: "Entered detail", unit: "ea", unitPriceCents: 1234, umbrellaKey: "landscape_labor", ...extra,
});
const post = (d: Draft, extra = {}) => request(appFor()).post(`/api/estimates/${d.id}/versions/${d.version.id}/lines`).send(body(d, extra));
const quick = async (extra = {}, companyId = a) => (await db.insert(estimateQuickItems).values({
  companyId, kind: "equipment", label: randomUUID(), defaultUnit: "ea", umbrellaKey: "landscape_labor", ...extra,
}).returning())[0];
const hard = async (name: string, extra = {}, companyId = a) => (await db.insert(hardscapeCatalogItems).values({
  companyId, category: "general", name, unit: "ea", ...extra,
}).returning())[0];

describe("catalog matching and transactional custom saves", () => {
  beforeAll(async () => {
    [a, b] = (await db.insert(companies).values(["a", "b"].map(name => ({ name, slug: randomUUID() }))).returning()).map(c => c.id);
    customerId = (await db.insert(customers).values({ companyId: a, name: "Fixture", street: "", city: "", state: "CO", zip: "" }).returning())[0].id;
    categoryId = (await db.insert(estimateServiceCategories).values({ companyId: a, name: "Treatments", defaultUnit: "visit", defaultUmbrellaKey: "irrigation_labor" }).returning())[0].id;
  });
  afterAll(async () => {
    await db.delete(companies).where(inArray(companies.id, [a, b]));
    await Promise.all([pool.end(), schemaPool.end()]);
  });
  it("guards access, expected company, no-store and validates targets/category/name", async () => {
    for (const role of [null, "field", "crew_supervisor"]) {
      const r = await request(appFor(a, role)).get("/api/estimates/catalog-matches").query({ catalog: "hardscape", name: "abc" });
      expect(r.status).toBe(role === null ? 401 : 403); expect(r.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(appFor()).get("/api/estimates/catalog-matches").set("X-Company-Id", b)).status).toBe(409);
    expect((await request(appFor(null)).get("/api/estimates/catalog-matches")).status).toBe(403);
    for (const catalog of ["plant", "plants", "irrigation", "labor", "service", "bogus"])
      expect((await matches({ catalog, name: "abc" })).status).toBe(400);
    for (const query of [{ catalog: "fee", name: "ab" }, { catalog: "fee", name: "abc", serviceCategoryId: categoryId },
      { catalog: "fee", name: "abc", extra: "no" }, { catalog: "fee", name: "x".repeat(501) }])
      expect((await matches(query)).status).toBe(400);
  });
  it("ranks lowercase similarity/contains, scopes company/activity and limits five", async () => {
    const prefix = `Stone ${randomUUID()}`;
    await hard(prefix, { retailPriceCents: null });
    for (let i = 0; i < 7; i++) await hard(`${prefix} ${i}`);
    await hard(prefix, { isActive: false }); await hard(prefix, {}, b);
    const r = await matches({ catalog: "hardscape", name: prefix.toUpperCase() });
    expect(r.status).toBe(200); expect(r.body).toHaveLength(5);
    expect(r.body[0]).toMatchObject({ name: prefix, priceCents: null, unit: "ea", categoryName: "general" });
    const score = await db.execute(sql`SELECT similarity(lower(${prefix}), lower(${prefix + " extra"})) AS score`);
    expect(Number(score.rows[0].score)).toBeGreaterThanOrEqual(.3);
    const rows = await matches({ catalog: "hardscape", name: prefix.slice(0, -1) });
    expect(rows.body.some((r: { name: string }) => r.name === prefix)).toBe(true);
  });
  it("contains is literal for percent, underscore and backslash, not SQL patterns", async () => {
    const token = `xy%_\\${randomUUID()}`;
    await hard(`prefix ${token} suffix`); await hard("Unrelated item");
    const r = await matches({ catalog: "hardscape", name: token });
    expect(r.body).toHaveLength(1); expect(r.body[0].name).toContain(token);
  });
  it("includes low-similarity contains matches and breaks score ties by name", async () => {
    const needle = "contains-" + randomUUID();
    const longName = `${Array.from({ length: 25 }, () => randomUUID()).join(" ")} ${needle} trailing text`;
    await hard(longName);
    const result = await matches({ catalog: "hardscape", name: needle });
    expect(result.body.some((r: { name: string }) => r.name === longName)).toBe(true);
    const score = await db.execute(sql`SELECT similarity(lower(${longName}), lower(${needle})) AS score`);
    expect(Number(score.rows[0].score)).toBeLessThan(.3);
    const n = randomUUID();
    await hard(`${n} a`); await hard(`${n} b`);
    const ordered = await matches({ catalog: "hardscape", name: n });
    expect(ordered.body.map((r: { name: string }) => r.name)).toEqual([`${n} a`, `${n} b`]);
  });
  it("filters quick kind, active company/category and returns nullable price/category", async () => {
    const label = randomUUID();
    const active = await quick({ label, kind: "service", serviceCategoryId: categoryId });
    await quick({ label: `${label} fee`, kind: "fee" });
    await quick({ label: `${label} inactive`, kind: "service", serviceCategoryId: categoryId, isActive: false });
    const r = await matches({ catalog: "service", serviceCategoryId: categoryId, name: label });
    expect(r.body).toEqual([{ id: active.id, name: label, unit: "ea", priceCents: null, categoryName: "Treatments" }]);
    expect((await matches({ catalog: "service", serviceCategoryId: categoryId, name: label }, b)).body).toEqual([]);
    await db.update(estimateServiceCategories).set({ isActive: false }).where(eq(estimateServiceCategories.id, categoryId));
    expect((await matches({ catalog: "service", serviceCategoryId: categoryId, name: label })).body).toEqual([]);
    await db.update(estimateServiceCategories).set({ isActive: true }).where(eq(estimateServiceCategories.id, categoryId));
    const fee = await matches({ catalog: "fee", name: label });
    expect(fee.body[0]).toMatchObject({ categoryName: null, priceCents: null });
  });
  for (const catalog of ["hardscape", "equipment", "fee", "service"] as const) {
    it(`saves ${catalog} with reference identity and the normal snapshot`, async () => {
      const d = await fresh();
      const r = await post(d, { umbrellaKey: catalog === "hardscape" ? "landscape_materials" : catalog === "fee" ? "fees_surcharges" : catalog === "service" ? "irrigation_labor" : "landscape_labor",
        saveToCatalog: catalog === "service" ? { catalog, serviceCategoryId: categoryId } : { catalog } });
      expect(r.status).toBe(201);
      const line = r.body.version.sections[0].lines[0];
      expect(line).toMatchObject({ lineType: catalog, quantity: "2.50", unitPriceCents: 1234, extendedCents: 3085,
        unitCostCents: null, priceSource: catalog === "hardscape" ? "catalog" : "quick_list" });
      if (catalog === "hardscape") {
        const [row] = await db.select().from(hardscapeCatalogItems).where(eq(hardscapeCatalogItems.id, line.hardscapeCatalogItemId));
        expect(row).toMatchObject({ category: "general", description: "Entered detail", wholesaleCostCents: null, retailPriceCents: 1234 });
        expect(line.detail).toBe("general");
      } else {
        const [row] = await db.select().from(estimateQuickItems).where(eq(estimateQuickItems.id, line.quickItemId));
        expect(row).toMatchObject({ kind: catalog, defaultRateCents: 1234, defaultUnit: "ea", isActive: true, sortOrder: 0 });
        expect(row.serviceCategoryId).toBe(catalog === "service" ? categoryId : null); expect(line.detail).toBeNull();
      }
    });
  }
  it("keeps unsaved custom behavior and permits duplicate hardscape names", async () => {
    const d = await fresh(), name = randomUUID();
    const manual = await post(d, { name, unit: "anything" });
    expect(manual.status).toBe(201);
    expect(manual.body.version.sections[0].lines[0]).toMatchObject({ lineType: "custom", priceSource: "manual", unit: "anything", quickItemId: null });
    for (let i = 0; i < 2; i++) expect((await post(d, { name, unit: "cu yd", umbrellaKey: "landscape_materials", saveToCatalog: { catalog: "hardscape" } })).status).toBe(201);
    expect((await db.select().from(hardscapeCatalogItems).where(eq(hardscapeCatalogItems.name, name)))).toHaveLength(2);
  });
  it("rejects umbrella/unit/category errors before any row survives", async () => {
    const d = await fresh();
    for (const catalog of ["hardscape", "equipment", "fee", "service"]) {
      const target = catalog === "service" ? { catalog, serviceCategoryId: categoryId } : { catalog };
      const r = await post(d, { umbrellaKey: "plants", saveToCatalog: target });
      expect(r.status).toBe(422); expect(r.body.error).toBe("UMBRELLA_MISMATCH");
    }
    for (const unit of ["ton", "cu yd"]) {
      const r = await post(d, { unit, saveToCatalog: { catalog: "equipment" } });
      expect(r.status).toBe(422); expect(r.body.error).toBe("INVALID_CATALOG_UNIT");
    }
    const foreign = (await db.insert(estimateServiceCategories).values({ companyId: b, name: "Foreign", defaultUnit: "ea", defaultUmbrellaKey: "plants" }).returning())[0];
    for (const id of [foreign.id, randomUUID()]) {
      const r = await post(d, { saveToCatalog: { catalog: "service", serviceCategoryId: id } });
      expect(r.status).toBe(422); expect(r.body.error).toBe("INVALID_SERVICE_CATEGORY");
    }
    await db.update(estimateServiceCategories).set({ isActive: false }).where(eq(estimateServiceCategories.id, categoryId));
    expect((await post(d, { saveToCatalog: { catalog: "service", serviceCategoryId: categoryId } })).body.error).toBe("INVALID_SERVICE_CATEGORY");
    await db.update(estimateServiceCategories).set({ isActive: true }).where(eq(estimateServiceCategories.id, categoryId));
  });
  it("uses the current category default without restricting general service overrides", async () => {
    const d = await fresh();
    await db.update(estimateServiceCategories).set({ defaultUmbrellaKey: "plants" }).where(eq(estimateServiceCategories.id, categoryId));
    const r = await post(d, { umbrellaKey: "irrigation_labor", saveToCatalog: { catalog: "service", serviceCategoryId: categoryId } });
    expect(r.status).toBe(422); expect(r.body.error).toBe("UMBRELLA_MISMATCH");
    await db.update(estimateServiceCategories).set({ defaultUmbrellaKey: "irrigation_labor" }).where(eq(estimateServiceCategories.id, categoryId));
  });
  it("rolls back cross-kind duplicate and exposes the existing real kind for reuse", async () => {
    const d = await fresh(), label = randomUUID();
    const existing = await quick({ kind: "fee", label });
    const r = await post(d, { name: label.toUpperCase(), saveToCatalog: { catalog: "equipment" } });
    expect(r.status).toBe(409); expect(r.body).toMatchObject({ error: "CATALOG_ITEM_EXISTS", existing: { id: existing.id, name: label, kind: "fee", isActive: true } });
    expect((await db.select().from(estimateQuickItems).where(eq(estimateQuickItems.label, label)))).toHaveLength(1);
    const reuse = await createLine(a, d.id, d.version.id, createEstimateLineSchema.parse({
      sectionId: d.version.sections[0].id, quantity: "2.5", lineType: r.body.existing.kind, quickItemId: existing.id,
    }));
    expect(reuse.version.sections[0].lines).toHaveLength(1);
    expect(reuse.version.sections[0].lines[0]).toMatchObject({ lineType: "fee", quickItemId: existing.id, quantity: "2.50" });
  });
  it("does not leak another company's duplicate or offer inactive services as usable", async () => {
    const d = await fresh(), label = randomUUID();
    await quick({ label }, b);
    expect((await post(d, { name: label, saveToCatalog: { catalog: "equipment" } })).status).toBe(201);
    const serviceLabel = randomUUID();
    const existing = await quick({ label: serviceLabel, kind: "service", serviceCategoryId: categoryId });
    await db.update(estimateServiceCategories).set({ isActive: false }).where(eq(estimateServiceCategories.id, categoryId));
    const r = await post(d, { name: serviceLabel, saveToCatalog: { catalog: "equipment" } });
    expect(r.status).toBe(409);
    expect(r.body.existing).toMatchObject({ id: existing.id, kind: "service", serviceCategoryIsActive: false });
    await db.update(estimateServiceCategories).set({ isActive: true }).where(eq(estimateServiceCategories.id, categoryId));
  });
  it("rolls back catalog insert when later line amount calculation fails", async () => {
    for (const catalog of ["equipment", "hardscape"]) {
      const d = await fresh(), name = randomUUID();
      const r = await post(d, { name, quantity: "9999999999.99", unitPriceCents: 2147483647,
        umbrellaKey: catalog === "hardscape" ? "landscape_materials" : "landscape_labor", saveToCatalog: { catalog } });
      expect(r.status).toBe(422); expect(r.body.error).toBe("AMOUNT_OUT_OF_RANGE");
      expect((await db.select().from(estimateQuickItems).where(eq(estimateQuickItems.label, name)))).toHaveLength(0);
      expect((await db.select().from(hardscapeCatalogItems).where(eq(hardscapeCatalogItems.name, name)))).toHaveLength(0);
    }
  });
  it("locked/void and wrong section cannot create side-effect catalog rows", async () => {
    for (const state of ["locked", "void", "section"]) {
      const d = await fresh(), name = randomUUID();
      if (state === "locked") await db.update(estimateVersions).set({ status: "sent" }).where(eq(estimateVersions.id, d.version.id));
      if (state === "void") await db.update(estimates).set({ voidedAt: new Date() }).where(eq(estimates.id, d.id));
      const r = await post(d, { name, ...(state === "section" ? { sectionId: randomUUID() } : {}), saveToCatalog: { catalog: "equipment" } });
      expect(r.status).toBe(state === "section" ? 404 : 409);
      expect((await db.select().from(estimateQuickItems).where(eq(estimateQuickItems.label, name)))).toHaveLength(0);
    }
  });
  it("accepts saveToCatalog only on custom and rejects invalid discriminator fields", async () => {
    const d = await fresh();
    for (const saveToCatalog of [{ catalog: "plants" }, { catalog: "service" }, { catalog: "fee", serviceCategoryId: categoryId }])
      expect(createEstimateLineSchema.safeParse(body(d, { saveToCatalog })).success).toBe(false);
    expect(createEstimateLineSchema.safeParse({ ...body(d), lineType: "equipment", saveToCatalog: { catalog: "equipment" } }).success).toBe(false);
  });
});
