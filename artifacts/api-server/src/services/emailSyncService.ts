import { db } from "../db";
import { mailboxAccounts, mailboxSyncRuns, users, companyUsers } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { google, type gmail_v1 } from "googleapis";
import { getValidAccessToken } from "./googleOAuth";
import { parseGmailMessage } from "./gmailMessage";
import { sendEmail } from "./emailService";
import { loadEmailCompany } from "./outgoingEmail/company";
import { renderMailboxDisconnectedEmail } from "./outgoingEmail/staffNotices";

import { ingestMailboxMessage, lockSyncableMailbox, mailboxConnectionScope, syncableSharedMailbox } from "./mailboxIngestion";
import { startMailboxPolling } from "./mailboxPolling";
import { logger } from "../lib/logger";
export { hasSyncedCommunication } from "./mailboxIngestion";
export { parseGmailMessage } from "./gmailMessage";

// In-memory lock set: mailboxAccountId -> true if sync is in progress
const syncLocks = new Set<string>();

// Gmail history catches up across wakes. Exhaust every page before advancing the cursor.
async function fetchMailboxFolder(accessToken: string, labelId: "INBOX" | "SENT",
  historyId: string | null, sinceTimestamp: Date | null) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });
  const messages = new Map<string, { id: string; threadId: string }>();
  let pageToken: string | undefined;
  if (historyId) {
    try {
      let newHistoryId = historyId;
      do {
        const { data } = await gmail.users.history.list({ userId: "me", startHistoryId: historyId,
          historyTypes: ["messageAdded"], labelId, maxResults: 500, pageToken });
        for (const history of data.history ?? []) {
          for (const { message } of history.messagesAdded ?? []) {
            if (message?.id && message.threadId) messages.set(message.id, { id: message.id, threadId: message.threadId });
          }
        }
        pageToken = data.nextPageToken ?? undefined;
        newHistoryId = data.historyId ?? newHistoryId;
      } while (pageToken);
      return { messages: [...messages.values()], newHistoryId, method: "history" as const };
    } catch (err) {
      if ((err as { code?: number }).code !== 404) throw err;
      messages.clear();
      pageToken = undefined;
    }
  }

  const afterSecs = Math.floor((sinceTimestamp?.getTime() ?? Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  // Snapshot the cursor before listing; mail arriving during this scan is
  // also eligible for the next history read, where deduplication is safe.
  const profile = await gmail.users.getProfile({ userId: "me" });
  do {
    const { data } = await gmail.users.messages.list({ userId: "me", labelIds: [labelId],
      q: `after:${afterSecs}`, maxResults: 200, pageToken });
    for (const message of data.messages ?? []) {
      if (message.id && message.threadId) messages.set(message.id, { id: message.id, threadId: message.threadId });
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return { messages: [...messages.values()], newHistoryId: profile.data.historyId ?? null, method: "timestamp" as const };
}

// ── Sync error email notification ─────────────────────────────────────────────

export async function sendSyncErrorNotification(
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
          // Approved owner-first exception: retain one fallback, not a broadcast.
          sql`${companyUsers.role} IN ('admin', 'account_manager')`,
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

  const company = await loadEmailCompany(companyId);
  const { subject, html, text } = renderMailboxDisconnectedEmail(mailboxEmailAddress, company);
  await sendEmail(recipientEmail, subject, html, text, {
    companyId,
    variables: {},
    alreadyRendered: true,
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
      .where(and(eq(mailboxAccounts.id, mailboxAccountId), syncableSharedMailbox));

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
    const syncRun = await db.transaction(async tx => {
      if (!await lockSyncableMailbox(tx, account)) throw new Error("Mailbox not connected or sync disabled");
      const [run] = await tx.insert(mailboxSyncRuns).values({
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
      return run;
    });

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
        .where(mailboxConnectionScope(account));
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
      fetchResult = await fetchMailboxFolder(accessToken, "INBOX", account.gmailHistoryId, account.lastSyncedAt);
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status === 401 || status === 403) {
        const msg = `[email-sync] Auth error for mailbox=${mailboxAccountId} — marking error`;
        await finalizeOnce("error", {}, msg);
        await db.update(mailboxAccounts)
          .set({ syncStatus: "error", syncErrorCount: (account.syncErrorCount ?? 0) + 1, updatedAt: new Date() })
          .where(mailboxConnectionScope(account));
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
          .where(mailboxConnectionScope(account));
        throw new Error(msg);
      }
      throw err;
    }

    let inboxSucceeded = true;
    const counters = { fetched: 0, routed: 0, unsorted: 0, discarded: 0, deduped: 0 };
    counters.fetched = fetchResult.messages.length;

    console.log(`[email-sync] Fetched ${counters.fetched} INBOX messages via ${fetchResult.method} for mailbox=${mailboxAccountId}`);

    // Process INBOX messages
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    for (const msgRef of fetchResult.messages) {
      try {
        // Fetch full message — detect 429 here and break out to partial/backoff
        let fullMsg: { data: gmail_v1.Schema$Message };
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
              .where(mailboxConnectionScope(account));
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

        // Gmail can put an outbound message in both Inbox and Sent.
        const direction = fullMsg.data.labelIds?.includes("SENT") ? "outbound" : "inbound";
        const outcome = await ingestMailboxMessage(account, parsed, direction, msgRef.id);
        if (outcome === "stopped") { inboxSucceeded = false; break; }
        counters[outcome]++;
      } catch (msgErr) {
        console.error(`[email-sync] Error processing INBOX message id=${msgRef.id}:`, (msgErr as Error).message);
        counters.discarded++;
        inboxSucceeded = false;
      }
    }

    // ── SENT folder fetch & process ───────────────────────────────────────────
    const sentCounters = { fetched: 0, routed: 0, unsorted: 0, discarded: 0, deduped: 0 };
    let sentSucceeded = true;
    let newSentHistoryId: string | null = null;

    try {
      const sentFetchResult = await fetchMailboxFolder(accessToken, "SENT", account.gmailSentHistoryId, account.lastSyncedAt);

      sentCounters.fetched = sentFetchResult.messages.length;
      newSentHistoryId = sentFetchResult.newHistoryId;

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
          let fullMsg: { data: gmail_v1.Schema$Message };
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

          const outcome = await ingestMailboxMessage(account, parsed, "outbound", msgRef.id);
          if (outcome === "stopped") { sentSucceeded = false; break; }
          sentCounters[outcome]++;
        } catch (msgErr) {
          console.error(`[email-sync] Error processing SENT message id=${msgRef.id}:`, (msgErr as Error).message);
          sentCounters.discarded++;
          sentSucceeded = false;
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
        gmailHistoryId: (inboxSucceeded ? fetchResult.newHistoryId : null) ?? account.gmailHistoryId,
        gmailSentHistoryId: (sentSucceeded ? newSentHistoryId : null) ?? account.gmailSentHistoryId,
        lastSyncedAt: inboxSucceeded && sentSucceeded ? new Date() : account.lastSyncedAt,
        syncStatus: "connected",
        syncErrorCount: 0,
        updatedAt: new Date(),
      })
      .where(mailboxConnectionScope(account));

    // Determine final status: partial if SENT loop failed, success otherwise
    const finalStatus = inboxSucceeded && sentSucceeded ? "success" : "partial";

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

export async function syncAllMailboxes(isStopped: () => boolean = () => false): Promise<void> {
  try {
    const accounts = await db
      .select()
      .from(mailboxAccounts)
      .where(
        and(
          syncableSharedMailbox,
          eq(mailboxAccounts.syncStatus, "connected")
        )
      );

    console.log(`[email-sync] Starting batch sync for ${accounts.length} active mailbox(es)`);

    for (const account of accounts) {
      if (isStopped()) break;
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

export function startSyncWorker(): () => void {
  logger.info("Shared mailbox sync worker scheduled (60s cadence)");
  return startMailboxPolling(syncAllMailboxes);
}
