import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db";
import { eq } from "drizzle-orm";
import { estimateQuickItems, estimateServiceCategories, estimateLineNeedsPrice, pool as schemaPool, type CreateEstimateLineInput } from "@workspace/db";
import { disposableDatabase } from "../test/disposableDatabase";
const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("../db", () => ({ get db() { return state.database; } }));
import { upsertQuickItemCsv } from "./quickItemCsv";
import { estimateQuickCatalog } from "./estimateQuickItems";
import { exportQuickItemCsv, importQuickItemCsv, type QuickItemCsvWrite } from "../lib/quickItemCsv";
import { snapshotEstimateLine } from "./estimateSnapshots";

let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let database: ReturnType<typeof drizzle<typeof schema>>;
const file = (name: string) => readFile(new URL(`../../../../.migration-backup/migrations/${name}`, import.meta.url), "utf8");
const data = (overrides: Partial<QuickItemCsvWrite> = {}): QuickItemCsvWrite => ({
  kind: "service", label: "Aeration", category: "New Category", defaultUnit: "HR",
  defaultRateCents: null, umbrellaKey: "landscape_labor", isActive: true, ...overrides,
});
const items = () => database.select().from(estimateQuickItems).orderBy(estimateQuickItems.label);
const categories = () => database.select().from(estimateServiceCategories).orderBy(estimateServiceCategories.name);
const csvHeader = "kind,category,name,unit,price,posts_to,active\n";
describe("isolated PostgreSQL quick-item CSV transactions", () => {
  beforeAll(async () => {
    fixture = await disposableDatabase();
    database = drizzle({ client: fixture.pool, schema });
    state.database = database;
    await fixture.pool.query(`CREATE TABLE companies(id varchar PRIMARY KEY);
      CREATE TABLE estimate_lines(id text PRIMARY KEY, line_type text, payload jsonb);`);
    await fixture.pool.query(await file("0053_estimate_setup.sql"));
    await fixture.pool.query(await file("0078_estimate_services.sql"));
    await fixture.pool.query(await file("0085_estimate_units.sql"));
  });
  beforeEach(async () => {
    await fixture.pool.query(`DROP TRIGGER IF EXISTS csv_test_failure ON estimate_quick_items;
      TRUNCATE companies CASCADE; TRUNCATE estimate_lines;
      INSERT INTO companies VALUES ('a'),('b');`);
  });
  afterAll(async () => { await fixture?.dispose(); await schemaPool.end(); });
  it("creates categories from the first successful row and preserves defaults/spelling/state across case matches", async () => {
    expect(await upsertQuickItemCsv("a", data())).toEqual({ outcome: "inserted", categoryCreated: "New Category" });
    const original = (await categories())[0];
    const row = (await items())[0];
    await database.update(estimateQuickItems).set({ sortOrder: 37 }).where(eq(estimateQuickItems.id, row.id));
    expect(await upsertQuickItemCsv("a", data({ label: "AERATION", category: "new CATEGORY", defaultUnit: "DAY", umbrellaKey: "fees_surcharges", defaultRateCents: 0, isActive: false })))
      .toEqual({ outcome: "updated", categoryCreated: undefined });
    expect(await categories()).toEqual([original]);
    expect((await items())[0]).toMatchObject({
      id: row.id, label: "Aeration", sortOrder: 37, defaultUnit: "DAY", defaultRateCents: 0,
      umbrellaKey: "fees_surcharges", isActive: false, serviceCategoryId: original.id,
    });
  });
  it("updates or inserts each kind and never falls back to category rates for null prices", async () => {
    for (const kind of ["service", "equipment", "fee"] as const) {
      const values = data({ kind, label: kind, category: kind === "service" ? "General" : "" });
      expect((await upsertQuickItemCsv("a", values)).outcome).toBe("inserted");
      expect((await upsertQuickItemCsv("a", { ...values, defaultRateCents: 100 })).outcome).toBe("updated");
      await upsertQuickItemCsv("a", values);
    }
    expect((await items()).map(row => row.defaultRateCents)).toEqual([null, null, null]);
    expect((await categories()).length).toBe(1);
  });
  it("keeps tenant IDs and case-insensitive matching isolated", async () => {
    await upsertQuickItemCsv("a", data());
    await upsertQuickItemCsv("b", data({ defaultRateCents: 99 }));
    expect((await items()).map(r => r.companyId).sort()).toEqual(["a", "b"]);
    expect((await categories()).length).toBe(2);
    expect((await estimateQuickCatalog.list("a"))[0].defaultRateCents).toBeNull();
    expect((await estimateQuickCatalog.list("b"))[0].defaultRateCents).toBe(99);
  });
  it("skips cross-kind collisions without creating an orphan category and continues later rows", async () => {
    await upsertQuickItemCsv("a", data({ kind: "fee", category: "" }));
    const before = await items();
    const result = await importQuickItemCsv(csvHeader +
      "service,Orphan,AERATION,HR,,Landscape Labor,true\nservice,Good,Later,DAY,0,Fees & Surcharges,false", "services", row => upsertQuickItemCsv("a", row));
    expect(result).toMatchObject({ inserted: 1, updated: 0, categoriesCreated: ["Good"] });
    expect(result.skipped[0]).toMatchObject({ line: 2, reason: "Name already belongs to another kind (fee)" });
    expect((await categories()).map(c => c.name)).toEqual(["Good"]);
    expect((await items())[0]).toEqual(before[0]);
  });
  it("rolls back failed item writes and category creation while later valid rows commit", async () => {
    await fixture.pool.query(`CREATE OR REPLACE FUNCTION csv_test_failure_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.label='Fail' THEN RAISE EXCEPTION 'private fixture failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER csv_test_failure BEFORE INSERT OR UPDATE ON estimate_quick_items FOR EACH ROW EXECUTE FUNCTION csv_test_failure_fn();`);
    const result = await importQuickItemCsv(csvHeader +
      "service,Orphan,Fail,DAY,0,Fees & Surcharges,true\nservice,Orphan,Survives,HR,,Landscape Labor,true", "services", row => upsertQuickItemCsv("a", row));
    expect(result).toEqual({ inserted: 1, updated: 0, categoriesCreated: ["Orphan"], skipped: [{ line: 2, reason: "Unable to save row" }] });
    expect((await categories())[0]).toMatchObject({ defaultUnit: "HR", defaultUmbrellaKey: "landscape_labor" });
    expect((await items()).map(i => i.label)).toEqual(["Survives"]);
  });
  it("retains inactive associations, blocks new/reassigned services, and never reactivates categories", async () => {
    await upsertQuickItemCsv("a", data());
    const cat = (await categories())[0];
    await database.update(estimateServiceCategories).set({ isActive: false }).where(eq(estimateServiceCategories.id, cat.id));
    await expect(upsertQuickItemCsv("a", data({ defaultRateCents: 500 }))).resolves.toMatchObject({ outcome: "updated" });
    await expect(upsertQuickItemCsv("a", data({ label: "New" }))).rejects.toThrow("active category");
    await upsertQuickItemCsv("a", data({ label: "Other", category: "Active" }));
    await expect(upsertQuickItemCsv("a", data({ label: "Other" }))).rejects.toThrow("active category");
    expect((await categories()).find(c => c.id === cat.id)?.isActive).toBe(false);
    const rows = await estimateQuickCatalog.list("a");
    const before = await items();
    const result = await importQuickItemCsv(exportQuickItemCsv(rows, "services"), "services", row => upsertQuickItemCsv("a", row));
    expect(result).toEqual({ inserted: 0, updated: 2, categoriesCreated: [], skipped: [] });
    expect(await items()).toEqual(before);
  });
  it("roundtrips all stored fields and identities with exact null/zero and timestamps unchanged", async () => {
    await upsertQuickItemCsv("a", data({ label: 'One, "quoted"\nname', defaultUnit: "1,000 SF", isActive: false }));
    await upsertQuickItemCsv("a", data({ kind: "equipment", label: "Machine", category: "", defaultRateCents: 0, defaultUnit: "DAY" }));
    await upsertQuickItemCsv("a", data({ kind: "fee", label: "Fee", category: "", defaultRateCents: 2147483647, umbrellaKey: "fees_surcharges" }));
    const before = await items(), cats = await categories();
    for (const scope of ["services", "equipment-fees"] as const) {
      const result = await importQuickItemCsv(exportQuickItemCsv(await estimateQuickCatalog.list("a"), scope), scope, row => upsertQuickItemCsv("a", row));
      expect(result).toMatchObject({ inserted: 0, categoriesCreated: [], skipped: [] });
      expect(result.updated).toBe(scope === "services" ? 1 : 2);
    }
    expect(await items()).toEqual(before);
    expect(await categories()).toEqual(cats);
  });
  it("handles repeated and concurrent case-insensitive names without duplicates or cross-kind overwrites", async () => {
    const results = await Promise.all([
      upsertQuickItemCsv("a", data()), upsertQuickItemCsv("a", data({ label: "AERATION" })),
      upsertQuickItemCsv("a", data({ label: "Second", category: "NEW CATEGORY", defaultUnit: "DAY" })),
    ]);
    expect(results.filter(r => r.categoryCreated).length).toBe(1);
    expect(results.map(r => r.outcome).sort()).toEqual(["inserted", "inserted", "updated"]);
    expect((await categories()).length).toBe(1);
    expect((await items()).length).toBe(2);
    const collision = await Promise.allSettled([
      upsertQuickItemCsv("a", data({ label: "Race", category: "Race Category" })),
      upsertQuickItemCsv("a", data({ label: "RACE", kind: "fee", category: "" })),
    ]);
    expect(collision.filter(r => r.status === "fulfilled").length).toBe(1);
    expect((await items()).filter(i => i.label.toLowerCase() === "race").length).toBe(1);
    const winner = (await items()).find(i => i.label.toLowerCase() === "race")!;
    expect((await categories()).some(c => c.name === "Race Category")).toBe(winner.kind === "service");
  });
  it("rechecks kind after a concurrent ordinary create wins the unique key, rolling back the orphan", async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO estimate_quick_items(company_id,kind,label,default_unit,umbrella_key)
        VALUES ('a','fee','Race','FLAT','fees_surcharges')`);
      const pending = upsertQuickItemCsv("a", data({ label: "race", category: "Must Roll Back" }));
      // Observe the import waiting on the actual unique-index transaction lock.
      let waiting = false;
      for (let i = 0; i < 150; i++) {
        const result = await fixture.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE 'insert into "estimate_quick_items"%'`);
        if (result.rows.length) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      const rejected = expect(pending).rejects.toThrow("another kind");
      await client.query("COMMIT");
      await rejected;
      expect(await categories()).toEqual([]);
      expect((await items())[0]).toMatchObject({ kind: "fee", label: "Race" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("imports null prices into snapshots that need a price, without changing captured snapshots later", async () => {
    for (const kind of ["service", "equipment", "fee"] as const) {
      await upsertQuickItemCsv("a", data({ kind, label: kind, category: kind === "service" ? "General" : "" }));
      const row = (await items()).find(i => i.kind === kind)!;
      const input = { lineType: kind, quickItemId: row.id, quantity: "1", sectionId: "s" } as CreateEstimateLineInput;
      const snapshot = await database.transaction(tx => snapshotEstimateLine(tx, "a", "unused", input));
      expect(snapshot).toMatchObject({ unitPriceCents: 0, priceSource: "quick_list", quickItemId: row.id });
      expect(estimateLineNeedsPrice(snapshot as Parameters<typeof estimateLineNeedsPrice>[0])).toBe(true);
      await fixture.pool.query("INSERT INTO estimate_lines VALUES ($1,$2,$3)", [kind, kind, JSON.stringify(snapshot)]);
      await upsertQuickItemCsv("a", data({ kind, label: kind, category: kind === "service" ? "General" : "", defaultRateCents: 12345, defaultUnit: "DAY" }));
      expect((await fixture.pool.query("SELECT payload FROM estimate_lines WHERE id=$1", [kind])).rows[0].payload).toEqual(snapshot);
    }
  });
  it("retries same-kind ordinary creates without losing their IDs, sort order or spelling", async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      const original = (await client.query(`INSERT INTO estimate_quick_items(company_id,kind,label,default_unit,umbrella_key,sort_order)
        VALUES ('a','equipment','Machine','HR','landscape_labor',42) RETURNING *`)).rows[0];
      const pending = upsertQuickItemCsv("a", data({ kind: "equipment", category: "", label: "MACHINE", defaultUnit: "DAY", defaultRateCents: 0, isActive: false }));
      let waiting = false;
      for (let i = 0; i < 150; i++) {
        const result = await fixture.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE 'insert into "estimate_quick_items"%'`);
        if (result.rows.length) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await client.query("COMMIT");
      expect(await pending).toMatchObject({ outcome: "updated" });
      expect((await items())[0]).toMatchObject({ id: original.id, label: "Machine", sortOrder: 42, defaultUnit: "DAY", defaultRateCents: 0, isActive: false });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("rechecks inactive status when an ordinary category update wins the row lock", async () => {
    const [category] = await database.insert(estimateServiceCategories).values({
      companyId: "a", name: "Retiring", defaultUnit: "HR", defaultUmbrellaKey: "landscape_labor",
    }).returning();
    const client = await fixture.pool.connect();
    try {
      const holder = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await client.query("BEGIN");
      await client.query("UPDATE estimate_service_categories SET is_active=false WHERE id=$1", [category.id]);
      const pending = upsertQuickItemCsv("a", data({ category: "retiring" }));
      let waiting = false;
      for (let i = 0; i < 150; i++) {
        // PostgreSQL may first wait while deciding ON CONFLICT visibility,
        // before the subsequent SELECT FOR SHARE. Observe the blocker, not SQL spelling.
        const result = await fixture.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND $1 = ANY(pg_blocking_pids(pid))`, [holder]);
        if (result.rows.length) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      const rejected = expect(pending).rejects.toThrow("active category");
      await client.query("COMMIT");
      await rejected;
      expect(await items()).toEqual([]);
      expect((await categories())[0]).toMatchObject({ id: category.id, isActive: false });
    } finally { await client.query("ROLLBACK"); client.release(); }
  }, 15000);
});
