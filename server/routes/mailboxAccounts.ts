import { Router } from "express";
import { db } from "../db";
import { mailboxAccounts, mailboxSyncRuns, unsortedEmails, communications } from "@shared/schema";
import { insertMailboxAccountSchema } from "@shared/schema";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { resolveVisibleMailboxes, MailboxScopeForbiddenError } from "../services/mailboxScope";
import type { RoleName } from "@shared/schema";
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

    const conditions = [eq(mailboxAccounts.companyId, user.activeCompanyId)];
    if (visibleMailboxIds !== null && visibleMailboxIds.length > 0) {
      conditions.push(inArray(mailboxAccounts.id, visibleMailboxIds));
    }

    const accounts = await db.select()
      .from(mailboxAccounts)
      .where(and(...conditions));
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

    // Store return context so the callback can redirect appropriately
    const fromParam = req.query.from as string | undefined;
    if (fromParam) {
      (req.session as Record<string, unknown>).oauthFrom = fromParam;
    } else {
      delete (req.session as Record<string, unknown>).oauthFrom;
    }

    const authUrl = generateAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    console.error("GET /api/mailbox-accounts/:id/oauth/connect error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── List personal mailboxes for the current user ────────────────────────────
// Returns a safe DTO — never exposes oauthTokenJson; derives connectedEmail/connectedAt server-side.
router.get("/mine", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await db.select({
      id: mailboxAccounts.id,
      displayName: mailboxAccounts.displayName,
      emailAddress: mailboxAccounts.emailAddress,
      accountType: mailboxAccounts.accountType,
      syncStatus: mailboxAccounts.syncStatus,
      syncEnabled: mailboxAccounts.syncEnabled,
      syncErrorCount: mailboxAccounts.syncErrorCount,
      lastSyncedAt: mailboxAccounts.lastSyncedAt,
      isActive: mailboxAccounts.isActive,
      ownerUserId: mailboxAccounts.ownerUserId,
      oauthTokenJson: mailboxAccounts.oauthTokenJson,
    })
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.companyId, user.activeCompanyId),
          eq(mailboxAccounts.accountType, "personal"),
          eq(mailboxAccounts.ownerUserId, user.id),
        )
      );

    const dtos = rows.map((r) => {
      const tokenData = r.oauthTokenJson as Record<string, unknown> | null;
      return {
        id: r.id,
        displayName: r.displayName,
        emailAddress: r.emailAddress,
        accountType: r.accountType,
        syncStatus: r.syncStatus,
        syncEnabled: r.syncEnabled,
        syncErrorCount: r.syncErrorCount,
        lastSyncedAt: r.lastSyncedAt,
        isActive: r.isActive,
        ownerUserId: r.ownerUserId,
        connectedEmail: (tokenData?.connected_email as string | undefined) ?? null,
        connectedAt: (tokenData?.connected_at as string | undefined) ?? null,
      };
    });

    res.json(dtos);
  } catch (err) {
    console.error("GET /api/mailbox-accounts/mine error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create a personal mailbox for the current user ───────────────────────────
router.post("/mine", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const emailSchema = insertMailboxAccountSchema.pick({ emailAddress: true });
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { emailAddress } = req.body as { emailAddress: string; displayName?: string };
    const displayName = (req.body.displayName as string | undefined)?.trim() || user.name || emailAddress;

    // Check if this emailAddress already exists in the company
    const [existing] = await db.select()
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.companyId, user.activeCompanyId),
          sql`lower(${mailboxAccounts.emailAddress}) = lower(${emailAddress})`
        )
      );

    if (existing) {
      return res.status(200).json({
        alreadyExists: true,
        id: existing.id,
        isOwner: existing.ownerUserId === user.id,
        accountType: existing.accountType,
      });
    }

    const [account] = await db.insert(mailboxAccounts).values({
      companyId: user.activeCompanyId,
      emailAddress,
      displayName,
      accountType: "personal",
      ownerUserId: user.id,
      syncStatus: "not_connected",
      syncEnabled: false,
      isActive: true,
    } as typeof mailboxAccounts.$inferInsert).returning();

    console.info("[mailbox.self_created]", {
      userId: user.id,
      mailboxAccountId: account.id,
      emailAddress,
    });

    res.status(201).json({
      id: account.id,
      displayName: account.displayName,
      emailAddress: account.emailAddress,
      accountType: account.accountType,
      syncStatus: account.syncStatus,
      syncEnabled: account.syncEnabled,
      syncErrorCount: account.syncErrorCount,
      lastSyncedAt: account.lastSyncedAt,
      isActive: account.isActive,
      ownerUserId: account.ownerUserId,
      connectedEmail: null,
      connectedAt: null,
    });
  } catch (err) {
    console.error("POST /api/mailbox-accounts/mine error:", err);
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

  // Capture return context before clearing session
  const oauthFrom = session.oauthFrom as string | undefined;

  // Clear state from session before any async work
  delete session.oauthState;
  delete session.oauthMailboxId;
  delete session.oauthFrom;

  // Determine return URL based on context
  const returnUrl = oauthFrom === "my-mailbox"
    ? "/dashboard/settings/my-mailbox"
    : settingsUrl;

  try {
    // Verify account exists and belongs to this user's company (no fallback without scope)
    const [account] = await db.select().from(mailboxAccounts).where(
      and(eq(mailboxAccounts.id, mailboxAccountIdFromState), eq(mailboxAccounts.companyId, user.activeCompanyId))
    );
    if (!account) {
      return res.status(404).send(buildHtmlPage("Not Found", `<p>Mailbox account not found.</p><p><a href="${returnUrl}">Return to settings</a></p>`));
    }

    if (!canManageMailboxOAuth(user, account)) {
      return res.status(403).send(buildHtmlPage("Not Authorized", `<p>You are not authorized to connect this mailbox.</p><p><a href="${returnUrl}">Return to settings</a></p>`));
    }

    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("No access token received from Google");

    const connectedEmail = await getUserEmail(accessToken);

    // Track whether we need to update emailAddress (personal mailbox auto-correct)
    let autocorrectedEmailAddress: string | null = null;

    // Verify email matches the mailbox account email
    if (connectedEmail.toLowerCase() !== account.emailAddress.toLowerCase()) {
      if (account.accountType === "personal" && account.ownerUserId === user.id) {
        // Check whether connectedEmail is already claimed by another row in this company
        const conflicting = await db.select({ id: mailboxAccounts.id })
          .from(mailboxAccounts)
          .where(
            and(
              eq(mailboxAccounts.companyId, user.activeCompanyId),
              sql`lower(${mailboxAccounts.emailAddress}) = lower(${connectedEmail})`
            )
          );
        const hasConflict = conflicting.some(a => a.id !== account.id);
        if (hasConflict) {
          return res.status(400).send(buildHtmlPage("Email Conflict", `
            <p>The Google account you signed in with (<strong>${escapeHtml(connectedEmail)}</strong>) is already registered as another mailbox in your company.</p>
            <p>Please contact your administrator for assistance.</p>
            <p><a href="${returnUrl}">Return to settings</a></p>
          `));
        }
        // Auto-correct: update the stored email address to match the authenticated Google account
        autocorrectedEmailAddress = connectedEmail;
        console.info("[mailbox.email_autocorrected]", {
          userId: user.id,
          mailboxAccountId: account.id,
          from: account.emailAddress,
          to: connectedEmail,
        });
      } else {
        // Shared mailbox or personal owned by a different user — reject on mismatch
        return res.status(400).send(buildHtmlPage("Email Mismatch", `
          <p>The Google account you signed in with (<strong>${escapeHtml(connectedEmail)}</strong>) does not match the mailbox address (<strong>${escapeHtml(account.emailAddress)}</strong>).</p>
          <p>Please try again and sign in with the correct Google account.</p>
          <p><a href="${returnUrl}">Return to settings</a></p>
        `));
      }
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

    if (autocorrectedEmailAddress) {
      await db.update(mailboxAccounts)
        .set({ ...baseSet, emailAddress: autocorrectedEmailAddress })
        .where(and(eq(mailboxAccounts.id, mailboxAccountIdFromState), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    } else {
      await db.update(mailboxAccounts)
        .set(baseSet)
        .where(and(eq(mailboxAccounts.id, mailboxAccountIdFromState), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    }

    const redirectBase = returnUrl;
    const autocorrectedFlag = autocorrectedEmailAddress ? "&autocorrected=1" : "";
    const redirectSuffix = oauthFrom === "my-mailbox"
      ? `?connected=${encodeURIComponent(mailboxAccountIdFromState)}${autocorrectedFlag}`
      : `?connected=${encodeURIComponent(mailboxAccountIdFromState)}&promptBackfill=1`;

    return res.redirect(`${redirectBase}${redirectSuffix}`);
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

// ─── Deactivate mailbox account (soft) ───────────────────────────────────────
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

// ─── Hard-delete mailbox account (permanent) ─────────────────────────────────
router.delete("/:id/permanent", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });
    if (user.activeRole !== "admin" && !user.isSuperAdminBool) return res.status(403).json({ error: "Admin only" });

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });

    if (account.syncStatus === "connected") {
      return res.status(409).json({ error: "Mailbox is currently connected. Disconnect it before deleting." });
    }

    await db.delete(mailboxSyncRuns).where(eq(mailboxSyncRuns.mailboxAccountId, req.params.id));
    await db.delete(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/mailbox-accounts/:id/permanent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Auth helper: owner of mailbox OR admin/office ────────────────────────────
function canAccessMailboxBackfill(user: UserWithContext, account: typeof mailboxAccounts.$inferSelect): boolean {
  if (user.isSuperAdminBool) return true;
  if (user.activeRole === "admin" || user.activeRole === "office") return true;
  if (account.accountType === "personal" && account.ownerUserId === user.id) return true;
  return false;
}

// ─── POST /:id/backfill — start or return existing run ────────────────────────
router.post("/:id/backfill", async (req, res) => {
  try {
    const user = req.user as UserWithContext;
    if (!user?.activeCompanyId) return res.status(401).json({ error: "Unauthorized" });

    const [account] = await db.select()
      .from(mailboxAccounts)
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });
    if (!canAccessMailboxBackfill(user, account)) return res.status(403).json({ error: "Forbidden" });

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
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });
    if (!canAccessMailboxBackfill(user, account)) return res.status(403).json({ error: "Forbidden" });

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
      .where(and(eq(mailboxAccounts.id, req.params.id), eq(mailboxAccounts.companyId, user.activeCompanyId)));
    if (!account) return res.status(404).json({ error: "Not found" });
    if (!canAccessMailboxBackfill(user, account)) return res.status(403).json({ error: "Forbidden" });

    await requestCancel(req.params.runId);
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
