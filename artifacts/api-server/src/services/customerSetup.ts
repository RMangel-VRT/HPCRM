import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { customers, contacts, propertyManagementCompanies, insertCustomerSchema, insertContactSchema,
  type Customer } from "@workspace/db";
import { inTransaction, type AppTransaction } from "../db";
import { storage } from "../storage";
import { billsThroughParent } from "./customerBilling";
import { billingInputProblem, protectedBillingWrite } from "./customerBillingInput";
import { assertActivationComplete, setupMissingFields } from "./customerSetupValidation";
import { validateDisplayName } from "./qboCustomerMap";
import { bindCustomerLocked } from "./qboCustomerBinding";
import { CustomerSyncError, withCustomerSyncLock } from "./qboCustomerSync";
import { customerEditNeedsPush, markPending, writeCustomer } from "./qboCustomerWrites";
import { geocodeProperty } from "./propertyGeocoder";
import { logger } from "../lib/logger";

const site = z.object({
  gateCode: z.string().nullable().optional(), accessNotes: z.string().nullable().optional(),
  watchOutNotes: z.string().nullable().optional(), petStationCount: z.number().int().nonnegative().nullable().optional(),
  petStationLocations: z.string().nullable().optional(), irrigationControllerLocations: z.string().nullable().optional(),
  includeInRoute: z.boolean().optional(),
}).strict();
const contact = insertContactSchema.omit({ companyId: true, customerId: true }).extend({
  id: z.string().min(1).optional(), name: z.string().trim().min(1),
  emails: z.array(z.string().trim().email()).default([]),
}).strict();
export const setupEnvelope = z.object({
  customer: z.record(z.string(), z.unknown()), contacts: z.array(contact).default([]),
  siteNotes: site.default({}), qbo: z.object({ sendNow: z.boolean().default(false),
    linkQboId: z.string().min(1).optional() }).default({ sendNow: false }),
  expectedUpdatedAt: z.iso.datetime().optional(), deletedContactIds: z.array(z.string().min(1)).default([]),
}).strict();
export type SetupInput = z.infer<typeof setupEnvelope>;
const predicate = (companyId: string, id: string) => and(eq(customers.companyId, companyId), eq(customers.id, id));
export function setupBillingContext(tx: AppTransaction, companyId: string) {
  return {
    companyId,
    getCustomerById: async (id: string) => (await tx.select().from(customers).where(predicate(companyId, id)))[0],
    getPropertyManagementCompanyById: async (id: string) => (await tx.select().from(propertyManagementCompanies)
      .where(and(eq(propertyManagementCompanies.companyId, companyId), eq(propertyManagementCompanies.id, id))))[0],
  };
}
const provided = <T extends object>(parsed: T, raw: object) => Object.fromEntries(
  Object.entries(parsed).filter(([key]) => Object.hasOwn(raw, key)));

/** A linked manager's channels are intentional creation snapshots, not a new directory owner. */
export async function ensureManagerContact(customer: Customer) {
  if (!customer.propertyManagerId) return;
  const existing = await storage.getContactsByCustomerId(customer.id, customer.companyId);
  if (existing.some(c => c.propertyManagerId === customer.propertyManagerId)) return;
  const manager = await storage.getPropertyManagerWithContacts(customer.propertyManagerId, customer.companyId);
  if (!manager || manager.propertyManagementCompanyId !== customer.propertyManagementCompanyId)
    throw new CustomerSyncError(400, "PROPERTY_MANAGER_INVALID");
  await storage.createContact({ companyId: customer.companyId, customerId: customer.id,
    propertyManagerId: manager.id, name: manager.name, role: manager.title || "Property Manager",
    emails: manager.emails.length ? manager.emails.map(e => e.email) : manager.email ? [manager.email] : [],
    phones: manager.phones.length ? manager.phones.map(p => p.phone) : manager.phone ? [manager.phone] : [],
    isPrimary: "false", notes: null });
}

