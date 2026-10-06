import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getTicketTypes: vi.fn(), getTicketTypeStatuses: vi.fn() }));
vi.mock("../storage", () => ({ storage }));
import { registerSchedulingStatusRoute } from "./schedulingStatus";

function app(authenticated = true) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    (req as any).user = { id: "owner", activeCompanyId: "company", activeRole: "field_manager" };
    next();
  });
  registerSchedulingStatusRoute(app);
  return app;
}

describe("GET /api/scheduling-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getTicketTypes.mockResolvedValue([]);
    storage.getTicketTypeStatuses.mockResolvedValue([]);
  });

  it("requires authentication without reading data", async () => {
    expect((await request(app(false)).get("/api/scheduling-status")).status).toBe(401);
    expect(storage.getTicketTypes).not.toHaveBeenCalled();
  });

  it("returns every Needs scheduling ID across renamed seeded types and preserves first legacy ID", async () => {
    storage.getTicketTypes.mockResolvedValue(["estimate_request", "project", "task", "todo"].map(typeKey => ({
      id: typeKey, typeKey, name: "Editable name",
    })));
    storage.getTicketTypeStatuses.mockImplementation(async (id: string) => [
      { id: `${id}-ready`, statusKey: "ready_to_schedule", name: "Renamed" },
      { id: `${id}-ready-2`, statusKey: "ready_to_schedule", name: "Renamed again" },
      { id: `${id}-other`, statusKey: "scheduled", name: "Needs scheduling" },
    ]);
    const response = await request(app()).get("/api/scheduling-status");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      schedulingStatusId: "estimate_request-ready",
      schedulingStatusIds: ["estimate_request-ready", "estimate_request-ready-2", "project-ready", "project-ready-2", "task-ready", "task-ready-2"],
    });
    expect(storage.getTicketTypes).toHaveBeenCalledWith("company");
    expect(storage.getTicketTypeStatuses.mock.calls).toEqual([["estimate_request"], ["project"], ["task"]]);
  });

  it("supports a Task-only company and returns an empty plural set when absent", async () => {
    storage.getTicketTypes.mockResolvedValue([{ id: "task", typeKey: "task", name: "Renamed work" }]);
    storage.getTicketTypeStatuses.mockResolvedValue([{ id: "ready", statusKey: "ready_to_schedule", name: "Renamed" }]);
    expect((await request(app()).get("/api/scheduling-status")).body).toEqual({
      schedulingStatusId: "ready", schedulingStatusIds: ["ready"],
    });
    storage.getTicketTypeStatuses.mockResolvedValue([]);
    expect((await request(app()).get("/api/scheduling-status")).body).toMatchObject({
      schedulingStatusId: null, schedulingStatusIds: [],
    });
    storage.getTicketTypes.mockResolvedValue([]);
    expect((await request(app()).get("/api/scheduling-status")).body).toMatchObject({
      schedulingStatusId: null, schedulingStatusIds: [],
    });
  });
});
