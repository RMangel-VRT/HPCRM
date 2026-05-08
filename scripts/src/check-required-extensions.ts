import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const SCHEMA_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../lib/db/src/schema",
);

const OPERATOR_CLASS_TO_EXTENSION: Record<string, string> = {
  gin_trgm_ops: "pg_trgm",
  gist_trgm_ops: "pg_trgm",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function findReferencedExtensions(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(SCHEMA_DIR)) {
    const src = readFileSync(file, "utf8");
    for (const [opclass, extension] of Object.entries(OPERATOR_CLASS_TO_EXTENSION)) {
      if (src.includes(opclass)) {
        const arr = found.get(extension) ?? [];
        arr.push(`${path.relative(process.cwd(), file)} (uses ${opclass})`);
        found.set(extension, arr);
      }
    }
  }
  return found;
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  const required = findReferencedExtensions();
  if (required.size === 0) {
    console.log("No extension-dependent schema declarations found.");
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { rows } = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension",
    );
    const installed = new Set(rows.map((r) => r.extname));

    const missing: string[] = [];
    for (const [extension, refs] of required) {
      if (!installed.has(extension)) {
        missing.push(
          `  - ${extension} (required by: ${refs.join(", ")})`,
        );
      }
    }

    if (missing.length > 0) {
      console.error(
        "\n❌ Schema declares objects depending on Postgres extensions that are NOT installed in the target DB:",
      );
      console.error(missing.join("\n"));
      console.error(
        "\nFix order (see replit.md \"Production schema & extensions\"):",
      );
      console.error(
        "  1. Install the extension in PRODUCTION via Replit's Production DB UI.",
      );
      console.error(
        "  2. Install it in DEVELOPMENT (CREATE EXTENSION IF NOT EXISTS <name>; against DATABASE_URL)",
      );
      console.error(
        "     and add a dev-only migration under .migration-backup/migrations/.",
      );
      console.error(
        "  3. Re-run this check; once it passes the merge can proceed.\n",
      );
      process.exitCode = 1;
      return;
    }

    const summary = [...required.keys()].join(", ");
    console.log(
      `Required Postgres extensions present in DATABASE_URL: ${summary}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("check-required-extensions failed:", err);
  process.exit(1);
});
