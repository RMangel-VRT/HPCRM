import { eq } from "drizzle-orm";
import { servicePrograms, type Campaign, type CampaignItem } from "@workspace/db";
import { db } from "../db";
import { campaignDemand } from "./campaignDemand";
import { loadCustomerContractInputs } from "./customerContractSummary";
import { companyToday } from "./companyDay";
import type { CampaignContractState } from "../../../../lib/db/src/campaignGenerationContracts";

/** One batch demand projection for the round's year, never a stored membership
 * flag. Uses exactly the same coverage/count/timing rules as the writer. */
export async function withCampaignContractStates<T extends Pick<CampaignItem, "customerId">>(
  campaign: Campaign, items: T[], today = companyToday(),
): Promise<(T & { contractState?: CampaignContractState })[]> {
  if (campaign.source !== "contract" || !campaign.roundMonth || !items.length) return items;
  const inputs = await loadCustomerContractInputs(db, campaign.companyId);
  const programs = await db.select().from(servicePrograms).where(eq(servicePrograms.companyId, campaign.companyId));
  const demand = campaignDemand({ ...inputs, programs }, Number(campaign.roundMonth.slice(0, 4)), today);
  const round = demand.rounds.find(r => r.serviceKey === campaign.serviceKey &&
    r.roundMonth === campaign.roundMonth && r.roundSeq === campaign.roundSeq);
  const members = new Map(round?.members.map(m => [m.propertyId, m]) ?? []);
  return items.map(item => {
    const member = members.get(item.customerId);
    return { ...item, contractState: member
      ? { state: member.termStatus === "sent" ? "waiting_on_signature" : "owed",
        agreementId: member.agreementId, termId: member.termId }
      : { state: "no_longer_in_contract", agreementId: null, termId: null } };
  });
}
