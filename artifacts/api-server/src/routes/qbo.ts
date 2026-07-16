import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { UserWithContext } from "../auth";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import {
  isQboConfigured,
  getAuthorizeUrl,
  exchangeCodeForTokens,
  revokeConnection,
  getCompanyInfo,
  isQboWriteEnabled,
} from "../services/qboClient";
import { encryptToken } from "../services/qboCrypto";

// ── Session type extension ──────────────────────────────────────────────────────
declare module "express-session" {
  interface SessionData {
    qboOAuthState?: {
      state: string;
      companyId: string;
      expiresAt: number;
    };
  }
}

const router = Router();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function requireAdmin(req: Request, res: Response): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const u = req.user as UserWithContext;
  if (u.activeRole !== "admin" && !u.isSuperAdminBool) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return u;
}

function requireAdminOrOffice(req: Request, res: Response): UserWithContext | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const u = req.user as UserWithContext;
  if (u.activeRole !== "admin" && u.activeRole !== "office" && !u.isSuperAdminBool) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return u;
}

function safePublicConn(conn: Awaited<ReturnType<typeof storage.getQboConnection>>) {
  if (!conn) return { status: "not_connected" as const };
  return {
    status: conn.status,
    realmId: conn.realmId,
    companyName: conn.companyName,
    environment: conn.environment,
    lastErrorMessage: conn.lastErrorMessage,
    connectedAt: conn.connectedAt,
    updatedAt: conn.updatedAt,
  };
}

function getAppBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
      : "http://localhost:3000")
  );
}

// GET /api/qbo/connection — admin + office
router.get("/connection", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const conn = await storage.getQboConnection(u.activeCompanyId);
    res.json(safePublicConn(conn));
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/connection error");
    res.status(500).json({ message: "Failed to get QBO connection" });
  }
});

// POST /api/qbo/connect — admin only
router.post("/connect", async (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  try {
    if (!isQboConfigured()) {
      res.status(503).json({ message: "QuickBooks integration is not configured on this server" });
      return;
    }
    const state = randomBytes(32).toString("hex");
    req.session.qboOAuthState = {
      state,
      companyId: u.activeCompanyId,
      expiresAt: Date.now() + STATE_TTL_MS,
    };
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    const authorizeUrl = getAuthorizeUrl(state);
    res.json({ authorizeUrl });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/connect error");
    res.status(500).json({ message: "Failed to initiate QuickBooks connection" });
  }
});

// GET /api/qbo/callback — OAuth return from Intuit
router.get("/callback", async (req, res) => {
  const baseUrl = getAppBaseUrl();
  const settingsUrl = `${baseUrl}/dashboard/settings/features`;

  const { code, state, realmId, error } = req.query as Record<string, string | undefined>;

  if (error) {
    logger.warn({ error }, "QBO OAuth callback returned error from Intuit");
    res.redirect(`${settingsUrl}?qbo=error&reason=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state || !realmId) {
    res.redirect(`${settingsUrl}?qbo=error&reason=missing_params`);
    return;
  }

  const sessionState = req.session.qboOAuthState;

  if (!sessionState) {
    logger.warn("QBO callback: no session state found");
    res.redirect(`${settingsUrl}?qbo=error&reason=state_missing`);
    return;
  }

  if (sessionState.state !== state) {
    logger.warn({ expected: sessionState.state, got: state }, "QBO callback: state mismatch");
    res.redirect(`${settingsUrl}?qbo=error&reason=state_mismatch`);
    return;
  }

  if (Date.now() > sessionState.expiresAt) {
    logger.warn("QBO callback: state expired");
    delete req.session.qboOAuthState;
    res.redirect(`${settingsUrl}?qbo=error&reason=state_expired`);
    return;
  }

  const { companyId } = sessionState;
  delete req.session.qboOAuthState;

  try {
    const tokens = await exchangeCodeForTokens(code, realmId);

    const accessEnc = encryptToken(tokens.access_token);
    const refreshEnc = encryptToken(tokens.refresh_token);
    if (!accessEnc || !refreshEnc) {
      res.redirect(`${settingsUrl}?qbo=error&reason=encryption_failed`);
      return;
    }

    const now = Date.now();
    const environment = (process.env.QBO_ENVIRONMENT || "production") as "sandbox" | "production";

    await storage.upsertQboConnection({
      companyId,
      realmId,
      accessTokenEnc: accessEnc,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
        ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
        : null,
      status: "connected",
      environment,
      companyName: null,
      lastErrorMessage: null,
    });

    // Fetch company name from QBO
    try {
      const info = await getCompanyInfo(companyId);
      const companyInfo = (info as Record<string, unknown>)["CompanyInfo"] as Record<string, unknown> | undefined;
      const companyName = companyInfo?.["CompanyName"] as string | undefined;
      if (companyName) {
        await storage.upsertQboConnection({
          companyId,
          realmId,
          accessTokenEnc: accessEnc,
          refreshTokenEnc: refreshEnc,
          tokenExpiresAt: new Date(now + tokens.expires_in * 1000),
          refreshTokenExpiresAt: tokens.x_refresh_token_expires_in
            ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
            : null,
          status: "connected",
          environment,
          companyName,
          lastErrorMessage: null,
        });
      }
    } catch (err) {
      logger.warn({ err, companyId }, "Could not fetch QBO company name after connect (non-fatal)");
    }

    res.redirect(`${settingsUrl}?qbo=connected`);
  } catch (err) {
    logger.error({ err, companyId }, "QBO callback token exchange failed");
    const reason = err instanceof Error ? err.message : "exchange_failed";
    res.redirect(`${settingsUrl}?qbo=error&reason=${encodeURIComponent(reason)}`);
  }
});

// POST /api/qbo/disconnect — admin only
router.post("/disconnect", async (req, res) => {
  const u = requireAdmin(req, res);
  if (!u) return;
  try {
    await revokeConnection(u.activeCompanyId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/qbo/disconnect error");
    res.status(500).json({ message: "Failed to disconnect QuickBooks" });
  }
});

// POST /api/qbo/test — admin + office
router.post("/test", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const info = await getCompanyInfo(u.activeCompanyId);
    const companyInfo = (info as Record<string, unknown>)["CompanyInfo"] as Record<string, unknown> | undefined;
    const name = companyInfo?.["CompanyName"] as string | undefined;
    res.json({ ok: true, companyName: name ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Test failed";
    logger.warn({ err }, "POST /api/qbo/test failed");
    res.json({ ok: false, error: msg });
  }
});

// GET /api/qbo/write-enabled — internal/admin check
router.get("/write-enabled", async (req, res) => {
  const u = requireAdminOrOffice(req, res);
  if (!u) return;
  try {
    const enabled = await isQboWriteEnabled(u.activeCompanyId);
    res.json({ enabled });
  } catch (err) {
    logger.error({ err }, "GET /api/qbo/write-enabled error");
    res.status(500).json({ message: "Failed to check QBO write access" });
  }
});

export default router;
