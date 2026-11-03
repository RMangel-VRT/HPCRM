import { and, eq, inArray } from "drizzle-orm";
import { estimates, estimateVersions, estimateLines, type EstimateLine } from "@workspace/db";
import type { ProposalEstimateSummary } from "@workspace/db/estimate-contracts";
import { db } from "../db";
import { computeVersionTotals } from "./estimateMath";
import { readEstimate } from "./estimateReads";
import { EstimateError } from "./estimateErrors";
import { transitionEstimate } from "./estimateLifecycle";

export type ProposalLink = { customerId: string; ticketId: string | null };
export function assertProposalEstimateLink(proposal: ProposalLink, estimate: { customerId: string; ticketId: string | null; voidedAt: unknown }) {
  if (estimate.voidedAt) throw new EstimateError(422, "ESTIMATE_LINK_VOID");
  if (estimate.customerId !== proposal.customerId) throw new EstimateError(422, "ESTIMATE_CUSTOMER_MISMATCH");
  if (proposal.ticketId && estimate.ticketId !== proposal.ticketId) throw new EstimateError(422, "ESTIMATE_TICKET_MISMATCH");
}
export async function validateProposalEstimate(companyId: string, proposal: ProposalLink, id: string) {
  const [estimate] = await db.select().from(estimates).where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
  if (!estimate) throw new EstimateError(422, "ESTIMATE_NOT_FOUND");
  assertProposalEstimateLink(proposal, estimate);
  return estimate;
}

/** Bounded two-query projection, including void containers for honest linked display.
 * Draft math and frozen totals use the same owners as estimate reads. */
export async function loadProposalEstimateSummaries(companyId: string, ids: string[]) {
  const result = new Map<string, ProposalEstimateSummary>();
  if (!ids.length) return result;
  const rows = await db.select({ estimate: estimates, version: estimateVersions }).from(estimates)
    .leftJoin(estimateVersions, and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimates.id),
      eq(estimateVersions.id, estimates.currentVersionId)))
    .where(and(eq(estimates.companyId, companyId), inArray(estimates.id, [...new Set(ids)])));
  const draftIds = rows.flatMap(r => r.version?.status === "draft" ? [r.version.id] : []);
  const lines = draftIds.length ? await db.select().from(estimateLines)
    .where(and(eq(estimateLines.companyId, companyId), inArray(estimateLines.versionId, draftIds))) : [];
  const grouped = new Map<string, EstimateLine[]>();
  for (const line of lines) { const group = grouped.get(line.versionId) ?? []; group.push(line); grouped.set(line.versionId, group); }
  for (const { estimate, version } of rows) result.set(estimate.id, {
    id: estimate.id, number: estimate.estimateNumber, title: estimate.title,
    currentVersion: version ? { id: version.id, versionNumber: version.versionNumber, status: estimate.voidedAt ? "void" : version.status } : null,
    subtotalCents: version?.status === "draft" ? computeVersionTotals(grouped.get(version.id) ?? []).subtotalCents : version?.frozenSubtotalCents ?? null,
  });
  return result;
}

export interface ProposalEstimateTransition {
  sent: boolean; estimateId: string; versionId: string; method: string | null; sentOn: string | null;
}
/** Send commits in its own lifecycle transaction BEFORE any rendering/storage.
 * Capture once: never reselect currentVersionId after sending or during a retry. */
export async function prepareProposalEstimate(companyId: string, userId: string, proposal: ProposalLink & { estimateId: string | null },
  input: { estimateSendMethod?: "email" | "hard_copy" | "portal" | "other"; confirmZeroPriced?: boolean; expectedEstimateVersionId?: string }): Promise<ProposalEstimateTransition | null> {
  if (!proposal.estimateId) return null;
  const detail = await readEstimate(companyId, proposal.estimateId);
  if (detail.voidedAt) throw new EstimateError(409, "ESTIMATE_VOID");
  assertProposalEstimateLink(proposal, detail);
  const selected = detail.version;
  if (input.expectedEstimateVersionId && input.expectedEstimateVersionId !== selected.id) {
    throw new EstimateError(409, "ESTIMATE_VERSION_CHANGED");
  }
  let version = selected;
  let sent = false;
  if (selected.status === "draft") {
    if (!input.estimateSendMethod) throw new EstimateError(400, "ESTIMATE_SEND_METHOD_REQUIRED");
    const committed = await transitionEstimate(companyId, userId, detail.id, selected.id, "send",
      { method: input.estimateSendMethod, ...(input.confirmZeroPriced !== undefined ? { confirmZeroPriced: input.confirmZeroPriced } : {}) });
    // The lifecycle response's current pointer is not a substitute for the selected ID.
    const exact = committed.versions.find(v => v.id === selected.id);
    if (!exact || exact.status !== "sent") throw new EstimateError(409, "ESTIMATE_VERSION_CHANGED");
    version = { ...selected, ...exact };
    sent = true;
  } else if (selected.status !== "sent" && selected.status !== "accepted") {
    throw new EstimateError(409, "ESTIMATE_INELIGIBLE");
  }
  return { sent, estimateId: detail.id, versionId: selected.id, method: version.sentMethod,
    sentOn: version.sentAt ? new Date(version.sentAt).toISOString() : null };
}
