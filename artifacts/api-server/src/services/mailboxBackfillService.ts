import { db } from "../db";
import { mailboxAccounts, mailboxBackfillRuns, communications, unsortedEmails } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { google } from "googleapis";
import { getValidAccessToken } from "./googleOAuth";
import { routeMessage, type ParsedMessage } from "./emailRouter";
import { storage } from "../storage";

// ── In-process concurrency limiter ────────────────────────────────────────────

const MAX_CONCURRENT = parseInt(process.env.BACKFILL_CONCURRENCY ?? "3", 10);
let activeCount = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waitQueue.push(resolve));
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activeCount--;
  }
}

// ── MIME helpers (shared patterns from emailSyncService) ──────────────────────

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

// ── Exponential backoff helper ─────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let delay = 50;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status !== 429 || attempt === maxAttempts - 1) throw err;
      const jitter = Math.random() * delay * 0.3;
      await sleep(Math.min(delay + jitter, 30_000));
      delay = Math.min(delay * 2, 30_000);
    }
  }
  throw new Error("Unreachable");
}

// ── Core backfill worker ───────────────────────────────────────────────────────

async function runBackfill(runId: string): Promise<void> {
  await acquireSlot();

  try {
    const [run] = await db
      .select()
      .from(mailboxBackfillRuns)
      .where(eq(mailboxBackfillRuns.id, runId));

    if (!run) {
      console.warn(`[backfill] Run ${runId} not found — aborting`);
      return;
    }

    if (run.status === "cancelled") {
      console.log(`[backfill] Run ${runId} already cancelled before start`);
      return;
    }

    const [account] = await db
      .select()
      .from(mailboxAccounts)
      .where(eq(mailboxAccounts.id, run.mailboxAccountId));

    if (!account || !account.syncEnabled || !account.oauthTokenJson) {
      await storage.updateMailboxBackfillRun(runId, {
        status: "error",
        finishedAt: new Date(),
        errorMessage: "Mailbox not connected or sync disabled",
      });
      return;
    }

    await storage.updateMailboxBackfillRun(runId, { status: "running" });

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(run.mailboxAccountId);
    } catch (err) {
      await storage.updateMailboxBackfillRun(runId, {
        status: "error",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : "OAuth error",
      });
      return;
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    const rangeStartSec = Math.floor(run.rangeStart.getTime() / 1000);
    const rangeEndSec = Math.floor(run.rangeEnd.getTime() / 1000);

    const labelParts: string[] = [];
    if (run.includeInbox) labelParts.push("in:inbox");
    if (run.includeSent) labelParts.push("in:sent");
    const labelQuery = labelParts.join(" OR ");
    const query = `after:${rangeStartSec} before:${rangeEndSec} (${labelQuery})`;

    const counters = {
      inboxFetched: 0, inboxRouted: 0, inboxUnsorted: 0, inboxDeduped: 0,
      sentFetched: 0, sentRouted: 0, sentUnsorted: 0, sentDeduped: 0,
    };

    let pageToken: string | undefined;
    let totalEstimate: number | null = null;
    let flushCounter = 0;

    do {
      const freshRun = await storage.getActiveMailboxBackfillRun(run.mailboxAccountId);
      if (!freshRun || freshRun.cancelRequested || freshRun.status === "cancelled") {
        await storage.updateMailboxBackfillRun(runId, {
          status: "cancelled",
          finishedAt: new Date(),
          ...counters,
        });
        return;
      }

      const listResp = await withBackoff(() =>
        gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: 100,
          pageToken,
        })
      );

      const messages = listResp.data.messages ?? [];
      pageToken = listResp.data.nextPageToken ?? undefined;

      if (totalEstimate === null) {
        totalEstimate = listResp.data.resultSizeEstimate ?? null;
        if (totalEstimate !== null) {
          await storage.updateMailboxBackfillRun(runId, { estimatedTotal: totalEstimate });
        }
      }

      for (const msgRef of messages) {
        if (!msgRef.id) continue;

        await sleep(50);

        const existingComm = await db
          .select({ id: communications.id })
          .from(communications)
          .where(and(
            eq(communications.companyId, account.companyId),
            eq(communications.providerMessageId, msgRef.id)
          ))
          .limit(1);

        const existingUnsorted = existingComm.length === 0
          ? await db
              .select({ id: unsortedEmails.id })
              .from(unsortedEmails)
              .where(and(
                eq(unsortedEmails.companyId, account.companyId),
                eq(unsortedEmails.providerMessageId, msgRef.id)
              ))
              .limit(1)
          : [];

        if (existingComm.length > 0 || existingUnsorted.length > 0) {
          counters.inboxDeduped++;
          counters.sentDeduped++;
          flushCounter++;
          if (flushCounter % 25 === 0) {
            await storage.updateMailboxBackfillRun(runId, { ...counters });
          }
          continue;
        }

        let fullMsg: Awaited<ReturnType<typeof gmail.users.messages.get>>;
        try {
          fullMsg = await withBackoff(() =>
            gmail.users.messages.get({ userId: "me", id: msgRef.id!, format: "full" })
          );
        } catch {
          continue;
        }

        const parsed = parseGmailMessage(fullMsg.data as Parameters<typeof parseGmailMessage>[0]);
        if (!parsed) continue;

        const labelIds = (fullMsg.data.labelIds ?? []) as string[];
        const isSent = labelIds.includes("SENT");
        const direction = isSent ? "outbound" : "inbound";

        parsed.mailboxEmailAddress = account.emailAddress;

        try {
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
              mailboxAccountId: run.mailboxAccountId,
              routingMethod: result.routingMethod,
              routingConfidence: result.routingConfidence,
              inReplyTo: parsed.inReplyTo || undefined,
            });
            if (isSent) { counters.sentFetched++; counters.sentRouted++; }
            else { counters.inboxFetched++; counters.inboxRouted++; }
          } else if (result.action === "unsorted") {
            await db.insert(unsortedEmails).values({
              companyId: account.companyId,
              mailboxAccountId: run.mailboxAccountId,
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
            if (isSent) { counters.sentFetched++; counters.sentUnsorted++; }
            else { counters.inboxFetched++; counters.inboxUnsorted++; }
          }
        } catch (routeErr) {
          console.error(`[backfill] Error routing message ${msgRef.id}:`, routeErr);
        }

        flushCounter++;
        if (flushCounter % 25 === 0) {
          await storage.updateMailboxBackfillRun(runId, { ...counters });
        }
      }
    } while (pageToken);

    await storage.updateMailboxBackfillRun(runId, {
      status: "success",
      finishedAt: new Date(),
      currentMonth: null,
      ...counters,
    });

    console.log(`[backfill] Run ${runId} complete: inbox routed=${counters.inboxRouted} unsorted=${counters.inboxUnsorted} deduped=${counters.inboxDeduped} sent routed=${counters.sentRouted}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[backfill] Run ${runId} failed: ${msg}`);
    await storage.updateMailboxBackfillRun(runId, {
      status: "error",
      finishedAt: new Date(),
      errorMessage: msg,
    }).catch(() => {});
  } finally {
    releaseSlot();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface BackfillRequest {
  mailboxAccountId: string;
  companyId: string;
  rangeStart: Date;
  rangeEnd: Date;
  includeInbox: boolean;
  includeSent: boolean;
}

export async function startBackfill(req: BackfillRequest): Promise<{ run: typeof mailboxBackfillRuns.$inferSelect; alreadyRunning: boolean }> {
  if (!req.includeInbox && !req.includeSent) {
    throw new Error("At least one label (inbox or sent) must be enabled");
  }
  if (req.rangeStart >= req.rangeEnd) {
    throw new Error("Range start must be before range end");
  }

  const existing = await storage.getActiveMailboxBackfillRun(req.mailboxAccountId);
  if (existing) {
    return { run: existing, alreadyRunning: true };
  }

  const run = await storage.createMailboxBackfillRun({
    mailboxAccountId: req.mailboxAccountId,
    companyId: req.companyId,
    rangeStart: req.rangeStart,
    rangeEnd: req.rangeEnd,
    includeInbox: req.includeInbox,
    includeSent: req.includeSent,
    status: "queued",
  });

  setImmediate(() => {
    runBackfill(run.id).catch(err => {
      console.error(`[backfill] Unhandled error in runBackfill(${run.id}):`, err);
    });
  });

  return { run, alreadyRunning: false };
}

export async function requestCancel(runId: string): Promise<void> {
  await storage.updateMailboxBackfillRun(runId, { cancelRequested: true });
}

export async function getActiveBackfill(mailboxAccountId: string) {
  return storage.getActiveMailboxBackfillRun(mailboxAccountId);
}

export async function getBackfillHistory(mailboxAccountId: string, limit = 10) {
  return storage.getMailboxBackfillHistory(mailboxAccountId, limit);
}

// ── On startup: re-queue any interrupted runs ──────────────────────────────────

export async function requeueInterruptedBackfills(): Promise<void> {
  try {
    // Use raw SQL since Drizzle doesn't easily support IN on union-typed columns
    type RunRow = typeof mailboxBackfillRuns.$inferSelect;
    const result = await db.execute<RunRow>(
      sql`SELECT * FROM mailbox_backfill_runs WHERE status IN ('queued', 'running') ORDER BY started_at ASC`
    );

    const rows: RunRow[] = (result as unknown as { rows: RunRow[] }).rows ?? [];

    if (rows.length === 0) return;

    console.log(`[backfill] Re-queuing ${rows.length} interrupted backfill run(s)`);

    for (const run of rows) {
      await storage.updateMailboxBackfillRun(run.id, { status: "queued", cancelRequested: false });
      setImmediate(() => {
        runBackfill(run.id).catch(err => {
          console.error(`[backfill] Requeue error for run ${run.id}:`, err);
        });
      });
    }
  } catch (err) {
    console.error("[backfill] Error in requeueInterruptedBackfills:", err);
  }
}
