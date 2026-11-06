/** Disposable customer-pages verification data; never repairs customer contracts. */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { companies, companyUsers, customers, users, agreements, agreementTerms, termBillingMonths, termRates, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { reconcileContractQuestions } from "./contractQuestionFlags";
const file = resolve(import.meta.dirname, "../../../../generated-artifacts/cp1/browser-fixture.json");
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development-only fixture");
  if (process.argv[2] === "cleanup") {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const [company] = await db.select().from(companies).where(eq(companies.id, data.companyId));
    if (company?.slug !== `cp1-browser-${data.companyId}`) throw new Error("Not a disposable customer-pages fixture");
    await db.delete(companies).where(eq(companies.id, data.companyId));
    await db.delete(users).where(eq(users.id, data.actor));
    unlinkSync(file); return;
  }
  const companyId = randomUUID(), actor = randomUUID(), ute = randomUUID(), parent = randomUUID(), branch = randomUUID(), uncovered = randomUUID();
  const agreementId = randomUUID(), termId = randomUUID();
  const password = randomBytes(18).toString("hex"), salt = randomBytes(16).toString("hex"), email = `cp1-${actor}@example.invalid`;
  await db.transaction(async tx => {
    await tx.insert(companies).values({ id: companyId, name: "CP1 Disposable Verification", slug: `cp1-browser-${companyId}` });
    await tx.insert(users).values({ id: actor, name: "CP1 Synthetic Manager", email, defaultCompanyId: companyId,
      passwordHash: `${scryptSync(password, salt, 64).toString("hex")}.${salt}` });
    await tx.insert(companyUsers).values({ userId: actor, companyId, role: "account_manager", status: "active" });
    await tx.insert(customers).values([
      { id: ute, companyId, name: "Ute Creek CP1 Fixture", street: "1 Fixture Way", city: "Denver", state: "CO", zip: "80000",
        status: "active", active: "true", accountManagerId: actor },
      { id: parent, companyId, name: "CP1 Parent Fixture", isParent: "true", status: "active", active: "true", accountManagerId: actor,
        street: "", city: "", state: "", zip: "" },
      { id: uncovered, companyId, name: "CP1 No Contract Fixture", street: "3 Fixture Way", city: "Denver", state: "CO", zip: "80000",
        status: "active", active: "true", snowEnabled: true, accountManagerId: actor },
    ]);
    await tx.insert(customers).values({ id: branch, companyId, name: "CP1 Branch Fixture", parentCustomerId: parent,
      status: "active", active: "true", street: "2 Fixture Way", city: "Denver", state: "CO", zip: "80000" });
    await tx.insert(agreements).values({ id: agreementId, companyId, customerId: ute });
    await tx.insert(agreementTerms).values({ id: termId, companyId, agreementId, line: "both", form: "theirs", seasonLabel: "2026–27",
      status: "active", startDate: "2026-10-01", endDate: "2027-09-30", legalName: "Ute Creek Fixture", billingType: "equal_monthly", snowPricing: "flat_rate", snowTriggers: "" });
    await tx.insert(termBillingMonths).values(Array.from({ length: 12 }, (_, i) => ({ companyId, termId, component: "Contract",
      month: `${i < 3 ? 2026 : 2027}-${String((i + 9) % 12 + 1).padStart(2, "0")}-01`, amountCents: 112800 })));
    await tx.insert(termRates).values({ companyId, termId, rateKey: "rate_general_labor", label: "General labor", line: "landscape",
      category: "labor", unit: "per hour", minimum: null, priceCents: 6500, priceText: null, sortOrder: 0 });
  });
  await reconcileContractQuestions(companyId);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify({ companyId, actor, email, password, ute, parent, branch, uncovered, agreementId, termId }, null, 2), { mode: 0o600 });
  console.log("Disposable customer-pages fixture ready; credentials are in the ignored browser-fixture.json.");
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(async () => { await pool.end(); await schemaPool.end(); });
