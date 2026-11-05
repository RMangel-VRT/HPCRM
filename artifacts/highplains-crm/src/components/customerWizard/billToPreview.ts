/* Live, unsaved bill-to preview. Uses the same pure resolver as the server and the QuickBooks card,
   fed with company-scoped directory rows the page already loaded. No second billing rule lives here. */
import { useEffect, useRef, useState } from "react";
import { billsThroughParent, resolveBillTo } from "@workspace/customer-billing";
import type { BillingCustomer, BillingManagementCompany, BillTo, BillingProblem } from "@workspace/customer-billing";
import { displayNameProblem, type MissingField, type PmCompany, type WizardDraft } from "./wizardModel";

/** Parent rows as returned by the customer list (full customer rows). */
export interface ParentRow {
  id: string; name: string; companyId?: string; street?: string | null; city?: string | null; state?: string | null; zip?: string | null;
  billingName?: string | null; billingEmails?: string[] | null; billToMode?: string | null;
  billStreet?: string | null; billStreet2?: string | null; billCity?: string | null; billState?: string | null; billZip?: string | null;
  parentCustomerId?: string | null; isParent?: string | boolean | null; branchBillingMode?: string | null; propertyManagementCompanyId?: string | null;
}

const n = (v: unknown) => (v === undefined || v === null ? null : String(v));

export function draftToBilling(d: WizardDraft, id: string, companyId: string, rawBillingName: string | null): BillingCustomer {
  return {
    id, companyId, name: d.name.trim(), street: d.street, city: d.city, state: d.state, zip: d.zip,
    billingName: d.billingNameTouched ? (d.billingName.trim() || null) : rawBillingName,
    billToMode: d.billToMode, billStreet: d.billStreet, billStreet2: d.billStreet2, billCity: d.billCity, billState: d.billState, billZip: d.billZip,
    parentCustomerId: d.parentCustomerId, isParent: d.isParent ? "true" : "false",
    branchBillingMode: d.isParent ? d.branchBillingMode : null, propertyManagementCompanyId: d.billToMode === "management_company" || d.propertyManagementCompanyId ? d.propertyManagementCompanyId : null,
  };
}

export function parentToBilling(p: ParentRow, companyId: string): BillingCustomer {
  return {
    id: p.id, companyId: p.companyId ?? companyId, name: p.name, street: n(p.street) ?? "", city: n(p.city) ?? "", state: n(p.state) ?? "", zip: n(p.zip) ?? "",
    billingName: n(p.billingName), billToMode: n(p.billToMode), billStreet: n(p.billStreet), billStreet2: n(p.billStreet2), billCity: n(p.billCity),
    billState: n(p.billState), billZip: n(p.billZip), parentCustomerId: n(p.parentCustomerId),
    // Saving a branch marks its parent as a parent in the same transaction (server effective context).
    isParent: "true", branchBillingMode: n(p.branchBillingMode), propertyManagementCompanyId: n(p.propertyManagementCompanyId),
  };
}

export type Preview = { state: "loading" } | { state: "ok"; billTo: BillTo; viaParent: ParentRow | null } | { state: "incomplete"; viaParent: ParentRow | null };

export interface PreviewInput {
  draft: WizardDraft; id: string; companyId: string; rawBillingName: string | null;
  parents: ParentRow[]; pmCompanies: PmCompany[]; ready: boolean;
}

/** Sequence-guarded so a slower older resolution never replaces a newer one. */
export function useBillToPreview({ draft, id, companyId, rawBillingName, parents, pmCompanies, ready }: PreviewInput): Preview {
  const [out, setOut] = useState<Preview>({ state: "loading" });
  const seq = useRef(0);
  const selectedParent = parents.find(p => p.id === draft.parentCustomerId);
  const key = JSON.stringify([draft.name, draft.street, draft.city, draft.state, draft.zip, draft.billingName, draft.billingNameTouched, draft.billToMode,
    draft.billStreet, draft.billStreet2, draft.billCity, draft.billState, draft.billZip, draft.parentCustomerId, draft.isParent, draft.branchBillingMode,
    draft.propertyManagementCompanyId, rawBillingName, companyId, ready, selectedParent,
    pmCompanies.find(p => p.id === draft.propertyManagementCompanyId),
    pmCompanies.find(p => p.id === selectedParent?.propertyManagementCompanyId)]);
  useEffect(() => {
    if (!ready) return;
    const my = ++seq.current;
    const me = draftToBilling(draft, id, companyId, rawBillingName);
    const parentRow = draft.parentCustomerId ? parents.find(p => p.id === draft.parentCustomerId) ?? null : null;
    const parent = parentRow ? parentToBilling(parentRow, companyId) : undefined;
    const via = billsThroughParent(me, parent) ? parentRow : null;
    void resolveBillTo(me, {
      companyId,
      getCustomerById: async cid => {
        const row = parents.find(p => p.id === cid);
        if (!row) return undefined;
        const b = parentToBilling(row, companyId);
        return cid === draft.parentCustomerId ? b : { ...b, isParent: row.isParent === true || row.isParent === "true" ? "true" : "false" };
      },
      getPropertyManagementCompanyById: async pid => {
        const pm = pmCompanies.find(p => p.id === pid);
        return pm ? { id: pm.id, companyId, name: pm.name, street: n(pm.street), city: n(pm.city), state: n(pm.state), zip: n(pm.zip) } as BillingManagementCompany : undefined;
      },
    }).then((r: BillTo | BillingProblem) => {
      if (my !== seq.current) return;
      setOut("problem" in r ? { state: "incomplete", viaParent: via } : { state: "ok", billTo: r, viaParent: via });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ready ? out : { state: "loading" };
}

/** Live mirror of the server's setupMissingFields, using the parent's billing facts when master-billed. */
export function liveMissing(d: WizardDraft, rawBillingName: string | null, preview: Preview): MissingField[] {
  const out: MissingField[] = [];
  for (const k of ["street", "city", "state", "zip"] as const) if (!d[k].trim()) out.push(k);
  const via = preview.state !== "loading" ? preview.viaParent : null;
  const name = via ? via.billingName ?? "" : d.billingNameTouched ? d.billingName : rawBillingName ?? "";
  if (displayNameProblem(name ?? "")) out.push("billingName");
  const emails = via ? via.billingEmails ?? [] : d.billingEmails;
  if (!emails.length || emails.join(",").length > 100 || emails.some(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) out.push("billingEmails");
  if (preview.state === "incomplete") out.push("billTo");
  return out;
}
