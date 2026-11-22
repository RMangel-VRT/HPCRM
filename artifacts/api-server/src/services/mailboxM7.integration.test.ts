import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { companies, users, mailboxAccounts, communications, communicationAuditLog, communicationLinks, communicationThreads,
  mailboxBackfillRuns, mailboxSyncRuns, unsortedEmails, customers, contacts, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { mailboxCleanupRouter } from "../routes/mailboxCleanup";
import mailboxRouter from "../routes/mailboxAccounts";
import { createGmailMessageId, type SendEmailOptions } from "./gmailSender";
import { ingestMailboxMessage } from "./mailboxIngestion";
import { persistGmailReceipt } from "./gmailReceipt";
import { communicationListFilter } from "./communicationListFilters";
import { sendComposeDraft } from "./composeEmail";
import type { UserWithContext } from "../auth";
import { startSyncWorker, syncMailbox } from "./emailSyncService";
import { startBackfill } from "./mailboxBackfillService";
import { storage } from "../storage";
import { resolveVisibleMailboxes } from "./mailboxScope";

const gmail = vi.hoisted(() => ({ history: vi.fn(), list: vi.fn(), get: vi.fn(), token: vi.fn(async () => "fixture") }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class { setCredentials() {} } },
  gmail: () => ({ users: { history: { list: gmail.history }, messages: { get: gmail.get, list: gmail.list } } }) } }));
vi.mock("./googleOAuth", () => ({ getValidAccessToken: gmail.token, isGoogleOAuthConfigured: () => true }));

const company = randomUUID(), other = randomUUID(), actor = randomUUID();
let box: typeof mailboxAccounts.$inferSelect, legacy: typeof mailboxAccounts.$inferSelect;
let foreign: typeof mailboxAccounts.$inferSelect, off: typeof mailboxAccounts.$inferSelect, customer: string;
const token = { connected_at: "fixture-only" };
const at = new Date("2026-11-18T12:00:00Z");
const mail = (values: Partial<typeof communications.$inferInsert> = {}) => ({
  companyId: company, subject: "Fixture", body: "Fixture", type: "email" as const, direction: "outbound" as const,
  status: "sent" as const, sentAt: at, ...values,
});
const unsorted = (mailboxId: string) => ({
  companyId: company, mailboxAccountId: mailboxId, fromAddress: "fixture@example.test", subject: "Unsorted fixture", receivedAt: at,
});
const get = async (id: string) => (await db.select().from(communications).where(eq(communications.id, id)))[0];
const user = { id: actor, activeCompanyId: company, activeRole: "admin", accessRole: "admin", name: "Fixture staff" } as UserWithContext;

beforeAll(async () => {
  await db.insert(companies).values([{ id: company, slug: company, name: "M7 Fixture" }, { id: other, slug: other, name: "M7 Other" }]);
  await db.insert(users).values({ id: actor, name: "Fixture staff", passwordHash: "not-a-login" });
  const common = { displayName: "Shared Office", syncEnabled: true, syncStatus: "connected" as const, oauthTokenJson: token };
  [box, legacy, foreign, off] = await db.insert(mailboxAccounts).values([
    { ...common, companyId: company, accountType: "shared", emailAddress: "office@example.test", gmailHistoryId: "100", gmailSentHistoryId: "200" },
    { ...common, companyId: company, accountType: "personal", emailAddress: "personal@example.test", ownerUserId: actor },
    { ...common, companyId: other, accountType: "personal", emailAddress: "other@example.test" },
    { ...common, companyId: company, accountType: "shared", emailAddress: "inactive@example.test", isActive: false },
  ]).returning();
  const [cust] = await db.insert(customers).values({ companyId: company, name: "Fixture Property", street: "1 Test St",
    city: "Test", state: "CO", zip: "00000", active: "true", managementCompany: "Independent Managers" }).returning();
  customer = cust.id;
  await db.insert(contacts).values({ companyId: company, customerId: customer, name: "Contact", emails: ["customer@example.test"] });
});
afterAll(async () => {
  await db.delete(companies).where(inArray(companies.id, [company, other]));
  await db.delete(users).where(eq(users.id, actor));
  await Promise.all([pool.end(), schemaPool.end()]);
});

