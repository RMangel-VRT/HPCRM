import { describe, expect, it } from "vitest";
import { classifyCustomer, projectActiveCustomers, type ActiveCustomerSeason, type ActiveCustomer } from "@workspace/db/active-customers";
import { activeCustomersAsOf } from "./activeCustomers";
import { addCalendarDays } from "./companyDay";
import { build } from "esbuild";

const customer: ActiveCustomer = { id: "c", name: "Customer", status: "active", parentCustomerId: null };
const today = "2026-11-03";
const season = (fields: Partial<ActiveCustomerSeason> = {}): ActiveCustomerSeason => ({
  id: "s", agreementId: "a", seasonLabel: "2026", line: "landscape", status: "signed",
  startDate: "2026-01-01", endDate: "2026-12-31", renewedFromTermId: null, nonRenewalOn: null, ...fields,
});
const classify = (seasons: ActiveCustomerSeason[], asOf = today, c = customer) => classifyCustomer({ customer: c, seasons, asOf });

describe("Active customers shared classifier", () => {
  it("bundles the public shared export for browsers without a driver or environment", async () => {
    const result = await build({ stdin: { contents: 'export * from "@workspace/db/active-customers";', resolveDir: process.cwd() },
      bundle: true, platform: "browser", format: "esm", write: false, metafile: true });
    expect(Object.keys(result.metafile!.inputs).every(path => !/node_modules|schema|index\.ts/.test(path))).toBe(true);
    expect(result.outputFiles[0].text).not.toMatch(/DATABASE_URL|node:|require\("pg"\)/);
  });
  it.each(["2026-01-01", "2026-12-31"])("includes both coverage boundaries %s", day => {
    expect(classify([season()], day).landscape.state).toBe("in_effect");
  });
  it("ends the day after; never mutates input", () => {
    const terms = Object.freeze([Object.freeze(season())]);
    expect(classify([...terms], "2027-01-01").landscape.state).toBe("ended");
    expect(classify([...terms], "2027-01-01").flags).toEqual(["should_fall_off"]);
  });
  it.each(["signed", "active", "renewed"])("allows %s current coverage", status => {
    expect(classify([season({ status })]).responsible).toBe(true);
  });
  it.each(["lost", "cancelled"])("%s never provides coverage even inside original dates", status => {
    const row = classify([season({ status })]);
    expect(row.responsible).toBe(false);
    expect(row.landscape.state).toBe("ended");
    expect(row.landscape.note).toBe(status === "lost" ? "lost" : null);
  });
  it.each([
    ["signed", "renewed"], ["active", "renewed"], ["renewed", "renewed"],
    ["sent", "renewal_sent"], ["draft", "renewal_drafted"],
  ])("notes actual %s successors", (status, note) => {
    const row = classify([season(), season({ id: "next", startDate: "2027-01-01", endDate: "2027-12-31", status, renewedFromTermId: "s" })]);
    expect(row.landscape.note).toBe(note);
  });
  it("non-renewal preserves worked coverage and takes note precedence", () => {
    const row = classify([season({ nonRenewalOn: today })]);
    expect(row.landscape).toMatchObject({ state: "in_effect", note: "not_renewing" });
    expect(classify([season({ nonRenewalOn: today })], "2027-01-01").landscape.note).toBe("not_renewing");
  });
  it("ignores unrelated, same-start and cross-agreement successor references", () => {
    const source = season({ endDate: "2026-11-20" });
    for (const fields of [{ renewedFromTermId: null }, { agreementId: "other", renewedFromTermId: "s" }, { startDate: source.startDate, renewedFromTermId: "s" }]) {
      const next = season({ id: "next", startDate: "2027-01-01", endDate: "2027-12-31", ...fields });
      expect(classify([source, next]).landscape.note).toBe(null);
      expect(classify([source, next]).flags).toContain("ending_soon");
    }
  });
  it.each(["draft", "sent"])("pending %s renewal after end is lapsed, not a replacement season", status => {
    const source = season({ endDate: "2026-10-31" });
    const renewal = season({ id: "r", renewedFromTermId: "s", status, startDate: "2026-11-01", endDate: "2026-11-02" });
    expect(classify([source, renewal]).landscape).toMatchObject({ state: "lapsed", seasonId: "s", note: status === "sent" ? "renewal_sent" : "renewal_drafted" });
    expect(classify([source, renewal]).flags).toEqual(["lapsed"]);
  });
  it("future signed coverage precedes lapse and chooses nearest start", () => {
    const row = classify([
      season({ endDate: "2026-10-31" }),
      season({ id: "later", startDate: "2027-01-01", endDate: "2027-12-31" }),
      season({ id: "next", startDate: "2026-11-15", endDate: "2026-12-31" }),
    ]);
    expect(row.landscape).toMatchObject({ state: "starting", seasonId: "next", note: null });
    expect(row.flags).toEqual(["starting_soon"]);
  });
  it("future active or renewed terms are not signed starting terms", () => {
    for (const status of ["active", "renewed", "sent", "draft"]) {
      expect(classify([season({ startDate: "2027-01-01", endDate: "2027-12-31", status })]).landscape.state).not.toBe("starting");
    }
  });
  it.each(["landscape", "snow", "both"] as const)("%s line coverage", line => {
    const row = classify([season({ line })]);
    expect(row.landscape.state).toBe(line === "snow" ? "none" : "in_effect");
    expect(row.snow.state).toBe(line === "landscape" ? "none" : "in_effect");
  });
  it.each([0, 30, 31])("ending soon inclusive day %i", days => {
    const row = classify([season({ endDate: addCalendarDays(today, days) })]);
    expect(row.flags.includes("ending_soon")).toBe(days <= 30);
  });
  it.each([1, 30, 31])("starting soon inclusive day %i", days => {
    const row = classify([season({ startDate: addCalendarDays(today, days), endDate: "2027-12-31" })]);
    expect(row.flags.includes("starting_soon")).toBe(days <= 30);
  });
  it("signed successor suppresses ending soon, pending successor does not", () => {
    for (const status of ["signed", "active", "renewed", "draft", "sent"]) {
      const row = classify([season({ endDate: "2026-11-20" }), season({ id: "r", renewedFromTermId: "s", status, startDate: "2027-01-01", endDate: "2027-12-31" })]);
      expect(row.flags.includes("ending_soon")).toBe(["draft", "sent"].includes(status));
    }
  });
  it.each(["prospect", "inactive"] as const)("%s never should fall off", status => {
    expect(classify([season({ endDate: "2026-10-31" })], today, { ...customer, status }).flags).not.toContain("should_fall_off");
  });
  it("missing contracts are distinct from fall off; inactive current is mismatch", () => {
    expect(classify([])).toMatchObject({ noContract: true, flags: [], responsible: false });
    expect(classify([season()], today, { ...customer, status: "inactive" }).flags).toEqual(["mismatch"]);
  });
  it("flags are independent across lines", () => {
    const row = classify([season({ endDate: "2026-11-20" }),
      season({ id: "snow", line: "snow", startDate: "2026-11-25", endDate: "2027-05-31" })],
    today, { ...customer, status: "inactive" });
    expect(row.flags).toEqual(["ending_soon", "starting_soon", "mismatch"]);
  });
  it("can be responsible and lapsed independently, without falling off", () => {
    const row = classify([season(), season({ id: "snow", line: "snow", endDate: "2026-10-31" }),
      season({ id: "r", line: "snow", status: "sent", renewedFromTermId: "snow", startDate: "2026-11-01", endDate: "2027-05-31" })]);
    expect(row.responsible).toBe(true);
    expect(row.flags).toEqual(["lapsed"]);
  });
  it("current year and actual next-year note survive multi-year chain", () => {
    const seasons = [
      season({ id: "2025", status: "renewed", startDate: "2025-01-01", endDate: "2025-12-31" }),
      season({ id: "2026", status: "renewed", renewedFromTermId: "2025" }),
      season({ id: "2027", renewedFromTermId: "2026", startDate: "2027-01-01", endDate: "2027-12-31" }),
      season({ id: "2028", status: "draft", renewedFromTermId: "2027", startDate: "2028-01-01", endDate: "2028-12-31" }),
    ];
    expect(classify(seasons).landscape).toMatchObject({ seasonId: "2026", note: "renewed" });
    expect(classify(seasons, "2027-02-01").landscape).toMatchObject({ seasonId: "2027", note: "renewal_drafted" });
  });
  it("sparse pending histories cannot become signed coverage or renew unrelated seasons", () => {
    const row = classify([season(), season({ id: "pending", status: "sent", renewedFromTermId: "missing",
      startDate: "2026-10-01", endDate: "2027-09-30" })]);
    expect(row.landscape).toMatchObject({ state: "in_effect", seasonId: "s", note: null });
  });
  it("overlap and agent selection are deterministic under permutations; null is not a fallback", () => {
    const a = season({ id: "a", managingAgentName: "Old" });
    const b = season({ id: "b", managingAgentName: "Chosen" });
    const future = season({ id: "future", managingAgentName: "Future", status: "draft", startDate: "2028-01-01" });
    expect(classify([a, b, future])).toEqual(classify([future, b, a]));
    expect(classify([a, b, future])).toMatchObject({ landscape: { seasonId: "b" }, managingAgentName: "Chosen" });
    expect(classify([a, { ...b, managingAgentName: null }]).managingAgentName).toBe(null);
    expect(classify([future], "2027-01-01").managingAgentName).toBe("Future");
  });
  it("latest start wins overlapping seasons even if older end is later", () => {
    expect(classify([season({ endDate: "2028-01-01" }), season({ id: "new", startDate: "2026-10-01" })]).landscape.seasonId).toBe("new");
  });
});

