import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, irrigationCatalogItems as items, irrigationSyncRuns as runs } from "@workspace/db";
import { db, pool } from "../db";
import { irrigationCatalog as catalog } from "./irrigationCatalog";

const a = randomUUID(), b = randomUUID();
const csv = (rows: string) => `sku,name,category,price,cost,brand,isActive\n${rows}`;
const row = (sku: string, name = sku, active = "true") => `${sku},${name},Fittings,1.23,0.50,Brand,${active}`;
const upload = (text: string, company = a) => catalog.import(company, null, "fixture.csv", text);
describe.skipIf(!process.env.DATABASE_URL)("irrigation atomic PostgreSQL mirror", () => {
  beforeAll(async () => {
    await db.insert(companies).values([a, b].map(id => ({ id, name: "Irrigation test", slug: `irrigation-${id}` })));
  });
  afterAll(async () => {
    await db.delete(companies).where(inArray(companies.id, [a, b]));
    await pool.end();
  });
  it("ships guarded migration, indexes/defaults and tenant/SKU uniqueness", async () => {
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0052_irrigation_catalog.sql", import.meta.url), "utf8");
    expect(migration.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|EXTENSION) (?!IF NOT EXISTS)/g)).toBeNull();
    const indexes = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'irrigation_catalog_items'`);
    expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining(["irrigation_catalog_items_company_sku_idx", "irrigation_catalog_items_company_id_idx", "irrigation_catalog_items_category_idx", "irrigation_catalog_items_name_trgm_idx"]));
    await upload(csv(row("A") + "\n" + row("B")));
    await upload(csv(row("A", "Foreign")), b);
    const item = (await catalog.list(a)).items[0];
    expect(item).toMatchObject({ companyId: a, externalSku: "A", unit: "ea", umbrellaKey: "irrigation_materials", retailPriceCents: 123, wholesaleCostCents: 50 });
    await expect(db.insert(items).values({ companyId: a, externalSku: "A", name: "Duplicate", category: "F" })).rejects.toThrow();
    await expect(db.insert(items).values({ companyId: a, externalSku: "BAD", name: "Bad", category: "F", umbrellaKey: "other" })).rejects.toThrow();
  });
  it("unchanged reimports create success runs but preserve business timestamps and refresh lastSeenAt", async () => {
    const before = (await catalog.list(a)).items;
    const result = await upload(csv(row("A") + "\n" + row("B")));
    expect(result.run).toMatchObject({ status: "success", itemsUpserted: 0, itemsDeactivated: 0, itemsSkipped: 0, source: "irrigopro_csv" });
    const after = (await catalog.list(a)).items;
    expect(after.map(item => item.updatedAt)).toEqual(before.map(item => item.updatedAt));
    expect(after[0].lastSeenAt.getTime()).toBeGreaterThan(before[0].lastSeenAt.getTime());
    expect(result.run.finishedAt).toBeInstanceOf(Date);
  });
  it("partial replacement preserves identifiable invalid SKU, deactivates true absences and respects explicit inactive", async () => {
    await upload(csv(row("A") + "\n" + row("B") + "\n" + row("MISSING")));
    const result = await upload(csv(row("A", "Renamed", "false") + "\nB,,Fittings,1,,,true\nC,New,Fittings,0,,,true\nC,Duplicate,Fittings,2,,,true"));
    expect(result.run).toMatchObject({ status: "partial", itemsUpserted: 2, itemsSkipped: 2, itemsDeactivated: 1 });
    expect(result.run.skippedRows.map(skip => skip.line)).toEqual([3, 5]);
    const next = await upload(csv(row("C") + "\nB,,Fittings,1,,,true"));
    expect(next.run).toMatchObject({ status: "partial", itemsDeactivated: 0 });
    expect((await catalog.list(a, { includeInactive: true })).items.find(item => item.externalSku === "A")?.isActive).toBe(false);
    const last = await upload(csv(row("C")));
    expect(last.run.itemsDeactivated).toBe(1);
    expect((await catalog.list(a)).items.map(item => item.externalSku)).toEqual(["C"]);
    expect((await catalog.list(b)).items[0].name).toBe("Foreign");
  });
  it("rejects invalid file/header and wholly invalid records without modifying any catalog data", async () => {
    const before = (await catalog.list(a, { includeInactive: true })).items;
    for (const text of ["", "name,category,price\nPart,F,1", csv(""), csv("C,,F,invalid,,,true")]) {
      const result = await upload(text);
      expect(result.httpStatus).toBe(400);
      expect(result.run).toMatchObject({ status: "error", itemsUpserted: 0, itemsDeactivated: 0 });
      expect(result.run.finishedAt).toBeInstanceOf(Date);
    }
    expect((await catalog.list(a, { includeInactive: true })).items).toEqual(before);
    expect((await catalog.history(a, 50)).some(run => run.errorMessage?.includes("sku"))).toBe(true);
  });
  it("searches literal names/SKUs with tenant-only facets and category/brand/inactive filters", async () => {
    await upload(csv("S100,100%_Part,Special,1,,UniqueBrand,true\nOFF,Inactive,Other,2,,,false"));
    const result = await catalog.list(a, { search: "100%_", category: "Special", brand: "UniqueBrand" });
    expect(result.items.map(item => item.externalSku)).toEqual(["S100"]);
    expect(result.categories).toContain("Other");
    expect(result.brands).toEqual(["Brand", "UniqueBrand"]);
    expect((await catalog.list(a, { search: "OFF" })).items).toEqual([]);
    expect((await catalog.list(a, { search: "OFF", includeInactive: true })).items).toHaveLength(1);
    expect((await catalog.list(b)).brands).not.toContain("UniqueBrand");
    expect(await catalog.history(a, 2)).toHaveLength(2);
    expect((await catalog.history(b)).every(run => run.companyId === b)).toBe(true);
  });
  it("rolls back earlier item writes on persistence failure and finishes the run error", async () => {
    const before = (await catalog.list(a, { includeInactive: true })).items;
    // A company-specific failing trigger simulates a DB failure after one insert.
    const fn = `irrigation_fail_${a.replace(/-/g, "")}`;
    await db.execute(sql.raw(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.company_id = '${a}' AND NEW.external_sku = 'FAIL' THEN RAISE EXCEPTION 'private persistence detail'; END IF; RETURN NEW; END $$`));
    await db.execute(sql.raw(`CREATE TRIGGER ${fn} BEFORE INSERT ON irrigation_catalog_items FOR EACH ROW EXECUTE FUNCTION ${fn}()`));
    try {
      const result = await upload(csv(row("FIRST") + "\n" + row("FAIL")));
      expect(result.httpStatus).toBe(500);
      expect(result.run).toMatchObject({ status: "error", itemsUpserted: 0, itemsDeactivated: 0 });
      expect(result.run.errorMessage).not.toContain("private persistence detail");
      expect((await catalog.list(a, { includeInactive: true })).items).toEqual(before);
      expect((await catalog.history(a))[0].status).toBe("error");
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${fn} ON irrigation_catalog_items`));
      await db.execute(sql.raw(`DROP FUNCTION ${fn}()`));
    }
    expect((await upload(csv(row("RECOVERED")))).run.status).toBe("success");
  });
  it("persists running before parsing/replacement and serializes concurrent full-file replacements", async () => {
    let release!: () => void, locked!: () => void;
    const lockReady = new Promise<void>(resolve => { locked = resolve; });
    const unlock = new Promise<void>(resolve => { release = resolve; });
    const blocking = db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`irrigation:${a}`}, 0))`);
      locked(); await unlock;
    });
    await lockReady;
    const imports = [upload(csv(row("X1") + "\n" + row("X2"))), upload(csv(row("Y1") + "\n" + row("Y2")))];
    try {
      let running = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        running = (await db.select().from(runs).where(and(eq(runs.companyId, a), eq(runs.status, "running")))).length;
        if (running === 2) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(running).toBe(2);
    } finally { release(); await blocking; }
    const results = await Promise.all(imports);
    expect(results.map(result => result.run.status)).toEqual(["success", "success"]);
    const active = (await catalog.list(a)).items.map(item => item.externalSku);
    expect([["X1", "X2"], ["Y1", "Y2"]]).toContainEqual(active);
    expect((await catalog.history(a, 50)).some(run => run.status === "running")).toBe(false);
  });
});
