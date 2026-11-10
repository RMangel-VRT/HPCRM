import { describe, expect, it } from "vitest";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { serviceProgramSchema, summarizeServiceUsage, type UsageLine } from "../../../../lib/db/src/serviceProgramContracts";

const schema = serviceProgramSchema(SCOPE_CATALOG);
const valid = { serviceKey: "chemical", rounds: 3, monthSpread: [0,0,1,0,0,1,0,0,1,0,0,0], isStandard: false };
describe("shared pure program validation", () => {
  it("requires exact totals, twelve bounded integers and a campaign key", () => {
    expect(schema.safeParse(valid).success).toBe(true);
    for (const patch of [
      { rounds: 4 }, { rounds: 0 }, { rounds: 25 }, { rounds: 1.5 },
      { serviceKey: "mowing" }, { serviceKey: "other:bed-weeding" },
      { monthSpread: Array(13).fill(0) }, { monthSpread: [5,...Array(11).fill(0)], rounds: 5 },
      { monthSpread: [1.5,1.5,...Array(10).fill(0)] }, { monthSpread: [-1,4,...Array(10).fill(0)] },
      { monthSpread: [null,3,...Array(10).fill(0)] }, { companyId: "forbidden" },
    ]) expect(schema.safeParse({ ...valid, ...patch }).success, JSON.stringify(patch)).toBe(false);
  });
});
const line = (termId: string, quantity: number | null, monthSpread: number[] | null = null): UsageLine =>
  ({ termId, agreementId: "a", customerId: "p", customerName: "Test property", serviceKey: "chemical", quantity, monthSpread });
describe("raw distinct-season usage without default inference", () => {
  it("separates valid counts, blank counts, explicit zeros, invalid entries and duplicate seasons", () => {
    const usage = summarizeServiceUsage(SCOPE_CATALOG, [
      line("stated", 3, valid.monthSpread), line("blank-months", 3), line("zero-months", 3, Array(12).fill(0)),
      line("no-count", null), line("no-count-stated-months", null, valid.monthSpread),
      line("zero", 0), line("negative", -1), line("oversized", 25),
      line("mismatch", 2, valid.monthSpread), line("short-array", 3, [3]),
      line("duplicate", 2), line("duplicate", 3),
    ]).find(s => s.serviceKey === "chemical")!;
    expect(usage).toMatchObject({
      seasons: 11, counts: [{ rounds: 3, seasons: 3, withoutMonths: 2 }],
      noCount: 2, noCountWithoutMonths: 1, zero: 1, invalid: 4, duplicate: 1,
    });
    expect(usage.problems.every(p => p.termId && p.agreementId && p.customerId)).toBe(true);
    expect(summarizeServiceUsage(SCOPE_CATALOG, [line("blank", null)])[5].counts).toEqual([]);
  });
});
