import { and, desc, eq, sql, isNotNull } from "drizzle-orm";
import { communications, contacts, customers, mailboxAccounts, propertyManagerEmails, propertyManagers } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { companyDocumentEmailInput, type CompanyDocumentEmailInput } from "../../../../lib/db/src/companyDocumentContracts";
import { companyDocumentRepository } from "./companyDocuments";
import { CompanyDocumentObjects } from "./companyDocumentObjects";
import { CustomerDocumentError } from "./customerDocumentContent";
import { resolveVisibleMailboxes } from "./mailboxScope";
import { createGmailMessageId, sendEmail, type SendEmailResult } from "./gmailSender";
import { persistGmailReceipt } from "./gmailReceipt";
import { PDFDocument } from "pdf-lib";
import { loadEmailCompany } from "./outgoingEmail/company";
import { buildDocumentsEmail } from "./outgoingEmail/serviceEmails";
import { DEFAULT_WORDING, getEmailWording } from "./outgoingEmail/wording";

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
  company: loadEmailCompany,
  wording: getEmailWording,
  async mailbox(company: string, id: string) {
    const [mailbox] = await db.select().from(mailboxAccounts).where(and(eq(mailboxAccounts.companyId, company), eq(mailboxAccounts.id, id),
      eq(mailboxAccounts.isActive, true), eq(mailboxAccounts.accountType, "shared"), isNotNull(mailboxAccounts.oauthTokenJson)));
    return mailbox;
  },
  matchCustomer: matchDocumentCustomer,
  async customerName(company: string, id: string) {
    const [row] = await db.select({ name: customers.name }).from(customers)
      .where(and(eq(customers.companyId, company), eq(customers.id, id)));
    return row?.name;
  },
  async record(values: typeof communications.$inferInsert) { const [row] = await db.insert(communications).values(values).returning(); return row; },
  async stamp(company: string, id: string, values: Partial<typeof communications.$inferInsert>, receipt?: SendEmailResult) {
    if (receipt) {
      await db.transaction(tx => persistGmailReceipt(tx, company, id, receipt.reservedMessageId, receipt, values));
      return;
    }
    await db.update(communications).set(values).where(and(eq(communications.companyId, company), eq(communications.id, id),
      eq(communications.deliveryStatus, "pending")));
  },
  send: sendEmail,
};
async function prepareCompanyDocuments(company: string, user: UserWithContext, body: unknown, deps: typeof defaults) {
  const input = companyDocumentEmailInput.parse(body);
  const visible = await deps.visible({ companyId: company, userId: user.id, role: user.activeRole, isSuperAdmin: user.isSuperAdminBool });
  const mailbox = await deps.mailbox(company, input.mailboxAccountId);
  if (!mailbox || mailbox.companyId !== company || mailbox.accountType !== "shared" || !mailbox.isActive ||
    !mailbox.oauthTokenJson || !mailbox.syncEnabled || mailbox.syncStatus !== "connected" ||
    (visible.mailboxIds !== null && !visible.mailboxIds.includes(mailbox.id)))
    throw new CustomerDocumentError(403, "COMPANY_DOCUMENT_MAILBOX_UNAVAILABLE");
  const snapshots = [], attachments = [], documents = [];
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
    // Older files need not be readable by pdf-lib to remain attachable.
    const pageCount = file.fileType === "pdf"
      ? await PDFDocument.load(content, { updateMetadata: false }).then(pdf => pdf.getPageCount()).catch(() => undefined)
      : undefined;
    documents.push({ title: document.name, filename: fileName, pageCount });
  }
  const [details, wording, customerId] = await Promise.all([
    deps.company(company), deps.wording(company, "documents"), deps.matchCustomer(company, input.to),
  ]);
  const customerName = customerId ? await deps.customerName(company, customerId) : undefined;
  const email = await buildDocumentsEmail({ companyId: company, company: details, documents, note: input.note,
    subject: input.subject, wording, customerName });
  return { input, mailbox, snapshots, attachments, email, customerId };
}

export async function previewCompanyDocuments(company: string, user: UserWithContext, body: unknown, deps = defaults) {
  const { email } = await prepareCompanyDocuments(company, user, body, deps);
  return email;
}

export async function emailCompanyDocuments(company: string, user: UserWithContext, body: CompanyDocumentEmailInput, deps = defaults) {
  const { input, mailbox, snapshots, attachments, email, customerId } = await prepareCompanyDocuments(company, user, body, deps);
  const messageId = createGmailMessageId();
  const row = await deps.record({ companyId: company, customerId, direction: "outbound", type: "email", status: "sent",
    routingMethod: "company_documents", mailboxAccountId: mailbox.id, toAddresses: input.to, ccAddresses: input.cc ?? [],
    subject: email.subject, body: email.text, bodyText: email.text, bodyHtml: email.html, fromAddress: mailbox.emailAddress,
    sentById: user.id, fromName: mailbox.displayName, attachmentsJson: snapshots, providerMessageId: messageId,
    deliveryProvider: "gmail", deliveryStatus: "pending" });
  let result;
  try {
    result = await deps.send(mailbox.id, { to: input.to, cc: input.cc, subject: email.subject, bodyText: email.text, bodyHtml: email.html, attachments }, messageId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gmail send failed";
    await deps.stamp(company, row.id, { deliveryStatus: "failed", failureReason: message.slice(0, 2000) });
    throw new CustomerDocumentError(502, "COMPANY_DOCUMENT_EMAIL_FAILED");
  }
  // Outside transport catch: a database acknowledgement failure is not proof of failed delivery.
  await deps.stamp(company, row.id, { providerMessageId: result.messageId, providerThreadId: result.threadId,
    deliveryProvider: "gmail", deliveryStatus: "sent", sentAt: new Date(), failureReason: null }, result);
  return { communicationId: row.id, deliveryStatus: "sent" };
}
export async function companyDocumentSends(company: string, id: string) {
  await companyDocumentRepository.get(company, id);
  const rows = await db.select().from(communications).where(and(eq(communications.companyId, company),
    eq(communications.routingMethod, "company_documents"),
    sql`${communications.attachmentsJson} @> ${JSON.stringify([{ documentId: id }])}::jsonb`)).orderBy(desc(communications.createdAt));
  return rows.map(row => ({ id: row.id, date: (row.sentAt ?? row.createdAt).toISOString(), to: row.toAddresses ?? [],
    subject: row.subject, sentByName: row.fromName, fromAddress: row.fromAddress, deliveryStatus: row.deliveryStatus }));
}
export async function companyDocumentEmailOptions(company: string) {
  const details = await loadEmailCompany(company);
  // This endpoint has no documents or recipients yet. The preview evaluates
  // saved wording with the actual document count and any matched customer.
  const email = await buildDocumentsEmail({ companyId: company, company: details, documents: [], wording: DEFAULT_WORDING.documents });
  return { companyName: details.name, phone: details.phone || null,
    subject: email.subject.slice(0, 255).replace(/[\uD800-\uDBFF]$/, "") };
}
