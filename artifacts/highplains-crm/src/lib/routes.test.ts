import { describe, expect, it } from "vitest";
import {
  cellStops, dayLoadHours, groupRouteBlocks, planRouteDrop, rainDayBody, seasonChip, weeklyTotals, type RouteNeed, type RouteStop,
} from "./routes";
import type { EnrichedVisit } from "./scheduling";

const stop = (id: string, o: Partial<RouteStop> = {}): RouteStop => ({
  id, customerId: `cu-${id}`, serviceKey: "mowing", crewId: "k1", weekday: 2, everyWeeks: 1, anchorDate: "2027-04-06", sortOrder: 0,
  minutes: 60, seasonStart: null, seasonEnd: null, pausedUntil: null, isActive: true, notes: null, updatedAt: "2027-01-01T00:00:00.000Z",
  property: { id: `cu-${id}`, name: `Prop ${id}` }, crew: null, season: null, contractStatus: "covered", ...o,
});
const v = (id: string, o: Partial<EnrichedVisit> & { routeOccurrenceDate?: string | null } = {}) => ({
  id, crewId: "k1", visitDate: "2027-05-04", sourceType: "route", ticketId: null, customerId: "cu", title: null, routeOrder: 1, startTime: null,
  estimatedHours: 1, status: "planned", notes: null, serviceKey: "mowing", ticket: null, customer: null, crew: null, ...o,
}) as EnrichedVisit;

describe("route capacity across all services", () => {
  const stops = [stop("a"), stop("b", { serviceKey: "pet_station", minutes: 30 }), stop("c", { everyWeeks: 2, minutes: 120 }),
    stop("p", { pausedUntil: "2999-01-01" }), stop("x", { crewId: "k2" })];
  it("counts every service's live stops against the crew day, excluding pauses", () => {
    expect(dayLoadHours(stops, "k1", 2, "2027-05-01")).toBe(3.5);
  });
  it("weekly totals halve every-2-weeks stops and list paused ones without hours", () => {
    expect(weeklyTotals(stops, "k1", "2027-05-01")).toEqual({ stops: 4, hours: 2.5 });
  });
  it("cell stops are one service in sort order", () => {
    expect(cellStops([stop("b", { sortOrder: 2 }), stop("a", { sortOrder: 1 }), stop("z", { serviceKey: "pet_station" })], "k1", 2, "mowing").map(s => s.id)).toEqual(["a", "b"]);
  });
});

describe("weekly pattern drops", () => {
  const all = [stop("a", { sortOrder: 0 }), stop("b", { sortOrder: 1 }), stop("c", { sortOrder: 2 }), stop("pet", { serviceKey: "pet_station" })];
  const need: RouteNeed = { customerId: "n1", name: "New HOA", serviceKey: "mowing", season: 2027, reason: "Needs a route" };
  it("a needs card asks before creating", () => {
    expect(planRouteDrop({ kind: "need", need }, { kind: "cell", crewId: "k2", weekday: 4 }, all)).toEqual({ kind: "create", need, crewId: "k2", weekday: 4 });
  });
  it("a different cell PATCHes crew and weekday", () => {
    expect(planRouteDrop({ kind: "stop", stop: all[0] }, { kind: "cell", crewId: "k2", weekday: 5 }, all)).toEqual({ kind: "move", stopId: "a", crewId: "k2", weekday: 5 });
  });
  it("within a cell sends the complete crew/day/service ID group", () => {
    expect(planRouteDrop({ kind: "stop", stop: all[0] }, { kind: "stop", stop: all[2] }, all))
      .toEqual({ kind: "reorder", crewId: "k1", weekday: 2, serviceKey: "mowing", stopIds: ["b", "c", "a"] });
  });
  it("no-ops: no target, own cell, self", () => {
    expect(planRouteDrop({ kind: "stop", stop: all[0] }, undefined, all).kind).toBe("none");
    expect(planRouteDrop({ kind: "stop", stop: all[0] }, { kind: "cell", crewId: "k1", weekday: 2 }, all).kind).toBe("none");
    expect(planRouteDrop({ kind: "stop", stop: all[0] }, { kind: "stop", stop: all[0] }, all).kind).toBe("none");
  });
});

describe("board route blocks", () => {
  it("groups one block per crew, date and service in route order, with slid state", () => {
    const blocks = groupRouteBlocks([
      v("2", { routeOrder: 2 }), v("1", { routeOrder: 1 }), v("pet", { serviceKey: "pet_station" }),
      v("other", { crewId: "k2" }), v("t", { sourceType: "ticket" }), v("s", { visitDate: "2027-05-05", routeOccurrenceDate: "2027-05-04" }),
    ]);
    expect(blocks.map(b => [b.crewId, b.date, b.serviceKey, b.visits.map(x => x.id)])).toEqual([
      ["k1", "2027-05-04", "mowing", ["1", "2"]], ["k2", "2027-05-04", "mowing", ["other"]],
      ["k1", "2027-05-05", "mowing", ["s"]], ["k1", "2027-05-04", "pet_station", ["pet"]],
    ]);
    expect(blocks.find(b => b.date === "2027-05-05")!.slid).toBe(true);
    expect(blocks[0].slid).toBe(false);
    expect(blocks[0].hours).toBe(2);
  });
});

describe("rain day and chips", () => {
  it("sends the R1 slide contract for each mode and crew choice", () => {
    expect(rainDayBody("2027-05-04", "all", "week")).toEqual({ date: "2027-05-04", crewIds: "all", mode: "week" });
    expect(rainDayBody("2027-05-04", "k1", "day")).toEqual({ date: "2027-05-04", crewIds: ["k1"], mode: "day" });
  });
  it("formats the derived season", () => {
    expect(seasonChip({ year: 2027, start: "2027-04-05", end: "2027-10-29" })).toBe("2027 season Apr 5 – Oct 29");
    expect(seasonChip(null)).toBeNull();
  });
});
