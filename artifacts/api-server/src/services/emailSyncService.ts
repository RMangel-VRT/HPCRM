import { db } from "../db";
import { mailboxAccounts, mailboxSyncRuns, communications, unsortedEmails, users, companyUsers } from "@workspace/db";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { google } from "googleapis";
import { getValidAccessToken } from "./googleOAuth";
import { routeMessage, type ParsedMessage } from "./emailRouter";
import { sendEmail } from "./emailService";

// In-memory lock set: mailboxAccountId -> true if sync is in progress
const syncLocks = new Set<string>();

// ── Gmail MIME helpers ────────────────────────────────────────────────────────

function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

interface MimePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MimePart[];
  headers?: Array<{ name?: string; value?: string }>;
}

function extractTextFromParts(parts: MimePart[], mimeType: "text/plain" | "text/html"): string {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return base64UrlDecode(part.body.data);
    }
    if (part.parts) {
      const result = extractTextFromParts(part.parts, mimeType);
      if (result) return result;
    }
  }
  return "";
}

export function parseGmailMessage(message: {
  id?: string | null;
  threadId?: string | null;
  payload?: {
    headers?: Array<{ name?: string | null; value?: string | null }>;
    body?: { data?: string | null };
    parts?: MimePart[];
    mimeType?: string | null;
  } | null;
  internalDate?: string | null;
}): ParsedMessage | null {
  if (!message.id || !message.threadId) return null;

  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const fromRaw = getHeader("From");
  const fromNameMatch = fromRaw.match(/^"?(.+?)"?\s*<(.+)>$/);
  const fromAddress = fromNameMatch ? fromNameMatch[2].trim().toLowerCase() : fromRaw.trim().toLowerCase();
  const fromName = fromNameMatch ? fromNameMatch[1].trim() : undefined;

  const toRaw = getHeader("To");
  const toAddresses = toRaw ? toRaw.split(",").map(a => {
    const m = a.trim().match(/^"?(.+?)"?\s*<(.+)>$/);
    return m ? m[2].trim().toLowerCase() : a.trim().toLowerCase();
  }).filter(Boolean) : [];

  const ccRaw = getHeader("Cc");
  const ccAddresses = ccRaw ? ccRaw.split(",").map(a => {
    const m = a.trim().match(/^"?(.+?)"?\s*<(.+)>$/);
    return m ? m[2].trim().toLowerCase() : a.trim().toLowerCase();
  }).filter(Boolean) : [];

  const subject = getHeader("Subject") || "(No subject)";
  const inReplyTo = getHeader("In-Reply-To") || undefined;

  // Use RFC Message-ID header as providerMessageId for reliable cross-system dedup.
  // When the CRM sends via gmailSender, it embeds a Message-ID header and stores
  // that same value as communications.providerMessageId. When Gmail puts the sent
  // message in the SENT folder and we sync it, we extract the same Message-ID here
  // so the dedup check finds the existing row and skips re-insertion.
  const rfcMessageId = getHeader("Message-ID").trim();
  const providerMessageId = rfcMessageId || message.id;

  let bodyText = "";
  let bodyHtml = "";

  const payload = message.payload;
  if (payload) {
    if (payload.parts) {
      bodyText = extractTextFromParts(payload.parts, "text/plain");
      bodyHtml = extractTextFromParts(payload.parts, "text/html");
    } else if (payload.body?.data) {
      const decoded = base64UrlDecode(payload.body.data as string);
      if (payload.mimeType === "text/html") {
        bodyHtml = decoded;
        bodyText = decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        bodyText = decoded;
      }
    }
  }

  const internalDateMs = parseInt(message.internalDate ?? "0", 10);
  const receivedAt = internalDateMs ? new Date(internalDateMs) : new Date();

  if (!fromAddress) return null;

  return {
    providerMessageId,
    providerThreadId: message.threadId,
    fromAddress,
    fromName,
    toAddresses,
    ccAddresses,
    subject,
    bodyText,
    bodyHtml: bodyHtml || undefined,
    inReplyTo,
    receivedAt,
  };
}

// ── Fetch INBOX messages via Gmail API ────────────────────────────────────────

