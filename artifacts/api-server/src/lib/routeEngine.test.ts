import { describe, it, expect } from "vitest";
import type { AgreementTerm, TermScopeLine, RouteStop } from "@workspace/db";
import { coverageResolver } from "./contractCoverage";
import { routeSeason, occurrenceDates, nextWorkingDay, fillHorizon } from "./routeFill";
import { routeNightDue } from "./routeScheduler";
import { routeStopBody, validRouteSeason } from "@workspace/db";
import { pickProvided } from "./patchBody";

const spread = [0, 0, 0, 2, 5, 4, 4, 4, 5, 2, 0, 0];
const term = (id: string, agreementId: string, overrides = {}) => ({ id, agreementId, status: "signed", line: "landscape", startDate: "2027-01-01", endDate: "2027-12-31", ...overrides } as AgreementTerm);
const scope = (termId: string, overrides = {}) => ({ termId, serviceKey: "mowing", included: true, quantity: 26, monthSpread: spread, ...overrides } as TermScopeLine);
const stop = (overrides = {}) => ({ id: "stop", customerId: "child", serviceKey: "mowing", weekday: 2, everyWeeks: 1,
  anchorDate: "2027-01-01", pausedUntil: null, seasonStart: null, seasonEnd: null, ...overrides } as RouteStop);
