import { eq } from "drizzle-orm";
import { customers, contacts, contracts, contractMonthlyAmounts, contractServices, customerRateSheets,
  contractDocuments, agreements, agreementTerms, termDocuments, termStatusHistory, termLegacySources, rateCardItems } from "@workspace/db";
import { db } from "../db";
import type { Reader } from "./contractCenterPersistence";

export async function loadAuditData(companyId: string, reader: Reader = db) {
  const [customerRows, contactRows, oldContracts, amounts, services, sheets, documents, agreementRows, terms, termDocs, history, links, card] = await Promise.all([
    reader.select().from(customers).where(eq(customers.companyId, companyId)),
    reader.select().from(contacts).where(eq(contacts.companyId, companyId)),
    reader.select().from(contracts).where(eq(contracts.companyId, companyId)),
    reader.select().from(contractMonthlyAmounts).where(eq(contractMonthlyAmounts.companyId, companyId)),
    reader.select().from(contractServices).where(eq(contractServices.companyId, companyId)),
    reader.select().from(customerRateSheets).where(eq(customerRateSheets.companyId, companyId)),
    reader.select().from(contractDocuments).where(eq(contractDocuments.companyId, companyId)),
    reader.select().from(agreements).where(eq(agreements.companyId, companyId)),
    reader.select().from(agreementTerms).where(eq(agreementTerms.companyId, companyId)),
    reader.select().from(termDocuments).where(eq(termDocuments.companyId, companyId)),
    reader.select().from(termStatusHistory).where(eq(termStatusHistory.companyId, companyId)),
    reader.select().from(termLegacySources).where(eq(termLegacySources.companyId, companyId)),
    reader.select().from(rateCardItems).where(eq(rateCardItems.companyId, companyId)),
  ]);
  return { customers: customerRows, contacts: contactRows, contracts: oldContracts, amounts, services, sheets,
    documents, agreements: agreementRows, terms, termDocs, history, links, card };
}
export type AuditData = Awaited<ReturnType<typeof loadAuditData>>;
