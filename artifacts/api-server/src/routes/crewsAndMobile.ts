import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  crews,
  users,
  companyUsers,
  customers,
  tickets,
  insertCrewSchema,
  ticketWorkItems,
  serviceTypeTemplates,
  serviceTypeTemplateItems,
  insertServiceTypeTemplateSchema,
  insertServiceTypeTemplateItemSchema,
  propertySiteNotes,
  insertPropertySiteNoteSchema,
  contacts,
  contracts,
  visualScopeSheets,
  recentPropertyViews,
  ticketTypes,
  ticketTypeStatuses,
} from "@workspace/db";
import { getSiteNotesForProperty, serializeSiteNote } from "../services/site-notes";
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

  // ---------- Mobile v1 Slice 1: Today screen ----------
  // Resolve the supervisor's current crew (their first active crew in this company).
  async function resolveSupervisorCrewId(userId: string, companyId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: crews.id })
      .from(crews)
      .where(and(
        eq(crews.companyId, companyId),
        eq(crews.supervisorUserId, userId),
        eq(crews.isActive, true),
      ))
      .orderBy(asc(crews.createdAt))
      .limit(1);
    return row?.id ?? null;
  }

  app.get("/api/m/today", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);

    // "Today" in the server's local timezone — good enough for v1; the field
    // crew lives in one geography (Colorado) so server-local matches their day.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    if (!crewId) {
      res.json({
        date: dayStart.toISOString().slice(0, 10),
        crewId: null,
        crewName: null,
        summary: { total: 0, notStarted: 0, inProgress: 0, complete: 0, skipped: 0, flagged: 0 },
        stops: [],
      });
      return;
    }

    const [crewRow] = await db
      .select({ name: crews.name })
      .from(crews)
      .where(eq(crews.id, crewId));

    // Slice 2 acceptance: completed stops disappear from Today as soon as the
    // crew marks them done. Server-side filter is the source of truth so the
    // client can't accidentally show stale completed rows.
    const rows = await db
      .select({
        ticket: tickets,
        customerName: customers.name,
        customerStreet: customers.street,
        customerCity: customers.city,
        customerState: customers.state,
        customerZip: customers.zip,
      })
      .from(tickets)
      .leftJoin(customers, eq(tickets.customerId, customers.id))
      .where(and(
        eq(tickets.companyId, u.activeCompanyId),
        eq(tickets.crewId, crewId),
        gte(tickets.dueDate, dayStart),
        lt(tickets.dueDate, dayEnd),
        sql`COALESCE(${tickets.mobileStatus}, 'not_started') <> 'complete'`,
      ))
      .orderBy(
        // routeOrder asc nulls-last, then dueDate asc, then title for stable ordering
        sql`${tickets.routeOrder} ASC NULLS LAST`,
        asc(tickets.dueDate),
        asc(tickets.title),
      );

    const summary = { total: rows.length, notStarted: 0, inProgress: 0, complete: 0, skipped: 0, flagged: 0 };
    for (const r of rows) {
      const s = r.ticket.mobileStatus ?? "not_started";
      if (s === "not_started") summary.notStarted++;
      else if (s === "in_progress") summary.inProgress++;
      else if (s === "complete") summary.complete++;
      else if (s === "skipped") summary.skipped++;
      else if (s === "flagged") summary.flagged++;
    }

    const stops = rows.map((r) => ({
      id: r.ticket.id,
      title: r.ticket.title,
      priority: r.ticket.priority,
      mobileStatus: r.ticket.mobileStatus ?? "not_started",
      routeOrder: r.ticket.routeOrder,
      dueDate: r.ticket.dueDate ? r.ticket.dueDate.toISOString() : null,
      startedAt: r.ticket.startedAt ? r.ticket.startedAt.toISOString() : null,
      completedAt: r.ticket.completedAt ? r.ticket.completedAt.toISOString() : null,
      customerName: r.customerName ?? null,
      customerAddress: r.customerStreet
        ? `${r.customerStreet}, ${r.customerCity ?? ""} ${r.customerState ?? ""} ${r.customerZip ?? ""}`.replace(/\s+/g, " ").trim()
        : null,
      locationLabel: r.ticket.locationLabel ?? null,
    }));

    res.json({
      date: dayStart.toISOString().slice(0, 10),
      crewId,
      crewName: crewRow?.name ?? null,
      summary,
      stops,
    });
  });

  app.post("/api/m/tickets/:id/start", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);
    if (!crewId) {
      res.status(403).json({ message: "You are not currently assigned to a crew." });
      return;
    }

    const ticketId = String(req.params.id);
    const [t] = await db
      .select()
      .from(tickets)
      .where(and(
        eq(tickets.id, ticketId),
        eq(tickets.companyId, u.activeCompanyId),
        eq(tickets.crewId, crewId),
      ));
    if (!t) {
      res.status(404).json({ message: "Ticket not found for your crew" });
      return;
    }

    // Idempotent: if already started, return current state. Otherwise flip
    // not_started → in_progress and stamp startedAt.
    if (t.mobileStatus === "not_started") {
      const [updated] = await db
        .update(tickets)
        .set({
          mobileStatus: "in_progress",
          startedAt: t.startedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, t.id))
        .returning();
      res.json({
        id: updated.id,
        mobileStatus: updated.mobileStatus,
        startedAt: updated.startedAt ? updated.startedAt.toISOString() : null,
      });
      return;
    }

    res.json({
      id: t.id,
      mobileStatus: t.mobileStatus,
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
    });
  });

  // ---------- Mobile v1 Slice 2: ticket detail + work items + complete ----------

  // Helper: load a ticket (scoped to the caller's crew + company) joined with
  // the customer row that backs the curated site-notes block.
  async function loadMobileTicket(ticketId: string, companyId: string, crewId: string) {
    const [row] = await db
      .select({ ticket: tickets, customer: customers })
      .from(tickets)
      .leftJoin(customers, eq(tickets.customerId, customers.id))
      .where(and(
        eq(tickets.id, ticketId),
        eq(tickets.companyId, companyId),
        eq(tickets.crewId, crewId),
      ));
    return row ?? null;
  }

  function buildAddress(c: { street: string | null; city: string | null; state: string | null; zip: string | null } | null): string | null {
    if (!c || !c.street) return null;
    return `${c.street}, ${c.city ?? ""} ${c.state ?? ""} ${c.zip ?? ""}`.replace(/\s+/g, " ").trim();
  }

  async function listWorkItems(ticketId: string) {
    return db
      .select()
      .from(ticketWorkItems)
      .where(eq(ticketWorkItems.ticketId, ticketId))
      .orderBy(asc(ticketWorkItems.sortOrder), asc(ticketWorkItems.createdAt));
  }

  function serializeWorkItem(w: typeof ticketWorkItems.$inferSelect) {
    return {
      id: w.id,
      ticketId: w.ticketId,
      label: w.label,
      instruction: w.instruction,
      photoRequired: w.photoRequired,
      sortOrder: w.sortOrder,
      isRequired: w.isRequired,
      isComplete: w.isComplete,
      completedAt: w.completedAt ? w.completedAt.toISOString() : null,
      completedById: w.completedById,
      skipReason: w.skipReason,
      skipNote: w.skipNote,
    };
  }

  app.get("/api/m/tickets/:id", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);
    // Two-tier read access:
    //   1. Tickets on the supervisor's current crew → fully editable (mutation
    //      routes below also enforce the crew check).
    //   2. Otherwise, allow READ access to any company-scoped ticket that is
    //      already completed (so the property History tab in Slice 5 can open
    //      cross-crew / older visits without 404). The response carries
    //      `readOnly: true` so the mobile UI hides start/complete/edit
    //      affordances; mutation endpoints still 403/404 by crew.
    let row = crewId ? await loadMobileTicket(String(req.params.id), u.activeCompanyId, crewId) : null;
    let readOnly = false;
    if (!row) {
      const [completedRow] = await db
        .select({ ticket: tickets, customer: customers })
        .from(tickets)
        .leftJoin(customers, eq(tickets.customerId, customers.id))
        .where(and(
          eq(tickets.id, String(req.params.id)),
          eq(tickets.companyId, u.activeCompanyId),
          sql`${tickets.completedAt} is not null`,
        ));
      if (completedRow) {
        row = completedRow;
        readOnly = true;
      }
    }
    if (!row) {
      res.status(404).json({ message: "Ticket not found" });
      return;
    }
    const t = row.ticket;
    const c = row.customer;
    const items = await listWorkItems(t.id);
    // Curated site notes: filtered to the ticket's serviceType (plus globals).
    const siteNotes = c
      ? await getSiteNotesForProperty(c.id, t.serviceType ?? null)
      : [];
    res.json({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      mobileStatus: t.mobileStatus ?? "not_started",
      serviceType: t.serviceType,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      completionNotes: t.completionNotes ?? null,
      completionOverrideNote: t.completionOverrideNote ?? null,
      locationLabel: t.locationLabel,
      locationLat: t.locationLat,
      locationLng: t.locationLng,
      customer: c
        ? {
            id: c.id,
            name: c.name,
            address: buildAddress(c),
            locationLat: c.locationLat,
            locationLng: c.locationLng,
          }
        : null,
      siteNotes: siteNotes.map(serializeSiteNote),
      workItems: items.map(serializeWorkItem),
      // Photos and free-form notes land in Slices 3 / 4 — return zeros so
      // the mobile UI can render the section stubs ("Photos (0)", "Notes (0)")
      // without a contract change later.
      photosCount: 0,
      notesCount: 0,
      // True when the supervisor is viewing a cross-crew completed ticket
      // (Slice 5 property history). Mobile UI uses this to hide mutation
      // controls; mutation routes still enforce crew scoping server-side.
      readOnly,
    });
  });

  // Allowed skip reason chip codes; the mobile UI presents these as a chip
  // group and adds an optional `skipNote` follow-up text. "other" requires a
  // note (enforced below).
  // Per Slice 2 task contract — chip taxonomy is fixed at:
  //   out_of_supplies, inaccessible, weather, customer_request, other
  // (any UI changes here must also be reflected in the OpenAPI enum
  // `MobileWorkItemSkipReason` and the mobile chip codes.)
  const SKIP_REASON_CODES = [
    "out_of_supplies",
    "inaccessible",
    "weather",
    "customer_request",
    "other",
  ] as const;

  const workItemPatchSchema = z
    .object({
      isComplete: z.boolean().optional(),
      skipReason: z.enum(SKIP_REASON_CODES).nullable().optional(),
      skipNote: z.string().max(2000).nullable().optional(),
    })
    .refine(
      (v) => !(v.skipReason === "other" && (!v.skipNote || v.skipNote.trim().length === 0)),
      { message: "skipNote is required when skipReason is 'other'", path: ["skipNote"] },
    );

  app.patch("/api/m/work-items/:id", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);
    if (!crewId) {
      res.status(403).json({ message: "You are not currently assigned to a crew." });
      return;
    }
    const parsed = workItemPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      return;
    }

    // Verify the work item belongs to a ticket on the caller's crew.
    const [row] = await db
      .select({ wi: ticketWorkItems, t: tickets })
      .from(ticketWorkItems)
      .innerJoin(tickets, eq(ticketWorkItems.ticketId, tickets.id))
      .where(and(
        eq(ticketWorkItems.id, String(req.params.id)),
        eq(tickets.companyId, u.activeCompanyId),
        eq(tickets.crewId, crewId),
      ));
    if (!row) {
      res.status(404).json({ message: "Work item not found for your crew" });
      return;
    }

    const now = new Date();
    const next: Partial<typeof ticketWorkItems.$inferInsert> = { updatedAt: now };
    if (parsed.data.isComplete !== undefined) {
      next.isComplete = parsed.data.isComplete;
      if (parsed.data.isComplete) {
        next.completedAt = now;
        next.completedById = u.id;
        // Completing clears any prior skip reason + note.
        next.skipReason = null;
        next.skipNote = null;
      } else {
        next.completedAt = null;
        next.completedById = null;
      }
    }
    if (parsed.data.skipReason !== undefined) {
      next.skipReason = parsed.data.skipReason;
      // Skipping (non-null reason) implies the item is not complete.
      if (parsed.data.skipReason && parsed.data.isComplete !== true) {
        next.isComplete = false;
        next.completedAt = null;
        next.completedById = null;
      }
      // Clearing the reason also clears the follow-up note.
      if (parsed.data.skipReason === null) next.skipNote = null;
    }
    if (parsed.data.skipNote !== undefined) {
      next.skipNote = parsed.data.skipNote;
    }

    const [updated] = await db
      .update(ticketWorkItems)
      .set(next)
      .where(eq(ticketWorkItems.id, row.wi.id))
      .returning();
    res.json(serializeWorkItem(updated));
  });

  const completeBodySchema = z.object({
    completionNotes: z.string().max(5000).optional(),
    overrideMissing: z.boolean().optional(),
    overrideNote: z.string().max(2000).optional(),
  });

  app.post("/api/m/tickets/:id/complete", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const crewId = await resolveSupervisorCrewId(u.id, u.activeCompanyId);
    if (!crewId) {
      res.status(403).json({ message: "You are not currently assigned to a crew." });
      return;
    }
    const parsed = completeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      return;
    }

    const row = await loadMobileTicket(String(req.params.id), u.activeCompanyId, crewId);
    if (!row) {
      res.status(404).json({ message: "Ticket not found for your crew" });
      return;
    }
    const t = row.ticket;

    // Soft-confirmation: list any required work items that are neither complete
    // nor skipped-with-reason. The mobile UI shows a confirmation sheet listing
    // these and re-submits with `overrideMissing: true` plus a non-empty
    // `overrideNote` explaining why the supervisor is forcing completion.
    const items = await listWorkItems(t.id);
    const missing = items.filter(
      (w) => w.isRequired && !w.isComplete && !(w.skipReason && w.skipReason.trim().length > 0),
    );
    if (missing.length > 0) {
      if (!parsed.data.overrideMissing) {
        res.status(409).json({
          code: "MISSING_REQUIRED",
          message: "Some required items are not complete.",
          missing: missing.map(serializeWorkItem),
        });
        return;
      }
      const note = (parsed.data.overrideNote ?? "").trim();
      if (note.length === 0) {
        res.status(400).json({
          code: "OVERRIDE_NOTE_REQUIRED",
          message: "An override note is required to complete with missing required items.",
        });
        return;
      }
    }

    const now = new Date();
    const overrideNote = (parsed.data.overrideNote ?? "").trim();
    const [updated] = await db
      .update(tickets)
      .set({
        mobileStatus: "complete",
        completedAt: t.completedAt ?? now,
        completedByUserId: u.id,
        completionNotes: parsed.data.completionNotes ?? t.completionNotes ?? null,
        completionOverrideNote:
          missing.length > 0 && parsed.data.overrideMissing
            ? overrideNote
            : t.completionOverrideNote ?? null,
        updatedAt: now,
      })
      .where(eq(tickets.id, t.id))
      .returning();
    res.json({
      id: updated.id,
      mobileStatus: updated.mobileStatus,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      completionNotes: updated.completionNotes ?? null,
      completionOverrideNote: updated.completionOverrideNote ?? null,
    });
  });

  // ---------- Web admin: Property site notes ----------
  async function ensureAdminCustomerAccess(
    req: Request,
    res: Response,
    customerId: string,
  ): Promise<UserWithContext | null> {
    const u = adminOrOffice(req, res);
    if (!u) return null;
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, u.activeCompanyId)));
    if (!row) {
      res.status(404).json({ message: "Property not found" });
      return null;
    }
    return u;
  }

  app.get("/api/customers/:id/site-notes", async (req, res) => {
    const u = await ensureAdminCustomerAccess(req, res, req.params.id);
    if (!u) return;
    const list = await db
      .select()
      .from(propertySiteNotes)
      .where(eq(propertySiteNotes.customerId, req.params.id))
      .orderBy(asc(propertySiteNotes.sortOrder), asc(propertySiteNotes.label));
    res.json(list);
  });

  const siteNoteBodySchema = insertPropertySiteNoteSchema.omit({ companyId: true, customerId: true });

  app.post("/api/customers/:id/site-notes", async (req, res) => {
    const u = await ensureAdminCustomerAccess(req, res, req.params.id);
    if (!u) return;
    const parsed = siteNoteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid site note", errors: parsed.error.flatten() });
      return;
    }
    const [created] = await db
      .insert(propertySiteNotes)
      .values({ ...parsed.data, companyId: u.activeCompanyId, customerId: req.params.id })
      .returning();
    res.status(201).json(created);
  });

  app.patch("/api/customers/:customerId/site-notes/:id", async (req, res) => {
    const u = await ensureAdminCustomerAccess(req, res, req.params.customerId);
    if (!u) return;
    const parsed = siteNoteBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid site note", errors: parsed.error.flatten() });
      return;
    }
    const [updated] = await db
      .update(propertySiteNotes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(
        eq(propertySiteNotes.id, req.params.id),
        eq(propertySiteNotes.customerId, req.params.customerId),
      ))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.json(updated);
  });

  app.delete("/api/customers/:customerId/site-notes/:id", async (req, res) => {
    const u = await ensureAdminCustomerAccess(req, res, req.params.customerId);
    if (!u) return;
    const result = await db
      .delete(propertySiteNotes)
      .where(and(
        eq(propertySiteNotes.id, req.params.id),
        eq(propertySiteNotes.customerId, req.params.customerId),
      ))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.sendStatus(204);
  });

  // ---------- Web admin: Service-type templates + items ----------
  app.get("/api/service-type-templates", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const list = await db
      .select()
      .from(serviceTypeTemplates)
      .where(eq(serviceTypeTemplates.companyId, u.activeCompanyId))
      .orderBy(asc(serviceTypeTemplates.serviceType), asc(serviceTypeTemplates.name));

    // Hydrate each template with its items so the admin UI gets one round-trip.
    const ids = list.map((t) => t.id);
    const itemsByTemplate = new Map<string, Array<typeof serviceTypeTemplateItems.$inferSelect>>();
    if (ids.length > 0) {
      const allItems = await db
        .select()
        .from(serviceTypeTemplateItems)
        .where(inArray(serviceTypeTemplateItems.templateId, ids))
        .orderBy(asc(serviceTypeTemplateItems.displayOrder), asc(serviceTypeTemplateItems.label));
      for (const it of allItems) {
        const arr = itemsByTemplate.get(it.templateId) ?? [];
        arr.push(it);
        itemsByTemplate.set(it.templateId, arr);
      }
    }
    res.json(
      list.map((t) => ({
        id: t.id,
        companyId: t.companyId,
        serviceType: t.serviceType,
        name: t.name,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        items: (itemsByTemplate.get(t.id) ?? []).map((i) => ({
          id: i.id,
          templateId: i.templateId,
          label: i.label,
          defaultInstruction: i.defaultInstruction,
          photoRequired: i.photoRequired,
          isRequired: i.isRequired,
          displayOrder: i.displayOrder,
          isActive: i.isActive,
        })),
      })),
    );
  });

  const templateBodySchema = insertServiceTypeTemplateSchema.omit({ companyId: true });

  app.post("/api/service-type-templates", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const parsed = templateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid template", errors: parsed.error.flatten() });
      return;
    }
    const [created] = await db
      .insert(serviceTypeTemplates)
      .values({ ...parsed.data, companyId: u.activeCompanyId })
      .returning();
    res.status(201).json(created);
  });

  app.patch("/api/service-type-templates/:id", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const parsed = templateBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid template", errors: parsed.error.flatten() });
      return;
    }
    const [updated] = await db
      .update(serviceTypeTemplates)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(
        eq(serviceTypeTemplates.id, req.params.id),
        eq(serviceTypeTemplates.companyId, u.activeCompanyId),
      ))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.json(updated);
  });

  app.delete("/api/service-type-templates/:id", async (req, res) => {
    const u = adminOrOffice(req, res);
    if (!u) return;
    const result = await db
      .delete(serviceTypeTemplates)
      .where(and(
        eq(serviceTypeTemplates.id, req.params.id),
        eq(serviceTypeTemplates.companyId, u.activeCompanyId),
      ))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.sendStatus(204);
  });

  // Template items sub-resource.
  async function ensureTemplateAccess(
    req: Request,
    res: Response,
    templateId: string,
  ): Promise<UserWithContext | null> {
    const u = adminOrOffice(req, res);
    if (!u) return null;
    const [row] = await db
      .select({ id: serviceTypeTemplates.id })
      .from(serviceTypeTemplates)
      .where(and(
        eq(serviceTypeTemplates.id, templateId),
        eq(serviceTypeTemplates.companyId, u.activeCompanyId),
      ));
    if (!row) {
      res.status(404).json({ message: "Template not found" });
      return null;
    }
    return u;
  }

  const templateItemBodySchema = insertServiceTypeTemplateItemSchema.omit({ templateId: true });

  app.post("/api/service-type-templates/:id/items", async (req, res) => {
    const u = await ensureTemplateAccess(req, res, req.params.id);
    if (!u) return;
    const parsed = templateItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid item", errors: parsed.error.flatten() });
      return;
    }
    let displayOrder = parsed.data.displayOrder;
    if (displayOrder === undefined || displayOrder === 0) {
      const existing = await db
        .select({ id: serviceTypeTemplateItems.id })
        .from(serviceTypeTemplateItems)
        .where(eq(serviceTypeTemplateItems.templateId, req.params.id));
      displayOrder = existing.length;
    }
    const [created] = await db
      .insert(serviceTypeTemplateItems)
      .values({ ...parsed.data, displayOrder, templateId: req.params.id })
      .returning();
    res.status(201).json(created);
  });

  app.patch("/api/service-type-templates/:templateId/items/:id", async (req, res) => {
    const u = await ensureTemplateAccess(req, res, req.params.templateId);
    if (!u) return;
    const parsed = templateItemBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid item", errors: parsed.error.flatten() });
      return;
    }
    const [updated] = await db
      .update(serviceTypeTemplateItems)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(
        eq(serviceTypeTemplateItems.id, req.params.id),
        eq(serviceTypeTemplateItems.templateId, req.params.templateId),
      ))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.json(updated);
  });

  app.delete("/api/service-type-templates/:templateId/items/:id", async (req, res) => {
    const u = await ensureTemplateAccess(req, res, req.params.templateId);
    if (!u) return;
    const result = await db
      .delete(serviceTypeTemplateItems)
      .where(and(
        eq(serviceTypeTemplateItems.id, req.params.id),
        eq(serviceTypeTemplateItems.templateId, req.params.templateId),
      ))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.sendStatus(204);
  });

  // Bulk-reorder template items in a single request — accepts an array of
  // `{id, displayOrder}` and updates each row inside one transaction so the
  // drag-to-reorder UX is atomic.
  const reorderSchema = z.object({
    items: z.array(z.object({ id: z.string().min(1), displayOrder: z.number().int().min(0) })).min(1),
  });
  app.post("/api/service-type-templates/:id/items/reorder", async (req, res) => {
    const u = await ensureTemplateAccess(req, res, req.params.id);
    if (!u) return;
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid reorder", errors: parsed.error.flatten() });
      return;
    }
    await db.transaction(async (tx) => {
      for (const it of parsed.data.items) {
        await tx
          .update(serviceTypeTemplateItems)
          .set({ displayOrder: it.displayOrder, updatedAt: new Date() })
          .where(and(
            eq(serviceTypeTemplateItems.id, it.id),
            eq(serviceTypeTemplateItems.templateId, req.params.id),
          ));
      }
    });
    res.sendStatus(204);
  });

  // ---------- Web admin: Ticket work items (CRUD + load-from-template + reorder) ----------
  async function ensureAdminTicketAccess(req: Request, res: Response, ticketId: string): Promise<UserWithContext | null> {
    const u = adminOrOffice(req, res);
    if (!u) return null;
    const [row] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.companyId, u.activeCompanyId)));
    if (!row) {
      res.status(404).json({ message: "Ticket not found" });
      return null;
    }
    return u;
  }

  app.get("/api/tickets/:id/work-items", async (req, res) => {
    const u = await ensureAdminTicketAccess(req, res, req.params.id);
    if (!u) return;
    const items = await listWorkItems(req.params.id);
    res.json(items.map(serializeWorkItem));
  });

  const adminWorkItemBodySchema = z.object({
    label: z.string().min(1).max(500),
    instruction: z.string().max(2000).nullable().optional(),
    photoRequired: z.boolean().optional().default(false),
    isRequired: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(0).optional(),
  });

  app.post("/api/tickets/:id/work-items", async (req, res) => {
    const u = await ensureAdminTicketAccess(req, res, req.params.id);
    if (!u) return;
    const parsed = adminWorkItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid work item", errors: parsed.error.flatten() });
      return;
    }
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const existing = await listWorkItems(req.params.id);
      sortOrder = existing.length;
    }
    const [created] = await db
      .insert(ticketWorkItems)
      .values({
        ticketId: req.params.id,
        label: parsed.data.label,
        instruction: parsed.data.instruction ?? null,
        photoRequired: parsed.data.photoRequired ?? false,
        isRequired: parsed.data.isRequired ?? false,
        sortOrder,
      })
      .returning();
    res.status(201).json(serializeWorkItem(created));
  });

  const adminWorkItemPatchSchema = z.object({
    label: z.string().min(1).max(500).optional(),
    instruction: z.string().max(2000).nullable().optional(),
    photoRequired: z.boolean().optional(),
    isRequired: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  });

  app.patch("/api/tickets/:ticketId/work-items/:id", async (req, res) => {
    const u = await ensureAdminTicketAccess(req, res, req.params.ticketId);
    if (!u) return;
    const parsed = adminWorkItemPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid work item", errors: parsed.error.flatten() });
      return;
    }
    const [updated] = await db
      .update(ticketWorkItems)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(
        eq(ticketWorkItems.id, req.params.id),
        eq(ticketWorkItems.ticketId, req.params.ticketId),
      ))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.json(serializeWorkItem(updated));
  });

  app.delete("/api/tickets/:ticketId/work-items/:id", async (req, res) => {
    const u = await ensureAdminTicketAccess(req, res, req.params.ticketId);
    if (!u) return;
    const result = await db
      .delete(ticketWorkItems)
      .where(and(
        eq(ticketWorkItems.id, req.params.id),
        eq(ticketWorkItems.ticketId, req.params.ticketId),
      ))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.sendStatus(204);
  });

  app.post("/api/tickets/:id/work-items/reorder", async (req, res) => {
    const u = await ensureAdminTicketAccess(req, res, req.params.id);
    if (!u) return;
    const parsed = z
      .object({ items: z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0) })).min(1) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid reorder", errors: parsed.error.flatten() });
      return;
    }
    await db.transaction(async (tx) => {
      for (const it of parsed.data.items) {
        await tx
          .update(ticketWorkItems)
          .set({ sortOrder: it.sortOrder, updatedAt: new Date() })
          .where(and(
            eq(ticketWorkItems.id, it.id),
            eq(ticketWorkItems.ticketId, req.params.id),
          ));
      }
    });
    res.sendStatus(204);
  });

  app.post("/api/tickets/:id/work-items/load-template", async (req, res) => {
    const u = await ensureAdminTicketAccess(req, res, req.params.id);
    if (!u) return;
    const schema = z.object({ templateId: z.string().min(1), replace: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      return;
    }
    const [tpl] = await db
      .select()
      .from(serviceTypeTemplates)
      .where(and(
        eq(serviceTypeTemplates.id, parsed.data.templateId),
        eq(serviceTypeTemplates.companyId, u.activeCompanyId),
      ));
    if (!tpl) {
      res.status(404).json({ message: "Template not found" });
      return;
    }
    // Read items from the new sub-resource table.
    const tplItems = await db
      .select()
      .from(serviceTypeTemplateItems)
      .where(and(
        eq(serviceTypeTemplateItems.templateId, tpl.id),
        eq(serviceTypeTemplateItems.isActive, true),
      ))
      .orderBy(asc(serviceTypeTemplateItems.displayOrder), asc(serviceTypeTemplateItems.label));
    if (parsed.data.replace) {
      await db.delete(ticketWorkItems).where(eq(ticketWorkItems.ticketId, req.params.id));
    }
    const existing = await listWorkItems(req.params.id);
    const startOrder = parsed.data.replace ? 0 : existing.length;
    if (tplItems.length === 0) {
      res.json([]);
      return;
    }
    const inserted = await db
      .insert(ticketWorkItems)
      .values(
        tplItems.map((it, i) => ({
          ticketId: req.params.id,
          label: it.label,
          instruction: it.defaultInstruction,
          photoRequired: it.photoRequired,
          isRequired: it.isRequired,
          sortOrder: startOrder + i,
        })),
      )
      .returning();
    res.status(201).json(inserted.map(serializeWorkItem));
  });

  // ---------- Mobile v1 Slice 5: Properties directory + profile ----------

  function buildCustomerAddress(c: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null): string | null {
    if (!c || !c.street) return null;
    return `${c.street}, ${c.city ?? ""} ${c.state ?? ""} ${c.zip ?? ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function serializePropertySummary(c: {
    id: string;
    name: string;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    customerType: "commercial" | "hoa" | null;
    ranking: "standard" | "preferred" | "key_account" | null;
  }) {
    return {
      id: c.id,
      name: c.name,
      address: buildCustomerAddress(c),
      city: c.city,
      state: c.state,
      customerType: c.customerType,
      ranking: c.ranking,
    };
  }

  // GET /api/m/properties?q=&limit=&recent=1
  // Default mode returns `{ recent, results }`. When `recent=1` is passed we
  // return ONLY the recent list (smaller payload for the "Recent" widget on
  // the Today screen). When `q` is empty we return the top N alphabetically
  // so the tab is useful even before the supervisor types anything.
  app.get("/api/m/properties", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const rawLimit = Number.parseInt((req.query.limit as string) ?? "50", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 50;
    const recentOnly = req.query.recent === "1" || req.query.recent === "true";

    const recentRows = await db
      .select({
        id: customers.id,
        name: customers.name,
        street: customers.street,
        city: customers.city,
        state: customers.state,
        zip: customers.zip,
        customerType: customers.customerType,
        ranking: customers.ranking,
        viewedAt: recentPropertyViews.viewedAt,
      })
      .from(recentPropertyViews)
      .innerJoin(customers, eq(recentPropertyViews.customerId, customers.id))
      .where(and(
        eq(recentPropertyViews.userId, u.id),
        eq(recentPropertyViews.companyId, u.activeCompanyId),
        eq(customers.companyId, u.activeCompanyId),
      ))
      .orderBy(desc(recentPropertyViews.viewedAt))
      .limit(recentOnly ? 10 : 5);

    if (recentOnly) {
      res.json({
        recent: recentRows.map((r) => ({
          ...serializePropertySummary(r),
          viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
        })),
      });
      return;
    }

    const filters = [eq(customers.companyId, u.activeCompanyId)];
    if (q.length > 0) {
      const pattern = `%${q}%`;
      const orExpr = or(
        ilike(customers.name, pattern),
        ilike(customers.street, pattern),
        ilike(customers.city, pattern),
      );
      if (orExpr) filters.push(orExpr);
    }

    const resultRows = await db
      .select({
        id: customers.id,
        name: customers.name,
        street: customers.street,
        city: customers.city,
        state: customers.state,
        zip: customers.zip,
        customerType: customers.customerType,
        ranking: customers.ranking,
      })
      .from(customers)
      .where(and(...filters))
      .orderBy(asc(customers.name))
      .limit(limit);

    res.json({
      recent: recentRows.map((r) => ({
        ...serializePropertySummary(r),
        viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
      })),
      results: resultRows.map(serializePropertySummary),
    });
  });

  // POST /api/m/properties/:id/view — upsert "recent" entry. Idempotent: each
  // (user, customer) pair only ever has one row whose `viewedAt` we bump.
  app.post("/api/m/properties/:id/view", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const customerId = String(req.params.id);
    const [c] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, u.activeCompanyId)));
    if (!c) {
      res.status(404).json({ message: "Property not found" });
      return;
    }
    const now = new Date();
    await db
      .insert(recentPropertyViews)
      .values({
        companyId: u.activeCompanyId,
        userId: u.id,
        customerId,
        viewedAt: now,
      })
      .onConflictDoUpdate({
        target: [recentPropertyViews.userId, recentPropertyViews.customerId],
        set: { viewedAt: now, companyId: u.activeCompanyId },
      });
    res.sendStatus(204);
  });

  // GET /api/m/properties/:id — full profile bundle for the 6-tab detail screen.
  app.get("/api/m/properties/:id", requireMobileAuth(), async (req, res) => {
    const u = req.user as UserWithContext;
    const customerId = String(req.params.id);
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, u.activeCompanyId)));
    if (!c) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    const [contactRows, contractRows, siteNoteRows, mapSheets, recentTicketRows] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(eq(contacts.customerId, customerId))
        .orderBy(desc(contacts.isPrimary), asc(contacts.name)),
      db
        .select()
        .from(contracts)
        .where(and(
          eq(contracts.customerId, customerId),
          eq(contracts.companyId, u.activeCompanyId),
        ))
        .orderBy(asc(contracts.serviceType), desc(contracts.startDate)),
      // Site Notes tab: show all curated notes (global + every service type).
      db
        .select()
        .from(propertySiteNotes)
        .where(and(
          eq(propertySiteNotes.customerId, customerId),
          eq(propertySiteNotes.isActive, true),
        ))
        .orderBy(asc(propertySiteNotes.sortOrder), asc(propertySiteNotes.label)),
      db
        .select()
        .from(visualScopeSheets)
        .where(and(
          eq(visualScopeSheets.customerId, customerId),
          eq(visualScopeSheets.companyId, u.activeCompanyId),
        ))
        .orderBy(desc(visualScopeSheets.scopeDate)),
      // History tab requirement: completed visits, reverse chronological by
      // completedAt. We filter on `completedAt IS NOT NULL` so in-progress /
      // backlog tickets don't pollute the visit history.
      db
        .select({ ticket: tickets, statusName: ticketTypeStatuses.name })
        .from(tickets)
        .leftJoin(ticketTypeStatuses, eq(tickets.currentStatusId, ticketTypeStatuses.id))
        .where(and(
          eq(tickets.customerId, customerId),
          eq(tickets.companyId, u.activeCompanyId),
          sql`${tickets.completedAt} is not null`,
        ))
        .orderBy(desc(tickets.completedAt))
        .limit(50),
    ]);

    // Photos tab: aggregate completion + ad-hoc photos across the customer's
    // completed tickets. Each entry preserves the ticket back-reference so the
    // mobile UI can show "from <ticket title>".
    const photos: Array<{ ticketId: string; ticketTitle: string; path: string; takenAt: string | null }> = [];
    for (const r of recentTicketRows) {
      const t = r.ticket;
      const list: string[] = [
        ...(t.completionPhotoStorageKeys ?? []),
        ...(t.photos ?? []),
      ];
      for (const p of list) {
        if (typeof p === "string" && p.length > 0) {
          photos.push({
            ticketId: t.id,
            ticketTitle: t.title,
            path: p,
            takenAt: t.completedAt ? t.completedAt.toISOString() : t.updatedAt ? t.updatedAt.toISOString() : null,
          });
        }
      }
    }

    res.json({
      id: c.id,
      name: c.name,
      customerNumber: c.customerNumber,
      address: buildCustomerAddress(c),
      street: c.street,
      city: c.city,
      state: c.state,
      zip: c.zip,
      status: c.status,
      customerType: c.customerType,
      ranking: c.ranking,
      complexityScore: c.complexityScore,
      acres: c.acres,
      managementCompany: c.managementCompany,
      snowEnabled: c.snowEnabled,
      tags: c.tags ?? [],
      locationLat: c.locationLat,
      locationLng: c.locationLng,
      siteNotesQuick: {
        gateCode: c.gateCode,
        petStationCount: c.petStationCount,
        petStationLocations: c.petStationLocations,
        irrigationControllerLocations: c.irrigationControllerLocations,
        accessNotes: c.accessNotes,
        watchOutNotes: c.watchOutNotes,
      },
      contacts: (() => {
        const list = contactRows.map((ct) => ({
          id: ct.id,
          name: ct.name,
          role: ct.role,
          isPrimary: ct.isPrimary === "true",
          phones: ct.phones ?? [],
          emails: ct.emails ?? [],
        }));
        return list;
      })(),
      // Spec convenience: callers that just want the headline contact don't
      // have to scan the array.
      primaryContact: (() => {
        const c = contactRows.find((x) => x.isPrimary === "true") ?? contactRows[0];
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          role: c.role,
          isPrimary: c.isPrimary === "true",
          phones: c.phones ?? [],
          emails: c.emails ?? [],
        };
      })(),
      // `services` is the spec name for active contracts on a property.
      // Both keys are emitted for back-compat with the existing mobile UI.
      services: contractRows.map((ctr) => ({
        id: ctr.id,
        serviceType: ctr.serviceType,
        billingPattern: ctr.billingPattern,
        status: ctr.status,
        startDate: ctr.startDate ? ctr.startDate.toISOString().slice(0, 10) : null,
        endDate: ctr.endDate ? ctr.endDate.toISOString().slice(0, 10) : null,
        po: ctr.po,
        notes: ctr.notes,
      })),
      contracts: contractRows.map((ctr) => ({
        id: ctr.id,
        serviceType: ctr.serviceType,
        billingPattern: ctr.billingPattern,
        status: ctr.status,
        startDate: ctr.startDate ? ctr.startDate.toISOString().slice(0, 10) : null,
        endDate: ctr.endDate ? ctr.endDate.toISOString().slice(0, 10) : null,
        po: ctr.po,
        // The contracts table stores office-curated exclusions / extra context
        // in the free-form `notes` column. Surface it so the Services tab can
        // render a "What's NOT included" panel when populated.
        notes: ctr.notes,
      })),
      siteNotes: siteNoteRows.map(serializeSiteNote),
      // Spec alias used by mobile clients that consume the full curated set.
      fullSiteNotes: siteNoteRows.map(serializeSiteNote),
      maps: mapSheets.map((m) => {
        // Mobile clients fetch the rendered combined PNG from the export
        // endpoint; the path is server-rendered (canvas) and may fail at call
        // time per the canvas-native gotcha — the mobile UI handles that
        // gracefully. Web full-editor deep link is opened via Linking and is
        // routed through the shared proxy so it works on the published domain.
        const combinedPngPath = m.baseImagePath
          ? `/api/visual-scope-sheets/${m.id}/export/combined?inline=1`
          : null;
        const editorPath = `/dashboard/customers/${customerId}/visual-scope/${m.id}`;
        return {
          id: m.id,
          title: m.title,
          scopeDate: m.scopeDate,
          status: m.status,
          hasBaseImage: Boolean(m.baseImagePath),
          combinedPngPath,
          editorPath,
          // Spec-aligned aliases consumed by future clients; existing keys
          // above retained for back-compat with the just-shipped mobile UI.
          staticImageUrl: combinedPngPath,
          editorUrl: editorPath,
        };
      }),
      // Spec convenience: most clients only need the latest map sheet.
      // The `maps` array remains available for power-user flows.
      map: (() => {
        const m = mapSheets[0];
        if (!m) return null;
        const combinedPngPath = m.baseImagePath
          ? `/api/visual-scope-sheets/${m.id}/export/combined?inline=1`
          : null;
        const editorPath = `/dashboard/customers/${customerId}/visual-scope/${m.id}`;
        return {
          id: m.id,
          title: m.title,
          scopeDate: m.scopeDate,
          status: m.status,
          hasBaseImage: Boolean(m.baseImagePath),
          combinedPngPath,
          editorPath,
          staticImageUrl: combinedPngPath,
          editorUrl: editorPath,
        };
      })(),
      // Spec alias `history` mirrors `completedVisits` for back-compat.
      history: recentTicketRows.map((r) => ({
        id: r.ticket.id,
        title: r.ticket.title,
        priority: r.ticket.priority,
        mobileStatus: r.ticket.mobileStatus ?? "not_started",
        status: r.statusName ?? null,
        dueDate: r.ticket.dueDate ? r.ticket.dueDate.toISOString() : null,
        completedAt: r.ticket.completedAt ? r.ticket.completedAt.toISOString() : null,
        serviceType: r.ticket.serviceType,
      })),
      completedVisits: recentTicketRows.map((r) => ({
        id: r.ticket.id,
        title: r.ticket.title,
        priority: r.ticket.priority,
        mobileStatus: r.ticket.mobileStatus ?? "not_started",
        status: r.statusName ?? null,
        dueDate: r.ticket.dueDate ? r.ticket.dueDate.toISOString() : null,
        completedAt: r.ticket.completedAt ? r.ticket.completedAt.toISOString() : null,
        serviceType: r.ticket.serviceType,
      })),
      photos,
    });
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
