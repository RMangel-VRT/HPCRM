import type { Express } from "express";
import { ChangeTicketTypeBody, ChangeTicketTypeResponse } from "@workspace/api-zod";
import { TICKET_EDIT_REASONS } from "../../../../lib/db/src/ticketEditContracts";
import type { UserWithContext } from "../auth";
import { db, type AppTransaction } from "../db";
import { storage } from "../storage";
import { canEditTicketIdentity, changeTicketType } from "../lib/guardedTicketEdit";
import { transactionalTicketPatch } from "../lib/ticketPatchTransaction";

export function registerTicketTypeChange(app: Express): void {
  app.post("/api/tickets/:id/change-type", transactionalTicketPatch(async (req, res) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const user = req.user as UserWithContext;
    if (!canEditTicketIdentity(user)) {
      res.status(403).json({ error: "TICKET_EDIT_PERMISSION", message: TICKET_EDIT_REASONS.TICKET_EDIT_PERMISSION });
      return;
    }
    const parsed = ChangeTicketTypeBody.strict().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid ticket type change" });
      return;
    }
    const ticket = await storage.getTicketById(req.params.id, user.activeCompanyId);
    if (!ticket) {
      res.status(404).json({ message: "Ticket not found" });
      return;
    }
    const expectedType = req.get("X-Ticket-Type-Id");
    if (expectedType && expectedType !== ticket.ticketTypeId) {
      res.status(409).json({ error: "TICKET_EDIT_TYPE_CHANGED", message: TICKET_EDIT_REASONS.TICKET_EDIT_TYPE_CHANGED });
      return;
    }
    const updated = await changeTicketType(db as unknown as AppTransaction, ticket, user.id, parsed.data);
    res.json(ChangeTicketTypeResponse.parse(updated));
  }));
}
