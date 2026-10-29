// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { transformSync } from "esbuild";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  insertTicketNotificationSchema, insertTicketCommentSchema, ticketNotifications, ticketComments,
  type NotificationType,
} from "@workspace/db";
import type { NotificationFilter } from "../storage";
import application from "../app";

// Execute the actual handlers without registerRoutes' unrelated startup writes.
// Import app.ts as well so URL cases use its parser, not a test-only parser.
const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
function between(source: string, start: string, end: string): string {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`Missing test extraction boundary: ${start}`);
  return source.slice(a, b);
}
const compile = (source: string) => transformSync(source, { loader: "ts", target: "es2022" }).code;
const filterSource = between(routesSource, "export const NOTIFICATION_TYPES", "/**");
const { NOTIFICATION_TYPES, parseNotificationFilter } = new Function("insertTicketNotificationSchema",
  compile(filterSource.replaceAll("export ", "")) + "\nreturn { NOTIFICATION_TYPES, parseNotificationFilter };")(insertTicketNotificationSchema) as {
    NOTIFICATION_TYPES: NotificationType[];
    parseNotificationFilter: (query: Record<string, unknown>) => { filter?: NotificationFilter; error?: string };
  };
const mountReads = new Function("app", "storage", "parseNotificationFilter",
  compile(between(routesSource, '  app.get("/api/notifications",', "  // Mark single notification")));
const mountComments = new Function("app", "storage", "insertTicketCommentSchema",
  compile(between(routesSource, '  app.get("/api/tickets/:ticketId/comments",', '  app.delete("/api/ticket-comments/:id",')));
const storageSource = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");
// Real SQL methods, without constructing a session store or running startup DDL.
function notificationStorage(db: unknown) {
  return new Function("db", "ticketNotifications", "eq", "ne", "and", "desc", "sql",
    compile(between(storageSource, "function notificationTypePredicate", "export interface IStorage")
      + "\nclass Reads {\n"
      + between(storageSource, "  async getNotificationsByUser(", "  async createNotification(")
      + "\n}\nreturn new Reads();"))(db, ticketNotifications, eq, ne, and, desc, sql) as {
        getNotificationsByUser: (user: string, company: string, filter?: NotificationFilter) => Promise<any[]>;
        getUnreadNotificationCount: (user: string, company: string, filter?: NotificationFilter) => Promise<number>;
      };
}

describe("Strict notification filter helper", () => {
  it("derives exactly the canonical runtime enum and preserves the existing union", () => {
    expect(NOTIFICATION_TYPES).toEqual(insertTicketNotificationSchema.shape.type.options);
    expect(NOTIFICATION_TYPES).toHaveLength(6);
    // The production helper also has bidirectional compile-time exhaustive parity.
    expect(filterSource).toContain("AssertNever<Exclude<RuntimeNotificationType, NotificationType>>");
    expect(filterSource).toContain("AssertNever<Exclude<NotificationType, RuntimeNotificationType>>");
  });
  it("treats only undefined as absent", () => {
    expect(parseNotificationFilter({})).toEqual({ filter: undefined });
    expect(parseNotificationFilter({ type: undefined, exclude: undefined })).toEqual({ filter: undefined });
  });
  for (const key of ["type", "exclude"]) {
    it.each(NOTIFICATION_TYPES)(`${key} accepts %s without normalization`, value => {
      expect(parseNotificationFilter({ [key]: value })).toEqual({ filter: { [key]: value } });
    });
    it.each([null, false, true, 0, 1, [], ["mentioned"], ["mentioned", "mentioned"],
      {}, { value: "mentioned" }, { toString: () => "mentioned" }, "", "bogus", " mentioned", "MENTIONED"]
      .map(value => [value] as [unknown]))(
      `${key} rejects non-scalar/invalid %j`, value => {
        expect(parseNotificationFilter({ [key]: value }).error).toBeDefined();
      });
  }
  it.each([["mentioned", "overdue"], ["", "mentioned"], ["mentioned", ""], [null, "mentioned"],
    [["mentioned"], "mentioned"], [{ key: "mentioned" }, ""], ["", ""]])(
    "rejects simultaneous filters %j / %j", (type, exclude) => {
      expect(parseNotificationFilter({ type, exclude }).error).toBeDefined();
    });
});