it("polls due shared mailboxes, consumes every history page on wake, and stops the timer", async () => {
  gmail.history.mockImplementation(async ({ labelId, pageToken }) => {
    if (labelId === "SENT") return { data: { historyId: "201" } };
    return { data: pageToken ? { historyId: "102", history: [{ messagesAdded: [{ message: { id: "reply", threadId: "a" } }] }] }
      : { historyId: "101", nextPageToken: "next" } };
  });
  gmail.get.mockResolvedValue({ data: { id: "reply", threadId: "a", labelIds: ["INBOX"], payload: { headers: [
    { name: "Message-ID", value: "<automatic-reply@example.test>" }, { name: "From", value: "customer@example.test" },
    { name: "Subject", value: "Test reply" },
  ] } } });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const stop = startSyncWorker();
  try {
    await vi.advanceTimersByTimeAsync(29_999);
    expect(gmail.history).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    // Timers launch the async worker; wait on the actual committed cursor, not the provider mock.
    await vi.waitFor(async () => {
      const [current] = await db.select().from(mailboxAccounts).where(eq(mailboxAccounts.id, box.id));
      expect(current.gmailHistoryId).toBe("102");
    });
    expect(gmail.token).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gmail.token).toHaveBeenCalledTimes(1); // Same wall-clock time: mailbox not due.
    stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    stop();
    vi.useRealTimers();
  }
  const items = await storage.getCommunications(company, { type: communicationListFilter("all") },
    await resolveVisibleMailboxes({ companyId: company, userId: actor, role: "admin" }));
  expect(communicationListFilter("all")).toBeUndefined();
  expect(communicationListFilter("inbound")).toBe("inbound");
  expect(items).toContainEqual(expect.objectContaining({ providerMessageId: "<automatic-reply@example.test>", customerId: customer }));
});

it("deduplicates backfill against a polled message and upgrades legacy resource-only IDs", async () => {
  const legacyActual = "<backfill-legacy@example.test>";
  const [legacyRow] = await db.insert(communications).values(mail({
    mailboxAccountId: box.id, customerId: customer, direction: "inbound", providerMessageId: "legacy-resource",
  })).returning();
  gmail.list.mockResolvedValueOnce({ data: { messages: [{ id: "reply" }, { id: "legacy-resource" }], resultSizeEstimate: 2 } });
  gmail.get.mockImplementation(async ({ id }) => ({ data: { id, threadId: "a", labelIds: ["INBOX"], payload: { headers: [
    { name: "Message-ID", value: id === "reply" ? "<automatic-reply@example.test>" : legacyActual },
    { name: "From", value: "Fixture Customer <customer@example.test>" },
  ] } } }));
  const { run } = await startBackfill({ companyId: company, mailboxAccountId: box.id, rangeStart: at, rangeEnd: new Date(),
    includeInbox: true, includeSent: false });
  await vi.waitFor(async () => {
    const [finished] = await db.select().from(mailboxBackfillRuns).where(eq(mailboxBackfillRuns.id, run.id));
    expect(finished).toMatchObject({ status: "success", inboxDeduped: 2, inboxRouted: 0 });
  });
  expect(await get(legacyRow.id)).toMatchObject({ providerMessageId: legacyActual, providerThreadId: "a" });
  const identities = await db.select().from(communications).where(and(eq(communications.companyId, company),
    inArray(communications.providerMessageId, ["reply", "legacy-resource", "<automatic-reply@example.test>", legacyActual])));
  expect(identities.map(row => row.providerMessageId).sort()).toEqual(["<automatic-reply@example.test>", legacyActual]);
});

