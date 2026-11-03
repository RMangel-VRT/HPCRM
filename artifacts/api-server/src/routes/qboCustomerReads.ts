import { Router, type Request, type Response } from "express";
import { and, eq, desc } from "drizzle-orm";
import { customers, qboCustomerCache, qboCustomerReviews } from "@workspace/db";
import { db } from "../db";
import type { UserWithContext } from "../auth";
import { canSeeBilling } from "../lib/billing";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { activeQboTerms } from "../services/qboTerms";
import { billsThroughParent, resolveBillTo } from "../services/customerBilling";
import { isQboWriteEnabled } from "../services/qboClient";

function access(req: Request, res: Response, billing: boolean) {
  if (!req.isAuthenticated?.()) { res.status(401).json({ message: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ message: "Active company changed. Reload before continuing." }); return;
  }
  // Mirrors the existing CustomerDetail route, not a new customer access grant.
  if (billing ? !canSeeBilling(user) : !["admin", "office", "field_manager", "chemical_manager"].includes(user.activeRole)) {
    res.status(403).json({ message: "Forbidden" }); return;
  }
  return user;
}
function failure(res: Response, err: unknown) {
  logger.error({ err }, "QuickBooks customer lookup failed");
  res.status(502).json({ message: "Unable to load QuickBooks customer details. Please try again." });
}

export const qboCustomerReads = Router();
qboCustomerReads.get("/terms", async (req, res) => {
  const user = access(req, res, true); if (!user) return;
  try { res.json(await activeQboTerms(user.activeCompanyId)); } catch (err) { failure(res, err); }
});
// Narrow read surface for review pickers; does not grant mapping mutations or
// return mirror billing facts. All choices are revalidated by CQ3 on resolution.
qboCustomerReads.get("/customer-review-options", async (req, res) => {
  const user = access(req, res, true); if (!user) return;
  try {
    const companyId = user.activeCompanyId;
    const [crm, quickbooks] = await Promise.all([
      db.select({ id: customers.id, name: customers.name, parentCustomerId: customers.parentCustomerId,
        qboCustomerId: customers.qboCustomerId }).from(customers).where(eq(customers.companyId, companyId)),
      db.select({ qboId: qboCustomerCache.qboId, displayName: qboCustomerCache.displayName,
        parentQboId: qboCustomerCache.parentQboId, active: qboCustomerCache.active })
        .from(qboCustomerCache).where(eq(qboCustomerCache.companyId, companyId)),
    ]);
    res.json({ customers: crm, quickbooks });
  } catch (err) { failure(res, err); }
});

export const customerQboReads = Router();
customerQboReads.get("/by-qbo/:qboId", async (req, res) => {
  const user = access(req, res, false); if (!user) return;
  try {
    const [row] = await db.select({ id: customers.id }).from(customers).where(and(
      eq(customers.companyId, user.activeCompanyId), eq(customers.qboCustomerId, String(req.params.qboId))));
    if (!row) { res.status(404).json({ message: "No CRM customer is linked to this QuickBooks customer" }); return; }
    res.json(row);
  } catch (err) { failure(res, err); }
});
customerQboReads.get("/:id/quickbooks-card", async (req, res) => {
  const user = access(req, res, false); if (!user) return;
  const companyId = user.activeCompanyId;
  try {
    const customer = await storage.getCustomerById(String(req.params.id), companyId);
    if (!customer) { res.status(404).json({ message: "Customer not found" }); return; }
    const parent = customer.parentCustomerId ? await storage.getCustomerById(customer.parentCustomerId, companyId) : undefined;
    const viaParent = billsThroughParent(customer, parent);
    const effectiveCustomer = viaParent ? parent! : customer;
    const managementCompany = effectiveCustomer.propertyManagementCompanyId
      ? await storage.getPropertyManagementCompanyById(effectiveCustomer.propertyManagementCompanyId, companyId) : undefined;
    const [billTo, connection, writeEnabled, reviews, identity] = await Promise.all([
      resolveBillTo(customer, { companyId,
        getCustomerById: (id, co) => storage.getCustomerById(id, co),
        getPropertyManagementCompanyById: (id, co) => storage.getPropertyManagementCompanyById(id, co) }),
      storage.getQboConnection(companyId), isQboWriteEnabled(companyId),
       // Card viewers need status/link identity, not billing-only review payloads.
       db.select({ id: qboCustomerReviews.id, kind: qboCustomerReviews.kind }).from(qboCustomerReviews).where(and(eq(qboCustomerReviews.companyId, companyId),
        eq(qboCustomerReviews.customerId, customer.id), eq(qboCustomerReviews.status, "open")))
        .orderBy(desc(qboCustomerReviews.createdAt)),
      // Identity-only mirror read: billing facts always come from their CRM owner.
      effectiveCustomer.qboCustomerId ? db.select({ name: qboCustomerCache.displayName }).from(qboCustomerCache).where(and(
        eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, effectiveCustomer.qboCustomerId))) : Promise.resolve([]),
    ]);
    const billToModeLabel = effectiveCustomer.billToMode === "management_company"
      ? `c/o ${managementCompany?.name ?? "management company"}`
      : effectiveCustomer.billToMode === "custom" ? "Other address" : "Property";
    // Customer viewers may read their assigned label, not enumerate the
    // billing-authorized terms endpoint. Reuse the same company-scoped cache.
    let termLabel: string | null = null, termLookupError: string | null = null;
    if (effectiveCustomer.qboTermId) {
      try {
        termLabel = (await activeQboTerms(companyId)).find(term => term.id === effectiveCustomer.qboTermId)?.name ?? null;
        if (!termLabel) termLookupError = "Assigned term is not in the active QuickBooks terms list.";
      } catch (err) {
        logger.error({ err }, "QuickBooks assigned term lookup failed");
        termLookupError = "Unable to look up billing term. Refresh to try again.";
      }
    }
    res.json({ customer, effectiveCustomer, parent: parent ?? null, billsThroughParent: viaParent,
      billTo, billToModeLabel, termLabel, termLookupError, managementCompanyName: managementCompany?.name ?? null,
      linkedName: identity[0]?.name ?? null, baselineAt: connection?.customerBaselineAt ?? null, writeEnabled, reviews });
  } catch (err) { failure(res, err); }
});
