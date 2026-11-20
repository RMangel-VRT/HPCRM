import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { companies, customers, contacts, communications, estimateVersions, estimateLines, mailboxAccounts, users,
  propertyManagementCompanies, propertyManagers, propertyManagerEmails, companyDocumentSettings, pool as schemaPool } from "@workspace/db";
import { db, pool } from "../db";
import { registerEstimateRoutes } from "../routes/estimates";
import { createEstimate, createLine } from "./estimates";
import { buildMimeMessage, sendEmail } from "./gmailSender";
import { parseGmailMessage, hasSyncedCommunication } from "./emailSyncService";
import { transitionEstimate } from "./estimateLifecycle";
import { renderEstimatePdfFile } from "./estimatePdf";
import { ObjectStorageService } from "../objectStorage";
import { issuedEstimatePdfs } from "./estimateIssuedPdf";

vi.mock("./gmailSender", async importOriginal => ({ ...await importOriginal<typeof import("./gmailSender")>(), sendEmail: vi.fn() }));
vi.mock("./estimateLifecycle", async importOriginal => {
  const actual = await importOriginal<typeof import("./estimateLifecycle")>();
  return { ...actual, transitionEstimate: vi.fn(actual.transitionEstimate) };
});
vi.mock("./estimateIssuedPdf", () => {
  const objects = new Map<string, Buffer>();
  return { issuedEstimatePdfs: {
    async save(id: string, content: Buffer) { objects.set(id, Buffer.from(content)); },
    async read(id: string) { const file = objects.get(id); if (!file) throw Error("Missing fake object"); return Buffer.from(file); },
    async remove(id: string) { objects.delete(id); },
  } };
});
vi.mock("./estimatePdf", async importOriginal => {
  const real = await importOriginal<typeof import("./estimatePdf")>();
  return { ...real, renderEstimatePdfFile: vi.fn(real.renderEstimatePdfFile) };
});

const company = `e5-${randomUUID()}`, other = `e5-${randomUUID()}`, user = randomUUID();
let customerId: string, mailboxId: string, foreignMailbox: string, disconnected: string, ownMailbox: string, extraMailbox: string;
const application = (companyId = company, role = "office") => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: user, name: "Estimate Tester", activeCompanyId: companyId, activeRole: role } as Express.User;
    next();
  });
  registerEstimateRoutes(app);
  return request(app);
};
const newDraft = async (withLine = true) => {
  const d = await createEstimate(company, user, { customerId, title: "Front planting" });
  if (withLine) await createLine(company, d.id, d.version.id, { lineType: "custom", sectionId: d.version.sections[0].id, quantity: "1",
    name: "Work", unit: "EA", unitPriceCents: 2000, umbrellaKey: "landscape_labor" });
  return { ...d, url: `/api/estimates/${d.id}/versions/${d.version.id}` };
};
const input = () => ({ mailboxAccountId: mailboxId, to: ["primary@example.test"], cc: ["billing@example.test"], subject: "Estimate — Front planting", note: " Ready to start next week. " });
const logs = () => db.select().from(communications).where(and(eq(communications.companyId, company), eq(communications.routingMethod, "estimate_email")));
const state = async (id: string) => (await db.select().from(estimateVersions).where(eq(estimateVersions.id, id)))[0];
const gmail = vi.mocked(sendEmail);
const render = vi.mocked(renderEstimatePdfFile);

