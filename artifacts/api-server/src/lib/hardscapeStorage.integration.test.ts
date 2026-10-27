import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, hardscapeCatalogItems } from "@workspace/db";
import { db, pool } from "../db";
import { hardscapeStorage as storage } from "./hardscapeStorage";
import { exportHardscapeCsv, importHardscapeCsv } from "./hardscapeCsv";

const companyA = randomUUID(), companyB = randomUUID();
const material = (name: string, sku: string | null = null) => ({
  name, sku, category: "general", description: null, unit: "ea",
  wholesaleCostCents: null, retailPriceCents: 0, isActive: true,
});
describe.skipIf(!process.env.DATABASE_URL)("hardscape real PostgreSQL storage", () => {
  beforeAll(async () => {
    await db.insert(companies).values([companyA, companyB].map(id => ({ id, name: "Catalog integration fixture", slug: `catalog-test-${id}` })));
  });
  afterAll(async () => {
    await db.delete(companies).where(inArray(companies.id, [companyA, companyB]));
    await pool.end();
  });
  it("migration is guarded and required indexes, defaults and constraints exist", async () => {
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0050_hardscape_catalog.sql", import.meta.url), "utf8");
    expect(migration.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|EXTENSION) (?!IF NOT EXISTS)/g)).toBeNull();
    const indexes = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'hardscape_catalog_items'`);
    expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining([
      "hardscape_catalog_items_company_id_idx", "hardscape_catalog_items_category_idx",
      "hardscape_catalog_items_company_sku_idx", "hardscape_catalog_items_name_trgm_idx",
    ]));
    const row = await storage.createHardscapeCatalogItem(companyA, material("Default check", "DEFAULT"));
    expect(row.umbrellaKey).toBe("landscape_materials");
    expect(row.createdAt).toBeInstanceOf(Date);
    await expect(db.insert(hardscapeCatalogItems).values({ ...material("negative"), companyId: companyA, retailPriceCents: -1 })).rejects.toThrow();
  });
  it("isolates IDs, category suggestions, duplicate SKUs, inactive and literal searches", async () => {
    const a = await storage.createHardscapeCatalogItem(companyA, { ...material("Unique 100%_Rock", "SAME"), category: "private-a" });
    await storage.createHardscapeCatalogItem(companyB, { ...material("Other tenant rock", "SAME"), category: "private-b" });
    await expect(storage.createHardscapeCatalogItem(companyA, material("Duplicate", "SAME"))).rejects.toThrow();
    expect(await storage.updateHardscapeCatalogItem(companyB, a.id, { name: "hacked" })).toBeUndefined();
    const scoped = await storage.getHardscapeCatalog(companyA, { search: "100%_" });
    expect(scoped.items.map(row => row.id)).toEqual([a.id]);
    expect(scoped.categories).toContain("private-a");
    expect(scoped.categories).not.toContain("private-b");
    expect(scoped.categories).toContain("general");
    const updated = await storage.updateHardscapeCatalogItem(companyA, a.id, { isActive: false, wholesaleCostCents: null });
    expect(updated).toMatchObject({ name: a.name, sku: "SAME", isActive: false, wholesaleCostCents: null, retailPriceCents: 0 });
    expect((await storage.getHardscapeCatalog(companyA, { search: "SAME" })).items).toEqual([]);
    expect((await storage.getHardscapeCatalog(companyA, { search: "SAME", includeInactive: true })).items).toHaveLength(1);
    await storage.updateHardscapeCatalogItem(companyA, a.id, { isActive: true });
    expect((await storage.getHardscapeCatalog(companyA, { search: "SAME" })).items).toHaveLength(1);
  });
  it("upserts by exact trimmed SKU or case-insensitive name within company; unchanged reimport never rewrites", async () => {
    expect(await storage.upsertHardscapeCatalogItem(companyA, material("Initial name", "UPSERT"))).toBe("inserted");
    expect(await storage.upsertHardscapeCatalogItem(companyA, material("Renamed", "UPSERT"))).toBe("updated");
    expect(await storage.upsertHardscapeCatalogItem(companyB, material("Other tenant", "UPSERT"))).toBe("inserted");
    expect(await storage.upsertHardscapeCatalogItem(companyA, material("No SKU"))).toBe("inserted");
    expect(await storage.upsertHardscapeCatalogItem(companyA, { ...material("no sku"), description: 'A "description",\nwith lines' })).toBe("updated");
    const before = (await storage.getHardscapeCatalog(companyA, { includeInactive: true })).items;
    const csv = exportHardscapeCsv(before);
    const result = await importHardscapeCsv(csv, data => storage.upsertHardscapeCatalogItem(companyA, data));
    expect(result).toEqual({ inserted: 0, updated: before.length, skipped: [] });
    expect((await storage.getHardscapeCatalog(companyA, { includeInactive: true })).items).toEqual(before);
    const foreign = (await storage.getHardscapeCatalog(companyB, { search: "UPSERT", includeInactive: true })).items;
    expect(foreign[0].name).toBe("Other tenant");
  });
  it("round-trips duplicate names without clearing a same-named SKU or rewriting distinct SKU-less rows", async () => {
    await storage.createHardscapeCatalogItem(companyA, material("Repeated name", "HAS-SKU"));
    await storage.createHardscapeCatalogItem(companyA, { ...material("Repeated name"), retailPriceCents: 100 });
    await storage.createHardscapeCatalogItem(companyA, { ...material("Repeated name"), retailPriceCents: 200 });
    const before = (await storage.getHardscapeCatalog(companyA, { search: "Repeated name", includeInactive: true })).items;
    expect(await importHardscapeCsv(exportHardscapeCsv(before), data => storage.upsertHardscapeCatalogItem(companyA, data))).toEqual({
      inserted: 0, updated: 3, skipped: [],
    });
    expect((await storage.getHardscapeCatalog(companyA, { search: "Repeated name", includeInactive: true })).items).toEqual(before);
  });
  it("continues after one database-level failure and supports concurrent matching imports", async () => {
    const result = await importHardscapeCsv(
      "sku,category,name,description,unit,wholesale_cost,retail_price,active\nNEW,general,Good,,ea,,,true\n,general,Next,,ea,,,true",
      async data => {
        if (data.sku === "NEW") {
          await db.insert(hardscapeCatalogItems).values({ ...data, companyId: companyA, retailPriceCents: -1 });
        }
        return storage.upsertHardscapeCatalogItem(companyA, data);
      },
    );
    expect(result).toMatchObject({ inserted: 1, skipped: [{ line: 2 }] });
    const outcomes = await Promise.all(Array.from({ length: 3 }, () => storage.upsertHardscapeCatalogItem(companyA, material("Concurrent name"))));
    expect(outcomes.sort()).toEqual(["inserted", "updated", "updated"]);
    expect((await db.select().from(hardscapeCatalogItems).where(and(eq(hardscapeCatalogItems.companyId, companyA), eq(hardscapeCatalogItems.name, "Concurrent name"))))).toHaveLength(1);
  });
});
