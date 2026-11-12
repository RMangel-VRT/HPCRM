import { randomUUID } from "node:crypto";
import pg from "pg";

/** Never point a broad boot initializer or historical seed at the shared DB. */
export async function disposableDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Disposable database tests refuse production mode");
  const name = `category_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
    return {
      pool,
      async dispose() {
        await pool.end();
        try { await admin.query(`DROP DATABASE "${name}"`); }
        finally { await admin.end(); }
      },
    };
  } catch (error) {
    try { if (created) await admin.query(`DROP DATABASE "${name}"`); }
    finally { await admin.end(); }
    throw error;
  }
}
