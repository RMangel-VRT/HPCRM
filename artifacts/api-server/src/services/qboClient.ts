import { db } from "../db";
import { qboConnections, settings } from "@workspace/db";
import type { QboConnection } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "./qboCrypto";
import { logger } from "../lib/logger";

// ── Intuit endpoint constants ──────────────────────────────────────────────────
const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QBO_SCOPES = ["com.intuit.quickbooks.accounting"];
const QBO_MINOR_VERSION = "73";
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

function getQboApiBase(environment: string): string {
  return environment === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

function requireEnv() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const environment = process.env.QBO_ENVIRONMENT;
  const encKey = process.env.QBO_TOKEN_ENC_KEY;

  const missing: string[] = [];
  if (!clientId) missing.push("QBO_CLIENT_ID");
  if (!clientSecret) missing.push("QBO_CLIENT_SECRET");
  if (!redirectUri) missing.push("QBO_REDIRECT_URI");
  if (!environment) missing.push("QBO_ENVIRONMENT");
  if (!encKey) missing.push("QBO_TOKEN_ENC_KEY");

  if (missing.length > 0) {
    logger.error({ missing }, "QBO OAuth is not fully configured — missing env vars");
    throw new Error(`QuickBooks integration is not configured. Missing: ${missing.join(", ")}`);
  }

  const env = environment as "sandbox" | "production";
  return { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri!, environment: env };
}

export function isQboConfigured(): boolean {
  return !!(
    process.env.QBO_CLIENT_ID &&
    process.env.QBO_CLIENT_SECRET &&
    process.env.QBO_REDIRECT_URI &&
    process.env.QBO_ENVIRONMENT &&
    process.env.QBO_TOKEN_ENC_KEY
  );
}

