import { Router } from "express";
import { db } from "../db";
import { mailboxAccounts, mailboxSyncRuns, unsortedEmails, communications } from "@workspace/db";
import { z } from "zod/v4";
import { activeSharedMailbox } from "../services/mailboxIngestion";
import { mailboxCleanupRouter } from "./mailboxCleanup";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { resolveVisibleMailboxes, MailboxScopeForbiddenError } from "../services/mailboxScope";
import type { RoleName } from "@workspace/db";
import type { UserWithContext } from "../auth";
import {
  isGoogleOAuthConfigured,
  generateAuthUrl,
  generateStateToken,
  exchangeCodeForTokens,
  getUserEmail,
  revokeTokens,
} from "../services/googleOAuth";
import { syncMailbox } from "../services/emailSyncService";
import { startBackfill, requestCancel, getActiveBackfill, getBackfillHistory } from "../services/mailboxBackfillService";

const router = Router();
router.use("/cleanup", mailboxCleanupRouter);
const safeAccount = ({ oauthTokenJson: _token, ...account }: typeof mailboxAccounts.$inferSelect) => account;
const mailboxSettings = z.object({ displayName: z.string().trim().min(1).max(200), emailAddress: z.email().max(254),
  description: z.string().nullable().optional(), isActive: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(1).max(60).optional(), accountType: z.literal("shared").optional() }).strict();


