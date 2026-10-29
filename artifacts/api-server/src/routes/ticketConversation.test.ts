// @vitest-environment node
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTicketCommentSchema } from "@workspace/db";

// Execute the real registrations without registerRoutes' unrelated startup DML.
const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = source.indexOf('  app.get("/api/tickets/:ticketId/comments",');
const end = source.indexOf('  app.delete("/api/ticket-comments/:id",', start);
if (start < 0 || end < 0) throw new Error("Ticket comment handlers not found");
const mount = new Function("app", "storage", "insertTicketCommentSchema",
  transformSync(source.slice(start, end), { loader: "ts", target: "es2022" }).code);

type Row = { id: string; ticketId: string; parentCommentId: string | null };
const row = (id: string, parentCommentId: string | null = null, ticketId = "ticket"): Row =>
  ({ id, parentCommentId, ticketId });
let comments: Row[];
let app: ReturnType<typeof express>;
let role: string;
let authenticated: boolean;
let ticket: any;
const warn = vi.fn();
const storage = {
  getTicketById: vi.fn(),
  getTicketComments: vi.fn(),
  createTicketComment: vi.fn(),
  createTicketCommentMention: vi.fn(),
  getUserById: vi.fn(),
  createNotification: vi.fn(),
};
const post = (parent: unknown = undefined, body = "Comment") =>
  request(app).post("/api/tickets/ticket/comments").send({ body, ...(parent === undefined ? {} : { parentCommentId: parent }) });
function noWrites() {
  expect(storage.createTicketComment).not.toHaveBeenCalled();
  expect(storage.createTicketCommentMention).not.toHaveBeenCalled();
  expect(storage.getUserById).not.toHaveBeenCalled();
  expect(storage.createNotification).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  comments = [];
  role = "admin";
  authenticated = true;
  ticket = { id: "ticket", companyId: "company", assignedToId: "aa", title: "Work" };
  storage.getTicketById.mockImplementation(async (_id, company) => ticket?.companyId === company ? ticket : undefined);
  storage.getTicketComments.mockImplementation(async () => comments);
  storage.createTicketComment.mockImplementation(async data => {
    const comment = { ...data, id: "new" };
    comments.push(comment);
    return comment;
  });
  storage.getUserById.mockResolvedValue({ id: "bb" });
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as any;
    req.user = { id: "aa", name: "Author", activeCompanyId: "company", activeRole: role } as any;
    req.log = { warn } as any;
    next();
  });
  mount(app, storage, insertTicketCommentSchema);
});

