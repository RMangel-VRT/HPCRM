import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {} }));
import { contractState, RENEWAL_WINDOW_DAYS } from "./contractState";
import { CONTRACT_STATES, contractSegment } from "@workspace/db/contract-attention";
import { listSummary, projectionActions } from "./contractCenterPersistence";
import { addCalendarDays, companyToday } from "./companyDay";
import { displayStatus } from "./contractCenterService";
import { missingContractDocument } from "./contractDocumentCoverage";
import type { AgreementTerm } from "@workspace/db";

const today = "2026-11-12";
const term = (overrides: Partial<AgreementTerm> = {}): AgreementTerm => ({
  id: "source", agreementId: "a", companyId: "c", status: "signed", line: "both", form: "ours",
  startDate: "2026-01-01", endDate: "2026-12-31", seasonLabel: "2026", renewedFromTermId: null,
  nonRenewalOn: null, createdAt: new Date("2026-01-01"), signedAt: null, ...overrides,
} as AgreementTerm);

describe("CC-ATTN exhaustive classifier", () => {
  const statuses = ["draft", "sent", "signed", "active", "renewed", "lost", "cancelled"] as const;
  const dates = [
    ["before", "2027-01-01", "2027-12-31"],
    ["ninety", "2026-01-01", "2027-01-31"],
    ["distant", "2026-01-01", "2027-12-31"],
    ["recentEnd", "2025-01-01", "2026-10-31"],
    ["oldEnd", "2025-01-01", "2026-01-31"],
  ];
  for (const status of statuses) for (const [position, startDate, endDate] of dates)
    for (const nextStatus of [null, "signed", "draft", "sent", "cancelled"] as const)
      for (const decision of [false, true]) {
        it(`${status}, ${position}, successor ${nextStatus}, non-renewal ${decision}`, () => {
          const source = term({ status, startDate, endDate, nonRenewalOn: decision ? "2026-01-01" : null });
          const terms = [source, ...(nextStatus ? [term({ id: "next", status: nextStatus, renewedFromTermId: source.id,
            startDate: addCalendarDays(endDate, 1), endDate: addCalendarDays(endDate, 365) })] : [])];
          const before = structuredClone(terms);
          const result = contractState(terms, today);
          expect(CONTRACT_STATES).toContain(result.state);
          expect(result.state).not.toBe("unclassified");
          expect(contractSegment(result.state)).toBeTruthy();
          expect(contractState([...terms].reverse(), today)).toEqual(result);
          expect(terms).toEqual(before);
        });
      }
  it("has one exported 90-day window, inclusive start/end and exact thresholds", () => {
    expect(RENEWAL_WINDOW_DAYS).toBe(90);
    const source = term({ startDate: today, endDate: addCalendarDays(today, 90) });
    expect(contractState([source], today).state).toBe("renewal_due");
    expect(contractState([{ ...source, endDate: addCalendarDays(today, 91) }], today).state).toBe("good");
    expect(contractState([term({ endDate: today })], today).state).toBe("renewal_due");
    expect(contractState([term({ endDate: today })], addCalendarDays(today, 1)).state).toBe("ended_no_decision");
    expect(contractState([term({ endDate: addCalendarDays(today, -90), nonRenewalOn: "2026-01-01" })], today).state).toBe("closed_recently");
    expect(contractState([term({ endDate: addCalendarDays(today, -91), nonRenewalOn: "2026-01-01" })], today).state).toBe("closed");
  });
  it.each(["Third Villa West", "Wadsworth Estates", "Hunters Glenn Lakeshore"])("%s stays visible after cancelling a renewal", () => {
    const source = term({ status: "renewed", endDate: "2026-09-30" });
    const next = term({ id: "cancelled", status: "cancelled", renewedFromTermId: source.id,
      startDate: "2026-10-01", endDate: "2027-09-30" });
    expect(contractState([source, next], today)).toMatchObject({ state: "ended_no_decision", stateTermId: source.id, stateSince: source.endDate });
    expect(displayStatus(source, [source, next], today)).toBe("expired");
  });
  it("College Hills works unsigned; Vista West draft also supersedes ended history", () => {
    for (const status of ["draft", "sent"] as const) {
      const source = term({ status: "renewed", startDate: "2025-04-01", endDate: "2026-03-31" });
      const next = term({ id: "pending", status, startDate: "2026-04-01", endDate: "2027-03-31", renewedFromTermId: source.id });
      expect(contractState([source, next], today).state).toBe("working_unsigned");
    }
  });
  it("Aspen is new_draft before service; unsigned takes priority once it starts", () => {
    const pending = term({ status: "draft", startDate: "2027-01-01", endDate: "2027-12-31" });
    expect(contractState([pending], today).state).toBe("new_draft");
    expect(contractState([pending], "2027-01-01").state).toBe("working_unsigned");
  });
  it("Chestnut is due within 90 days and Baseline remains serving/not renewing", () => {
    expect(contractState([term({ endDate: "2027-01-31" })], today).state).toBe("renewal_due");
    expect(contractState([term({ endDate: "2026-11-14", nonRenewalOn: "2026-11-01" })], today).state).toBe("serving_not_renewing");
  });
  it("explicit final-source decisions precede unsigned work, including pending lost", () => {
    const source = term({ endDate: "2026-10-31", nonRenewalOn: "2026-10-01" });
    const pending = term({ id: "pending", status: "sent", startDate: "2026-11-01", endDate: "2027-10-31", renewedFromTermId: source.id });
    expect(contractState([source, pending], today).state).toBe("closed_recently");
    expect(contractState([{ ...source, nonRenewalOn: null }, { ...pending, status: "lost" }], today).state).toBe("closed_recently");
    expect(contractState([{ ...source, nonRenewalOn: null }, { ...pending, status: "cancelled" }], today).state).toBe("ended_no_decision");
  });
  it("a final standalone lost season is an explicit closure, not an undecided historical season", () => {
    expect(contractState([term({ startDate: "2025-01-01", endDate: "2025-12-31" }), term({ id: "lost", status: "lost", endDate: "2026-10-31" })], today).state).toBe("closed_recently");
  });
  it("future signed seasons are good, including real renewed multi-year predecessors", () => {
    const terms = Array.from({ length: 5 }, (_, i) => term({ id: `y${i}`, status: i === 4 ? "signed" : "renewed",
      startDate: `${2026 + i}-01-01`, endDate: `${2026 + i}-12-31`, renewedFromTermId: i ? `y${i - 1}` : null }));
    expect(contractState(terms, today).state).toBe("good");
    expect(contractState(terms, "2028-11-15").state).toBe("good");
    expect(contractState(terms, "2030-11-15").state).toBe("renewal_due");
    expect(contractState(terms, "2031-01-01").state).toBe("ended_no_decision");
    expect(contractState([terms[4]], today).state).toBe("good");
  });
  it("ignores historical non-renewal when a later signed season exists", () => {
    expect(contractState([term({ nonRenewalOn: "2026-01-01" }),
      term({ id: "later", startDate: "2027-01-01", endDate: "2027-12-31" })], today).state).toBe("good");
  });
  it("empty/cancelled-only histories close and impossible histories are explicitly unclassified", () => {
    expect(contractState([], today).state).toBe("closed");
    expect(contractState([term({ status: "cancelled" })], today).state).toBe("closed");
    for (const impossible of [
      term({ status: "impossible" as never }), term({ startDate: "2026-02-30" }),
      term({ startDate: "2030-01-01", endDate: "2026-01-01" }), term({ startDate: null as never }),
    ]) {
      expect(() => listSummary([impossible], today)).not.toThrow();
      expect(contractState([impossible], today).state).toBe("unclassified");
    }
  });
  it("retains Colorado inclusive end days around both DST transitions", () => {
    for (const [instant, date] of [["2026-03-09T05:59:59Z", "2026-03-08"], ["2026-11-02T06:59:59Z", "2026-11-01"]]) {
      const day = companyToday(new Date(instant));
      expect(day).toBe(date);
      expect(contractState([term({ endDate: day })], day).state).toBe("renewal_due");
    }
  });
});

