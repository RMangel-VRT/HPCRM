import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "./db";
import { mobileAuthTokens, users, companyUsers } from "@workspace/db";
import type { UserWithContext } from "./auth";

const scryptAsync = promisify(scrypt);

// Roles allowed to use the mobile field-crew app.
export const MOBILE_ALLOWED_ROLES = new Set<string>([
  "crew_supervisor",
  "field_manager",
  "landscape_supervisor",
]);

const TOKEN_BYTES = 32;
const INACTIVITY_DAYS = 90;

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function tokenExpiryFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INACTIVITY_DAYS);
  return d;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function findUserByLogin(login: string) {
  const lookup = login.includes("@")
    ? eq(users.email, login.toLowerCase())
    : eq(users.phone, login);
  const [u] = await db.select().from(users).where(lookup);
  return u;
}

export async function authenticateMobileLogin(
  username: string,
  password: string,
): Promise<
  | { ok: true; user: typeof users.$inferSelect; companyId: string; role: string }
  | { ok: false; status: 401 | 403; message: string }
> {
  const user = await findUserByLogin(username);
  if (!user) {
    return { ok: false, status: 401, message: "Invalid credentials" };
  }
  const passOk = await comparePasswords(password, user.passwordHash);
  if (!passOk) {
    return { ok: false, status: 401, message: "Invalid credentials" };
  }

  // Find an active company membership for this user. Mobile login picks the
  // first active membership (matches web auth behavior).
  const memberships = await db
    .select()
    .from(companyUsers)
    .where(and(eq(companyUsers.userId, user.id), eq(companyUsers.status, "active")));

  if (memberships.length === 0) {
    return {
      ok: false,
      status: 403,
      message: "Mobile access is for crew supervisors. Contact your admin.",
    };
  }

  const membership = memberships[0];
  if (!MOBILE_ALLOWED_ROLES.has(membership.role)) {
    return {
      ok: false,
      status: 403,
      message: "Mobile access is for crew supervisors. Contact your admin.",
    };
  }

  return {
    ok: true,
    user,
    companyId: membership.companyId,
    role: membership.role,
  };
}

export async function issueMobileToken(
  userId: string,
  companyId: string,
  deviceLabel: string | null,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = tokenExpiryFromNow();
  await db.insert(mobileAuthTokens).values({
    userId,
    companyId,
    tokenHash,
    deviceLabel: deviceLabel ?? null,
    expiresAt,
  });
  return { rawToken, expiresAt };
}

export async function revokeTokenByHash(tokenHash: string): Promise<void> {
  await db
    .update(mobileAuthTokens)
    .set({ revokedAt: new Date() })
    .where(eq(mobileAuthTokens.tokenHash, tokenHash));
}

declare global {
  namespace Express {
    interface Request {
      mobileTokenHash?: string;
    }
  }
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization || req.headers.Authorization;
  if (typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function requireMobileAuth() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = extractBearer(req);
    if (!raw) {
      res.status(401).json({ message: "Missing bearer token" });
      return;
    }
    const tokenHash = hashToken(raw);
    const [tokenRow] = await db
      .select()
      .from(mobileAuthTokens)
      .where(and(eq(mobileAuthTokens.tokenHash, tokenHash), isNull(mobileAuthTokens.revokedAt)));
    if (!tokenRow) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }
    if (tokenRow.expiresAt.getTime() < Date.now()) {
      res.status(401).json({ message: "Token expired" });
      return;
    }

    const [u] = await db.select().from(users).where(eq(users.id, tokenRow.userId));
    if (!u) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    const memberships = await db
      .select()
      .from(companyUsers)
      .where(and(eq(companyUsers.userId, u.id), eq(companyUsers.companyId, tokenRow.companyId)));
    const membership = memberships[0];
    if (!membership || membership.status !== "active") {
      res.status(403).json({ message: "Membership inactive" });
      return;
    }
    if (!MOBILE_ALLOWED_ROLES.has(membership.role)) {
      res.status(403).json({ message: "Mobile access not permitted" });
      return;
    }

    // Refresh lastUsedAt + extend expiry on activity (sliding window).
    const newExpiry = tokenExpiryFromNow();
    await db
      .update(mobileAuthTokens)
      .set({ lastUsedAt: new Date(), expiresAt: newExpiry })
      .where(eq(mobileAuthTokens.id, tokenRow.id));

    const userWithContext: UserWithContext = {
      ...u,
      activeCompanyId: tokenRow.companyId,
      activeRole: membership.role as UserWithContext["activeRole"],
      isSuperAdminBool: u.isSuperAdmin === "true",
    };
    req.user = userWithContext;
    req.mobileTokenHash = tokenHash;
    next();
  };
}
