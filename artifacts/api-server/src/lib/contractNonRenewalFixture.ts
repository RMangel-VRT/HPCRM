import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { companies, companyUsers, users, customers, agreements, agreementTerms } from "@workspace/db";
import { db } from "../db";
import { lockContractCompany, writeTerm } from "./contractCenterPersistence";
import { addCalendarDays, companyToday } from "./companyDay";

/** No legacy rows, real customers, external files or notifications. Development only. */
export async function createNonRenewalFixture() {
  if (process.env.NODE_ENV === "production") throw new Error("Development fixtures cannot run in production");
  const companyId = randomUUID(), userId = randomUUID(), customerId = randomUUID();
  const email = `nonrenewal-${randomUUID()}@example.invalid`;
  const password = randomBytes(18).toString("hex"), salt = randomBytes(16).toString("hex");
  await db.insert(companies).values({ id: companyId, name: "Disposable Non-Renewal", slug: `nonrenewal-${companyId}` });
  try {
    await db.insert(users).values({ id: userId, email, name: "Non-Renewal Verification", defaultCompanyId: companyId,
      passwordHash: `${scryptSync(password, salt, 64).toString("hex")}.${salt}` });
    await db.insert(companyUsers).values({ companyId, userId, role: "admin" });
    await db.insert(customers).values({ id: customerId, companyId, name: "Disposable Non-Renewal Customer",
      street: "1 Fixture Way", city: "Denver", state: "CO", zip: "80000" });
    const line = await addNonRenewalLine(companyId, userId, customerId);
    return { companyId, userId, customerId, email, password, ...line };
  } catch (error) { await removeNonRenewalFixture(companyId, userId); throw error; }
}
export async function addNonRenewalLine(companyId: string, userId: string, customerId: string,
  endDate = addCalendarDays(companyToday(), 30), status: "signed" | "draft" | "sent" | "active" | "renewed" = "signed") {
  return db.transaction(async tx => {
    await lockContractCompany(tx, companyId);
    const [agreement] = await tx.insert(agreements).values({ companyId, customerId }).returning();
    const term = await writeTerm(tx, companyId, userId, null, { agreementId: agreement.id, line: "landscape", form: "ours",
      seasonLabel: "Fixture season", startDate: addCalendarDays(endDate, -364), endDate, status, signedAt: new Date(),
      billingType: "equal_monthly", annualPriceCents: 1200000 }, "Disposable verification fixture");
    return { agreement, term };
  });
}
export async function resetNonRenewalFixture(companyId: string, customerId: string) {
  await db.update(customers).set({ status: "active" }).where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
  await db.delete(agreements).where(eq(agreements.companyId, companyId));
}
export async function removeNonRenewalFixture(companyId: string, userId: string) {
  await db.delete(companies).where(eq(companies.id, companyId));
  await db.delete(users).where(eq(users.id, userId));
}
