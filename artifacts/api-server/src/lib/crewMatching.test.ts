import { describe, expect, it } from "vitest";
import { proposeCrewLinks, type StandingMatch } from "./crewMatching";

const crew = (id = "s1", companyId = "a", name = "North", supervisorUserId = "u1"): StandingMatch =>
  ({ id, companyId, name, supervisorUserId, isActive: true });
const planner = (id = "p1", name = "north", crewId: string | null = null, companyId = "a") =>
  ({ id, name, crewId, companyId });
const team = (leaderUserId = "u1", companyId = "a", crewId: string | null = null) =>
  ({ id: "t1", leaderUserId, companyId, crewId });

describe("standing crew link proposals", () => {
  it("matches trimmed case-insensitive names and a unique supervisor", () => {
    const result = proposeCrewLinks([crew()], [planner("p1", " NORTH ")], [team()]);
    expect(result.plannerLinks).toEqual([{ id: "p1", crewId: "s1" }]);
    expect(result.campaignLinks).toEqual([{ id: "t1", crewId: "s1" }]);
  });
  it("leaves duplicate standing names ambiguous", () => {
    const r = proposeCrewLinks([crew(), crew("s2", "a", " NORTH ", "u2")], [planner()], []);
    expect(r.plannerLinks).toEqual([]);
    expect(r.counters.get("a")).toMatchObject({ ambiguous: 1, unmatched: 0 });
  });
  it("never overwrites an existing planner or campaign link", () => {
    const r = proposeCrewLinks([crew()], [planner("p1", "North", "old")], [team("u1", "a", "old")]);
    expect(r.plannerLinks).toEqual([]);
    expect(r.campaignLinks).toEqual([]);
  });
  it("never claims a standing crew already owned by another planner", () => {
    const r = proposeCrewLinks([crew()], [planner("p0", "Other", "s1"), planner()], []);
    expect(r.plannerLinks).toEqual([]);
    expect(r.counters.get("a")?.unmatched).toBe(1);
  });
  it("allows only one of competing planner columns to claim a target", () => {
    const r = proposeCrewLinks([crew()], [planner("p2"), planner("p1")], []);
    expect(r.plannerLinks).toEqual([{ id: "p1", crewId: "s1" }]);
    expect(r.counters.get("a")).toMatchObject({ plannerLinked: 1, unmatched: 1 });
  });
  it("leaves ambiguous campaign supervisors unlinked", () => {
    const r = proposeCrewLinks([crew(), crew("s2", "a", "South")], [], [team()]);
    expect(r.campaignLinks).toEqual([]);
    expect(r.counters.get("a")?.campaignUnmatched).toBe(1);
  });
  it("does not match inactive standing crews", () => {
    expect(proposeCrewLinks([{ ...crew(), isActive: false }], [planner()], [team()]).plannerLinks).toEqual([]);
    expect(proposeCrewLinks([{ ...crew(), isActive: false }], [], [team()]).campaignLinks).toEqual([]);
  });
  it("isolates names and supervisors by company", () => {
    const r = proposeCrewLinks([crew("s2", "b")], [planner()], [team()]);
    expect(r.plannerLinks).toEqual([]);
    expect(r.campaignLinks).toEqual([]);
  });
  it("proposes zero changes after applying a first run", () => {
    const s = [crew()];
    const first = proposeCrewLinks(s, [planner()], [team()]);
    expect(first.plannerLinks).toHaveLength(1);
    const second = proposeCrewLinks(s, [planner("p1", "north", "s1")], [team("u1", "a", "s1")]);
    expect(second.plannerLinks).toHaveLength(0);
    expect(second.campaignLinks).toHaveLength(0);
  });
});
