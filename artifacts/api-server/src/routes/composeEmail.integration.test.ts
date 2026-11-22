import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { companies, communications, mailboxAccounts, type Customer } from "@workspace/db";
import { expect, it, vi } from "vitest";
import type { UserWithContext } from "../auth";
import { db, inTransaction } from "../db";
import { requireCommPermission } from "../lib/communicationPermissions";
import { composeEmailOptions, previewComposeEmail, sendComposeDraft } from "../services/composeEmail";
import type { SendEmailOptions } from "../services/gmailSender";
import { registerComposeEmailRoutes } from "./composeEmail";
import { createCustomerCommunication } from "./customerCommunicationCreate";

it("renders without writes and sends each scoped draft once, with reply metadata and failure status", async () => {
  await db.transaction(async tx => {
    for (const table of ["communications", "mailbox_accounts", "companies", "company_document_settings", "settings", "customers", "estimate_versions", "unsorted_emails", "communication_links", "communication_audit_log"]) {
      await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    await tx.insert(companies).values({ id: "co", name: "Example Landscapes", slug: "example-test" });
    const token = { testFixtureOnly: true };
    await tx.insert(mailboxAccounts).values([
      { id: "no-token", companyId: "co", emailAddress: "missing@example.test", displayName: "Missing authorization", accountType: "shared", syncStatus: "connected", syncEnabled: true },
      { id: "shared", companyId: "co", emailAddress: "office@example.test", displayName: "Office", accountType: "shared", syncStatus: "connected", syncEnabled: true, oauthTokenJson: token },
      { id: "foreign", companyId: "other", emailAddress: "foreign@example.test", displayName: "Foreign", accountType: "shared", syncStatus: "connected", syncEnabled: true, oauthTokenJson: token },
      { id: "personal", companyId: "co", emailAddress: "personal@example.test", displayName: "Personal", accountType: "personal", ownerUserId: "someone-else", syncStatus: "connected", syncEnabled: true, oauthTokenJson: token },
    ]);
    const draft = { companyId: "co", subject: "Exact & unchanged", body: "Hello <b>there</b>.\n\nNext paragraph.", recipientEmail: "recipient@example.test",
      type: "email" as const, direction: "outbound" as const, status: "draft" as const, deliveryStatus: "pending" as const };
    await tx.insert(communications).values([
      { ...draft, id: "new" }, { ...draft, id: "failure" }, { ...draft, id: "wrong-company", companyId: "other" },
      { ...draft, id: "no-box", mailboxAccountId: "foreign" }, { ...draft, id: "hidden-box", mailboxAccountId: "personal" },
      { ...draft, id: "parent", status: "sent", direction: "inbound", mailboxAccountId: "shared",
        customerId: "customer", fromAddress: "original@example.test", fromName: "Synthetic Customer",
        providerMessageId: "<parent@example.test>", providerThreadId: "gmail-thread", inReplyTo: "<root@example.test>" },
      { ...draft, id: "reply", customerId: "customer", subject: "Re: Exact & unchanged", mailboxAccountId: "shared", inReplyTo: "parent" },
      { ...draft, id: "inbound", direction: "inbound" }, { ...draft, id: "no-token", mailboxAccountId: "no-token" },
    ]);
    const get = async (id: string) => (await tx.select().from(communications).where(eq(communications.id, id)))[0];
    let signalEntered!: () => void, releaseTransport!: () => void;
    const entered = new Promise<void>(resolve => { signalEntered = resolve; });
    const held = new Promise<void>(resolve => { releaseTransport = resolve; });
    const transport = vi.fn(async (_id: string, _opts: SendEmailOptions, messageId?: string) => ({
      messageId: messageId!, reservedMessageId: messageId!, gmailId: "internal", threadId: "gmail-thread",
    }));
    const happy = (messageId?: string) => ({ messageId: messageId!, reservedMessageId: messageId!, gmailId: "internal", threadId: "gmail-thread" });
    const audit = vi.fn(async () => {});
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const role = req.get("x-role") ?? "office";
      Object.assign(req, { isAuthenticated: () => role !== "guest",
        user: { id: "sender", activeCompanyId: "co", accessRole: role, activeRole: role } as UserWithContext });
      next();
    });
    registerComposeEmailRoutes(app, requireCommPermission("send"), {
      preview: (company, input) => inTransaction(tx, () => previewComposeEmail(company, input)),
      send: (user, id, recipient) => inTransaction(tx, () => sendComposeDraft(user, id, recipient, transport)),
      audit,
    });
    const client = request(app), url = "/api/communications";
    const send = (id: string) => client.post(`${url}/${id}/send`).send({});
    await send("new").set("x-role", "field").expect(403);
    await send("new").set("x-role", "guest").expect(401);
    await send("new").set("X-Company-Id", "other").expect(409);
    await send("wrong-company").expect(404);
    await send("inbound").expect(422);
    await send("no-box").expect(422);
    await send("no-token").expect(422);
    // Exercise the mailbox service with a limited viewer independently of the sender-role gate.
    await expect(inTransaction(tx, () => sendComposeDraft({
      id: "sender", activeCompanyId: "co", activeRole: "field",
    } as UserWithContext, "hidden-box", undefined, transport))).rejects.toMatchObject({ status: 422 });
    const previewInput = { subject: draft.subject, body: draft.body };
    await client.post(`${url}/preview`).set("x-role", "field").send(previewInput).expect(403);
    const preview = (await client.post(`${url}/preview`).send(previewInput).expect(200)).body;
    expect(preview.html).toContain("&lt;b&gt;there&lt;/b&gt;");
    expect(await get("new")).toMatchObject({ status: "draft", deliveryStatus: "pending", providerMessageId: null });
    expect(await tx.select().from(communications)).toHaveLength(9);
    expect(transport).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();

    transport.mockImplementationOnce(async (_id, _opts, messageId) => {
      signalEntered();
      await held;
      return happy(messageId);
    });
    const first = send("new").then(result => result);
    try {
      await Promise.race([entered, first.then(result => { throw new Error(`Send exited before transport: ${result.status} ${result.text}`); })]);
      expect(await get("new")).toMatchObject({ status: "draft", deliveryStatus: "pending" });
      await send("new").expect(409);
    } finally { releaseTransport(); }
    const sent = await first;
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ status: "sent", deliveryStatus: "sent", sentAt: expect.any(String), bodyHtml: preview.html,
      bodyText: preview.text, providerMessageId: expect.stringMatching(/^<.+@highplains\.crm>$/), providerThreadId: "gmail-thread" });
    await send("new").expect(409);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]).toEqual(["shared", expect.objectContaining({
      subject: draft.subject, bodyHtml: preview.html, bodyText: preview.text,
    }), sent.body.providerMessageId]);

    const reply = await send("reply").expect(200);
    expect(reply.body).toMatchObject({ status: "sent", bodyHtml: expect.stringContaining("Hi Synthetic,"), bodyText: draft.body });
    expect(transport.mock.calls[1][1]).toMatchObject({ threadId: "gmail-thread", inReplyTo: "<parent@example.test>",
      references: ["<root@example.test>", "<parent@example.test>"], to: ["original@example.test"],
      bodyText: expect.stringContaining("Thank you,\nExample Landscapes") });
    expect(transport.mock.calls[1][1].bodyHtml).toContain("&lt;b&gt;there&lt;/b&gt;");

    transport.mockRejectedValueOnce(new Error("Reconnect Gmail"));
    const failed = await send("failure").expect(200);
    expect(failed.body).toMatchObject({ status: "draft", deliveryStatus: "failed", failureReason: "Reconnect Gmail", sentAt: null });
    expect(await get("failure")).toMatchObject({ deliveryStatus: "failed", failureReason: "Reconnect Gmail" });
    expect(audit).toHaveBeenCalledTimes(2);
  });
}, 30_000);

