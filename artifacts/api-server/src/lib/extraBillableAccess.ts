import type { IStorage } from "../storage";

export interface ExtraBillableAccessUser {
  id: string;
  activeRole: string;
  activeCompanyId: string;
}

export interface ExtraBillableAccessItem {
  assignedCampaignCrewId?: string | null;
}

export async function canAccessExtraBillableCampaignItem(
  storage: Pick<IStorage, "getCampaignCrewById" | "getCampaignCrewMembers">,
  user: ExtraBillableAccessUser,
  item: ExtraBillableAccessItem,
  mode: "read" | "write",
): Promise<boolean> {
  if (user.activeRole === "admin" || user.activeRole === "office") return true;
  if (!item.assignedCampaignCrewId) return false;
  const crew = await storage.getCampaignCrewById(item.assignedCampaignCrewId, user.activeCompanyId);
  if (!crew) return false;
  if (mode === "write") return crew.leaderUserId === user.id;
  if (crew.leaderUserId === user.id) return true;
  const members = await storage.getCampaignCrewMembers(crew.id);
  return members.some((m) => m.userId === user.id);
}

/**
 * Build the set of campaign-crew IDs the given user belongs to (as leader or member),
 * from a `getCampaignCrews` result. Useful for the campaign-by-id and campaigns-list
 * endpoints to strip items that don't belong to a crew the user is on.
 */
export function userCrewIdSetFromCrews(
  user: { id: string },
  crews: { id: string; leaderUserId: string; members: { userId: string }[] }[],
): Set<string> {
  return new Set(
    crews
      .filter((c) => c.leaderUserId === user.id || c.members.some((m) => m.userId === user.id))
      .map((c) => c.id),
  );
}

/**
 * For `extra_billable` campaigns viewed by a field-role user, strip items whose
 * assigned crew the user is not a member of. Non-field roles, and other categories,
 * are passed through unchanged.
 */
export function filterExtraBillableCampaignItems<T extends { assignedCampaignCrewId?: string | null }>(
  items: T[],
  user: ExtraBillableAccessUser,
  campaign: { category: string },
  userCrewIds: Set<string>,
): T[] {
  if (campaign.category !== "extra_billable") return items;
  if (user.activeRole !== "field" && user.activeRole !== "landscape_supervisor") return items;
  return items.filter((i) => i.assignedCampaignCrewId && userCrewIds.has(i.assignedCampaignCrewId));
}

/**
 * Pure validation for the bulk-assign-crew endpoint. Returns either an error
 * with HTTP status + message + machine code, or `ok` with the validated update set.
 * Does NOT perform any DB writes — caller runs the transaction.
 */
export interface BulkAssignValidationInput {
  user: ExtraBillableAccessUser;
  campaignId: string;
  body: unknown;
  campaign: { id: string; category: string } | null | undefined;
  targetCrew?: { id: string; campaignId: string; leaderUserId: string | null } | null;
  itemRows: { id: string; campaignId: string }[];
}
export type BulkAssignValidationResult =
  | { ok: true; itemIds: string[]; assignedCampaignCrewId: string | null }
  | { ok: false; status: 400 | 403 | 404; code: string; error: string };

export function validateBulkAssignCrew(input: BulkAssignValidationInput): BulkAssignValidationResult {
  const { user, campaignId, body, campaign, targetCrew, itemRows } = input;

  if (user.activeRole !== "admin" && user.activeRole !== "office") {
    return { ok: false, status: 403, code: "forbidden_role", error: "Only admin/office can reassign properties" };
  }

  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, code: "invalid_body", error: "Invalid request body" };
  }
  const b = body as { itemIds?: unknown; assignedCampaignCrewId?: unknown };
  if (
    !Array.isArray(b.itemIds) ||
    b.itemIds.length === 0 ||
    b.itemIds.length > 500 ||
    b.itemIds.some((x) => typeof x !== "string" || x.length === 0)
  ) {
    return { ok: false, status: 400, code: "invalid_item_ids", error: "itemIds must be a non-empty array of strings (max 500)" };
  }
  if (b.assignedCampaignCrewId !== null && (typeof b.assignedCampaignCrewId !== "string" || b.assignedCampaignCrewId.length === 0)) {
    return { ok: false, status: 400, code: "invalid_crew_id", error: "assignedCampaignCrewId must be a non-empty string or null" };
  }
  const itemIds = Array.from(new Set(b.itemIds as string[]));
  const assignedCampaignCrewId = b.assignedCampaignCrewId as string | null;

  if (!campaign) return { ok: false, status: 404, code: "campaign_not_found", error: "Campaign not found" };
  if (campaign.category !== "extra_billable") {
    return { ok: false, status: 400, code: "wrong_category", error: "Crew assignment only supported on extra-billable campaigns" };
  }

  if (assignedCampaignCrewId) {
    if (!targetCrew || targetCrew.campaignId !== campaignId) {
      return { ok: false, status: 400, code: "invalid_crew", error: "Invalid crew" };
    }
    if (!targetCrew.leaderUserId) {
      return { ok: false, status: 400, code: "leaderless_crew", error: "Cannot assign properties to a leaderless crew; assign a leader first" };
    }
  }

  if (itemRows.length !== itemIds.length) {
    return { ok: false, status: 400, code: "items_not_found", error: "One or more items not found in this company" };
  }
  if (itemRows.some((r) => r.campaignId !== campaignId)) {
    return { ok: false, status: 400, code: "items_wrong_campaign", error: "One or more items do not belong to this campaign" };
  }

  return { ok: true, itemIds, assignedCampaignCrewId };
}
