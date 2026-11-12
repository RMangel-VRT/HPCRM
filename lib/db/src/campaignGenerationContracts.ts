/** Read-only demand projections; commercial counts/months remain Contract Center owned. */
export interface CampaignMembershipStatus {
  enabledAt: string | null; checkedAt: string | null; succeededAt: string | null;
  error: string | null; changes: number; keptNotOwed: number; missed: number;
}
export interface CampaignContractState {
  state: "owed" | "waiting_on_signature" | "no_longer_in_contract";
  agreementId: string | null; termId: string | null;
}
export type DemandGapKind = "no_count" | "needs_rounds" | "legacy_chemical" | "invalid_count" | "duplicate_lines";
export interface DemandMember {
  propertyId: string; propertyName: string; termId: string; agreementId: string;
  seasonLabel: string; termStatus: string;
  timing: "calendar"; count: "contract" | "standard";
}
export interface DemandGap {
  propertyId: string; propertyName: string; termId: string; agreementId: string;
  seasonLabel: string; serviceKey: string; kind: DemandGapKind;
  count?: number; informational?: boolean;
}
export interface DemandRound {
  serviceKey: string; calendarEntryId: string; roundYear: number;
  name: string; opens: string; due: string; members: DemandMember[];
}
export interface DemandReport { rounds: DemandRound[]; gaps: DemandGap[] }
export interface RoundRef {
  serviceKey: string; calendarEntryId: string; roundYear: number;
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
