import { describe, expect, it } from "vitest";
import { customerServiceFulfillment as calculate, ServiceTermUnavailable, type ServiceFulfillmentInputs } from "./customerServiceFulfillment";
import { campaignDemand } from "./campaignDemand";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";

const months = (entries: Record<number, number>) => Array.from({ length: 12 }, (_, i) => entries[i + 1] ?? 0);
export function serviceFixture(): ServiceFulfillmentInputs {
  return {
    customers: [{ id: "p", companyId: "c", name: "Property", parentCustomerId: null, isParent: "false", accountManagerId: "other-manager" }],
    agreements: [{ id: "a", companyId: "c", customerId: "p" }],
    terms: [{ id: "t", agreementId: "a", companyId: "c", line: "landscape", status: "signed",
      startDate: "2026-10-01", endDate: "2027-09-30", nonRenewalOn: "2027-09-30", seasonLabel: "2026–27" }],
    scope: [{ id: "s", companyId: "c", termId: "t", serviceKey: "fertilization", included: true, quantity: 3, monthSpread: null }],
    calendar: STARTING_SERVICE_CALENDAR.map((e, i) => ({...e, id: `entry-${i}`})),
    campaigns: [], items: [], stops: [], visits: [],
  } as unknown as ServiceFulfillmentInputs;
}
function materialize(data: ServiceFulfillmentInputs, states = ["completed", "skipped", "pending"]) {
  // These history regressions materialize the explicitly tested service only;
  // implicit package and pending-renewal parity have separate SC2.2 checks.
  const keys = new Set(data.scope?.map(s => s.serviceKey));
  const rounds = [2026, 2027].flatMap(y => campaignDemand(data, y, "2027-07-01").rounds)
    .filter(r => keys.has(r.serviceKey) && r.members.some(m => m.termId === "t"));
  rounds.forEach((r, n) => {
    data.campaigns.push({ id: `r${n}`, companyId: "c", source: "contract", serviceKey: r.serviceKey,
      calendarEntryId: r.calendarEntryId, roundYear: r.roundYear, windowStart: r.opens,
      windowEnd: r.due, title: `${r.roundYear} ${r.name}`, status: "active" } as any);
    data.items.push({ id: `i${n}`, companyId: "c", campaignId: `r${n}`, customerId: "p",
      propertyId: null, status: states[n] ?? "pending", targetDate: null, backupDate: null } as any);
  });
  return data;
}
const result = (data = serviceFixture(), today = "2027-07-01") => calculate(data, "p", undefined, today)!;
describe("season service fulfillment", () => {
  it("matches governing demand across New Year, not a single selected calendar year", () => {
    const data = materialize(serviceFixture());
    const row = result(data).rows[0];
    expect(row).toMatchObject({ owed: 3, done: 1, skipped: 1, remaining: 1, status: "on_track" });
    expect(row.rounds.map(r => r.windowEnd)).toEqual(["2027-04-30", "2027-07-31", "2027-09-30"]);
    expect(row.next).toMatchObject({ itemId: "i2", date: "2027-08-15", kind: "round_window" });
  });
  it("matches October deadline demand for shrubs, fall fertilizer, January grass and annual backflow", () => {
    const data = serviceFixture();
    data.scope = ["shrub_trimming", "fertilization", "ornamental_grass", "backflow"].map(serviceKey => ({
      ...data.scope![0], serviceKey, quantity: serviceKey === "backflow" ? 8 : null,
    }));
    materialize(data, ["completed", "pending", "pending", "pending", "pending", "pending", "pending"]);
    const result = calculate(data, "p", "t", "2026-11-11")!;
    for (const row of result.rows) {
      const expected = [2026, 2027].flatMap(year => campaignDemand(data, year, "2026-11-11").rounds)
        .filter(r => r.serviceKey === row.serviceKey && r.members.some(m => m.termId === "t"));
      expect(row.owed).toBe(expected.length);
      expect(row.rounds.map(r => r.windowEnd)).toEqual(expected.map(r => r.due));
    }
    const backflow = result.rows.find(r => r.serviceKey === "backflow")!;
    expect(backflow).toMatchObject({scheduling: "checklist", owed: 1, done: 0});
    const item = data.items.find(i => data.campaigns.find(c => c.id === i.campaignId)?.serviceKey === "backflow")!;
    item.status = "completed";
    expect(calculate(data, "p", "t", "2026-11-11")!.rows.find(r => r.serviceKey === "backflow")!.done).toBe(1);
    expect(result.rows.find(r => r.serviceKey === "ornamental_grass")!.next).toMatchObject({kind: "round_window", date: "2026-12-01"});
  });
  it("keeps missing past items distinct from pending overdue work and never infers completion from visits", () => {
    const data = materialize(serviceFixture(), ["pending", "pending", "pending"]);
    data.items.splice(0, 1);
    data.visits.push({ companyId: "c", sourceType: "campaign_item", campaignItemId: "i1", status: "done", customerId: "p" } as any);
    const row = result(data).rows[0];
    expect(row.done).toBe(0);
    expect(row.rounds.map(r => r.state)).toEqual(["missing_item", "pending", "pending"]);
    expect(row.issues).toEqual(["missing_item"]);
  });
  it("uses calendar timing despite conflicting months, and backup before target", () => {
    const data = serviceFixture();
    data.scope![0].monthSpread = months({ 3: 1, 6: 1 });
    materialize(data, ["pending", "pending"]);
    data.items[0].targetDate = "2027-03-10";
    data.items[0].backupDate = "2027-03-20";
    const row = result(data, "2027-03-15").rows[0];
    expect(row).toMatchObject({ owed: 3, done: 0, issues: [] });
    expect(row.rounds[0]).toMatchObject({ dueDate: "2027-03-20", state: "pending", timing: "calendar" });
    expect(data.scope![0].monthSpread[2]).toBe(1);
  });
  it("reports signature waits before overdue, while preserving missing-item issues", () => {
    const data = serviceFixture(); data.terms[0].status = "sent";
    materialize(data, ["pending", "pending", "pending"]); data.items.pop();
    const row = result(data).rows[0];
    expect(row.status).toBe("waiting_on_signature");
    expect(row.rounds[0].state).toBe("waiting_on_signature");
    expect(row.issues).toContain("missing_item");
  });
  it.each(["no_count", "needs_rounds", "invalid_count", "duplicate_lines"])("keeps %s unknown rather than inventing zero", kind => {
    const data = serviceFixture();
    if (kind === "no_count") { data.scope![0].quantity = null; data.calendar = []; }
    if (kind === "needs_rounds") data.scope![0].quantity = 4;
    if (kind === "invalid_count") data.scope![0].quantity = -1;
    if (kind === "duplicate_lines") data.scope!.push({ ...data.scope![0], id: "dup", included: false });
    expect(result(data).rows[0]).toMatchObject({ owed: null, remaining: null, done: 0, status: kind });
  });
  it("uses standards only for unstated count; explicit zero means not owed", () => {
    const data = serviceFixture(); data.scope![0].quantity = null;
    expect(result(data).rows[0]).toMatchObject({ owed: 3 });
    data.scope![0].quantity = 0;
    expect(result(data).rows[0]).toMatchObject({ owed: 0, status: "not_owed" });
  });
  it("separates manual and uncounted services, retains generated work no longer owed, and is pure", () => {
    const data = materialize(serviceFixture());
    data.scope!.push({ ...data.scope![0], id: "other", serviceKey: "crabgrass" });
    data.campaigns.push({ ...data.campaigns[0], id: "manual", source: "manual", serviceKey: null });
    data.items.push({ ...data.items[0], id: "manual-item", campaignId: "manual" });
    data.items.push({ ...data.items[0], id: "retained", campaignId: "extra" });
    data.campaigns.push({ ...data.campaigns[0], id: "extra", calendarEntryId: "retired" });
    const before = structuredClone(data), r = result(data);
    expect(r.rows[0].done).toBe(1);
    expect(r.otherWork).toMatchObject([{ itemId: "manual-item" }]);
    expect(r.alsoInContract).toMatchObject([{ serviceKey: "crabgrass", scheduling: "on_request" }]);
    expect(r.retainedWork).toMatchObject([{ itemId: "retained" }]);
    expect(data).toEqual(before);
  });
  it("counts route activity only within season, ignoring ticket/campaign/cancelled/foreign visits", () => {
    const data = serviceFixture(); data.scope![0].serviceKey = "mowing"; data.scope![0].quantity = 10;
    data.stops = [{ id: "stop", companyId: "c", customerId: "p", serviceKey: "mowing", isActive: true }] as any;
    data.visits = ["done", "skipped", "planned", "in_progress", "cancelled"].map((status, n) => ({
      id: `v${n}`, companyId: "c", customerId: "p", sourceType: "route", serviceKey: "mowing", visitDate: "2027-07-02",
      routeOccurrenceDate: "2027-07-02", status,
    })) as any;
    data.visits.push(...[
      { ...data.visits[0], id: "foreign", companyId: "foreign" },
      { ...data.visits[0], id: "ticket", sourceType: "ticket" },
      { ...data.visits[0], id: "outside", visitDate: "2027-10-01" },
    ] as any);
    expect(result(data).rows[0]).toMatchObject({ owed: 10, done: 1, skipped: 1, planned: 1,
      inProgress: 1, remaining: 8, status: "on_track", next: { visitId: "v2" } });
    // Historical activity remains a fact when the season later enters renewal.
    data.terms[0].status = "up_for_renewal";
    expect(result(data).rows[0].done).toBe(1);
    data.stops = [];
    expect(result(data).rows[0].status).toBe("no_route");
  });
  it("does not invent route count, but retains actual activity", () => {
    const data = serviceFixture(); data.scope![0].serviceKey = "mowing"; data.scope![0].quantity = null;
    expect(result(data).rows[0]).toMatchObject({ owed: null, remaining: null, issues: ["no_count", "no_route"] });
  });
  it("inherits immediate parent, own exclusion wins, and parents never receive campaign demand", () => {
    const data = serviceFixture();
    data.customers.push({ ...data.customers[0], id: "parent", isParent: "true" });
    data.customers[0].parentCustomerId = "parent"; data.agreements[0].customerId = "parent";
    expect(result(data).selectedTerm).toMatchObject({ parentCustomerId: "parent" });
    expect(calculate(data, "parent", undefined, "2027-07-01")!.rows[0].owed).toBe(0);
    data.agreements.push({ ...data.agreements[0], id: "own", customerId: "p" });
    data.terms.push({ ...data.terms[0], id: "own", agreementId: "own" });
    data.scope!.push({ ...data.scope![0], termId: "own", included: false });
    expect(result(data).selectedTerm!.termId).toBe("own");
    expect(result(data).rows.find(r => r.serviceKey === "fertilization")).toBeUndefined();
    expect(result(data).rows.some(r => r.serviceKey === "cleanups" && r.owed! > 0)).toBe(true);
    expect(calculate(data, "p", "t", "2027-07-01")!.rows[0].owed).toBe(0);
  });
  it("selects current then upcoming then previous, rejects foreign/unrelated/ineligible seasons", () => {
    const data = serviceFixture();
    expect(result(data, "2026-01-01").selectedTerm!.termId).toBe("t");
    expect(result(data, "2028-01-01").selectedTerm!.termId).toBe("t");
    expect(() => calculate(data, "p", "unknown")).toThrow(ServiceTermUnavailable);
    data.terms[0].status = "draft";
    expect(result(data).selectedTerm).toBeNull();
    expect(() => calculate(data, "p", "t")).toThrow(ServiceTermUnavailable);
    expect(calculate(data, "unknown")).toBeNull();
  });
  it("keeps manual work visible without an eligible contract instead of inventing owed rows", () => {
    const data = materialize(serviceFixture());
    data.campaigns[0].source = "manual"; data.terms = [];
    const r = result(data);
    expect(r.selectedTerm).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.otherWork).toMatchObject([{ itemId: "i0" }]);
    expect(r.retainedWork).toHaveLength(2);
  });
  it("keeps season-end route deficits overdue even with no pending visit", () => {
    const data = serviceFixture(); data.scope![0].serviceKey = "mowing";
    data.stops = [{ companyId: "c", customerId: "p", serviceKey: "mowing", isActive: true }] as any;
    expect(result(data, "2027-10-01").rows[0]).toMatchObject({ remaining: 3, status: "overdue", next: null });
  });
  it("selects firm own current season ahead of sent and only uses parent current over future own", () => {
    const data = serviceFixture();
    data.terms.push({ ...data.terms[0], id: "sent", status: "sent", startDate: "2027-01-01" });
    expect(result(data).selectedTerm!.termId).toBe("t");
    data.customers.push({ ...data.customers[0], id: "parent", isParent: "true" });
    data.customers[0].parentCustomerId = "parent";
    data.agreements.push({ ...data.agreements[0], id: "parent-agreement", customerId: "parent" });
    data.terms = [{ ...data.terms[0], id: "parent-term", agreementId: "parent-agreement" },
      { ...data.terms[0], id: "future-own", startDate: "2028-01-01", endDate: "2028-12-31" }];
    expect(result(data).selectedTerm!.termId).toBe("parent-term");
    expect(() => calculate(data, "p", "foreign-term", "2027-07-01")).toThrow(ServiceTermUnavailable);
  });
  it("includes all intersecting years in a longer season without multiplying stated quantity", () => {
    const data = serviceFixture(); data.terms[0].endDate = "2028-09-30";
    data.terms[0].nonRenewalOn = "2028-09-30";
    const expected = [2026, 2027, 2028].flatMap(y => campaignDemand(data, y, "2027-07-01").rounds)
      .filter(r => r.serviceKey === "fertilization" && r.members.length);
    expect(result(data).rows[0].owed).toBe(expected.length);
    expect(result(data).rows[0].owed).toBe(6);
  });
});
