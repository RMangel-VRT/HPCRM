import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { REQUIRED_SQL_OBJECTS } from "@workspace/db/required-sql-objects";
import { auditSqlObjectMigrations } from "./sql-object-migration-audit";

const directory = new URL("../../.migration-backup/migrations/", import.meta.url);
const actualMigrations = readdirSync(directory).filter(name => name.endsWith(".sql"))
  .map(filename => ({ filename, sql: readFileSync(new URL(filename, directory), "utf8") }));

test("repository audit resolves the guarded Routes trigger and reviewed SQL is verbatim", () => {
  assert.deepEqual(auditSqlObjectMigrations(actualMigrations, REQUIRED_SQL_OBJECTS), []);
  const migration = actualMigrations.find(({ filename }) => filename === "0062_route_customer_history.sql")!;
  const ddl = migration.sql.slice(migration.sql.indexOf("CREATE OR REPLACE FUNCTION")).trim();
  const reviewed = readFileSync(new URL("../../docs/database/production-sql/0062-routes-customer-retirement.sql", import.meta.url), "utf8");
  assert.equal(reviewed.trim(), `BEGIN;\n\n${ddl}\n\nCOMMIT;`);
});

test("reports unregistered surviving objects, ignores retired objects and comments", () => {
  const first = { filename: "0100_create.sql", sql: `
    -- CREATE FUNCTION public.not_a_function();
    CREATE FUNCTION "public"."retired"() RETURNS void LANGUAGE plpgsql AS $f$
    BEGIN RAISE NOTICE 'CREATE TRIGGER fake'; END $f$;
    DO $$ BEGIN
      CREATE TRIGGER surprise AFTER UPDATE ON public.customers
        FOR EACH ROW EXECUTE FUNCTION public.retired();
    END $$;
  ` };
  const last = { filename: "0101_drop.sql", sql: `DROP FUNCTION IF EXISTS public.retired();` };
  assert.deepEqual(auditSqlObjectMigrations([last, first], []), [
    "0100_create.sql: trigger:public.customers.surprise is not registered",
  ]);
});

test("fails closed for literal dynamic object creation inside a DO block", () => {
  assert.throws(() => auditSqlObjectMigrations([{
    filename: "0100_create.sql", sql: `DO $$ BEGIN EXECUTE 'CREATE VIEW public.v AS SELECT 1'; END $$;`,
  }], []), /Dynamic SQL object DDL/);
});
