import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { customers, propertyManagementCompanies } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { canSeeBilling } from "../lib/billing";
import { logger } from "../lib/logger";
import { lockedCustomer, queueCustomerPush } from "../services/qboCustomerPush";
import { CustomerSyncError, withCustomerSyncLock } from "../services/qboCustomerSync";
import { markPending } from "../services/qboCustomerWrites";
import { countCustomerReviews, listCustomerReviews, resolveCustomerReview } from "../services/qboCustomerReviews";
import { normalize, crmToQboFields, toQboPayload } from "../services/qboCustomerMap";
import { resolveBillTo, billsThroughParent } from "../services/customerBilling";
import { validateOutgoingZips } from "../services/customerZip";

const router = Router();
function access(req: Request, res: Response, billing = false) {
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const u = req.user as UserWithContext;
  if (req.header("X-Company-Id") && req.header("X-Company-Id") !== u.activeCompanyId) {
    res.status(409).json({ message: "Active company changed; reload before continuing" }); return;
  }
  if (billing ? !canSeeBilling(u) : !["admin", "office"].includes(u.activeRole)) {
    res.status(403).json({ message: "Forbidden" }); return;
  }
  return { companyId: u.activeCompanyId, actorId: u.id };
}
function failure(res: Response, err: unknown) {
  if (err instanceof z.ZodError) { res.status(400).json({ message: "Invalid request", issues: err.issues }); return; }
  if (err instanceof CustomerSyncError) { res.status(err.status).json({ message: err.message }); return; }
  logger.error({ err }, "QuickBooks customer request failed");
  res.status(500).json({ message: "QuickBooks customer request failed" });
}
const legacy = z.object({
  customerId: z.string().min(1), displayNameOverride: z.string().trim().min(1).max(100).optional(),
  streetOverride: z.string().trim().min(1).optional(), cityOverride: z.string().trim().min(1).optional(),
  stateOverride: z.string().trim().min(1).optional(), zipOverride: z.string().regex(/^\d{5}(-?\d{4})?$/).optional(),
  emailOverride: z.string().trim().email().optional(), phoneOverride: z.string().trim().optional(),
}).strict();
// Durable nonblocking explicit send: the HTTP request commits owner facts and
// pending state only. QuickBooks latency/failures are never an HTTP write failure.
router.post("/customers/create", async (req, res) => {
  const u = access(req, res); if (!u) return;
  try {
    const input = legacy.parse(req.body);
    const result = await withCustomerSyncLock(u.companyId, async tx => {
      const c = await lockedCustomer(tx, u.companyId, input.customerId);
      if (!c) throw new CustomerSyncError(404, "CRM customer not found");
      if (c.qboCustomerId) throw new CustomerSyncError(409, "CRM customer is already bound to a QuickBooks customer");
      const patch: Partial<typeof c> = {};
      const map = { displayNameOverride: "billingName", emailOverride: "billingEmails", phoneOverride: "billingPhone" } as const;
      for (const k of Object.keys(map) as (keyof typeof map)[]) if (input[k] !== undefined)
        Object.assign(patch, { [map[k]]: k === "emailOverride" ? [input[k]] : input[k] });
      if (["streetOverride", "cityOverride", "stateOverride", "zipOverride"].some(k => k in input)) {
        Object.assign(patch, { billToMode: "custom", billStreet: input.streetOverride ?? c.billStreet ?? c.street,
          billStreet2: c.billStreet2, billCity: input.cityOverride ?? c.billCity ?? c.city,
          billState: input.stateOverride ?? c.billState ?? c.state, billZip: input.zipOverride ?? c.billZip ?? c.zip });
      }
      const next = { ...c, ...patch };
      const parent = next.parentCustomerId ? await lockedCustomer(tx, u.companyId, next.parentCustomerId) : undefined;
      if (!billsThroughParent(next, parent)) {
        const bill = await resolveBillTo(next, {
          companyId: u.companyId,
          getCustomerById: async id => lockedCustomer(tx, u.companyId, id),
          getPropertyManagementCompanyById: async (id, companyId) => (await tx.select().from(propertyManagementCompanies)
            .where(and(eq(propertyManagementCompanies.companyId, companyId), eq(propertyManagementCompanies.id, id))))[0],
        });
        if ("problem" in bill) throw new CustomerSyncError(400, "Billing address is incomplete");
        try {
          const fields = crmToQboFields(next, bill, parent);
          validateOutgoingZips(fields);
          toQboPayload(normalize(fields), { create: true });
        }
        catch (err) { throw new CustomerSyncError(400, err instanceof Error ? err.message : "Invalid billing facts"); }
      }
      await tx.update(customers).set({ ...patch, qboSyncState: "pending_push", updatedAt: new Date() })
        .where(and(eq(customers.companyId, u.companyId), eq(customers.id, c.id)));
      queueCustomerPush(u.companyId, c.id);
      return { ok: true, state: "pending_push", message: "Waiting to send", displayName: next.billingName ?? next.name };
    });
    res.status(202).json(result);
  } catch (err) { failure(res, err); }
});
router.post("/customers/:customerId/send-now", async (req, res) => {
  const u = access(req, res); if (!u) return;
  try {
    z.object({}).strict().parse(req.body ?? {});
    const customerId = z.string().min(1).parse(req.params.customerId);
    await withCustomerSyncLock(u.companyId, async tx => {
      const c = await lockedCustomer(tx, u.companyId, customerId);
      if (!c) throw new CustomerSyncError(404, "CRM customer not found");
      await markPending(tx, c);
    });
    res.status(202).json({ ok: true, state: "pending_push", message: "Waiting to send" });
  } catch (err) { failure(res, err); }
});
router.get("/customer-reviews/count", async (req, res) => {
  const u = access(req, res, true); if (!u) return;
  try { res.json(await countCustomerReviews(u.companyId)); } catch (err) { failure(res, err); }
});
router.get("/customer-reviews", async (req, res) => {
  const u = access(req, res, true); if (!u) return;
  try {
    const status = z.enum(["open", "resolved", "dismissed"]).parse(req.query.status ?? "open");
    res.json(await listCustomerReviews(u.companyId, status));
  } catch (err) { failure(res, err); }
});
router.post("/customer-reviews/:id/resolve", async (req, res) => {
  const u = access(req, res, true); if (!u) return;
  try {
    const result = await resolveCustomerReview(u.companyId, z.string().min(1).parse(req.params.id), u.actorId, req.body);
    res.status("stale" in result ? 409 : 200).json(result);
  } catch (err) { failure(res, err); }
});
export default router;
