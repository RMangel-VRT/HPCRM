import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fx = vi.hoisted(() => ({ transition: vi.fn(), read: vi.fn(), customer: vi.fn(), missing: vi.fn() }));
vi.mock("../services/estimateLifecycle", () => ({ transitionEstimate: fx.transition }));
vi.mock("../services/estimateReads", () => ({ readEstimate: fx.read, listEstimates: vi.fn() }));
vi.mock("../storage", () => ({ storage: { getCustomerById: fx.customer, getPropertyManagementCompanyById: vi.fn() } }));
vi.mock("../services/customerSetupValidation", () => ({ setupMissingFields: fx.missing }));
import { registerEstimateRoutes } from "./estimates";
function app() {
  const instance = express(); instance.use(express.json());
  instance.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: "actor", activeCompanyId: "co1", activeRole: "office" } as Express.User;
    next();
  });
  registerEstimateRoutes(instance); return instance;
}
beforeEach(() => {
  vi.clearAllMocks();
  fx.transition.mockResolvedValue({ id: "est1", customerId: "cu1", version: { id: "v1", status: "accepted" }, ticketId: "t1" });
  fx.read.mockResolvedValue({ customerId: "cu1" });
  fx.customer.mockResolvedValue({ id: "cu1", status: "prospect" });
  fx.missing.mockResolvedValue(["billingEmails"]);
});
describe("estimate win metadata", () => {
  it.each(["prospect", "active", "inactive"])("accept retains its result and enriches only %s prospects", async status => {
    fx.customer.mockResolvedValue({ id: "cu1", status });
    const response = await request(app()).post("/api/estimates/est1/versions/v1/accept").send({ acceptedOn: "2026-11-03", method: "email_approval" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "est1", ticketId: "t1", version: { status: "accepted" } });
    if (status === "prospect") expect(response.body.customerActivation).toEqual({ customerId: "cu1", status, missingFields: ["billingEmails"] });
    else expect(response.body.customerActivation).toBeUndefined();
    expect(fx.customer).toHaveBeenCalledWith("cu1", "co1");
  });
  it.each([
    ["send", { method: "email" }], ["decline", { reason: "Not now" }], ["revise", {}],
  ])("does not enrich %s", async (action, body) => {
    const response = await request(app()).post(`/api/estimates/est1/versions/v1/${action}`).send(body);
    expect(response.status).toBe(200);
    expect(response.body.customerActivation).toBeUndefined();
    expect(fx.customer).not.toHaveBeenCalled();
    expect(fx.read).not.toHaveBeenCalled();
  });
  it("keeps committed acceptance successful if advisory loading fails", async () => {
    fx.customer.mockRejectedValueOnce(new Error("advisory unavailable"));
    const response = await request(app()).post("/api/estimates/est1/versions/v1/accept").send({ acceptedOn: "2026-11-03", method: "email_approval" });
    expect(response.status).toBe(200); expect(response.body.customerActivation).toBeUndefined();
    expect(fx.transition).toHaveBeenCalledTimes(1);
  });
  it("rejects a stale initiating company before acceptance", async () => {
    expect((await request(app()).post("/api/estimates/est1/versions/v1/accept").set("X-Company-Id", "foreign").send({})).status).toBe(409);
    expect(fx.transition).not.toHaveBeenCalled();
  });
});
