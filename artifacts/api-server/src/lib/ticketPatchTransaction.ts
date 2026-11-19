import type { Request, Response, RequestHandler } from "express";
import { db, inTransaction } from "../db";
import type { UserWithContext } from "../auth";
import { VisitError, lockVisitCompany, lockVisitTickets } from "./visitSync";
import { logger } from "./logger";
import { and, eq } from "drizzle-orm";
import { ticketLinks, tickets } from "@workspace/db";

class RejectedResponse extends Error {}
/** Buffer response until commit; every unsuccessful workflow response rolls back
 * cleanup, comments, history, notifications, visits and ticket writes together. */
export function transactionalTicketPatch<P extends Record<string, string> = { id: string }>(
  handler: (req: Request<P>, res: Response) => Promise<unknown>,
  ticketIds?: (req: Request<P>) => unknown[],
): RequestHandler<P> {
  return async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) { await handler(req, res); return; }
    const user = req.user as UserWithContext;
    const send = res.send.bind(res), json = res.json.bind(res);
    let body: unknown, asJson = false;
    res.send = ((value: unknown) => { body = value; return res; }) as Response["send"];
    res.json = ((value: unknown) => { body = value; asJson = true; return res; }) as Response["json"];
    try {
      await db.transaction(async tx => {
        await lockVisitCompany(tx, user.activeCompanyId);
        const ids = (ticketIds ? ticketIds(req) : [req.params.id]).filter((id): id is string => typeof id === "string");
        const id = ids[0];
        const parents = id && typeof req.body?.currentStatusId === "string" ? await tx
          .select({ id: ticketLinks.sourceTicketId }).from(ticketLinks)
          .innerJoin(tickets, and(eq(tickets.id, ticketLinks.sourceTicketId), eq(tickets.companyId, user.activeCompanyId)))
          .where(and(eq(ticketLinks.targetTicketId, id), eq(ticketLinks.linkType, "invoice_for"))) : [];
        await lockVisitTickets(tx, user.activeCompanyId, [...ids, ...parents.map(p => p.id)]);
        await inTransaction(tx, async () => {
          await handler(req, res);
          if (res.statusCode >= 400) throw new RejectedResponse();
        });
      });
    } catch (error) {
      if (!(error instanceof RejectedResponse)) {
        if (error instanceof VisitError) {
          res.status(error.status); body = { error: error.code, message: error.message }; asJson = true;
        } else {
          logger.error({ err: error }, "Ticket write rolled back");
          res.status(500); body = { error: "Ticket update failed" }; asJson = true;
        }
      }
    } finally {
      res.send = send; res.json = json;
    }
    if (asJson) json(body); else send(body);
  };
}
