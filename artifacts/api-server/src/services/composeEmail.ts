import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { communications, customers, mailboxAccounts, type Communication } from "@workspace/db";
import { z } from "zod/v4";
import type { UserWithContext } from "../auth";
import { db, inTransaction } from "../db";
import { createGmailMessageId, isRfcMessageId, sendEmail, type SendEmailOptions } from "./gmailSender";
import { resolveVisibleMailboxes } from "./mailboxScope";
import { loadEmailCompany } from "./outgoingEmail/company";
import { buildGeneralMessage } from "./outgoingEmail/serviceEmails";
import { gmailReservation, persistGmailReceipt } from "./gmailReceipt";
import { buildReplyEmail } from "./outgoingEmail/replyEmail";
import { splitEmailQuote } from "./emailQuotes";
import { firstSenderWord } from "./conversations";

const address = z.email().max(254);
export const composeEmailPreviewInput = z.object({
  customerId: z.string().min(1).optional(),
  // Validate without transforming the user-written subject.
  subject: z.string().max(998).refine(v => !!v.trim() && !/[\u0000-\u001f\u007f]/u.test(v)),
  body: z.string().max(100_000).refine(v => !!v.trim()),
}).strict();
export const sendDraftInput = z.object({ recipientEmail: address.optional() }).strict();

export class ComposeEmailError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const unavailableMailbox = () => new ComposeEmailError(422, "Connect the office mailbox before sending.");

export async function previewComposeEmail(companyId: string, input: z.infer<typeof composeEmailPreviewInput>, connection: Pick<typeof db, "select"> = db) {
  let customerName: string | undefined;
  if (input.customerId) {
    const [customer] = await connection.select({ name: customers.name }).from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.id, input.customerId)));
    if (!customer) throw new ComposeEmailError(404, "Customer not found.");
    customerName = customer.name;
  }
  const company = await loadEmailCompany(companyId);
  return buildGeneralMessage({ ...input, companyId, customerName, company, connection });
}

export function assertSendableDraft(draft: Communication | undefined) {
  if (!draft) throw new ComposeEmailError(404, "Communication not found.");
  // Some environments default old drafts to "pending". Only a pending row
  // with the preallocated Gmail RFC ID has actually been claimed.
  if (draft.status === "sent" || draft.deliveryStatus === "sent" || (draft.deliveryStatus === "pending" && draft.providerMessageId)) {
    throw new ComposeEmailError(409, "This email has already been sent or is being sent.");
  }
  if (draft.status !== "draft" || draft.type !== "email" || draft.direction !== "outbound") {
    throw new ComposeEmailError(422, "Only outbound email drafts can be sent.");
  }
  return draft;
}

export function selectComposeMailbox<T extends { id: string; accountType: string; isActive: boolean; syncEnabled: boolean; syncStatus: string }>(
  candidates: T[], visible: string[] | null, requestedId: string | null,
) {
  return candidates.find(m => m.isActive && m.syncEnabled && m.syncStatus === "connected"
    && m.accountType === "shared" && (!requestedId || m.id === requestedId)
    && (visible === null || visible.includes(m.id)));
}

export async function composeMailboxes(user: UserWithContext) {
  const companyId = user.activeCompanyId;
  const [visible, candidates] = await Promise.all([
    resolveVisibleMailboxes({ companyId, userId: user.id, role: user.activeRole, isSuperAdmin: user.isSuperAdminBool }),
    db.select({ id: mailboxAccounts.id, accountType: mailboxAccounts.accountType, displayName: mailboxAccounts.displayName,
      emailAddress: mailboxAccounts.emailAddress, isActive: mailboxAccounts.isActive, syncEnabled: mailboxAccounts.syncEnabled,
      syncStatus: mailboxAccounts.syncStatus }).from(mailboxAccounts).where(and(eq(mailboxAccounts.companyId, companyId),
       eq(mailboxAccounts.accountType, "shared"), eq(mailboxAccounts.isActive, true), eq(mailboxAccounts.syncEnabled, true), eq(mailboxAccounts.syncStatus, "connected"),
      isNotNull(mailboxAccounts.oauthTokenJson)))
      .orderBy(mailboxAccounts.id),
  ]);
  return candidates.filter(m => visible.mailboxIds === null || visible.mailboxIds.includes(m.id));
}

export async function composeEmailOptions(user: UserWithContext) {
  const candidates = await composeMailboxes(user);
  return { mailboxes: candidates.map(({ id, accountType, displayName, emailAddress }) => ({ id, accountType, displayName, emailAddress })),
    sharedMailboxId: selectComposeMailbox(candidates, null, null)?.id ?? null };
}

function replyOptions(parent: Communication | undefined, mailboxId: string) {
  if (!parent || parent.mailboxAccountId !== mailboxId || !parent.providerThreadId
    || !parent.providerMessageId || !isRfcMessageId(parent.providerMessageId) || gmailReservation(parent.providerMessageId)) {
    throw new ComposeEmailError(422, "The original Gmail thread is unavailable from this mailbox.");
  }
  const reference = parent.inReplyTo && isRfcMessageId(parent.inReplyTo) ? parent.inReplyTo : undefined;
  return { threadId: parent.providerThreadId, inReplyTo: parent.providerMessageId,
    references: [...new Set([...(reference ? [reference] : []), parent.providerMessageId])] };
}
export const replySubject = (subject: string) => subject.replace(/^(?:re:\s*)+/iu, "").trim();