beforeAll(async () => {
  await db.insert(companies).values([{ id: company, slug: company, name: "Estimate Test Company" }, { id: other, slug: other, name: "Other Test Company" }]);
  await db.insert(users).values({ id: user, name: "Estimate Tester", passwordHash: "test-only-not-a-login" });
  const [management] = await db.insert(propertyManagementCompanies).values({ companyId: company, name: "Management" }).returning();
  const [manager] = await db.insert(propertyManagers).values({ companyId: company, propertyManagementCompanyId: management.id,
    name: "Manager", email: "primary@example.test" }).returning();
  await db.insert(propertyManagerEmails).values({ companyId: company, propertyManagerId: manager.id, email: "PRIMARY@example.test", isPrimary: "true" });
  const [customer] = await db.insert(customers).values({ companyId: company, propertyManagerId: manager.id, name: "Estimate Test Customer",
    street: "Test Street", city: "Test", state: "CO", zip: "00000", billingEmails: ["billing@example.test"] }).returning();
  customerId = customer.id;
  await db.insert(contacts).values([{ companyId: company, customerId, name: "Primary", emails: ["primary@example.test"], isPrimary: "true" },
    { companyId: company, customerId, name: "Facilities", emails: ["facilities@example.test"] }]);
  await db.insert(companyDocumentSettings).values({ companyId: company, phone: "(303) 555-0100" });
  const boxes = await db.insert(mailboxAccounts).values([
    { companyId: company, displayName: "Shared Office", emailAddress: "office@example.test", accountType: "shared", syncStatus: "connected", syncEnabled: true },
    { companyId: other, displayName: "Other Office", emailAddress: "other@example.test", accountType: "shared", syncStatus: "connected", syncEnabled: true },
    { companyId: company, displayName: "Disconnected", emailAddress: "disconnected@example.test", accountType: "shared" },
    { companyId: company, displayName: "Personal", emailAddress: "personal@example.test", ownerUserId: user, syncStatus: "connected", syncEnabled: true },
    { companyId: company, displayName: "Another user", emailAddress: "another@example.test", syncStatus: "connected", syncEnabled: true },
  ]).returning();
  [mailboxId, foreignMailbox, disconnected, ownMailbox, extraMailbox] = boxes.map(m => m.id);
});
afterAll(async () => {
  await db.delete(companies).where(inArray(companies.id, [company, other]));
  await db.delete(users).where(eq(users.id, user));
  await Promise.all([pool.end(), schemaPool.end()]);
});
beforeEach(async () => {
  await db.delete(communications).where(eq(communications.companyId, company));
  gmail.mockReset().mockImplementation(async (_mailbox, _opts, id) => ({ messageId: id!, gmailId: "gmail-id", threadId: "gmail-thread" }));
  render.mockClear();
  vi.mocked(transitionEstimate).mockClear();
});

it("scopes options and requests to the estimate and connected mailboxes", async () => {
  const d = await newDraft(), url = `/api/estimates/${d.id}/email-options`;
  const response = await application().get(url);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ defaultMailboxId: mailboxId, phone: "(303) 555-0100" });
  expect(response.body.defaultTo.toLowerCase()).toBe("primary@example.test");
  expect(response.body.mailboxes.map((m: { id: string }) => m.id)).toEqual([mailboxId, ownMailbox, extraMailbox]);
  expect(response.body.mailboxes.map((m: { accountType: string }) => m.accountType)).toEqual(["shared", "personal", "personal"]);
  expect(response.body.recipients.map((r: { email: string }) => r.email.toLowerCase()))
    .toEqual(["primary@example.test", "facilities@example.test", "billing@example.test"]);
  expect((await application(other).get(url)).status).toBe(404);
  expect((await application(company, "field").get(url)).status).toBe(403);
  expect((await application(company, "field").post(`${d.url}/send-email`).send(input())).status).toBe(403);
  expect((await application(other).post(`${d.url}/send-email`).send(input())).status).toBe(404);
  expect((await application().post(`${d.url}/send-email`).set("X-Company-Id", other).send(input())).status).toBe(409);
  for (const forbidden of [foreignMailbox, disconnected]) {
    expect((await application().post(`${d.url}/send-email`).send({ ...input(), mailboxAccountId: forbidden })).body.error)
      .toBe("ESTIMATE_EMAIL_MAILBOX_UNAVAILABLE");
  }
  expect((await application().post(`${d.url}/send-email`).send({ ...input(), to: ["person@example.test"], cc: ["PERSON@example.test"] })).status).toBe(400);
  expect((await application().post(`${d.url}/send-email`).send({ ...input(), subject: "Subject\r\nBcc: leak@example.test" })).status).toBe(400);
  expect(gmail).not.toHaveBeenCalled();
  expect(await logs()).toHaveLength(0);
});

