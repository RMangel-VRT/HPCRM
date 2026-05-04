import { db } from "../db";
import { mailboxAccounts, mailboxSyncRuns, communications, unsortedEmails } from "@shared/schema";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { google } from "googleapis";
import { getValidAccessToken } from "./googleOAuth";
import { routeMessage, type ParsedMessage } from "./emailRouter";

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

function parseGmailMessage(message: {
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
  const toAddresses = toRaw ? toRaw.split(",").map(a => a.trim()).filter(Boolean) : [];

  const subject = getHeader("Subject") || "(No subject)";
  const inReplyTo = getHeader("In-Reply-To") || undefined;

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
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    fromAddress,
    fromName,
    toAddresses,
    subject,
    bodyText,
    bodyHtml: bodyHtml || undefined,
    inReplyTo,
    receivedAt,
  };
}

// ── Fetch messages via Gmail API ──────────────────────────────────────────────

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

  // Timestamp-based fallback query
  const afterSecs = sinceTimestamp
    ? Math.floor(sinceTimestamp.getTime() / 1000)
    : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  // Fetch from INBOX and SENT (dedup handles already-stored outbound)
  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: `after:${afterSecs} (in:inbox OR in:sent)`,
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

// ── Main sync function ────────────────────────────────────────────────────────

export async function syncMailbox(mailboxAccountId: string, manual = false): Promise<{
  syncRunId: string;
  status: string;
  messagesFetched: number;
  messagesRouted: number;
  messagesUnsorted: number;
  messagesDiscarded: number;
  messagesDeduped: number;
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
      throw err;
    }

    // Fetch messages
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
        throw new Error(msg);
      }
      if (status === 429) {
        const msg = `[email-sync] Rate limited for mailbox=${mailboxAccountId} — applying backoff`;
        await finalizeOnce("partial", {}, msg);
        // Advance lastSyncedAt so the next-due check skips at least one full interval
        await db.update(mailboxAccounts)
          .set({ lastSyncedAt: new Date(), syncStatus: "connected", updatedAt: new Date() })
          .where(eq(mailboxAccounts.id, mailboxAccountId));
        throw new Error(msg);
      }
      throw err;
    }

    const counters = { fetched: 0, routed: 0, unsorted: 0, discarded: 0, deduped: 0 };
    counters.fetched = fetchResult.messages.length;

    console.log(`[email-sync] Fetched ${counters.fetched} messages via ${fetchResult.method} for mailbox=${mailboxAccountId}`);

    // Process messages
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
            const msg = `[email-sync] Rate limited during message fetch for mailbox=${mailboxAccountId} — applying backoff`;
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
            // Return partial result — lock will be released in finally
            return {
              syncRunId,
              status: "partial" as const,
              messagesFetched: counters.fetched,
              messagesRouted: counters.routed,
              messagesUnsorted: counters.unsorted,
              messagesDiscarded: counters.discarded,
              messagesDeduped: counters.deduped,
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

        // Determine message direction from Gmail labels
        const labelIds = (fullMsg.data.labelIds ?? []) as string[];
        const isSentLabel = labelIds.includes("SENT");
        // direction: outbound if from this mailbox's SENT folder, inbound otherwise
        const direction = isSentLabel ? "outbound" : "inbound";

        // Attach mailbox address so routeMessage can exclude it from participant matching
        // (important for outbound: fromAddress is the mailbox owner, customer is in toAddresses)
        parsed.mailboxEmailAddress = account.emailAddress;

        // Route the message
        const result = await routeMessage(account.companyId, parsed);

        if (result.action === "route" && result.customerId) {
          await db.insert(communications).values({
            companyId: account.companyId,
            customerId: result.customerId,
            type: "email",
            direction,
            status: "sent",
            followUpStatus: "none",
            subject: parsed.subject,
            body: parsed.bodyText || parsed.subject,
            bodyText: parsed.bodyText || undefined,
            bodyHtml: parsed.bodyHtml || undefined,
            fromAddress: parsed.fromAddress,
            fromName: parsed.fromName || undefined,
            toAddresses: parsed.toAddresses,
            ccAddresses: [],
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
            status: "pending",
            candidateCustomerIds: result.candidateCustomerIds ?? [],
            routingNotes: result.routingNotes || undefined,
          });
          counters.unsorted++;
        } else {
          // discard
          counters.discarded++;
        }
      } catch (msgErr) {
        console.error(`[email-sync] Error processing message id=${msgRef.id}:`, (msgErr as Error).message);
        counters.discarded++;
      }
    }

    // Update mailbox with new history id and lastSyncedAt
    await db.update(mailboxAccounts)
      .set({
        gmailHistoryId: fetchResult.newHistoryId ?? account.gmailHistoryId,
        lastSyncedAt: new Date(),
        syncStatus: "connected",
        syncErrorCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(mailboxAccounts.id, mailboxAccountId));

    // Normal completion is always "success" — discards are expected (no CRM signals found).
    // "partial" is reserved exclusively for the 429 rate-limit truncation path above.
    await finalizeOnce("success", {
      messagesFetched: counters.fetched,
      messagesRouted: counters.routed,
      messagesUnsorted: counters.unsorted,
      messagesDiscarded: counters.discarded,
      messagesDeduped: counters.deduped,
      historyIdAfter: fetchResult.newHistoryId ?? undefined,
      syncMethod: fetchResult.method,
    });

    console.log(`[email-sync] Completed sync run=${syncRunId} fetched=${counters.fetched} routed=${counters.routed} unsorted=${counters.unsorted} discarded=${counters.discarded} deduped=${counters.deduped}`);

    return {
      syncRunId,
      status: "success",
      messagesFetched: counters.fetched,
      messagesRouted: counters.routed,
      messagesUnsorted: counters.unsorted,
      messagesDiscarded: counters.discarded,
      messagesDeduped: counters.deduped,
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
