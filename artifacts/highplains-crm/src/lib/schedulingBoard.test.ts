import { describe, expect, it, vi } from "vitest";
import {
  capacityBarColor, capacityPct, daysLate, groupQueue, isoWeekNumber,
  queueGroupOf, scheduleByUrgency, boardKeyboardCoordinates, paneScrollVelocity, keepOverlayInViewport,
} from "./schedulingBoard";
import { capacityTone } from "./scheduling";

describe("scheduling board presentation (company calendar dates)", () => {
  it("groups by current Colorado week, retains server order and puts undated jobs in Later", () => {
    const items = [
      { id: "late-b", scheduleBy: "2026-10-20" },
      { id: "undated", scheduleBy: null },
      { id: "week-b", scheduleBy: "2026-11-01" },
      { id: "late-a", scheduleBy: "2026-10-19" },
      { id: "today", scheduleBy: "2026-10-27" },
      { id: "future", scheduleBy: "2026-11-02" },
    ];
    const groups = groupQueue(items, "2026-10-27");
    expect(groups.past.map(i => i.id)).toEqual(["late-b", "late-a"]);
    expect(groups.week.map(i => i.id)).toEqual(["week-b", "today"]);
    expect(groups.later.map(i => i.id)).toEqual(["undated", "future"]);
    expect(queueGroupOf(null, "2026-10-27")).toBe("later");
  });

  it.each([
    ["2026-10-26", "late"], ["2026-10-27", "soon"], ["2026-10-29", "soon"],
    ["2026-10-30", "normal"], [null, "normal"],
  ] as const)("schedule-by %s has urgency %s", (date, expected) => {
    expect(scheduleByUrgency(date, "2026-10-27")).toBe(expected);
  });

  it("counts late calendar days across daylight-saving and year boundaries", () => {
    expect(daysLate("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysLate("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysLate("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysLate("2026-10-28", "2026-10-27")).toBe(0);
    expect(daysLate(null, "2026-10-27")).toBe(0);
  });

  it.each([[89, "ok"], [90, "amber"], [100, "amber"], [101, "red"]] as const)(
    "retains capacity threshold at %s%%", (hours, tone) => {
      expect(capacityTone(hours, 100)).toBe(tone);
      expect(capacityBarColor(tone, "var(--crew)")).toBe(
        tone === "ok" ? "var(--crew)" : tone === "amber" ? "hsl(var(--warning))" : "hsl(var(--destructive))",
      );
      expect(capacityPct(hours, 100)).toBe(Math.min(hours, 100));
    },
  );

  it("bounds capacity fill at zero capacity", () => {
    expect(capacityPct(1, 0)).toBe(100);
    expect(capacityPct(0, 0)).toBe(0);
  });

  it("uses ISO week numbers at year transitions", () => {
    expect(isoWeekNumber("2026-10-27")).toBe(44);
    expect(isoWeekNumber("2027-01-01")).toBe(53);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
  });

  it("uses exact 48px pane edges and caps speed even when leaving a pane", () => {
    const rect = { left: 320, right: 1000, top: 100, bottom: 700 };
    expect(paneScrollVelocity({ x: 800, y: 650 }, rect)).toEqual({ x: 0, y: 0 });
    expect(paneScrollVelocity({ x: 976, y: 676 }, rect)).toEqual({ x: 125, y: 125 });
    expect(paneScrollVelocity({ x: 1000, y: 700 }, rect)).toEqual({ x: 250, y: 250 });
    expect(paneScrollVelocity({ x: 320, y: 100 }, rect)).toEqual({ x: -250, y: -250 });
    expect(paneScrollVelocity({ x: 1001, y: 700 }, rect)).toEqual({ x: 0, y: 0 });
    expect(paneScrollVelocity({ x: 320, y: 99 }, rect)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the portal overlay inside the viewport including its rotation margin", () => {
    const result = keepOverlayInViewport({
      transform: { x: 500, y: 500, scaleX: 1, scaleY: 1 },
      overlayNodeRect: { left: 900, right: 1160, top: 600, bottom: 760, width: 260, height: 160 },
      windowRect: { width: 1000, height: 800 },
    } as any);
    expect(result.x).toBe(-168);
    expect(result.y).toBe(32);
    expect(result.scaleX).toBe(1);
  });
});

describe("keyboard coordinates over actual board targets", () => {
  const rect = (x: number, y: number, w = 100, h = 80) => ({
    left: x, top: y, right: x + w, bottom: y + h, width: w, height: h,
  });
  function context() {
    const targets = [
      { id: "cell:k1:2026-10-27" }, { id: "cell:k1:2026-10-28" },
      { id: "cell:k2:2026-10-27" }, { id: "visit:sibling" }, { id: "not-a-board-target" },
    ];
    return {
      active: { id: "queue:q" },
      collisionRect: rect(0, 0),
      droppableRects: new Map([
        ["cell:k1:2026-10-27", rect(200, 0)], ["cell:k1:2026-10-28", rect(300, 0)],
        ["cell:k2:2026-10-27", rect(200, 300)], ["visit:sibling", rect(200, 100)],
        ["not-a-board-target", rect(100, 0)],
      ]),
      droppableContainers: { getEnabled: () => targets },
    };
  }

  it("moves a queue card to an enabled cell, not an unrelated or disabled target", () => {
    const preventDefault = vi.fn();
    const result = boardKeyboardCoordinates(
      { code: "ArrowRight", preventDefault } as any,
      { context: context(), currentCoordinates: { x: 0, y: 0 } } as any,
    );
    expect(result).toEqual({ x: 200, y: 0 });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("can move from a cell to its sibling visit for within-cell reordering", () => {
    const ctx = context();
    ctx.active = { id: "visit:source" };
    ctx.collisionRect = rect(200, 0);
    expect(boardKeyboardCoordinates(
      { code: "ArrowDown", preventDefault: vi.fn() } as any,
      { context: ctx, currentCoordinates: { x: 200, y: 0 } } as any,
    )).toEqual({ x: 200, y: 100 });
  });

  it("stops at the edge and leaves activation/cancel keys to the keyboard sensor", () => {
    const ctx = context();
    const coordinates = { x: 0, y: 0 };
    expect(boardKeyboardCoordinates(
      { code: "ArrowLeft", preventDefault: vi.fn() } as any,
      { context: ctx, currentCoordinates: coordinates } as any,
    )).toEqual(coordinates);
    expect(boardKeyboardCoordinates(
      { code: "Escape", preventDefault: vi.fn() } as any,
      { context: ctx, currentCoordinates: coordinates } as any,
    )).toBeUndefined();
  });
});
