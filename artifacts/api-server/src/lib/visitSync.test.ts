import { describe, expect, it } from "vitest";
import { insertVisitSchema, type Visit, type Ticket, type TicketTypeStatus } from "@workspace/db";
import { winningVisit } from "./visitSync";
import { companyNoon, companyDateString, companyDayBounds, companyToday } from "./companyDay";
import { applySchedulingTransition } from "./schedulingTransition";

const visit = (id: string, visitDate: string, routeOrder: number | null = null, startTime: string | null = null) => ({ id, visitDate, routeOrder, startTime }) as Visit;
const statuses = [
  { id: "ready", statusKey: "ready_to_schedule", name: "Renamed needs" },
  { id: "scheduled", statusKey: "scheduled", name: "Renamed booked" },
  { id: "progress", statusKey: "in_progress" },
] as TicketTypeStatus[];
const ticket = { currentStatusId: "ready", crewId: null, dueDate: null } as Ticket;

describe("visits calendar and shared transition", () => {
  it.each([
    ["2026-03-07", "2026-03-07T19:00:00.000Z"],
    ["2026-03-08", "2026-03-08T18:00:00.000Z"],
    ["2026-11-01", "2026-11-01T19:00:00.000Z"],
    ["2026-10-13", "2026-10-13T18:00:00.000Z"],
  ])("resolves %s to Colorado noon independent of host TZ", (day, instant) => {
    const noon = companyNoon(day);
    expect(noon.toISOString()).toBe(instant);
    expect(companyDateString(noon)).toBe(day);
    const bounds = companyDayBounds(day);
    expect(noon >= bounds.start && noon < bounds.end).toBe(true);
  });
  it("at 8 pm Colorado, Today still includes that day's noon and excludes tomorrow", () => {
    const now = new Date("2026-10-13T20:00:00-06:00");
    expect(companyToday(now)).toBe("2026-10-13");
    const { start, end } = companyDayBounds(companyToday(now));
    expect(companyNoon("2026-10-13") >= start && companyNoon("2026-10-13") < end).toBe(true);
    expect(companyNoon("2026-10-14") < end).toBe(false);
  });
  it("chooses earliest upcoming otherwise latest past, with deterministic route/time/id ties", () => {
    const rows = [visit("past", "2026-10-12"), visit("next", "2026-10-20"), visit("today", "2026-10-13")];
    expect(winningVisit(rows, "2026-10-13")?.id).toBe("today");
    expect(winningVisit(rows, "2026-10-21")?.id).toBe("next");
    expect(winningVisit([visit("b", "2026-10-20", 1, "09:00"), visit("a", "2026-10-20", 1, "09:00"), visit("z", "2026-10-20", null)], "2026-10-13")?.id).toBe("a");
  });
  it("uses one scheduling rule and exact history notes", () => {
    const body = { crewId: "crew", dueDate: new Date() } as Record<string, unknown>;
    applySchedulingTransition(body, ticket, statuses);
    expect(body).toMatchObject({ currentStatusId: "scheduled", statusChangeNotes: "Crew and date set" });
    const clear = { crewId: null } as Record<string, unknown>;
    applySchedulingTransition(clear, { ...ticket, currentStatusId: "scheduled" }, statuses);
    expect(clear).toMatchObject({ currentStatusId: "ready", statusChangeNotes: "Crew or date cleared" });
  });
  it.each([null, "ready", "progress"])("explicit status %s wins", currentStatusId => {
    const body = { currentStatusId, crewId: "crew", dueDate: new Date() };
    applySchedulingTransition(body, ticket, statuses);
    expect(body.currentStatusId).toBe(currentStatusId);
    expect(body).not.toHaveProperty("statusChangeNotes");
  });
  it("follow-up-only and in-progress tickets never infer status", () => {
    const followUp = { followUpDate: "2026-10-20" };
    applySchedulingTransition(followUp, { ...ticket, crewId: "crew", dueDate: new Date() }, statuses);
    expect(followUp).not.toHaveProperty("currentStatusId");
    const body = { crewId: null };
    applySchedulingTransition(body, { ...ticket, currentStatusId: "progress" }, statuses);
    expect(body).not.toHaveProperty("currentStatusId");
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "0000-01-01", "2026-1-01"])("rejects impossible visit date %s", visitDate => {
    expect(insertVisitSchema.safeParse({ companyId: "c", ticketId: "t", visitDate }).success).toBe(false);
  });
  it.each(["24:00", "12:60", "1:00", "noon"])("rejects time %s", startTime => {
    expect(insertVisitSchema.safeParse({ companyId: "c", ticketId: "t", visitDate: "2026-02-28", startTime }).success).toBe(false);
  });
  it("validates source-specific identities, enums, defaults and bounded nullable hours", () => {
    const base = { companyId: "c", visitDate: "2024-02-29" };
    expect(insertVisitSchema.safeParse(base).success).toBe(false);
    expect(insertVisitSchema.safeParse({ ...base, sourceType: "internal" }).success).toBe(false);
    expect(insertVisitSchema.parse({ ...base, sourceType: "internal", title: " Trip ", estimatedHours: 0 })).toMatchObject({ title: "Trip", status: "planned" });
    expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", estimatedHours: 24 }).success).toBe(true);
    expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", estimatedHours: 24.1 }).success).toBe(false);
    expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", estimatedHours: -1 }).success).toBe(false);
    expect(insertVisitSchema.safeParse({ ...base, ticketId: "t", status: "wrong" }).success).toBe(false);
  });
});
