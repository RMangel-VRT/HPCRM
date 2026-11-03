import { and, eq, count } from "drizzle-orm";
import { z } from "zod";
import { customers, qboCustomerCache, qboCustomerReviews, type Customer } from "@workspace/db";
import { db } from "../db";
import { bindCustomerLocked, unlinkCustomerLocked } from "./qboCustomerBinding";
import { equal, ownedKeys } from "./qboCustomerComparison";
import { normalize, qboToFields, type FieldKey, type QboCustomerFields } from "./qboCustomerMap";
import { fetchQboCustomer, lockedCustomer, queueCustomerPush } from "./qboCustomerPush";
import { CustomerSyncError, ingestQboCustomers, withCustomerSyncLock } from "./qboCustomerSync";
import { afterCustomerEdit, markPending } from "./qboCustomerWrites";
import { completeAddress, type Addr } from "./customerBilling";

export async function listCustomerReviews(companyId: string, status: "open" | "resolved" | "dismissed") {
  return db.select({ review: qboCustomerReviews, customerName: customers.name, qboName: qboCustomerCache.displayName })
    .from(qboCustomerReviews)
    .leftJoin(customers, and(eq(customers.companyId, companyId), eq(customers.id, qboCustomerReviews.customerId)))
    .leftJoin(qboCustomerCache, and(eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, qboCustomerReviews.qboId)))
    .where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.status, status)))
    .then(rows => rows.map(({ review, ...names }) => ({ ...review, ...names })));
}
export async function countCustomerReviews(companyId: string) {
  const [row] = await db.select({ open: count() }).from(qboCustomerReviews)
    .where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.status, "open")));
  return { open: row.open };
}
const actionSchema = z.object({ action: z.string(), customerId: z.string().min(1).optional(),
  qboId: z.string().min(1).optional(), confirmSeparate: z.boolean().optional(), expectedUpdatedAt: z.string().datetime().optional() }).strict();
const choicesSchema = z.object({ choices: z.record(z.string(), z.enum(["qbo", "crm"])),
  expectedUpdatedAt: z.string().datetime().optional() }).strict();
const columns = { displayName: "billingName", companyName: "billingCompanyName", contactName: "billingContactName",
  emails: "billingEmails", phone: "billingPhone", mobile: "billingMobile", termId: "qboTermId" } as const;
