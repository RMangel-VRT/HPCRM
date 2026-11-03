import { and, eq } from "drizzle-orm";
import { customers, qboCustomerCache, type Customer } from "@workspace/db";
import { bindCustomerLocked } from "./qboCustomerBinding";
import { CustomerSyncError, withCustomerSyncLock } from "./qboCustomerSync";

export type PromotionOverrides = { name?: string; street?: string; city?: string; state?: string; zip?: string };

/** Explicit prospect creation and shared link bookkeeping commit atomically. */
export function promoteQboCustomer(companyId: string, qboId: string, overrides: PromotionOverrides, actorId?: string):
  Promise<Customer | { conflict: boolean } | { missingFields: string[] }> {
  return withCustomerSyncLock(companyId, async tx => {
    const [cache] = await tx.select().from(qboCustomerCache).where(and(
      eq(qboCustomerCache.companyId, companyId), eq(qboCustomerCache.qboId, qboId)));
    if (!cache) return { missingFields: ["qboId not found in cache"] };
    const [existing] = await tx.select({ id: customers.id }).from(customers).where(and(
      eq(customers.companyId, companyId), eq(customers.qboCustomerId, qboId)));
    if (existing) return { conflict: true };
    if (cache.parentQboId)
      throw new CustomerSyncError(409, "Sub-customer creation requires the customer wizard. Link to a matching CRM branch instead.");
    const input = {
      name: overrides.name ?? cache.displayName, street: overrides.street ?? cache.billAddrLine1,
      city: overrides.city ?? cache.billAddrCity, state: overrides.state ?? cache.billAddrCountrySubDivisionCode,
      zip: overrides.zip ?? cache.billAddrPostalCode,
    };
    const missingFields = (["street", "city", "state", "zip"] as const).filter(k => !input[k]?.trim());
    if (missingFields.length) return { missingFields };
    const [created] = await tx.insert(customers).values({ companyId, name: input.name,
      street: input.street!, city: input.city!, state: input.state!, zip: input.zip!,
      status: "prospect", customerType: "commercial" }).returning();
    const result = await bindCustomerLocked(tx, companyId, created.id, qboId, actorId);
    if (result.conflict || result.notFound)
      throw new CustomerSyncError(409, "Customer could not be linked. Reload before trying again.");
    const [linked] = await tx.select().from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, created.id)));
    return linked;
  });
}
