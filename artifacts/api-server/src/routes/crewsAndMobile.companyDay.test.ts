import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { crews, tickets, users } from "@workspace/db";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("../db", () => ({ db: mocks }));
vi.mock("../mobileAuth", () => ({
  requireMobileAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  MOBILE_ALLOWED_ROLES: new Set(["crew_supervisor"]),
  authenticateMobileLogin: vi.fn(), issueMobileToken: vi.fn(), revokeTokenByHash: vi.fn(),
}));
vi.mock("./mobileTicketPhotosNotes", () => ({ workItemMissingRequiredPhoto: vi.fn() }));
vi.mock("../services/site-notes", () => ({ getSiteNotesForProperty: vi.fn(), serializeSiteNote: vi.fn() }));
vi.mock("../services/pushNotifications", () => ({ addPushSubscription: vi.fn(), removePushSubscription: vi.fn() }));
import { registerCrewsAndMobileRoutes } from "./crewsAndMobile";

type Stop = { id: string; dueDate: Date; mobileStatus: string; companyId: string; crewId: string; title: string };
let stops: Stop[];
let crewId: string | null;
let queries: { sql: string; params: unknown[] }[];
const stop = (id: string, instant: string, mobileStatus = "not_started", companyId = "company", crew = "crew"): Stop => ({
  id, dueDate: new Date(instant), mobileStatus, companyId, crewId: crew, title: id,
});

function app() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "supervisor", activeCompanyId: "company", activeRole: "crew_supervisor" };
    next();
  });
  registerCrewsAndMobileRoutes(app);
  return app;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T20:00:00-06:00"));
  crewId = "crew";
  stops = [];
  queries = [];
  mocks.select.mockImplementation((selection: any) => {
    let table: unknown;
    let query: { sql: string; params: any[] } | undefined;
    const result = () => {
      if (table === crews) return crewId ? [{ id: crewId, name: "Crew" }] : [];
      if (table === users) return [{ prefs: null, deviceCount: 0 }];
      if (table !== tickets || !query) return [];
      const { sql, params } = query;
      let matching = stops.filter(row => row.companyId === "company" && row.crewId === crewId);
      if (sql.includes('"tickets"."due_date" >=')) {
        const bounds = params.filter((value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value));
        expect(bounds).toHaveLength(2);
        const [start, end] = bounds.map((value: string) => new Date(value).getTime());
        matching = matching.filter(row => row.dueDate.getTime() >= start && row.dueDate.getTime() < end);
      } else if (sql.includes('"tickets"."id" =')) {
        matching = matching.filter(row => params.includes(row.id));
      }
      if (sql.includes("COALESCE")) matching = matching.filter(row => row.mobileStatus !== "complete");
      if (selection?.ticket) return matching.map(ticket => ({ ticket, customer: null }));
      return matching;
    };
    const builder: any = {
      from: (value: unknown) => { table = value; return builder; },
      where: (predicate: any) => {
        query = new PgDialect().sqlToQuery(predicate);
        if (table === tickets) queries.push(query!);
        return builder;
      },
      leftJoin: () => builder, innerJoin: () => builder,
      orderBy: () => builder, limit: () => builder,
      then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  });
});
afterEach(() => vi.useRealTimers());

