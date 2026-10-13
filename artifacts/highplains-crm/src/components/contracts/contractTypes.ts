export type AgreementLine = "landscape" | "snow" | "both";
export type BoardLine = "landscape" | "snow";

export interface TermSummary {
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
}

export interface ContractListItem {
  id: string;
  customerId: string;
  customerName: string;
  line: AgreementLine;
  form: "ours" | "theirs";
  current: TermSummary | null;
  renewalDraft: TermSummary | null;
  latest?: TermSummary | null;
  recentSigned?: TermSummary | null;
  renewalProgress?: { due: boolean; signed: boolean };
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
export interface TermBillingRow { component: string; month: string; amountCents: number }
export interface TermDocument {
  id: string; kind: string; version: number; filename: string; storageObjectPath: string; mimeType: string;
  fileSize: number | null; createdAt: string; uploadedByName?: string | null;
}
export interface TermHistoryRow {
  id: string; oldStatus: string | null; newStatus: string; note: string | null; createdAt: string; changedByName?: string | null;
}
export interface DetailTerm extends TermSummary {
  agreementId?: string;
  legalName?: string | null; projectContact?: string | null; contactPhone?: string | null; contactEmail?: string | null;
  projectAddress?: string | null; snowTriggers?: string | null; po?: string | null; notes?: string | null;
  reviewNote?: string | null; renewedFromTermId?: string | null;
  allowedMoves?: string[]; editable?: boolean;
  scope: TermScopeRow[]; rates: TermRateRow[]; billingMonths: TermBillingRow[];
  documents: TermDocument[]; history: TermHistoryRow[];
}
export interface ContractDetail {
  id: string; customerId: string; line: AgreementLine; form: "ours" | "theirs";
  customer: { id: string; name: string };
  currentTermId?: string | null; renewalDue?: boolean; renewalDraftId?: string | null;
  terms: DetailTerm[];
}