export async function resolveCustomerReview(companyId: string, reviewId: string, actorId: string, body: unknown) {
  return withCustomerSyncLock(companyId, async tx => {
    const predicate = and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.id, reviewId));
    const [review] = await tx.select().from(qboCustomerReviews).where(predicate).for("update");
    if (!review) throw new CustomerSyncError(404, "QuickBooks review not found");
    if (review.status !== "open") throw new CustomerSyncError(409, "Review is already closed");
    const input = (review.kind === "changed_in_qbo" ? choicesSchema : actionSchema).parse(body);
    if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== review.updatedAt.getTime())
      throw new CustomerSyncError(409, "Review changed; reload before resolving");
    const c = review.customerId ? await lockedCustomer(tx, companyId, review.customerId) : undefined;
    let resolution: string, dismissed = false, prefill: unknown;
    if ("choices" in input) {
      if (!c || !review.qboId || c.qboCustomerId !== review.qboId) throw new CustomerSyncError(409, "Review binding changed");
      const keys = Object.keys(review.fields ?? {});
      if (!keys.length || keys.some(k => !ownedKeys().includes(k as FieldKey)) ||
        !equal([...keys].sort(), Object.keys(input.choices).sort()))
        throw new CustomerSyncError(400, "Choose qbo or crm for every reviewed field, and no other fields");
      // Fetch + ingest before deciding. A changed remote review is committed and
      // returned as stale, never resolved against an older snapshot/token.
      const raw = await fetchQboCustomer(companyId, review.qboId);
      await ingestQboCustomers(companyId, [raw]);
      const [freshReview] = await tx.select().from(qboCustomerReviews).where(predicate);
      const q = normalize(qboToFields(raw));
      if (!equal(review.fields, freshReview.fields) || keys.some(k => !equal(review.fields![k].qbo, q[k as FieldKey])))
        return { stale: true, message: "QuickBooks values changed; reload the review" };
      const patch: Partial<Customer> = {};
      for (const key of keys) if (input.choices[key] === "qbo") {
        if (key in columns) Object.assign(patch, { [columns[key as keyof typeof columns]]: q[key as FieldKey] });
        else if (key === "billAddr") {
          const addr = q.billAddr;
          if (!addr || !completeAddress(addr)) throw new CustomerSyncError(400, "QuickBooks billing address is incomplete; keep CRM instead");
          Object.assign(patch, { billToMode: "custom", billStreet: addr.street, billStreet2: addr.street2,
            billCity: addr.city, billState: addr.state, billZip: addr.zip });
        } else if (key === "shipAddr") {
          const addr = q.shipAddr as Addr | null;
          if (!addr || !completeAddress(addr)) throw new CustomerSyncError(400, "QuickBooks service address is incomplete; keep CRM instead");
          Object.assign(patch, { street: addr.street!, city: addr.city!, state: addr.state!, zip: addr.zip! });
        } else if (key === "parentQboId") {
          if (q.parentQboId) {
            const [parent] = await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.qboCustomerId, q.parentQboId)));
            if (!parent || parent.id === c.id || parent.parentCustomerId || parent.branchBillingMode !== "separate")
              throw new CustomerSyncError(409, "Link a separate-billing parent in CRM first");
            patch.parentCustomerId = parent.id;
          } else patch.parentCustomerId = null;
        } else if (key === "billWithParent" && q.billWithParent)
          throw new CustomerSyncError(409, "Master billing cannot retain a linked branch; keep CRM or unlink the branch first");
      }
      const refreshed = await lockedCustomer(tx, companyId, c.id);
      const nextBaseline = { ...(refreshed.qboBaseline as object ?? {}) };
      for (const k of keys) Object.assign(nextBaseline, { [k]: q[k as FieldKey] });
      await tx.update(customers).set({ ...patch, qboBaseline: nextBaseline, qboSyncToken: qboToFields(raw).syncToken,
        qboSyncState: "pending_push", updatedAt: new Date() }).where(and(eq(customers.companyId, companyId), eq(customers.id, c.id)));
      queueCustomerPush(companyId, c.id);
      resolution = JSON.stringify(input.choices);
    } else {
      const action = input.action;
      const allowed: Record<string, string[]> = {
        new_in_qbo: ["promote", "link", "ignore"], sub_customer: ["promote", "link", "ignore"],
        qbo_inactive: ["set_crm_inactive", "ignore"], name_taken: ["link", "renamed"],
        push_failed: ["retry", "dismiss"], qbo_removed: ["link", "unlink", "dismiss"],
        changed_in_qbo: [],
      };
      if (!allowed[review.kind].includes(action)) throw new CustomerSyncError(400, "Invalid action for this review kind");
      if (input.customerId && !(["new_in_qbo", "sub_customer"].includes(review.kind) && action === "link"))
        throw new CustomerSyncError(400, "customerId is not valid for this action");
      if (input.qboId && !(review.kind === "qbo_removed" && action === "link"))
        throw new CustomerSyncError(400, "qboId is not valid for this action");
      if (action === "link") {
        if (review.kind === "qbo_removed" && (!c || c.qboCustomerId !== review.qboId))
          throw new CustomerSyncError(409, "Review binding changed");
        const qboId = review.kind === "qbo_removed" ? input.qboId : review.qboId;
        const customerId = ["new_in_qbo", "sub_customer"].includes(review.kind) ? input.customerId : c?.id;
        if (!qboId || !customerId) throw new CustomerSyncError(400, "A valid customer and QuickBooks Id are required");
        // Validate company membership before any remote read. IDs are realm-local.
        const [cached] = await tx.select().from(qboCustomerCache).where(and(eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, qboId)));
        const target = await lockedCustomer(tx, companyId, customerId);
        if (!cached || !target) throw new CustomerSyncError(404, "Customer not found in this company");
        if (review.kind === "qbo_removed" && qboId === review.qboId)
          throw new CustomerSyncError(400, "Select a surviving QuickBooks customer");
        const raw = await fetchQboCustomer(companyId, qboId);
        await ingestQboCustomers(companyId, [raw]);
        if (target.parentCustomerId) {
          const parent = await lockedCustomer(tx, companyId, target.parentCustomerId);
          if (!parent || String((raw.ParentRef as { value?: string } | undefined)?.value ?? "") !== parent.qboCustomerId)
            throw new CustomerSyncError(409, "QuickBooks and CRM parent bindings must match");
          if (parent.branchBillingMode !== "separate") {
            if (review.kind !== "sub_customer" || input.confirmSeparate !== true)
              throw new CustomerSyncError(409, "Confirm separate branch billing before linking");
            const [updated] = await tx.update(customers).set({ branchBillingMode: "separate", updatedAt: new Date() })
              .where(and(eq(customers.companyId, companyId), eq(customers.id, parent.id))).returning();
            await afterCustomerEdit(tx, parent, updated);
          }
        } else if (raw.ParentRef) throw new CustomerSyncError(409, "Select a CRM branch with the matching parent");
        const result = await bindCustomerLocked(tx, companyId, customerId, qboId);
        if (result.conflict) throw new CustomerSyncError(409, "QuickBooks customer is already bound to another CRM customer");
        if (result.notFound) throw new CustomerSyncError(404, "Customer not found");
      } else if (action === "unlink") {
        if (!c || c.qboCustomerId !== review.qboId) throw new CustomerSyncError(409, "Review binding changed");
        await unlinkCustomerLocked(tx, companyId, c.id);
      } else if (action === "promote") {
        const [cached] = await tx.select().from(qboCustomerCache).where(and(eq(qboCustomerCache.companyId, companyId),
          eq(qboCustomerCache.qboId, review.qboId!)));
        if (!cached) throw new CustomerSyncError(404, "QuickBooks customer not found");
        // Wizard input is explicitly a prefill snapshot, not a customer creation.
        prefill = { qboId: cached.qboId, fields: cached.normalized, parentQboId: cached.parentQboId };
      } else if (action === "set_crm_inactive") {
        if (!c || c.qboCustomerId !== review.qboId) throw new CustomerSyncError(409, "Review binding changed");
        await tx.update(customers).set({ status: "inactive", updatedAt: new Date() })
          .where(and(eq(customers.companyId, companyId), eq(customers.id, c.id)));
      } else if (action === "renamed" || action === "retry") {
        if (!c) throw new CustomerSyncError(404, "CRM customer not found");
        if (action === "retry" && review.qboId && c.qboCustomerId !== review.qboId)
          throw new CustomerSyncError(409, "Review binding changed");
        if (action === "renamed" && (c.billingName ?? c.name).trim().toLowerCase() ===
          String((review.qboSnapshot as Partial<QboCustomerFields> | null)?.displayName ?? "").trim().toLowerCase())
          throw new CustomerSyncError(400, "Rename the CRM billing name before retrying");
        // A stale push_failed cannot reactivate an intentionally unlinked record.
        if (c.qboSyncState === "not_linked") throw new CustomerSyncError(409, "Customer was unlinked; use Send to QuickBooks now");
        await markPending(tx, c);
      } else dismissed = true;
      resolution = action;
    }
    await tx.update(qboCustomerReviews).set({ status: dismissed ? "dismissed" : "resolved", resolution,
      resolvedById: actorId, resolvedAt: new Date(), updatedAt: new Date() }).where(predicate);
    return { ok: true, ...(prefill ? { prefill } : {}) };
  });
}
