import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListVisitsResponseItem, SchedulingQueueResponse } from "@workspace/api-zod";

const mocks = vi.hoisted(() => ({ select: vi.fn(), rows: [] as any[][], projections: [] as any[] }));
vi.mock("../db", () => ({ db: { select: mocks.select } }));
import { loadEnrichedVisits } from "./visitQueries";
import { loadSchedulingQueue } from "../routes/schedulingQueue";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.projections = [];
  mocks.select.mockImplementation(projection => {
    mocks.projections.push(projection);
    const rows = mocks.rows.shift() ?? [];
    const chain: any = {
      from: () => chain, innerJoin: () => chain, leftJoin: () => chain,
      where: () => chain, orderBy: () => Promise.resolve(rows),
    };
    return chain;
  });
});

describe("additive ticket display payloads", () => {
  it.each(["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"])(
    "enriches and serializes visit ticket identity at %s in one bulk read", async statusKey => {
      mocks.rows = [[{
        visit: { id: "visit", companyId: "company", crewId: null, visitDate: "2026-10-27", sourceType: "ticket",
          ticketId: "ticket", customerId: null, title: null, routeOrder: null, startTime: null, estimatedHours: null,
          status: "planned", notes: null, serviceKey: null, actualStartAt: null, actualEndAt: null,
          createdById: "user", createdAt: new Date(), updatedAt: new Date() },
        ticket: { id: "ticket", title: "Work", typeKey: "estimate_request", typeName: "Renamed estimate", statusKey,
          statusName: "Renamed stage", priority: "normal", scheduleBy: null },
        crew: null, customer: null,
      }]];
      const [visit] = await loadEnrichedVisits("company", []);
      expect(mocks.projections[0].ticket.statusKey).toBeDefined();
      expect(mocks.select).toHaveBeenCalledOnce();
      expect(ListVisitsResponseItem.parse(JSON.parse(JSON.stringify(visit))).ticket).toMatchObject({
        typeKey: "estimate_request", typeName: "Renamed estimate", displayTypeKey: "project", displayTypeName: "Project",
      });
    },
  );

  it("enriches both queue populations, preserves raw keys through parsing, and keeps the two-read budget", async () => {
    const row = (id: string, statusKey: string, typeKey = "estimate_request") => ({
      id, title: "Work", typeKey, typeName: "Renamed raw", statusKey, priority: "normal", scheduleBy: null,
      serviceType: null, followUpDate: null, createdAt: new Date(), customer: null,
    });
    mocks.rows = [[row("needs", "ready_to_schedule"), row("custom", "ready_to_schedule", "custom")], [row("slipped", "scheduled")]];
    const parsed = SchedulingQueueResponse.parse(JSON.parse(JSON.stringify(await loadSchedulingQueue("company"))));
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.projections.every(p => p.statusKey)).toBe(true);
    expect(parsed.needsScheduling[0]).toMatchObject({ typeKey: "estimate_request", typeName: "Renamed raw", displayTypeKey: "project", displayTypeName: "Project" });
    expect(parsed.slipped[0]).toMatchObject({ typeKey: "estimate_request", displayTypeKey: "project" });
    expect(parsed.needsScheduling[1]).toMatchObject({ typeKey: "custom", displayTypeKey: "custom", displayTypeName: "Renamed raw" });
  });

  it("retains empty queue and visit responses", async () => {
    expect(await loadEnrichedVisits("company", [])).toEqual([]);
    expect(SchedulingQueueResponse.parse(await loadSchedulingQueue("company"))).toEqual({ needsScheduling: [], slipped: [] });
  });
});
