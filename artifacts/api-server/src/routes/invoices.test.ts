import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createDraftInvoice: vi.fn(), patchDraftInvoice: vi.fn(), createInvoiceLine: vi.fn(), patchInvoiceLine: vi.fn(),
  deleteInvoiceLine: vi.fn(), reorderInvoiceLines: vi.fn(), cancelDraftInvoice: vi.fn(),
  listInvoices: vi.fn(), readInvoice: vi.fn(), readInvoiceEvents: vi.fn(), isInvoiceCenterEnabled: vi.fn(), log: vi.fn(),
  renderInvoicePdf: vi.fn(),
}));
vi.mock("../services/invoices", () => mocks);
vi.mock("../services/invoiceReads", () => mocks);
vi.mock("../services/invoiceFeature", () => mocks);
vi.mock("../services/invoicePdf", () => mocks);
vi.mock("../lib/logger", () => ({ logger: { error: mocks.log } }));
import { registerInvoiceRoutes } from "./invoices";
import { InvoiceError } from "../services/invoiceErrors";

const endpoints = [
  ["get", "/api/invoices/i/pdf", {}, "renderInvoicePdf", 200],
  ["get", "/api/invoices", {}, "listInvoices", 200],
  ["post", "/api/invoices", { customerId: "c", kind: "standalone", title: "T" }, "createDraftInvoice", 201],
  ["get", "/api/invoices/i", {}, "readInvoice", 200],
  ["patch", "/api/invoices/i", { title: "T" }, "patchDraftInvoice", 200],
  ["post", "/api/invoices/i/lines", { category: "plants", description: "P", unit: "ea" }, "createInvoiceLine", 201],
  ["patch", "/api/invoices/i/lines/l", { quantity: null }, "patchInvoiceLine", 200],
  ["delete", "/api/invoices/i/lines/l", {}, "deleteInvoiceLine", 200],
  ["post", "/api/invoices/i/lines/reorder", { lineIds: ["l"] }, "reorderInvoiceLines", 200],
  ["post", "/api/invoices/i/cancel", { reason: "Mistake" }, "cancelDraftInvoice", 200],
  ["get", "/api/invoices/i/events", {}, "readInvoiceEvents", 200],
] as const;
function appFor(role: string | null = "admin", company: string | null = "a") {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as typeof req.isAuthenticated;
    req.user = { id: "actor", activeRole: role, activeCompanyId: company } as Express.User;
    next();
  });
  registerInvoiceRoutes(app); return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, fn] of Object.entries(mocks)) if (key !== "log") fn.mockResolvedValue({ id: "i" });
  mocks.isInvoiceCenterEnabled.mockResolvedValue(true);
  mocks.renderInvoicePdf.mockResolvedValue({ buffer: Buffer.from("%PDF fixture"), filename: "MA-1001.pdf" });
});
describe("invoice PDF disposition", () => {
  it.each([["", "inline", "MA-1001.pdf"], ["?download=1", "attachment", "MA-1001-rev1.pdf"]])("serves %s with correct no-store PDF filename", async (query, disposition, filename) => {
    mocks.renderInvoicePdf.mockResolvedValue({ buffer: Buffer.from("%PDF fixture"), filename });
    const res = await request(appFor()).get(`/api/invoices/i/pdf${query}`);
    expect(res.status).toBe(200); expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe(`${disposition}; filename="${filename}"`);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.renderInvoicePdf).toHaveBeenCalledWith("a", "i");
  });
});
describe("all ten invoice route boundaries", () => {
  it.each(endpoints)("guards auth/company/roles before flag on %s %s", async (method, url, body, service, success) => {
    for (const role of [null, "field", "field_manager", "landscape_supervisor", "crew_supervisor", "chemical_manager", "irrigation_manager", "shop_manager", "mapping"]) {
      const response = await request(appFor(role))[method](url).send(body);
      expect(response.status).toBe(role === null ? 401 : 403);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(appFor("admin", null))[method](url).send(body)).status).toBe(403);
    expect((await request(appFor())[method](url).set("X-Company-Id", "b").send(body)).status).toBe(409);
    expect(mocks.isInvoiceCenterEnabled).not.toHaveBeenCalled();
    expect(mocks[service]).not.toHaveBeenCalled();
    for (const role of ["admin", "office"]) {
      const response = await request(appFor(role))[method](url).set("X-Company-Id", "a").send(body);
      expect(response.status).toBe(success);
      if (service === "renderInvoicePdf") expect(response.headers["content-type"]).toContain("application/pdf");
      else expect(response.body).toEqual({ id: "i" });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(mocks[service].mock.calls.at(-1)?.[0]).toBe("a");
    }
  });
  it.each(endpoints)("returns disabled 404 before parsing input on %s %s", async (method, url, _body, service) => {
    mocks.isInvoiceCenterEnabled.mockResolvedValue(false);
    const response = await request(appFor())[method](url).send({ invalid: true });
    expect(response.status).toBe(404); expect(response.body).toEqual({ error: "INVOICE_CENTER_DISABLED" });
    expect(response.headers["cache-control"]).toBe("no-store"); expect(mocks[service]).not.toHaveBeenCalled();
  });
  it.each(endpoints)("maps domain, overflow and unique conflicts on %s %s", async (method, url, body, service) => {
    for (const [error, status, code] of [
      [new InvoiceError(409, "INVOICE_NOT_DRAFT"), 409, "INVOICE_NOT_DRAFT"],
      [new InvoiceError(404, "NOT_FOUND"), 404, "NOT_FOUND"],
      [new RangeError("PRIVATE"), 422, "AMOUNT_OUT_OF_RANGE"],
      [{ cause: { code: "23505", detail: "PRIVATE" } }, 409, "CONFLICT"],
      [{ code: "22003", detail: "PRIVATE" }, 422, "AMOUNT_OUT_OF_RANGE"],
    ] as const) {
      mocks[service].mockRejectedValue(error);
      const response = await request(appFor())[method](url).send(body);
      expect(response.status).toBe(status); expect(response.body).toEqual({ error: code });
    }
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it.each(endpoints)("logs no PostgreSQL detail on %s %s", async (method, url, body, service) => {
    mocks[service].mockRejectedValue({ code: "XX000", detail: "PRIVATE", message: "PRIVATE" });
    const response = await request(appFor())[method](url).send(body);
    expect(response.status).toBe(500); expect(response.body).toEqual({ error: "INTERNAL_ERROR" });
    expect(mocks.log).toHaveBeenCalledWith({ code: "XX000" }, "Invoice request failed");
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("PRIVATE");
  });
  it("rejects strict PATCHes, client state/source/amounts and unsupported creation", async () => {
    for (const url of ["/api/invoices/i", "/api/invoices/i/lines/l"])
      for (const body of [{}, { status: "issued" }, { amountCents: 1 }, { live: false }, { sourceId: "x" }])
        expect((await request(appFor()).patch(url).send(body)).status).toBe(400);
    expect((await request(appFor()).post("/api/invoices").send({ customerId: "c", title: "T", kind: "monthly" })).status).toBe(400);
    expect((await request(appFor()).get("/api/invoices?status=garbage")).status).toBe(400);
    expect((await request(appFor()).get("/api/invoices?unknown=true")).status).toBe(400);
    expect(mocks.patchDraftInvoice).not.toHaveBeenCalled(); expect(mocks.patchInvoiceLine).not.toHaveBeenCalled();
  });
  it("preserves explicit null and safe fallback logging", async () => {
    await request(appFor()).patch("/api/invoices/i/lines/l").send({ quantity: null, rateCents: null });
    expect(mocks.patchInvoiceLine).toHaveBeenCalledWith("a", "actor", "i", "l", { quantity: null, rateCents: null });
    mocks.listInvoices.mockRejectedValue({ code: "PRIVATE_DATA" });
    await request(appFor()).get("/api/invoices");
    expect(mocks.log).toHaveBeenCalledWith({ code: "INVOICE_ERROR" }, "Invoice request failed");
  });
});