describe("projection population, inheritance and counts", () => {
  it("inherits only direct parent agreements, includes parent, respects empty own agreements, sorts and counts rows", () => {
    const response = projectActiveCustomers({
      customers: [customer, { ...customer, id: "branch", name: "Branch", status: "inactive", parentCustomerId: "c" },
        { ...customer, id: "own", name: "Own", parentCustomerId: "c" },
        { ...customer, id: "grandchild", name: "Grandchild", parentCustomerId: "branch" },
        { ...customer, id: "missing", name: "Missing", parentCustomerId: "foreign" },
        { ...customer, id: "prospect", name: "Prospect", status: "prospect" }],
      agreements: [{ id: "a", customerId: "c" }, { id: "empty", customerId: "own" }, { id: "foreign", customerId: "foreign" }],
      seasons: [season({ line: "both" }), season({ id: "foreign", agreementId: "foreign" })], asOf: today,
    });
    expect(response.rows.map(r => r.customerName)).toEqual(["Branch", "Customer", "Grandchild", "Missing", "Own"]);
    expect(response.rows[0]).toMatchObject({ viaParent: true, parentName: "Customer", flags: ["mismatch"], landscape: { agreementId: "a", seasonId: "s" } });
    expect(response.rows[4].noContract).toBe(true);
    expect(response.counts).toEqual({ responsible: 2, landscape: 2, snow: 2, mismatch: 1, noContract: 3,
      ending_soon: 0, lapsed: 0, should_fall_off: 0, starting_soon: 0 });
  });
  it("retains prospect/inactive with seasons, excludes them without seasons", () => {
    const response = projectActiveCustomers({
      customers: ["active", "prospect", "inactive"].flatMap(status => [true, false].map(has => ({
        ...customer, id: `${status}-${has}`, status: status as ActiveCustomer["status"],
      }))),
      agreements: ["active", "prospect", "inactive"].map(status => ({ id: status, customerId: `${status}-true` })),
      seasons: ["active", "prospect", "inactive"].map(status => season({ id: status, agreementId: status, endDate: "2026-10-31" })),
      asOf: today,
    });
    expect(response.rows).toHaveLength(4);
    expect(response.counts.should_fall_off).toBe(1);
    expect(response.counts.noContract).toBe(1);
  });
});

describe("as-of calendar validation", () => {
  it("defaults to today and accepts both inclusive 400-day boundaries", () => {
    expect(activeCustomersAsOf(undefined, today)).toBe(today);
    for (const offset of [-400, 400]) expect(activeCustomersAsOf(addCalendarDays(today, offset), today)).toBe(addCalendarDays(today, offset));
  });
  it.each(["", "2026-02-29", "2026-11-31", "2026-1-01", "2026-11-03T00:00:00Z", "0000-01-01", "2026-13-01",
    ["2026-11-03"], { date: today }, null, 20261103])("rejects malformed/non-scalar %j", value => {
    expect(() => activeCustomersAsOf(value, today)).toThrow();
  });
  it("rejects 401 days either side and accepts a valid leap day", () => {
    for (const offset of [-401, 401]) expect(() => activeCustomersAsOf(addCalendarDays(today, offset), today)).toThrow();
    expect(activeCustomersAsOf("2028-02-29", "2028-01-01")).toBe("2028-02-29");
  });
});
