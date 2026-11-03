import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";
import { canViewBilling, isBillingPerson, showBillingSidebar, type BillingAccessUser } from "@/lib/billing";
import type { Customer } from "@shared/schema";

/* CQ4 client contracts. Every value below is a server snapshot or mirror for display only;
   the CRM customer row stays the single owner of billing facts. */

export const REVIEW_KINDS = ["changed_in_qbo", "new_in_qbo", "sub_customer", "qbo_inactive", "qbo_removed", "name_taken", "push_failed"] as const;
export type ReviewKind = typeof REVIEW_KINDS[number];
export const KIND_LABELS: Record<ReviewKind, string> = {
  changed_in_qbo: "Changed in QuickBooks",
  new_in_qbo: "New in QuickBooks",
  sub_customer: "QuickBooks sub-customer",
  qbo_inactive: "Made inactive in QuickBooks",
  qbo_removed: "Removed or merged in QuickBooks",
  name_taken: "Name already used in QuickBooks",
  push_failed: "Couldn't update QuickBooks",
};
export const kindLabel = (k: string) => KIND_LABELS[k as ReviewKind] ?? k;

export interface QboAddr { street: string | null; street2?: string | null; city: string | null; state: string | null; zip: string | null }
/** Snapshot of normalized QuickBooks fields captured with the review. */
export interface QboSnapshot {
  displayName?: string | null; companyName?: string | null; contactName?: string | null;
  emails?: string[]; phone?: string | null; mobile?: string | null;
  billAddr?: QboAddr | null; shipAddr?: QboAddr | null; termId?: string | null;
  parentQboId?: string | null; billWithParent?: boolean; active?: boolean;
}
export interface ReviewField { crm: unknown; qbo: unknown; baseline: unknown; bothChanged: boolean }
export interface QboReview {
  id: string; companyId: string; customerId: string | null; qboId: string | null; kind: ReviewKind;
  fields: Record<string, ReviewField> | null; qboSnapshot: QboSnapshot | null; message: string | null;
  status: string; createdAt: string; updatedAt: string; customerName: string | null; qboName: string | null;
}
export interface ReviewOptions {
  customers: { id: string; name: string; parentCustomerId: string | null; qboCustomerId: string | null }[];
  quickbooks: { qboId: string; displayName: string; parentQboId: string | null; active: boolean }[];
}
export interface BillToResolved { name: string; lines: string[]; street: string | null; street2: string | null; city: string | null; state: string | null; zip: string | null }
export interface QuickBooksCard {
  termLabel?: string | null; termLookupError?: string | null;
  customer: Customer; effectiveCustomer: Customer; parent: Customer | null; billsThroughParent: boolean;
  billTo: BillToResolved | { problem: "BILL_TO_INCOMPLETE" }; billToModeLabel: string;
  managementCompanyName: string | null; linkedName: string | null; baselineAt: string | null;
  writeEnabled: boolean; reviews: Pick<QboReview, "id" | "kind">[];
}
export interface QboTerm { id: string; name: string }

export type ScopeUser = BillingAccessUser & { id?: string | null; activeCompanyId?: string | null; isSuperAdminBool?: boolean | null };
/** Company + viewer identity. Every CQ4 query key ends with this so no data crosses scopes. */
export const viewerScope = (u?: ScopeUser | null) =>
  [u?.activeCompanyId ?? null, u?.id ?? null, u?.activeRole ?? null, [...(u?.activeTags ?? [])].sort().join(",")] as const;
export const scopeKey = (u?: ScopeUser | null) => viewerScope(u).join("|");

export const reviewCountKey = (u?: ScopeUser | null) => ["/api/qbo/customer-reviews/count", ...viewerScope(u)] as const;
export const reviewListKey = (u?: ScopeUser | null) => ["/api/qbo/customer-reviews", "open", ...viewerScope(u)] as const;
export const reviewOptionsKey = (u?: ScopeUser | null) => ["/api/qbo/customer-review-options", ...viewerScope(u)] as const;
export const termsKey = (u?: ScopeUser | null) => ["/api/qbo/terms", ...viewerScope(u)] as const;
export const cardKey = (id: string, u?: ScopeUser | null) => ["/api/customers", id, "quickbooks-card", ...viewerScope(u)] as const;

/** Badge/count eligibility: the Invoicing sidebar, or the billing-tagged My Tickets alternate. */
export const reviewCountEligible = (u?: ScopeUser | null) =>
  !!u && (showBillingSidebar(u) || isBillingPerson(u));
/** Promotion and rename stay with the existing admin/office permission. */
export const canPromote = (u?: ScopeUser | null) => !!u && (u.activeRole === "admin" || u.activeRole === "office");

