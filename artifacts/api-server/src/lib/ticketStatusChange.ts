import type { Ticket } from "@workspace/db";
import { db, inTransaction } from "../db";
import { storage } from "../storage";
import type { Transaction } from "./contractCenterPersistence";
import { maintainScheduleBy } from "./scheduleByMaintenance";
import { ContractCenterError } from "./contractCenterService";
import { dueDateExtendedToFuture as wasDueDateExtendedToFuture } from "./dueDateDismissal";
import { assertSchedulingGate, isSchedulingGateType } from "./schedulingTransition";
import { lockVisitCompany, lockVisitTickets } from "./visitLocks";
import { recordTicketLocationEdit } from "./ticketLocationHistory";

/** Shared persistence of a status change. PATCH retains its type-specific
 * validation/step-back effects before calling this, in the same transaction. */
export async function applyTicketStatus(tx: Transaction, input: {
  ticket: Ticket; toStatusKey?: string; userId: string; note?: string | null;
  updates?: Record<string, any>;
  skipScheduling?: boolean;
}) {
  const work = async () => {
  const { userId, note } = input;
  let { ticket } = input;
  const updates = { ...input.updates };
  const statusIntent = !!(input.toStatusKey || updates.currentStatusId);
  const type = statusIntent ? await storage.getTicketTypeById(ticket.ticketTypeId, ticket.companyId) : undefined;
  // PATCH already holds the company gate and all involved ticket locks.
  // Standalone helpers re-read the source under lock, not from the caller's snapshot.
  if (statusIntent && isSchedulingGateType(type) && tx !== (db as unknown as Transaction)) {
    await lockVisitCompany(tx, ticket.companyId);
    const [fresh] = await lockVisitTickets(tx, ticket.companyId, [ticket.id]);
    if (!fresh || fresh.ticketTypeId !== ticket.ticketTypeId) throw new ContractCenterError(409, "Ticket workflow changed. Reload and try again.");
    ticket = fresh;
  }
  const statuses = await storage.getTicketTypeStatuses(ticket.ticketTypeId);
  const target = input.toStatusKey
    ? statuses.find(s => s.statusKey === input.toStatusKey)
    : statuses.find(s => s.id === updates.currentStatusId);
  if (input.toStatusKey && !target) throw new ContractCenterError(409, "RFP workflow status is missing");
  if (target) updates.currentStatusId = target.id;
  if (statusIntent && typeof updates.currentStatusId === "string") {
    await assertSchedulingGate(tx, ticket, type, statuses, updates.currentStatusId, input.skipScheduling);
  }
  const changing = !!updates.currentStatusId && updates.currentStatusId !== ticket.currentStatusId;
  maintainScheduleBy(updates, ticket, statuses);
  if (changing) {
    await storage.createTicketStatusHistory({ ticketId: ticket.id, fromStatusId: ticket.currentStatusId,
      toStatusId: updates.currentStatusId, changedById: userId, notes: note ?? null });
    const old = statuses.find(s => s.id === ticket.currentStatusId);
    if (target?.isFinal === "true" && (!old || target.displayOrder >= old.displayOrder)) {
      updates.completedAt = new Date();
      if (!updates.completedByUserId) updates.completedByUserId = userId;
      const admin = (await storage.getCompanyUsersByCompanyId(ticket.companyId)).find(c => c.role === "admin");
      if (admin) {
        const customer = ticket.customerId ? await storage.getCustomerById(ticket.customerId, ticket.companyId) : null;
        await storage.createNotification({ companyId: ticket.companyId, recipientId: admin.userId,
          ticketId: ticket.id, type: "completed", isRead: false,
          message: `Ticket completed: ${ticket.title}${customer ? ` - ${customer.name}` : ""} (${new Date().toLocaleString()})` });
      }
    }
  }
  const row = await storage.updateTicket(ticket.id, ticket.companyId, updates);
  if (!row) throw new ContractCenterError(404, "Ticket not found");
  if (["locationLabel", "locationDescription", "locationLat", "locationLng"].some(key => Object.hasOwn(updates, key))) {
    await recordTicketLocationEdit(ticket, row, userId);
  }
  if ((changing && target?.isFinal === "true") || wasDueDateExtendedToFuture(updates.dueDate, ticket.dueDate)) {
    await storage.dismissDueDateNotificationsForTicket(ticket.id);
  }
  return row;
  };
  // Ticket PATCH already runs under the ambient transaction. Installing its
  // routing proxy as the connection would make that proxy resolve to itself.
  return tx === (db as unknown as Transaction) ? work() : inTransaction(tx, work);
}
