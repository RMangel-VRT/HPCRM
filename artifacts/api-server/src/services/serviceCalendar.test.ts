import { describe, expect, it } from "vitest";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { serviceCalendarCheckSql } from "../../../../lib/db/src/serviceCalendarSql";
import { calendarEntryInput, serviceCalendarReplacementSchema, STARTING_SERVICE_CALENDAR, summarizeServiceUsage,
  validMonthDay, type UsageLine } from "../../../../lib/db/src/serviceCalendarContracts";

const row = { kind: "round" as const, position: 1, name: "Spring", opensMd: "03-01", dueMd: "05-31", inStandard: true };
const replace = (service = "aeration") => serviceCalendarReplacementSchema(SCOPE_CATALOG, service);
const usageLine = (termId: string, quantity: number | null, extra: Partial<UsageLine> = {}): UsageLine =>
  ({ termId, agreementId: `a-${termId}`, customerId: `p-${termId}`, customerName: termId,
    serviceKey: "cleanups", quantity, monthSpread: null, ...extra });
describe("SC1 shared calendar contracts", () => {
  it("preserves the main project's Publish-safe outer IS TRUE check shape", () => {
    expect(serviceCalendarCheckSql).toMatch(/^\(coalesce\([\s\S]*\)\) IS TRUE$/);
  });
  it.each(["02-29", "02-30", "04-31", "00-01", "13-01", "01-00", "3-01", "12-32", "01-01x"])("rejects invalid date %s", opensMd => {
    expect(calendarEntryInput.safeParse({ ...row, opensMd }).success).toBe(false);
    expect(validMonthDay(opensMd)).toBe(false);
  });
  it("permits every real non-leap day, cross-year and the longest distinct-day window", () => {
    expect(calendarEntryInput.parse({ ...row, opensMd: "12-01", dueMd: "01-30" })).toBeTruthy();
    expect(calendarEntryInput.parse({ ...row, opensMd: "01-02", dueMd: "01-01" })).toBeTruthy();
    const days = [31,28,31,30,31,30,31,31,30,31,30,31];
    for (const [m, count] of days.entries()) for (let d = 1; d <= count; d++)
      expect(validMonthDay(`${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`)).toBe(true);
  });
  it.each([
    { dueMd: "03-01" }, { position: 0 }, { position: 25 }, { position: 1.5 }, { name: " " }, { name: "x".repeat(81) },
    { kind: "recurring", inStandard: true }, { kind: "checklist", inStandard: true },
    { pattern: "round pattern" }, { includes: "round includes" }, { companyId: "forged" },
    { updatedById: "forged" }, { createdAt: "forged" }, { serviceKey: "aeration" },
  ])("rejects malformed or server-owned entry fields %#", change => {
    expect(calendarEntryInput.safeParse({ ...row, ...change }).success).toBe(false);
  });
  it("normalizes names and requires explicit authorization of no standard", () => {
    expect(calendarEntryInput.parse({ ...row, name: "  Spring  " }).name).toBe("Spring");
    expect(replace().safeParse({ entries: [{ ...row, inStandard: false }] }).success).toBe(false);
    expect(replace().parse({ entries: [{ ...row, inStandard: false }], allowEmptyStandard: true })).toBeTruthy();
  });
  it("validates each kind/service combination instead of imposing one kind per service", () => {
    const native = STARTING_SERVICE_CALENDAR.filter(e => e.serviceKey === "native_areas").map(({ serviceKey: _, ...e }) => e);
    expect(replace("native_areas").parse({ entries: native }).entries.map(e => [e.kind, e.position]))
      .toEqual([["round", 1], ["round", 2], ["recurring", 1]]);
    for (const [service, kind] of [["aeration","recurring"],["native_areas","checklist"],["mowing","round"],["backflow","round"],["chemical","round"]]) {
      expect(replace(service).safeParse({ entries: [{ ...row, kind, inStandard: kind === "round" }] }).success).toBe(false);
    }
    expect(replace("aeration").safeParse({ entries: [{ ...row, id: "same" }, { ...row, id: "same", position: 2 }] }).success).toBe(false);
    expect(replace().safeParse({ entries: [row, row] }).success).toBe(false);
    expect(replace().safeParse({ entries: [{ ...row, position: 2 }] }).success).toBe(false);
    expect(replace("backflow").safeParse({ entries: [{ ...row, kind: "checklist", inStandard: false, position: 2 }] }).success).toBe(false);
    expect(replace().safeParse({ entries: [row], companyId: "forged" }).success).toBe(false);
  });
  it("contains the exact 18 rounds, checklist, four recurring rows and native mixed positions", () => {
    expect(STARTING_SERVICE_CALENDAR).toHaveLength(23);
    expect(STARTING_SERVICE_CALENDAR.filter(e => e.kind === "round")).toHaveLength(18);
    expect(STARTING_SERVICE_CALENDAR.filter(e => e.kind === "round").map(e => [e.serviceKey,e.position,e.name,e.opensMd,e.dueMd,e.inStandard])).toEqual([
      ["cleanups",1,"Spring clean-up","03-01","04-15",true],
      ["cleanups",2,"Fall leaf clean-up 1","11-01","11-30",true],
      ["cleanups",3,"Fall leaf clean-up 2","11-15","12-31",true],
      ["aeration",1,"Spring aeration","03-01","05-15",true],
      ["shrub_trimming",1,"Spring shrub trim","04-01","07-31",true],
      ["shrub_trimming",2,"Fall shrub trim","09-01","10-31",true],
      ["tree_pruning",1,"Tree trim","09-01","10-31",true],
      ["ornamental_grass",1,"Ornamental grass cutback","12-01","01-30",true],
      ["fertilization",1,"Pre-emergent / spring fertilizer","03-01","04-30",true],
      ["fertilization",2,"Summer fertilizer","06-01","07-31",true],
      ["fertilization",3,"Fall fertilizer","08-15","09-30",true],
      ["broadleaf",1,"Broadleaf 1","05-01","05-31",true],
      ["broadleaf",2,"Broadleaf 2","06-01","06-30",true],
      ["broadleaf",3,"Broadleaf 3","07-01","07-31",true],
      ["irrigation_open",1,"Spring start-up","03-01","04-30",true],
      ["irrigation_winterization",1,"Winterization and blowout","10-01","11-30",true],
      ["native_areas",1,"Spring full native mow","04-01","05-31",true],
      ["native_areas",2,"Fall full native mow","09-01","10-31",true],
    ]);
    expect(STARTING_SERVICE_CALENDAR.filter(e => e.kind === "checklist")).toEqual([
      { kind: "checklist", serviceKey: "backflow", position: 1, name: "Backflow testing", opensMd: "01-01", dueMd: "12-31", inStandard: false },
    ]);
    expect(STARTING_SERVICE_CALENDAR.filter(e => e.kind === "recurring").map(e => [e.serviceKey,e.name,e.opensMd,e.dueMd,e.pattern,e.includes]))
      .toEqual([
        ["mowing","Weekly service","04-01","10-31","26 visits: 2 in April, weekly May through September, 2 in October","Mow, trim, blow, edge, spot spray, pet stations, ponds, bed weeding, drain pans, trash"],
        ["native_areas","Native beauty bands","04-01","10-31","Every other week","Beauty bands along native areas"],
        ["irrigation_inspection","Irrigation inspection","04-01","09-30","Monthly","System check"],
        ["winter_visits","Winter site visits","11-01","03-31","Every other week","Site check, pet stations, trash"],
      ]);
    for (const serviceKey of new Set(STARTING_SERVICE_CALENDAR.map(e => e.serviceKey))) {
      const entries = STARTING_SERVICE_CALENDAR.filter(e => e.serviceKey === serviceKey).map(({ serviceKey: _, ...e }) => e);
      expect(replace(serviceKey).safeParse({ entries }).success).toBe(true);
    }
  });
});
describe("SC1 distinct eligible-season usage", () => {
  it("counts by stated count/missing months, blank, zero, invalid, duplicate and linked needs-round buckets", () => {
    const lines = [
      usageLine("standard", 3), usageLine("needs", 2), usageLine("stated", 2, { monthSpread: [0,0,1,0,0,0,0,0,0,1,0,0] }),
      usageLine("blank", null), usageLine("blank-stated", null, { monthSpread: [1,0,0,0,0,0,0,0,0,0,0,0] }),
      usageLine("zero", 0), usageLine("bad-count", 1.5), usageLine("bad-months", 2, { monthSpread: [1] }),
      usageLine("mismatch", 2, { monthSpread: [1,0,0,0,0,0,0,0,0,0,0,0] }),
      usageLine("dup", 2), usageLine("dup", 3),
    ];
    const u = summarizeServiceUsage(SCOPE_CATALOG, lines, STARTING_SERVICE_CALENDAR).find(e => e.serviceKey === "cleanups")!;
    expect(u).toMatchObject({ seasons: 10, noCount: 2, noCountWithoutMonths: 1, zero: 1, invalid: 3, duplicate: 1,
      byCount: [{ rounds: 2, seasons: 2, withoutMonths: 1 }, { rounds: 3, seasons: 1, withoutMonths: 1 }] });
    expect(u.needsRounds).toEqual([{ termId: "needs", agreementId: "a-needs", customerId: "p-needs", customerName: "needs", reason: "needs_rounds" }]);
    expect(u.problems.map(p => p.reason)).toEqual(["no_count", "no_count", "zero", "invalid_count", "invalid_months", "invalid_months", "duplicate"]);
  });
  it("accepts total count independently of standard count and excludes recurring from counts", () => {
    const entries = STARTING_SERVICE_CALENDAR.map(e => e.serviceKey === "native_areas" && e.position === 2 ? { ...e, inStandard: false } : e);
    const u = summarizeServiceUsage(SCOPE_CATALOG, [usageLine("one", 1, { serviceKey: "native_areas" }), usageLine("two", 2, { serviceKey: "native_areas" })], entries);
    expect(u.find(e => e.serviceKey === "native_areas")!.needsRounds).toEqual([]);
  });
  it("links distinct combined legacy seasons only when neither new line exists, and includes checklist usage", () => {
    const lines = [
      usageLine("old", 12, { serviceKey: "chemical" }), usageLine("old", 12, { serviceKey: "chemical" }),
      usageLine("fert", 12, { serviceKey: "chemical" }), usageLine("fert", 3, { serviceKey: "fertilization" }),
      usageLine("broad", 12, { serviceKey: "chemical" }), usageLine("broad", 3, { serviceKey: "broadleaf" }),
      usageLine("check", null, { serviceKey: "backflow" }),
    ];
    const result = summarizeServiceUsage(SCOPE_CATALOG, lines, STARTING_SERVICE_CALENDAR);
    expect(result.find(e => e.serviceKey === "fertilization")!.legacyChemical.map(e => e.termId)).toEqual(["old"]);
    expect(result.find(e => e.serviceKey === "backflow")).toMatchObject({ seasons: 1, noCount: 1, needsRounds: [] });
    expect(result.some(e => e.serviceKey === "chemical")).toBe(false);
  });
});
