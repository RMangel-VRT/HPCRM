import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { communications, estimates, estimateVersions, type Estimate, type EstimateVersion, type EstimateEmailIssue } from "@workspace/db";
import { estimateApproximatePages, estimateEmailInput, estimateEmailPreviewInput, estimateHasMultipleVersions,
  estimatePdfFilename, type IssuedEstimateAttachment } from "@workspace/db/estimate-contracts";
import { PDFDocument } from "pdf-lib";
import type { UserWithContext } from "../auth";
import { db, type AppTransaction } from "../db";
import { logger } from "../lib/logger";
import { DocumentRendererUnavailable } from "./documents/browser";
import { EstimateError, requireEstimate } from "./estimateErrors";
import { visibleEstimateSenders } from "./estimateEmailOptions";
import { issuedEstimatePdfs } from "./estimateIssuedPdf";
import { preflightEstimateSend, transitionEstimate } from "./estimateLifecycle";
import { renderEstimatePdfFile } from "./estimatePdf";
import { estimatePayload, readEstimate } from "./estimateReads";
import { createGmailMessageId, isRfcMessageId, sendEmail } from "./gmailSender";
import { gmailReservation, persistGmailReceipt } from "./gmailReceipt";
import { replySubject } from "./composeEmail";
import { loadEmailCompany } from "./outgoingEmail/company";
import { buildEstimateEmail } from "./outgoingEmail/estimateEmail";

const dependencies = { send: sendEmail, storage: issuedEstimatePdfs, render: renderEstimatePdfFile, transition: transitionEstimate };
const estimateScope = (companyId: string, estimateId: string) =>
  and(eq(estimates.companyId, companyId), eq(estimates.id, estimateId));
const versionScope = (companyId: string, estimateId: string, versionId: string) =>
  and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimateId), eq(estimateVersions.id, versionId));
const lockEstimate = async (tx: AppTransaction, companyId: string, estimateId: string) =>
  requireEstimate((await tx.select().from(estimates).where(estimateScope(companyId, estimateId)).for("update"))[0]);

async function originalEstimateSubject(tx: AppTransaction, companyId: string, issue: EstimateEmailIssue) {
  const [receipt] = await tx.select({ subject: communications.subject }).from(communications).where(and(
    eq(communications.companyId, companyId), eq(communications.id, issue.firstCommunicationId),
    eq(communications.routingMethod, "estimate_email"), eq(communications.deliveryStatus, "sent"),
  ));
  if (!receipt?.subject) throw new EstimateError(409, "ESTIMATE_EMAIL_ORIGINAL_UNAVAILABLE");
  return receipt.subject;
}

export async function earlierEstimateThread(tx: AppTransaction, estimate: Estimate, version: EstimateVersion, mailboxId: string) {
  if (version.versionNumber < 2) return undefined;
  const candidates = await tx.execute<{ subject: string; thread: string; message: string; reference: string | null; confirmed: boolean }>(sql`
    SELECT c.subject, c.provider_thread_id AS thread, c.provider_message_id AS message, c.in_reply_to AS reference,
      v.email_issue->'confirmedReservation' = 'true'::jsonb AS confirmed
    FROM estimate_versions v JOIN communications c ON c.id = v.email_issue->>'firstCommunicationId'
    WHERE v.company_id = ${estimate.companyId} AND v.estimate_id = ${estimate.id}
      AND v.version_number < ${version.versionNumber}
      AND c.company_id = v.company_id AND c.customer_id = ${estimate.customerId} AND c.mailbox_account_id = ${mailboxId}
      AND c.deleted_at IS NULL AND c.type = 'email' AND c.direction = 'outbound' AND c.status = 'sent'
      AND c.delivery_status = 'sent' AND c.delivery_provider = 'gmail' AND c.routing_method = 'estimate_email'
      AND nullif(c.provider_thread_id, '') IS NOT NULL AND c.provider_message_id IS NOT NULL
    ORDER BY v.version_number DESC, c.sent_at DESC, c.id`);
  const parent = candidates.rows.find(row => isRfcMessageId(row.message) && (row.confirmed || !gmailReservation(row.message))
    && !!replySubject(row.subject) && !/[\u0000-\u001f\u007f]/u.test(row.subject));
  if (!parent) return undefined;
  const reference = parent.reference && isRfcMessageId(parent.reference) && !gmailReservation(parent.reference) ? [parent.reference] : [];
  return { subject: `Re: ${replySubject(parent.subject)}`, threadId: parent.thread,
    inReplyTo: parent.message, references: [...new Set([...reference, parent.message])] };
}

