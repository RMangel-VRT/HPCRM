import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from "@workspace/db";
import { AsyncLocalStorage } from "node:async_hooks";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => {
  console.error('Database pool connection error:', err);
});
const baseDb = drizzle({ client: pool, schema });
export type AppTransaction = Parameters<Parameters<typeof baseDb.transaction>[0]>[0];
const transactionScope = new AsyncLocalStorage<AppTransaction>();
/** Existing storage/workflow calls participate in the caller's transaction. */
export const db: typeof baseDb = new Proxy(baseDb, {
  get(target, property) {
    const connection = transactionScope.getStore() ?? target;
    const value = Reflect.get(connection, property);
    return typeof value === "function" ? value.bind(connection) : value;
  },
});
export function inTransaction<T>(tx: AppTransaction, work: () => Promise<T>): Promise<T> {
  return transactionScope.run(tx, work);
}