describe("Ticket conversation parents", () => {
  it.each([undefined, null])("accepts top-level parent %s", async parent => {
    const res = await post(parent);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ticketId: "ticket", authorId: "aa", parentCommentId: null });
    expect(storage.getTicketComments).not.toHaveBeenCalled();
  });
  it("persists a same-ticket reply and returns its parent after refresh", async () => {
    comments = [row("root")];
    expect((await post("root")).body.parentCommentId).toBe("root");
    const res = await request(app).get("/api/tickets/ticket/comments");
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual(expect.objectContaining({ id: "new", parentCommentId: "root" }));
    expect(storage.getTicketById).toHaveBeenCalledWith("ticket", "company");
  });
  it.each(["missing", "foreign", "", 42, false, {}])("rejects invalid requested parent %j without side effects", async parent => {
    comments = [row("foreign", null, "other-ticket")];
    expect((await post(parent, "Notify @[bb:Person]")).status).toBe(400);
    noWrites();
  });
  it("walks a four-comment chain to the root, not just one hop", async () => {
    comments = [row("a"), row("b", "a"), row("c", "b"), row("d", "c")];
    expect((await post("d")).body.parentCommentId).toBe("a");
    expect(warn).not.toHaveBeenCalled();
  });
  it.each(["missing", "foreign"])("keeps the last valid ancestor when a later ancestor is %s", async broken => {
    comments = [row("a", broken), row("b", "a"), row("c", "b"), row("foreign", null, "other-ticket")];
    expect((await post("c")).body.parentCommentId).toBe("a");
    expect(warn).not.toHaveBeenCalled();
  });
  it("does not mistake a broken later pointer near the cap for cap exhaustion", async () => {
    comments = Array.from({ length: 10 }, (_, i) => row(String(i), i ? String(i - 1) : "missing"));
    expect((await post("9")).body.parentCommentId).toBe("0");
    expect(warn).not.toHaveBeenCalled();
  });
  it.each(["self", "cycle", "long"])("posts at top level and warns on %s cap exhaustion", async kind => {
    comments = kind === "self" ? [row("a", "a")] :
      kind === "cycle" ? [row("a", "b"), row("b", "a")] :
        Array.from({ length: 12 }, (_, i) => row(i ? String(i) : "a", i === 11 ? null : String(i + 1)));
    const res = await post("a", "Do not lose @[bb:Person]");
    expect(res.status).toBe(200);
    expect(res.body.parentCommentId).toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { ticketId: "ticket", parentCommentId: "a", hops: 10 }, expect.stringContaining("hop limit"));
    expect(storage.createTicketCommentMention).toHaveBeenCalledTimes(1);
  });
  it("accepts a root reached on the tenth hop", async () => {
    comments = Array.from({ length: 11 }, (_, i) => row(String(i), i ? String(i - 1) : null));
    expect((await post("10")).body.parentCommentId).toBe("0");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Unchanged ticket comment validation, access and mentions", () => {
  it.each([undefined, "root"])("keeps mention encoding, deduplication, self exclusion and notifications for %s", async parent => {
    comments = [row("root")];
    const body = "Hello @[bb:Person] @[bb] @{bb} @[aa:Author]";
    const res = await post(parent, body);
    expect(res.status).toBe(200);
    expect(res.body.body).toBe(body);
    expect(storage.createTicketCommentMention).toHaveBeenCalledExactlyOnceWith({ commentId: "new", mentionedUserId: "bb" });
    expect(storage.createNotification).toHaveBeenCalledExactlyOnceWith({
      companyId: "company", recipientId: "bb", ticketId: "ticket", commentId: "new", type: "mentioned",
      message: 'Author mentioned you in ticket "Work"', isRead: false,
    });
  });
  it.each(["", "x".repeat(5001), 42])("rejects invalid body before writes", async body => {
    expect((await post(null, body as any)).status).toBe(400);
    noWrites();
  });
  it("does not notify an unknown user", async () => {
    storage.getUserById.mockResolvedValueOnce(undefined);
    expect((await post(undefined, "@[bb:Person]")).status).toBe(200);
    expect(storage.createTicketCommentMention).toHaveBeenCalledExactlyOnceWith({ commentId: "new", mentionedUserId: "bb" });
    expect(storage.createNotification).not.toHaveBeenCalled();
  });
  it("keeps the comment and processes later mentions when a notification fails", async () => {
    storage.createNotification.mockRejectedValueOnce(new Error("notification unavailable"));
    const res = await post(undefined, "@[bb:Person] @[cc:Other]");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("new");
    expect(storage.createTicketCommentMention).toHaveBeenCalledTimes(2);
    expect(storage.createNotification).toHaveBeenCalledTimes(2);
  });
  it("requires authentication", async () => {
    authenticated = false;
    expect((await post()).status).toBe(401);
    noWrites();
  });
  it.each(["absent", "foreign"])("keeps company-scoped ticket lookup for %s tickets", async kind => {
    ticket = kind === "absent" ? null : { ...ticket, companyId: "other-company" };
    expect((await post()).status).toBe(404);
    noWrites();
  });
  it.each(["field_manager", "chemical_manager", "irrigation_manager"])("retains assigned-ticket restriction for %s", async activeRole => {
    role = activeRole;
    ticket.assignedToId = "someone-else";
    expect((await post("missing")).status).toBe(403);
    noWrites();
    expect(storage.getTicketComments).not.toHaveBeenCalled();
    ticket.assignedToId = "aa";
    expect((await post()).status).toBe(200);
  });
  it("retains field-role posting denial", async () => {
    role = "field";
    expect((await post()).status).toBe(403);
    noWrites();
  });
  it.each(["office", "admin"])("allows %s posting", async activeRole => {
    role = activeRole;
    expect((await post()).status).toBe(200);
  });
});
