import type { Customer } from "@workspace/db";
import { billsThroughParent, type Addr, type BillingCustomer, type BillTo } from "./customerBilling";

export type QboCustomerFields = {
  displayName: string | null; companyName: string | null; contactName: string | null;
  emails: string[]; phone: string | null; mobile: string | null;
  billAddr: Addr | null; shipAddr: Addr | null; termId: string | null;
  parentQboId: string | null; billWithParent: boolean; active: boolean;
};
export type FieldKey = keyof QboCustomerFields;
export const FIELD_KEYS: FieldKey[] = ["displayName", "companyName", "contactName", "emails", "phone", "mobile", "billAddr", "shipAddr", "termId", "parentQboId", "billWithParent", "active"];
type MapCustomer = BillingCustomer & Pick<Customer,
  "billingCompanyName" | "billingContactName" | "billingEmails" | "billingPhone" |
  "billingMobile" | "qboTermId" | "status" | "qboCustomerId">;

export function crmToQboFields(customer: MapCustomer, billTo: BillTo, parent?: MapCustomer): QboCustomerFields {
  if (billsThroughParent(customer, parent)) throw new Error("BILLS_THROUGH_PARENT");
  if (customer.parentCustomerId && (!parent || parent.id !== customer.parentCustomerId || parent.companyId !== customer.companyId)) {
    throw new Error("PARENT_INVALID");
  }
  return {
    displayName: customer.billingName ?? customer.name,
    companyName: customer.billingCompanyName, contactName: customer.billingContactName,
    emails: customer.billingEmails, phone: customer.billingPhone, mobile: customer.billingMobile,
    billAddr: addressOnly(billTo),
    shipAddr: { street: customer.street, street2: null, city: customer.city, state: customer.state, zip: customer.zip },
    termId: customer.qboTermId,
    parentQboId: parent?.isParent === "true" && parent.branchBillingMode === "separate" ? parent.qboCustomerId : null,
    billWithParent: false, active: customer.status !== "inactive",
  };
}

const text = (v: unknown): string | null => typeof v === "string" ? v.trim().replace(/\s+/g, " ") || null : null;
const digits = (v: string | null) => v?.replace(/\D/g, "") || null;
const addressOnly = (a: Addr): Addr => ({ street: a.street, street2: a.street2, city: a.city, state: a.state, zip: a.zip });
function normalizeAddr(a: Addr | null): Addr | null {
  if (!a) return null;
  const original = typeof a.zip === "string" ? a.zip.trim().toUpperCase() || null : null;
  const numeric = digits(original);
  const zip = numeric && [5, 9].includes(numeric.length) ? numeric : original;
  const result = { street: text(a.street), street2: text(a.street2), city: text(a.city), state: text(a.state)?.toUpperCase() ?? null, zip };
  return Object.values(result).some(Boolean) ? result : null;
}
export function normalize(f: QboCustomerFields): QboCustomerFields {
  return {
    displayName: text(f.displayName), companyName: text(f.companyName), contactName: text(f.contactName),
    emails: [...new Set(f.emails.map(e => e.trim().toLowerCase()).filter(Boolean))].sort(),
    phone: digits(f.phone), mobile: digits(f.mobile), billAddr: normalizeAddr(f.billAddr),
    shipAddr: normalizeAddr(f.shipAddr), termId: text(f.termId), parentQboId: text(f.parentQboId),
    billWithParent: f.billWithParent, active: f.active,
  };
}

