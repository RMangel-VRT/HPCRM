import { and, eq, inArray, isNull } from "drizzle-orm";
import { estimates, estimateVersions, estimateLines, estimateSections, tickets, ESTIMATE_VALIDITY_DAYS, estimateLineNeedsPrice, type EstimateLine, type EstimateBoardSummaryDto } from "@workspace/db";
import { addCalendarDays, companyDateString } from "../lib/companyDay";
import { db } from "../db";
import { computeVersionTotals } from "./estimateMath";
import { readEstimate } from "./estimateReads";
import { requireEstimate } from "./estimateErrors";

/** Two company-qualified bulk queries regardless of board size; no section/line cross product. */
export async function loadTicketEstimateSummaries(companyId: string, ticketIds: string[]): Promise<Map<string, EstimateBoardSummaryDto>> {
  if (!ticketIds.length) return new Map<string, EstimateBoardSummaryDto>();
  const rows = await db.select({ estimate: estimates, version: estimateVersions, line: estimateLines })
    .from(estimates)
    .innerJoin(estimateVersions, and(eq(estimateVersions.id, estimates.currentVersionId),
      eq(estimateVersions.estimateId, estimates.id), eq(estimateVersions.companyId, companyId)))
    .leftJoin(estimateLines, and(eq(estimateLines.versionId, estimateVersions.id),
      eq(estimateLines.companyId, companyId), eq(estimateVersions.status, "draft")))
    .where(and(eq(estimates.companyId, companyId), isNull(estimates.voidedAt), inArray(estimates.ticketId, ticketIds)));
  const groups = new Map<string, { row: typeof rows[number]; lines: EstimateLine[] }>();
  const draftIds = [...new Set(rows.filter(r => r.version.status === "draft").map(r => r.version.id))];
  const sections = draftIds.length ? await db.select({ versionId: estimateSections.versionId, updatedAt: estimateSections.updatedAt })
    .from(estimateSections).where(and(eq(estimateSections.companyId, companyId), inArray(estimateSections.versionId, draftIds))) : [];
  const sectionEdited = new Map<string, number>();
  for (const section of sections) sectionEdited.set(section.versionId, Math.max(sectionEdited.get(section.versionId) ?? 0, section.updatedAt.getTime()));
  for (const row of rows) {
    if (!row.estimate.ticketId) continue;
    const group = groups.get(row.estimate.ticketId) ?? { row, lines: [] };
    if (row.line) group.lines.push(row.line);
    groups.set(row.estimate.ticketId, group);
  }
  return new Map([...groups].map(([ticketId, { row: { estimate, version }, lines }]) => [ticketId, {
    id: estimate.id, number: estimate.estimateNumber, versionNumber: version.versionNumber,
    versionId: version.id, sentAt: version.sentAt?.toISOString() ?? null, acceptedAt: version.acceptedAt?.toISOString() ?? null,
    validUntil: version.sentAt ? addCalendarDays(companyDateString(version.sentAt), ESTIMATE_VALIDITY_DAYS) : null,
    draftEditedAt: version.status === "draft" ? new Date(Math.max(
      version.updatedAt.getTime(), ...lines.map(l => l.updatedAt.getTime()),
      sectionEdited.get(version.id) ?? 0,
    )).toISOString() : null,
    linesNeedingPrice: version.status === "draft" ? lines.filter(estimateLineNeedsPrice).length : 0,
    lineCount: lines.length,
    status: version.status, subtotalCents: version.status === "draft"
      ? computeVersionTotals(lines).subtotalCents : version.frozenSubtotalCents,
  }]));
}

export async function readTicketEstimate(companyId: string, ticketId: string) {
  // A foreign/nonexistent ticket is not the same as an owned ticket with no estimate.
  requireEstimate((await db.select({ id: tickets.id }).from(tickets)
    .where(and(eq(tickets.companyId, companyId), eq(tickets.id, ticketId))))[0]);
  const live = (await db.select({ id: estimates.id }).from(estimates)
    .where(and(eq(estimates.companyId, companyId), eq(estimates.ticketId, ticketId), isNull(estimates.voidedAt))))[0];
  if (!live) return null;
  const detail = await readEstimate(companyId, live.id);
  // Recheck after the separate lookup: a concurrent void must not return a live summary.
  if (detail.voidedAt) return null;
  const { version, ...container } = detail;
  return { ...container, version: { id: version.id, versionNumber: version.versionNumber, status: version.status },
    subtotalCents: version.status === "draft" ? version.totals.subtotalCents : version.frozenSubtotalCents };
}
