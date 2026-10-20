import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.delete("/api/ticket-comments/:id",');
const end = source.indexOf("  registerPendingInvoicesRoute(app);", start);
if (start < 0 || end < 0) throw new Error("Real ticket relation handlers not found");
const mount = new Function("app", "storage", "insertTicketLinkSchema",
  transformSync(source.slice(start, end), { loader: "ts" }).code);
let app: express.Express;
let user: any;
let parent: any;
let counterpart: any;
let storage: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  user = { id: "owner", activeRole: "crew_supervisor", activeCompanyId: "company", activeTags: [] };
  parent = { id: "parent", companyId: "company", ticketTypeId: "task", assignedToId: "owner" };
  counterpart = { id: "counterpart", title: "Private title", companyId: "company", ticketTypeId: "invoice", assignedToId: "other" };
  storage = {
    getTicketById: vi.fn().mockImplementation(async id => id === "parent" ? parent : counterpart),
    getTicketLinks: vi.fn().mockResolvedValue([{ id: "link", sourceTicketId: "parent", targetTicketId: "counterpart" }]),
    getTicketTypeById: vi.fn().mockResolvedValue({ id: "invoice" }),
    getTicketTypeStatuses: vi.fn().mockResolvedValue([]),
    createTicketLink: vi.fn().mockResolvedValue({ id: "created" }),
    deleteTicketLink: vi.fn().mockResolvedValue(undefined),
    deleteTicketComment: vi.fn().mockResolvedValue(undefined),
  };
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    req.isAuthenticated = (() => true) as any;
    next();
  });
  // No subtree middleware: these actual handlers must be independently safe.
  mount(app, storage, { safeParse: (data: unknown) => ({ success: true, data }) });
});
describe("crew supervisor relation payloads and administrative writes", () => {
  it.each([[], ["billing"]].map(tags => ({ tags })))("assigned parent cannot disclose another owner's linked ticket, tags=$tags", async ({ tags }) => {
    user.activeTags = tags;
    const res = await request(app).get("/api/tickets/parent/links");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(storage.getTicketTypeById).not.toHaveBeenCalled();
    expect(res.text).not.toContain("counterpart");
    expect(res.text).not.toContain("Private title");
  });
  it("keeps a same-company linked ticket assigned to the caller", async () => {
    counterpart.assignedToId = "owner";
    const res = await request(app).get("/api/tickets/parent/links");
    expect(res.status).toBe(200);
    expect(res.body[0].ticket.id).toBe("counterpart");
    expect(storage.getTicketById).toHaveBeenCalledWith("counterpart", "company");
  });
  it.each(["foreign", "deleted"])("omits a %s counterpart and the link itself", async kind => {
    if (kind === "deleted") counterpart = undefined;
    else Object.assign(counterpart, { assignedToId: "owner", companyId: "foreign" });
    expect((await request(app).get("/api/tickets/parent/links")).body).toEqual([]);
  });
  it("rejects another owner's parent before reading its relationships", async () => {
    parent.assignedToId = "other";
    expect((await request(app).get("/api/tickets/parent/links")).status).toBe(403);
    expect(storage.getTicketLinks).not.toHaveBeenCalled();
  });
  it("hides a foreign-company parent even with matching assignment", async () => {
    parent.companyId = "foreign";
    expect((await request(app).get("/api/tickets/parent/links")).status).toBe(404);
    expect(storage.getTicketLinks).not.toHaveBeenCalled();
  });
  it.each([[], ["billing"]].map(tags => ({ tags })))("denies forged link creation through an assigned URL, tags=$tags", async ({ tags }) => {
    user.activeTags = tags;
    const res = await request(app).post("/api/tickets/parent/links")
      .send({ sourceTicketId: "unrelated-owner", targetTicketId: "foreign-ticket", linkType: "invoice_for" });
    expect(res.status).toBe(403);
    expect(storage.createTicketLink).not.toHaveBeenCalled();
  });
  it.each(["ticket-links", "ticket-comments"])("denies crew deletion outside the ticket subtree: %s", async resource => {
    user.activeTags = ["billing"];
    expect((await request(app).delete(`/api/${resource}/another-owners-record`)).status).toBe(403);
    expect(storage.deleteTicketLink).not.toHaveBeenCalled();
    expect(storage.deleteTicketComment).not.toHaveBeenCalled();
  });
  it.each(["admin", "office"])("preserves existing %s relation reads and writes", async role => {
    user.activeRole = role;
    const read = await request(app).get("/api/tickets/parent/links");
    expect(read.status).toBe(200);
    expect(read.body[0].ticket.id).toBe("counterpart");
    expect((await request(app).post("/api/tickets/parent/links").send({
      sourceTicketId: "parent", targetTicketId: "counterpart", linkType: "invoice_for",
    })).status).toBe(200);
    expect((await request(app).delete("/api/ticket-links/link")).status).toBe(200);
    expect((await request(app).delete("/api/ticket-comments/comment")).status).toBe(200);
  });
});
