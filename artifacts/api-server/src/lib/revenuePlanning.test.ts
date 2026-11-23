import { describe, expect, it } from "vitest";
import { planDefaults, planningYear, revenuePlanPatch, revenueTargetUpdate } from "./revenuePlanning";

describe("Revenue planning defaults and validation", () => {
  it("returns fresh defaults for the requested year", () => {
    const expected = {
      year: 2027, renewalIncreasePct: 3, keptPct: 90, snowYears: 3, irrigationGrowthPct: 0,
      projectsGrowthPct: 0, extraGrowthPct: 0, goalCents: null,
    };
    expect(planDefaults(2027)).toEqual(expected);
    expect(planDefaults(2100)).toEqual({ ...expected, year: 2100 });
    expect(planDefaults(2027)).not.toBe(planDefaults(2027));
  });

  it.each([["2015", 2015], ["2100", 2100]])("accepts boundary year %s", (input, expected) => {
    expect(planningYear.parse(input)).toBe(expected);
  });

  it.each(["2014", "2101", "2027.0", "2e3", "0x7ea", " 2027", "2027\n", "", 2027])(
    "rejects noncanonical or out-of-range year %j",
    input => expect(planningYear.safeParse(input).success).toBe(false),
  );

  it("retains only supplied fields, distinguishes null from zero, and preserves exact values", () => {
    for (const patch of [
      {}, { keptPct: 0 }, { goalCents: null }, { goalCents: 0 },
      { renewalIncreasePct: -10, keptPct: 100, snowYears: 1, irrigationGrowthPct: -50, projectsGrowthPct: 100, extraGrowthPct: 18.07 },
      { renewalIncreasePct: 20, snowYears: 5, goalCents: Number.MAX_SAFE_INTEGER },
    ]) expect(revenuePlanPatch.parse(patch)).toEqual(patch);
  });

  it.each([
    { renewalIncreasePct: -10.01 }, { renewalIncreasePct: 20.01 }, { renewalIncreasePct: 1e-7 },
    { keptPct: -1 }, { keptPct: 100.01 }, { keptPct: 50.5 }, { keptPct: "90" },
    { snowYears: 0 }, { snowYears: 6 }, { snowYears: 1.5 },
    { irrigationGrowthPct: -50.01 }, { projectsGrowthPct: 100.01 }, { extraGrowthPct: 2.001 },
    { goalCents: -1 }, { goalCents: 1.5 }, { goalCents: Number.MAX_SAFE_INTEGER + 1 },
    { goalCents: "0" }, { year: 2027 }, { updatedBy: "user" }, { companyId: "elsewhere" }, null, [],
  ])("rejects invalid plan patch %j", input => {
    expect(revenuePlanPatch.safeParse(input).success).toBe(false);
  });

  it("accepts an exact grid for any subset of planning streams", () => {
    const update = { streams: { contract: Array(12).fill(0), extra: Array(12).fill(2147483647) } };
    expect(revenueTargetUpdate.parse(update)).toEqual(update);
    expect(revenueTargetUpdate.parse({ streams: {} })).toEqual({ streams: {} });
  });

  it.each([
    {}, { streams: null }, { streams: [] }, { streams: {}, year: 2027 },
    { streams: { other: Array(12).fill(1) } }, { streams: { exclude: Array(12).fill(1) } },
    { streams: { contract: Array(11).fill(1) } }, { streams: { snow: Array(13).fill(1) } },
    { streams: { irrigation: Array(12).fill(-1) } }, { streams: { projects: Array(12).fill(1.5) } },
    { streams: { extra: Array(12).fill(2147483648) } }, { streams: { snow: Array(12).fill("1") } },
    { streams: { contract: { "2027-01-01": 1 } } },
  ])("rejects invalid target update %j", input => {
    expect(revenueTargetUpdate.safeParse(input).success).toBe(false);
  });
});
