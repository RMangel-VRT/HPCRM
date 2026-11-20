import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { communications, estimates, estimateVersions, type EstimateEmailIssue } from "@workspace/db";
import { estimateEmailInput } from "@workspace/db/estimate-contracts";
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
import { readEstimate } from "./estimateReads";
import { createGmailMessageId, sendEmail } from "./gmailSender";

const dependencies = { send: sendEmail, storage: issuedEstimatePdfs, render: renderEstimatePdfFile, transition: transitionEstimate };
const estimateScope = (companyId: string, estimateId: string) =>
  and(eq(estimates.companyId, companyId), eq(estimates.id, estimateId));
const versionScope = (companyId: string, estimateId: string, versionId: string) =>
  and(eq(estimateVersions.companyId, companyId), eq(estimateVersions.estimateId, estimateId), eq(estimateVersions.id, versionId));
const lockEstimate = async (tx: AppTransaction, companyId: string, estimateId: string) =>
  requireEstimate((await tx.select().from(estimates).where(estimateScope(companyId, estimateId)).for("update"))[0]);

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
    if (!prior) await deps.storage.save(issue.objectId, attachment.pdf);
    await tx.insert(communications).values({
      id: attemptId, companyId, customerId: estimate.customerId, sentById: user.id, fromName: user.name,
      direction: "outbound", type: "email", status: "draft", deliveryStatus: "pending", deliveryProvider: "gmail", followUpStatus: "none",
      // Hidden reservation, not a customer send log until Gmail acknowledges.
      deletedAt: new Date(), routingMethod: "estimate_email", mailboxAccountId: mailbox.id, providerMessageId: messageId,
      fromAddress: mailbox.emailAddress, toAddresses: input.to, ccAddresses: input.cc ?? [], subject: input.subject, body: input.bodyText,
      bodyText: input.bodyText, attachmentsJson: [{ kind: "estimate_pdf", estimateId, versionId, fileName: issue.filename, fileSize: attachment.pdf.length }],
    });
    await tx.update(estimateVersions).set({ emailIssue: issue }).where(scope);
    return { issue, prior, attachment, versionNumber: version.versionNumber };
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
    delivered = await deps.send(input.mailboxAccountId, { to: input.to, cc: input.cc, subject: input.subject, bodyText: input.bodyText,
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
      const [receipt] = await tx.update(communications).set({ deletedAt: null, status: "sent", deliveryStatus: "sent",
        providerThreadId: delivered.threadId || null, sentAt, updatedAt: sentAt }).where(attemptScope).returning({ id: communications.id });
      requireEstimate(receipt);
      await tx.update(estimateVersions).set({ emailIssue: { ...job.issue, pendingCommunicationId: null } }).where(scope);
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
