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
