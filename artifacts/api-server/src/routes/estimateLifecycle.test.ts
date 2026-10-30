import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ transitionEstimate: vi.fn(), log: vi.fn() }));
vi.mock("../services/estimateLifecycle", () => mocks);
vi.mock("../lib/logger", () => ({ logger: { error: mocks.log } }));
import { registerEstimateRoutes } from "./estimates";
import { EstimateError } from "../services/estimateErrors";
const endpoints = [
  ["post", "/api/estimates/e/versions/v/send", "send", { method: "email" }],
  ["post", "/api/estimates/e/versions/v/accept", "accept", { method: "phone", acceptedOn: "2026-10-29" }],
  ["post", "/api/estimates/e/versions/v/decline", "decline", { reason: "Timing" }],
  ["post", "/api/estimates/e/versions/v/revise", "revise", {}],
  ["delete", "/api/estimates/e/versions/v", "discard", {}],
  ["post", "/api/estimates/e/void", "void", { reason: "Cancelled" }],
] as const;
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "actor", activeRole: role, activeCompanyId: company } as Express.User; next();
  });
  registerEstimateRoutes(app); return app;
}
beforeEach(() => { vi.resetAllMocks(); mocks.transitionEstimate.mockResolvedValue({ id: "e", versions: [], version: { id: "v" } }); });
describe("all six lifecycle route boundaries", () => {
  it.each(endpoints)("%s %s guards every role, company and initiating-company header", async (method, url, action, body) => {
    for (const role of [null, "field", "field_manager", "landscape_supervisor", "crew_supervisor", "chemical_manager", "irrigation_manager", "shop_manager", "mapping"]) {
      const res = await request(appFor(role))[method](url).send(body);
      expect(res.status).toBe(role === null ? 401 : 403);
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(appFor("admin", null))[method](url).send(body)).status).toBe(403);
    expect((await request(appFor())[method](url).set("X-Company-Id", "b").send(body)).status).toBe(409);
    expect(mocks.transitionEstimate).not.toHaveBeenCalled();
    for (const role of ["admin", "office"]) {
      const res = await request(appFor(role))[method](url).set("X-Company-Id", "a").send(body);
      expect(res.status).toBe(200); expect(res.body.version.id).toBe("v");
      expect(mocks.transitionEstimate).toHaveBeenLastCalledWith("a", "actor", "e", action === "void" ? undefined : "v", action, body);
    }
  });
  it.each(endpoints)("%s %s validates strict bodies and hides database detail", async (method, url, _action, body) => {
    expect((await request(appFor())[method](url).send({ ...body, private: "NO" })).status).toBe(400);
    expect(mocks.transitionEstimate).not.toHaveBeenCalled();
    mocks.transitionEstimate.mockRejectedValue({ cause: { code: "23505", detail: "SECRET" } });
    expect((await request(appFor())[method](url).send(body)).body).toEqual({ error: "CONFLICT" });
    mocks.transitionEstimate.mockRejectedValue({ code: "XX000", detail: "SECRET" });
    const res = await request(appFor())[method](url).send(body);
    expect(res.status).toBe(500); expect(res.body).toEqual({ error: "INTERNAL_ERROR" });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("SECRET");
  });
  it.each(["INVALID_TRANSITION", "DRAFT_EXISTS", "LINES_NEED_PRICE", "HAS_ACCEPTED_VERSION"])("preserves structured %s conflicts", async error => {
    const extra = { versionId: "draft", lineIds: ["l"], from: "accepted", action: "send" };
    mocks.transitionEstimate.mockRejectedValue(new EstimateError(409, error, extra));
    const res = await request(appFor()).post(endpoints[0][1]).send(endpoints[0][3]);
    expect(res.status).toBe(409); expect(res.body).toEqual({ error, ...extra });
  });
  it("rejects blank reasons, wrong enums and impossible dates before writes", async () => {
    for (const [action, body] of [["send", { method: "Email" }], ["accept", { method: "phone", acceptedOn: "2026-02-29" }], ["decline", { reason: " " }]] as const)
      expect((await request(appFor()).post(`/api/estimates/e/versions/v/${action}`).send(body)).status).toBe(400);
    expect((await request(appFor()).post("/api/estimates/e/void").send({ reason: "" })).status).toBe(400);
    expect(mocks.transitionEstimate).not.toHaveBeenCalled();
  });
});
