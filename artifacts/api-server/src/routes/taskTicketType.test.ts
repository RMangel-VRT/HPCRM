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
import { ensureTaskTicketType } from "./routes";

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
    expect([...result!.statuses.keys()]).toEqual(Object.values(STATUS_KEY_BACKFILL.Task));
    expect(storage.createTicketTypeField).toHaveBeenCalledWith(expect.objectContaining({
      statusId: "status-work_completed",
    }));
  });

  it("reuses renamed keyed Task and statuses without duplicate creation", async () => {
    storage.getTicketTypes.mockResolvedValue([{ id: "existing-type", name: "Field Jobs", typeKey: "task" }]);
    storage.getTicketTypeStatuses.mockResolvedValue(
      Object.values(STATUS_KEY_BACKFILL.Task).map(statusKey => ({
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
});