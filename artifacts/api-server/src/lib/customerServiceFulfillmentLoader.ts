import { and, eq, gte, lte } from "drizzle-orm";
import { campaigns, campaignItems, routeStops, servicePrograms, termScopeLines, visits } from "@workspace/db";
import type { Reader } from "./contractCenterPersistence";
import { loadCustomerContractInputs } from "./customerContractSummary";
import type { ServiceFulfillmentInputs } from "./customerServiceFulfillment";

/** Fixed query count, independent of services/rounds/items. No generation or
 * reconciliation, and no per-row storage calls. Company scope on every read.
 * Commercial rates/payment tables are deliberately not loaded.
 */
export async function loadServiceFulfillmentInputs(reader: Reader, companyId: string): Promise<ServiceFulfillmentInputs> {
  const contract = await loadCustomerContractInputs(reader, companyId, false);
  const scope = await reader.select().from(termScopeLines).where(eq(termScopeLines.companyId, companyId));
  const programs = await reader.select().from(servicePrograms).where(eq(servicePrograms.companyId, companyId));
  const rounds = await reader.select().from(campaigns).where(eq(campaigns.companyId, companyId));
  const items = await reader.select().from(campaignItems).where(eq(campaignItems.companyId, companyId));
  const stops = await reader.select().from(routeStops).where(eq(routeStops.companyId, companyId));
  const start = contract.terms.map(t => t.startDate).sort()[0];
  const end = contract.terms.map(t => t.endDate).sort().at(-1);
  const activity = start && end ? await reader.select().from(visits).where(and(
    eq(visits.companyId, companyId), eq(visits.sourceType, "route"), gte(visits.visitDate, start), lte(visits.visitDate, end))) : [];
  return { ...contract, scope, programs, campaigns: rounds, items, stops, visits: activity };
}
