import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { SERVICE_CATEGORY_DEFAULTS } from "@workspace/db";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), transaction: vi.fn(), warn: vi.fn(), info: vi.fn(),
}));
vi.mock("../db", () => ({ db: mocks }));
vi.mock("./logger", () => ({ logger: mocks }));
import { initializeEmptyServiceCategories, SERVICE_CATEGORY_BOOT_LOCK } from "./initializeEmptyServiceCategories";

const required = [
  ["companies", "id"],
  ...["id", "company_id", "name", "default_umbrella_key", "default_unit",
    "sort_order", "is_active", "created_at", "updated_at"]
    .map(column => ["estimate_service_categories", column]),
].map(([table_name, column_name]) => ({ table_name, column_name }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(work => work({ execute: mocks.execute }));
  mocks.execute.mockResolvedValueOnce({ rows: required })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ seeded_companies: 2 }] });
});

describe("guarded default service category startup", () => {
  it.each(required)("skips without category writes when $table_name.$column_name is missing", async missing => {
    mocks.execute.mockReset().mockResolvedValue({ rows: required.filter(row => row !== missing) });
    expect(await initializeEmptyServiceCategories()).toBe(0);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith({ missing: [`${missing.table_name}.${missing.column_name}`] },
      expect.stringContaining("skipped"));
  });
  it("skips a missing table and identifies its missing columns", async () => {
    mocks.execute.mockReset().mockResolvedValue({ rows: [required[0]] });
    expect(await initializeEmptyServiceCategories()).toBe(0);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledOnce();
  });
  it("awaits its dedicated transaction lock before eligibility, uses shared defaults and logs companies", async () => {
    expect(await initializeEmptyServiceCategories()).toBe(2);
    const dialect = new PgDialect();
    const queries = mocks.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query));
    expect(queries[1].sql).toContain("pg_advisory_xact_lock");
    expect(queries[1].params).toEqual([SERVICE_CATEGORY_BOOT_LOCK]);
    expect(queries[2].sql).toContain("WHERE NOT EXISTS");
    expect(queries[2].sql).toContain("ON CONFLICT (company_id, lower(name)) DO NOTHING");
    expect(queries[2].sql).toContain("count(DISTINCT company_id)");
    expect(queries[2].params).toEqual(SERVICE_CATEGORY_DEFAULTS.flatMap(row =>
      [row.name, row.defaultUmbrellaKey, row.defaultUnit, row.sortOrder]));
    expect(queries.map(q => q.sql).join(" ")).not.toMatch(/\b(CREATE|ALTER|DROP|UPDATE|DELETE)\b/i);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "read committed" });
    expect(mocks.info).toHaveBeenCalledWith({ seededCompanies: 2 }, expect.stringContaining("complete"));
  });
  it.each([0, 1, 2])("does not hide database errors at statement %i", async index => {
    mocks.execute.mockReset();
    for (let n = 0; n < index; n++) mocks.execute.mockResolvedValueOnce({ rows: n === 0 ? required : [] });
    mocks.execute.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(initializeEmptyServiceCategories()).rejects.toThrow("database unavailable");
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