export async function sendComposeDraft(user: UserWithContext, id: string, recipientOverride?: string, transport = sendEmail) {
  const companyId = user.activeCompanyId;
  const scopedRow = and(eq(communications.companyId, companyId), eq(communications.id, id));
  // Commit the claim and RFC dedup ID before calling Gmail, even across workers.
  // If delivery becomes uncertain, do not release the pending claim or auto-retry.
  const claim = await db.transaction(tx => inTransaction(tx, async () => {
    const [row] = await tx.select().from(communications).where(and(scopedRow, isNull(communications.deletedAt))).for("update");
    const draft = assertSendableDraft(row);
    const mailbox = selectComposeMailbox(await composeMailboxes(user), null, draft.mailboxAccountId);
    if (!mailbox) throw unavailableMailbox();

    const fallback = recipientOverride ?? draft.recipientEmail;
    const to = draft.toAddresses?.length ? draft.toAddresses : fallback ? [fallback] : [];
    const cc = draft.ccAddresses ?? [], bcc = draft.bccAddresses ?? [];
    if (!to.length || ![...to, ...cc, ...bcc].every(value => address.safeParse(value).success)) {
      throw new ComposeEmailError(422, "Enter a valid recipient email.");
    }
    const parsed = composeEmailPreviewInput.safeParse({ customerId: draft.customerId ?? undefined,
      subject: draft.subject, body: draft.body || draft.bodyText || "" });
    if (!parsed.success) throw new ComposeEmailError(422, "Enter a valid subject and message.");
    const opts: SendEmailOptions = { to, cc, bcc, subject: parsed.data.subject, bodyText: parsed.data.body };
    const isReply = !!(draft.inReplyTo || draft.threadId);
    if (isReply) {
      const [parent] = await tx.select().from(communications).where(and(eq(communications.companyId, companyId),
        isNull(communications.deletedAt), eq(communications.status, "sent"), eq(communications.type, "email"),
        draft.inReplyTo ? eq(communications.id, draft.inReplyTo)
          : and(eq(communications.threadId, draft.threadId!), eq(communications.mailboxAccountId, mailbox.id))))
        .orderBy(desc(communications.createdAt)).limit(1);
      Object.assign(opts, replyOptions(parent, mailbox.id));
      const original = parent!;
      if (!original.customerId || original.customerId !== draft.customerId) {
        throw new ComposeEmailError(422, "The reply must belong to the original customer.");
      }
      if (replySubject(draft.subject) !== replySubject(original.subject)) {
        throw new ComposeEmailError(422, "Keep the original subject to reply in this Gmail thread.");
      }
      const recipient = original.direction === "inbound" ? original.fromAddress
        : original.toAddresses?.length === 1 ? original.toAddresses[0] : original.recipientEmail;
      const checked = address.safeParse(recipient);
      if (!checked.success || checked.data.toLowerCase() === mailbox.emailAddress.toLowerCase()) {
        throw new ComposeEmailError(422, "The original message has no valid reply recipient.");
      }
      const name = original.direction === "inbound" ? original.fromName : null;
      const company = await loadEmailCompany(companyId, tx);
      const rendered = buildReplyEmail({ body: parsed.data.body, company, firstName: firstSenderWord(name), parent: {
        address: original.direction === "inbound" ? checked.data : mailbox.emailAddress,
        name: original.direction === "inbound" ? name : mailbox.displayName,
        at: original.receivedAt ?? original.sentAt ?? original.createdAt,
        text: splitEmailQuote(original.bodyHtml, original.bodyText ?? (original.bodyHtml ? "" : original.body)).newText,
      } });
      Object.assign(opts, { to: [checked.data], cc: [], bcc: [], subject: `Re: ${replySubject(original.subject)}`,
        bodyText: rendered.text, bodyHtml: rendered.html });
    } else {
      const email = await previewComposeEmail(companyId, parsed.data, tx);
      opts.bodyText = email.text;
      opts.bodyHtml = email.html;
    }
    const providerId = createGmailMessageId();
    await tx.update(communications).set({
      mailboxAccountId: mailbox.id, providerMessageId: providerId, deliveryProvider: "gmail",
      deliveryStatus: "pending", sentById: user.id, failureReason: null, updatedAt: new Date(),
    }).where(scopedRow);
    return { mailbox, opts, providerId, typedReply: isReply ? parsed.data.body : undefined };
  }));
  const { mailbox, opts, providerId } = claim;
  const stamp = async (changes: Partial<typeof communications.$inferInsert>) => {
    const [updated] = await db.update(communications).set({ ...changes, updatedAt: new Date() })
      .where(and(scopedRow, eq(communications.providerMessageId, providerId), eq(communications.deliveryStatus, "pending"))).returning();
    if (!updated) throw new Error("The email delivery claim could not be updated.");
    return updated;
  };
  let result;
  try {
    result = await transport(mailbox.id, opts, providerId);
  } catch (err) {
    return stamp({ deliveryStatus: "failed", failureReason: (err instanceof Error ? err.message : "Gmail send failed.").slice(0, 2000) });
  }
  return db.transaction(tx => persistGmailReceipt(tx, companyId, id, providerId, result, {
    sentAt: new Date(),
    sentById: user.id, fromAddress: mailbox.emailAddress, fromName: mailbox.displayName,
    toAddresses: opts.to, ccAddresses: opts.cc ?? [], bccAddresses: opts.bcc ?? [],
    recipientEmail: opts.to[0], subject: opts.subject, bodyText: claim.typedReply ?? opts.bodyText, bodyHtml: opts.bodyHtml ?? null,
  }));
}