async function validateRelationships(tx: AppTransaction, companyId: string, c: Customer,
  edit?: NonNullable<Parameters<typeof billingInputProblem>[2]> & { previous: Customer }) {
  const ctx = setupBillingContext(tx, companyId);
  let parent: Customer | undefined;
  if (c.parentCustomerId) {
    parent = await ctx.getCustomerById(c.parentCustomerId);
    if (!parent || parent.id === c.id || parent.parentCustomerId || c.isParent === "true")
      throw new CustomerSyncError(400, "PARENT_INVALID");
    const children = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.parentCustomerId, c.id))).limit(1);
    if (children.length) throw new CustomerSyncError(400, "PARENT_INVALID");
    // Parent auto-mark is committed with the child, never before validation.
    parent = { ...parent, isParent: "true" };
  }
  if (c.propertyManagementCompanyId && !await ctx.getPropertyManagementCompanyById(c.propertyManagementCompanyId))
    throw new CustomerSyncError(400, "MANAGEMENT_COMPANY_INVALID");
  if (c.propertyManagerId) {
    const manager = await storage.getPropertyManagerById(c.propertyManagerId, companyId);
    if (!manager || !c.propertyManagementCompanyId || manager.propertyManagementCompanyId !== c.propertyManagementCompanyId)
      throw new CustomerSyncError(400, "PROPERTY_MANAGER_INVALID");
  }
  if (c.billingName) {
    try { validateDisplayName(c.billingName); } catch { throw new CustomerSyncError(400, "DISPLAY_NAME_INVALID"); }
  }
  if (c.billingEmails.join(",").length > 100) throw new CustomerSyncError(400, "BILLING_EMAILS_TOO_LONG");
  const effectiveContext = { ...ctx, getCustomerById: async (id: string) => id === parent?.id ? parent : ctx.getCustomerById(id) };
  if (c.status === "active" && edit?.previous.status !== "active") await assertActivationComplete(c, effectiveContext);
  // CQ1 requires complete custom addresses when supplied, even on prospects.
  const problem = await billingInputProblem(c, ctx, edit);
  if (problem && !billsThroughParent(c, parent)) throw new CustomerSyncError(400, problem);
  return parent;
}

