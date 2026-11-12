import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { companies, customers, estimates, estimateVersions, estimateQuickItems, estimateServiceCategories,
  createQuickItemSchema, patchQuickItemSchema, createServiceCategorySchema, patchServiceCategorySchema,
  createEstimateLineSchema, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { registerEstimateSetupRoutes } from "../routes/estimateSetup";
import { registerEstimateRoutes } from "../routes/estimates";
import { estimateQuickCatalog } from "./estimateQuickItems";
import { estimateCategoryCatalog, initializeServiceCategories } from "./estimateServiceCategories";
import { createEstimate } from "./estimates";
import { storage } from "../storage";

let a: string, b: string;
let customerId: string;
const item = (overrides = {}) => createQuickItemSchema.parse({ kind: "equipment", label: randomUUID(), ...overrides });
const category = (overrides = {}, companyId = a) => estimateCategoryCatalog.create(companyId,
  createServiceCategorySchema.parse({ name: randomUUID(), ...overrides }));
function appFor(company: string | null = a, role: string | null = "admin") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { activeCompanyId: company, activeRole: role } as Express.User; next();
  });
  registerEstimateSetupRoutes(app); registerEstimateRoutes(app);
  return app;
}
const categoriesUrl = "/api/estimates/service-categories";
describe("categorized estimate services", () => {
  beforeAll(async () => {
    a = (await storage.createCompany({ name: "Disposable service catalog", slug: `services-${randomUUID()}`, subscriptionPlan: "free", subscriptionStatus: "active" })).id;
    b = (await storage.createCompany({ name: "Disposable foreign catalog", slug: `services-${randomUUID()}`, subscriptionPlan: "free", subscriptionStatus: "active" })).id;
    [customerId] = (await db.insert(customers).values({ companyId: a, name: "Service fixture", street: "Test", city: "Test", state: "CO", zip: "00000" }).returning()).map(c => c.id);
  });
  afterAll(async () => {
    await db.delete(companies).where(inArray(companies.id, [a, b]));
    await Promise.all([pool.end(), schemaPool.end()]);
  });
  it("creates company defaults transactionally, reruns migration and initialization without resetting edits", async () => {
    const seeded = await estimateCategoryCatalog.list(a);
    expect(seeded.map(c => [c.name, c.defaultUmbrellaKey, c.defaultUnit, c.sortOrder])).toEqual([
      ["General Landscape", "landscape_labor", "1,000 SF", 0], ["Chemical Treatments", "landscape_labor", "1,000 SF", 1],
    ]);
    await estimateCategoryCatalog.update(a, seeded[0].id, { defaultUnit: "FLAT", isActive: false });
    const migration = await readFile(new URL("../../../../.migration-backup/migrations/0078_estimate_services.sql", import.meta.url), "utf8");
    const units = await readFile(new URL("../../../../.migration-backup/migrations/0085_estimate_units.sql", import.meta.url), "utf8");
    // Historical migration remains immutable; the compatibility migration must
    // precede any new writes after replaying its obsolete narrow check.
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(units));
    await db.execute(sql.raw(migration)); await db.execute(sql.raw(units));
    await db.transaction(tx => initializeServiceCategories(tx, a));
    expect(await estimateCategoryCatalog.list(a)).toHaveLength(2);
    expect((await estimateCategoryCatalog.list(a))[0]).toMatchObject({ id: seeded[0].id, defaultUnit: "FLAT", isActive: false });
    expect(await estimateCategoryCatalog.list(b)).toHaveLength(2);
    // A failed duplicate company insert must not produce any extra categories.
    const [company] = await db.select().from(companies).where(eq(companies.id, a));
    await expect(storage.createCompany({ name: "Duplicate", slug: company.slug, subscriptionPlan: "free", subscriptionStatus: "active" })).rejects.toBeDefined();
    expect(await estimateCategoryCatalog.list(a)).toHaveLength(2);
  });
  it("guards every category route, no-stores responses and offers no hard delete", async () => {
    for (const method of ["get", "post", "patch"] as const) {
      const url = method === "patch" ? `${categoriesUrl}/id` : categoriesUrl;
      for (const role of [null, "field", "crew_supervisor"]) {
        const response = await request(appFor(a, role))[method](url).send({});
        expect(response.status).toBe(role === null ? 401 : 403);
        expect(response.headers["cache-control"]).toBe("no-store");
      }
      expect((await request(appFor(null))[method](url).send({})).status).toBe(403);
      expect((await request(appFor())[method](url).set("X-Company-Id", b).send({})).status).toBe(409);
    }
    expect((await request(appFor()).delete(`${categoriesUrl}/id`)).status).toBe(404);
    expect((await request(appFor(a, "office")).get(categoriesUrl)).status).toBe(200);
  });
  it("validates category CRUD, case-insensitive duplicates, ordering, company scope and PATCH without defaults", async () => {
    const made = await request(appFor(a, "office")).post(categoriesUrl).send({ name: " Precision treatments " });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: "Precision treatments", defaultUnit: "1,000 SF", defaultUmbrellaKey: "landscape_labor", isActive: true, itemCount: 0 });
    const url = `${categoriesUrl}/${made.body.id}`;
    const duplicate = await request(appFor()).post(categoriesUrl).send({ name: "PRECISION TREATMENTS" });
    expect(duplicate.status).toBe(409); expect(duplicate.body).toEqual({ message: "A category with this name already exists" });
    expect((await request(appFor(b)).patch(url).send({ name: "Stolen" })).status).toBe(404);
    expect((await request(appFor(b)).post(categoriesUrl).send({ name: "Precision treatments" })).status).toBe(201);
    const patch = await request(appFor()).patch(url).send({ defaultUnit: "LF", defaultUmbrellaKey: "plants", sortOrder: -12, isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ defaultUnit: "LF", defaultUmbrellaKey: "plants", sortOrder: -12, isActive: false });
    const renamed = await request(appFor()).patch(url).send({ name: "Renamed" });
    expect(renamed.body).toMatchObject({ defaultUnit: "LF", defaultUmbrellaKey: "plants", sortOrder: -12, isActive: false });
    expect(patchServiceCategorySchema.parse({ name: "One field" })).toEqual({ name: "One field" });
    expect((await request(appFor()).get(categoriesUrl)).body[0].id).toBe(made.body.id);
    const second = await category();
    const conflict = await request(appFor()).patch(`${categoriesUrl}/${second.id}`).send({ name: "renamed" });
    expect(conflict.status).toBe(409); expect(conflict.body.message).toBe("A category with this name already exists");
    for (const body of [{}, { name: " " }, { name: "a".repeat(101) }, { defaultUnit: "mile" }, { defaultUmbrellaKey: "new_item" }, { companyId: b }, { sortOrder: 0.1 }]) {
      expect((await request(appFor()).patch(url).send(body)).status).toBe(400);
    }
  });
  it("defaults from category on the server, honors per-service overrides, joins category state and counts all members", async () => {
    const cat = await category({ defaultUnit: "FLAT", defaultUmbrellaKey: "irrigation_labor" });
    const response = await request(appFor()).post("/api/quick-items").send({ kind: "service", label: randomUUID(), serviceCategoryId: cat.id });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ defaultUnit: "FLAT", umbrellaKey: "irrigation_labor", defaultRateCents: null });
    const other = await estimateQuickCatalog.create(a, item({ kind: "service", serviceCategoryId: cat.id, defaultUnit: "SF", umbrellaKey: "fees_surcharges", defaultRateCents: 50, isActive: false }));
    expect(other).toMatchObject({ defaultUnit: "SF", umbrellaKey: "fees_surcharges", isActive: false });
    const rows = await request(appFor()).get("/api/quick-items?kind=service");
    expect(rows.body.find((r: { id: string }) => r.id === response.body.id)).toMatchObject({ serviceCategoryName: cat.name, serviceCategoryIsActive: true });
    expect((await estimateCategoryCatalog.list(a)).find(c => c.id === cat.id)?.itemCount).toBe(2);
    await estimateCategoryCatalog.update(a, cat.id, { defaultUnit: "LF", defaultUmbrellaKey: "plants", isActive: false });
    const retained = (await estimateQuickCatalog.list(a, "service")).find(i => i.id === response.body.id);
    expect(retained).toMatchObject({ isActive: true, serviceCategoryIsActive: false, defaultUnit: "FLAT", umbrellaKey: "irrigation_labor" });
    expect((await estimateQuickCatalog.update(a, response.body.id, { label: "Retained inactive category" }))?.serviceCategoryId).toBe(cat.id);
    await expect(estimateQuickCatalog.create(a, item({ kind: "service", serviceCategoryId: cat.id }))).rejects.toMatchObject({ status: 400 });
    const active = await category();
    expect(await estimateQuickCatalog.update(a, response.body.id, { serviceCategoryId: active.id })).toMatchObject({ defaultUnit: "FLAT", umbrellaKey: "irrigation_labor" });
    await expect(db.delete(estimateServiceCategories).where(eq(estimateServiceCategories.id, cat.id))).rejects.toMatchObject({ cause: { code: "23503" } });
  });
  it("enforces category/kind on create and merged PATCH, same-company active assignments and cross-kind uniqueness", async () => {
    const cat = await category(), foreign = await category({}, b), inactive = await category({ isActive: false });
    for (const body of [{ kind: "service" }, { kind: "equipment", serviceCategoryId: cat.id }, { kind: "fee", serviceCategoryId: cat.id }]) {
      expect(createQuickItemSchema.safeParse({ label: "Invalid", ...body }).success).toBe(false);
    }
    for (const id of [foreign.id, inactive.id, randomUUID()]) {
      await expect(estimateQuickCatalog.create(a, item({ kind: "service", serviceCategoryId: id }))).rejects.toMatchObject({ status: 400 });
    }
    const equipment = await estimateQuickCatalog.create(a, item());
    const fee = await estimateQuickCatalog.create(a, item({ kind: "fee" }));
    expect(equipment).toMatchObject({ defaultUnit: "HR", umbrellaKey: "landscape_labor" });
    expect(fee.umbrellaKey).toBe("fees_surcharges");
    expect(patchQuickItemSchema.parse({ label: "Only name" })).toEqual({ label: "Only name" });
    await expect(estimateQuickCatalog.update(a, equipment.id, { kind: "service" })).rejects.toMatchObject({ status: 400 });
    await expect(estimateQuickCatalog.update(a, equipment.id, { serviceCategoryId: cat.id })).rejects.toMatchObject({ status: 400 });
    for (const id of [foreign.id, inactive.id]) {
      await expect(estimateQuickCatalog.update(a, equipment.id, { kind: "service", serviceCategoryId: id })).rejects.toMatchObject({ status: 400 });
    }
    const service = await estimateQuickCatalog.update(a, equipment.id, { kind: "service", serviceCategoryId: cat.id });
    expect(service?.kind).toBe("service");
    await expect(estimateQuickCatalog.update(a, equipment.id, { serviceCategoryId: null })).rejects.toMatchObject({ status: 400 });
    await expect(estimateQuickCatalog.update(a, equipment.id, { kind: "fee" })).rejects.toMatchObject({ status: 400 });
    expect((await estimateQuickCatalog.update(a, equipment.id, { kind: "fee", serviceCategoryId: null }))?.kind).toBe("fee");
    expect(await estimateQuickCatalog.update(b, equipment.id, { label: "Wrong company" })).toBeUndefined();
    const duplicate = await request(appFor()).post("/api/quick-items").send({ kind: "service", serviceCategoryId: cat.id, label: equipment.label.toUpperCase() });
    expect(duplicate.status).toBe(409); expect(duplicate.body.message).toBe("An item with this name already exists");
    // Database checks independently protect invalid direct writes.
    for (const body of [{ kind: "service" }, { kind: "equipment", serviceCategoryId: cat.id }, { kind: "fee", defaultUnit: "mile" }]) {
      await expect(db.execute(sql`INSERT INTO estimate_quick_items(company_id,kind,label,service_category_id,default_unit,umbrella_key)
        VALUES (${a},${body.kind},${randomUUID()},${"serviceCategoryId" in body ? body.serviceCategoryId : null},${"defaultUnit" in body ? body.defaultUnit : "hour"},'landscape_labor')`)).rejects.toMatchObject({ cause: { code: "23514" } });
    }
  });
  it("captures referenced/free service snapshots, preserves manual edits, category isolation and locked/void guards", async () => {
    const cat = await category(), foreign = await category({}, b);
    const source = await estimateQuickCatalog.create(a, item({ kind: "service", label: "Aeration snapshot", serviceCategoryId: cat.id, defaultRateCents: 1200 }));
    const other = await estimateQuickCatalog.create(b, item({ kind: "service", serviceCategoryId: foreign.id }));
    const d = await createEstimate(a, null, { customerId, title: "Service snapshot test" });
    const path = `/api/estimates/${d.id}/versions/${d.version.id}`;
    const create = (body: object) => request(appFor()).post(`${path}/lines`).send({ sectionId: d.version.sections[0].id, quantity: "2", lineType: "service", ...body });
    const first = await create({ quickItemId: source.id });
    expect(first.status).toBe(201);
    const snapshot = first.body.version.sections[0].lines[0];
    expect(snapshot).toMatchObject({ name: "Aeration snapshot", detail: null, unit: "1,000 SF", priceSource: "quick_list", quickItemId: source.id, umbrellaKey: "landscape_labor", extendedCents: 2400 });
    expect((await create({ quickItemId: other.id })).status).toBe(404);
    expect(createEstimateLineSchema.safeParse({ lineType: "service", sectionId: "s", quantity: "1", quickItemId: "q", unitPriceCents: 100 }).success).toBe(false);
    const free = await create({ name: "Free service", detail: "Customer visible", unit: "FLAT", unitPriceCents: 90, umbrellaKey: "irrigation_labor" });
    expect(free.status).toBe(201);
    expect(free.body.version.sections[0].lines.find((l: { name: string }) => l.name === "Free service")).toMatchObject({ priceSource: "manual", quickItemId: null, unit: "FLAT" });
    await estimateCategoryCatalog.update(a, cat.id, { defaultUmbrellaKey: "plants", defaultUnit: "HR", isActive: false });
    expect((await create({ quickItemId: source.id })).status).toBe(404);
    await estimateQuickCatalog.update(a, source.id, { label: "Catalog changed", defaultRateCents: 9000 });
    const unchanged = await request(appFor()).get(`/api/estimates/${d.id}`);
    expect(unchanged.body.version.sections[0].lines.find((l: { id: string }) => l.id === snapshot.id)).toMatchObject(snapshot);
    const edited = await request(appFor()).patch(`${path}/lines/${snapshot.id}`).send({ name: "Manual name", detail: "Manual detail", unit: "LF", umbrellaKey: "fees_surcharges" });
    expect(edited.status).toBe(200);
    expect(edited.body.version.sections[0].lines.find((l: { id: string }) => l.id === snapshot.id)).toMatchObject({ name: "Manual name", detail: "Manual detail", unit: "LF", umbrellaKey: "fees_surcharges", priceSource: "quick_list" });
    await db.update(estimateVersions).set({ status: "sent" }).where(eq(estimateVersions.id, d.version.id));
    expect((await create({ name: "Locked", unit: "FLAT", unitPriceCents: 1, umbrellaKey: "landscape_labor" })).status).toBe(409);
    expect((await request(appFor()).patch(`${path}/lines/${snapshot.id}`).send({ name: "Locked" })).status).toBe(409);
    await db.update(estimateVersions).set({ status: "draft" }).where(eq(estimateVersions.id, d.version.id));
    await db.update(estimates).set({ voidedAt: new Date() }).where(eq(estimates.id, d.id));
    expect((await create({ quickItemId: source.id })).body.error).toBe("ESTIMATE_VOIDED");
    const umbrellas = edited.body.version.totals.byUmbrella;
    expect(Object.keys(umbrellas)).toHaveLength(6);
    expect(umbrellas.fees_surcharges).toBe(2400);
  }, 30000);
});
