import type { Response } from "express";
import { eq } from "drizzle-orm";
import { contracts, contractServices, contractMonthlyAmounts, contractDocuments, customerRateSheets, customers } from "@workspace/db";
import { db } from "../db";

/** Keep every freeze site searchable for Phase 7. */
export function rejectLegacyContractWrite(res: Response): boolean {
  res.status(409).json({ message: "Contracts are managed in the Contract Center now." });
  return true;
}

/** Call only after authorization and an ownership lookup.
 * Follow the actual FK ancestry, not assumed consistency of legacy company IDs.
 */
export async function hasFrozenLegacyRows(companyId: string, customerId?: string): Promise<boolean> {
  if (customerId) {
    const [contractRows, rateRows] = await Promise.all([
      db.select({ id: contracts.id }).from(contracts)
        .where(eq(contracts.customerId, customerId)).limit(1),
      db.select({ id: customerRateSheets.id }).from(customerRateSheets)
        .where(eq(customerRateSheets.customerId, customerId)).limit(1),
    ]);
    return contractRows.length > 0 || rateRows.length > 0;
  }
  const rows = await Promise.all([
    ...[contracts, contractServices, contractMonthlyAmounts, contractDocuments, customerRateSheets]
      .map(table => db.select({ id: table.id }).from(table).where(eq(table.companyId, companyId)).limit(1)),
    db.select({ id: contracts.id }).from(contracts)
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .where(eq(customers.companyId, companyId)).limit(1),
    db.select({ id: customerRateSheets.id }).from(customerRateSheets)
      .innerJoin(customers, eq(customerRateSheets.customerId, customers.id))
      .where(eq(customers.companyId, companyId)).limit(1),
  ]);
  return rows.some(result => result.length > 0);
}
