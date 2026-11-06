import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ load: vi.fn(), db: {} }));
vi.mock("../db", () => ({ db: f.db }));
vi.mock("../services/customerListSummary", () => ({ loadCustomerListSummary: f.load }));
import { registerCustomerListSummary } from "./customerListSummary";

let role = "admin", authenticated = true;
const app = () => {
  const a = express();
  a.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated,
      user: { activeCompanyId: "company", activeRole: role === "admin" ? "account_manager" : role, accessRole: role } });
    next();
  });
  registerCustomerListSummary(a); return request(a);
};
beforeEach(() => { vi.resetAllMocks(); role = "admin"; authenticated = true; f.load.mockResolvedValue({ summaries: {} }); });
describe("CP4 single customer list-summary request", () => {
  it("sends all page ids to one company-scoped batch, with no per-row calls", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `customer-${i}`);
    const r = await app().get(`/api/customers/list-summary?ids=${ids.join(",")}`).set("X-Company-Id", "company").expect(200);
    expect(f.load).toHaveBeenCalledExactlyOnceWith(f.db, "company", ids);
    expect(r.headers["cache-control"]).toBe("private, no-store");
  });
  it("deduplicates ids and permits maximum 200", async () => {
    await app().get("/api/customers/list-summary?ids=a,a,b").expect(200);
    expect(f.load).toHaveBeenLastCalledWith(f.db, "company", ["a", "b"]);
    await app().get(`/api/customers/list-summary?ids=${Array.from({ length: 200 }, (_, i) => i).join(",")}`).expect(200);
  });
  it.each(["", "?ids=", "?ids=a,,b", "?ids=%20a", `?ids=${"a".repeat(101)}`,
    `?ids=${Array.from({ length: 201 }, (_, i) => i).join(",")}`, "?ids[]=a"])("rejects invalid or excessive batch: %s", async suffix => {
    await app().get(`/api/customers/list-summary${suffix}`).expect(400);
    expect(f.load).not.toHaveBeenCalled();
  });
  it.each(["field", "field_manager", "chemical_manager", "mapping", "irrigation_manager", "shop_manager",
    "landscape_supervisor", "crew_supervisor"])("does not add commercial access to %s", async r => {
      role = r;
      await app().get("/api/customers/list-summary?ids=a").expect(403);
      expect(f.load).not.toHaveBeenCalled();
    });
  it("office and projected account-manager access remain allowed", async () => {
    await app().get("/api/customers/list-summary?ids=a").expect(200);
    role = "office"; await app().get("/api/customers/list-summary?ids=a").expect(200);
  });
  it("rejects signed-out or stale company before any facts load", async () => {
    authenticated = false;
    await app().get("/api/customers/list-summary?ids=a").expect(401);
    authenticated = true;
    await app().get("/api/customers/list-summary?ids=a").set("X-Company-Id", "foreign").expect(409);
    expect(f.load).not.toHaveBeenCalled();
  });
});
