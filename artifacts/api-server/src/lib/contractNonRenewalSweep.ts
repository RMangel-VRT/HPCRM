import { and, eq, isNotNull, lt } from "drizzle-orm";
import { agreements, agreementTerms, customers } from "@workspace/db";
import { db } from "../db";
import { storage } from "../storage";
import { companyToday } from "./companyDay";
import { lockContractCompany, writeTerm } from "./contractCenterPersistence";
import { hasOpenBusiness } from "../shared/contractCatalog";
import { logger } from "./logger";

/** One atomic transition, audit entry and consumed flag. The company contract gate
 * coordinates new/sign/date/undo/import writes without taking any RFP lock. */
export async function runContractNonRenewalSweep(today = companyToday()) {
  const candidates = await db.select({ companyId: agreementTerms.companyId, id: agreementTerms.id })
    .from(agreementTerms).where(and(eq(agreementTerms.deactivateCustomerOnEnd, true),
      isNotNull(agreementTerms.nonRenewalOn), lt(agreementTerms.endDate, today)));
  let changed = 0;
  for (const candidate of candidates) {
    try {
      const transitioned = await db.transaction(async tx => {
        await lockContractCompany(tx, candidate.companyId);
        const [term] = await tx.select().from(agreementTerms).where(and(eq(agreementTerms.id, candidate.id),
          eq(agreementTerms.companyId, candidate.companyId))).for("update");
        if (!term?.deactivateCustomerOnEnd || !term.nonRenewalOn || term.endDate >= today) return false;
        const [agreement] = await tx.select().from(agreements).where(and(eq(agreements.id, term.agreementId),
          eq(agreements.companyId, candidate.companyId)));
        if (!agreement) return false;
        const [customer] = await tx.select().from(customers).where(and(eq(customers.id, agreement.customerId),
          eq(customers.companyId, candidate.companyId))).for("update");
        if (!customer || customer.status === "inactive") return false;
        const lines = await tx.select().from(agreements).where(and(eq(agreements.customerId, customer.id),
          eq(agreements.companyId, candidate.companyId)));
        const lineIds = new Set(lines.map(a => a.id));
        const terms = await tx.select().from(agreementTerms).where(eq(agreementTerms.companyId, candidate.companyId));
        if (terms.some(t => lineIds.has(t.agreementId) && hasOpenBusiness(t, today))) return false;
        const updated = await storage.updateCustomer(customer.id, candidate.companyId, { status: "inactive" }, undefined, tx);
        if (!updated || "conflict" in updated) throw new Error("Customer could not be set inactive");
        // Deleted decision-makers remain nullable; do not invent a different actor.
        await writeTerm(tx, candidate.companyId, term.nonRenewalBy, term,
          { deactivateCustomerOnEnd: false }, "Customer set inactive — contract ended, not renewing", "outcome");
        return true;
      });
      if (transitioned) changed++;
    } catch (err) {
      logger.error({ err, companyId: candidate.companyId, termId: candidate.id }, "Non-renewal customer sweep failed; flag retained");
    }
  }
  return { changed };
}
export function startContractNonRenewalSweep() {
  const run = () => { void runContractNonRenewalSweep().catch(err => logger.error({ err }, "Non-renewal sweep failed")); };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
