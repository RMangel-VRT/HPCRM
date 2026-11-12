import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { runEstimateLifecycle } from "./estimateLifecycleActions";
import { sendEstimate } from "./estimateBuilder";
import { advanceLinkedTicket } from "./advanceLinkedTicket";
import type { EstimateDetailDto } from "@shared/schema";
vi.mock("./estimateBuilder", async original => ({
  ...await original<typeof import("./estimateBuilder")>(), sendEstimate: vi.fn(),
}));
vi.mock("./advanceLinkedTicket", () => ({ advanceLinkedTicket: vi.fn(), ticketRequest: vi.fn(() => vi.fn()) }));
const data = { id: "e", companyId: "c", ticketId: "ticket", customerId: "customer", version: { id: "v" } } as EstimateDetailDto;
function options() {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  return { kind: "accept" as const, method: "POST", url: "/api/estimates/e/versions/v/accept",
    companyId: "c", queryClient, isActive: () => true,
    t: (k: string) => k, toast: vi.fn(), offerActivation: vi.fn(), customerName: "Customer",
    install: vi.fn(async () => true), onCommitted: vi.fn() };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendEstimate).mockResolvedValue(data);
  vi.mocked(advanceLinkedTicket).mockResolvedValue({ moved: true, reason: null, ticketNumber: "ticket", statusName: "Ready" });
});
describe("shared lifecycle orchestration", () => {
  it.each(["send", "accept", "decline"] as const)("%s advances once, toasts and invalidates shared surfaces", async kind => {
    const o = { ...options(), kind };
    const result = await runEstimateLifecycle(o);
    expect(result).toEqual({ kind: "success", data });
    expect(sendEstimate).toHaveBeenCalledExactlyOnceWith("POST", o.url, "c", undefined);
    expect(advanceLinkedTicket).toHaveBeenCalledOnce();
    expect(o.install).toHaveBeenCalledWith(data);
    expect(o.onCommitted).toHaveBeenCalledOnce();
    expect(o.toast.mock.calls.map(([x]) => x.title)).toEqual([`estimateBuilder.life.done.${kind}`, "estimateTicket.moved"]);
    expect(o.offerActivation).toHaveBeenCalledTimes(kind === "accept" ? 1 : 0);
    const keys = vi.mocked(o.queryClient.invalidateQueries).mock.calls.map(([q]) => q?.queryKey?.[0]);
    for (const key of ["/api/estimates/board", "/api/estimates", "/api/tickets", "estimate-ticket-recovery"]) expect(keys).toContain(key);
  });
  it("never writes or shows old-scope feedback if scope changed before the response", async () => {
    const o = options(); let active = true; o.isActive = () => active;
    vi.mocked(sendEstimate).mockImplementation(async () => { active = false; return data; });
    expect(await runEstimateLifecycle(o)).toEqual({ kind: "stale" });
    expect(advanceLinkedTicket).not.toHaveBeenCalled();
    expect(o.toast).not.toHaveBeenCalled(); expect(o.offerActivation).not.toHaveBeenCalled();
    expect(o.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/estimates/board"] });
  });
  it("checks scope before starting and after install", async () => {
    const o = options(); o.isActive = () => false;
    expect((await runEstimateLifecycle(o)).kind).toBe("stale");
    expect(sendEstimate).not.toHaveBeenCalled();
    o.isActive = () => true; o.install.mockResolvedValue(false);
    expect((await runEstimateLifecycle(o)).kind).toBe("stale");
    expect(advanceLinkedTicket).not.toHaveBeenCalled();
  });
  it("committed lifecycle survives advancement failure and activation stays advisory", async () => {
    const o = options();
    vi.mocked(advanceLinkedTicket).mockResolvedValue({ moved: false, reason: "loadFailed" });
    expect((await runEstimateLifecycle(o)).kind).toBe("success");
    expect(o.offerActivation).toHaveBeenCalledOnce();
    expect(o.toast).toHaveBeenCalledTimes(1);
    expect(o.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["estimate-ticket-recovery"] });
  });
  it("returns the shared price-confirmation path without success effects", async () => {
    const o = { ...options(), kind: "send" as const };
    vi.mocked(sendEstimate).mockRejectedValue(new Error('409: {"error":"LINES_NEED_PRICE","lineIds":["line"]}'));
    expect(await runEstimateLifecycle(o)).toEqual({ kind: "needsPrice", lineIds: ["line"] });
    expect(advanceLinkedTicket).not.toHaveBeenCalled(); expect(o.toast).not.toHaveBeenCalled();
  });
  it.each(["INVALID_TRANSITION", "NO_LINES", "HAS_ACCEPTED_VERSION", "ESTIMATE_VOIDED", "CONFLICT", "DRAFT_EXISTS"])("translates %s once", async error => {
    const o = options(); vi.mocked(sendEstimate).mockRejectedValue(new Error(`409: ${JSON.stringify({ error })}`));
    expect(await runEstimateLifecycle(o)).toMatchObject({ kind: "error", message: `estimateBuilder.life.err.${error}`, status: 409 });
    expect(o.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/estimates/board"] });
  });
});
