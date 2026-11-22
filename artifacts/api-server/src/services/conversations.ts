import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { gmailReservation } from "./gmailReceipt";
import { isRfcMessageId } from "./gmailSender";
import { resolveVisibleMailboxes, type VisibleMailboxes } from "./mailboxScope";
import { emailSnippet, splitEmailQuote } from "./emailQuotes";

export type ConversationFilter = "all" | "needs_reply" | "sent";
type Direction = "inbound" | "outbound";
type Staff = { userId: string; name: string; role: string };
type Customer = { id: string; name: string; type: string; managementCompany: string | null };
type Scope = { companyId: string; visible: VisibleMailboxes; customerId?: string };
type ListRow = {
  key: string; subject: string | null; customer: Customer | null; kind: string; messageCount: number; hasAttachments: boolean;
  needsReply: boolean; firstDirection: Direction; direction: Direction; at: string; sender: string | null;
  html: string | null; text: string | null; body: string; team: Staff[];
};
type MessageRow = {
  id: string; subject: string | null; direction: Direction; at: string; type: string; customerId: string | null;
  fromAddress: string | null; fromName: string | null; toAddresses: string[] | null; recipientEmail: string | null;
  mailboxId: string | null; providerThreadId: string | null; providerMessageId: string | null; inReplyTo: string | null;
  bodyHtml: string | null; bodyText: string | null; body: string; staff: Staff | null; sentById: string | null;
  deliveryProvider: string | null; versionNumber: number | null; routingMethod: string | null; attachments: unknown;
  customer: Customer | null;
};
export const PAGE_SIZE = 50;
export async function conversationScope(user: UserWithContext, customerId?: string): Promise<Scope> {
  const companyId = user.activeCompanyId;
  const visible = await resolveVisibleMailboxes({ companyId, userId: user.id, role: user.activeRole, isSuperAdmin: user.isSuperAdminBool });
  return { companyId, visible, customerId };
}
function mailboxPredicate(scope: Scope, mailbox: SQLWrapper, sentBy?: SQLWrapper) {
  const { visible, companyId } = scope;
  return sql`((${mailbox} IS NOT NULL
    AND (${visible.mailboxIds === null} OR ${mailbox} = ANY(${sql.param(visible.mailboxIds ?? [])}::varchar[]))
    AND EXISTS (SELECT 1 FROM mailbox_accounts m WHERE m.id = ${mailbox}
      AND m.company_id = ${companyId} AND m.account_type = 'shared' AND m.is_active))
    OR (${mailbox} IS NULL AND (${visible.includeNullMailbox}
      ${sentBy && visible.nullMailboxSentByUserId ? sql`OR ${sentBy} = ${visible.nullMailboxSentByUserId}` : sql``})))`;
}
function authorized(scope: Scope) {
  return sql`c.company_id = ${scope.companyId} AND c.deleted_at IS NULL AND c.status = 'sent'
    AND ${mailboxPredicate(scope, sql`c.mailbox_account_id`, sql`c.sent_by_id`)}
    ${scope.customerId ? sql`AND c.customer_id = ${scope.customerId}` : sql``}`;
}
// Gmail IDs are mailbox-local. A detached row has no verifiable mailbox
// identity; don't merge its thread with another detached or active mailbox.
const key = sql`CASE WHEN c.type = 'email' AND c.mailbox_account_id IS NOT NULL AND NULLIF(c.provider_thread_id, '') IS NOT NULL
  THEN 'g:' || encode(convert_to(jsonb_build_array(c.mailbox_account_id, c.customer_id, c.provider_thread_id)::text, 'UTF8'), 'hex')
  ELSE 'c:' || c.id END`;
const instant = sql`coalesce(c.received_at, c.sent_at, c.created_at)`;
const managementCompany = sql`LEFT JOIN property_managers pm ON pm.id = cu.property_manager_id AND pm.company_id = cu.company_id
  LEFT JOIN property_management_companies pmc ON pmc.id = coalesce(cu.property_management_company_id, pm.property_management_company_id)
    AND pmc.company_id = cu.company_id`;
const customer = sql`CASE WHEN cu.id IS NOT NULL THEN jsonb_build_object('id', cu.id, 'name', cu.name,
  'type', cu.customer_type, 'managementCompany', coalesce(pmc.name, cu.management_company)) END`;
