import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { customers, qboCustomerCache } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { saveCustomerSetup, setupEnvelope, setupMissingFields } from "../services/customerSetup";
import { ActivationIncomplete } from "../services/customerSetupValidation";
import { CustomerSyncBusyError, CustomerSyncError } from "../services/qboCustomerSync";
import { isQboWriteEnabled } from "../services/qboClient";
import type { QboCustomerFields } from "../services/qboCustomerMap";
import { logger } from "../lib/logger";
import { accessRole } from "../../../../lib/db/src/accessRole";

export function setupAccess(req: Request, res: Response) {
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "UNAUTHENTICATED" }); return; }
  const user = req.user as UserWithContext;
  if (!["admin", "office"].includes(accessRole(user.activeRole))) { res.status(403).json({ message: "FORBIDDEN" }); return; }
  if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ message: "COMPANY_CHANGED" }); return;
  }
  return user;
}
export function setupFailure(res: Response, err: unknown) {
  if (err instanceof ActivationIncomplete) return res.status(400).json({
    code: err.code, missingFields: err.missingFields, message: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ code: "SETUP_INVALID", message: "SETUP_INVALID",
    fields: err.issues.map(i => i.path.join(".")) });
  if (err instanceof CustomerSyncError) return res.status(err.status).json({ code: err.message, message: err.message });
  logger.error({ err }, "Customer setup failed");
  return res.status(500).json({ message: "CUSTOMER_SETUP_FAILED" });
}

/** Legacy writers that propagate errors must share the retryable busy contract. */
export function customerSyncBusyFailure(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof CustomerSyncBusyError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  next(err);
}
export async function createCustomerRequest(req: Request, res: Response, legacy = false) {
  const user = setupAccess(req, res); if (!user) return;
  try {
    const input = setupEnvelope.parse(legacy ? { customer: req.body } : req.body);
    const result = await saveCustomerSetup(user.activeCompanyId, user.id, input);
    res.json(legacy ? result.customer : result);
  } catch (err) { setupFailure(res, err); }
}
const context = (companyId: string) => ({ companyId,
  getCustomerById: (id: string) => storage.getCustomerById(id, companyId),
  getPropertyManagementCompanyById: (id: string) => storage.getPropertyManagementCompanyById(id, companyId) });
export const customerSetupRouter = Router();
customerSetupRouter.post("/wizard", (req, res) => createCustomerRequest(req, res));
customerSetupRouter.get("/wizard/options", async (req, res) => {
  const user = setupAccess(req, res); if (!user) return;
  try {
    const [connection, writeEnabled, terms] = await Promise.all([
      storage.getQboConnection(user.activeCompanyId), isQboWriteEnabled(user.activeCompanyId),
      // Evidence comes from this company's billing owner, never an unscoped cache.
      db.select({ termId: customers.qboTermId, uses: sql<number>`count(*)::int` }).from(customers)
        .where(and(eq(customers.companyId, user.activeCompanyId), sql`${customers.qboTermId} IS NOT NULL AND ${customers.qboTermId} <> ''`))
        .groupBy(customers.qboTermId).orderBy(sql`count(*) desc`, customers.qboTermId).limit(2),
    ]);
    const mostUsedTermId = terms.length && (terms.length === 1 || terms[0].uses > terms[1].uses) ? terms[0].termId : null;
    res.json({ writeEnabled, baselineAt: connection?.customerBaselineAt ?? null, mostUsedTermId });
  } catch (err) { setupFailure(res, err); }
});
customerSetupRouter.get("/wizard/prefill/:qboId", async (req, res) => {
  const user = setupAccess(req, res); if (!user) return;
  try {
    const companyId = user.activeCompanyId, qboId = String(req.params.qboId);
    const [cache] = await db.select().from(qboCustomerCache).where(and(
      eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, qboId)));
    if (!cache?.normalized) throw new CustomerSyncError(404, "QBO_CUSTOMER_NOT_FOUND");
    const [linked] = await db.select({ id: customers.id }).from(customers).where(and(
      eq(customers.companyId, companyId), eq(customers.qboCustomerId, qboId)));
    const q = cache.normalized as QboCustomerFields;
    const [parent] = cache.parentQboId ? await db.select().from(customers).where(and(
      eq(customers.companyId, companyId), eq(customers.qboCustomerId, cache.parentQboId))) : [];
    // Read-only prefill snapshot. Only a successful bind resolves review evidence.
    res.json({ customer: { name: cache.displayName, status: "prospect", customerType: "commercial",
      street: q.shipAddr?.street ?? "", city: q.shipAddr?.city ?? "", state: q.shipAddr?.state ?? "", zip: q.shipAddr?.zip ?? "",
      billingName: q.displayName, billingCompanyName: q.companyName, billingContactName: q.contactName,
      billingEmails: q.emails, billingPhone: q.phone, billingMobile: q.mobile, qboTermId: q.termId,
      billToMode: "custom", billStreet: q.billAddr?.street ?? "", billStreet2: q.billAddr?.street2 ?? "",
      billCity: q.billAddr?.city ?? "", billState: q.billAddr?.state ?? "", billZip: q.billAddr?.zip ?? "",
      parentCustomerId: parent?.id ?? null },
      qbo: { linkQboId: qboId }, linkedCustomerId: linked?.id ?? null, parentQboId: cache.parentQboId });
  } catch (err) { setupFailure(res, err); }
});
customerSetupRouter.get("/:id/setup", async (req, res) => {
  const user = setupAccess(req, res); if (!user) return;
  try {
    const customer = await storage.getCustomerById(String(req.params.id), user.activeCompanyId);
    if (!customer) throw new CustomerSyncError(404, "CUSTOMER_NOT_FOUND");
    res.json({ customer, contacts: await storage.getContactsByCustomerId(customer.id, user.activeCompanyId),
      missingFields: await setupMissingFields(customer, context(user.activeCompanyId)) });
  } catch (err) { setupFailure(res, err); }
});
customerSetupRouter.patch("/:id/setup", async (req, res) => {
  const user = setupAccess(req, res); if (!user) return;
  try {
    res.json(await saveCustomerSetup(user.activeCompanyId, user.id, setupEnvelope.parse(req.body), String(req.params.id)));
  } catch (err) { setupFailure(res, err); }
});