async function fetchGmailMessages(
  accessToken: string,
  mailboxAddress: string,
  historyId: string | null,
  sinceTimestamp: Date | null,
  maxResults = 200
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  newHistoryId: string | null;
  method: "history" | "timestamp";
}> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  // Try history API first if we have a historyId
  if (historyId) {
    try {
      const historyResp = await gmail.users.history.list({
        userId: "me",
        startHistoryId: historyId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
        maxResults: 500,
      });

      const histories = historyResp.data.history ?? [];
      const msgIds: Array<{ id: string; threadId: string }> = [];

      for (const h of histories) {
        for (const added of (h.messagesAdded ?? [])) {
          if (added.message?.id && added.message?.threadId) {
            msgIds.push({ id: added.message.id, threadId: added.message.threadId });
          }
        }
      }

      return {
        messages: msgIds,
        newHistoryId: historyResp.data.historyId ?? historyId,
        method: "history",
      };
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status !== 404) throw err;
      // 404 → history id expired, fall through to timestamp query
    }
  }

  // Timestamp-based fallback query — INBOX only
  const afterSecs = sinceTimestamp
    ? Math.floor(sinceTimestamp.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: `after:${afterSecs} in:inbox`,
    maxResults,
  });

  const messages = (listResp.data.messages ?? []).map(m => ({
    id: m.id!,
    threadId: m.threadId!,
  }));

  // Get new history id from profile
  const profile = await gmail.users.getProfile({ userId: "me" });
  const newHistoryId = profile.data.historyId ?? null;

  return { messages, newHistoryId, method: "timestamp" };
}

// ── Fetch SENT messages via Gmail API ─────────────────────────────────────────

async function fetchGmailSentMessages(
  accessToken: string,
  sentHistoryId: string | null,
  sinceTimestamp: Date | null,
  maxResults = 200
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  newSentHistoryId: string | null;
  method: "history" | "timestamp";
}> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  // Try History API with SENT label filter
  if (sentHistoryId) {
    try {
      const historyResp = await gmail.users.history.list({
        userId: "me",
        startHistoryId: sentHistoryId,
        historyTypes: ["messageAdded"],
        labelId: "SENT",
        maxResults: 500,
      });

      const histories = historyResp.data.history ?? [];
      const msgIds: Array<{ id: string; threadId: string }> = [];

      for (const h of histories) {
        for (const added of (h.messagesAdded ?? [])) {
          if (added.message?.id && added.message?.threadId) {
            msgIds.push({ id: added.message.id, threadId: added.message.threadId });
          }
        }
      }

      return {
        messages: msgIds,
        newSentHistoryId: historyResp.data.historyId ?? sentHistoryId,
        method: "history",
      };
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status !== 404) throw err;
      // 404 → history id expired, fall through to timestamp query
    }
  }

  // Timestamp-based fallback — SENT label
  const afterSecs = sinceTimestamp
    ? Math.floor(sinceTimestamp.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  const listResp = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["SENT"],
    q: `after:${afterSecs}`,
    maxResults,
  });

  const messages = (listResp.data.messages ?? []).map(m => ({
    id: m.id!,
    threadId: m.threadId!,
  }));

  // Get new history id from profile (shared history stream, used as cursor for next SENT fetch)
  const profile = await gmail.users.getProfile({ userId: "me" });
  const newSentHistoryId = profile.data.historyId ?? null;

  return { messages, newSentHistoryId, method: "timestamp" };
}

// ── Sync error email notification ─────────────────────────────────────────────

