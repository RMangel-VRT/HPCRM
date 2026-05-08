import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import type pg from "pg";
import * as schema from "./schema";

export interface DriftReport {
  missingTables: string[];
  missingColumns: { table: string; column: string }[];
}

interface LiveColumnRow {
  table_name: string;
  column_name: string;
}

export async function checkSchemaDrift(
  pool: pg.Pool,
): Promise<DriftReport> {
  const declared = collectDeclaredColumns();

  const tableNames = Array.from(declared.keys());
  const liveByTable = new Map<string, Set<string>>();

  if (tableNames.length > 0) {
    const res = await pool.query<LiveColumnRow>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [tableNames],
    );
    for (const row of res.rows) {
      let set = liveByTable.get(row.table_name);
      if (!set) {
        set = new Set();
        liveByTable.set(row.table_name, set);
      }
      set.add(row.column_name);
    }
  }

  const missingTables: string[] = [];
  const missingColumns: { table: string; column: string }[] = [];

  for (const [tableName, columns] of declared) {
    const live = liveByTable.get(tableName);
    if (!live || live.size === 0) {
      missingTables.push(tableName);
      continue;
    }
    for (const column of columns) {
      if (!live.has(column)) {
        missingColumns.push({ table: tableName, column });
      }
    }
  }

  return { missingTables, missingColumns };
}

function collectDeclaredColumns(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== "object") continue;
    if (!is(value as object, PgTable)) continue;
    const config = getTableConfig(value as PgTable);
    out.set(
      config.name,
      config.columns.map((c) => c.name),
    );
  }
  return out;
}

export function formatDriftReport(report: DriftReport): string | null {
  if (
    report.missingTables.length === 0 &&
    report.missingColumns.length === 0
  ) {
    return null;
  }
  const lines: string[] = ["Schema drift detected:"];
  if (report.missingTables.length > 0) {
    lines.push("  Missing tables:");
    for (const t of report.missingTables) {
      lines.push(`    - ${t}`);
    }
  }
  if (report.missingColumns.length > 0) {
    lines.push("  Missing columns:");
    for (const { table, column } of report.missingColumns) {
      lines.push(`    - ${table}.${column}`);
    }
  }
  lines.push(
    "Run `pnpm --filter @workspace/scripts run migrate` to apply pending SQL files in .migration-backup/migrations/.",
  );
  return lines.join("\n");
}
