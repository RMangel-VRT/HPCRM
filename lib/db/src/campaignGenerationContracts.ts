/** Read-only demand projections; commercial counts/months remain Contract Center owned. */
/** Transitional engine input only, not persisted configuration. SC1 callers pass
 * an empty list until SC2 replaces the monthly allocator. */
export interface DemandTimingProgram {
  serviceKey: string; rounds: number; monthSpread: number[]; isStandard: boolean;
}
export interface CampaignMembershipStatus {
  enabledAt: string | null; checkedAt: string | null; succeededAt: string | null;
  error: string | null; changes: number; keptNotOwed: number; missed: number;
}
export interface CampaignContractState {
  state: "owed" | "waiting_on_signature" | "no_longer_in_contract";
  agreementId: string | null; termId: string | null;
}
export type DemandGapKind = "no_count" | "no_timing" | "invalid_count" | "duplicate_lines" | "count_mismatch";
export interface DemandMember {
  propertyId: string; propertyName: string; termId: string; agreementId: string;
  seasonLabel: string; termStatus: string;
  timing: "contract" | "program"; count: "contract" | "standard";
}
export interface DemandGap {
  propertyId: string; propertyName: string; termId: string; agreementId: string;
  seasonLabel: string; serviceKey: string; kind: DemandGapKind;
  count?: number; monthTotal?: number;
}
export interface DemandRound {
  serviceKey: string; roundMonth: string; roundSeq: number; members: DemandMember[];
}
export interface DemandReport { rounds: DemandRound[]; gaps: DemandGap[] }
export interface RoundRef {
  serviceKey: string; roundMonth: string; roundSeq: number;
  title: string; windowStart: string; windowEnd: string; campaignId: string | null;
}
export interface ItemRef extends RoundRef {
  propertyId: string; propertyName: string; itemId: string | null;
}
export interface PreviewRound extends RoundRef {
  members: DemandMember[]; newRound: boolean; added: number; removed: number;
}
export interface CampaignGenerationReport {
  year: number; today: string;
  enabledAt: string | null;
  rounds: PreviewRound[];
  created: RoundRef[]; deleted: RoundRef[];
  added: ItemRef[]; removed: ItemRef[]; keptNotOwed: ItemRef[];
  missed: ItemRef[]; addedToClosedRound: ItemRef[];
  gaps: DemandGap[]; waitingOnSignature: number;
  manualCampaigns: { id: string; title: string; category: string; windowStart: string; windowEnd: string }[];
}
