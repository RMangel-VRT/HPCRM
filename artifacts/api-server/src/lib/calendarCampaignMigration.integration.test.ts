import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { campaigns, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { campaignIdentityCheckSql } from "../../../../lib/db/src/campaignSql";

describe("SC2 migration safety and constraint parity", () => {
  afterAll(async () => { await Promise.all([pool.end(), schemaPool.end()]); });
  it("refuses populated legacy generated work without deleting any rows", async () => {
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0083_calendar_campaign_identity.sql", import.meta.url), "utf8");
    const guard = migration.slice(migration.indexOf("DO $$"), migration.indexOf("END $$;") + "END $$;".length)
      .replaceAll("campaigns", "sc2_legacy_guard");
    await db.transaction(async tx => {
      await tx.execute(sql`CREATE TEMP TABLE sc2_legacy_guard (source text) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO sc2_legacy_guard VALUES ('contract')`);
      let message = "";
      try { await tx.transaction(async nested => { await nested.execute(sql.raw(guard)); }); }
      catch (error: any) { message = String(error.cause?.message ?? error.message); }
      expect(message).toContain("SC2 refuses existing month-based generated work");
      expect((await tx.execute(sql`SELECT count(*)::int AS n FROM sc2_legacy_guard`)).rows[0].n).toBe(1);
    });
  });
  it("uses the exact shared expression in Drizzle and the migration-equivalent installed check", async () => {
    const check = getTableConfig(campaigns).checks.find(c => c.name === "campaigns_identity_check")!;
    expect(new PgDialect().sqlToQuery(check.value).sql).toBe(campaignIdentityCheckSql);
    const mirror = readFileSync(new URL("../../../highplains-crm/src/shared/schema.ts", import.meta.url), "utf8");
    expect(mirror).toContain('calendarRound: uniqueIndex("campaigns_calendar_round_unique").on(table.companyId, table.calendarEntryId, table.roundYear)');
    expect(mirror).toContain('generatedIdentity: check("campaigns_identity_check", campaignIdentityCheckSql)');
    // Compare Postgres's own canonical rendering rather than formatting SQL text.
    await db.transaction(async tx => {
      await tx.execute(sql.raw(`CREATE TEMP TABLE sc2_expression_probe (
        source text, service_key text, calendar_entry_id varchar, round_year smallint,
        round_month date, round_seq smallint, category text, subtype text,
        CONSTRAINT sc2_probe_check CHECK (${campaignIdentityCheckSql})
      ) ON COMMIT DROP`));
      const result = await tx.execute(sql`SELECT
        (SELECT pg_get_expr(conbin, conrelid) FROM pg_constraint WHERE conrelid='campaigns'::regclass AND conname='campaigns_identity_check') =
        (SELECT pg_get_expr(conbin, conrelid) FROM pg_constraint WHERE conrelid='sc2_expression_probe'::regclass AND conname='sc2_probe_check') AS equal`);
      expect(result.rows[0].equal).toBe(true);
    });
  });
});