it("reconciles a Sent-folder race with the original Compose record and replies using the stored ID", async () => {
  const [draft] = await db.insert(communications).values(mail({ status: "draft", customerId: customer, mailboxAccountId: box.id,
    recipientEmail: "customer@example.test", attachmentsJson: [{ kind: "fixture" }], deliveryStatus: "pending" })).returning();
  const actual = "<actual-compose@mail.gmail.com>";
  const message = { providerMessageId: actual, providerThreadId: "thread-compose", fromAddress: box.emailAddress,
    toAddresses: ["customer@example.test"], subject: draft.subject, bodyText: "Test body", receivedAt: at };
  const transport = vi.fn(async (_id: string, _opts: SendEmailOptions, reservedMessageId?: string) => {
    expect((await get(draft.id)).providerMessageId).toBe(reservedMessageId);
    expect(await ingestMailboxMessage(box, message, "outbound", "gmail-id")).toBe("routed");
    return { messageId: actual, reservedMessageId: reservedMessageId!, gmailId: "gmail-id", threadId: message.providerThreadId };
  });
  const receipt = await sendComposeDraft(user, draft.id, undefined, transport);
  expect(receipt).toMatchObject({ id: draft.id, providerMessageId: actual, fromName: box.displayName,
    fromAddress: box.emailAddress, sentById: actor, attachmentsJson: [{ kind: "fixture" }] });
  expect(await ingestMailboxMessage(box, message, "outbound", "gmail-id")).toBe("deduped");
  expect(await db.select().from(communications).where(and(eq(communications.companyId, company), eq(communications.providerMessageId, actual)))).toHaveLength(1);
  const [reply] = await db.insert(communications).values(mail({ status: "draft", subject: `Re: ${draft.subject}`, inReplyTo: draft.id,
    mailboxAccountId: box.id, customerId: customer, recipientEmail: "customer@example.test" })).returning();
  const replySend = vi.fn(async (_id: string, _opts: SendEmailOptions, reservedMessageId?: string) => ({
    messageId: "<actual-reply@mail.gmail.com>", reservedMessageId: reservedMessageId!, gmailId: "gmail-reply", threadId: message.providerThreadId,
  }));
  await sendComposeDraft(user, reply.id, undefined, replySend);
  expect(replySend.mock.calls[0][1]).toMatchObject({ inReplyTo: actual, references: [actual], threadId: message.providerThreadId });
});

it("keeps a PMC-name-only match in Unsorted, with exactly one candidate", async () => {
  const id = "<pmc-only@example.test>";
  const result = await ingestMailboxMessage(box, { providerMessageId: id, providerThreadId: "pmc",
    fromAddress: "outside@example.test", toAddresses: [box.emailAddress], subject: "Trees",
    bodyText: "Message mentions Independent Managers only", receivedAt: at }, "inbound", "pmc-id");
  expect(result).toBe("unsorted");
  const [row] = await db.select().from(unsortedEmails).where(eq(unsortedEmails.providerMessageId, id));
  expect(row.candidateCustomerIds).toEqual([customer]);
  expect(await db.select().from(communications).where(eq(communications.providerMessageId, id))).toHaveLength(0);
});

