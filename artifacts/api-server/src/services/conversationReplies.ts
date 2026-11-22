import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { communications, companyUsers } from "@workspace/db";
import type { UserWithContext } from "../auth";
import { db, type AppTransaction } from "../db";
import { ComposeEmailError, composeMailboxes, replySubject, selectComposeMailbox } from "./composeEmail";
import { conversationReplyTarget, conversationScope, firstSenderWord, readConversationRows } from "./conversations";
import { splitEmailQuote } from "./emailQuotes";
import { createGmailMessageId, isRfcMessageId, sendEmail } from "./gmailSender";
import { gmailReservation, persistGmailReceipt } from "./gmailReceipt";
import { lockMailIdentity } from "./mailboxIngestion";
import { loadEmailCompany } from "./outgoingEmail/company";
import { buildReplyEmail, replyLogoUrl } from "./outgoingEmail/replyEmail";

export const conversationReplyInput = z.object({
  customerId: z.string().min(1).max(128).optional(),
  parentId: z.string().min(1).max(128),
  body: z.string().max(100_000),
}).strict();
type Input = z.infer<typeof conversationReplyInput>;
const address = z.email().max(254);

async function prepareReply(tx: AppTransaction, user: UserWithContext, key: string, input: Input) {
  const companyId = user.activeCompanyId;
  const rows = await readConversationRows(await conversationScope(user, input.customerId), key, tx);
  const parent = conversationReplyTarget(rows);
  if (!parent || parent.id !== input.parentId || !parent.customerId || !parent.mailboxId
    || !parent.providerThreadId || !parent.providerMessageId)
    throw new ComposeEmailError(409, "The reply target changed or is unavailable. Reload this conversation.");
  const to = address.safeParse(parent.fromAddress);
  if (!to.success) throw new ComposeEmailError(422, "The sender does not have a valid reply address.");
  const mailbox = selectComposeMailbox(await composeMailboxes(user), null, parent.mailboxId);
  if (!mailbox || mailbox.emailAddress.toLowerCase() === to.data.toLowerCase())
    throw new ComposeEmailError(422, "The original shared mailbox is unavailable for replies.");
  const subject = `Re: ${replySubject(parent.subject)}`;
  if (subject.length > 998 || /[\u0000-\u001f\u007f]/u.test(subject)) throw new ComposeEmailError(422, "Invalid original email subject.");
  const company = await loadEmailCompany(companyId, tx);
  const text = splitEmailQuote(parent.bodyHtml, parent.bodyText ?? (parent.bodyHtml ? "" : parent.body)).newText;
  const rendered = buildReplyEmail({ body: input.body, company, firstName: firstSenderWord(parent.fromName),
    parent: { at: parent.at, name: parent.fromName, address: to.data, text } });
  const [member] = await tx.select({ role: companyUsers.role }).from(companyUsers).where(and(
    eq(companyUsers.companyId, companyId), eq(companyUsers.userId, user.id), eq(companyUsers.status, "active")));
  return { ...rendered, subject, to: to.data, company: { ...company, logoUrl: replyLogoUrl() }, mailbox,
    staff: { userId: user.id, name: user.name, role: member?.role ?? user.activeRole },
    customerId: parent.customerId, threadId: parent.providerThreadId, inReplyTo: parent.providerMessageId,
    references: [parent.inReplyTo, ...rows.slice(0, rows.indexOf(parent)).map(row => row.providerMessageId)]
      .filter((id): id is string => !!id),
  };
}

export async function previewConversationReply(user: UserWithContext, key: string, input: Input) {
  const { html, text, to, subject, greeting, company, mailbox, staff } =
    await db.transaction(tx => prepareReply(tx, user, key, input), { accessMode: "read only" });
  const { paymentInstructions: _internal, ...signature } = company;
  return { html, text, to, subject, greeting, company: signature,
    mailbox: { displayName: mailbox.displayName, emailAddress: mailbox.emailAddress }, staff };
}

export async function sendConversationReply(user: UserWithContext, key: string, input: Input, transport = sendEmail) {
  if (!input.body.trim()) throw new ComposeEmailError(400, "Enter a reply before sending.");
  const companyId = user.activeCompanyId;
  const providerId = createGmailMessageId();
  const job = await db.transaction(async tx => {
    await lockMailIdentity(tx, companyId);
    const reply = await prepareReply(tx, user, key, input);
    const [already] = await tx.select({ id: communications.id, deliveryStatus: communications.deliveryStatus })
      .from(communications).where(and(eq(communications.companyId, companyId),
        eq(communications.customerId, reply.customerId), eq(communications.mailboxAccountId, reply.mailbox.id),
        eq(communications.parentCommunicationId, input.parentId), eq(communications.deliveryProvider, "gmail"),
        eq(communications.sentById, user.id), eq(communications.body, input.body), isNull(communications.deletedAt))).limit(1);
    // A retry of the same reply to the same message must not send twice, even
    // if the browser lost the response or Gmail's acknowledgement was unclear.
    if (already) return { existing: already } as const;
    const [claim] = await tx.insert(communications).values({ companyId, customerId: reply.customerId, sentById: user.id,
      parentCommunicationId: input.parentId, inReplyTo: reply.inReplyTo, type: "email", direction: "outbound",
      status: "draft", subject: reply.subject, body: input.body, bodyText: input.body, bodyHtml: reply.html,
      deliveryStatus: "pending", deliveryProvider: "gmail", providerMessageId: providerId,
      mailboxAccountId: reply.mailbox.id, fromName: reply.mailbox.displayName, fromAddress: reply.mailbox.emailAddress,
      toAddresses: [reply.to], recipientEmail: reply.to }).returning({ id: communications.id });
    return { id: claim!.id, reply } as const;
  });
  if (job.existing) return job.existing;
  const { id, reply } = job;
  const references = [...new Set(reply.references.filter(value => value !== reply.inReplyTo
    && isRfcMessageId(value) && !gmailReservation(value)).slice(-10).concat(reply.inReplyTo))];
  try {
    const result = await transport(reply.mailbox.id, {
      to: [reply.to], subject: reply.subject, bodyHtml: reply.html, bodyText: reply.text,
      threadId: reply.threadId, inReplyTo: reply.inReplyTo, references,
    }, providerId);
    const receipt = await db.transaction(tx => persistGmailReceipt(tx, companyId, id, providerId, result, { sentAt: new Date() }));
    return { id: receipt.id, deliveryStatus: receipt.deliveryStatus };
  } catch {
    // Do not release a reservation after an uncertain send. A provider
    // acknowledgement or sync can still establish what happened.
    throw new ComposeEmailError(502, "Delivery could not be confirmed. Check the shared mailbox before sending again.");
  }
}
