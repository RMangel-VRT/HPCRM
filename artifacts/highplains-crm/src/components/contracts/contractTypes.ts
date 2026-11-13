export type AgreementLine = "landscape" | "snow" | "both";
export type BoardLine = "landscape" | "snow";
export type AgreementForm = "ours" | "theirs";
export interface RenewalSetInfo { firstTermId: string; firstSeason: string; lastSeason: string; year: number; length: number }

import type { NonRenewalFacts } from "../../../../../lib/db/src/contractNonRenewal";
import type { ContractProjection } from "../../../../../lib/db/src/contractAttention";
/** CC-ATTN: server-owned classification. Optional only so older payloads still render (missing state = unclassified). */
export type ProjectionFields = Partial<ContractProjection>;
export interface TermSummary extends NonRenewalFacts {
  id: string;
  seasonLabel: string;
  startDate: string;
  endDate: string;
  status: string;
  displayStatus: string;
  annualPriceCents: number | null;
  snowPricing: string | null;
  snowFlatPriceCents?: number | null;
  needsReview: boolean;
  signedAt?: string | null;
  managingAgentName?: string | null;
  billingType?: string | null;
  /** Each season records its own line and form (CC2-9). */
  line?: AgreementLine;
  form?: AgreementForm;
}

export interface ContractListItem extends ProjectionFields {
  /** CC-ATTN: lines this agreement is accounted on (server-owned). Empty/unknown histories carry both. */
  applicableLines?: BoardLine[];
  id: string;
  customerId: string;
  customerName: string;
  viaParent?: boolean;
  parentName?: string;
  locationCount?: number;
  branch?: { name: string; billingCode: string | null };
  payments?: { component: string; months: { month: number; amountCents: number }[]; fee?: boolean }[];
  line: AgreementLine;
  form: "ours" | "theirs";
  current: TermSummary | null;
  stateTerm?: TermSummary | null;
  renewalDraft: TermSummary | null;
  latest?: TermSummary | null;
  recentSigned?: TermSummary | null;
  renewalSource?: TermSummary | null;
  notRenewing?: boolean;
  canRecordNonRenewal?: boolean;
  renewalProgress?: { due: boolean; signed: boolean; notRenewing?: boolean };
  renewalDue: boolean;
  companyDay?: string;
}

export interface TermScopeRow {
  id?: string; serviceKey: string; line: string; included: boolean; quantity: number | null; unit: string | null;
  monthSpread: number[] | null; details: Record<string, unknown> | null; priceCents: number | null; notes: string | null;
}
export interface TermRateRow {
  id?: string; rateKey: string; line: string; category: string; label: string; priceCents: number | null;
  priceText: string | null; unit: string; minimum: string | null; cardPriceCents: number | null; cardPriceText: string | null;
}
export interface TermBillingRow { component: string; month: string; amountCents: number; isFee?: boolean }
export interface TermDocument {
  id: string; kind: string; version: number; filename: string; storageObjectPath: string; mimeType: string;
  fileSize: number | null; createdAt: string; uploadedByName?: string | null;
  coversThroughTermId?: string | null;
  fromTermId?: string; fromSeasonLabel?: string;
}
export interface TermHistoryRow {
  id: string; oldStatus: string | null; newStatus: string; note: string | null; createdAt: string; changedByName?: string | null;
}
export interface DetailTerm extends TermSummary {
  bidTicketId?: string | null;
  agreementId?: string;
  legalName?: string | null; projectContact?: string | null; contactPhone?: string | null; contactEmail?: string | null;
  projectAddress?: string | null; snowTriggers?: string | null; po?: string | null; notes?: string | null;
  reviewNote?: string | null; renewedFromTermId?: string | null;
  allowedMoves?: string[]; editable?: boolean;
  renewalSet?: RenewalSetInfo | null;
  /** CC2-18: computed on read. */
  paymentSchedule?: "pattern" | "explicit";
  feesAnnualCents?: number | null;
  contractTotalCents?: number | null;
  durationMonths?: number;
  scope: TermScopeRow[]; rates: TermRateRow[]; billingMonths: TermBillingRow[];
  documents: TermDocument[]; coveredBy?: TermDocument[]; history: TermHistoryRow[];
}
export interface ContractDetail extends ProjectionFields {
  renewalSourceId?: string | null;
  canRecordNonRenewal?: boolean;
  canUndoNonRenewal?: boolean;
  notRenewing?: boolean;
  otherOpenLines?: number;
  companyDay?: string;
  id: string; customerId: string; line: AgreementLine; form: "ours" | "theirs";
  customer: { id: string; name: string };
  currentTermId?: string | null; renewalDue?: boolean; renewalDraftId?: string | null;
  terms: DetailTerm[];
}

/** A season's own line and form, falling back to the contract's derived values for older payloads. */
export const termLine = (t: { line?: AgreementLine } | null | undefined, fallback: AgreementLine): AgreementLine => t?.line ?? fallback;
export const termForm = (t: { form?: AgreementForm } | null | undefined, fallback: AgreementForm): AgreementForm => t?.form ?? fallback;
/** Later years of a multi-year renewal follow year 1 for status and signed documents. */
export const isLaterYear = (t: { renewalSet?: RenewalSetInfo | null }) => !!t.renewalSet && t.renewalSet.year > 1;
/** Mirrors the server's selectRenewalSource: the last eligible season, not the displayed current one. */
export function selectRenewalSource<T extends { id: string; status: string; startDate: string; renewedFromTermId?: string | null }>(terms: T[]): T | undefined {
  return [...terms].filter(t => t.status !== "cancelled" && !(t.renewedFromTermId && ["draft", "sent", "lost"].includes(t.status)))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0];
}
