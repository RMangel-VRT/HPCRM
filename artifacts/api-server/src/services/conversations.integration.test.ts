import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { companies, communications, companyUsers, customers, mailboxAccounts, unsortedEmails, users } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db, inTransaction, type AppTransaction } from "../db";
import { registerConversations } from "../routes/conversations";
import { mailboxCleanupRouter } from "../routes/mailboxCleanup";
import unsortedRouter from "../routes/unsortedEmails";
import { sendConversationReply } from "./conversationReplies";
import { conversationScope, listConversations, readConversation } from "./conversations";
import type { SendEmailOptions } from "./gmailSender";
import { sampleCommunicationFingerprints } from "./sampleCommunicationFingerprints";

const user = { id: "actor", activeCompanyId: "company", activeRole: "admin", accessRole: "admin",
  name: "Internal Staff" } as UserWithContext;
const at = (n: number) => new Date(Date.UTC(2026, 10, 20, n));
const sent = {
  companyId: "company", customerId: "customer", subject: "Synthetic estimate", body: "Initial sent email",
  type: "email", status: "sent", direction: "outbound", mailboxAccountId: "shared",
} as const;
const fixture = (fn: (tx: AppTransaction) => Promise<void>) => db.transaction(async tx => {
  for (const table of ["companies", "company_document_settings", "users", "company_users", "customers", "settings", "estimate_versions",
    "estimates", "mailbox_accounts", "communications", "unsorted_emails", "communication_links", "communication_audit_log",
    "property_managers", "property_management_companies"]) {
    await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
  }
  await inTransaction(tx, () => fn(tx));
});
const appFor = (viewer: UserWithContext = user) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = viewer;
    next();
  });
  registerConversations(app);
  app.use("/api/unsorted-emails", unsortedRouter);
  app.use("/api/mailbox-accounts/cleanup", mailboxCleanupRouter);
  return request(app);
};

