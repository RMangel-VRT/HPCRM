import { Router } from "express";
import { db } from "../db";
import { mailboxAccounts, mailboxSyncRuns, unsortedEmails, communications } from "@shared/schema";
import { insertMailboxAccountSchema } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
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

const router = Router();

// ─── List all mailbox accounts for the company ────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }
    const accounts = await db.select()
      .from(mailboxAccounts)
      .where(eq(mailboxAccounts.companyId, user.activeCompanyId));
    res.json(accounts);
  } catch (err) {
    console.error("GET /api/mailbox-accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Auth helper: admin/superadmin OR owner of personal mailbox ───────────────
function canManageMailboxOAuth(user: UserWithContext, account: typeof mailboxAccounts.$inferSelect): boolean {
  if (user.isSuperAdminBool) return true;
  if (user.activeRole === "admin") return true;
  // Personal mailbox owned by this user
  if (account.accountType === "personal" && account.ownerUserId === user.id) return true;
  return false;
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
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });

    if (!canManageMailboxOAuth(user, account)) {
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
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });

    if (!canManageMailboxOAuth(user, account)) {
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

// ─── OAuth callback ───────────────────────────────────────────────────────────
router.get("/oauth/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  const settingsUrl = "/dashboard/settings/mailbox-accounts";

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

  // Clear state from session before any async work
  delete session.oauthState;
  delete session.oauthMailboxId;

  try {
    // Verify account exists and belongs to this user's company (no fallback without scope)
    const [account] = await db.select().from(mailboxAccounts).where(
      and(eq(mailboxAccounts.id, mailboxAccountIdFromState), eq(mailboxAccounts.companyId, user.activeCompanyId))
    );
    if (!account) {
      return res.status(404).send(buildHtmlPage("Not Found", `<p>Mailbox account not found.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
    }

    if (!canManageMailboxOAuth(user, account)) {
      return res.status(403).send(buildHtmlPage("Not Authorized", `<p>You are not authorized to connect this mailbox.</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
    }

    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("No access token received from Google");

    const connectedEmail = await getUserEmail(accessToken);

    // Verify email matches the mailbox account email
    if (connectedEmail.toLowerCase() !== account.emailAddress.toLowerCase()) {
      return res.status(400).send(buildHtmlPage("Email Mismatch", `
        <p>The Google account you signed in with (<strong>${escapeHtml(connectedEmail)}</strong>) does not match the mailbox address (<strong>${escapeHtml(account.emailAddress)}</strong>).</p>
        <p>Please try again and sign in with the correct Google account.</p>
        <p><a href="${settingsUrl}">Return to settings</a></p>
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

    await db
      .update(mailboxAccounts)
      .set({
        oauthTokenJson: tokenJson,
        syncEnabled: true,
        syncStatus: "connected",
        syncErrorCount: 0,
        oauthProvider: "google",
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(mailboxAccounts.id, mailboxAccountIdFromState), eq(mailboxAccounts.companyId, user.activeCompanyId)));

    return res.redirect(`${settingsUrl}?connected=${encodeURIComponent(mailboxAccountIdFromState)}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).send(buildHtmlPage("Connection Failed", `<p>Failed to connect Gmail: ${escapeHtml(msg)}</p><p><a href="${settingsUrl}">Return to settings</a></p>`));
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
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });

    if (!canManageMailboxOAuth(user, account)) {
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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const accounts = await db.select().from(mailboxAccounts)
      .where(eq(mailboxAccounts.companyId, user.activeCompanyId));

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
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRouted = await db.select({ count: sql<number>`count(*)` })
      .from(communications)
      .where(
        and(
          eq(communications.companyId, user.activeCompanyId),
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
          gte(unsortedEmails.createdAt, since24h)
        )
      );

    // Check if any sync run is currently in progress for this company
    const runningRuns = await db.select({ id: mailboxSyncRuns.id })
      .from(mailboxSyncRuns)
      .where(
        and(
          eq(mailboxSyncRuns.companyId, user.activeCompanyId),
          eq(mailboxSyncRuns.status, "running")
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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [account] = await db.select().from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });

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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }

    const [account] = await db.select().from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });

    const runs = await db.select().from(mailboxSyncRuns)
      .where(eq(mailboxSyncRuns.mailboxAccountId, req.params.id))
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
    if (user.activeRole !== "admin" && user.activeRole !== "office" && !user.isSuperAdminBool) {
      return res.status(403).json({ error: "Admin or office role required" });
    }
    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json(account);
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
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const parsed = insertMailboxAccountSchema.safeParse({ ...req.body, companyId: user.activeCompanyId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const [account] = await db.insert(mailboxAccounts).values(parsed.data as typeof mailboxAccounts.$inferInsert).returning();
    res.status(201).json(account);
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
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const updates = req.body;
    delete updates.id;
    delete updates.companyId;
    const [account] = await db.update(mailboxAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)))
      .returning();
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json(account);
  } catch (err) {
    console.error("PATCH /api/mailbox-accounts/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Deactivate mailbox account ───────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });
    const [account] = await db.update(mailboxAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)))
      .returning();
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/mailbox-accounts/:id error:", err);
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
