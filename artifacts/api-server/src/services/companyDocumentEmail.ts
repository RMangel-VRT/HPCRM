import { and, desc, eq, sql } from "drizzle-orm";
import { companies, companyDocumentSettings, communications, contacts, customers, mailboxAccounts, propertyManagerEmails, propertyManagers } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { companyDocumentEmailInput, type CompanyDocumentEmailInput } from "../../../../lib/db/src/companyDocumentContracts";
import { companyDocumentRepository } from "./companyDocuments";
import { CompanyDocumentObjects } from "./companyDocumentObjects";
import { CustomerDocumentError } from "./customerDocumentContent";
import { resolveVisibleMailboxes } from "./mailboxScope";
import { createGmailMessageId, sendEmail } from "./gmailSender";

/** Every To address must identify the SAME single customer. Shared manager addresses are ambiguous. */
export function unambiguousDocumentCustomer(to: string[], candidates: { customerId: string; emails: string[] }[]) {
  let selected: string | null = null;
  for (const address of to) {
    const ids = new Set(candidates.filter(c => c.emails.some(e => e.trim().toLowerCase() === address.trim().toLowerCase())).map(c => c.customerId));
    if (ids.size !== 1) return null;
    const id = [...ids][0]; if (selected && selected !== id) return null;
    selected = id;
  }
  return selected;
}
export async function matchDocumentCustomer(company: string, to: string[]) {
  const contactRows = await db.select({ customerId: contacts.customerId, emails: contacts.emails }).from(contacts)
    .innerJoin(customers, and(eq(customers.id, contacts.customerId), eq(customers.companyId, company))).where(eq(contacts.companyId, company));
  const managerRows = await db.select({ customerId: customers.id, email: propertyManagerEmails.email, legacyEmail: propertyManagers.email }).from(customers)
    .innerJoin(propertyManagers, and(eq(propertyManagers.id, customers.propertyManagerId), eq(propertyManagers.companyId, company)))
    .leftJoin(propertyManagerEmails, and(eq(propertyManagerEmails.propertyManagerId, propertyManagers.id), eq(propertyManagerEmails.companyId, company)))
    .where(eq(customers.companyId, company));
  const billingRows = await db.select({ customerId: customers.id, emails: customers.billingEmails }).from(customers).where(eq(customers.companyId, company));
  return unambiguousDocumentCustomer(to, [...contactRows.map(c => ({ ...c, emails: c.emails ?? [] })), ...billingRows,
    ...managerRows.map(c => ({ customerId: c.customerId, emails: [c.email, c.legacyEmail].filter((v): v is string => !!v) }))]);
}
export function companyDocumentAttachmentName(name: string, extension: string | null) {
  const safe = name.replace(/[\r\n\u0000-\u001f\u007f"\\/]/g, "_").trim().slice(0, 200) || "document";
  return `${safe}.${extension && /^(pdf|jpg|png)$/.test(extension) ? extension : "bin"}`;
}
const defaults = {
  repo: companyDocumentRepository,
  objects: new CompanyDocumentObjects(),
  visible: resolveVisibleMailboxes,
  async mailbox(company: string, id: string) {
    const [mailbox] = await db.select().from(mailboxAccounts).where(and(eq(mailboxAccounts.companyId, company), eq(mailboxAccounts.id, id), eq(mailboxAccounts.isActive, true)));
    return mailbox;
  },
  matchCustomer: matchDocumentCustomer,
  async record(values: typeof communications.$inferInsert) { const [row] = await db.insert(communications).values(values).returning(); return row; },
  async stamp(company: string, id: string, values: Partial<typeof communications.$inferInsert>) {
    await db.update(communications).set(values).where(and(eq(communications.companyId, company), eq(communications.id, id)));
  },
  send: sendEmail,
};
export async function emailCompanyDocuments(company: string, user: UserWithContext, body: CompanyDocumentEmailInput, deps = defaults) {
  const input = companyDocumentEmailInput.parse(body);
  const visible = await deps.visible({ companyId: company, userId: user.id, role: user.activeRole, isSuperAdmin: user.isSuperAdminBool });
  const mailbox = await deps.mailbox(company, input.mailboxAccountId);
  if (!mailbox || mailbox.companyId !== company || !mailbox.syncEnabled || mailbox.syncStatus !== "connected" ||
    (visible.mailboxIds !== null && !visible.mailboxIds.includes(mailbox.id)))
    throw new CustomerDocumentError(403, "COMPANY_DOCUMENT_MAILBOX_UNAVAILABLE");
  const snapshots = [], attachments = [];
  let total = 0;
  for (const id of input.documentIds) {
    const document = await deps.repo.get(company, id);
    if (!document.currentFileId) throw new CustomerDocumentError(404, "COMPANY_DOCUMENT_FILE_MISSING");
    const file = await deps.repo.file(company, id, document.currentFileId);
    total += file.fileSize ?? 0;
    if (total > 20 * 1024 * 1024) throw new CustomerDocumentError(413, "COMPANY_DOCUMENT_EMAIL_TOO_LARGE");
    const content = await deps.objects.read(file.filePath, company, document.id);
    // Stored size is informational; enforce actual bytes too.
    total += content.length - (file.fileSize ?? 0);
    if (total > 20 * 1024 * 1024) throw new CustomerDocumentError(413, "COMPANY_DOCUMENT_EMAIL_TOO_LARGE");
    const fileName = companyDocumentAttachmentName(document.name, file.fileType);
    attachments.push({ filename: fileName, mimeType: file.mimeType ?? "application/octet-stream", content });
    snapshots.push({ kind: "company_document", documentId: id, fileId: file.id, fileName, fileSize: content.length });
  }
  const messageId = createGmailMessageId();
  const customerId = await deps.matchCustomer(company, input.to);
  const row = await deps.record({ companyId: company, customerId, direction: "outbound", type: "email", status: "sent",
    routingMethod: "company_documents", mailboxAccountId: mailbox.id, toAddresses: input.to, ccAddresses: input.cc ?? [],
    subject: input.subject, body: input.bodyText, bodyText: input.bodyText, fromAddress: mailbox.emailAddress,
    sentById: user.id, fromName: user.name, attachmentsJson: snapshots, providerMessageId: messageId,
    deliveryProvider: "gmail", deliveryStatus: "pending" });
  let result;
  try {
    result = await deps.send(mailbox.id, { to: input.to, cc: input.cc, subject: input.subject, bodyText: input.bodyText, attachments }, messageId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail send failed";
    await deps.stamp(company, row.id, { deliveryStatus: "failed", failureReason: message.slice(0, 2000) });
    throw new CustomerDocumentError(502, "COMPANY_DOCUMENT_EMAIL_FAILED");
  }
  // Outside transport catch: a database acknowledgement failure is not proof of failed delivery.
  await deps.stamp(company, row.id, { providerMessageId: result.messageId, providerThreadId: result.threadId,
    deliveryProvider: "gmail", deliveryStatus: "sent", sentAt: new Date(), failureReason: null });
  return { communicationId: row.id, deliveryStatus: "sent" };
}
export async function companyDocumentSends(company: string, id: string) {
  await companyDocumentRepository.get(company, id);
  const rows = await db.select().from(communications).where(and(eq(communications.companyId, company),
    eq(communications.routingMethod, "company_documents"),
    sql`${communications.attachmentsJson} @> ${JSON.stringify([{ documentId: id }])}::jsonb`)).orderBy(desc(communications.createdAt));
  return rows.map(row => ({ id: row.id, date: (row.sentAt ?? row.createdAt).toISOString(), to: row.toAddresses ?? [],
    subject: row.subject, sentByName: row.fromName, deliveryStatus: row.deliveryStatus }));
}
export async function companyDocumentEmailOptions(company: string) {
  const [row] = await db.select({ companyName: companies.name, phone: companyDocumentSettings.phone }).from(companies)
    .leftJoin(companyDocumentSettings, eq(companyDocumentSettings.companyId, companies.id)).where(eq(companies.id, company));
  return { companyName: row?.companyName ?? "", phone: row?.phone?.trim() || null };
}