const attachmentFlag = (value: SQL) => sql`CASE WHEN jsonb_typeof(${value}) = 'array' THEN jsonb_array_length(${value}) > 0 ELSE false END`;
const bareSubject = (subject: string | null) => (subject ?? "").replace(/^(?:re:\s*)+/iu, "").trim();
export const firstSenderWord = (name: string | null) => {
  const first = name?.trim().split(/\s+/u)[0];
  return first && !first.includes("@") ? first : null;
};
const lastMessage = (row: ListRow) => ({
  direction: row.direction, at: new Date(row.at).toISOString(), senderFirstName: firstSenderWord(row.sender),
  snippet: emailSnippet(splitEmailQuote(row.html, row.text ?? (row.html ? "" : row.body)).newText),
});

export async function listConversations(scope: Scope, filter: ConversationFilter, search: string, page: number, sort: "newest" | "oldest" = "newest") {
  const { companyId, visible } = scope;
  const like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const results = await db.execute<{ items: ListRow[]; all: number; needs_reply: number; sent: number;
    unsorted: number; mailbox: { id: string; displayName: string; emailAddress: string; syncIntervalMinutes: number } | null }>(sql`
    WITH live AS (
      SELECT c.id, c.customer_id, c.type, c.routing_method, c.direction, c.sent_by_id,
        ${key} AS key, ${instant} AS at, ${attachmentFlag(sql`c.attachments_json`)} AS attached,
        ${search ? sql`(c.subject ILIKE ${like} OR c.body_text ILIKE ${like} OR c.body ILIKE ${like}
          OR cu.name ILIKE ${like})` : sql`true`} AS matched
      FROM communications c
      ${search ? sql`LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.company_id = c.company_id` : sql``}
      WHERE ${authorized(scope)}
    ), grouped AS (
      SELECT key, count(*)::int AS "messageCount", bool_or(attached) AS "hasAttachments",
        bool_or(routing_method = 'estimate_email') AS estimate,
        (array_agg(id ORDER BY at, id))[1] AS first_id,
        (array_agg(id ORDER BY at DESC, id DESC))[1] AS last_id,
        (array_agg(direction ORDER BY at, id))[1] AS "firstDirection",
        (array_agg(direction ORDER BY at DESC, id DESC))[1] AS direction,
        max(at) AS at
      FROM live GROUP BY key HAVING bool_or(matched)
    ), page AS (
      SELECT * FROM grouped WHERE ${filter === "needs_reply" ? sql`direction = 'inbound'`
        : filter === "sent" ? sql`"firstDirection" = 'outbound'` : sql`true`}
      ORDER BY ${sort === "oldest" ? sql`at, last_id` : sql`at DESC, last_id DESC`}
      LIMIT ${sort === "oldest" ? 1 : PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    ), summaries AS (
      SELECT p.key, first.subject, ${customer} AS customer, p."messageCount", p."hasAttachments",
        CASE WHEN first.type <> 'email' THEN first.type WHEN p.estimate THEN 'estimate'
          WHEN p."firstDirection" = 'inbound' THEN 'inquiry' ELSE 'message' END AS kind,
        p."firstDirection", p.direction, p.direction = 'inbound' AS "needsReply", p.last_id, p.at,
        CASE WHEN p.direction = 'outbound' THEN coalesce(sender.name, last.from_name) ELSE last.from_name END AS sender,
        last.body_html AS html, last.body_text AS text, last.body, coalesce(team.members, '[]'::jsonb) AS team
      FROM page p JOIN communications first ON first.id = p.first_id
      JOIN communications last ON last.id = p.last_id
      LEFT JOIN customers cu ON cu.id = last.customer_id AND cu.company_id = ${companyId}
      ${managementCompany}
      LEFT JOIN company_users m ON m.company_id = ${companyId} AND m.user_id = last.sent_by_id AND m.status = 'active'
      LEFT JOIN users sender ON sender.id = m.user_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('userId', u.id, 'name', u.name, 'role', member.role)
          ORDER BY staff.at, staff.id) AS members
        FROM (SELECT DISTINCT ON (l.sent_by_id) l.sent_by_id, l.at, l.id FROM live l
          WHERE l.key = p.key AND l.direction = 'outbound' AND l.sent_by_id IS NOT NULL
          ORDER BY l.sent_by_id, l.at, l.id) staff
        JOIN company_users member ON member.company_id = ${companyId} AND member.user_id = staff.sent_by_id AND member.status = 'active'
        JOIN users u ON u.id = member.user_id
      ) team ON true
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.at DESC, s.last_id DESC) FROM summaries s), '[]'::jsonb) AS items,
      count(*)::int AS all, count(*) FILTER (WHERE direction = 'inbound')::int AS needs_reply,
      count(*) FILTER (WHERE "firstDirection" = 'outbound')::int AS sent,
      ${scope.customerId ? sql`0` : sql`(SELECT count(*)::int FROM unsorted_emails e
        WHERE e.company_id = ${companyId} AND e.status = 'pending' AND ${mailboxPredicate(scope, sql`e.mailbox_account_id`)}
          ${search ? sql`AND (e.subject ILIKE ${like} OR e.from_address ILIKE ${like} OR e.from_name ILIKE ${like} OR e.body_text ILIKE ${like})` : sql``})`} AS unsorted,
      (SELECT jsonb_build_object('id', m.id, 'displayName', m.display_name, 'emailAddress', m.email_address,
        'syncIntervalMinutes', m.sync_interval_minutes) FROM mailbox_accounts m
        WHERE m.company_id = ${companyId} AND m.account_type = 'shared' AND m.is_active AND m.sync_enabled
          AND m.sync_status = 'connected' AND (${visible.mailboxIds === null} OR m.id = ANY(${sql.param(visible.mailboxIds ?? [])}::varchar[]))
        ORDER BY m.id LIMIT 1) AS mailbox
    FROM grouped`);
  const { items, all, needs_reply, sent, unsorted, mailbox } = results.rows[0]!;
  return {
    items: items.map(row => ({ key: row.key, subject: bareSubject(row.subject), customer: row.customer, kind: row.kind,
      messageCount: row.messageCount, hasAttachments: row.hasAttachments, needsReply: row.needsReply,
      lastMessage: lastMessage(row), team: row.team })),
    counts: { all, needs_reply, sent, unsorted }, page, pageSize: PAGE_SIZE, mailbox,
  };
}