it("protects cleanup with true admin, company scope and a fresh review; preserves CRM rows and FK semantics", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const activeRole = req.get("X-Role") ?? "admin";
    Object.assign(req, { user: { ...user, activeRole, accessRole: activeRole === "account_manager" ? "admin" : activeRole } });
    next();
  });
  app.use("/cleanup", mailboxCleanupRouter);
  app.use("/mailboxes", mailboxRouter);
  const api = request(app);
  const preview = (id: string) => api.get(`/cleanup/legacy/${id}`).set("X-Company-Id", company);
  const commit = (id: string, key: string) => api.post(`/cleanup/legacy/${id}`).set("X-Company-Id", company).send({ confirm: true, reviewKey: key });
  await preview(legacy.id).set("X-Role", "account_manager").expect(403);
  await preview(legacy.id).set("X-Role", "office").expect(403);
  await preview(foreign.id).expect(404);
  await preview(box.id).expect(404);
  await api.get(`/mailboxes/${legacy.id}`).expect(404);
  await api.get(`/mailboxes/${off.id}`).expect(404);
  await api.post(`/mailboxes/${legacy.id}/sync`).expect(404);
  await api.post(`/mailboxes/${legacy.id}/backfill`).expect(404);
  await api.get(`/mailboxes/${legacy.id}/oauth/connect`).expect(404);
  await api.post("/mailboxes/mine").send({ emailAddress: "personal@example.test" }).expect(404);
  await api.post("/mailboxes").send({ emailAddress: "personal@example.test", displayName: "Personal", accountType: "personal" }).expect(400);
  await api.patch(`/mailboxes/${box.id}`).send({ accountType: "personal" }).expect(400);
  const listed = await api.get("/mailboxes").expect(200);
  expect(listed.body.map((m: { id: string }) => m.id)).toEqual([box.id]);
  expect(listed.body[0]).not.toHaveProperty("oauthTokenJson");
  const [deactivating] = await db.insert(mailboxAccounts).values({ companyId: company, displayName: "To deactivate",
    accountType: "shared", emailAddress: "deactivate@example.test", syncEnabled: true, syncStatus: "connected", oauthTokenJson: token }).returning();
  const deactivation = await api.delete(`/mailboxes/${deactivating.id}`).expect(200);
  expect(deactivation.body).toEqual({ success: true });
  await api.get(`/mailboxes/${deactivating.id}`).expect(404);
  expect((await preview(deactivating.id).expect(200)).body.counts.mailboxes).toBe(1);
  expect(await ingestMailboxMessage(deactivating, { providerMessageId: "<queued@example.test>", providerThreadId: "test",
    fromAddress: "customer@example.test", toAddresses: [deactivating.emailAddress], subject: "Queued", bodyText: "", receivedAt: at },
  "inbound", "queued-id")).toBe("stopped");
  expect((await db.select().from(mailboxAccounts).where(eq(mailboxAccounts.id, deactivating.id)))[0])
    .toMatchObject({ isActive: false, syncEnabled: false });
  await expect(syncMailbox(legacy.id, true)).rejects.toThrow();
  await expect(startBackfill({ mailboxAccountId: legacy.id, companyId: company, rangeStart: at, rangeEnd: new Date(),
    includeInbox: true, includeSent: true })).rejects.toThrow();

  const [empty, kept, previouslyEmpty] = await db.insert(communicationThreads).values(
    ["Imported only", "Mixed", "Already empty"].map(subjectRoot => ({ companyId: company, subjectRoot }))).returning();
  const [imported, canonical, retained] = await db.insert(communications).values([
    mail({ mailboxAccountId: legacy.id, threadId: empty.id }),
    mail({ mailboxAccountId: legacy.id, threadId: kept.id, sentById: actor, routingMethod: "estimate_email",
      attachmentsJson: [{ kind: "estimate_pdf" }] }),
    mail({ mailboxAccountId: legacy.id, threadId: kept.id, deliveryProvider: "gmail" }),
  ]).returning();
  const [link] = await db.insert(communicationLinks).values({ companyId: company, communicationId: imported.id,
    linkedType: "ticket", linkedId: "fixture" }).returning();
  const [audit] = await db.insert(communicationAuditLog).values({ companyId: company, communicationId: imported.id,
    actionType: "communication_sent" }).returning();
  await db.insert(mailboxSyncRuns).values({ companyId: company, mailboxAccountId: legacy.id });
  await db.insert(mailboxBackfillRuns).values({ companyId: company, mailboxAccountId: legacy.id, rangeStart: at, rangeEnd: new Date(),
    status: "queued", cancelRequested: false, includeInbox: true, includeSent: true });
  const old = await preview(legacy.id).expect(200);
  await db.insert(unsortedEmails).values(unsorted(legacy.id));
  await commit(legacy.id, old.body.reviewKey).expect(409);
  expect(await get(imported.id)).toBeDefined();
  const reviewed = await preview(legacy.id).expect(200);
  const expected = { imported: 1, retained: 2, unsorted: 1, threads: 1, syncRuns: 1, backfillRuns: 1, mailboxes: 1 };
  expect(reviewed.body.counts).toEqual(expected);
  await api.post(`/cleanup/legacy/${legacy.id}`).set("X-Company-Id", company).send({ reviewKey: reviewed.body.reviewKey }).expect(400);
  const finished = await commit(legacy.id, reviewed.body.reviewKey).expect(200);
  expect(finished.body.counts).toEqual(expected);
  await commit(legacy.id, reviewed.body.reviewKey).expect(404);
  expect(await get(imported.id)).toBeUndefined();
  expect(await get(canonical.id)).toMatchObject({ mailboxAccountId: null, sentById: actor, attachmentsJson: [{ kind: "estimate_pdf" }] });
  expect(await get(retained.id)).toMatchObject({ mailboxAccountId: null, deliveryProvider: "gmail" });
  expect(await db.select().from(communicationLinks).where(eq(communicationLinks.id, link.id))).toEqual([]);
  expect((await db.select().from(communicationAuditLog).where(eq(communicationAuditLog.id, audit.id)))[0].communicationId).toBeNull();
  expect((await db.select().from(communicationThreads).where(inArray(communicationThreads.id, [empty.id, kept.id, previouslyEmpty.id]))).map(t => t.id))
    .toEqual(expect.arrayContaining([kept.id, previouslyEmpty.id]));
  expect(await db.select().from(communicationThreads).where(eq(communicationThreads.id, empty.id))).toEqual([]);
  expect(await ingestMailboxMessage(legacy, { providerMessageId: "<late@example.test>", providerThreadId: "late",
    fromAddress: "customer@example.test", toAddresses: [legacy.emailAddress], subject: "Late", bodyText: "", receivedAt: at }, "inbound", "late-id")).toBe("stopped");
});

