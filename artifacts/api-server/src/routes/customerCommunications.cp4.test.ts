import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLoggedCustomerCommunication } from "../services/customerCommunicationPresentation";

const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.get("/api/customers/:id/communications",');
const end = source.indexOf('  // GET /api/customers/:id/annual-service-rollup', start);
if (start < 0 || end < 0) throw new Error("Customer communications route not found");
const mount = new Function("app", "storage", "isLoggedCustomerCommunication",
  transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code);
const storage = { getCustomerById: vi.fn(), getCommunications: vi.fn() };
let role = "admin", authenticated = true;
const comm = (id: string, more = {}) => ({ id, subject: `Subject ${id}`, body: "Preview", status: "sent",
  direction: "outbound", mailboxAccountId: null, providerMessageId: null, deliveryProvider: null, automationRuleId: null, ...more });
const app = () => {
  const a = express();
  a.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated, user: { activeCompanyId: "company", accessRole: role } }); next();
  });
  mount(a, storage, isLoggedCustomerCommunication); return request(a);
};
beforeEach(() => {
  vi.resetAllMocks(); role = "admin"; authenticated = true;
  storage.getCustomerById.mockResolvedValue({ id: "customer" });
  storage.getCommunications.mockResolvedValue([
    comm("out", { mailboxAccountId: "allowed", providerMessageId: "mail-1" }),
    comm("in", { mailboxAccountId: "allowed", providerMessageId: "mail-2", direction: "inbound" }),
    comm("deleted-mailbox", { providerMessageId: "retained-message" }),
    comm("automatic", { deliveryProvider: "sendgrid", automationRuleId: "rule" }),
    comm("log-1"), comm("log-2", { direction: "inbound", body: "Customer call" }),
  ]);
});
describe("CP4 customer communications real filter semantics", () => {
  it("Logged filters before paging, preserves accurate totals, and excludes retained provider/automatic mail", async () => {
    const first = await app().get("/api/customers/customer/communications?page=1&limit=1&source=logged").expect(200);
    expect(first.body.total).toBe(2); expect(first.body.data.map((c: any) => c.id)).toEqual(["log-1"]);
    const second = await app().get("/api/customers/customer/communications?page=2&limit=1&source=logged").expect(200);
    expect(second.body.data.map((c: any) => c.id)).toEqual(["log-2"]);
    expect(storage.getCommunications).toHaveBeenCalledWith("company", { customerId: "customer" });
  });
  it("direction and search filters operate before totals and preserve mailbox narrowing", async () => {
    const inbound = await app().get("/api/customers/customer/communications?page=1&direction=inbound").expect(200);
    expect(inbound.body.data.map((c: any) => c.id)).toEqual(["in", "log-2"]);
    const narrow = await app().get("/api/customers/customer/communications?page=1&direction=inbound&mailboxIds=allowed").expect(200);
    expect(narrow.body.data.map((c: any) => c.id)).toEqual(["in"]);
    const search = await app().get("/api/customers/customer/communications?page=1&search=customer%20call").expect(200);
    expect(search.body.data.map((c: any) => c.id)).toEqual(["log-2"]);
  });
  it("retains existing role permissions and rejects stale company", async () => {
    role = "field_manager"; await app().get("/api/customers/customer/communications?page=1").expect(403);
    role = "admin";
    await app().get("/api/customers/customer/communications?page=1").set("X-Company-Id", "other").expect(409);
    authenticated = false; await app().get("/api/customers/customer/communications?page=1").expect(401);
    expect(storage.getCommunications).not.toHaveBeenCalled();
  });
});
