import type { Customer, QboReviewFields } from "@workspace/db";
import { isDeepStrictEqual } from "node:util";
import { FIELD_KEYS, normalize, type FieldKey, type QboCustomerFields } from "./qboCustomerMap";
import { type Addr } from "./customerBilling";

// PostgreSQL jsonb may reorder address keys. Compare values, never serialization order.
export const equal = (a: unknown, b: unknown) => isDeepStrictEqual(a, b);
// Active has a dedicated lifecycle review, never a billing overwrite. All
// remaining mapped facts are CRM-owned, including live directory projections and
// parent billing policy. The caller excludes master-billed branches altogether.
export function ownedKeys(): FieldKey[] {
  return FIELD_KEYS.filter(k => k !== "active");
}
export function compareRemote(q: QboCustomerFields, c: QboCustomerFields,
  baseline: Partial<QboCustomerFields>, keys: FieldKey[]) {
  const nextBaseline = { ...baseline };
  const fields: QboReviewFields = {};
  for (const key of keys) {
    const b = baseline[key] ?? null;
    if (equal(q[key], b)) continue;
    if (equal(q[key], c[key])) Object.assign(nextBaseline, { [key]: q[key] });
    else fields[key] = { qbo: q[key], crm: c[key], baseline: b, bothChanged: !equal(c[key], b) };
  }
  return { fields, baseline: nextBaseline };
}
const empty = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
/** Initial hydration only: never used by ordinary mirror ingestion. */
export function initialBillingPatch(c: Customer, q: QboCustomerFields): Partial<Customer> {
  const patch: Partial<Customer> = {};
  const columns = { displayName: "billingName", companyName: "billingCompanyName", contactName: "billingContactName",
    emails: "billingEmails", phone: "billingPhone", mobile: "billingMobile", termId: "qboTermId" } as const;
  for (const [key, column] of Object.entries(columns)) {
    const value = q[key as keyof typeof columns];
    if (empty(c[column as keyof Customer]) && !empty(value)) Object.assign(patch, { [column]: value });
  }
  const property: Addr = { street: c.street, street2: null, city: c.city, state: c.state, zip: c.zip };
  const propertyNormalized = normalize({ ...q, billAddr: property }).billAddr;
  // A default property mode with no captured custom fields is the only empty
  // address slot. Explicit custom/management choices are never replaced.
  if (c.billToMode === "property" && q.billAddr && !equal(q.billAddr, propertyNormalized) &&
    [c.billStreet, c.billStreet2, c.billCity, c.billState, c.billZip].every(empty)) {
    Object.assign(patch, { billToMode: "custom", billStreet: q.billAddr.street, billStreet2: q.billAddr.street2,
      billCity: q.billAddr.city, billState: q.billAddr.state, billZip: q.billAddr.zip });
  } else if (c.billToMode === "custom" && q.billAddr) {
    const addrColumns = { street: "billStreet", street2: "billStreet2", city: "billCity", state: "billState", zip: "billZip" } as const;
    for (const [key, column] of Object.entries(addrColumns)) {
      if (empty(c[column as keyof Customer])) Object.assign(patch, { [column]: q.billAddr[key as keyof Addr] });
    }
  }
  return patch;
}