export function getAuthorizeUrl(state: string): string {
  const { clientId, redirectUri, environment } = requireEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QBO_SCOPES.join(" "),
    state,
  });
  if (environment === "sandbox") {
    params.set("intuit_tid", "sandbox");
  }
  return `${QBO_AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
  realmId?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  realmId: string
): Promise<QboTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    logger.error({ status: resp.status, body: text }, "QBO token exchange failed");
    throw new Error(`QBO token exchange failed: ${resp.status} ${text}`);
  }
  const data = await resp.json() as QboTokenResponse;
  data.realmId = realmId;
  return data;
}

async function doRefresh(conn: QboConnection, signal?: AbortSignal): Promise<QboTokenResponse> {
  const { clientId, clientSecret } = requireEnv();
  const refreshToken = decryptToken(conn.refreshTokenEnc);
  if (!refreshToken) throw new Error("Cannot decrypt refresh token");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const resp = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text();
    logger.warn({ status: resp.status, body: text, companyId: conn.companyId }, "QBO token refresh failed");
    throw Object.assign(new Error(`QBO refresh failed: ${resp.status} ${text}`), { status: resp.status, body: text });
  }
  return resp.json() as Promise<QboTokenResponse>;
}

function classifyRefreshError(err: unknown): "expired" | "revoked" | "error" | null {
  const isObj = (e: unknown): e is Record<string, unknown> => typeof e === "object" && e !== null;
  let bodyText = "";
  if (isObj(err) && typeof (err as { body?: unknown }).body === "string") {
    bodyText = (err as { body: string }).body;
  }
  const status = isObj(err) ? ((err as { status?: unknown }).status as number | undefined) : undefined;

  // Transient server-side errors — preserve current status, caller should retry later
  if (bodyText.includes("server_error") || bodyText.includes("temporarily_unavailable")) return null;
  if (status && status >= 500) return null;

  // Token is expired / invalid but might be reconnectable via new OAuth flow
  if (
    bodyText.includes("invalid_grant") ||
    bodyText.includes("invalid_refresh_token")
  ) return "expired";

  // Token explicitly revoked or access denied by user/Intuit — requires reconnect
  if (
    bodyText.includes("revoked_token") ||
    bodyText.includes("access_denied") ||
    bodyText.includes("authorization_revoked") ||
    bodyText.includes("token_revoked")
  ) return "revoked";

  // Client credential problems — treat as revoked since the connection cannot self-heal
  if (bodyText.includes("invalid_client") || bodyText.includes("unauthorized_client")) return "revoked";

  // Any other 4xx — mark as error (non-transient, unknown cause)
  if (status && status >= 400 && status < 500) return "error";

  return null;
}

async function upsertRefreshedTokens(companyId: string, tokens: QboTokenResponse): Promise<void> {
  const accessEnc = encryptToken(tokens.access_token);
  const refreshEnc = encryptToken(tokens.refresh_token);
  if (!accessEnc || !refreshEnc) throw new Error("Token encryption failed");

  const now = Date.now();
  const tokenExpiresAt = new Date(now + tokens.expires_in * 1000);
  const refreshTokenExpiresAt = tokens.x_refresh_token_expires_in
    ? new Date(now + tokens.x_refresh_token_expires_in * 1000)
    : null;

  await db
    .update(qboConnections)
    .set({
      accessTokenEnc: accessEnc,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt,
      ...(refreshTokenExpiresAt ? { refreshTokenExpiresAt } : {}),
      status: "connected",
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(qboConnections.companyId, companyId));
}

// ── Single-flight refresh guard ────────────────────────────────────────────────
const refreshInFlight = new Map<string, Promise<void>>();

async function ensureFreshToken(conn: QboConnection, force = false): Promise<QboConnection> {
  const expiresAt = conn.tokenExpiresAt.getTime();
  const needsRefresh = force || expiresAt - Date.now() < REFRESH_BUFFER_MS;
  if (!needsRefresh) return conn;

  if (!refreshInFlight.has(conn.companyId)) {
    const refreshPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const tokens = await doRefresh(conn, controller.signal);
        await upsertRefreshedTokens(conn.companyId, tokens);
      } catch (err) {
        const newStatus = classifyRefreshError(err);
        if (newStatus) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await db
            .update(qboConnections)
            .set({ status: newStatus, lastErrorMessage: errMsg, updatedAt: new Date() })
            .where(eq(qboConnections.companyId, conn.companyId));
        }
        throw err;
      } finally {
        clearTimeout(timeout);
        refreshInFlight.delete(conn.companyId);
      }
    })();
    refreshInFlight.set(conn.companyId, refreshPromise);
  }

  await refreshInFlight.get(conn.companyId);

  const [refreshed] = await db
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.companyId, conn.companyId));
  if (!refreshed) throw new Error("QBO connection not found after refresh");
  if (refreshed.status !== "connected") {
    throw new Error(`QBO connection is not active: ${refreshed.status}`);
  }
  return refreshed;
}

export async function refreshTokens(conn: QboConnection): Promise<void> {
  const tokens = await doRefresh(conn);
  await upsertRefreshedTokens(conn.companyId, tokens);
}

export async function revokeConnection(companyId: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(qboConnections)
    .where(eq(qboConnections.companyId, companyId));
  if (!conn) return;

  const { clientId, clientSecret } = requireEnv();
  const refreshToken = decryptToken(conn.refreshTokenEnc);

  if (refreshToken) {
    try {
      const body = new URLSearchParams({ token: refreshToken });
      await fetch(QBO_REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(clientId, clientSecret),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });
    } catch (err) {
      logger.warn({ err, companyId }, "QBO token revoke call failed (continuing with DB delete)");
    }
  }

  await db.delete(qboConnections).where(eq(qboConnections.companyId, companyId));
}

export async function qboRequest(
  companyId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const [conn] = await db
    .select()
    .from(qboConnections)
    .where(and(eq(qboConnections.companyId, companyId)));

  if (!conn) throw new Error("No QBO connection found for this company");
  if (conn.status !== "connected") {
    throw new Error(`QBO connection is not active: ${conn.status}`);
  }

  let freshConn = await ensureFreshToken(conn);
  const accessToken = decryptToken(freshConn.accessTokenEnc);
  if (!accessToken) throw new Error("Cannot decrypt QBO access token");

  const base = getQboApiBase(freshConn.environment);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}/${freshConn.realmId}${path}${sep}minorversion=${QBO_MINOR_VERSION}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";

  let resp = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // 401 → force a refresh through the single-flight guard and retry once
  if (resp.status === 401) {
    logger.warn({ companyId, path }, "QBO 401 — forcing token refresh through single-flight guard");
    freshConn = await ensureFreshToken(freshConn, true);
    const retryToken = decryptToken(freshConn.accessTokenEnc);
    if (!retryToken) throw new Error("Cannot decrypt QBO access token after refresh");
    headers["Authorization"] = `Bearer ${retryToken}`;
    resp = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (resp.status === 401) {
      await db
        .update(qboConnections)
        .set({ status: "revoked", lastErrorMessage: "401 after refresh retry", updatedAt: new Date() })
        .where(eq(qboConnections.companyId, companyId));
      throw new Error("QBO connection revoked — 401 after refresh retry");
    }
  }

  return resp;
}

export async function getCompanyInfo(companyId: string): Promise<Record<string, unknown>> {
  const [conn] = await db
    .select({ realmId: qboConnections.realmId })
    .from(qboConnections)
    .where(eq(qboConnections.companyId, companyId));
  if (!conn) throw new Error("No QBO connection found");

  const resp = await qboRequest(companyId, "GET", `/companyinfo/${conn.realmId}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`CompanyInfo failed: ${resp.status} ${text}`);
  }
  return resp.json() as Promise<Record<string, unknown>>;
}

export async function isQboWriteEnabled(companyId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ featureFlags: settings.featureFlags })
      .from(settings)
      .where(eq(settings.companyId, companyId));
    if (!row) return false;
    const flags = JSON.parse(row.featureFlags || "{}") as Record<string, unknown>;
    return flags.qbo_write === true;
  } catch {
    return false;
  }
}

// ── Proactive background refresh (every 30 min) ────────────────────────────────
export function startQboProactiveRefresh(): void {
  const INTERVAL_MS = 30 * 60 * 1000;

  const run = async () => {
    try {
      const connections = await db
        .select()
        .from(qboConnections)
        .where(eq(qboConnections.status, "connected"));

      for (const conn of connections) {
        const expiresAt = conn.tokenExpiresAt.getTime();
        if (expiresAt - Date.now() < REFRESH_BUFFER_MS + INTERVAL_MS) {
          try {
            await ensureFreshToken(conn);
          } catch (err) {
            logger.warn({ err, companyId: conn.companyId }, "QBO proactive refresh failed for company");
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "QBO proactive refresh loop error");
    }
  };

  setInterval(run, INTERVAL_MS);
  logger.info("QBO proactive token refresh scheduler started");
}
