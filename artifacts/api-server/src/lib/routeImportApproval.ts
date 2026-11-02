/** Default OFF. Add an entry only AFTER Randy explicitly approves the matching
 * production dry run. Task/merge approval is not production-import approval.
 * A changed planner/crew/contract decision invalidates the reviewed fingerprint.
 */
export const routeImportApprovals: Record<string, { approvedBy: "Randy"; fingerprint: string }> = {};