describe("shared flags, progress and lifecycle ownership", () => {
  it("Legends has a missing PDF and Fallbrook years require explicit document coverage", () => {
    const years = [term(), term({ id: "y2", startDate: "2027-01-01", endDate: "2027-12-31" }),
      term({ id: "y3", startDate: "2028-01-01", endDate: "2028-12-31" })];
    expect(missingContractDocument([years[0]], [], today)).toBe(true);
    const doc = { termId: "source", coversThroughTermId: null as string | null };
    expect(missingContractDocument(years, [doc], "2027-06-01")).toBe(true);
    expect(missingContractDocument(years, [{ ...doc, coversThroughTermId: "y3" }], "2027-06-01")).toBe(false);
    expect(missingContractDocument(years, [{ ...doc, coversThroughTermId: "foreign" }], "2027-06-01")).toBe(true);
  });
  it("preserves resolved signed/non-renewing numerators in the expanded 90-day cohort", () => {
    const source = term({ endDate: addCalendarDays(today, -80), status: "renewed" });
    const next = term({ id: "next", startDate: addCalendarDays(source.endDate, 1), endDate: "2027-08-31", renewedFromTermId: source.id });
    expect(listSummary([source, next], today).renewalProgress).toEqual({ due: true, signed: true, notRenewing: false });
    expect(listSummary([{ ...source, nonRenewalOn: "2026-01-01" }], today).renewalProgress).toEqual({ due: true, signed: false, notRenewing: true });
    expect(listSummary([term({ endDate: addCalendarDays(today, 91) })], today).renewalProgress.due).toBe(false);
  });
  it("never offers direct signing for a draft, and uses year one for sent multi-year work", () => {
    const draft = term({ status: "draft" });
    expect(projectionActions([draft], contractState([draft], today), today).allowedActions).toEqual(["open"]);
    const years = [term({ status: "sent" }), term({ id: "y2", status: "sent", startDate: "2027-01-01", endDate: "2027-12-31", renewedFromTermId: "source" })]
      .map((t, i) => ({ ...t, createdAtExact: "2026-01-01 00:00:00.123456", renewalNote: `Renewed from previous (year ${i + 1} of 2026–2027 renewal, +1%)` }));
    expect(projectionActions(years, contractState(years, today), today)).toMatchObject({ actionTermId: "source", allowedActions: ["open", "mark_signed"] });
  });
  it("carries the middle unsigned year's representative independently from current, latest and lifecycle owner", () => {
    const years = Array.from({ length: 3 }, (_, i) => term({ id: `year${i + 1}`, status: "sent",
      startDate: `${2025 + i}-01-01`, endDate: `${2025 + i}-12-31`, renewedFromTermId: i ? `year${i}` : null }));
    const summary = listSummary(years, today);
    expect(summary).toMatchObject({ state: "working_unsigned", stateTermId: "year2",
      stateTerm: { id: "year2", status: "sent" }, latest: { id: "year3" }, current: { id: "year1" } });
  });
});
