/** Isolated, disposable development data for the catalog-to-builder browser check. */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { companies, companyUsers, customers, users, hashPassword, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { storage } from "../storage";
import { logger } from "./logger";

const file = resolve(import.meta.dirname, "../../../../generated-artifacts/services-catalog/browser-fixture.json");
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development-only fixture");
  if (process.argv[2] === "cleanup") {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const [company] = await db.select().from(companies).where(eq(companies.id, data.companyId));
    if (company?.slug !== (data.companySlug ?? `estimate-services-browser-${data.companyId}`)) throw new Error("Not the disposable services fixture");
    await db.delete(companies).where(eq(companies.id, data.companyId));
    await db.delete(users).where(eq(users.id, data.userId));
    unlinkSync(file);
    return;
  }
  if (existsSync(file)) throw new Error("Clean up the existing fixture before creating another");
  const userId = randomUUID(), customerId = randomUUID();
  const companySlug = `estimate-services-browser-${randomUUID()}`;
  const password = randomBytes(18).toString("hex"), email = `estimate-services-${userId}@example.invalid`;
  const passwordHash = await hashPassword(password);
  const { id: companyId } = await storage.createCompany({ name: "Services Catalog Verification", slug: companySlug, subscriptionPlan: "free", subscriptionStatus: "active" });
  try {
    await db.transaction(async tx => {
      await tx.insert(users).values({ id: userId, name: "Catalog Verification", email, passwordHash, defaultCompanyId: companyId });
      await tx.insert(companyUsers).values({ companyId, userId, role: "admin", status: "active" });
      await tx.insert(customers).values({ id: customerId, companyId, name: "Catalog Verification Property", street: "1 Verification Way", city: "Denver", state: "CO", zip: "80000", status: "active" });
    });
  } catch (err) {
    await db.delete(companies).where(eq(companies.id, companyId));
    throw err;
  }
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify({ companyId, companySlug, userId, customerId, email, password }), { mode: 0o600 });
  logger.info("Disposable estimate-services fixture ready; credentials remain in ignored output");
}
main().catch(() => { logger.error("Estimate-services browser fixture failed"); process.exitCode = 1; })
  .finally(async () => { await pool.end(); await schemaPool.end(); });