type KeyParts = { id: string } | { mailbox: string; customer: string | null; thread: string };
export function parseConversationKey(value: string): KeyParts | null {
  if (/^c:[A-Za-z0-9_-]{1,128}$/.test(value)) return { id: value.slice(2) };
  if (!/^g:(?:[0-9a-f]{2}){1,1024}$/.test(value)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(value.slice(2), "hex").toString("utf8"));
    if (Array.isArray(data) && data.length === 3 && typeof data[0] === "string"
      && (data[1] === null || typeof data[1] === "string") && typeof data[2] === "string") {
      return { mailbox: data[0], customer: data[1], thread: data[2] };
    }
  } catch { /* Invalid route key. */ }
  return null;
}

export async function readConversationRows(scope: Scope, value: string, connection: Pick<typeof db, "execute"> = db) {
  const parts = parseConversationKey(value);
  if (!parts) return [];
  const match = "id" in parts ? sql`c.id = ${parts.id} AND ${key} = ${value}`
    : sql`c.mailbox_account_id = ${parts.mailbox} AND c.customer_id IS NOT DISTINCT FROM ${parts.customer}
      AND c.provider_thread_id = ${parts.thread} AND c.type = 'email'`;
  return (await connection.execute<MessageRow>(sql`SELECT c.id, c.subject, c.direction, ${instant} AS at, c.type,
    c.customer_id AS "customerId", c.from_address AS "fromAddress", c.from_name AS "fromName",
    c.to_addresses AS "toAddresses", c.recipient_email AS "recipientEmail", c.body_html AS "bodyHtml", c.body_text AS "bodyText", c.body,
    c.mailbox_account_id AS "mailboxId", c.provider_thread_id AS "providerThreadId", c.provider_message_id AS "providerMessageId",
    c.in_reply_to AS "inReplyTo", c.sent_by_id AS "sentById", c.delivery_provider AS "deliveryProvider",
    c.routing_method AS "routingMethod", c.attachments_json AS attachments, ${customer} AS customer,
    CASE WHEN u.id IS NOT NULL AND c.direction = 'outbound'
      THEN jsonb_build_object('userId', u.id, 'name', u.name, 'role', member.role) END AS staff,
    ev.version_number AS "versionNumber"
    FROM communications c
    LEFT JOIN customers cu ON cu.id = c.customer_id AND cu.company_id = c.company_id
    ${managementCompany}
    LEFT JOIN company_users member ON member.company_id = c.company_id AND member.user_id = c.sent_by_id AND member.status = 'active'
    LEFT JOIN users u ON u.id = member.user_id
    LEFT JOIN LATERAL (
      SELECT v.version_number FROM estimate_versions v
      JOIN estimates e ON e.company_id = c.company_id AND e.id = v.estimate_id AND e.customer_id = c.customer_id
      WHERE c.routing_method = 'estimate_email' AND v.company_id = c.company_id
        AND (v.email_issue->>'firstCommunicationId' = c.id OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.attachments_json) = 'array' THEN c.attachments_json ELSE '[]'::jsonb END) a
          WHERE a->>'kind' = 'estimate_pdf' AND a->>'versionId' = v.id AND a->>'estimateId' = e.id))
      ORDER BY v.version_number, v.id LIMIT 1
    ) ev ON true
    WHERE ${authorized(scope)} AND ${match} ORDER BY ${instant}, c.id`)).rows;
}

