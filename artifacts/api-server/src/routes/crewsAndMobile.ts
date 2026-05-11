import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { crews, users, companyUsers, insertCrewSchema } from "@workspace/db";
import {
  authenticateMobileLogin,
  issueMobileToken,
  requireMobileAuth,
  revokeTokenByHash,
  MOBILE_ALLOWED_ROLES,
} from "../mobileAuth";
import type { UserWithContext } from "../auth";

const crewBodySchema = insertCrewSchema.omit({ companyId: true });
const crewPatchSchema = crewBodySchema.partial();

// Postgres unique-constraint violation; surfaced via the `code` field on the
// driver error. We narrow safely from `unknown` rather than reaching for `any`.
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "23505"
  );
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceLabel: z.string().max(120).optional(),
});

function adminOrOffice(req: Request, res: Response): UserWithContext | null {
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

async function listCrewsWithSupervisor(companyId: string) {
  const rows = await db
    .select({
      crew: crews,
      supervisorName: users.name,
      supervisorEmail: users.email,
    })
    .from(crews)
    .leftJoin(users, eq(crews.supervisorUserId, users.id))
    .where(eq(crews.companyId, companyId))
    .orderBy(asc(crews.name));
  return rows.map((r) => ({
    ...r.crew,
    supervisorName: r.supervisorName ?? null,
    supervisorEmail: r.supervisorEmail ?? null,
  }));
}

export function registerCrewsAndMobileRoutes(app: Express): void {
  // ---------- Web admin: /api/crews ----------
  app.get("/api/crews", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const list = await listCrewsWithSupervisor(u.activeCompanyId);
    res.json(list);
  });

  app.post("/api/crews", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const parsed = crewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid crew", errors: parsed.error.flatten() });
      return;
    }

    // Verify supervisor exists in this company with an allowed supervisor role.
    const [supervisorMembership] = await db
      .select()
      .from(companyUsers)
      .where(and(
        eq(companyUsers.userId, parsed.data.supervisorUserId),
        eq(companyUsers.companyId, u.activeCompanyId),
        eq(companyUsers.status, "active"),
      ));
    if (!supervisorMembership) {
      res.status(400).json({ message: "Supervisor must be an active member of this company" });
      return;
    }
    if (!MOBILE_ALLOWED_ROLES.has(supervisorMembership.role)) {
      res.status(400).json({
        message:
          "Supervisor must hold a supervisor role (crew_supervisor, field_manager, or landscape_supervisor)",
      });
      return;
    }

    try {
      const [created] = await db
        .insert(crews)
        .values({ ...parsed.data, companyId: u.activeCompanyId })
        .returning();
      res.status(201).json(created);
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        res.status(409).json({ message: "A crew with this name already exists" });
        return;
      }
      throw e;
    }
  });

  app.patch("/api/crews/:id", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const parsed = crewPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid crew", errors: parsed.error.flatten() });
      return;
    }
    if (parsed.data.supervisorUserId) {
      const [m] = await db
        .select()
        .from(companyUsers)
        .where(and(
          eq(companyUsers.userId, parsed.data.supervisorUserId),
          eq(companyUsers.companyId, u.activeCompanyId),
          eq(companyUsers.status, "active"),
        ));
      if (!m || !MOBILE_ALLOWED_ROLES.has(m.role)) {
        res.status(400).json({ message: "Supervisor must hold a supervisor role" });
        return;
      }
    }
    try {
      const [updated] = await db
        .update(crews)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(crews.id, req.params.id), eq(crews.companyId, u.activeCompanyId)))
        .returning();
      if (!updated) {
        res.status(404).json({ message: "Not found" });
        return;
      }
      res.json(updated);
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        res.status(409).json({ message: "A crew with this name already exists" });
        return;
      }
      throw e;
    }
  });

  app.delete("/api/crews/:id", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const result = await db
      .delete(crews)
      .where(and(eq(crews.id, req.params.id), eq(crews.companyId, u.activeCompanyId)))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.sendStatus(204);
  });

  // Helper for the admin dialog: list users in this company who can be supervisors.
  app.get("/api/crews/eligible-supervisors", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const allowed = Array.from(MOBILE_ALLOWED_ROLES);
    const memberships = await db
      .select({ userId: companyUsers.userId, role: companyUsers.role })
      .from(companyUsers)
      .where(and(
        eq(companyUsers.companyId, u.activeCompanyId),
        eq(companyUsers.status, "active"),
        sql`${companyUsers.role} = ANY(${allowed})`,
      ));
    if (memberships.length === 0) {
      res.json([]);
      return;
    }
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(inArray(users.id, memberships.map((m) => m.userId)));
    const roleMap = new Map(memberships.map((m) => [m.userId, m.role]));
    res.json(userRows.map((ur) => ({ ...ur, role: roleMap.get(ur.id) })));
  });

  // ---------- Mobile bearer-token auth: /api/m/* ----------
  app.post("/api/m/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    const result = await authenticateMobileLogin(parsed.data.username, parsed.data.password);
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }
    const { rawToken, expiresAt } = await issueMobileToken(
      result.user.id,
      result.companyId,
      parsed.data.deviceLabel ?? null,
    );
    res.json({
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        language: result.user.language,
        activeCompanyId: result.companyId,
        activeRole: result.role,
      },
    });
  });

  app.post("/api/m/auth/logout", requireMobileAuth(), async (req, res) => {
    if (req.mobileTokenHash) {
      await revokeTokenByHash(req.mobileTokenHash);
    }
    res.sendStatus(204);
  });

  app.get("/api/m/me", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      language: u.language,
      activeCompanyId: u.activeCompanyId,
      activeRole: u.activeRole,
      isSuperAdminBool: u.isSuperAdminBool,
    });
  });
}
