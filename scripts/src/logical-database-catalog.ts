import type { Client } from "pg";
import { REQUIRED_SQL_OBJECTS } from "@workspace/db/required-sql-objects";

export type CatalogEntry = { kind: string; relation: string; name: string; definition: unknown };

const publicCatalog = `
  WITH app_relations AS (
    SELECT * FROM pg_class WHERE relnamespace = 'public'::regnamespace
  ),
  app_tables AS (
    SELECT * FROM app_relations WHERE relkind IN ('r', 'p')
  )
  SELECT 'table' AS kind, relname AS relation, '' AS name,
         jsonb_build_array(relkind, relpersistence, relrowsecurity, relforcerowsecurity,
           pg_get_partkeydef(oid), pg_get_expr(relpartbound, oid)) AS definition
    FROM app_tables
  UNION ALL
  SELECT 'column', t.relname, a.attname,
         jsonb_build_array(format_type(a.atttypid, a.atttypmod), a.attnotnull,
           pg_get_expr(d.adbin,d.adrelid), a.attidentity, a.attgenerated,
           CASE WHEN a.attcollation <> ty.typcollation THEN a.attcollation::regcollation::text END)
    FROM app_tables t JOIN pg_attribute a ON a.attrelid=t.oid
    JOIN pg_type ty ON ty.oid=a.atttypid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint', t.relname, c.conname,
         jsonb_build_array(pg_get_constraintdef(c.oid), c.convalidated, c.condeferrable, c.condeferred)
    FROM app_tables t JOIN pg_constraint c ON c.conrelid=t.oid
  UNION ALL
  SELECT 'index', t.relname, i.relname,
         jsonb_build_array(pg_get_indexdef(i.oid), x.indisvalid, x.indisready)
    FROM app_tables t JOIN pg_index x ON x.indrelid=t.oid
    JOIN pg_class i ON i.oid=x.indexrelid
  UNION ALL
  SELECT 'sequence', '', c.relname,
         jsonb_build_array(format_type(s.seqtypid,NULL), s.seqstart::text, s.seqincrement::text,
           s.seqmax::text, s.seqmin::text, s.seqcache::text, s.seqcycle,
           (SELECT jsonb_agg(jsonb_build_array(d.deptype, ns.nspname, r.relname, a.attname)
                             ORDER BY ns.nspname,r.relname,a.attname,d.deptype)
              FROM pg_depend d JOIN pg_class r ON r.oid=d.refobjid
              JOIN pg_namespace ns ON ns.oid=r.relnamespace
              JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=d.refobjsubid
             WHERE d.classid='pg_class'::regclass AND d.objid=c.oid
               AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')))
    FROM app_relations c JOIN pg_sequence s ON s.seqrelid=c.oid
  UNION ALL
  SELECT 'enum', '', t.typname, jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
   WHERE t.typnamespace='public'::regnamespace GROUP BY t.typname
  UNION ALL
  SELECT 'policy', t.relname, p.polname,
         jsonb_build_array(p.polcmd, p.polpermissive,
           ARRAY(SELECT CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END
                 FROM unnest(p.polroles) r ORDER BY 1),
           pg_get_expr(p.polqual,t.oid), pg_get_expr(p.polwithcheck,t.oid))
    FROM app_tables t JOIN pg_policy p ON p.polrelid=t.oid
  UNION ALL
  SELECT CASE WHEN relkind='m' THEN 'materialized view' ELSE 'view' END, '', relname,
         to_jsonb(pg_get_viewdef(oid))
    FROM app_relations WHERE relkind IN ('v','m')
  UNION ALL
  SELECT 'function', '', p.proname || '(' || oidvectortypes(p.proargtypes) || ')', to_jsonb(pg_get_functiondef(p.oid))
    FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
                     AND d.objid=p.oid AND d.refclassid='pg_extension'::regclass AND d.deptype='e')
  UNION ALL
  SELECT 'trigger', t.relname, g.tgname, jsonb_build_array(pg_get_triggerdef(g.oid),g.tgenabled)
    FROM app_relations t JOIN pg_trigger g ON t.oid=g.tgrelid WHERE NOT g.tgisinternal
  UNION ALL
  SELECT 'rule', t.relname, r.rulename, to_jsonb(pg_get_ruledef(r.oid))
    FROM app_relations t JOIN pg_rewrite r ON t.oid=r.ev_class WHERE r.rulename <> '_RETURN'
  ORDER BY 1,2,3`;

export async function readLogicalCatalog(client: Client) {
  const { rows } = await client.query<CatalogEntry>(publicCatalog);
  return rows.filter(row => !REQUIRED_SQL_OBJECTS.some(object => {
    if (row.kind !== object.kind || object.schema !== "public") return false;
    if (object.kind === "function") return row.name === `${object.name}(${object.arguments})`;
    if (object.kind === "trigger" || object.kind === "rule") return row.name === object.name && row.relation === object.relation;
    return row.name === object.name;
  }));
}

export function diffLogicalCatalog(reference: CatalogEntry[], candidate: CatalogEntry[]): string[] {
  const key = (entry: CatalogEntry) => JSON.stringify([entry.kind, entry.relation, entry.name]);
  const label = (entry: CatalogEntry) => `${entry.kind} ${[entry.relation, entry.name].filter(Boolean).join(".")}`;
  const expected = new Map(reference.map(entry => [key(entry), entry]));
  const actual = new Map(candidate.map(entry => [key(entry), entry]));
  const diff: string[] = [];
  for (const [id, entry] of expected) {
    const got = actual.get(id);
    if (!got) diff.push(`Missing in declarations: ${label(entry)} ${JSON.stringify(entry.definition)}`);
    else if (JSON.stringify(entry.definition) !== JSON.stringify(got.definition)) {
      diff.push(`Different ${label(entry)}\n  Development: ${JSON.stringify(entry.definition)}\n  Declarations: ${JSON.stringify(got.definition)}`);
    }
  }
  for (const [id, entry] of actual) {
    if (!expected.has(id)) diff.push(`Extra in declarations: ${label(entry)} ${JSON.stringify(entry.definition)}`);
  }
  return diff;
}