function resolver(terms = [term("parentTerm", "parentAgreement")], scopes = [scope("parentTerm")]) {
  return coverageResolver({ customers: [{ id: "parent", parentCustomerId: null }, { id: "child", parentCustomerId: "parent" }],
    agreements: [{ id: "parentAgreement", customerId: "parent" }, { id: "childAgreement", customerId: "child" }], terms, scopes });
}
describe("route seasons share Contract Center eligibility", () => {
  it("preserves holes in winter month spreads, unless a manual override explicitly includes them", () => {
    const resolve = resolver(undefined, [scope("parentTerm", {
      serviceKey: "winter_visits", monthSpread: [2,2,2,0,0,0,0,0,0,0,2,2],
    })]);
    const winter = stop({ serviceKey: "winter_visits", weekday: 1, anchorDate: "2027-01-04" });
    expect(routeSeason(winter, 2027, resolve)).toMatchObject({ start: "2027-01-01", end: "2027-12-31" });
    expect(occurrenceDates(winter, "2027-06-01", "2027-06-30", resolve)).toEqual([]);
    expect(occurrenceDates(winter, "2027-03-29", "2027-04-12", resolve)).toEqual(["2027-03-29"]);
    expect(occurrenceDates(winter, "2027-10-25", "2027-11-08", resolve)).toEqual(["2027-11-01", "2027-11-08"]);
    expect(occurrenceDates({ ...winter, seasonStart: "2027-06-01", seasonEnd: "2027-06-30" }, "2027-06-01", "2027-06-30", resolve))
      .toEqual(["2027-06-07", "2027-06-14", "2027-06-21", "2027-06-28"]);
  });
  it("derives April–October and honors parent coverage", () => {
    expect(routeSeason(stop(), 2027, resolver())).toEqual({ start: "2027-04-01", end: "2027-10-31", months: [4,5,6,7,8,9,10], contractStatus: "covered" });
  });
  it("clips the season to term dates", () => {
    expect(routeSeason(stop(), 2027, resolver([term("parentTerm", "parentAgreement", { startDate: "2027-04-15", endDate: "2027-09-08" })]))).toMatchObject({ start: "2027-04-15", end: "2027-09-08" });
  });
  it("override wins even without a contract", () => {
    expect(routeSeason(stop({ seasonStart: "2026-11-01", seasonEnd: "2027-02-28" }), 2027, resolver([], []))).toMatchObject({ start: "2026-11-01", end: "2027-02-28", contractStatus: "override" });
  });
  it.each(["draft", "sent", "lost", "cancelled"])("does not authorize %s terms or historical fallbacks", status => {
    expect(routeSeason(stop(), 2027, resolver([term("parentTerm", "parentAgreement", { status })]))).toBeNull();
    expect(routeSeason(stop(), 2028, resolver())).toBeNull();
  });
  it.each(["signed", "active", "renewed"])("allows future %s season without rewriting lifecycle", status => {
    expect(routeSeason(stop(), 2027, resolver([term("parentTerm", "parentAgreement", { status })]))).not.toBeNull();
  });
  it("property contract governs, even when it excludes the parent's service", () => {
    const resolve = resolver([term("parentTerm", "parentAgreement"), term("childTerm", "childAgreement")],
      [scope("parentTerm"), scope("childTerm", { included: false })]);
    expect(routeSeason(stop(), 2027, resolve)).toBeNull();
  });
  it("latest qualifying term wins before scope selection; no resurrection", () => {
    const resolve = resolver([term("older", "childAgreement"), term("newer", "childAgreement", { startDate: "2027-03-01" })],
      [scope("older"), scope("newer", { included: false })]);
    expect(resolve("child", "mowing", 2027)).toBeNull();
  });
  it("a property's unrelated snow contract cannot suppress parent landscape coverage", () => {
    const resolve = resolver([term("parentTerm", "parentAgreement"), term("snow", "childAgreement", { line: "snow" })]);
    expect(routeSeason(stop(), 2027, resolve)).toMatchObject({ contractStatus: "covered" });
  });
  it("missing/zero spread does not invent a season; quantity remains reportable", () => {
    const resolve = resolver(undefined, [scope("parentTerm", { monthSpread: null })]);
    expect(resolve("child", "mowing", 2027)?.scope.quantity).toBe(26);
    expect(routeSeason(stop(), 2027, resolve)).toBeNull();
  });
  it("cross-year terms clip calendar-indexed scope independently per year", () => {
    const resolve = resolver([term("parentTerm", "parentAgreement", { startDate: "2026-11-15", endDate: "2027-02-15" })],
      [scope("parentTerm", { monthSpread: Array(12).fill(1) })]);
    expect(routeSeason(stop(), 2026, resolve)).toMatchObject({ start: "2026-11-15", end: "2026-12-31" });
    expect(routeSeason(stop(), 2027, resolve)).toMatchObject({ start: "2027-01-01", end: "2027-02-15" });
  });
});
describe("Colorado occurrence arithmetic and validation", () => {
  const resolve = resolver(undefined, [scope("parentTerm", { monthSpread: Array(12).fill(1) })]);
  it("weekly and fortnightly cross spring DST and never land on Sunday", () => {
    const s = stop({ anchorDate: "2027-03-02" });
    expect(occurrenceDates(s, "2027-03-01", "2027-03-30", resolve)).toEqual(["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-23", "2027-03-30"]);
    expect(occurrenceDates({ ...s, everyWeeks: 2 }, "2027-03-01", "2027-03-30", resolve)).toEqual(["2027-03-02", "2027-03-16", "2027-03-30"]);
  });
  it("paused-until is inclusive and anchor is a lower bound", () => {
    expect(occurrenceDates(stop({ anchorDate: "2027-03-09", pausedUntil: "2027-03-16" }), "2027-03-01", "2027-03-23", resolve)).toEqual(["2027-03-16", "2027-03-23"]);
  });
  it("crosses fall DST and year boundaries without host-time drift", () => {
    const manual = stop({ weekday: 6, anchorDate: "2026-10-24", seasonStart: "2026-01-01", seasonEnd: "2027-12-31", everyWeeks: 2 });
    expect(occurrenceDates(manual, "2026-10-24", "2026-11-21", resolve)).toEqual(["2026-10-24", "2026-11-07", "2026-11-21"]);
    expect(occurrenceDates({ ...manual, everyWeeks: 1 }, "2026-12-26", "2027-01-09", resolve)).toEqual(["2026-12-26", "2027-01-02", "2027-01-09"]);
  });
  it("Saturday skips Sunday", () => { expect(nextWorkingDay("2027-03-13")).toBe("2027-03-15"); });
  it("validates horizon dates and the inclusive 42-day maximum", () => {
    expect(fillHorizon(undefined, "2027-03-09").through).toBe("2027-03-30");
    expect(fillHorizon("2027-04-20", "2027-03-09").through).toBe("2027-04-20");
    expect(() => fillHorizon("2027-04-21", "2027-03-09")).toThrow();
    expect(() => fillHorizon("2027-02-30", "2027-03-09")).toThrow();
    expect(() => fillHorizon("2027-03-08", "2027-03-09")).toThrow();
  });
  it("PATCH does not inject cadence/order/active defaults", () => {
    expect(pickProvided(routeStopBody.partial().parse({ minutes: 40 }), { minutes: 40 })).toEqual({ minutes: 40 });
    expect(validRouteSeason({ seasonStart: "2027-03-01" })).toBe(false);
    expect(validRouteSeason({ seasonStart: null, seasonEnd: null })).toBe(true);
  });
  it("night eligibility follows Colorado across spring-forward/fall-back", () => {
    expect(routeNightDue(new Date("2027-03-14T08:59:00Z"))).toBe(false);
    expect(routeNightDue(new Date("2027-03-14T09:00:00Z"))).toBe(true);
    expect(routeNightDue(new Date("2026-11-01T08:59:00Z"))).toBe(false);
    expect(routeNightDue(new Date("2026-11-01T09:00:00Z"))).toBe(true);
  });
});