export async function qboJson<T>(method: string, url: string, companyId: string | null | undefined, body?: unknown): Promise<T> {
  const res = await apiRequest(method, url, body, { headers: companyId ? { "X-Company-Id": companyId } : {} });
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
export const errorText = (err: unknown, fallback = "Something went wrong. Try again.") =>
  extractApiErrorMessage(err) ?? fallback;
export const errorStatus = (err: unknown) => {
  const m = (err instanceof Error ? err.message : "").match(/^(\d{3}):/);
  return m ? Number(m[1]) : undefined;
};

/** Shared, deduplicated count used by every badge/link destination.
 *  Only the always-mounted sidebar passes poll=true, so a single timer owns refresh. */
export function useQboReviewCount({ poll = false }: { poll?: boolean } = {}) {
  const { user } = useAuth();
  const enabled = reviewCountEligible(user);
  const q = useQuery<{ open: number }>({
    queryKey: reviewCountKey(user),
    queryFn: () => qboJson("GET", "/api/qbo/customer-reviews/count", user?.activeCompanyId),
    enabled,
    staleTime: 30_000,
    refetchInterval: poll ? 60_000 : false,
  });
  return { count: enabled ? Number(q.data?.open ?? 0) : 0, enabled };
}

export function useQboReviews() {
  const { user } = useAuth();
  return useQuery<QboReview[]>({
    queryKey: reviewListKey(user),
    queryFn: () => qboJson("GET", "/api/qbo/customer-reviews?status=open", user?.activeCompanyId),
    enabled: canViewBilling(user),
    staleTime: 15_000,
  });
}

export function useReviewOptions(enabled: boolean) {
  const { user } = useAuth();
  return useQuery<ReviewOptions>({
    queryKey: reviewOptionsKey(user),
    queryFn: () => qboJson("GET", "/api/qbo/customer-review-options", user?.activeCompanyId),
    enabled: enabled && canViewBilling(user),
    staleTime: 60_000,
  });
}

export function useQboTerms() {
  const { user } = useAuth();
  return useQuery<QboTerm[]>({
    queryKey: termsKey(user),
    queryFn: () => qboJson("GET", "/api/qbo/terms", user?.activeCompanyId),
    enabled: canViewBilling(user),
    staleTime: 10 * 60_000,
  });
}

/** Refresh everything a review/card action can affect, within the current scope only. */
export function useQboInvalidate() {
  const qc = useQueryClient();
  return (customerIds: (string | null | undefined)[] = []) => {
    qc.invalidateQueries({ queryKey: ["/api/qbo/customer-reviews"] });
    qc.invalidateQueries({ queryKey: ["/api/qbo/customer-reviews/count"] });
    qc.invalidateQueries({ queryKey: ["/api/qbo/customer-review-options"] });
    // Prefix match covers legacy detail, list, children, parent-rollup and card keys.
    if (customerIds.some(Boolean)) qc.invalidateQueries({ queryKey: ["/api/customers"] });
    for (const k of ["/api/qbo/customers/mapping", "/api/qbo/customers/cache", "/api/qbo/customers/unbound-count"])
      qc.invalidateQueries({ queryKey: [k] });
  };
}

export type ResolveBody =
  | { choices: Record<string, "qbo" | "crm"> }
  | { action: string; customerId?: string; qboId?: string; confirmSeparate?: true };

export function useResolveReview() {
  const { user } = useAuth();
  const invalidate = useQboInvalidate();
  return useMutation({
    mutationFn: ({ review, body }: { review: QboReview; body: ResolveBody }) =>
      qboJson<{ ok?: boolean; stale?: boolean; message?: string }>("POST", `/api/qbo/customer-reviews/${encodeURIComponent(review.id)}/resolve`, user?.activeCompanyId, body),
    onSettled: (_d, _e, v) => invalidate([v.review.customerId, "customerId" in v.body ? v.body.customerId : null]),
  });
}

export const reviewHref = (reviewId?: string | null) =>
  `/dashboard/invoicing/quickbooks-review${reviewId ? `?review=${encodeURIComponent(reviewId)}` : ""}`;

export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(blank)";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(blank)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const a = v as QboAddr;
    if ("street" in a || "city" in a) return [a.street, a.street2, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" · ") || "(blank)";
    return JSON.stringify(v);
  }
  return String(v);
}
export const FIELD_LABELS: Record<string, string> = {
  displayName: "Billing name", companyName: "Company", contactName: "Contact", emails: "Billing emails",
  phone: "Phone", mobile: "Mobile", billAddr: "Bill-to address", shipAddr: "Service address", termId: "Terms",
  parentQboId: "Parent customer", billWithParent: "Bills with parent", active: "Active",
};
