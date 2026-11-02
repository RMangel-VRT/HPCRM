import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn(), fill: vi.fn(), ready: vi.fn() }));
vi.mock("../db", () => ({ db: { execute: mocks.execute, transaction: mocks.transaction } }));
vi.mock("./routeSchema", () => ({ routeSchemaReady: mocks.ready }));
vi.mock("./routeFill", () => ({ fillRouteVisitsInTransaction: mocks.fill }));
import { runRouteNight, startRouteScheduler, stopRouteScheduler } from "./routeScheduler";
import { routeSchemaReady } from "./routeSchema";

afterEach(() => { stopRouteScheduler(); vi.useRealTimers(); vi.clearAllMocks(); });
describe("nightly rollout and lifecycle safety", () => {
  it("does not query route/company columns on an unmigrated database", async () => {
    mocks.ready.mockResolvedValue(false);
    expect(await runRouteNight(new Date("2027-03-14T09:00:00Z"))).toEqual({ ran: 0 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.fill).not.toHaveBeenCalled();
  });
  it("does nothing before Colorado 02:00 without even probing schema", async () => {
    expect(await runRouteNight(new Date("2027-03-14T08:30:00Z"))).toEqual({ ran: 0 });
    expect(routeSchemaReady).not.toHaveBeenCalled();
  });
  it("starts one interval, skips overlapping local ticks and stops cleanly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-14T09:00:00Z"));
    let release!: (value: boolean) => void;
    mocks.ready.mockReturnValue(new Promise<boolean>(resolve => { release = resolve; }));
    startRouteScheduler(); startRouteScheduler();
    await vi.advanceTimersByTimeAsync(180000);
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    release(false);
    await vi.advanceTimersByTimeAsync(0);
    stopRouteScheduler();
    await vi.advanceTimersByTimeAsync(180000);
    expect(mocks.ready).toHaveBeenCalledTimes(1);
  });
});