describe("Notification GET routes under the application query parser", () => {
  let authenticated = true;
  const storage = { getNotificationsByUser: vi.fn(), getUnreadNotificationCount: vi.fn() };
  const base = express();
  base.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated,
      user: { id: "recipient", activeCompanyId: "company" } });
    next();
  });
  mountReads(base, storage, parseNotificationFilter);
  // application supplies the same parser used by registered routes in production.
  application.use("/__notification_contract", base);
  const get = (endpoint: string, query = "") => request(application).get(`/__notification_contract${endpoint}${query}`);
  beforeEach(() => {
    authenticated = true;
    vi.clearAllMocks();
    storage.getNotificationsByUser.mockResolvedValue([{ id: "legacy", commentId: null }]);
    storage.getUnreadNotificationCount.mockResolvedValue(7);
  });
  for (const endpoint of ["/api/notifications", "/api/notifications/unread-count"]) {
    const isCount = endpoint.endsWith("unread-count");
    const method = isCount ? storage.getUnreadNotificationCount : storage.getNotificationsByUser;
    it(`${endpoint} preserves omission, response shape and scope`, async () => {
      const res = await get(endpoint);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(isCount ? { count: 7 } : [{ id: "legacy", commentId: null }]);
      expect(method).toHaveBeenCalledExactlyOnceWith("recipient", "company", undefined);
    });
    for (const key of ["type", "exclude"]) {
      it.each(NOTIFICATION_TYPES)(`${endpoint} forwards ${key}=%s`, async value => {
        expect((await get(endpoint, `?${key}=${value}`)).status).toBe(200);
        expect(method).toHaveBeenCalledExactlyOnceWith("recipient", "company", { [key]: value });
      });
      const invalidQueries = [
        `${key}=`, `${key}=bogus`, `${key}=mentioned&${key}=overdue`,
        `${key}=mentioned&${key}=mentioned`, `${key}[]=mentioned`,
        `${key}[0]=mentioned`, `${key}[value]=mentioned`,
        `${key}%5B%5D=mentioned`, `${key}%5Bvalue%5D=mentioned`,
      ];
      it.each(invalidQueries)(`${endpoint} rejects URL %s`, async query => {
        expect((await get(endpoint, `?${query}`)).status).toBe(400);
        expect(storage.getNotificationsByUser).not.toHaveBeenCalled();
        expect(storage.getUnreadNotificationCount).not.toHaveBeenCalled();
      });
    }
    it.each(["type=mentioned&exclude=overdue", "type=&exclude=mentioned",
      "type=mentioned&exclude=", "type=&exclude=", "type[]=mentioned&exclude=overdue",
      "type=mentioned&exclude[value]=overdue"])(
      `${endpoint} rejects conflicting URL %s`, async query => {
        expect((await get(endpoint, `?${query}`)).status).toBe(400);
        expect(method).not.toHaveBeenCalled();
      });
    it(`${endpoint} authenticates before querying or validating`, async () => {
      authenticated = false;
      for (const query of ["", "?type=mentioned", "?exclude=mentioned", "?type=&exclude="]) {
        expect((await get(endpoint, query)).status).toBe(401);
      }
      expect(method).not.toHaveBeenCalled();
    });
  }
});

describe("Notification SQL and schema preservation", () => {
  it("uses SQL filtering and COUNT with user/company scope and unchanged list ordering", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [[3]] });
    const reads = notificationStorage(drizzle({ client: { query } as any }));
    for (const value of NOTIFICATION_TYPES) {
      for (const filter of [undefined, { type: value }, { exclude: value }]) {
        query.mockClear();
        await reads.getNotificationsByUser("recipient", "company", filter);
        await reads.getUnreadNotificationCount("recipient", "company", filter);
        const [list, count] = query.mock.calls.map(call => ({ text: call[0].text as string, params: call[1] }));
        for (const statement of [list, count]) {
          expect(statement.text).toContain('"ticket_notifications"."recipient_id" = $1');
          expect(statement.text).toContain('"ticket_notifications"."company_id" = $2');
          expect(statement.params.slice(0, 2)).toEqual(["recipient", "company"]);
          if (filter) {
            expect(statement.text).toContain(`"ticket_notifications"."type" ${"type" in filter ? "=" : "<>"} $`);
            expect(statement.params.at(-1)).toBe(value);
          } else expect(statement.text).not.toMatch(/"type" (?:=|<>)/);
        }
        expect(list.text).toContain('order by "ticket_notifications"."created_at" desc');
        expect(count.text).toContain("COUNT(*)::int");
        expect(count.text).toContain('"ticket_notifications"."is_read" = $3');
        expect(count.params[2]).toBe(false);
        expect(query).toHaveBeenCalledTimes(2);
      }
    }
  });
  it("adds only a nullable, default-free SET NULL reference and mirrors the local stub syntax", () => {
    const config = getTableConfig(ticketNotifications);
    const column = config.columns.find(c => c.name === "comment_id")!;
    expect(column.notNull).toBe(false);
    expect(column.hasDefault).toBe(false);
    const fk = config.foreignKeys.find(f => f.reference().columns.includes(column))!;
    expect(fk.onDelete).toBe("set null");
    expect(fk.reference().foreignTable).toBe(ticketComments);
    expect(config.indexes).toHaveLength(1);
    expect(config.indexes[0].config.name).toBe("ticket_notifications_recipient_company_idx");
    const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0057_mention_notification_comment.sql", import.meta.url), "utf8");
    expect(migration.trim()).toBe("ALTER TABLE ticket_notifications ADD COLUMN IF NOT EXISTS comment_id varchar\n  REFERENCES ticket_comments(id) ON DELETE SET NULL;");
    const client = readFileSync(new URL("../../../highplains-crm/src/shared/schema.ts", import.meta.url), "utf8");
    const block = between(client, 'export const ticketNotifications =', 'export const insertTicketNotificationSchema');
    expect(block).toContain('commentId: varchar("comment_id").references(() => ticketComments.id, { onDelete: "set null" }),');
    expect(client).not.toContain('from "drizzle-orm/pg-core"');
    const base = { companyId: "company", recipientId: "recipient", ticketId: "ticket", type: "mentioned", message: "Test" };
    expect(insertTicketNotificationSchema.parse(base).commentId).toBeUndefined();
    expect(insertTicketNotificationSchema.parse({ ...base, commentId: null }).commentId).toBeNull();
    expect(insertTicketNotificationSchema.parse({ ...base, commentId: "comment" }).commentId).toBe("comment");
  });
});

