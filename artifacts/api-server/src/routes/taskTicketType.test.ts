import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATUS_KEY_BACKFILL, TICKET_TYPE_CAPABILITIES } from "../shared/ticketCapabilities";

const storage = vi.hoisted(() => ({
  getTicketTypes: vi.fn(), createTicketType: vi.fn(),
  getTicketTypeStatuses: vi.fn(), createTicketTypeStatus: vi.fn(),
  getTicketTypeFields: vi.fn(), createTicketTypeField: vi.fn(),
}));
vi.mock("../storage", () => ({ storage }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../auth", () => ({ setupAuth: vi.fn(), hashPassword: vi.fn() }));
import { ensureTaskTicketType, ensureEstimateRequestTicketType, ensureProjectTicketType } from "./routes";

describe("Task seeding and keyed status map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getTicketTypes.mockResolvedValue([]);
    storage.createTicketType.mockImplementation(async value => ({ ...value, id: "task-type" }));
    storage.getTicketTypeStatuses.mockResolvedValue([]);
    storage.createTicketTypeStatus.mockImplementation(async value => ({ ...value, id: `status-${value.statusKey}` }));
    storage.getTicketTypeFields.mockResolvedValue([]);
  });

  it("seeds Task with per-ticket invoicing and returns all statuses keyed by stable identity", async () => {
    const result = await ensureTaskTicketType("company");
    expect(storage.createTicketType).toHaveBeenCalledWith(expect.objectContaining({
      name: "Task", typeKey: "task", ...TICKET_TYPE_CAPABILITIES.Task,
    }));
    expect([...result!.statuses.keys()]).toEqual([...new Set(Object.values(STATUS_KEY_BACKFILL.Task))]);
    expect(storage.createTicketTypeStatus.mock.calls.map(([value]) => [value.statusKey, value.displayOrder])).toEqual([
      ["new", 0], ["ready_to_schedule", 1], ["scheduled", 2], ["in_progress", 3],
      ["work_completed", 4], ["ready_for_billing", 5], ["closed_won", 6],
    ]);
    expect(storage.createTicketTypeField).toHaveBeenCalledWith(expect.objectContaining({
      statusId: "status-work_completed",
    }));
  });

  it("reuses renamed keyed Task and statuses without duplicate creation", async () => {
    storage.getTicketTypes.mockResolvedValue([{ id: "existing-type", name: "Field Jobs", typeKey: "task" }]);
    storage.getTicketTypeStatuses.mockResolvedValue(
      [...new Set(Object.values(STATUS_KEY_BACKFILL.Task))].map(statusKey => ({
        id: `existing-${statusKey}`, name: `Renamed ${statusKey}`, statusKey,
      })),
    );
    storage.getTicketTypeFields.mockResolvedValue([
      { fieldKey: "completion_date" }, { fieldKey: "actual_hours" }, { fieldKey: "completion_notes" },
    ]);
    const result = await ensureTaskTicketType("company");
    expect(result!.statuses.get("ready_for_billing")).toBe("existing-ready_for_billing");
    expect(storage.createTicketType).not.toHaveBeenCalled();
    expect(storage.createTicketTypeStatus).not.toHaveBeenCalled();
    expect(storage.createTicketTypeField).not.toHaveBeenCalled();
  });

  it.each([
    [ensureEstimateRequestTicketType, ["new", "estimating", "proposal_draft", "proposal_sent", "decision_received",
      "ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing", "closed_lost"]],
    [ensureProjectTicketType, ["new", "ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing", "closed_lost"]],
  ] as const)("seeds the target Estimate/Project order", async (ensure, keys) => {
    await ensure("company");
    expect(storage.createTicketTypeStatus.mock.calls.map(([value]) => [value.statusKey, value.displayOrder]))
      .toEqual(keys.map((key, index) => [key, index]));
  });

  it("reuses a legacy unkeyed Ready to Schedule instead of creating another scheduling step", async () => {
    storage.getTicketTypes.mockResolvedValue([{ id: "existing-type", name: "Field Jobs", typeKey: "task" }]);
    storage.getTicketTypeStatuses.mockResolvedValue([
      { id: "legacy-ready", name: "Ready to Schedule", statusKey: null },
    ]);
    const result = await ensureTaskTicketType("company");
    expect(result!.statuses.get("ready_to_schedule")).toBe("legacy-ready");
    expect(storage.createTicketTypeStatus.mock.calls.some(([value]) => value.statusKey === "ready_to_schedule")).toBe(false);
  });
});