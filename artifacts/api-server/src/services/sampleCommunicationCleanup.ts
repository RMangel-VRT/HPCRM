import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { communications } from "@workspace/db";
import { db } from "../db";
import { lockMailIdentity } from "./mailboxIngestion";
import { MailboxCleanupError } from "./mailboxCleanup";
import { sampleCommunicationFingerprints } from "./sampleCommunicationFingerprints";

export function cleanSampleCommunications(companyId: string, confirmation?: string) {
  return db.transaction(async tx => {
    await lockMailIdentity(tx, companyId);
    const matches = await tx.execute<{ id: string; subject: string; protected: boolean }>(sql`
      SELECT c.id, c.subject, (
        EXISTS (SELECT 1 FROM communications child WHERE child.parent_communication_id = c.id OR child.in_reply_to = c.id)
        OR EXISTS (SELECT 1 FROM communication_links l WHERE l.communication_id = c.id)
        OR EXISTS (SELECT 1 FROM communication_audit_log a WHERE a.communication_id = c.id)
        OR EXISTS (SELECT 1 FROM unsorted_emails u WHERE u.resolved_to_communication_id = c.id)
        OR EXISTS (SELECT 1 FROM estimate_versions v WHERE v.email_issue->>'firstCommunicationId' = c.id
          OR v.email_issue->>'pendingCommunicationId' = c.id)
      ) AS protected
      FROM communications c
      JOIN jsonb_to_recordset(${JSON.stringify(sampleCommunicationFingerprints)}::jsonb) AS f(
        type text, status text, subject text, body text, "sentAt" timestamptz, "scheduledFor" timestamptz,
        "followUpDueAt" timestamptz, "followUpStatus" text)
        ON c.type = f.type AND c.subject = f.subject AND c.body = f.body AND c.status = f.status
        AND c.sent_at IS NOT DISTINCT FROM (f."sentAt" AT TIME ZONE 'UTC')
        AND c.scheduled_for IS NOT DISTINCT FROM (f."scheduledFor" AT TIME ZONE 'UTC')
        AND c.follow_up_due_at IS NOT DISTINCT FROM (f."followUpDueAt" AT TIME ZONE 'UTC')
        AND c.follow_up_status IS NOT DISTINCT FROM f."followUpStatus"
      WHERE c.company_id = ${companyId} AND c.deleted_at IS NULL AND c.direction = 'outbound'
        AND c.mailbox_account_id IS NULL AND c.provider_message_id IS NULL AND c.provider_thread_id IS NULL
        AND c.delivery_provider IS NULL AND c.routing_method IS NULL AND c.automation_rule_id IS NULL
        AND c.parent_communication_id IS NULL AND c.in_reply_to IS NULL AND c.thread_id IS NULL AND c.template_id IS NULL
        AND c.contact_id IS NULL AND c.recipient_email IS NULL AND c.from_address IS NULL
        AND c.from_name IS NULL AND c.body_html IS NULL AND c.body_text IS NULL AND c.internal_notes IS NULL
        AND coalesce(cardinality(c.to_addresses), 0) = 0 AND coalesce(cardinality(c.cc_addresses), 0) = 0
        AND coalesce(cardinality(c.bcc_addresses), 0) = 0 AND coalesce(c.attachments_json, '[]'::jsonb) = '[]'::jsonb
      ORDER BY c.id FOR UPDATE OF c`);
    const occurrences = new Map<string, number>();
    for (const { subject } of matches.rows) occurrences.set(subject, (occurrences.get(subject) ?? 0) + 1);
    const ids = matches.rows.filter(row => !row.protected && occurrences.get(row.subject) === 1).map(row => row.id);
    const counts = { samples: ids.length, skipped: matches.rows.length - ids.length };
    const reviewKey = createHash("sha256").update(JSON.stringify({ companyId, scope: matches.rows })).digest("hex");
    if (confirmation !== undefined && confirmation !== reviewKey)
      throw new MailboxCleanupError(409, "Cleanup scope changed; review the updated counts before confirming.");
    if (confirmation !== undefined && ids.length) {
      await tx.delete(communications).where(and(eq(communications.companyId, companyId), inArray(communications.id, ids)));
    }
    return { counts, reviewKey };
  });
}
