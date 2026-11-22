import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { REQUIRED_EXTENSIONS } from "@workspace/db/required-extensions";
import { diffLogicalCatalog, readLogicalCatalog } from "./logical-database-catalog";
import { preserveRepeatedUniqueConstraints } from "./replay-declaration-sql";

const devHost = /^ep-square-brook-[a-z0-9-]+\.(?:c-\d+\.)?us-east-2\.aws\.neon\.tech$/;
const cwd = fileURLToPath(new URL("../../", import.meta.url));
const localEnv = { HOME: process.env.HOME, PATH: process.env.PATH, LANG: "C.UTF-8" };

async function developmentReference() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for the read-only Development reference");
  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !devHost.test(url.hostname)
    || url.hostname.includes("-pooler.") || !url.username || !url.pathname.slice(1)) {
    throw new Error("Reference must be the verified direct Development endpoint in us-east-2");
  }
  // Explicit options rather than a connection string: no URL settings can
  // override TLS verification, read-only mode, or the destination.
  const database = decodeURIComponent(url.pathname.slice(1));
  const client = new pg.Client({
    host: url.hostname, port: Number(url.port || 5432), database,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15_000,
    options: "-c default_transaction_read_only=on -c search_path=pg_catalog,public",
  });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: [identity] } = await client.query(`SELECT current_database() AS db,
      current_setting('neon.endpoint_id', true) AS endpoint,
      current_setting('transaction_read_only') AS read_only,
      current_setting('server_version_num')::int/10000 AS major,
      inet_server_port() AS port`);
    if (!identity || identity.db !== database || identity.endpoint !== url.hostname.split(".")[0]
      || identity.read_only !== "on" || !identity.port) {
      throw new Error("Development identity/read-only check failed");
    }
    return { major: identity.major as number, catalog: await readLogicalCatalog(client) };
  } finally {
    await client.end();
  }
}

async function disposableCandidate(expectedMajor: number) {
  const scratch = mkdtempSync(join(tmpdir(), "hpcrm-catalog-"));
  const data = join(scratch, "cluster");
  const role = "catalog_rehearsal";
  const port = 57482; // Private Unix socket directory; PostgreSQL never binds TCP.
  const database = "postgres";
  const run = (bin: string, args: string[]) => execFileSync(bin, args, {
    cwd, env: localEnv, encoding: "utf8", timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
  });
  let started = false;
  try {
    run("initdb", ["--auth=trust", "--username", role, "-D", data]);
    run("pg_ctl", ["-D", data, "-l", join(scratch, "postgres.log"),
      "-o", `-c listen_addresses='' -c unix_socket_directories='${scratch}' -p ${port}`, "-w", "start"]);
    started = true;
    const client = new pg.Client({ host: scratch, port, user: role, database, password: "", ssl: false });
    try {
      await client.connect();
      const { rows: [id] } = await client.query(`SELECT current_database() AS db, current_user AS role,
        inet_server_addr() IS NULL AS unix, current_setting('unix_socket_directories') AS socket,
        current_setting('port')::int AS port, current_setting('server_version_num')::int/10000 AS major,
        current_setting('neon.endpoint_id', true) AS managed`);
      if (!id || id.db !== database || id.role !== role || id.unix !== true || id.socket !== scratch
        || id.port !== port || id.managed || id.major !== expectedMajor) {
        throw new Error("Disposable PostgreSQL identity/version check failed; no schema was applied");
      }
      // Offline Drizzle export is applied only inside the verified socket-only cluster.
      // No pg push or inherited DATABASE_URL can reach a managed host.
      const sql = run("pnpm", ["--filter", "@workspace/db", "exec", "drizzle-kit", "export",
        "--sql", "--dialect", "postgresql", "--schema", "./src/schema/index.ts"]);
      if (!sql.trim().startsWith("CREATE ")) throw new Error("Drizzle did not produce schema SQL");
      const ddl = join(scratch, "schema.sql");
      writeFileSync(ddl, [
        ...REQUIRED_EXTENSIONS.map(ext => `CREATE EXTENSION IF NOT EXISTS "${ext}";`),
        preserveRepeatedUniqueConstraints(sql),
      ].join("\n"));
      run("psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-h", scratch, "-p", String(port),
        "-U", role, "-d", database, "--single-transaction", "--file", ddl]);
      await client.query("BEGIN READ ONLY; SET LOCAL search_path = pg_catalog, public");
      return await readLogicalCatalog(client);
    } finally {
      await client.end();
    }
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    rmSync(scratch, { force: true, recursive: true });
  }
}

async function main() {
  const reference = await developmentReference();
  const candidate = await disposableCandidate(reference.major);
  const differences = diffLogicalCatalog(reference.catalog, candidate);
  if (differences.length) {
    console.error(`${differences.length} logical catalog differences (Development vs. disposable declarations):`);
    for (const line of differences) console.error(line);
    process.exitCode = 1;
  } else {
    console.log("Disposable declarations match the verified Development logical catalog.");
  }
}

main().catch((error: unknown) => {
  // pg connection errors can include infrastructure details. Do not dump
  // the driver object or environment.
  const message = error instanceof Error ? error.message : "Declaration parity check failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[connection redacted]"));
  process.exitCode = 1;
});