it("previews the company-scoped version with no write, delivery or PDF access", async () => {
  const d = await newDraft(), url = `${d.url}/email-preview`;
  const before = await state(d.version.id);
  const response = await application().post(url).send({ note: "  <script>Should only be text</script>  " });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body.subject).toBe(`Estimate ${d.estimateNumber} – Front planting`);
  expect(response.body.html).toContain("&lt;script&gt;Should only be text&lt;/script&gt;");
  expect(response.body.html).not.toContain("<script>");
  expect(response.body.text).toContain("A note from High Plains\n<script>Should only be text</script>");
  expect(response.body.text).not.toContain("Ready to start next week.");
  expect(response.body.text).toContain(`Attached: ${d.estimateNumber}.pdf · Approx. 2 pages`);
  expect(response.body.text).toContain("Work location: Test Street");
  expect(response.body.text).toContain("Thank you,\nEstimate Test Company");
  expect(response.body.text).not.toContain("Estimate Tester");
  const custom = await application().post(url).send({ subject: "  Custom review subject  " });
  expect(custom.body.subject).toBe("Custom review subject");
  expect((await application(other).post(url).send({})).status).toBe(404);
  expect((await application(company, "field").post(url).send({})).status).toBe(403);
  expect((await application().post(url).set("X-Company-Id", other).send({})).status).toBe(409);
  expect((await application().post(url).send({ note: "x".repeat(2001) })).status).toBe(400);
  expect((await application().post(url).send({ subject: "Unsafe\r\nBcc: caller@example.test" })).status).toBe(400);
  expect(await state(d.version.id)).toEqual(before);
  expect(await logs()).toHaveLength(0);
  expect(render).not.toHaveBeenCalled();
  expect(gmail).not.toHaveBeenCalled();
});

it("guards no lines and needs-price before Gmail, then stores and resends the same original even after a revision and location edit", async () => {
  const empty = await newDraft(false);
  expect((await application().post(`${empty.url}/send-email`).send(input())).body.error).toBe("NO_LINES");
  const d = await newDraft();
  await db.update(estimateLines).set({ unitPriceCents: 0, priceSource: "catalog" }).where(eq(estimateLines.versionId, d.version.id));
  expect((await application().post(`${d.url}/send-email`).send(input())).body.error).toBe("LINES_NEED_PRICE");
  expect(gmail).not.toHaveBeenCalled();
  const original = await application().post(`${d.url}/send-email`).send({ ...input(), confirmZeroPriced: true });
  expect(original.status, JSON.stringify(original.body)).toBe(200);
  expect(original.body).toMatchObject({ emailed: true, version: { status: "sent", sentMethod: "email", emailedTo: input().to,
    issuedAttachment: { filename: `${d.estimateNumber}.pdf` } } });
  expect(original.body.version).not.toHaveProperty("emailIssue");
  const [mailbox, opts, rfcId] = gmail.mock.calls[0];
  expect(mailbox).toBe(mailboxId);
  const { to, cc, subject } = input();
  expect(opts).toMatchObject({ to, cc, subject });
  expect(opts.bodyText).toContain("A note from High Plains\nReady to start next week.");
  expect(opts.bodyHtml).toContain('bgcolor="#8CC640"');
  const attachment = opts.attachments![0];
  expect(opts.attachments).toHaveLength(1);
  expect(attachment).toMatchObject({ filename: `${d.estimateNumber}.pdf`, mimeType: "application/pdf" });
  expect((await PDFDocument.load(attachment.content)).getPageCount()).toBe(original.body.version.issuedAttachment.pageCount);
  const [record] = await logs();
  expect(record).toMatchObject({ customerId, mailboxAccountId: mailboxId, fromAddress: "office@example.test", direction: "outbound",
    deliveryStatus: "sent", status: "sent", providerMessageId: rfcId, providerThreadId: "gmail-thread", toAddresses: to, ccAddresses: cc,
    body: opts.bodyText, bodyText: opts.bodyText, bodyHtml: opts.bodyHtml });
  const mime = buildMimeMessage("office@example.test", opts, rfcId!);
  expect(mime).toContain("multipart/alternative");
  for (const [type, body] of [["plain", opts.bodyText], ["html", opts.bodyHtml]]) {
    const part = mime.match(new RegExp(`Content-Type: text/${type};[^\\r]+\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n\\r\\n--`))?.[1];
    expect(Buffer.from(part!, "base64").toString("utf8")).toBe(body);
  }
  const parsed = parseGmailMessage({ id: "gmail-id", threadId: "gmail-thread", payload: { headers: [
    { name: "From", value: "office@example.test" }, { name: "Message-ID", value: mime.match(/^Message-ID: (.+)$/m)![1].trim() },
  ] } });
  expect(await hasSyncedCommunication(company, parsed!.providerMessageId)).toBe(true);
  expect(await hasSyncedCommunication(other, parsed!.providerMessageId)).toBe(false);
  const issue = (await state(d.version.id)).emailIssue!;
  await expect(new ObjectStorageService().getObjectEntityFile(`/objects/estimate-issued-pdfs/${issue.objectId}.pdf`)).rejects.toThrow("Object not found");
  expect((await application(other).get(`${d.url}/pdf`)).status).toBe(404);
  expect((await application().post(`${d.url}/revise`).send({})).status).toBe(200);
  expect((await application().put(`/api/estimates/${d.id}/work-location`).send({ label: "New live location", details: null })).status).toBe(200);
  const archived = await application().get(`${d.url}/pdf?download=1`);
  expect(archived.headers["content-disposition"]).toContain(`"${attachment.filename}"`);
  const doc = await renderEstimatePdfFile(company, d.id, d.version.id);
  expect(doc.pdf.equals(attachment.content)).toBe(true);
  const before = await state(d.version.id);
  expect((await application().post(`${d.url}/send-email`).send(input())).status).toBe(409);
  // Reproduce an E5 receipt, which has a subject but does not have branded HTML.
  const legacySubject = "Original E5 custom subject";
  await db.update(communications).set({ subject: legacySubject, body: "Old content", bodyText: "Old content", bodyHtml: null })
    .where(eq(communications.id, record.id));
  await db.update(companyDocumentSettings).set({ phone: "(303) 555-0199" }).where(eq(companyDocumentSettings.companyId, company));
  try {
    const preview = await application().post(`${d.url}/email-preview`).send({ subject: "Do not use", note: input().note });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.subject).toBe(legacySubject);
    expect(preview.body.text).toContain("(303) 555-0199");
    expect(preview.body.text).not.toMatch(/Approx\.|Version 2|Old content/);
    const resent = await application().post(`${d.url}/send-email`).set("X-Estimate-Resend", "1")
      .send({ ...input(), subject: "Still do not use", to: ["again@example.test"] });
    expect(resent.status, JSON.stringify(resent.body)).toBe(200);
    expect(resent.body.emailed).toBe(true);
    expect(gmail.mock.calls[1][1]).toMatchObject({ subject: legacySubject, bodyText: preview.body.text, bodyHtml: preview.body.html });
    expect(gmail.mock.calls[1][1].attachments![0]).toEqual(attachment);
    expect(gmail.mock.calls[1][2]).not.toBe(rfcId);
    expect(await state(d.version.id)).toEqual(before);
    expect(await logs()).toHaveLength(2);
  } finally {
    await db.update(companyDocumentSettings).set({ phone: "(303) 555-0100" }).where(eq(companyDocumentSettings.companyId, company));
  }
}, 30_000);