it("logs against disconnected or sync-disabled customer mailboxes without creating delivery drafts", async () => {
  await db.transaction(async tx => {
    for (const table of ["communications", "mailbox_accounts", "settings"]) {
      await tx.execute(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    const mailbox = { companyId: "co", displayName: "Fixture", accountType: "shared" as const, isActive: true, oauthTokenJson: { fixture: true } };
    await tx.insert(mailboxAccounts).values([
      { ...mailbox, id: "disconnected", emailAddress: "off@example.test", syncEnabled: true, syncStatus: "disconnected" as const },
      { ...mailbox, id: "disabled", emailAddress: "disabled@example.test", syncEnabled: false, syncStatus: "connected" as const },
      { ...mailbox, id: "connected", emailAddress: "on@example.test", syncEnabled: true, syncStatus: "connected" as const },
    ]);
    const user = { id: "sender", activeCompanyId: "co", activeRole: "office", accessRole: "office" } as UserWithContext;
    const send = vi.fn(async (_user: UserWithContext, id: string) => {
      const [row] = await tx.select().from(communications).where(eq(communications.id, id));
      expect(row).toMatchObject({ status: "draft", mailboxAccountId: "connected" });
      const [result] = await tx.update(communications).set({ status: "sent", deliveryStatus: "sent" })
        .where(eq(communications.id, id)).returning();
      return result;
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { Object.assign(req, { user }); void inTransaction(tx, async () => next()); });
    const path = "/api/customers/customer/communications";
    app.post("/api/customers/:customerId/communications", createCustomerCommunication({
      getCustomerById: async (id, companyId) => ({ id, companyId }) as Customer,
      createCommunication: async data => (await tx.insert(communications).values(data).returning())[0],
      options: ctx => inTransaction(tx, () => composeEmailOptions(ctx)), send, audit: async () => {},
    }));
    const client = request(app);
    const data = { direction: "outbound", status: "sent", type: "email", subject: "Test", bodyText: "Already sent" };
    for (const mailboxAccountId of ["disconnected", "disabled"]) {
      // Older clients omit the intent; it is inferred from server-side capability.
      const result = await client.post(path).send({ ...data, mailboxAccountId }).expect(201);
      expect(result.body).toMatchObject({ status: "sent", mailboxAccountId });
      await client.post(path).send({ ...data, mailboxAccountId, deliveryIntent: "send" }).expect(422);
    }
    await client.post(path).send({ ...data, mailboxAccountId: "connected", deliveryIntent: "log" }).expect(201);
    expect(send).not.toHaveBeenCalled();
    expect((await tx.select().from(communications)).map(row => row.status)).toEqual(["sent", "sent", "sent"]);
    await client.post(path).send({ ...data, mailboxAccountId: "connected", deliveryIntent: "send" }).expect(201);
    expect(send).toHaveBeenCalledTimes(1);
  });
}, 30_000);