async function sendSyncErrorNotification(
  mailboxAccountId: string,
  companyId: string,
  mailboxEmailAddress: string,
  ownerUserId: string | null,
): Promise<void> {
  // Find recipient: mailbox owner first, then any active company admin
  let recipientEmail: string | null = null;

  if (ownerUserId) {
    const [owner] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ownerUserId));
    recipientEmail = owner?.email ?? null;
  }

  if (!recipientEmail) {
    const [admin] = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(companyUsers, eq(users.id, companyUsers.userId))
      .where(
        and(
          eq(companyUsers.companyId, companyId),
          eq(companyUsers.role, "admin"),
          eq(companyUsers.status, "active"),
        )
      )
      .limit(1);
    recipientEmail = admin?.email ?? null;
  }

  if (!recipientEmail) {
    console.warn(`[email-sync] No recipient email found for sync error notification (mailbox=${mailboxAccountId})`);
    return;
  }

  // Build the settings page link — try all known Replit URL env vars in priority order
  const baseUrl =
    process.env.REPLIT_DEPLOYMENT_URL ||
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}` : null) ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
    "";
  if (!baseUrl) {
    console.warn("[email-sync] Could not resolve absolute base URL for sync error notification email — link will be a relative path");
  }
  const settingsUrl = `${baseUrl}/dashboard/settings/mailbox-accounts`;

  const subject = `Gmail sync stopped for ${mailboxEmailAddress}`;

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #b91c1c; padding: 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; }
    .content { padding: 32px 24px; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
    .alert-box p { margin: 0; color: #991b1b; font-size: 15px; line-height: 1.6; }
    .detail { font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 20px; }
    .mailbox { font-weight: 600; color: #111827; }
    .cta { text-align: center; margin: 28px 0; }
    .cta a { background-color: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; display: inline-block; }
    .footer { padding: 20px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Gmail Sync Stopped</h1>
    </div>
    <div class="content">
      <div class="alert-box">
        <p>Gmail sync has stopped for <span class="mailbox">${mailboxEmailAddress}</span> due to an authentication error.</p>
      </div>
      <p class="detail">
        Your mailbox could not be reached — this is usually caused by an expired or revoked Google authorization.
        No new emails will be synced until you reconnect the account.
      </p>
      <p class="detail">
        Your existing sync history is preserved. Simply reconnect your Google account to resume syncing from where it left off.
      </p>
      <div class="cta">
        <a href="${settingsUrl}">Go to Mailbox Settings</a>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated notification. You received this because you are the owner or admin of this mailbox account.</p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `Gmail sync stopped for ${mailboxEmailAddress}

Gmail sync has stopped due to an authentication error. No new emails will be synced until you reconnect the account.

This is usually caused by an expired or revoked Google authorization. Your existing sync history is preserved.