type Raw = Record<string, unknown>;
const object = (v: unknown): Raw => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Raw : {};
function parseAddr(v: unknown): Addr | null {
  if (!v) return null;
  const a = object(v);
  return { street: text(a.Line1), street2: text(a.Line2), city: text(a.City), state: text(a.CountrySubDivisionCode), zip: text(a.PostalCode) };
}
/** Metadata stays outside the comparable keys and is never sent as commercial fields. */
export function qboToFields(record: unknown): QboCustomerFields & {
  id: string | null; syncToken: string | null; createdAt: string | null; updatedAt: string | null; job: boolean;
} {
  const r = object(record), meta = object(r.MetaData);
  return {
    displayName: text(r.DisplayName), companyName: text(r.CompanyName),
    contactName: text([text(r.GivenName), text(r.FamilyName)].filter(Boolean).join(" ")),
    emails: (text(object(r.PrimaryEmailAddr).Address) ?? "").split(/[,;]/).map(e => e.trim()).filter(Boolean),
    phone: text(object(r.PrimaryPhone).FreeFormNumber), mobile: text(object(r.Mobile).FreeFormNumber),
    billAddr: parseAddr(r.BillAddr), shipAddr: parseAddr(r.ShipAddr),
    termId: text(object(r.SalesTermRef).value), parentQboId: text(object(r.ParentRef).value),
    billWithParent: r.BillWithParent === true, active: r.Active !== false, job: r.Job === true,
    id: text(r.Id), syncToken: text(r.SyncToken), createdAt: text(meta.CreateTime), updatedAt: text(meta.LastUpdatedTime),
  };
}
export function diffFields(a: QboCustomerFields, b: QboCustomerFields): FieldKey[] {
  const left = normalize(a), right = normalize(b);
  return FIELD_KEYS.filter(key => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}
export function validateDisplayName(name: string | null): void {
  if (!name?.trim() || name.includes(":") || name.length > 500) throw new Error("DISPLAY_NAME_INVALID");
}
const qboAddr = (a: Addr | null) => a ? {
  Line1: a.street ?? "", Line2: a.street2 ?? "", City: a.city ?? "",
  CountrySubDivisionCode: a.state ?? "", PostalCode: a.zip ?? "",
} : { Line1: "", Line2: "", City: "", CountrySubDivisionCode: "", PostalCode: "" };

/** Pure payload contract only. No remote writes or operational gating in CQ1. */
export function toQboPayload(fields: QboCustomerFields, options: {
  create: boolean; syncToken?: string; id?: string; onlyKeys?: readonly FieldKey[];
}): Raw {
  if (!options.create && (!options.id || options.syncToken == null)) throw new Error("QBO_UPDATE_IDENTITY_REQUIRED");
  if (!options.create && !options.onlyKeys) throw new Error("QBO_UPDATE_KEYS_REQUIRED");
  const out: Raw = options.create ? { PreferredDeliveryMethod: "None" } : { sparse: true, Id: options.id, SyncToken: options.syncToken };
  const keys = options.create ? FIELD_KEYS : options.onlyKeys!;
  for (const key of keys) {
    switch (key) {
      case "displayName": validateDisplayName(fields.displayName); out.DisplayName = fields.displayName; break;
      case "companyName": out.CompanyName = fields.companyName ?? ""; break;
      case "contactName": {
        const name = text(fields.contactName) ?? "", split = name.lastIndexOf(" ");
        out.GivenName = split < 0 ? name : name.slice(0, split);
        out.FamilyName = split < 0 ? "" : name.slice(split + 1);
        break;
      }
      case "emails": {
        const joined = fields.emails.join(",");
        if (joined.length > 100) throw new Error("EMAILS_TOO_LONG");
        out.PrimaryEmailAddr = { Address: joined }; break;
      }
      case "phone": out.PrimaryPhone = { FreeFormNumber: fields.phone ?? "" }; break;
      case "mobile": out.Mobile = { FreeFormNumber: fields.mobile ?? "" }; break;
      case "billAddr": out.BillAddr = qboAddr(fields.billAddr); break;
      case "shipAddr": out.ShipAddr = qboAddr(fields.shipAddr); break;
      case "termId":
        if (!options.create || fields.termId) out.SalesTermRef = { value: fields.termId ?? "" };
        break;
      case "parentQboId":
        if (!options.create || fields.parentQboId) out.ParentRef = { value: fields.parentQboId ?? "" };
        out.Job = !!fields.parentQboId; break;
      case "billWithParent": out.BillWithParent = fields.billWithParent; break;
      // A pure representation only: later push integration must never send Active:false.
      case "active": out.Active = fields.active; break;
      default: throw new Error("QBO_FIELD_INVALID");
    }
  }
  return out;
}
