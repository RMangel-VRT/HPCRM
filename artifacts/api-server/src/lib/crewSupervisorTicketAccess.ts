import type { Express } from "express";
import type { UserWithContext } from "../auth";

type TicketLookup = {
  getTicketById(id: string, companyId: string): Promise<{
    companyId: string;
    assignedToId?: string | null;
  } | undefined>;
};

// These are collection actions, not ticket identities. Their existing role
// checks remain authoritative; the exemption applies only to the bare path.
const COLLECTION_ACTIONS = new Set([
  "my", "batch", "photo-upload-url", "document-upload-url",
  "create-invoice-from-project",
]);

/** Protect the web detail page's entire ticket subtree without changing any
 * other role or the separate /api/m mobile authentication/authorization path. */
export function registerCrewSupervisorTicketGuard(app: Express, storage: TicketLookup): void {
  app.use("/api/tickets/:ticketId", async (req, res, next): Promise<void> => {
    const user = req.user as UserWithContext | undefined;
    if (!req.isAuthenticated() || user?.activeRole !== "crew_supervisor") {
      next();
      return;
    }
    const ticketId = req.params.ticketId;
    if (typeof ticketId !== "string" ||
        ((req.path === "/" || req.path === "") && COLLECTION_ACTIONS.has(ticketId))) {
      next();
      return;
    }
    try {
      const ticket = await storage.getTicketById(ticketId, user.activeCompanyId);
      if (!ticket || ticket.companyId !== user.activeCompanyId) {
        res.status(404).send("Ticket not found");
        return;
      }
      if (ticket.assignedToId !== user.id) {
        res.status(403).send("Access denied - not assigned to this ticket");
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });
}
