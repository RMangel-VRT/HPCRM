import { google } from "googleapis";
import { db } from "../db";
import { mailboxAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

function requireEnv() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured. Contact your administrator.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export function getOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = requireEnv();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function generateAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
}

export function generateStateToken(mailboxAccountId: string): { state: string; randomPart: string } {
  const randomPart = randomBytes(16).toString("hex");
  const state = `${mailboxAccountId}:${randomPart}`;
  return { state, randomPart };
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Could not retrieve email from Google userinfo");
  return data.email;
}

export async function getValidAccessToken(mailboxAccountId: string): Promise<string> {
  const [account] = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.id, mailboxAccountId));

  if (!account) throw new Error("Mailbox account not found");
  if (!account.oauthTokenJson) throw new Error("No OAuth tokens stored for this mailbox");

  const tokenData = account.oauthTokenJson as {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
    scope?: string;
    token_type?: string;
    connected_at?: string;
    connected_email?: string;
  };

  const bufferMs = 60 * 1000;
  const nowMs = Date.now();
  const isExpired = tokenData.expiry_date && tokenData.expiry_date - bufferMs < nowMs;

  if (!isExpired && tokenData.access_token) {
    return tokenData.access_token;
  }

  if (!tokenData.refresh_token) {
    await db
      .update(mailboxAccounts)
      .set({ syncStatus: "error", updatedAt: new Date() })
      .where(eq(mailboxAccounts.id, mailboxAccountId));
    throw new Error("OAuth token expired and no refresh token is available. Please reconnect Gmail.");
  }

  try {
    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: tokenData.refresh_token });
    const { credentials } = await client.refreshAccessToken();

    const updatedToken = {
      ...tokenData,
      access_token: credentials.access_token!,
      expiry_date: credentials.expiry_date ?? undefined,
      token_type: credentials.token_type ?? tokenData.token_type,
    };

    await db
      .update(mailboxAccounts)
      .set({ oauthTokenJson: updatedToken, updatedAt: new Date() })
      .where(eq(mailboxAccounts.id, mailboxAccountId));

    return updatedToken.access_token!;
  } catch (err) {
    await db
      .update(mailboxAccounts)
      .set({ syncStatus: "error", updatedAt: new Date() })
      .where(eq(mailboxAccounts.id, mailboxAccountId));
    throw new Error("Failed to refresh OAuth token. Please reconnect Gmail.");
  }
}

export async function revokeTokens(mailboxAccountId: string): Promise<void> {
  const [account] = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.id, mailboxAccountId));

  if (account?.oauthTokenJson) {
    const tokenData = account.oauthTokenJson as { access_token?: string; refresh_token?: string };
    const client = getOAuth2Client();
    // Prefer revoking refresh_token (invalidates the full grant); fall back to access_token
    const tokenToRevoke = tokenData.refresh_token ?? tokenData.access_token;
    if (tokenToRevoke) {
      try {
        await client.revokeToken(tokenToRevoke);
      } catch {
        // Revocation failure is non-fatal — local disconnect always proceeds
      }
    }
  }

  await db
    .update(mailboxAccounts)
    .set({
      oauthTokenJson: null,
      syncEnabled: false,
      syncStatus: "not_connected",
      oauthProvider: null,
      lastSyncedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(mailboxAccounts.id, mailboxAccountId));
}
