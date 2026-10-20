import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  capacityTone, mergeReorder, mondayOf, parseServerError, syncMessage, weekDays, weekFromSearch, weekToSearch,
} from "./scheduling";
import { openVisitGuard } from "../hooks/use-scheduling";
import { companyToday } from "./schedulingStatus";

describe("week URL", () => {
  it("keeps 8 pm Colorado on its own day even when UTC has advanced", () => {
    expect(companyToday(new Date("2026-10-14T02:00:00Z"))).toBe("2026-10-13");
  });
  it("round-trips a Monday and normalizes other dates/garbage", () => {
    expect(weekFromSearch(weekToSearch("2025-10-20"), "2025-01-01")).toBe("2025-10-20");
    expect(weekFromSearch("?week=2025-10-23", "2025-01-01")).toBe("2025-10-20");
    expect(weekFromSearch("?week=2025-10-26", "2025-01-01")).toBe("2025-10-20");
    expect(weekFromSearch("?week=nope", "2025-10-22")).toBe("2025-10-20");
    expect(mondayOf("2025-10-20")).toBe("2025-10-20");
  });
  it("shows Mon-Sat with optional Sunday", () => {
    expect(weekDays("2025-10-20", false)).toHaveLength(6);
    expect(weekDays("2025-10-20", true).at(-1)).toBe("2025-10-26");
  });
});

describe("capacity tone", () => {
  it.each([[7.12, 8, "ok"], [7.2, 8, "amber"], [8, 8, "amber"], [8.08, 8, "red"]])("%s/%s -> %s", (h, c, tone) => {
    expect(capacityTone(h, c)).toBe(tone);
  });
  it("89/90/101 percent", () => {
    expect(capacityTone(89, 100)).toBe("ok");
    expect(capacityTone(90, 100)).toBe("amber");
    expect(capacityTone(101, 100)).toBe("red");
  });
});

describe("reorder merge", () => {
  it("keeps hidden visits in their slots", () => {
    expect(mergeReorder(["a", "h", "b"], ["b", "a"])).toEqual(["b", "h", "a"]);
  });
});

describe("messages", () => {
  it("parses server errors", () => {
    expect(parseServerError(new Error('409: {"error":"MULTIPLE_VISITS","message":"Several"}'))).toEqual({ message: "Several", code: "MULTIPLE_VISITS" });
    expect(parseServerError(new Error("500: boom")).message).toBe("boom");
  });
  it("uses ticketSync only", () => {
    expect(syncMessage({ statusChanged: true, newStatusKey: "scheduled" }, { title: "Fall Aeration", crewName: "Crew 2", date: "2025-10-21" })?.title).toBe("Fall Aeration → Scheduled (Crew 2, Tue, Oct 21)");
    expect(syncMessage({ statusChanged: false, newStatusKey: null }, { title: "x" })).toBeNull();
    expect(syncMessage({ statusChanged: true, newStatusKey: "ready_to_schedule" }, { removed: true })?.title).toBe("Back to Needs scheduling");
    expect(syncMessage({ statusChanged: true, newStatusKey: "closed" }, { removed: true })?.title).not.toBe("Back to Needs scheduling");
  });
});

describe("open-visit guard", () => {
  const v = (status: string) => ({ status }) as never;
  it("never treats pending, failed or refetching history as empty", () => {
    expect(openVisitGuard({ data: undefined, isError: false, refetch: () => 0 }).state).toBe("unknown");
    expect(openVisitGuard({ data: undefined, isError: true, refetch: () => 0 }).state).toBe("unknown");
    expect(openVisitGuard({ data: [], isError: false, isFetching: true, refetch: () => 0 }).state).toBe("unknown");
  });
  it("counts planned and in_progress as open; closed history is zero-open", () => {
    expect(openVisitGuard({ data: [v("in_progress")], isError: false, refetch: () => 0 })).toMatchObject({ state: "ready", hasOpen: true });
    expect(openVisitGuard({ data: [v("done"), v("cancelled"), v("skipped")], isError: false, refetch: () => 0 })).toMatchObject({ state: "ready", hasOpen: false });
  });
});

describe("print isolation css", () => {
  it("hides everything except the crew-day sheet", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain("body.print-crew-day > *:not([data-crew-day-print]):not(:has([data-crew-day-print]))");
    expect(css).toMatch(/\[data-crew-day-print\]\s*\{\s*display: block !important;/);
  });
});