it("previews and sends a revision against its actual earlier sent facts", async () => {
  const draft = await newDraft();
  expect((await application().post(`${draft.url}/send`).send({ method: "hard_copy" })).status).toBe(200);
  await db.update(estimateVersions).set({ sentAt: new Date("2025-06-01T05:00:00Z") }).where(eq(estimateVersions.id, draft.version.id));
  const revised = await application().post(`${draft.url}/revise`).send({});
  expect(revised.status).toBe(200);
  const id = revised.body.version.id;
  await db.update(estimateLines).set({ unitPriceCents: 3000 }).where(eq(estimateLines.versionId, id));
  const url = `/api/estimates/${draft.id}/versions/${id}`;
  const preview = await application().post(`${url}/email-preview`).send({});
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  expect(preview.body.subject).toBe(`Revised estimate ${draft.estimateNumber} (Version 2) – Front planting`);
  expect(preview.body.text).toContain("It replaces the version we sent on May 31, 2025.");
  expect(preview.body.text).toContain("Version 1 total: $20.00 (previous)\nChange: + $10.00\nNew total: $30.00");
  expect(render).not.toHaveBeenCalled();
  const sent = await application().post(`${url}/send-email`).send({ ...input(), subject: preview.body.subject });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const [{ bodyText, bodyHtml }] = await logs();
  expect(bodyHtml).toContain('bgcolor="#5B9BD5"');
  expect(bodyText).toContain(`Attached: ${draft.estimateNumber}-v2.pdf · ${sent.body.version.issuedAttachment.pageCount} pages`);
  expect(bodyText).not.toContain("Approx.");
}, 30_000);

it("returns a Gmail failure without a communication, state change, or edit lock", async () => {
  const d = await newDraft();
  gmail.mockRejectedValueOnce(new Error("Gmail authentication failed. Please reconnect your Gmail account."));
  const failure = await application().post(`${d.url}/send-email`).send(input());
  expect(failure.status).toBe(502);
  expect(failure.body).toEqual({ error: "ESTIMATE_EMAIL_RECONNECT" });
  expect(await logs()).toHaveLength(0);
  expect(await state(d.version.id)).toMatchObject({ status: "draft", emailIssue: null });
  expect((await application().patch(d.url).send({ scopeOfWork: "After failure" })).status).toBe(200);
});

