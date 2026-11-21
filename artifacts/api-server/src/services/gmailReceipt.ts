import { communicationAuditLog, communicationLinks, communications, estimateVersions, unsortedEmails } from "@workspace/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { AppTransaction } from "../db";
import { isRfcMessageId, type SendEmailResult } from "./gmailSender";
import { lockMailIdentity } from "./mailboxIngestion";

export const gmailReservation = (id: string) => /^<[0-9a-f]{32}@highplains\.crm>$/.test(id);

export const importedOutbound = and(eq(communications.type, "email"), eq(communications.direction, "outbound"),
  eq(communications.status, "sent"), isNull(communications.sentById), isNull(communications.deliveryProvider))!;

/** Transfer references before deleting the duplicate, leaving the CRM row's
 * body, actor and attachment snapshots untouched. The caller locks both rows. */
export async function mergeSentCopy(tx: AppTransaction, companyId: string, canonicalId: string, copyId: string,
  actualId: string, priorId: string | null) {
  const comm = (id: string) => and(eq(communications.companyId, companyId), eq(communications.id, id));
  const pointsToCopy = sql`${communications.inReplyTo} = ${copyId}`;
  await tx.update(communications).set({ parentCommunicationId: canonicalId }).where(and(
    eq(communications.companyId, companyId), ne(communications.id, canonicalId), eq(communications.parentCommunicationId, copyId)));
  await tx.update(communications).set({ inReplyTo: canonicalId }).where(and(
    eq(communications.companyId, companyId), ne(communications.id, canonicalId), pointsToCopy));
  if (priorId && priorId !== actualId) {
    await tx.update(communications).set({ inReplyTo: actualId }).where(and(
      eq(communications.companyId, companyId), ne(communications.id, canonicalId), eq(communications.inReplyTo, priorId)));
  }
  await tx.execute(sql`UPDATE communication_links AS link SET communication_id = ${canonicalId}
    WHERE link.company_id = ${companyId} AND link.communication_id = ${copyId}
    AND NOT EXISTS (SELECT 1 FROM communication_links AS kept WHERE kept.company_id = link.company_id
      AND kept.communication_id = ${canonicalId} AND kept.linked_type = link.linked_type AND kept.linked_id = link.linked_id)`);
  await tx.update(communicationAuditLog).set({ communicationId: canonicalId }).where(and(
    eq(communicationAuditLog.companyId, companyId), eq(communicationAuditLog.communicationId, copyId)));
  await tx.update(unsortedEmails).set({ resolvedToCommunicationId: canonicalId }).where(and(
    eq(unsortedEmails.companyId, companyId), eq(unsortedEmails.resolvedToCommunicationId, copyId)));
  await tx.delete(communications).where(comm(copyId));
}

export async function hasEstimateReceiptReference(tx: AppTransaction, companyId: string, id: string) {
  const [referenced] = await tx.select({ id: estimateVersions.id }).from(estimateVersions)
    .where(and(eq(estimateVersions.companyId, companyId), sql`(
      ${estimateVersions.emailIssue}->>'firstCommunicationId' = ${id}
      OR ${estimateVersions.emailIssue}->>'pendingCommunicationId' = ${id})`)).limit(1);
  return !!referenced;
}

export async function hasForeignCopyReference(tx: AppTransaction, companyId: string, copyId: string) {
  const references = await tx.execute(sql`SELECT 1 WHERE EXISTS (
    SELECT 1 FROM communications WHERE parent_communication_id = ${copyId} AND company_id <> ${companyId}
    UNION ALL SELECT 1 FROM communication_links WHERE communication_id = ${copyId} AND company_id <> ${companyId}
    UNION ALL SELECT 1 FROM communication_audit_log WHERE communication_id = ${copyId} AND company_id <> ${companyId}
  )`);
  return references.rows.length > 0;
}

export async function persistGmailReceipt(tx: AppTransaction, companyId: string, id: string, reserved: string, result: SendEmailResult,
  values: Partial<typeof communications.$inferInsert>) {
  await lockMailIdentity(tx, companyId);
  const scope = and(eq(communications.companyId, companyId), eq(communications.id, id),
    eq(communications.providerMessageId, reserved), eq(communications.deliveryStatus, "pending"));
  const [claim] = await tx.select({ mailbox: communications.mailboxAccountId }).from(communications).where(scope).for("update");
  if (!claim) throw new Error("The email delivery claim could not be updated.");

  if (result.messageId !== reserved && isRfcMessageId(result.messageId)) {
    const copies = await tx.select({ id: communications.id }).from(communications).where(and(importedOutbound,
      eq(communications.companyId, companyId), eq(communications.providerMessageId, result.messageId),
      ne(communications.id, id))).orderBy(communications.id).for("update");
    for (const copy of copies) {
      if (await hasEstimateReceiptReference(tx, companyId, copy.id) || await hasForeignCopyReference(tx, companyId, copy.id)) continue;
      await mergeSentCopy(tx, companyId, id, copy.id, result.messageId, reserved);
    }
    if (claim.mailbox) {
      await tx.delete(unsortedEmails).where(and(eq(unsortedEmails.companyId, companyId),
        eq(unsortedEmails.mailboxAccountId, claim.mailbox), eq(unsortedEmails.providerMessageId, result.messageId),
        eq(unsortedEmails.direction, "outbound"), eq(unsortedEmails.status, "pending"),
        isNull(unsortedEmails.resolvedToCommunicationId)));
    }
  }
  // Delete the verified import before re-keying the CRM record.
  const [receipt] = await tx.update(communications).set({ ...values, status: "sent", deliveryStatus: "sent", failureReason: null,
    providerMessageId: result.messageId, providerThreadId: result.threadId || null, updatedAt: new Date() }).where(scope).returning();
  if (!receipt) throw new Error("The email delivery claim could not be updated.");
  return receipt;
}