it("scopes before grouping, preserves whole matching threads, pages in SQL, and prepares and sends the same reply", async () => {
  await fixture(async tx => {
    await tx.insert(companies).values({ id: "company", name: "Example Company", slug: "m8-fixture" });
    await tx.insert(users).values([
      { id: "actor", name: user.name, passwordHash: "fixture-only" },
      { id: "other-actor", name: "Office Person", passwordHash: "fixture-only" },
      { id: "external-actor", name: "Foreign Staff", passwordHash: "fixture-only" },
    ]);
    await tx.insert(companyUsers).values([
      { id: "member-1", companyId: "company", userId: "actor", role: "admin" },
      { id: "member-2", companyId: "company", userId: "other-actor", role: "office" },
      { id: "member-foreign", companyId: "foreign", userId: "external-actor", role: "admin" },
    ]);
    await tx.insert(customers).values(["customer", "other-customer", "foreign-customer"].map((id, index) => ({
      id, companyId: index === 2 ? "foreign" : "company", name: `Synthetic Customer ${index}`,
      street: "Synthetic Street", city: "Synthetic City", state: "CO", zip: "00000",
    })));
    await tx.insert(mailboxAccounts).values(["shared", "second", "personal", "foreign"].map(id => ({
      id, companyId: id === "foreign" ? "foreign" : "company", emailAddress: `${id}@example.test`, displayName: "Shared Office",
      accountType: id === "personal" ? "personal" as const : "shared" as const, syncStatus: "connected" as const,
      syncEnabled: true, oauthTokenJson: { fixture: true },
    })));
    await tx.insert(communications).values([
      { ...sent, id: "first", sentAt: at(1), providerThreadId: "collision", providerMessageId: "<first@example.test>",
        sentById: "other-actor", routingMethod: "estimate_email", attachmentsJson: [{ fileName: "estimate.pdf", attachmentId: "not-a-grant" }] },
      { ...sent, id: "second", sentAt: at(2), providerThreadId: "collision", providerMessageId: "<second@example.test>", sentById: "actor" },
      { ...sent, id: "external", sentAt: at(3), providerThreadId: "collision", providerMessageId: "<external@example.test>",
        sentById: null, fromName: "Shared Office" },
      { ...sent, id: "parent", subject: "Re: Synthetic estimate", body: "Synthetic question\n> Private older text",
        bodyText: "Synthetic question\n> Private older text", bodyHtml: "<p>Synthetic question</p><div class='gmail_quote'>Private older text</div>",
        direction: "inbound", fromName: " Synthetic Customer ", fromAddress: "reply@example.test", receivedAt: at(8),
        providerThreadId: "collision", providerMessageId: "<parent@example.test>" },
      { ...sent, id: "separate-mailbox", subject: "Separate mailbox", direction: "inbound",
        mailboxAccountId: "second", providerThreadId: "collision", sentAt: at(7) },
      { ...sent, id: "separate-customer", subject: "Separate customer", customerId: "other-customer",
        direction: "inbound", providerThreadId: "collision", sentAt: at(6) },
      { ...sent, id: "hidden-box", mailboxAccountId: "personal", providerThreadId: "collision", sentAt: at(9) },
      { ...sent, id: "foreign", companyId: "foreign", mailboxAccountId: "foreign", sentById: "external-actor",
        customerId: "foreign-customer", providerThreadId: "collision", sentAt: at(10) },
      { ...sent, id: "deleted", providerThreadId: "collision", deletedAt: at(5) },
      { ...sent, id: "draft", providerThreadId: "collision", status: "draft" },
      ...Array.from({ length: 51 }, (_, i) => ({ ...sent, id: `note-${String(i).padStart(2, "0")}`, subject: `Note ${i}`,
        type: "note" as const, mailboxAccountId: null, sentAt: at(0), sentById: "actor" })),
    ]);
    await tx.insert(unsortedEmails).values({ id: "pending", companyId: "company", mailboxAccountId: "shared",
      subject: "To route", fromAddress: "reply@example.test", receivedAt: at(11), providerThreadId: "assignment",
      providerMessageId: "<assignment@example.test>", attachmentsJson: [{ name: "synthetic.pdf" }] });
    const api = appFor();
    const list = (await api.get("/api/conversations").expect(200)).body;
    expect(list.items).toHaveLength(50);
    expect(list.counts).toEqual({ all: 54, sent: 52, needs_reply: 3, unsorted: 1 });
    const p2 = (await api.get("/api/conversations?page=2").expect(200)).body.items;
    expect(p2.map((r: { key: string }) => r.key)).toEqual(["c:note-03", "c:note-02", "c:note-01", "c:note-00"]);
    const thread = list.items[0];
    expect(thread).toMatchObject({ subject: "Synthetic estimate", kind: "estimate", hasAttachments: true, messageCount: 4,
      lastMessage: { snippet: "Synthetic question", senderFirstName: "Synthetic" },
      team: [{ userId: "other-actor", role: "office" }, { userId: "actor", role: "admin" }], needsReply: true });
    const match = (await api.get("/api/conversations?search=Synthetic%20question&filter=sent").expect(200)).body;
    expect(match.items).toEqual([thread]);
    expect((await api.get("/api/conversations?filter=needs_reply").expect(200)).body.items).toHaveLength(3);
    expect((await api.get("/api/conversations?customerId=other-customer").expect(200)).body.counts).toEqual({ all: 1, sent: 0, needs_reply: 1, unsorted: 0 });
    expect((await api.get("/api/conversations?customerId=foreign-customer").expect(200)).body.items).toEqual([]);
    const url = `/api/conversations/${encodeURIComponent(thread.key)}`;
    const detail = (await api.get(url).expect(200)).body;
    expect((await api.get("/api/threads").expect(200)).body).toEqual(list);
    expect((await api.get(url.replace("/conversations/", "/threads/")).expect(200)).body).toEqual(detail);
    expect(detail.messages.map((m: { id: string }) => m.id)).toEqual(["first", "second", "external", "parent"]);
    expect(detail.messages[0].attachments).toEqual([{ name: "estimate.pdf" }]);
    expect(detail.messages[2]).toMatchObject({ outsideCrm: true, staff: null });
    expect(detail.messages[3]).toMatchObject({ earlierText: "> Private older text", newText: "Synthetic question" });
    expect(detail.replyTargetId).toBe("parent");
    await api.get(`${url}?customerId=other-customer`).expect(404);
    await appFor({ ...user, activeCompanyId: "foreign" }).get(url).expect(404);
    await api.get("/api/conversations").set("X-Company-Id", "different").expect(409);
    const limited = { ...(await conversationScope(user)), visible: { mailboxIds: ["second"], includeNullMailbox: false, scopeLabel: "Fixture" } };
    expect((await listConversations(limited, "all", "", 1)).items.map(r => r.subject)).toEqual(["Separate mailbox"]);
    expect(await readConversation(limited, thread.key)).toBeNull();
    const draft = { parentId: "parent", body: "Thanks <friend>.\n\nA second paragraph." };
    const before = await tx.select().from(communications);
    const preview = (await api.post(`${url}/reply-preview`).set("X-Company-Id", "company").send(draft).expect(200)).body;
    await api.post(`${url}/reply-preview`).set("X-Company-Id", "company").send({ ...draft, customerId: "other-customer" }).expect(409);
    expect(await tx.select().from(communications)).toHaveLength(before.length);
    expect(preview).toMatchObject({ to: "reply@example.test", greeting: "Hi Synthetic,", subject: "Re: Synthetic estimate",
      staff: { name: user.name, role: "admin" } });
    const transport = vi.fn(async (_box: string, _opts: SendEmailOptions, reserved?: string) => ({
      threadId: "collision", messageId: "<sent-reply@example.test>", reservedMessageId: reserved!, gmailId: "synthetic-reply",
    }));
    const receipt = await sendConversationReply(user, thread.key, draft, transport);
    const retry = await sendConversationReply(user, thread.key, draft, transport);
    expect(retry).toEqual(receipt);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toMatchObject({ subject: preview.subject, bodyHtml: preview.html, bodyText: preview.text,
      to: [preview.to], threadId: "collision", inReplyTo: "<parent@example.test>",
      references: ["<first@example.test>", "<second@example.test>", "<external@example.test>", "<parent@example.test>"] });
    expect(preview.html).not.toContain(user.name);
    expect(preview.text).not.toContain(user.name);
    expect(preview.text).not.toContain("Private older text");
    const [stored] = await tx.select().from(communications).where(eq(communications.id, receipt.id));
    expect(stored).toMatchObject({ bodyText: draft.body, bodyHtml: preview.html, providerMessageId: "<sent-reply@example.test>" });
    await api.post("/api/unsorted-emails/pending/route").set("X-Company-Id", "company").send({ customerId: "customer" }).expect(200);
    await api.post("/api/unsorted-emails/pending/route").set("X-Company-Id", "company").send({ customerId: "customer" }).expect(409);
    const routed = (await api.get("/api/conversations?customerId=customer&search=To%20route").expect(200)).body;
    expect(routed.items[0]).toMatchObject({ subject: "To route", kind: "inquiry", hasAttachments: true });
  });
}, 30_000);