export function conversationReplyTarget(rows: MessageRow[]) {
  const latestInbound = rows.slice().reverse().find(r => r.direction === "inbound" && r.type === "email");
  return latestInbound?.customer && latestInbound.mailboxId && latestInbound.providerThreadId && latestInbound.fromAddress
    && latestInbound.providerMessageId && isRfcMessageId(latestInbound.providerMessageId) && !gmailReservation(latestInbound.providerMessageId)
    ? latestInbound : undefined;
}

function attachmentNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = item?.fileName ?? item?.filename ?? item?.name;
    return typeof name === "string" && name.trim() ? [{ name }] : [];
  });
}

export async function readConversation(scope: Scope, key: string) {
  const rows = await readConversationRows(scope, key);
  if (!rows.length) return null;
  const first = rows[0]!, last = rows.at(-1)!;
  const team = new Map<string, Staff>();
  const messages = rows.map((r, index) => {
    if (r.staff && !team.has(r.staff.userId)) team.set(r.staff.userId, r.staff);
    const parts = splitEmailQuote(r.bodyHtml, r.bodyText ?? (r.bodyHtml ? "" : r.body));
    return { id: r.id, at: new Date(r.at).toISOString(), direction: r.direction, fromAddress: r.fromAddress, fromName: r.fromName,
      toAddresses: r.toAddresses?.length ? r.toAddresses : r.recipientEmail ? [r.recipientEmail] : [], staff: r.staff,
      outsideCrm: r.direction === "outbound" && !r.sentById && !r.deliveryProvider && !!r.mailboxId && r.type === "email",
      label: r.type !== "email" ? r.type : r.routingMethod === "estimate_email" ? "estimate"
        : r.routingMethod === "company_documents" ? "documents" : index > 0 || r.inReplyTo ? "reply" : "message",
      versionNumber: r.versionNumber, attachments: attachmentNames(r.attachments), bodyHtml: r.bodyHtml, bodyText: r.bodyText ?? r.body,
      ...parts, snippet: emailSnippet(parts.newText) };
  });
  return { key, subject: bareSubject(first.subject), customer: last.customer,
    kind: first.type !== "email" ? first.type : rows.some(r => r.routingMethod === "estimate_email") ? "estimate"
      : first.direction === "inbound" ? "inquiry" : "message",
    messageCount: rows.length, hasAttachments: messages.some(m => m.attachments.length),
    needsReply: last.direction === "inbound", team: [...team.values()], messages,
    lastMessage: { direction: last.direction, at: messages.at(-1)!.at, snippet: messages.at(-1)!.snippet,
      senderFirstName: firstSenderWord(last.staff?.name ?? last.fromName) },
    replyTargetId: conversationReplyTarget(rows)?.id ?? null };
}
