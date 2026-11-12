import { serviceCalendar, type Campaign, type CampaignItem } from "@workspace/db";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { campaignDemand } from "./campaignDemand";
import { loadCustomerContractInputs } from "./customerContractSummary";
import { companyToday } from "./companyDay";
import type { CampaignContractState } from "../../../../lib/db/src/campaignGenerationContracts";

export async function campaignRoundNonmembers(campaign: Campaign, today = companyToday()) {
  if (campaign.source !== "contract" || !campaign.roundYear) return [];
  const inputs = await loadCustomerContractInputs(db, campaign.companyId);
  const calendar = await db.select().from(serviceCalendar).where(eq(serviceCalendar.companyId, campaign.companyId));
  return campaignDemand({ ...inputs, calendar }, campaign.roundYear, today).rounds
    .find(r => r.calendarEntryId === campaign.calendarEntryId)?.nonmembers ?? [];
}

/** One batch demand projection for the round's year, never a stored membership
 * flag. Uses exactly the same coverage/count/timing rules as the writer. */
export async function withCampaignContractStates<T extends Pick<CampaignItem, "customerId">>(
  campaign: Campaign, items: T[], today = companyToday(),
): Promise<(T & { contractState?: CampaignContractState })[]> {
  if (campaign.source !== "contract" || !campaign.roundYear || !items.length) return items;
  const inputs = await loadCustomerContractInputs(db, campaign.companyId);
  const calendar = await db.select().from(serviceCalendar).where(eq(serviceCalendar.companyId, campaign.companyId));
  const demand = campaignDemand({ ...inputs, calendar }, campaign.roundYear, today);
  const round = demand.rounds.find(r => r.serviceKey === campaign.serviceKey &&
    r.calendarEntryId === campaign.calendarEntryId && r.roundYear === campaign.roundYear);
  const members = new Map(round?.members.map(m => [m.propertyId, m]) ?? []);
  return items.map(item => {
    const member = members.get(item.customerId);
    return { ...item, contractState: member
      ? { state: member.termStatus === "sent" ? "waiting_on_signature" : "owed",
        agreementId: member.agreementId, termId: member.termId, renewalPending: member.renewalPending }
      : { state: "no_longer_in_contract", agreementId: null, termId: null } };
  });
}
