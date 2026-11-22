import type { Pool } from "pg";

type RequiredObject = {
  id: string;
  label: string;
  schema: string;
  name: string;
  migration: string;
  sqlFile: string;
} & (
  | { kind: "function"; arguments: string; returns: string }
  | { kind: "trigger"; relation: string; functionSignature: string }
  | { kind: "rule"; relation: string }
  | { kind: "view" }
);

const migration = "0062_route_customer_history.sql";
const sqlFile = "0062-routes-customer-retirement.sql";

export const REQUIRED_SQL_OBJECTS: readonly RequiredObject[] = [
  {
    id: "routes-retirement-function",
    label: "Routes customer-retirement function",
    kind: "function", schema: "public", name: "retire_routes_before_customer_delete",
    arguments: "", returns: "trigger", migration, sqlFile,
  },
  {
    id: "routes-retirement-trigger",
    label: "Routes customer-retirement trigger",
    kind: "trigger", schema: "public", name: "routes_customer_retirement", relation: "customers",
    functionSignature: "public.retire_routes_before_customer_delete()", migration, sqlFile,
  },
];

export type RequiredSqlObject = (typeof REQUIRED_SQL_OBJECTS)[number];
export type SqlObjectCatalogReader = Pick<Pool, "query">;

export async function readRequiredSqlObjects(reader: SqlObjectCatalogReader) {
  const { rows } = await reader.query<{ id: string; present: boolean }>(`
    SELECT o.id, CASE o.kind
      WHEN 'function' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=o.schema AND p.proname=o.name AND p.prokind='f'
          AND pg_catalog.oidvectortypes(p.proargtypes)=o.arguments
          AND pg_catalog.format_type(p.prorettype,NULL)=o.returns
      )
      WHEN 'trigger' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=o.schema AND c.relname=o.relation AND t.tgname=o.name
          AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
          AND t.tgfoid=pg_catalog.to_regprocedure(o."functionSignature")
      )
      WHEN 'rule' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_rewrite r
        JOIN pg_catalog.pg_class c ON c.oid=r.ev_class
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=o.schema AND c.relname=o.relation AND r.rulename=o.name
      )
      WHEN 'view' THEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=o.schema AND c.relname=o.name AND c.relkind='v'
      )
      ELSE FALSE
    END AS present
    FROM pg_catalog.jsonb_to_recordset($1::jsonb)
      AS o(id text, kind text, schema text, name text, relation text, arguments text,
           returns text, "functionSignature" text)
    ORDER BY o.id
  `, [JSON.stringify(REQUIRED_SQL_OBJECTS)]);
  const statuses = new Map(rows.map(row => [row.id, row.present]));
  return REQUIRED_SQL_OBJECTS.map(object => {
    const present = statuses.get(object.id);
    if (typeof present !== "boolean") throw new Error("Missing catalog check result");
    return { ...object, present };
  });
}