it("only deletes the ten exact reviewed samples, preserves near matches and detects changes", async () => {
  await fixture(async tx => {
    const rows = sampleCommunicationFingerprints.map((f, i) => ({
      ...f, id: `sample-${i}`, companyId: "company", customerId: "customer",
      status: f.status, type: f.type, sentAt: f.sentAt ? new Date(f.sentAt) : null,
      scheduledFor: f.scheduledFor ? new Date(f.scheduledFor) : null, followUpDueAt: f.followUpDueAt ? new Date(f.followUpDueAt) : null,
    }));
    const [first] = rows;
    await tx.insert(mailboxAccounts).values({ id: "shared", companyId: "company", accountType: "shared",
      emailAddress: "office@example.test", displayName: "Shared Office" });
    await tx.insert(communications).values([...rows, { ...first, id: "foreign-exact", companyId: "foreign" },
      { ...first, id: "near-body", body: first.body + " " }, { ...first, id: "near-date", sentAt: at(3) },
      { ...first, id: "near-mailbox", mailboxAccountId: "shared" },
      { ...first, id: "near-provider", providerMessageId: "<imported@example.test>" }]);
    const path = "/api/mailbox-accounts/cleanup/samples";
    await appFor({ ...user, activeRole: "office" }).get(path).set("X-Company-Id", "company").expect(403);
    const api = appFor(), preview = () => api.get(path).set("X-Company-Id", "company");
    const post = (reviewKey: string) => api.post(path).set("X-Company-Id", "company").send({ confirm: true, reviewKey });
    const report = (await preview().expect(200)).body;
    expect(report.counts).toEqual({ samples: 10, skipped: 0 });
    await tx.insert(communications).values({ ...first, id: "duplicate" });
    await post(report.reviewKey).expect(409);
    expect((await preview().expect(200)).body.counts).toEqual({ samples: 9, skipped: 2 });
    await tx.delete(communications).where(and(eq(communications.companyId, "company"), eq(communications.id, "duplicate")));
    const fresh = (await preview().expect(200)).body;
    expect((await post(fresh.reviewKey).expect(200)).body.counts.samples).toBe(10);
    const empty = (await preview().expect(200)).body;
    expect(empty.counts.samples).toBe(0);
    await post(empty.reviewKey).expect(200);
    expect((await tx.select({ id: communications.id }).from(communications)).map(r => r.id).sort())
      .toEqual(["foreign-exact", "near-body", "near-date", "near-mailbox", "near-provider"]);
  });
}, 30_000);