it("keeps the exact attachment and RFC identity when Gmail accepts but the connection resets", async () => {
  const d = await newDraft();
  let accepted: { pdf: Buffer; messageId: string } | undefined;
  gmail.mockImplementationOnce(async (_mailbox, opts, id) => {
    accepted = { pdf: opts.attachments![0].content, messageId: id! };
    throw new Error("Gmail send failed: socket hang up");
  });
  const uncertain = await application().post(`${d.url}/send-email`).send(input());
  expect(uncertain.status).toBe(502);
  expect(uncertain.body).toEqual({ error: "ESTIMATE_EMAIL_DELIVERY_UNCERTAIN" });
  const reserved = (await state(d.version.id)).emailIssue;
  expect(reserved).toMatchObject({ uncertain: true, filename: `${d.estimateNumber}.pdf` });
  expect(await issuedEstimatePdfs.read(reserved!.objectId)).toEqual(accepted!.pdf);
  const [pending] = await logs();
  expect(pending).toMatchObject({ deliveryStatus: "pending", deletedAt: expect.any(Date), providerMessageId: accepted!.messageId });
  expect(await hasSyncedCommunication(company, accepted!.messageId)).toBe(true);
  expect((await application().post(`${d.url}/send-email`).send(input())).body.error).toBe("ESTIMATE_EMAIL_DELIVERY_UNCERTAIN");
  expect((await application().post(`${d.url}/send`).send({ method: "email" })).status).toBe(409);
  expect((await application().get(`/api/estimates/${d.id}`)).body.version).toMatchObject({ status: "draft", emailDelivery: "uncertain" });
  expect(gmail).toHaveBeenCalledTimes(1);
}, 30_000);

it("prevents overlapping sends and edits, preserves the delivery when transition fails, and recovers only through send", async () => {
  const d = await newDraft();
  let entered!: () => void, resume!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const released = new Promise<void>(r => { resume = r; });
  gmail.mockImplementationOnce(async (_mailbox, _opts, messageId) => {
    entered(); await released;
    return { messageId: messageId!, gmailId: "id", threadId: "thread" };
  });
  vi.mocked(transitionEstimate).mockRejectedValueOnce(new Error("Injected transition failure"));
  const send = application().post(`${d.url}/send-email`).send(input()).then(r => r);
  try {
    await started;
    expect(await hasSyncedCommunication(company, gmail.mock.calls[0][2]!)).toBe(true);
    expect((await logs())[0].deletedAt).not.toBeNull();
    const [second, patch] = await Promise.all([
      application().post(`${d.url}/send-email`).send(input()),
      application().patch(d.url).send({ scopeOfWork: "Concurrent edit" }),
    ]);
    expect(second.body.error).toBe("ESTIMATE_EMAIL_IN_PROGRESS");
    expect(patch.body.error).toBe("ESTIMATE_EMAIL_IN_PROGRESS");
  } finally { resume(); }
  expect((await send).body).toEqual({ error: "ESTIMATE_EMAIL_TRANSITION_FAILED", emailed: true, recoveryAvailable: true });
  expect(await state(d.version.id)).toMatchObject({ status: "draft" });
  expect((await application().post(`${d.url}/send-email`).send(input())).body).toMatchObject({ emailed: true, recoveryAvailable: true });
  expect((await application().post(`${d.url}/send`).send({ method: "portal" })).status).toBe(409);
  const recovered = await application().post(`${d.url}/send`).send({ method: "email" });
  expect(recovered.body.version).toMatchObject({ status: "sent", sentMethod: "email", emailedTo: input().to });
  expect(gmail).toHaveBeenCalledTimes(1);
  expect(await logs()).toHaveLength(1);
}, 30_000);

it.each(["hard_copy", "portal", "other"])("keeps mark-only method %s without inventing an original", async method => {
  const d = await newDraft();
  const result = await application().post(`${d.url}/send`).send({ method });
  expect(result.body.version).toMatchObject({ status: "sent", sentMethod: method });
  const resend = await application().post(`${d.url}/send-email`).set("X-Estimate-Resend", "1").send(input());
  expect(resend.body.error).toBe("ESTIMATE_EMAIL_ORIGINAL_UNAVAILABLE");
  expect(gmail).not.toHaveBeenCalled();
  expect(await logs()).toHaveLength(0);
});
