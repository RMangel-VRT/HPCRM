import { and, eq, isNotNull } from "drizzle-orm";
import { estimates, estimateVersions, type EstimateWorkLocationInput, type ResolvedWorkLocation } from "@workspace/db";
import { db, inTransaction } from "../db";
import { lockVisitCompany, lockVisitTickets } from "../lib/visitLocks";
import { recordTicketLocationEdit } from "../lib/ticketLocationHistory";
import { storage } from "../storage";
import { estimateDisplay } from "./estimateDisplay";
import { EstimateError, requireEstimate } from "./estimateErrors";

export async function updateEstimateWorkLocation(companyId: string, userId: string, id: string,
  input: EstimateWorkLocationInput): Promise<ResolvedWorkLocation> {
  return db.transaction(async tx => {
    await lockVisitCompany(tx, companyId);
    const scope = and(eq(estimates.companyId, companyId), eq(estimates.id, id));
    // Ticket deletion takes the ticket row first, then clears the estimate FK.
    // Follow that order; the preliminary read only tells us which ticket to lock.
    const candidate = requireEstimate((await tx.select({ ticketId: estimates.ticketId }).from(estimates).where(scope))[0]);
    const [ticket] = candidate.ticketId ? await lockVisitTickets(tx, companyId, [candidate.ticketId]) : [];
    let estimate = requireEstimate((await tx.select().from(estimates).where(scope).for("update"))[0]);
    if (estimate.voidedAt) throw new EstimateError(409, "ESTIMATE_VOIDED");
    if (estimate.currentVersionId) {
      const [current] = await tx.select({ id: estimateVersions.id }).from(estimateVersions).where(and(
        eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, id), eq(estimateVersions.id, estimate.currentVersionId),
        eq(estimateVersions.status, "draft"), isNotNull(estimateVersions.emailIssue)));
      if (current) throw new EstimateError(409, "ESTIMATE_EMAIL_IN_PROGRESS");
    }
    const { label, details } = input;
    if (estimate.ticketId !== null) {
      if (!ticket || estimate.ticketId !== ticket.id) throw new EstimateError(409, "WORK_LOCATION_OWNER_CHANGED");
      if (ticket.locationLabel !== label || ticket.locationDescription !== details) {
        await inTransaction(tx, async () => {
          const updated = requireEstimate(await storage.updateTicket(ticket.id, companyId, { locationLabel: label, locationDescription: details }));
          await recordTicketLocationEdit(ticket, updated, userId);
        });
      }
    } else {
      if (candidate.ticketId !== null) throw new EstimateError(409, "WORK_LOCATION_OWNER_CHANGED");
      if (estimate.workLocationLabel !== label || estimate.workLocationDescription !== details) {
        [estimate] = await tx.update(estimates).set({
          workLocationLabel: label, workLocationDescription: details, updatedAt: new Date(),
        }).where(scope).returning();
      }
    }
    const display = await estimateDisplay(tx, companyId, estimate);
    return { text: display.workLocation, source: display.workLocationSource };
  });
}

/** The generic PATCH must never become a second way to write the location. */
export async function rejectDirectEstimateLocationWrite(companyId: string, id: string) {
  const estimate = requireEstimate((await db.select({ ticketId: estimates.ticketId }).from(estimates)
    .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id))))[0]);
  if (estimate.ticketId !== null) throw new EstimateError(409, "WORK_LOCATION_OWNED_BY_TICKET", { ticketId: estimate.ticketId });
  throw new EstimateError(400, "USE_WORK_LOCATION_ENDPOINT");
}
