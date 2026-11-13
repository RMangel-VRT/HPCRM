import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { hardscapeCatalogItems, pool as schemaPool } from "@workspace/db";
import { disposableDatabase } from "../test/disposableDatabase";
import { hardscapeStorage } from "./hardscapeStorage";

let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let database: ReturnType<typeof drizzle>;
vi.mock("../db", () => ({ get db() { return database; } }));
const migration = (name: string) => readFileSync(new URL(`../../../../.migration-backup/migrations/${name}`, import.meta.url), "utf8");
const categoryMigration = migration("0086_hardscape_category_default.sql");
const snapshot = async () => (await fixture.pool.query(
  "SELECT row_to_json(t)::text AS bytes FROM (SELECT * FROM hardscape_catalog_items ORDER BY id) t",
)).rows;

describe.skipIf(!process.env.DATABASE_URL)("Hardscape category defaults and identity in isolated PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await disposableDatabase();
    database = drizzle(fixture.pool);
    // Both absent-table and absent-column guards execute against real PostgreSQL.
    await fixture.pool.query(categoryMigration);
    await fixture.pool.query("CREATE TABLE hardscape_catalog_items(id text PRIMARY KEY)");
    await fixture.pool.query(categoryMigration);
    await fixture.pool.query("DROP TABLE hardscape_catalog_items; CREATE TABLE companies(id varchar PRIMARY KEY)");
    await fixture.pool.query(migration("0050_hardscape_catalog.sql"));
    await fixture.pool.query("INSERT INTO companies VALUES ('a'), ('b')");
  });
  beforeEach(async () => { await fixture.pool.query("TRUNCATE hardscape_catalog_items"); });
  afterAll(async () => { await fixture?.dispose(); await schemaPool.end(); });

  it("changes only the category default, repeats safely and preserves every stored byte", async () => {
    await fixture.pool.query(`INSERT INTO hardscape_catalog_items
      (company_id,name,category,created_at,updated_at) VALUES
      ('a','One','general','2026-01-01 12:34:56.123456','2026-02-02 12:34:56.654321'),
      ('b','Two','GENERAL','2026-01-01','2026-02-02')`);
    const before = await snapshot();
    const columns = () => fixture.pool.query(`SELECT column_name,column_default,data_type,is_nullable
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name='hardscape_catalog_items' ORDER BY ordinal_position`);
    const schemaBefore = (await columns()).rows;
    await fixture.pool.query(categoryMigration);
    await fixture.pool.query(categoryMigration);
    expect(await snapshot()).toEqual(before);
    expect((await columns()).rows).toEqual(schemaBefore.map(row =>
      row.column_name === "category" ? { ...row, column_default: "'General'::text" } : row));
    const [inserted] = await database.insert(hardscapeCatalogItems).values({ companyId: "a", name: "Omitted" }).returning();
    expect(inserted.category).toBe("General");
    // Raw SQL proves the database itself supplies the default, not just Drizzle.
    expect((await fixture.pool.query(`INSERT INTO hardscape_catalog_items(company_id,name)
      VALUES ('b','SQL omitted') RETURNING category`)).rows[0].category).toBe("General");
  });

  it("returns only General for an empty or all-General company", async () => {
    expect(await hardscapeStorage.getHardscapeCatalog("a")).toEqual({ items: [], categories: ["General"] });
    await hardscapeStorage.createHardscapeCatalogItem("a", { name: "One", category: "General", unit: "EA", isActive: true });
    await hardscapeStorage.createHardscapeCatalogItem("a", { name: "Two", category: "General", unit: "EA", isActive: true });
    expect((await hardscapeStorage.getHardscapeCatalog("a")).categories).toEqual(["General"]);
  });

  it("retains deterministic stored spelling and filters every case variant within its company", async () => {
    for (const [index, category] of ["general", "General", "pavers", "Pavers", "PAVERS", "Stone"].entries()) {
      await hardscapeStorage.createHardscapeCatalogItem("a", { name: `Item ${index}`, category, unit: "EA", isActive: index !== 4 });
    }
    await hardscapeStorage.createHardscapeCatalogItem("b", { name: "Foreign", category: "pavers", unit: "EA", isActive: true });
    await hardscapeStorage.createHardscapeCatalogItem("b", { name: "Private", category: "private-b", unit: "EA", isActive: true });
    const before = await snapshot();
    expect((await hardscapeStorage.getHardscapeCatalog("a")).categories).toEqual(["General", "PAVERS", "Stone"]);
    expect((await hardscapeStorage.getHardscapeCatalog("b")).categories).toEqual(["General", "pavers", "private-b"]);
    const selected = await hardscapeStorage.getHardscapeCatalog("a", { category: "PAVERS" });
    expect(selected.items.map(item => item.category).sort()).toEqual(["Pavers", "pavers"]);
    expect((await hardscapeStorage.getHardscapeCatalog("a", { category: "pAvErS", includeInactive: true })).items).toHaveLength(3);
    expect((await hardscapeStorage.getHardscapeCatalog("a", { category: "GENERAL" })).items).toHaveLength(2);
    expect(await snapshot()).toEqual(before);
  });

  it("prefers a stored lowercase general over the built-in fallback without relabeling", async () => {
    await hardscapeStorage.createHardscapeCatalogItem("a", { name: "Old", category: "general", unit: "EA", isActive: true });
    expect((await hardscapeStorage.getHardscapeCatalog("a")).categories).toEqual(["general"]);
  });
});