describe("crew Colorado day routes", () => {
  it("selects today's stops at 8pm with half-open bounds and company/crew scoping", async () => {
    stops = [
      stop("before", "2026-10-08T23:59:59-06:00"),
      stop("midnight", "2026-10-09T00:00:00-06:00"),
      stop("evening", "2026-10-09T23:59:59-06:00"),
      stop("tomorrow", "2026-10-10T00:00:00-06:00"),
      stop("complete", "2026-10-09T12:00:00-06:00", "complete"),
      stop("foreign", "2026-10-09T12:00:00-06:00", "not_started", "other"),
      stop("other-crew", "2026-10-09T12:00:00-06:00", "not_started", "company", "other"),
    ];
    const response = await request(app()).get("/api/m/today");
    expect(response.status).toBe(200);
    expect(response.body.date).toBe("2026-10-09");
    expect(response.body.stops.map((row: any) => row.id)).toEqual(["midnight", "evening"]);
    expect(queries[0].sql).toContain('"tickets"."company_id" =');
    expect(queries[0].sql).toContain('"tickets"."crew_id" =');
    expect(queries[0].sql).toContain('"tickets"."due_date" <');
    expect(queries[0].params).toEqual(["company", "crew", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"]);
  });
  it("explicit historical date retains its calendar date and includes completed stops", async () => {
    stops = [stop("complete", "2026-10-08T23:00:00-06:00", "complete")];
    const response = await request(app()).get("/api/m/today?date=2026-10-08");
    expect(response.body.date).toBe("2026-10-08");
    expect(response.body.summary.complete).toBe(1);
    expect(queries[0].sql).not.toContain("COALESCE");
  });
  it.each([
    ["2026-03-08", "2026-03-08T07:00:00.000Z", "2026-03-09T06:00:00.000Z"],
    ["2026-11-01", "2026-11-01T06:00:00.000Z", "2026-11-02T07:00:00.000Z"],
  ])("explicit %s has DST-correct day bounds", async (date, start, end) => {
    const response = await request(app()).get(`/api/m/today?date=${date}`);
    expect(response.body.date).toBe(date);
    expect(queries[0].params).toEqual(["company", "crew", start, end]);
  });
  it.each([
    ["/api/m/today", "2026-10-09"],
    ["/api/m/today?date=2026-03-08", "2026-03-08"],
    ["/api/m/today?date=invalid", "2026-10-09"],
  ])("no-crew branch of %s reports %s", async (path, date) => {
    crewId = null;
    const response = await request(app()).get(path);
    expect(response.body).toMatchObject({ date, crewId: null, stops: [] });
  });
  it.each([
    ["2026-03-06", "2026-03-12", "2026-03-06T07:00:00.000Z", "2026-03-13T06:00:00.000Z", "2026-03-08T23:30:00-06:00", "2026-03-08"],
    ["2026-10-30", "2026-11-05", "2026-10-30T06:00:00.000Z", "2026-11-06T07:00:00.000Z", "2026-11-01T23:30:00-07:00", "2026-11-01"],
  ])("week from %s has exactly seven dates and Colorado buckets", async (date, last, start, end, late, bucket) => {
    stops = [stop("late", late, "complete"), stop("excluded", end)];
    const response = await request(app()).get(`/api/m/me/week?startDate=${date}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ startDate: date, endDate: last });
    expect(response.body.days).toHaveLength(7);
    expect(new Set(response.body.days.map((day: any) => day.date)).size).toBe(7);
    expect(response.body.days.find((day: any) => day.date === bucket)).toMatchObject({ total: 1, complete: 1 });
    expect(response.body.days.reduce((sum: number, day: any) => sum + day.total, 0)).toBe(1);
    expect(queries[0].params).toEqual(["company", "crew", start, end]);
    crewId = null;
    const empty = await request(app()).get(`/api/m/me/week?startDate=${date}`);
    expect(empty.body).toMatchObject({ startDate: date, endDate: last, crewId: null });
  });
  it("defaults week to Colorado today", async () => {
    const { body } = await request(app()).get("/api/m/me/week");
    expect(body.startDate).toBe("2026-10-09");
    expect(body.endDate).toBe("2026-10-15");
  });
  it.each([
    ["2026-03-08T20:00:00-06:00", "2026-03-08", "2026-03-15T06:00:00.000Z"],
    ["2026-11-01T20:00:00-07:00", "2026-11-01", "2026-11-08T07:00:00.000Z"],
  ])("sync has matching day and seven-day windows at %s", async (now, date, end) => {
    vi.setSystemTime(new Date(now));
    stops = [stop("late", now)];
    const response = await request(app()).get("/api/m/sync");
    expect(response.status).toBe(200);
    expect(response.body.today.date).toBe(date);
    expect(response.body.today.stops.map((row: any) => row.id)).toEqual(["late"]);
    expect(response.body.week.startDate).toBe(date);
    expect(response.body.week.days).toHaveLength(7);
    expect(response.body.week.days[0].total).toBe(1);
    expect(queries[1].params.at(-1)).toBe(end);
    crewId = null;
    const empty = await request(app()).get("/api/m/sync");
    expect(empty.body.today.date).toBe(date);
    expect(empty.body.week.startDate).toBe(date);
  });
  it("ticket history turns read-only at Colorado midnight, not UTC midnight", async () => {
    stops = [stop("today", "2026-10-09T08:00:00-06:00"), stop("yesterday", "2026-10-08T23:59:59-06:00")];
    const today = await request(app()).get("/api/m/tickets/today");
    const yesterday = await request(app()).get("/api/m/tickets/yesterday");
    expect(today.status).toBe(200);
    expect(today.body.readOnly).toBe(false);
    expect(yesterday.body.readOnly).toBe(true);
    vi.setSystemTime(new Date("2026-10-10T00:00:00-06:00"));
    const rolled = await request(app()).get("/api/m/tickets/today");
    expect(rolled.body.readOnly).toBe(true);
  });
});