To reconnect, visit your mailbox settings:
${settingsUrl}`;

  await sendEmail(recipientEmail, subject, htmlBody, textBody, {
    companyId,
    variables: {},
  });

  console.log(`[email-sync] Sent sync error notification to ${recipientEmail} for mailbox=${mailboxAccountId}`);
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function syncMailbox(mailboxAccountId: string, manual = false): Promise<{
  syncRunId: string;
  status: string;
  messagesFetched: number;
  messagesRouted: number;
  messagesUnsorted: number;
  messagesDiscarded: number;
  messagesDeduped: number;
  sentMessagesFetched: number;
  sentMessagesRouted: number;
  sentMessagesUnsorted: number;
  sentMessagesDiscarded: number;
  sentMessagesDeduped: number;
}> {
  // Acquire in-memory lock
  if (syncLocks.has(mailboxAccountId)) {
    console.log(`[email-sync] Skipping mailbox=${mailboxAccountId}: sync already in progress`);
    throw new Error("Sync already in progress for this mailbox");
  }
  syncLocks.add(mailboxAccountId);

  let syncRunId = "";
  let runFinalized = false;

  // Helper that finalizes exactly once, even if called from multiple paths
  const finalizeOnce = async (status: "success" | "partial" | "error", counters: Parameters<typeof finalizeSyncRun>[2], errMsg?: string) => {
    if (runFinalized || !syncRunId) return;
    runFinalized = true;
    await finalizeSyncRun(syncRunId, status, counters, errMsg);
  };

  try {
    // Load mailbox account
    const [account] = await db
      .select()
      .from(mailboxAccounts)
      .where(eq(mailboxAccounts.id, mailboxAccountId));

    if (!account) throw new Error(`Mailbox account not found: ${mailboxAccountId}`);
    if (!account.syncEnabled || !account.oauthTokenJson) {
      throw new Error(`Mailbox not connected or sync disabled`);
    }

    // Check if due based on interval (skip if not manual)
    if (!manual && account.lastSyncedAt) {
      const intervalMs = (account.syncIntervalMinutes ?? 2) * 60 * 1000;
      const nextDue = new Date(account.lastSyncedAt.getTime() + intervalMs);
      if (nextDue > new Date()) {
        console.log(`[email-sync] Skipping mailbox=${mailboxAccountId}: not due until ${nextDue.toISOString()}`);
        throw new Error("Not due for sync yet");
      }
    }

    // Insert sync run record
    const historyIdBefore = account.gmailHistoryId ?? null;
    const [syncRun] = await db.insert(mailboxSyncRuns).values({
      companyId: account.companyId,
      mailboxAccountId,
      status: "running",
      messagesFetched: 0,
      messagesRouted: 0,
      messagesUnsorted: 0,
      messagesDiscarded: 0,
      messagesDeduped: 0,
      sentMessagesFetched: 0,
      sentMessagesRouted: 0,
      sentMessagesDeduped: 0,
      sentMessagesUnsorted: 0,
      sentMessagesDiscarded: 0,
      historyIdBefore,
    }).returning();

    syncRunId = syncRun.id;
    console.log(`[email-sync] Started sync run=${syncRunId} for mailbox=${mailboxAccountId} manual=${manual}`);

    // Get valid access token
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(mailboxAccountId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OAuth error";
      await finalizeOnce("error", {}, msg);
      await db.update(mailboxAccounts)
        .set({ syncStatus: "error", syncErrorCount: (account.syncErrorCount ?? 0) + 1, updatedAt: new Date() })
        .where(eq(mailboxAccounts.id, mailboxAccountId));
      // Notify only on first transition into error state
      if (account.syncStatus !== "error") {
        sendSyncErrorNotification(mailboxAccountId, account.companyId, account.emailAddress, account.ownerUserId ?? null)
          .catch(e => console.error("[email-sync] Failed to send sync error notification:", e));
      }
      throw err;
    }

    // ── INBOX fetch ───────────────────────────────────────────────────────────
    let fetchResult: { messages: Array<{ id: string; threadId: string }>; newHistoryId: string | null; method: "history" | "timestamp" };
    try {
      fetchResult = await fetchGmailMessages(
        accessToken,
        account.emailAddress,
        account.gmailHistoryId ?? null,
        account.lastSyncedAt ?? null,
        200
      );
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status === 401 || status === 403) {
        const msg = `[email-sync] Auth error for mailbox=${mailboxAccountId} — marking error`;
        await finalizeOnce("error", {}, msg);
        await db.update(mailboxAccounts)
          .set({ syncStatus: "error", syncErrorCount: (account.syncErrorCount ?? 0) + 1, updatedAt: new Date() })
          .where(eq(mailboxAccounts.id, mailboxAccountId));
        if (account.syncStatus !== "error") {
          sendSyncErrorNotification(mailboxAccountId, account.companyId, account.emailAddress, account.ownerUserId ?? null)
            .catch(e => console.error("[email-sync] Failed to send sync error notification:", e));
        }
        throw new Error(msg);
      }
      if (status === 429) {
        const msg = `[email-sync] Rate limited for mailbox=${mailboxAccountId} — applying backoff`;
        await finalizeOnce("partial", {}, msg);
        await db.update(mailboxAccounts)
          .set({ lastSyncedAt: new Date(), syncStatus: "connected", updatedAt: new Date() })
          .where(eq(mailboxAccounts.id, mailboxAccountId));
        throw new Error(msg);
      }
      throw err;
    }

    const counters = { fetched: 0, routed: 0, unsorted: 0, discarded: 0, deduped: 0 };
    counters.fetched = fetchResult.messages.length;

    console.log(`[email-sync] Fetched ${counters.fetched} INBOX messages via ${fetchResult.method} for mailbox=${mailboxAccountId}`);

    // Process INBOX messages
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    for (const msgRef of fetchResult.messages) {
      try {
        // Dedup check against communications.providerMessageId
        const existingComm = await db
          .select({ id: communications.id, providerThreadId: communications.providerThreadId })
          .from(communications)
          .where(
            and(
              eq(communications.companyId, account.companyId),
              eq(communications.providerMessageId, msgRef.id)
            )
          )
          .limit(1);

        if (existingComm.length > 0) {
          // Backfill providerThreadId if missing
          if (!existingComm[0].providerThreadId && msgRef.threadId) {
            await db.update(communications)
              .set({ providerThreadId: msgRef.threadId, updatedAt: new Date() })
              .where(eq(communications.id, existingComm[0].id));
          }
          counters.deduped++;
          continue;
        }

        // Dedup against unsorted_emails
        const existingUnsorted = await db
          .select({ id: unsortedEmails.id })
          .from(unsortedEmails)
          .where(
            and(
              eq(unsortedEmails.companyId, account.companyId),
              eq(unsortedEmails.providerMessageId, msgRef.id)
            )
          )
          .limit(1);

        if (existingUnsorted.length > 0) {
          counters.deduped++;
          continue;
        }

        // Fetch full message — detect 429 here and break out to partial/backoff
        let fullMsg: Awaited<ReturnType<typeof gmail.users.messages.get>>;
        try {
          fullMsg = await gmail.users.messages.get({
            userId: "me",
            id: msgRef.id,
            format: "full",
          });
        } catch (msgFetchErr: unknown) {
          const msgStatus = (msgFetchErr as { code?: number }).code;
          if (msgStatus === 429) {
            const msg = `[email-sync] Rate limited during INBOX message fetch for mailbox=${mailboxAccountId} — applying backoff`;
            console.warn(msg);
            await finalizeOnce("partial", {
              messagesFetched: counters.fetched,
              messagesRouted: counters.routed,
              messagesUnsorted: counters.unsorted,
              messagesDiscarded: counters.discarded,
              messagesDeduped: counters.deduped,
            }, msg);
            await db.update(mailboxAccounts)
              .set({ lastSyncedAt: new Date(), syncStatus: "connected", updatedAt: new Date() })
              .where(eq(mailboxAccounts.id, mailboxAccountId));
            return {
              syncRunId,
              status: "partial" as const,
              messagesFetched: counters.fetched,
              messagesRouted: counters.routed,
              messagesUnsorted: counters.unsorted,
              messagesDiscarded: counters.discarded,
              messagesDeduped: counters.deduped,
              sentMessagesFetched: 0,
              sentMessagesRouted: 0,
              sentMessagesUnsorted: 0,
              sentMessagesDiscarded: 0,
              sentMessagesDeduped: 0,
            };
          }
          counters.discarded++;
          continue;
        }

        const parsed = parseGmailMessage(fullMsg.data as Parameters<typeof parseGmailMessage>[0]);
        if (!parsed) {
          counters.discarded++;
          continue;
        }

        // Secondary dedup by RFC Message-ID (for records that were stored with
        // RFC IDs as providerMessageId — avoids re-inserting on re-sync).
        if (parsed.providerMessageId !== msgRef.id) {
          const existingByRfc = await db
            .select({ id: communications.id })
            .from(communications)
            .where(
              and(
                eq(communications.companyId, account.companyId),
                eq(communications.providerMessageId, parsed.providerMessageId)
              )
            )
            .limit(1);
          if (existingByRfc.length > 0) {
            counters.deduped++;
            continue;
          }

          const existingUnsortedByRfc = await db
            .select({ id: unsortedEmails.id })
            .from(unsortedEmails)
            .where(
              and(
                eq(unsortedEmails.companyId, account.companyId),
                eq(unsortedEmails.providerMessageId, parsed.providerMessageId)
              )
            )
            .limit(1);
          if (existingUnsortedByRfc.length > 0) {
            counters.deduped++;
            continue;
          }
        }

        // Attach mailbox address so routeMessage can exclude it
        parsed.mailboxEmailAddress = account.emailAddress;

        // Route inbound message
        const result = await routeMessage(account.companyId, parsed, { direction: "inbound" });

        if (result.action === "route" && result.customerId) {
          await db.insert(communications).values({
            companyId: account.companyId,
            customerId: result.customerId,
            type: "email",
            direction: "inbound",
            status: "sent",
            followUpStatus: "none",
            subject: parsed.subject,
            body: parsed.bodyText || parsed.subject,
            bodyText: parsed.bodyText || undefined,
            bodyHtml: parsed.bodyHtml || undefined,
            fromAddress: parsed.fromAddress,
            fromName: parsed.fromName || undefined,
            toAddresses: parsed.toAddresses,
            ccAddresses: parsed.ccAddresses ?? [],
            bccAddresses: [],
            receivedAt: parsed.receivedAt,
            sentAt: parsed.receivedAt,
            providerMessageId: parsed.providerMessageId,
            providerThreadId: parsed.providerThreadId,
            mailboxAccountId: mailboxAccountId,
            routingMethod: result.routingMethod,
            routingConfidence: result.routingConfidence,
            inReplyTo: parsed.inReplyTo || undefined,
          });
          counters.routed++;
        } else if (result.action === "unsorted") {
          await db.insert(unsortedEmails).values({
            companyId: account.companyId,
            mailboxAccountId: mailboxAccountId,
            fromAddress: parsed.fromAddress,
            fromName: parsed.fromName || undefined,
            toAddresses: parsed.toAddresses,
            subject: parsed.subject,
            bodyText: parsed.bodyText || undefined,
            bodyHtml: parsed.bodyHtml || undefined,
            receivedAt: parsed.receivedAt,
            providerMessageId: parsed.providerMessageId,
            providerThreadId: parsed.providerThreadId,
            direction: "inbound",
            status: "pending",
            candidateCustomerIds: result.candidateCustomerIds ?? [],
            routingNotes: result.routingNotes || undefined,
          });
          counters.unsorted++;
        } else {
          counters.discarded++;
        }
      } catch (msgErr) {
        console.error(`[email-sync] Error processing INBOX message id=${msgRef.id}:`, (msgErr as Error).message);
        counters.discarded++;
      }
    }

    // ── SENT folder fetch & process ───────────────────────────────────────────
    const sentCounters = { fetched: 0, routed: 0, unsorted: 0, discarded: 0, deduped: 0 };
    let sentSucceeded = true;
    let newSentHistoryId: string | null = null;

    try {
      const sentFetchResult = await fetchGmailSentMessages(
        accessToken,
        account.gmailSentHistoryId ?? null,
        account.lastSyncedAt ?? null,
        200
      );

      sentCounters.fetched = sentFetchResult.messages.length;
      newSentHistoryId = sentFetchResult.newSentHistoryId;

      console.log(`[email-sync] Fetched ${sentCounters.fetched} SENT messages via ${sentFetchResult.method} for mailbox=${mailboxAccountId}`);

      const mailboxLower = account.emailAddress.toLowerCase().trim();

      // Pre-fetch all company mailbox addresses so we can identify internal/colleague emails
      const companyMailboxRows = await db
        .select({ emailAddress: mailboxAccounts.emailAddress })
        .from(mailboxAccounts)
        .where(eq(mailboxAccounts.companyId, account.companyId));
      const companyMailboxEmails = new Set(
        companyMailboxRows.map(m => m.emailAddress.toLowerCase().trim())
      );

      for (const msgRef of sentFetchResult.messages) {
        try {
          // Always fetch full message so we can extract the RFC Message-ID header
          // for correct dedup against communications.providerMessageId.
          // (Pre-fetch dedup by Gmail internal ID cannot match RFC-keyed records.)
          let fullMsg: Awaited<ReturnType<typeof gmail.users.messages.get>>;
          try {
            fullMsg = await gmail.users.messages.get({
              userId: "me",
              id: msgRef.id,
              format: "full",
            });
          } catch (msgFetchErr: unknown) {
            const msgStatus = (msgFetchErr as { code?: number }).code;
            if (msgStatus === 429) {
              console.warn(`[email-sync] Rate limited during SENT message fetch for mailbox=${mailboxAccountId} — stopping SENT loop`);
              sentSucceeded = false; // partial — SENT loop is incomplete
              break;
            }
            sentCounters.discarded++;
            continue;
          }

          const parsed = parseGmailMessage(fullMsg.data as Parameters<typeof parseGmailMessage>[0]);
          if (!parsed) {
            sentCounters.discarded++;
            continue;
          }

          // Dedup by RFC Message-ID — this is the key that gmailSender stores in
          // communications.providerMessageId when the CRM sends via Gmail.
          const existingComm = await db
            .select({ id: communications.id })
            .from(communications)
            .where(
              and(
                eq(communications.companyId, account.companyId),
                eq(communications.providerMessageId, parsed.providerMessageId)
              )
            )
            .limit(1);
          if (existingComm.length > 0) {
            sentCounters.deduped++;
            continue;
          }

          const existingUnsorted = await db
            .select({ id: unsortedEmails.id })
            .from(unsortedEmails)
            .where(
              and(
                eq(unsortedEmails.companyId, account.companyId),
                eq(unsortedEmails.providerMessageId, parsed.providerMessageId)
              )
            )
            .limit(1);
          if (existingUnsorted.length > 0) {
            sentCounters.deduped++;
            continue;
          }

          // Sanity check: SENT folder messages should always be FROM the mailbox
          if (parsed.fromAddress !== mailboxLower) {
            sentCounters.discarded++;
            continue;
          }

          // Skip internal / colleague emails: if every recipient is a company mailbox,
          // this is an internal message with no external customer recipients.
          const allRecipients = [
            ...(parsed.toAddresses ?? []),
            ...(parsed.ccAddresses ?? []),
          ].map(a => a.toLowerCase().trim()).filter(Boolean);
          const isAllInternal =
            allRecipients.length > 0 &&
            allRecipients.every(r => companyMailboxEmails.has(r));
          if (isAllInternal) {
            sentCounters.discarded++;
            continue;
          }

          // Attach mailbox address for routing
          parsed.mailboxEmailAddress = account.emailAddress;

          // Route outbound message (match on toAddresses / ccAddresses)
          const result = await routeMessage(account.companyId, parsed, { direction: "outbound" });

          if (result.action === "route" && result.customerId) {
            await db.insert(communications).values({
              companyId: account.companyId,
              customerId: result.customerId,
              sentById: account.ownerUserId ?? undefined,
              type: "email",
              direction: "outbound",
              status: "sent",
              followUpStatus: "none",
              subject: parsed.subject,
              body: parsed.bodyText || parsed.subject,
              bodyText: parsed.bodyText || undefined,
              bodyHtml: parsed.bodyHtml || undefined,
              fromAddress: parsed.fromAddress,
              fromName: parsed.fromName || undefined,
              toAddresses: parsed.toAddresses,
              ccAddresses: parsed.ccAddresses ?? [],
              bccAddresses: [],
              receivedAt: parsed.receivedAt,
              sentAt: parsed.receivedAt,
              providerMessageId: parsed.providerMessageId,
              providerThreadId: parsed.providerThreadId,
              mailboxAccountId: mailboxAccountId,
              routingMethod: result.routingMethod,
              routingConfidence: result.routingConfidence,
              inReplyTo: parsed.inReplyTo || undefined,
            });
            sentCounters.routed++;
          } else if (result.action === "unsorted") {
            await db.insert(unsortedEmails).values({
              companyId: account.companyId,
              mailboxAccountId: mailboxAccountId,
              fromAddress: parsed.fromAddress,
              fromName: parsed.fromName || undefined,
              toAddresses: parsed.toAddresses,
              subject: parsed.subject,
              bodyText: parsed.bodyText || undefined,
              bodyHtml: parsed.bodyHtml || undefined,
              receivedAt: parsed.receivedAt,
              providerMessageId: parsed.providerMessageId,
              providerThreadId: parsed.providerThreadId,
              direction: "outbound",
              status: "pending",
              candidateCustomerIds: result.candidateCustomerIds ?? [],
              routingNotes: result.routingNotes || undefined,
            });
            sentCounters.unsorted++;
          } else {
            // discard — no CRM signals found for recipient
            sentCounters.discarded++;
          }
        } catch (msgErr) {
          console.error(`[email-sync] Error processing SENT message id=${msgRef.id}:`, (msgErr as Error).message);
          sentCounters.discarded++;
        }
      }
    } catch (sentErr) {
      // SENT loop error: mark partial (inbox succeeded) rather than full error
      const sentErrMsg = sentErr instanceof Error ? sentErr.message : "SENT sync error";
      console.error(`[email-sync] SENT folder sync failed for mailbox=${mailboxAccountId}: ${sentErrMsg}`);
      sentSucceeded = false;
    }

    // Update mailbox with new history cursors and lastSyncedAt
    await db.update(mailboxAccounts)
      .set({
        gmailHistoryId: fetchResult.newHistoryId ?? account.gmailHistoryId,
        gmailSentHistoryId: newSentHistoryId ?? account.gmailSentHistoryId,
        lastSyncedAt: new Date(),
        syncStatus: "connected",
        syncErrorCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(mailboxAccounts.id, mailboxAccountId));

    // Determine final status: partial if SENT loop failed, success otherwise
    const finalStatus = sentSucceeded ? "success" : "partial";

    await finalizeOnce(finalStatus as "success" | "partial", {
      messagesFetched: counters.fetched,
      messagesRouted: counters.routed,
      messagesUnsorted: counters.unsorted,
      messagesDiscarded: counters.discarded,
      messagesDeduped: counters.deduped,
      sentMessagesFetched: sentCounters.fetched,
      sentMessagesRouted: sentCounters.routed,
      sentMessagesDeduped: sentCounters.deduped,
      sentMessagesUnsorted: sentCounters.unsorted,
      sentMessagesDiscarded: sentCounters.discarded,
      historyIdAfter: fetchResult.newHistoryId ?? undefined,
      syncMethod: fetchResult.method,
    });

    console.log(`[email-sync] Completed sync run=${syncRunId} inbox=[fetched=${counters.fetched} routed=${counters.routed} unsorted=${counters.unsorted} discarded=${counters.discarded} deduped=${counters.deduped}] sent=[fetched=${sentCounters.fetched} routed=${sentCounters.routed} unsorted=${sentCounters.unsorted} discarded=${sentCounters.discarded} deduped=${sentCounters.deduped}] status=${finalStatus}`);

    return {
      syncRunId,
      status: finalStatus,
      messagesFetched: counters.fetched,
      messagesRouted: counters.routed,
      messagesUnsorted: counters.unsorted,
      messagesDiscarded: counters.discarded,
      messagesDeduped: counters.deduped,
      sentMessagesFetched: sentCounters.fetched,
      sentMessagesRouted: sentCounters.routed,
      sentMessagesUnsorted: sentCounters.unsorted,
      sentMessagesDiscarded: sentCounters.discarded,
      sentMessagesDeduped: sentCounters.deduped,
    };
  } catch (err) {
    // Catch-all: finalize any run that escaped all specific handlers above.
    // finalizeOnce is idempotent — if already finalized this is a no-op.
    const msg = err instanceof Error ? err.message : "Unexpected sync error";
    await finalizeOnce("error", {}, msg).catch(() => {/* ignore secondary failure */});
    throw err;
  } finally {
    syncLocks.delete(mailboxAccountId);
  }
}

async function finalizeSyncRun(
  syncRunId: string,
  status: "success" | "partial" | "error",
  counters: {
    messagesFetched?: number;
    messagesRouted?: number;
    messagesUnsorted?: number;
    messagesDiscarded?: number;
    messagesDeduped?: number;
    sentMessagesFetched?: number;
    sentMessagesRouted?: number;
    sentMessagesDeduped?: number;
    sentMessagesUnsorted?: number;
    sentMessagesDiscarded?: number;
    historyIdAfter?: string;
    syncMethod?: "history" | "timestamp";
  },
  errorMessage?: string
): Promise<void> {
  await db.update(mailboxSyncRuns)
    .set({
      status,
      finishedAt: new Date(),
      messagesFetched: counters.messagesFetched ?? 0,
      messagesRouted: counters.messagesRouted ?? 0,
      messagesUnsorted: counters.messagesUnsorted ?? 0,
      messagesDiscarded: counters.messagesDiscarded ?? 0,
      messagesDeduped: counters.messagesDeduped ?? 0,
      sentMessagesFetched: counters.sentMessagesFetched ?? 0,
      sentMessagesRouted: counters.sentMessagesRouted ?? 0,
      sentMessagesDeduped: counters.sentMessagesDeduped ?? 0,
      sentMessagesUnsorted: counters.sentMessagesUnsorted ?? 0,
      sentMessagesDiscarded: counters.sentMessagesDiscarded ?? 0,
      historyIdAfter: counters.historyIdAfter ?? null,
      syncMethod: counters.syncMethod ?? null,
      errorMessage: errorMessage ?? null,
    })
    .where(eq(mailboxSyncRuns.id, syncRunId));
}

// ── Sync all active mailboxes ─────────────────────────────────────────────────

export async function syncAllMailboxes(): Promise<void> {
  try {
    const accounts = await db
      .select()
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.isActive, true),
          eq(mailboxAccounts.syncEnabled, true),
          eq(mailboxAccounts.syncStatus, "connected")
        )
      );

    console.log(`[email-sync] Starting batch sync for ${accounts.length} active mailbox(es)`);

    for (const account of accounts) {
      try {
        await syncMailbox(account.id, false);
      } catch (err) {
        // Individual mailbox errors don't stop the batch
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (!msg.includes("already in progress") && !msg.includes("Not due")) {
          console.error(`[email-sync] Error syncing mailbox=${account.id}: ${msg}`);
        }
      }
    }
  } catch (err) {
    console.error("[email-sync] Error in syncAllMailboxes:", err instanceof Error ? err.message : err);
  }
}

// ── Background worker ─────────────────────────────────────────────────────────

export function startSyncWorker(): void {
  console.log("[email-sync] Starting background sync worker (60s interval)");

  const tick = async () => {
    await syncAllMailboxes();
    setTimeout(tick, 60_000);
  };

  // Initial delay of 30 seconds to let server fully start
  setTimeout(tick, 30_000);
}
