import { eq } from "drizzle-orm";
import { customers, agreements, agreementTerms } from "@workspace/db";
import { projectActiveCustomers } from "@workspace/db/active-customers";
import { isCalendarDate } from "@workspace/db/estimate-contracts";
import type { Reader } from "./contractCenterPersistence";
import { addCalendarDays, companyToday } from "./companyDay";
import { ContractCenterError } from "./contractCenterService";

export function activeCustomersAsOf(value: unknown, today = companyToday()): string {
  if (value === undefined) return today;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isCalendarDate(value) ||
    value < addCalendarDays(today, -400) || value > addCalendarDays(today, 400)) {
    throw new ContractCenterError(400, "As of must be a valid YYYY-MM-DD within 400 days of today");
  }
  return value;
}

/** Exactly three company-scoped reads. No actor, billing or per-customer reads. */
export async function loadActiveCustomers(reader: Reader, companyId: string, asOf: string) {
  const companyCustomers = await reader.select().from(customers).where(eq(customers.companyId, companyId));
  const companyAgreements = await reader.select().from(agreements).where(eq(agreements.companyId, companyId));
  const seasons = await reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId));
  return projectActiveCustomers({ customers: companyCustomers, agreements: companyAgreements, seasons, asOf });
}
