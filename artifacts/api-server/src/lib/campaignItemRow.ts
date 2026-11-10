import type { Campaign, Customer } from "@workspace/db";

/** One construction path for manual and engine-owned items; no copied demand. */
export function campaignItemRow(
  campaign: Pick<Campaign, "id" | "companyId" | "category" | "subtype" | "source">,
  customer: Pick<Customer, "id" | "companyId" | "name" | "city" | "isParent">,
) {
  if (customer.companyId !== campaign.companyId || customer.isParent === "true")
    throw new Error("Campaign items require a same-company non-parent property");
  const servicePlanCategory = campaign.source === "contract" ? null :
    campaign.category === "chemical" ? "chemical" : campaign.category !== "irrigation" ? null :
      campaign.subtype === "spring_turn_on" ? "irrigation_open" :
        campaign.subtype === "winterization" ? "irrigation_winterization" : "irrigation_close";
  return {
    campaignId: campaign.id, companyId: campaign.companyId, customerId: customer.id,
    customerName: customer.name, customerCity: customer.city || "",
    status: "pending" as const, notes: null, skipReason: null, photos: [],
    wasBumpedToBackup: false, completedById: null, completedAt: null,
    workflowStep: campaign.category === "chemical" ? "pre_communication" as const : null,
    preCommSentAt: null, preCommSentById: null, workCompletedAt: null,
    workCompletedById: null, postCommSentAt: null, postCommSentById: null,
    servicePlanCategory,
  };
}
