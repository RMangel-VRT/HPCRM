/** Read-side wire contract. No database/runtime dependencies. */
export const RENEWAL_WINDOW_DAYS = 90;
export const CONTRACT_STATES = ["new_draft", "closed", "closed_recently", "serving_not_renewing",
  "working_unsigned", "renewal_due", "renewal_in_progress", "good", "ended_no_decision", "unclassified"] as const;
export type ContractState = typeof CONTRACT_STATES[number];
export type ContractFlag = "missing_document";
export type ContractAction = "open" | "renew" | "not_renewing" | "mark_signed";
export interface ContractProjection {
  state: ContractState;
  stateSince: string | null;
  stateReason: string;
  stateTermId: string | null;
  flags: ContractFlag[];
  allowedActions: ContractAction[];
  actionTermId: string | null;
}
export type ContractSegment = "decision" | "due" | "drafted" | "good" | "notrenewing" | "closed";
export function contractSegment(state: ContractState): ContractSegment {
  switch (state) {
    case "working_unsigned": case "ended_no_decision": case "unclassified": return "decision";
    case "renewal_due": return "due";
    case "new_draft": case "renewal_in_progress": return "drafted";
    case "good": return "good";
    case "serving_not_renewing": return "notrenewing";
    case "closed": case "closed_recently": return "closed";
    default: { const exhaustive: never = state; throw new Error(`Unknown contract state: ${exhaustive}`); }
  }
}
export const contractNeedsAction = (state: ContractState) => ["decision", "due", "drafted"].includes(contractSegment(state));
export const emptyContractCounts = (): Record<ContractState, number> =>
  Object.fromEntries(CONTRACT_STATES.map(state => [state, 0])) as Record<ContractState, number>;
