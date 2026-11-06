import type { Express } from "express";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { contactInstant, readDashboardCommunications } from "../services/customerDashboardActivity";
import { MailboxScopeForbiddenError } from "../services/mailboxScope";

/** Read-only CP3 projection: source timestamps and real status-history events, no new persistence. */
export function registerCustomerDashboardRoutes(app: Express) {
  app.get("/api/customers/:id/dashboard-activity", async (req, res, next): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).send("Not authenticated"); return; }
    const user = req.user as UserWithContext;
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
      res.status(409).json({ message: "Active company changed. Reload and try again." }); return;
    }
    if ((req.query.viewAs != null && typeof req.query.viewAs !== "string") ||
        (req.query.mailboxIds != null && typeof req.query.mailboxIds !== "string")) {
      res.status(400).json({ message: "Invalid mailbox filter" }); return;
    }
    try {
      const customer = await storage.getCustomerById(req.params.id, user.activeCompanyId);
      if (!customer) { res.status(404).send("Customer not found"); return; }
      const commercial = ["admin", "office"].includes(user.accessRole);
      const [tickets, communications] = await Promise.all([
        storage.getTicketsByCustomerId(customer.id, user.activeCompanyId),
        commercial ? readDashboardCommunications(storage, user, customer.id,
          req.query.viewAs as string | undefined, req.query.mailboxIds as string | undefined) : Promise.resolve([]),
      ]);
      // Match the existing crew-supervisor detail boundary, even when the customer is visible.
      const visibleTickets = user.activeRole === "crew_supervisor" ? tickets.filter(t => t.assignedToId === user.id) : tickets;
      const history = await storage.getTicketStatusHistoryForTickets(visibleTickets.map(t => t.id));
      const titleById = new Map(visibleTickets.map(t => [t.id, t.title]));
      const ticketChanges = history.filter(h => titleById.has(h.ticketId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5)
        .map(h => ({ id: h.id, ticketId: h.ticketId, title: titleById.get(h.ticketId), at: h.createdAt }));
      res.json({
        communications: communications.sort((a, b) => contactInstant(b).getTime() - contactInstant(a).getTime()).slice(0, 5)
          .map(c => ({ id: c.id, title: c.subject, at: contactInstant(c), direction: c.direction,
            person: c.direction === "inbound" ? c.fromName || c.fromAddress : c.sentByName || c.fromName || c.fromAddress,
            channel: c.type })),
        ticketChanges,
      });
    } catch (error) {
      if (error instanceof MailboxScopeForbiddenError) { res.status(403).json({ message: error.message }); return; }
      next(error);
    }
  });
}
