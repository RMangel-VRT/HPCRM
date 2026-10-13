import type { Request, Response, RequestHandler } from "express";
import { db, inTransaction } from "../db";
import type { UserWithContext } from "../auth";
import { VisitError, lockVisitCompany, lockVisitTickets } from "./visitSync";
import { logger } from "./logger";

class RejectedResponse extends Error {}
/** Buffer response until commit; every unsuccessful workflow response rolls back
 * cleanup, comments, history, notifications, visits and ticket writes together. */
export function transactionalTicketPatch(handler: (req: Request<{ id: string }>, res: Response) => Promise<unknown>): RequestHandler<{ id: string }> {
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
        await lockVisitTickets(tx, user.activeCompanyId, [String(req.params.id)]);
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
          logger.error({ err: error }, "Ticket PATCH rolled back");
          res.status(500); body = { error: "Ticket update failed" }; asJson = true;
        }
      }
    } finally {
      res.send = send; res.json = json;
    }
    if (asJson) json(body); else send(body);
  };
}