/** Shared legacy + wizard create boundary. All local facts commit before any push. */
export async function saveCustomerSetup(companyId: string, actorId: string, input: SetupInput, id?: string) {
  if (protectedBillingWrite(input.customer)) throw new CustomerSyncError(400, "SYNC_METADATA_PROTECTED");
  const saved = await withCustomerSyncLock(companyId, tx => inTransaction(tx, async () => {
    const before = id ? (await tx.select().from(customers).where(predicate(companyId, id)).for("update"))[0] : undefined;
    if (id && !before) throw new CustomerSyncError(404, "CUSTOMER_NOT_FOUND");
    if (id && !input.expectedUpdatedAt) throw new CustomerSyncError(400, "EXPECTED_UPDATED_AT_REQUIRED");
    const raw = { ...input.customer, ...input.siteNotes };
    const parsed = before
      ? provided(insertCustomerSchema.partial().omit({ companyId: true }).parse(raw), raw)
      : insertCustomerSchema.parse({ ...raw, companyId });
    if (!before && !String(parsed.name ?? "").trim()) throw new CustomerSyncError(400, "NAME_REQUIRED");
    const effective = { ...before, ...parsed, companyId, id: id ?? "" } as Customer;
    if (before && Object.hasOwn(raw, "propertyManagementCompanyId")) {
      if (!effective.propertyManagementCompanyId) effective.propertyManagerId = null;
      else if (!Object.hasOwn(raw, "propertyManagerId") && effective.propertyManagerId) {
        const pm = await storage.getPropertyManagerById(effective.propertyManagerId, companyId);
        if (pm?.propertyManagementCompanyId !== effective.propertyManagementCompanyId) effective.propertyManagerId = null;
      }
      Object.assign(parsed, { propertyManagerId: effective.propertyManagerId });
    }
    const parent = await validateRelationships(tx, companyId, effective,
      before ? { provided: parsed, previous: before } : undefined);
    for (const row of input.contacts) {
      if (row.propertyManagerId) {
        const pm = await storage.getPropertyManagerById(row.propertyManagerId, companyId);
        if (!pm || pm.id !== effective.propertyManagerId) throw new CustomerSyncError(400, "PROPERTY_MANAGER_INVALID");
      }
      if (row.id && !before) throw new CustomerSyncError(400, "CONTACT_INVALID");
    }
    if (!before && input.deletedContactIds.length) throw new CustomerSyncError(400, "CONTACT_INVALID");
    const contactIds = [...input.contacts.flatMap(c => c.id ? [c.id] : []), ...input.deletedContactIds];
    if (new Set(contactIds).size !== contactIds.length) throw new CustomerSyncError(400, "CONTACT_INVALID");
    for (const contactId of contactIds) {
      const found = await storage.getContactById(contactId, companyId);
      if (!found || found.customerId !== id) throw new CustomerSyncError(400, "CONTACT_INVALID");
    }
    let customer: Customer;
    if (before) {
      const result = await writeCustomer(tx, id!, companyId, parsed, new Date(input.expectedUpdatedAt!));
      if (!result || "conflict" in result) throw new CustomerSyncError(409, "CUSTOMER_CONFLICT");
      customer = result;
    } else {
      [customer] = await tx.insert(customers).values(parsed as typeof customers.$inferInsert).returning();
    }
    if (parent && parent.isParent === "true") await tx.update(customers).set({ isParent: "true", updatedAt: new Date() })
      .where(predicate(companyId, parent.id));
    for (const contactId of input.deletedContactIds) await storage.deleteContact(contactId, companyId);
    const seenManagers = new Set<string>();
    const existingContacts = await storage.getContactsByCustomerId(customer.id, companyId);
    for (const row of input.contacts) {
      const { id: contactId, ...values } = row;
      if (row.propertyManagerId) {
        if (seenManagers.has(row.propertyManagerId)) throw new CustomerSyncError(400, "CONTACT_INVALID");
        seenManagers.add(row.propertyManagerId);
        if (!contactId && existingContacts.some(c => c.propertyManagerId === row.propertyManagerId)) continue;
      }
      if (contactId) await storage.updateContact(contactId, companyId, values);
      else await storage.createContact({ ...values, companyId, customerId: customer.id });
    }
    await ensureManagerContact(customer);
    const viaParent = billsThroughParent(customer, parent);
    if (input.qbo.linkQboId) {
      const binding = await bindCustomerLocked(tx, companyId, customer.id, input.qbo.linkQboId, actorId || undefined);
      if (binding.conflict || binding.notFound) throw new CustomerSyncError(409, "QBO_LINK_CONFLICT");
    } else if (!before) {
      const state = viaParent ? "via_parent" : customer.status === "active" || input.qbo.sendNow ? "pending_push" : "not_linked";
      await tx.update(customers).set({ qboSyncState: state }).where(predicate(companyId, customer.id));
    } else if (input.qbo.sendNow && !viaParent) {
      await tx.update(customers).set({ qboSyncState: "pending_push" }).where(predicate(companyId, customer.id));
    }
    if (!input.qbo.linkQboId && !viaParent && ((!before && customer.status === "active") || input.qbo.sendNow)) {
      // Pending state and the post-commit job are registered in the owner
      // transaction. Avoid a second job if writeCustomer already queued it.
      if (!before || !customerEditNeedsPush(before, customer)) await markPending(tx, customer);
    }
    return { customer: (await tx.select().from(customers).where(predicate(companyId, customer.id)))[0], viaParent };
  }));
  // Neither remote integration is awaited by create. Return committed local
  // facts promptly even when an external service stalls.
  if (!id && saved.customer.street && saved.customer.city && saved.customer.locationLat == null) {
    setImmediate(() => { void enrichLocation(saved.customer); });
  }
  return { customer: saved.customer, qbo: { state: saved.customer.qboSyncState } };
}

export { setupMissingFields };

async function enrichLocation(customer: Customer) {
  try {
    const location = await geocodeProperty([customer.street, customer.city, customer.state, customer.zip].join(", "));
    // Do not apply an old address lookup over a user's subsequent edit.
    if (location) await storage.updateCustomer(customer.id, customer.companyId,
      { locationLat: location.lat, locationLng: location.lng }, customer.updatedAt);
  } catch {
    logger.warn({ companyId: customer.companyId, customerId: customer.id }, "Customer geocoding unavailable");
  }
}
