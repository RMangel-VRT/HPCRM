import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  OPERATOR_CLASS_TO_EXTENSION,
  REQUIRED_EXTENSIONS,
  type RequiredExtension,
} from "@workspace/db";

const SCHEMA_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../lib/db/src/schema",
);

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

function findReferencedExtensions(): {
  byExtension: Map<RequiredExtension, string[]>;
  unknownOpClasses: { opclass: string; file: string }[];
} {
  const byExtension = new Map<RequiredExtension, string[]>();
  const unknownOpClasses: { opclass: string; file: string }[] = [];
  const knownOpClassPattern = /\b(g(?:in|ist)_\w+_ops)\b/g;

  for (const file of walk(SCHEMA_DIR)) {
    const src = readFileSync(file, "utf8");
    const rel = path.relative(process.cwd(), file);

    for (const [opclass, extension] of Object.entries(
      OPERATOR_CLASS_TO_EXTENSION,
    )) {
      if (src.includes(opclass)) {
        const arr = byExtension.get(extension) ?? [];
        arr.push(`${rel} (uses ${opclass})`);
        byExtension.set(extension, arr);
      }
    }

    let m: RegExpExecArray | null;
    while ((m = knownOpClassPattern.exec(src)) !== null) {
      const opclass = m[1]!;
      if (!(opclass in OPERATOR_CLASS_TO_EXTENSION)) {
        unknownOpClasses.push({ opclass, file: rel });
      }
    }
  }
  return { byExtension, unknownOpClasses };
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  const { byExtension, unknownOpClasses } = findReferencedExtensions();

  // Gate 1: schema must not reference an opclass whose extension isn't on
  // the cross-DB allowlist (REQUIRED_EXTENSIONS in lib/db/src/required-extensions.ts).
  // The allowlist is the user's commitment that the extension is installed
  // on every target DB (prod + dev + previews); adding to it requires the
  // prod-first install order documented in replit.md.
  if (unknownOpClasses.length > 0) {
    console.error(
      "\n❌ Schema references Postgres operator classes that are not on the cross-DB extension allowlist:",
    );
    for (const { opclass, file } of unknownOpClasses) {
      console.error(`  - ${opclass} in ${file}`);
    }
    console.error(
      '\nMap each opclass to its extension in lib/db/src/required-extensions.ts AFTER installing the extension on every target DB (see replit.md "Production schema & extensions").\n',
    );
    process.exitCode = 1;
    return;
  }

  // Gate 2: every extension on the allowlist must actually be installed in
  // the target DATABASE_URL. Run this against dev DATABASE_URL during merge
  // and against prod DATABASE_URL via the database skill before Publish.
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { rows } = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension",
    );
    const installed = new Set(rows.map((r) => r.extname));

    const missing: string[] = [];
    for (const extension of REQUIRED_EXTENSIONS) {
      if (!installed.has(extension)) {
        const refs = byExtension.get(extension) ?? [];
        const usage =
          refs.length > 0
            ? ` (used by: ${refs.join(", ")})`
            : " (on REQUIRED_EXTENSIONS allowlist)";
        missing.push(`  - ${extension}${usage}`);
      }
    }

    if (missing.length > 0) {
      console.error(
        "\n❌ Postgres extensions on the cross-DB allowlist are NOT installed in the target DATABASE_URL:",
      );
      console.error(missing.join("\n"));
      console.error(
        '\nFix order (see replit.md "Production schema & extensions"):',
      );
      console.error(
        "  1. Install the extension in PRODUCTION via Replit's Production DB UI",
      );
      console.error(
        "     (CREATE EXTENSION IF NOT EXISTS <name>; — extensions persist forever).",
      );
      console.error(
        "  2. Install it in DEVELOPMENT (against DATABASE_URL) and add a dev-only safety-net",
      );
      console.error(
        "     migration under .migration-backup/migrations/ (see 0014_ensure_pg_trgm.sql).",
      );
      console.error(
        "  3. Re-run this check; once it passes against both dev and prod DATABASE_URLs the merge can proceed.\n",
      );
      process.exitCode = 1;
      return;
    }

    const summary = REQUIRED_EXTENSIONS.join(", ") || "(none required)";
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
