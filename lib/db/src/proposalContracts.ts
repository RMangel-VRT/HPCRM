/** Read-only projection. Commercial facts belong to estimates/estimate_versions. */
export interface ProposalEstimateSummary {
  id: string;
  number: string;
  title: string;
  currentVersion: { id: string; versionNumber: number; status: import("./estimateContracts").EstimateVersionSummaryDto["status"] } | null;
  /** Gross line subtotal; totalCents is the discounted customer-facing total. */
  subtotalCents: number | null; totalCents: number | null;
}
