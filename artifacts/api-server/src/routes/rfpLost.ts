import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { ticketTypeFields } from "@workspace/db";
import { MarkRfpLostBody, MarkRfpLostParams, MarkRfpLostResponse } from "@workspace/api-zod";
import type { UserWithContext } from "../auth";
import { db, inTransaction } from "../db";
import { storage } from "../storage";
import { ContractCenterError } from "../lib/contractCenterService";
import { applyRfpDecisionLost } from "../lib/contractCenterStatusChange";
import { lockRfp, rfpWorkflow } from "../lib/rfpContracts";

export function registerRfpLost(app: Express): void {
  app.post("/api/tickets/:id/rfp/lost", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const user = req.user as UserWithContext;
    if (!user.activeCompanyId || !["admin", "office"].includes(user.accessRole)) {
      res.status(403).json({ message: "Only admins and office staff can mark an RFP lost." });
      return;
    }
    const params = MarkRfpLostParams.safeParse(req.params);
    const input = MarkRfpLostBody.strict().safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({ message: "Provide a loss reason and optional notes." });
      return;
    }
    try {
      const updated = await db.transaction(async tx => {
        const ticket = await lockRfp(tx, user.activeCompanyId, params.data.id);
        if (!ticket) throw new ContractCenterError(404, "Ticket not found");
        const flow = await rfpWorkflow(tx, ticket);
        const current = flow?.current;
        if (!current || !flow?.onboarding || current.isFinal === "true" || ticket.completedAt ||
          current.displayOrder >= flow.onboarding.displayOrder ||
          current.statusKey === "closed_lost" || current.statusKey === "closed_won") {
          throw new ContractCenterError(409, "Only an open RFP before Onboarding can be marked lost.");
        }
        const lost = flow.statuses.find(s => s.statusKey === "closed_lost");
        if (lost?.isFinal !== "true" || lost.displayOrder <= current.displayOrder) {
          throw new ContractCenterError(409, "The RFP Lost status is not configured.");
        }
        const fields = await tx.select().from(ticketTypeFields).where(and(
          eq(ticketTypeFields.ticketTypeId, ticket.ticketTypeId), eq(ticketTypeFields.statusId, lost.id),
        ));
        const reason = fields.find(f => f.fieldKey === "loss_reason");
        const notes = fields.find(f => f.fieldKey === "loss_notes");
        if (!reason?.options?.length || !notes) {
          throw new ContractCenterError(409, "The RFP loss fields are not configured.");
        }
        const { lossReason, lossNotes } = input.data;
        if (!reason.options.includes(lossReason)) {
          throw new ContractCenterError(400, "Choose a listed reason for loss.");
        }
        return inTransaction(tx, async () => {
          await storage.upsertTicketFieldValue({ ticketId: ticket.id, fieldId: reason.id, value: lossReason, capturedById: user.id });
          if (lossNotes !== undefined) {
            await storage.upsertTicketFieldValue({ ticketId: ticket.id, fieldId: notes.id, value: lossNotes, capturedById: user.id });
          }
          return MarkRfpLostResponse.passthrough().parse(await applyRfpDecisionLost(tx, ticket, user.id));
        });
      });
      res.json(updated);
    } catch (error) {
      if (!(error instanceof ContractCenterError)) throw error;
      res.status(error.status).json({ message: error.message });
    }
  });
}
