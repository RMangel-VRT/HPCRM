import { db, inTransaction } from "../db";
import { mailboxAccounts, mailboxBackfillRuns } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { google, type gmail_v1 } from "googleapis";
import { getValidAccessToken } from "./googleOAuth";
import { parseGmailMessage } from "./gmailMessage";
import { storage } from "../storage";
import { ingestMailboxMessage, lockSyncableMailbox, syncableSharedMailbox } from "./mailboxIngestion";

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

    if (run.cancelRequested || !["queued", "running"].includes(run.status)) {
      console.log(`[backfill] Run ${runId} already cancelled before start`);
      return;
    }

    const [account] = await db
      .select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, run.mailboxAccountId), eq(mailboxAccounts.companyId, run.companyId), syncableSharedMailbox));

    if (!account) return;

    const started = await db.transaction(async tx => {
      if (!await lockSyncableMailbox(tx, account)) return false;
      const [claimed] = await tx.update(mailboxBackfillRuns).set({ status: "running", updatedAt: new Date() })
        .where(and(eq(mailboxBackfillRuns.id, runId), eq(mailboxBackfillRuns.status, "queued"), eq(mailboxBackfillRuns.cancelRequested, false))).returning({ id: mailboxBackfillRuns.id });
      return !!claimed;
    });
    if (!started) return;

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
      const [freshRun] = await db.select().from(mailboxBackfillRuns).where(eq(mailboxBackfillRuns.id, runId));
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

        let fullMsg: { data: gmail_v1.Schema$Message };
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

        try {
          const outcome = await ingestMailboxMessage(account, parsed, direction, msgRef.id, async tx => {
            const [current] = await tx.select({ id: mailboxBackfillRuns.id }).from(mailboxBackfillRuns).where(and(
              eq(mailboxBackfillRuns.id, runId), eq(mailboxBackfillRuns.status, "running"), eq(mailboxBackfillRuns.cancelRequested, false))).for("share");
            return !!current;
          });
          if (outcome === "stopped") {
            await storage.updateMailboxBackfillRun(runId, { status: "cancelled", finishedAt: new Date(), ...counters });
            return;
          }
          if (isSent) {
            counters.sentFetched++;
            if (outcome === "routed") counters.sentRouted++;
            if (outcome === "unsorted") counters.sentUnsorted++;
            if (outcome === "deduped") counters.sentDeduped++;
          } else {
            counters.inboxFetched++;
            if (outcome === "routed") counters.inboxRouted++;
            if (outcome === "unsorted") counters.inboxUnsorted++;
            if (outcome === "deduped") counters.inboxDeduped++;
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

  const result = await db.transaction(tx => inTransaction(tx, async () => {
    const [account] = await tx.select({ id: mailboxAccounts.id }).from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.mailboxAccountId), eq(mailboxAccounts.companyId, req.companyId), syncableSharedMailbox)).for("update");
    if (!account) throw new Error("Mailbox not connected or sync disabled");
    const existing = await storage.getActiveMailboxBackfillRun(req.mailboxAccountId);
    if (existing) return { run: existing, alreadyRunning: true };
    const run = await storage.createMailboxBackfillRun({ ...req, status: "queued", cancelRequested: false });
    return { run, alreadyRunning: false };
  }));
  if (result.alreadyRunning) return result;
  const { run } = result;

  setImmediate(() => {
    runBackfill(run.id).catch(err => {
      console.error(`[backfill] Unhandled error in runBackfill(${run.id}):`, err);
    });
  });

  return result;
}

// If a run's heartbeat is older than this, the cancel endpoint force-clears
// the row instead of waiting for a (possibly dead) worker to observe the flag.
const CANCEL_STALE_THRESHOLD_MS = 60 * 1000;

export async function requestCancel(runId: string, mailboxId: string, companyId: string): Promise<void> {
  const [run] = await db
    .select()
    .from(mailboxBackfillRuns)
    .where(and(eq(mailboxBackfillRuns.id, runId), eq(mailboxBackfillRuns.mailboxAccountId, mailboxId), eq(mailboxBackfillRuns.companyId, companyId)));

  if (!run) return;

  const isActive = run.status === "queued" || run.status === "running";
  const heartbeat = (run.updatedAt ?? run.startedAt ?? run.createdAt) as Date | null;
  const heartbeatAgeMs = heartbeat ? Date.now() - new Date(heartbeat).getTime() : Number.POSITIVE_INFINITY;

  if (isActive && heartbeatAgeMs > CANCEL_STALE_THRESHOLD_MS) {
    await storage.updateMailboxBackfillRun(runId, {
      status: "cancelled",
      cancelRequested: true,
      finishedAt: new Date(),
    });
    return;
  }

  await storage.updateMailboxBackfillRun(runId, { cancelRequested: true });
}

export async function getActiveBackfill(mailboxAccountId: string) {
  return storage.getActiveMailboxBackfillRun(mailboxAccountId);
}

export async function getBackfillHistory(mailboxAccountId: string, limit = 10) {
  return storage.getMailboxBackfillHistory(mailboxAccountId, limit);
}

// ── On startup: re-queue any interrupted runs ──────────────────────────────────

// Runs whose heartbeat is older than this on startup are considered orphaned
// (worker died, OOM, deploy, etc.) and are reaped to `error` instead of being
// re-queued.
const STARTUP_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export async function requeueInterruptedBackfills(): Promise<void> {
  try {
    type RunRow = typeof mailboxBackfillRuns.$inferSelect;
    const rows: RunRow[] = await db
      .select()
      .from(mailboxBackfillRuns)
      .where(and(inArray(mailboxBackfillRuns.status, ["queued", "running"]), sql`EXISTS (
        SELECT 1 FROM mailbox_accounts WHERE ${mailboxAccounts.id} = ${mailboxBackfillRuns.mailboxAccountId}
        AND ${mailboxAccounts.companyId} = ${mailboxBackfillRuns.companyId} AND ${syncableSharedMailbox})`))
      .orderBy(mailboxBackfillRuns.startedAt);

    if (rows.length === 0) return;

    const now = Date.now();
    const stale: RunRow[] = [];
    const fresh: RunRow[] = [];

    for (const run of rows) {
      const heartbeat = (run.updatedAt ?? run.startedAt ?? run.createdAt) as Date | null;
      const ageMs = heartbeat ? now - new Date(heartbeat).getTime() : Number.POSITIVE_INFINITY;
      if (ageMs > STARTUP_STALE_THRESHOLD_MS) {
        stale.push(run);
      } else {
        fresh.push(run);
      }
    }

    if (stale.length > 0) {
      console.log(`[backfill] Reaping ${stale.length} stale backfill run(s) older than ${STARTUP_STALE_THRESHOLD_MS / 1000}s`);
      for (const run of stale) {
        await storage.updateMailboxBackfillRun(run.id, {
          status: "error",
          finishedAt: new Date(),
          errorMessage: "Backfill worker terminated unexpectedly. Please retry.",
        });
      }
    }

    if (fresh.length > 0) {
      console.log(`[backfill] Re-queuing ${fresh.length} interrupted backfill run(s)`);
      for (const run of fresh) {
        await storage.updateMailboxBackfillRun(run.id, { status: "queued", cancelRequested: false });
        setImmediate(() => {
          runBackfill(run.id).catch(err => {
            console.error(`[backfill] Requeue error for run ${run.id}:`, err);
          });
        });
      }
    }
  } catch (err) {
    console.error("[backfill] Error in requeueInterruptedBackfills:", err);
  }
}
