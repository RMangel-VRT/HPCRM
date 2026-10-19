import { describe, expect, it, vi } from "vitest";
import type { AgreementTerm } from "@workspace/db";
vi.mock("../db", () => ({ db: {} }));
import { listSummary } from "./contractCenterPersistence";

const today = "2026-10-13";
const term = (id: string, overrides: Partial<AgreementTerm> = {}): AgreementTerm => ({
  id, status: "signed", startDate: "2025-10-01", endDate: "2026-09-30",
  renewedFromTermId: null, createdAt: new Date("2025-09-01"), signedAt: new Date("2025-09-02"),
  snowPricing: "flat_rate", snowFlatPriceCents: 50000, managingAgentName: "Agent",
  billingType: "monthly_variable", annualPriceCents: 150000, needsReview: false,
  ...overrides,
} as AgreementTerm);

describe("Contract Center board response contract", () => {
  it("passes its explicit day to display selection while associating pending drafts with the final renewal source", () => {
    const terms = Array.from({ length: 5 }, (_, i) => term(`year-${i + 1}`, {
      status: i === 4 ? "signed" : "renewed", startDate: `${2026 + i}-01-01`, endDate: `${2026 + i}-12-31`,
      renewedFromTermId: i ? `year-${i}` : null, annualPriceCents: (460000 + i * 9500) * 12,
      signedAt: new Date(`2025-09-${10 + i}T18:00:00Z`),
    }));
    const draft = term("draft", { status: "draft", startDate: "2031-01-01", endDate: "2031-12-31",
      renewedFromTermId: terms[4].id, signedAt: null });
    const before = structuredClone(terms);
    const summary = listSummary([...terms, draft], "2026-11-15");
    expect(summary).toMatchObject({
      current: { id: "year-1", annualPriceCents: 5520000, status: "renewed", displayStatus: "active" },
      latest: { id: "draft" }, recentSigned: { id: "year-5" }, renewalDraft: { id: "draft", status: "draft" },
      renewalDue: false, renewalProgress: { due: true, signed: true }, companyDay: "2026-11-15",
    });
    expect(listSummary(terms, "2028-06-01").current).toMatchObject({ id: "year-3", displayStatus: "active", annualPriceCents: 5748000 });
    expect(listSummary(terms, "2031-01-01").current).toMatchObject({ id: "year-5", displayStatus: "expired" });
    expect(terms).toEqual(before);
  });
  it("preserves expired current selection, exposes flat snow and review figures", () => {
    const summary = listSummary([term("source")], today);
    expect(summary.current).toMatchObject({ id: "source", snowFlatPriceCents: 50000,
      signedAt: new Date("2025-09-02"), managingAgentName: "Agent", billingType: "monthly_variable" });
    expect(summary.companyDay).toBe(today);
    expect(summary.renewalProgress).toEqual({ due: true, signed: false });
  });
  it("keeps pending renewals separate and exposes latest lost renewal for the Lost board", () => {
    const source = term("source");
    const draft = term("draft", { status: "draft", startDate: "2026-10-01", endDate: "2027-09-30",
      signedAt: null, renewedFromTermId: source.id });
    expect(listSummary([source, draft], today)).toMatchObject({ current: { id: "source" }, renewalDraft: { id: "draft" } });
    expect(listSummary([source, { ...draft, status: "lost" }], today)).toMatchObject({
      current: { id: "source" }, renewalDraft: null, latest: { id: "draft", status: "lost" } });
  });
  it("counts a signed renewal even after it replaces its source as current", () => {
    const source = term("source", { status: "renewed" });
    const renewal = term("renewal", { startDate: "2026-10-01", endDate: "2027-09-30",
      signedAt: new Date("2026-09-25"), renewedFromTermId: source.id });
    const summary = listSummary([source, renewal], today);
    expect(summary.current?.id).toBe("renewal");
    expect(summary.recentSigned?.id).toBe("renewal");
    expect(summary.renewalProgress).toEqual({ due: true, signed: true });
  });
  it("includes exact 60-day calendar boundaries and excludes terminal sources", () => {
    for (const endDate of ["2026-08-14", "2026-12-12"])
      expect(listSummary([term("source", { endDate })], today).renewalProgress.due).toBe(true);
    for (const endDate of ["2026-08-13", "2026-12-13"])
      expect(listSummary([term("source", { endDate })], today).renewalProgress.due).toBe(false);
    for (const status of ["draft", "sent", "lost", "cancelled"] as const)
      expect(listSummary([term("source", { status })], today).renewalProgress.due).toBe(false);
  });
});