it("merges only one-to-one historical matches and preserves audit, CRM reply and linked records", async () => {
  const reserved = createGmailMessageId(), actual = "<historical@mail.gmail.com>";
  const pair = { mailboxAccountId: box.id, providerThreadId: "historical", subject: "Historical",
    toAddresses: ["a@example.test", "customer@example.test"], bodyText: "Actual message\nSecond line" };
  const ambiguous = { ...pair, providerThreadId: "ambiguous" };
  const nearby = { ...pair, providerThreadId: "nearby" };
  const redirected = { ...pair, providerThreadId: "redirected" };
  const [canonical, copy, unclear, , , unmatched, original, sparkFollowup, , differentRecipient] = await db.insert(communications).values([
    mail({ ...pair, sentById: actor, providerMessageId: reserved, attachmentsJson: [{ kind: "issued" }] }),
    mail({ ...pair, providerMessageId: actual, sentAt: new Date(+at - 90_000),
      toAddresses: [" CUSTOMER@example.test ", "a@example.test"], bodyText: "Actual message\r\nSecond line\r\n" }),
    mail({ ...ambiguous, sentById: actor, providerMessageId: createGmailMessageId() }),
    mail({ ...ambiguous, providerMessageId: "<maybe-one@mail.gmail.com>" }),
    mail({ ...ambiguous, providerMessageId: "<maybe-two@mail.gmail.com>" }),
    mail({ ...pair, providerThreadId: "wrong-thread", sentById: actor, providerMessageId: createGmailMessageId() }),
    mail({ ...nearby, sentById: actor, providerMessageId: createGmailMessageId() }),
    mail({ ...nearby, providerMessageId: "<distinct-spark-followup@mail.gmail.com>", sentAt: new Date(+at + 30_000), bodyText: "A separate Spark follow-up" }),
    mail({ ...redirected, sentById: actor, providerMessageId: createGmailMessageId() }),
    mail({ ...redirected, providerMessageId: "<different-recipient@mail.gmail.com>", toAddresses: ["different@example.test"] }),
  ]).returning();
  const [child] = await db.insert(communications).values(mail({ inReplyTo: copy.id, parentCommunicationId: copy.id })).returning();
  const [link] = await db.insert(communicationLinks).values({ companyId: company, communicationId: copy.id, linkedType: "ticket", linkedId: "fixture" }).returning();
  const [audit] = await db.insert(communicationAuditLog).values({ companyId: company, communicationId: copy.id, actionType: "communication_sent" }).returning();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, { user }); next(); });
  app.use("/cleanup", mailboxCleanupRouter);
  const api = request(app);
  const preview = () => api.get("/cleanup/duplicates").set("X-Company-Id", company).expect(200);
  const initial = await preview();
  expect(initial.body.counts).toEqual({ merged: 1, ambiguous: 7, unmatched: 1 });
  await api.post("/cleanup/duplicates").set("X-Company-Id", company).send({ confirm: true, reviewKey: initial.body.reviewKey }).expect(200);
  expect(await get(copy.id)).toBeUndefined();
  expect(await get(canonical.id)).toMatchObject({ providerMessageId: actual, sentById: actor, attachmentsJson: [{ kind: "issued" }] });
  expect(await get(child.id)).toMatchObject({ inReplyTo: canonical.id, parentCommunicationId: canonical.id });
  expect((await db.select().from(communicationLinks).where(eq(communicationLinks.id, link.id)))[0].communicationId).toBe(canonical.id);
  expect((await db.select().from(communicationAuditLog).where(eq(communicationAuditLog.id, audit.id)))[0].communicationId).toBe(canonical.id);
  expect(await get(unclear.id)).toBeDefined();
  expect(await get(unmatched.id)).toBeDefined();
  expect(await get(original.id)).toMatchObject({ providerMessageId: original.providerMessageId });
  expect(await get(sparkFollowup.id)).toBeDefined();
  expect(await get(differentRecipient.id)).toBeDefined();
  const second = await preview();
  expect(second.body.counts).toEqual({ merged: 0, ambiguous: 7, unmatched: 1 });
  await api.post("/cleanup/duplicates").set("X-Company-Id", company).send({ confirm: true, reviewKey: second.body.reviewKey }).expect(200);
});

it("collapses the exact imported copy before updating the receipt and leaves other companies alone", async () => {
  const reservedMessageId = createGmailMessageId(), actual = "<actual-receipt@mail.gmail.com>";
  const [claim, copy, external] = await db.insert(communications).values([
    mail({ mailboxAccountId: box.id, sentById: actor, providerMessageId: reservedMessageId, deliveryStatus: "pending", deliveryProvider: "gmail" }),
    mail({ mailboxAccountId: box.id, providerMessageId: actual }),
    mail({ companyId: other, providerMessageId: actual }),
  ]).returning();
  const receipt = await db.transaction(tx => persistGmailReceipt(tx, company, claim.id, reservedMessageId,
    { reservedMessageId, messageId: actual, gmailId: "resource", threadId: "thread" }, { sentAt: new Date() }));
  expect(receipt).toMatchObject({ id: claim.id, providerMessageId: actual, providerThreadId: "thread", deliveryStatus: "sent" });
  expect(await get(copy.id)).toBeUndefined();
  expect(await get(external.id)).toBeDefined();
  // No application schema changes or external mail calls are needed.
  expect((await db.execute(sql`SELECT 1`)).rowCount).toBe(1);
});