// Opt in only against the development database. All disposable fixtures are rolled
// back, including on failed assertions; no real user data is read or printed.
describe.skipIf(process.env.MENTIONS_DEV_VERIFY !== "yes")("Notification development database contract", () => {
  it("preserves legacy NULL, records posted/reply provenance, filters/counts with isolation, and SET NULL on deletion", async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Development verification only");
    const { db, inTransaction } = await import("../db");
    const schema = await import("@workspace/db");
    const { PgStorage } = await import("../storage");
    // Avoid the constructor's session-store DDL; exercise the real prototype methods.
    const storage = Object.create(PgStorage.prototype) as InstanceType<typeof PgStorage>;
    const rollback = new Error("Rollback disposable mention fixtures");
    try {
      await db.transaction(async tx => inTransaction(tx, async () => {
        const tag = randomUUID();
        const [company, otherCompany] = await tx.insert(schema.companies).values([
          { name: "Disposable mentions", slug: `mentions-${tag}` },
          { name: "Disposable other mentions", slug: `mentions-other-${tag}` },
        ]).returning();
        const [author, recipient, otherUser] = await tx.insert(schema.users).values([
          { name: "Disposable author", passwordHash: "unused" },
          { name: "Disposable recipient", passwordHash: "unused" },
          { name: "Disposable other recipient", passwordHash: "unused" },
        ]).returning();
        const [ticketType] = await tx.insert(schema.ticketTypes).values({ companyId: company.id, name: "Disposable task" }).returning();
        const [status] = await tx.insert(schema.ticketTypeStatuses).values({ ticketTypeId: ticketType.id, name: "Open", displayOrder: 0 }).returning();
        const [ticket] = await tx.insert(schema.tickets).values({ companyId: company.id, ticketTypeId: ticketType.id,
          currentStatusId: status.id, title: "Disposable mention ticket", createdById: author.id }).returning();
        const [legacy] = await tx.insert(ticketNotifications).values({ companyId: company.id, recipientId: recipient.id,
          ticketId: ticket.id, type: "mentioned", message: "Disposable legacy mention" }).returning();
        expect(legacy.commentId).toBeNull();
        const app = express();
        app.use(express.json());
        let actorId = author.id;
        app.use((req, _res, next) => {
          Object.assign(req, { isAuthenticated: () => true, user: { id: actorId, name: "Disposable author",
            activeCompanyId: company.id, activeRole: "admin" }, log: { warn: vi.fn() } });
          next();
        });
        mountComments(app, storage, insertTicketCommentSchema);
        mountReads(app, storage, parseNotificationFilter);
        const root = await request(app).post(`/api/tickets/${ticket.id}/comments`).send({ body: `Hello @[${recipient.id}:Recipient]` });
        expect(root.status).toBe(200);
        const reply = await request(app).post(`/api/tickets/${ticket.id}/comments`).send({
          body: `Reply @[${recipient.id}:Recipient]`, parentCommentId: root.body.id });
        expect(reply.status).toBe(200);
        const mentions = await storage.getNotificationsByUser(recipient.id, company.id, { type: "mentioned" });
        expect(mentions.map(n => n.commentId)).toEqual(expect.arrayContaining([null, root.body.id, reply.body.id]));
        expect(mentions).toHaveLength(3);
        const migration = readFileSync(new URL("../../../../.migration-backup/migrations/0057_mention_notification_comment.sql", import.meta.url), "utf8");
        await tx.execute(sql.raw(migration));
        await tx.execute(sql.raw(migration));
        const rerun = await storage.getNotificationsByUser(recipient.id, company.id, { type: "mentioned" });
        expect(rerun.find(n => n.id === legacy.id)?.commentId).toBeNull();
        expect(rerun.find(n => n.commentId === root.body.id)).toBeDefined();
        expect(rerun.find(n => n.commentId === reply.body.id)).toBeDefined();
        // PostgreSQL now() is transaction-stable. Give fixtures distinct times so
        // order assertions don't invent a new tie-breaker for the existing API.
        for (const [index, mention] of mentions.entries()) {
          await tx.update(ticketNotifications).set({ createdAt: new Date(2026, 1, index + 1) })
            .where(eq(ticketNotifications.id, mention.id));
        }
        for (const [index, type] of NOTIFICATION_TYPES.entries()) {
          await tx.insert(ticketNotifications).values([false, true].map(isRead => ({
            companyId: company.id, recipientId: recipient.id, ticketId: ticket.id, type, isRead,
            message: "Disposable type fixture", createdAt: new Date(2026, 0, index + 1, isRead ? 1 : 0),
          })));
        }
        await tx.insert(ticketNotifications).values([
          { companyId: company.id, recipientId: otherUser.id, ticketId: ticket.id, type: "mentioned", message: "Foreign recipient" },
          { companyId: otherCompany.id, recipientId: recipient.id, ticketId: ticket.id, type: "mentioned", message: "Foreign company" },
        ]);
        actorId = recipient.id;
        const all = await storage.getNotificationsByUser(recipient.id, company.id);
        expect(all).toHaveLength(15);
        expect(all.every(n => n.recipientId === recipient.id && n.companyId === company.id)).toBe(true);
        expect(all.map(n => n.createdAt.getTime())).toEqual(all.map(n => n.createdAt.getTime()).sort((a, b) => b - a));
        for (const query of ["", ...NOTIFICATION_TYPES.flatMap(type => [`?type=${type}`, `?exclude=${type}`])]) {
          const list = await request(app).get(`/api/notifications${query}`);
          const count = await request(app).get(`/api/notifications/unread-count${query}`);
          expect(list.status).toBe(200);
          expect(count.status).toBe(200);
          const params = new URLSearchParams(query);
          const expected = all.filter(n => params.has("type") ? n.type === params.get("type") :
            params.has("exclude") ? n.type !== params.get("exclude") : true);
          expect(list.body.map((n: any) => n.id)).toEqual(expected.map(n => n.id));
          expect(count.body.count).toBe(expected.filter(n => !n.isRead).length);
        }
        const rootNotification = all.find(n => n.commentId === root.body.id)!;
        await storage.deleteTicketComment(root.body.id);
        const after = await storage.getNotificationsByUser(recipient.id, company.id);
        expect(after.find(n => n.id === rootNotification.id)).toEqual({ ...rootNotification, commentId: null });
        expect(after.find(n => n.commentId === reply.body.id)).toBeDefined();
        expect(after.find(n => n.id === legacy.id)?.commentId).toBeNull();
        expect(after).toHaveLength(all.length);
        const redactComment = (id: string | null | undefined) =>
          id === null || id === undefined ? id : id === root.body.id ? "new-root-comment" :
            id === reply.body.id ? "new-reply-comment" : "unexpected-comment";
        process.stdout.write("Sanitized disposable notification evidence " + JSON.stringify({
          legacy: { before: { commentId: legacy.commentId }, after: { commentId: after.find(n => n.id === legacy.id)?.commentId } },
          topLevelMention: { beforeDelete: { commentId: redactComment(rootNotification.commentId) },
            afterDelete: { commentId: after.find(n => n.id === rootNotification.id)?.commentId },
            notificationPreserved: after.some(n => n.id === rootNotification.id) },
          replyMention: { commentId: redactComment(mentions.find(n => n.commentId === reply.body.id)?.commentId),
            equalsActualReplyId: mentions.some(n => n.commentId === reply.body.id) },
        }) + "\n");
        throw rollback;
      }));
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 30000);
});