// ─── List all mailbox accounts for the company ────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const viewAs = req.query.viewAs as string | undefined;
    let visibleMailboxIds: string[] | null = null;

    try {
      const vis = await resolveVisibleMailboxes({
        userId: user.id,
        companyId: user.activeCompanyId,
        role: user.activeRole as RoleName,
        viewAs: viewAs || undefined,
        isSuperAdmin: user.isSuperAdminBool,
      });
      visibleMailboxIds = vis.mailboxIds;
    } catch (err) {
      if (err instanceof MailboxScopeForbiddenError) return res.status(403).json({ error: err.message });
      console.error("[mailboxAccounts] scope resolution error:", err);
      return res.status(500).json({ error: "Failed to resolve mailbox visibility" });
    }

    if (visibleMailboxIds !== null && visibleMailboxIds.length === 0) {
      return res.json([]);
    }

    const conditions = [eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox];
    if (visibleMailboxIds !== null && visibleMailboxIds.length > 0) {
      conditions.push(inArray(mailboxAccounts.id, visibleMailboxIds));
    }

    const accounts = await db.select()
      .from(mailboxAccounts)
      .where(and(...conditions));
    res.json(accounts.map(safeAccount));
  } catch (err) {
    console.error("GET /api/mailbox-accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function canManageMailboxOAuth(user: UserWithContext): boolean {
  return user.isSuperAdminBool || user.accessRole === "admin";
}

// ─── OAuth status for a specific mailbox ─────────────────────────────────────
router.get("/:id/oauth/status", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({ error: "Google OAuth is not configured. Contact your administrator." });
    }

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });

    if (!canManageMailboxOAuth(user)) {
      return res.status(403).json({ error: "Not authorized to manage this mailbox" });
    }

    const tokenData = account.oauthTokenJson as Record<string, unknown> | null;
    res.json({
      syncEnabled: account.syncEnabled,
      syncStatus: account.syncStatus,
      connectedEmail: tokenData?.connected_email ?? null,
      connectedAt: tokenData?.connected_at ?? null,
      hasRefreshToken: !!(tokenData?.refresh_token),
    });
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id/oauth/status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Initiate Gmail OAuth flow ────────────────────────────────────────────────
router.get("/:id/oauth/connect", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({ error: "Google OAuth is not configured. Contact your administrator." });
    }

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });

    if (!canManageMailboxOAuth(user)) {
      return res.status(403).json({ error: "Not authorized to connect this mailbox" });
    }

    const { state, randomPart } = generateStateToken(req.params.id);

    // Store the random portion AND mailbox id in session for CSRF + identity validation
    (req.session as Record<string, unknown>).oauthState = randomPart;
    (req.session as Record<string, unknown>).oauthMailboxId = req.params.id;

    const authUrl = generateAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id/oauth/connect error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/oauth/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  const settingsUrl = "/dashboard/settings/shared-mailboxes";

  if (oauthError) {
    return res.status(400).send(buildHtmlPage("OAuth Error", `<p>Google returned an error: <strong>${escapeHtml(oauthError)}</strong></p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }

  if (!code || !state) {
    return res.status(400).send(buildHtmlPage("Missing Parameters", `<p>Missing OAuth code or state.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }

  // Require authenticated session with company scope — no cross-tenant fallback
  const user = req.user as UserWithContext | undefined;
  if (!user?.activeCompanyId) {
    return res.status(401).send(buildHtmlPage("Session Expired", `<p>Your session has expired. Please sign in and try connecting again.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }

  if (!isGoogleOAuthConfigured()) {
    return res.status(503).send(buildHtmlPage("Not Configured", `<p>Google OAuth is not configured. Contact your administrator.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }

  // Parse state: "<mailboxAccountId>:<randomPart>"
  const colonIdx = state.indexOf(":");
  if (colonIdx === -1) {
    return res.status(403).send(buildHtmlPage("Invalid OAuth state", `<p>Invalid OAuth state — please try connecting again.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }

  const mailboxAccountIdFromState = state.slice(0, colonIdx);
  const receivedRandom = state.slice(colonIdx + 1);
  const session = req.session as Record<string, unknown>;
  const expectedRandom = session.oauthState as string | undefined;
  const sessionMailboxId = session.oauthMailboxId as string | undefined;

  // Validate CSRF random AND mailbox identity match between state param and session
  if (!expectedRandom || receivedRandom !== expectedRandom) {
    return res.status(403).send(buildHtmlPage("Invalid OAuth state", `<p>Invalid OAuth state — please try connecting again. Your session may have expired.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }
  if (!sessionMailboxId || mailboxAccountIdFromState !== sessionMailboxId) {
    return res.status(403).send(buildHtmlPage("Invalid OAuth state", `<p>Mailbox identity mismatch — please try connecting again.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
  }

  delete session.oauthState;
  delete session.oauthMailboxId;
  delete session.oauthFrom;
  const returnUrl = settingsUrl;

  try {
    // Verify account exists and belongs to this user's company (no fallback without scope)
    const [account] = await db.select().from(mailboxAccounts).where(
      and(eq(mailboxAccounts.id, mailboxAccountIdFromState), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox)
    );
    if (!account || account.accountType !== "shared" || !account.isActive) {
      return res.status(404).send(buildHtmlPage("Not Found", `<p>Mailbox account not found.</p><p><a href="${returnUrl}">Return to settings</a></p>`));
    }

    if (!canManageMailboxOAuth(user)) {
      return res.status(403).send(buildHtmlPage("Not Authorized", `<p>You are not authorized to connect this mailbox.</p><p><a href="${returnUrl}">Return to settings</a></p>`));
    }

    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("No access token received from Google");

    const connectedEmail = await getUserEmail(accessToken);

    if (connectedEmail.toLowerCase() !== account.emailAddress.toLowerCase()) {
      return res.status(400).send(buildHtmlPage("Email Mismatch", `
        <p>The Google account you signed in with (<strong>${escapeHtml(connectedEmail)}</strong>) does not match the mailbox address (<strong>${escapeHtml(account.emailAddress)}</strong>).</p>
        <p>Please try again and sign in with the correct Google account.</p>
        <p><a href="${returnUrl}">Return to settings</a></p>
      `));
    }

    const tokenJson = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      connected_at: new Date().toISOString(),
      connected_email: connectedEmail,
    };

    const baseSet = {
      oauthTokenJson: tokenJson,
      syncEnabled: true,
      syncStatus: "connected" as const,
      syncErrorCount: 0,
      oauthProvider: "google",
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    };

    const [connected] = await db.update(mailboxAccounts).set(baseSet).where(and(
      eq(mailboxAccounts.id, account.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox,
      eq(mailboxAccounts.emailAddress, account.emailAddress),
      sql`date_trunc('milliseconds', ${mailboxAccounts.updatedAt}) = ${account.updatedAt}`))
      .returning({ id: mailboxAccounts.id });
    if (!connected) return res.status(409).send(buildHtmlPage("Mailbox changed", `<p>Start the connection again from <a href="${returnUrl}">settings</a>.</p>`));
    return res.redirect(`${returnUrl}?connected=${encodeURIComponent(connected.id)}&promptBackfill=1`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).send(buildHtmlPage("Connection Failed", `<p>Failed to connect Gmail: ${escapeHtml(msg)}</p><p><a href="${returnUrl}">Return to settings</a></p>`));
  }
});

// ─── Disconnect / revoke OAuth ────────────────────────────────────────────────
router.post("/:id/oauth/disconnect", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({ error: "Google OAuth is not configured. Contact your administrator." });
    }

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });

    if (!canManageMailboxOAuth(user)) {
      return res.status(403).json({ error: "Not authorized to disconnect this mailbox" });
    }

    await revokeTokens(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/mailbox-accounts/:id/oauth/disconnect error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /sync-summary — inbox page header stats ─────────────────────────────
router.get("/sync-summary", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const accounts = await db.select().from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));

    const totalActive = accounts.filter(a => a.isActive).length;
    const connected = accounts.filter(a => a.isActive && a.syncStatus === "connected").length;
    const errors = accounts.filter(a => a.isActive && a.syncStatus === "error").length;
    const notConnected = accounts.filter(a => a.isActive && a.syncStatus === "not_connected").length;

    // Last run timestamp across all mailboxes
    let lastRunAt: Date | null = null;
    if (connected > 0) {
      const connectedIds = accounts.filter(a => a.syncStatus === "connected").map(a => a.id);
      if (connectedIds.length > 0) {
        const latestRun = await db.select({ startedAt: mailboxSyncRuns.startedAt })
          .from(mailboxSyncRuns)
          .where(
            and(
              eq(mailboxSyncRuns.companyId, user.activeCompanyId),
              sql`mailbox_account_id = ANY(ARRAY[${sql.join(connectedIds.map(id => sql`${id}`), sql`, `)}]::varchar[])`
            )
          )
          .orderBy(desc(mailboxSyncRuns.startedAt))
          .limit(1);
        lastRunAt = latestRun[0]?.startedAt ?? null;
      }
    }

    // Messages routed/unsorted in last 24h — filter to email type only so non-email
    // inbound communications (notes, SMS) don't inflate the "routed" metric.
    const ids = accounts.map(account => account.id);
    const sharedOnly = (col: typeof communications.mailboxAccountId | typeof unsortedEmails.mailboxAccountId | typeof mailboxSyncRuns.mailboxAccountId) => ids.length ? inArray(col, ids) : sql`false`;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRouted = await db.select({ count: sql<number>`count(*)` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, user.activeCompanyId),
          sharedOnly(communications.mailboxAccountId),
          eq(communications.type, "email"),
          eq(communications.direction, "inbound"),
          gte(communications.receivedAt, since24h)
        )
      );
    const recentUnsorted = await db.select({ count: sql<number>`count(*)` })
      .from(unsortedEmails)
      .where(
        and(
          eq(unsortedEmails.companyId, user.activeCompanyId),
          sharedOnly(unsortedEmails.mailboxAccountId),
          gte(unsortedEmails.createdAt, since24h)
        )
      );

    // Check if any sync run is currently in progress for this company
    const runningRuns = await db.select({ id: mailboxSyncRuns.id })
      .from(mailboxSyncRuns)
      .where(
        and(
          eq(mailboxSyncRuns.companyId, user.activeCompanyId),
          eq(mailboxSyncRuns.status, "running"),
          sharedOnly(mailboxSyncRuns.mailboxAccountId)
        )
      )
      .limit(1);
    const hasRunning = runningRuns.length > 0;

    res.json({
      totalActive,
      connected,
      errors,
      notConnected,
      lastRunAt,
      hasRunning,
      messagesRoutedLast24h: Number(recentRouted[0]?.count ?? 0),
      messagesUnsortedLast24h: Number(recentUnsorted[0]?.count ?? 0),
    });
  } catch (err) {
    console.error("GET /api/mailbox-accounts/sync-summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /:id/sync — manual trigger ─────────────────────────────────────────
router.post("/:id/sync", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [account] = await db.select().from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });

    try {
      const vis = await resolveVisibleMailboxes({
        userId: user.id,
        companyId: user.activeCompanyId,
        role: user.activeRole as RoleName,
        isSuperAdmin: user.isSuperAdminBool,
      });
      if (vis.mailboxIds !== null && !vis.mailboxIds.includes(req.params.id)) {
        return res.status(403).json({ error: "You do not have access to this mailbox." });
      }
    } catch (err) {
      if (err instanceof MailboxScopeForbiddenError) return res.status(403).json({ error: err.message });
    }

    if (!account.syncEnabled || account.syncStatus !== "connected") {
      return res.status(400).json({ error: "Mailbox is not connected" });
    }

    const result = await syncMailbox(req.params.id, true);

    // Return the sync run record
    const [syncRun] = await db.select().from(mailboxSyncRuns)
      .where(eq(mailboxSyncRuns.id, result.syncRunId));

    res.json(syncRun ?? result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    if (msg === "Sync already in progress for this mailbox") {
      return res.status(409).json({ error: msg });
    }
    console.error("POST /api/mailbox-accounts/:id/sync error:", err);
    res.status(500).json({ error: msg });
  }
});

// ─── GET /:id/sync-runs — last 20 runs ────────────────────────────────────────
router.get("/:id/sync-runs", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [account] = await db.select().from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });

    const runs = await db.select().from(mailboxSyncRuns)
      .where(and(eq(mailboxSyncRuns.mailboxAccountId, req.params.id), eq(mailboxSyncRuns.companyId, user.activeCompanyId)))
      .orderBy(desc(mailboxSyncRuns.startedAt))
      .limit(20);

    res.json(runs);
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id/sync-runs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get single mailbox account ───────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }
    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });
    res.json(safeAccount(account));
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create mailbox account ───────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const parsed = mailboxSettings.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const [account] = await db.insert(mailboxAccounts).values({ ...parsed.data, companyId: user.activeCompanyId, accountType: "shared" }).returning();
    res.status(201).json(safeAccount(account));
  } catch (err) {
    console.error("POST /api/mailbox-accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update mailbox account ───────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }
    const parsed = mailboxSettings.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { accountType: _type, ...updates } = parsed.data;
    // Changing the Google address must not leave the former Gmail identity usable.
    const disconnected = updates.emailAddress === undefined ? {} : {
      oauthTokenJson: sql`CASE WHEN lower(email_address) = lower(${updates.emailAddress}) THEN oauth_token_json END`,
      syncEnabled: sql`lower(email_address) = lower(${updates.emailAddress}) AND sync_enabled`,
      syncStatus: sql`CASE WHEN lower(email_address) = lower(${updates.emailAddress}) THEN sync_status ELSE 'not_connected' END`,
      gmailHistoryId: sql`CASE WHEN lower(email_address) = lower(${updates.emailAddress}) THEN gmail_history_id END`,
      gmailSentHistoryId: sql`CASE WHEN lower(email_address) = lower(${updates.emailAddress}) THEN gmail_sent_history_id END`,
    };
    const [updated] = await db.update(mailboxAccounts)
      .set({ ...updates, ...disconnected, ...(updates.isActive === false ? { syncEnabled: false } : {}), updatedAt: new Date() })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(safeAccount(updated));
  } catch (err) {
    console.error("PATCH /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin-disconnect (admin/office override) ─────────────────────────────────
router.post("/:id/admin-disconnect", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && user.accessRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });

    const reason = req.body?.reason as string | undefined;

    await db.update(mailboxAccounts)
      .set({
        oauthTokenJson: null,
        syncStatus: "not_connected",
        syncEnabled: false,
        updatedAt: new Date(),
      })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));

    console.log(`[mailbox.admin_disconnected] mailboxId=${req.params.id} by userId=${user.id} reason=${reason ?? "(none)"}`);

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/mailbox-accounts/:id/admin-disconnect error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Deactivate mailbox account (soft) ───────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.accessRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const [account] = await db.update(mailboxAccounts)
      .set({ isActive: false, syncEnabled: false, updatedAt: new Date() })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox))
      .returning();
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function canAccessMailboxBackfill(user: UserWithContext): boolean {
  return user.isSuperAdminBool || user.accessRole === "admin" || user.accessRole === "office";
}

// ─── POST /:id/backfill — start or return existing run ────────────────────────
router.post("/:id/backfill", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });
    if (!canAccessMailboxBackfill(user)) return res.status(403).json({ error: "Forbidden" });

    const { rangeStart, rangeEnd, includeInbox = true, includeSent = true } = req.body;
    if (!rangeStart || !rangeEnd) return res.status(400).json({ error: "rangeStart and rangeEnd required" });

    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    const result = await startBackfill({
      mailboxAccountId: req.params.id,
      companyId: user.activeCompanyId,
      rangeStart: start,
      rangeEnd: end,
      includeInbox: Boolean(includeInbox),
      includeSent: Boolean(includeSent),
    });

    res.status(result.alreadyRunning ? 200 : 201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("POST /api/mailbox-accounts/:id/backfill error:", err);
    res.status(400).json({ error: msg });
  }
});

// ─── GET /:id/backfill/status — active run + last 10 history ─────────────────
router.get("/:id/backfill/status", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });
    if (!canAccessMailboxBackfill(user)) return res.status(403).json({ error: "Forbidden" });

    const [active, history] = await Promise.all([
      getActiveBackfill(req.params.id),
      getBackfillHistory(req.params.id, 10),
    ]);

    res.json({ active: active ?? null, history });
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id/backfill/status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /:id/backfill/:runId/cancel ─────────────────────────────────────────
router.post("/:id/backfill/:runId/cancel", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId), activeSharedMailbox));
    if (!account || account.accountType !== "shared" || !account.isActive) return res.status(404).json({ error: "Not found" });
    if (!canAccessMailboxBackfill(user)) return res.status(403).json({ error: "Forbidden" });

    await requestCancel(req.params.runId, req.params.id, user.activeCompanyId);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/mailbox-accounts/:id/backfill/:runId/cancel error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlPage(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - High Plains CRM</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #333; }
    h1 { color: #c0392b; }
    a { color: #2980b9; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyContent}
</body>
</html>`;
}

export default router;
