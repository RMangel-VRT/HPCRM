import { describe, expect, it } from "vitest";
import { buildLanes, orderSelection, pacePerDay, startWarnings, stepTarget, windowSpan, workingDaysInclusive, type RoundItem } from "./roundLists";

const item = (id: string, crew: string | null, pos: number | null, status = "pending") =>
  ({ id, customerName: id, assignedCampaignCrewId: crew, crewPosition: pos, status }) as unknown as RoundItem;
const teams = [{ id: "t1", crewId: "c1", name: "North", color: "#123" }, { id: "t2", crewId: null, name: "South", color: "#456" }];

describe("round list helpers", () => {
  it("counts Mon-Sat inclusive working days", () => {
    expect(workingDaysInclusive("2025-04-07", "2025-04-13")).toBe(6); // Mon..Sun
    expect(workingDaysInclusive("2025-04-13", "2025-04-13")).toBe(0);
    expect(pacePerDay(12, "2025-04-07", "2025-04-12")).toBe(2);
    expect(pacePerDay(5, "2025-04-14", "2025-04-12")).toBeNull();
  });
  it("orders open work by crew position and keeps closed work outside priority", () => {
    const lanes = buildLanes([item("b", "t1", 2), item("a", "t1", 1), item("x", "t1", 0, "completed"), item("u", null, null)], teams);
    expect(lanes.map(l => l.key)).toEqual(["unassigned", "t1", "t2"]);
    expect(lanes[1].open.map(i => i.id)).toEqual(["a", "b"]);
    expect(lanes[1].closed.map(i => i.id)).toEqual(["x"]);
    expect(orderSelection(lanes, new Set(["b", "u", "a"]))).toEqual(["u", "a", "b"]);
  });
  it("computes keyboard step targets", () => {
    const open = [item("a", "t1", 1), item("b", "t1", 2), item("c", "t1", 3)];
    expect(stepTarget(open, "b", -1)).toBe("a");
    expect(stepTarget(open, "a", 1)).toBe("c");
    expect(stepTarget(open, "b", 1)).toBeNull();
    expect(stepTarget(open, "a", -1)).toBeUndefined();
    expect(stepTarget(open, "c", 1)).toBeUndefined();
  });
  it("warns about unassigned rows and teams without an active linked crew", () => {
    const w = startWarnings([item("u", null, null), item("d", null, null, "completed")], teams, [{ id: "c1", name: "N" }]);
    expect(w).toEqual({ unassigned: 1, unlinkedTeams: ["South"] });
  });
  it("clips round windows to visible days", () => {
    const days = ["2025-04-07", "2025-04-08", "2025-04-09"];
    expect(windowSpan(days, "2025-04-01", "2025-04-08")).toEqual({ col: 1, span: 2 });
    expect(windowSpan(days, "2025-05-01", "2025-05-08")).toBeNull();
  });
});
