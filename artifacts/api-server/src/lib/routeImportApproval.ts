/** Default OFF. Add an entry only AFTER Randy explicitly approves the matching
 * production dry run. Task/merge approval is not production-import approval.
 * A changed selected planner/property/crew source invalidates the fingerprint.
 * Contract coverage remains live and intentionally does not invalidate approval.
 * templateId is optional only for legacy exactly-one-active-template approvals.
 */
export const routeImportApprovals: Record<string, { approvedBy: "Randy"; templateId?: string; fingerprint: string }> = {};