async function composeEstimateEmail(tx: AppTransaction, estimate: Estimate, selected: EstimateVersion,
  input: { subject?: string; note?: string }, attachment?: IssuedEstimateAttachment) {
  const { version, versions, display } = await estimatePayload(tx, estimate.companyId, estimate, selected.versionNumber);
  const previous = versions.find(v => v.versionNumber < version.versionNumber && v.sentAt);
  return buildEstimateEmail({
    estimate: { companyId: estimate.companyId, estimateNumber: estimate.estimateNumber, title: estimate.title,
      customerName: display.customerName, workLocation: display.workLocation },
    version, previous, company: await loadEmailCompany(estimate.companyId, tx), connection: tx, now: new Date(), ...input,
    attachment: attachment ?? {
      filename: estimatePdfFilename(estimate.estimateNumber, version.versionNumber, estimateHasMultipleVersions(versions.length)),
      pageCount: estimateApproximatePages(version), approximate: true,
    },
  });
}

export async function previewEstimateEmail(user: UserWithContext, estimateId: string, versionId: string, body: unknown) {
  const input = estimateEmailPreviewInput.parse(body);
  const companyId = user.activeCompanyId;
  return db.transaction(async tx => {
    const estimate = requireEstimate((await tx.select().from(estimates).where(estimateScope(companyId, estimateId)))[0]);
    const version = requireEstimate((await tx.select().from(estimateVersions).where(versionScope(companyId, estimateId, versionId)))[0]);
    if (estimate.voidedAt || (version.status !== "sent" && (version.status !== "draft" || estimate.currentVersionId !== versionId)))
      throw new EstimateError(409, "INVALID_TRANSITION", { from: estimate.voidedAt ? "void" : version.status, action: "send" });
    const issue = version.emailIssue;
    if (version.status === "sent" && !issue) throw new EstimateError(409, "ESTIMATE_EMAIL_ORIGINAL_UNAVAILABLE");
    const originalSubject = version.status === "sent" && issue ? await originalEstimateSubject(tx, companyId, issue) : undefined;
    const [mailbox] = version.status === "draft" && version.versionNumber > 1
      ? await visibleEstimateSenders(user, input.mailboxAccountId) : [];
    const thread = mailbox ? await earlierEstimateThread(tx, estimate, version, mailbox.id) : undefined;
    const { subject, html, text } = await composeEstimateEmail(tx, estimate, version, {
      note: input.note, subject: originalSubject ?? thread?.subject ?? input.subject,
    }, issue && issue.pendingCommunicationId !== issue.firstCommunicationId ? issue : undefined);
    return { subject, html, text, originalThread: !!thread };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** The shared sender also wraps timeouts/resets, without a status or cause.
 * Only recognize its fixed rejection messages (not arbitrary wrapped text).
 * Failing closed is safer than assuming a rejected SMTP/API delivery. */
function definitiveMailboxFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  switch (message) {
    case "Gmail quota exceeded. Please try again later.": return "ESTIMATE_EMAIL_QUOTA";
    case "Gmail authentication failed. Please reconnect your Gmail account.":
    case "No OAuth tokens stored for this mailbox":
    case "OAuth token expired and no refresh token is available. Please reconnect Gmail.":
    case "Failed to refresh OAuth token. Please reconnect Gmail.": return "ESTIMATE_EMAIL_RECONNECT";
    case "Mailbox account not found":
    case "Google OAuth is not configured. Contact your administrator.": return "ESTIMATE_EMAIL_MAILBOX_UNAVAILABLE";
    case "Invalid recipient address: Invalid To header":
    case "Invalid recipient address: Invalid Cc header":
    case "Invalid recipient address: Recipient address required": return "ESTIMATE_EMAIL_INVALID_RECIPIENT";
    default: return null;
  }
}

export async function emailEstimate(user: UserWithContext, estimateId: string, versionId: string, body: unknown, resend = false,
  deps = dependencies) {
  const input = estimateEmailInput.parse(body);
  const companyId = user.activeCompanyId;
  const messageId = createGmailMessageId(), attemptId = randomUUID();
  const scope = versionScope(companyId, estimateId, versionId);
  const attemptScope = and(eq(communications.companyId, companyId), eq(communications.id, attemptId),
    eq(communications.routingMethod, "estimate_email"));

  // Commit the reservation before calling Gmail. This both blocks draft edits
  // across processes and lets Sent-folder sync recognize the RFC ID immediately.
  const job = await db.transaction(async tx => {
    const estimate = await lockEstimate(tx, companyId, estimateId);
    const version = requireEstimate((await tx.select().from(estimateVersions).where(scope))[0]);
    if (estimate.voidedAt) throw new EstimateError(409, "INVALID_TRANSITION", { from: "void", action: "send" });
    if (version.status === "draft" && version.emailIssue && !version.emailIssue.pendingCommunicationId)
      throw new EstimateError(409, "ESTIMATE_EMAIL_ALREADY_DELIVERED", { emailed: true, recoveryAvailable: true });
    const [pending] = await tx.select({ issue: estimateVersions.emailIssue }).from(estimateVersions)
      .where(and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimateId),
        sql`${estimateVersions.emailIssue}->>'pendingCommunicationId' IS NOT NULL`)).limit(1);
    if (pending) throw new EstimateError(409, pending.issue?.uncertain ? "ESTIMATE_EMAIL_DELIVERY_UNCERTAIN" : "ESTIMATE_EMAIL_IN_PROGRESS");
    if (resend) {
      if (version.status !== "sent") throw new EstimateError(409, "INVALID_TRANSITION", { from: version.status, action: "send" });
      if (!version.emailIssue) throw new EstimateError(409, "ESTIMATE_EMAIL_ORIGINAL_UNAVAILABLE");
    } else {
      if (estimate.currentVersionId !== versionId) throw new EstimateError(409, "INVALID_TRANSITION", { from: version.status, action: "send" });
      await preflightEstimateSend(tx, companyId, version, input.confirmZeroPriced);
    }
    const [mailbox] = await visibleEstimateSenders(user, input.mailboxAccountId);
    if (!mailbox) throw new EstimateError(403, "ESTIMATE_EMAIL_MAILBOX_UNAVAILABLE");
    const prior = version.emailIssue;
    const thread = !resend ? await earlierEstimateThread(tx, estimate, version, mailbox.id) : undefined;
    if (input.originalThread !== undefined && input.originalThread !== !!thread)
      throw new EstimateError(409, "ESTIMATE_EMAIL_THREAD_CHANGED");
    const subject = resend && prior ? await originalEstimateSubject(tx, companyId, prior) : thread?.subject ?? input.subject;
    let attachment: { pdf: Buffer; filename: string };
    try {
      attachment = prior ? { pdf: await deps.storage.read(prior.objectId), filename: prior.filename }
        : await deps.render(companyId, estimateId, versionId, tx);
    } catch (error) {
      if (error instanceof DocumentRendererUnavailable) throw new EstimateError(503, "DOCUMENT_RENDERER_UNAVAILABLE");
      throw new EstimateError(503, prior ? "ESTIMATE_EMAIL_ORIGINAL_UNAVAILABLE" : "ESTIMATE_EMAIL_PDF_UNAVAILABLE");
    }
    if (attachment.pdf.length > 20 * 1024 * 1024) throw new EstimateError(413, "ESTIMATE_EMAIL_TOO_LARGE");
    const issue: EstimateEmailIssue = prior ? { ...prior, pendingCommunicationId: attemptId } : {
      objectId: randomUUID(), filename: attachment.filename, pageCount: (await PDFDocument.load(attachment.pdf)).getPageCount(),
      firstCommunicationId: attemptId, pendingCommunicationId: attemptId,
    };
    const rendered = await composeEstimateEmail(tx, estimate, version, { subject, note: input.note }, issue);
    if (!prior) await deps.storage.save(issue.objectId, attachment.pdf);
    await tx.insert(communications).values({
      id: attemptId, companyId, customerId: estimate.customerId, sentById: user.id, fromName: mailbox.displayName,
      direction: "outbound", type: "email", status: "draft", deliveryStatus: "pending", deliveryProvider: "gmail", followUpStatus: "none",
      // Hidden reservation, not a customer send log until Gmail acknowledges.
      deletedAt: new Date(), routingMethod: "estimate_email", mailboxAccountId: mailbox.id, providerMessageId: messageId,
      fromAddress: mailbox.emailAddress, toAddresses: input.to, ccAddresses: input.cc ?? [], subject: rendered.subject, body: rendered.text,
      inReplyTo: thread?.inReplyTo,
      bodyText: rendered.text, bodyHtml: rendered.html,
      attachmentsJson: [{ kind: "estimate_pdf", estimateId, versionId, fileName: issue.filename, fileSize: attachment.pdf.length }],
    });
    await tx.update(estimateVersions).set({ emailIssue: issue }).where(scope);
    return { issue, prior, attachment, rendered, thread, versionNumber: version.versionNumber };
  });

  const releaseUnsent = async () => {
    await db.transaction(async tx => {
      await lockEstimate(tx, companyId, estimateId);
      await tx.delete(communications).where(attemptScope);
      await tx.update(estimateVersions).set({ emailIssue: job.prior }).where(scope);
    });
    if (!job.prior) await deps.storage.remove(job.issue.objectId)
      .catch(() => logger.warn("Could not remove an unissued estimate PDF"));
  };

  // Recheck selection after rendering, before transport can start. Any error
  // in this pre-send phase is known not to have delivered a message.
  try {
    if (!(await visibleEstimateSenders(user, input.mailboxAccountId)).length)
      throw new EstimateError(403, "ESTIMATE_EMAIL_MAILBOX_UNAVAILABLE");
  } catch (error) {
    await releaseUnsent();
    throw error;
  }
  let delivered: Awaited<ReturnType<typeof sendEmail>>;
  try {
    delivered = await deps.send(input.mailboxAccountId, { to: input.to, cc: input.cc, subject: job.rendered.subject,
      bodyText: job.rendered.text, bodyHtml: job.rendered.html,
      threadId: job.thread?.threadId, inReplyTo: job.thread?.inReplyTo, references: job.thread?.references,
      attachments: [{ filename: job.attachment.filename, mimeType: "application/pdf", content: job.attachment.pdf }] }, messageId);
  } catch (error) {
    const rejection = definitiveMailboxFailure(error);
    if (rejection) {
      await releaseUnsent();
      throw new EstimateError(rejection === "ESTIMATE_EMAIL_MAILBOX_UNAVAILABLE" ? 403 : 502, rejection);
    }
    // Gmail may have accepted before the connection failed. Do not delete the
    // only copy of the attachment, release the lock, or generate a new RFC ID.
    await db.update(estimateVersions).set({ emailIssue: { ...job.issue, uncertain: true } }).where(scope)
      .catch(() => logger.error("Could not record uncertain estimate email outcome; reservation retained"));
    throw new EstimateError(502, "ESTIMATE_EMAIL_DELIVERY_UNCERTAIN");
  }

  try {
    const sentAt = new Date();
    await db.transaction(async tx => {
      await lockEstimate(tx, companyId, estimateId);
      await persistGmailReceipt(tx, companyId, attemptId, messageId, delivered, { deletedAt: null, sentAt });
      await tx.update(estimateVersions).set({ emailIssue: { ...job.issue, pendingCommunicationId: null,
        ...(!job.prior && delivered.confirmedReservation ? { confirmedReservation: true } : {}) } }).where(scope);
    });
  } catch {
    // Never retry the external send when its acknowledgement cannot be saved.
    logger.error("Gmail accepted an estimate email but its receipt could not be recorded");
    throw new EstimateError(500, "ESTIMATE_EMAIL_RECEIPT_FAILED", { emailed: true, recoveryAvailable: false });
  }

  try {
    const payload = resend ? await readEstimate(companyId, estimateId, job.versionNumber)
      : await deps.transition(companyId, user.id, estimateId, versionId, "send", { method: "email" });
    return { ...payload, emailed: true as const };
  } catch {
    throw new EstimateError(500, resend ? "ESTIMATE_EMAIL_REFRESH_FAILED" : "ESTIMATE_EMAIL_TRANSITION_FAILED",
      { emailed: true, recoveryAvailable: !resend });
  }
}
