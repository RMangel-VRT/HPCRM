import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { routeStops, crews, customers, visits, routeStopBody, routeDate, routeService, validRouteSeason } from "@workspace/db";
import { db } from "../db";
import { failure } from "./visits";
import { lockVisitCompany, VisitError, type VisitTransaction } from "../lib/visitSync";
import { pickProvided } from "../lib/patchBody";
import { companyToday, addCalendarDays } from "../lib/companyDay";
import { fillRouteVisits, routeSeason, routeWeekday } from "../lib/routeFill";
import { slideRouteVisits } from "../lib/routeSlide";
import { loadContractCoverage } from "../lib/contractCenterPersistence";
import { contractReport, reportYear } from "../lib/routeReporting";
import { applyRouteCalendar } from "../lib/routeCalendar";
import type { UserWithContext } from "../auth";

function authorizeRoutes(req: Request, res: Response) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const user = req.user as UserWithContext;
  if (!["admin", "office", "field_manager", "irrigation_manager"].includes(user.accessRole)) {
    res.status(403).json({ error: "Insufficient permissions" }); return;
  }
  if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) {
    res.status(409).json({ error: "COMPANY_CHANGED", message: "Company changed. Reload Routes and try again." });
    return;
  }
  return user;
}
const authorize = authorizeRoutes;

function routeFailure(res: Response, error: unknown) {
  const pg = error as { code?: string; cause?: { code?: string } };
  if (pg.code === "23505" || pg.cause?.code === "23505")
    res.status(409).json({ error: "DUPLICATE_ROUTE_STOP", message: "This property already has an active stop for that service. Edit its existing stop." });
  else failure(res, error);
}
async function write<T>(companyId: string, fn: (tx: VisitTransaction) => Promise<T>) {
  return db.transaction(async tx => { await lockVisitCompany(tx, companyId); return fn(tx); });
}
async function validateReferences(tx: VisitTransaction, companyId: string, row: { crewId: string; customerId: string | null; seasonStart?: string | null; seasonEnd?: string | null }) {
  if (!row.customerId) throw new VisitError(400, "INVALID_REFERENCE", "A deleted property cannot own an active route stop");
  const [crew] = await tx.select({ id: crews.id }).from(crews).where(and(eq(crews.id, row.crewId), eq(crews.companyId, companyId), eq(crews.isActive, true)));
  const [property] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, row.customerId), eq(customers.companyId, companyId), eq(customers.active, "true"), eq(customers.status, "active")));
  if (!crew || !property) throw new VisitError(400, "INVALID_REFERENCE", "Crew and property must be active and belong to this company");
  if (!validRouteSeason(row)) throw new VisitError(400, "INVALID_SEASON", "Supply both season dates in order, or clear both");
}
function serviceFilter(req: Request) { return routeService.optional().parse(req.query.service); }
function seasonYear(value: unknown) {
  return Number(z.string().regex(/^(19|20|21)\d{2}$/).parse(value ?? companyToday().slice(0, 4)));
}
export function registerRouteStopRoutes(app: Express) {
  // The customer page has broader existing read access than Routes management.
  // Do not expose company-wide management data to those viewers.
  app.get("/api/customers/:id/route-summary", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) { res.status(409).json({ error: "COMPANY_CHANGED" }); return; }
    try {
      const customerId = z.string().parse(req.params.id);
      const result = await db.transaction(async tx => {
        const [property] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, user.activeCompanyId)));
        if (!property) throw new VisitError(404, "NOT_FOUND");
        const rows = await tx.select({ id: routeStops.id, serviceKey: routeStops.serviceKey, weekday: routeStops.weekday,
          everyWeeks: routeStops.everyWeeks, minutes: routeStops.minutes, crew: { id: crews.id, name: crews.name } })
          .from(routeStops).innerJoin(crews, and(eq(crews.id, routeStops.crewId), eq(crews.companyId, user.activeCompanyId)))
          .where(and(eq(routeStops.companyId, user.activeCompanyId), eq(routeStops.customerId, customerId), eq(routeStops.isActive, true)))
          .orderBy(routeStops.weekday, routeStops.sortOrder, routeStops.id);
        return { stops: rows };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  // Read-only dashboard preview retains existing authenticated company access.
  app.get("/api/routes/preview", async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
    const user = req.user as UserWithContext;
    if (req.get("X-Company-Id") && req.get("X-Company-Id") !== user.activeCompanyId) { res.status(409).json({ error: "COMPANY_CHANGED" }); return; }
    try {
      const result = await db.transaction(async tx => {
        const rows = await tx.select({
          id: routeStops.id, customerId: customers.id, name: customers.name,
          serviceKey: routeStops.serviceKey, weekday: routeStops.weekday, everyWeeks: routeStops.everyWeeks,
          minutes: routeStops.minutes, crew: { id: crews.id, name: crews.name },
        }).from(routeStops)
          .innerJoin(customers, and(eq(customers.id, routeStops.customerId), eq(customers.companyId, user.activeCompanyId)))
          .innerJoin(crews, and(eq(crews.id, routeStops.crewId), eq(crews.companyId, user.activeCompanyId)))
          .where(and(eq(routeStops.companyId, user.activeCompanyId), eq(routeStops.isActive, true)))
          .orderBy(routeStops.weekday, routeStops.crewId, routeStops.sortOrder, routeStops.id);
        return { stops: rows };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  app.get("/api/routes/status", async (req, res): Promise<void> => {
    const user = authorizeRoutes(req, res); if (!user) return;
    try {
      const service = serviceFilter(req) ?? "mowing";
      const result = await db.transaction(async tx => {
        const coverage = await loadContractCoverage(tx, user.activeCompanyId);
        const windows = coverage.properties.map(p => {
          const year = reportYear(p.id, service, coverage.resolve);
          const entitlement = coverage.resolve(p.id, service, year);
          return entitlement?.window ? { year, ...entitlement.window } : null;
        }).filter((w): w is { year: number; start: string; end: string } => !!w);
        const year = windows.length ? Math.max(...windows.map(w => w.year)) : Number(companyToday().slice(0, 4));
        const sameYear = windows.filter(w => w.year === year);
        const [latest] = await tx.select({ date: sql<string | null>`max(${visits.visitDate})` }).from(visits).where(and(
          eq(visits.companyId, user.activeCompanyId), eq(visits.sourceType, "route"), eq(visits.serviceKey, service),
        ));
        return { latestVisitDate: latest?.date ?? null,
          season: sameYear.length ? { year, start: sameYear.map(w => w.start).sort()[0], end: sameYear.map(w => w.end).sort().at(-1)! } : null };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  app.post("/api/routes/stops/:id/apply-calendar", async (req, res): Promise<void> => {
    const user = authorizeRoutes(req, res); if (!user) return;
    try {
      const id = z.string().parse(req.params.id), { expectedUpdatedAt } = z.object({ expectedUpdatedAt: z.iso.datetime() }).parse(req.body);
      res.json(await write(user.activeCompanyId, tx => applyRouteCalendar(tx, user.activeCompanyId, user.id, id, expectedUpdatedAt)));
    } catch (error) { routeFailure(res, error); }
  });
  app.post("/api/routes/fill", async (req, res): Promise<void> => {
    const user = authorizeRoutes(req, res); if (!user) return;
    try {
      const body = z.object({ through: routeDate.optional(), dryRun: z.boolean().optional() }).parse(req.body ?? {});
      res.json(await fillRouteVisits(user.activeCompanyId, body));
    } catch (error) { routeFailure(res, error); }
  });
  app.post("/api/routes/slide", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const body = z.object({ date: routeDate, crewIds: z.union([z.literal("all"), z.array(z.string().min(1)).min(1).max(1000)]), mode: z.enum(["day", "week"]) }).parse(req.body);
      res.json(await slideRouteVisits(user.activeCompanyId, body));
    } catch (error) { routeFailure(res, error); }
  });
  app.get("/api/routes/stops", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const service = serviceFilter(req);
      const result = await db.transaction(async tx => {
        const coverage = await loadContractCoverage(tx, user.activeCompanyId);
        const standing = await tx.select().from(crews).where(eq(crews.companyId, user.activeCompanyId));
        const rows = await tx.select().from(routeStops).where(and(eq(routeStops.companyId, user.activeCompanyId), eq(routeStops.isActive, true), service ? eq(routeStops.serviceKey, service) : undefined));
        const properties = new Map(coverage.properties.map(p => [p.id, p]));
        const crewMap = new Map(standing.map(c => [c.id, c]));
        return rows.sort((a, b) => a.crewId.localeCompare(b.crewId) || a.weekday - b.weekday || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
          .map(stop => {
            const year = req.query.season ? seasonYear(req.query.season) : reportYear(stop.customerId, stop.serviceKey, coverage.resolve);
            const season = routeSeason(stop, year, coverage.resolve);
            const entitlement = coverage.resolve(stop.customerId, stop.serviceKey, year);
            const property = properties.get(stop.customerId ?? ""), crew = crewMap.get(stop.crewId);
            return { ...stop, property: property ? { id: property.id, name: property.name } : null,
              crew: crew ? { id: crew.id, name: crew.name, color: crew.color, isActive: crew.isActive } : null,
              cadence: stop.everyWeeks, season, reportYear: year,
              contract: contractReport(entitlement ?? coverage.resolve(stop.customerId, stop.serviceKey, year - 1)),
              contractStatus: season?.contractStatus ?? (entitlement ? "covered" : "no_contract") };
          });
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  app.post("/api/routes/stops", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const body = routeStopBody.parse(req.body);
      const result = await write(user.activeCompanyId, async tx => {
        await validateReferences(tx, user.activeCompanyId, body);
        const [row] = await tx.insert(routeStops).values({ ...body, companyId: user.activeCompanyId, createdById: user.id }).returning();
        return row;
      });
      res.status(201).json(result);
    } catch (error) { routeFailure(res, error); }
  });
  // Must precede :id routes. Exact group matching prevents partial reorder damage.
  app.post("/api/routes/stops/reorder", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const body = z.object({ crewId: z.string().min(1), weekday: z.number().int().min(1).max(6), serviceKey: routeService, stopIds: z.array(z.string().min(1)).max(10000) }).parse(req.body);
      await write(user.activeCompanyId, async tx => {
        const [crew] = await tx.select({ id: crews.id }).from(crews).where(and(eq(crews.id, body.crewId), eq(crews.companyId, user.activeCompanyId), eq(crews.isActive, true)));
        if (!crew) throw new VisitError(400, "INVALID_CREW");
        const rows = await tx.select({ id: routeStops.id }).from(routeStops).where(and(eq(routeStops.companyId, user.activeCompanyId), eq(routeStops.crewId, body.crewId), eq(routeStops.weekday, body.weekday), eq(routeStops.serviceKey, body.serviceKey), eq(routeStops.isActive, true)));
        if (new Set(body.stopIds).size !== body.stopIds.length || rows.length !== body.stopIds.length || rows.some(r => !body.stopIds.includes(r.id)))
          throw new VisitError(400, "INVALID_STOP_IDS", "IDs must exactly match the active crew/day/service stops");
        if (rows.length) await tx.update(routeStops).set({
          sortOrder: sql`CASE ${routeStops.id} ${sql.join(body.stopIds.map((id, i) => sql`WHEN ${id} THEN ${i}::integer`), sql` `)} END`,
          updatedAt: sql`greatest(date_trunc('milliseconds', clock_timestamp()), ${routeStops.updatedAt} + interval '1 millisecond')`,
        }).where(and(eq(routeStops.companyId, user.activeCompanyId), inArray(routeStops.id, body.stopIds)));
      });
      res.json({ ok: true });
    } catch (error) { routeFailure(res, error); }
  });
  app.patch("/api/routes/stops/:id", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const id = z.string().parse(req.params.id);
      const body = pickProvided(routeStopBody.partial().parse(req.body), req.body);
      const result = await write(user.activeCompanyId, async tx => {
        const [existing] = await tx.select().from(routeStops).where(and(eq(routeStops.id, id), eq(routeStops.companyId, user.activeCompanyId)));
        if (!existing) throw new VisitError(404, "NOT_FOUND");
        // R1 cadence is anchored by whole multiples of 14 days. A day move
        // keeps the same anchor WEEK, aligned to the new weekday, otherwise
        // every-two-week stops would silently stop generating altogether.
        if (body.weekday !== undefined && body.weekday !== existing.weekday && body.anchorDate === undefined)
          body.anchorDate = addCalendarDays(existing.anchorDate, body.weekday - routeWeekday(existing.anchorDate));
        await validateReferences(tx, user.activeCompanyId, { ...existing, ...body });
        const [row] = await tx.update(routeStops).set({ ...body, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) }).where(and(eq(routeStops.id, id), eq(routeStops.companyId, user.activeCompanyId))).returning();
        return row;
      });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  app.delete("/api/routes/stops/:id", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const id = z.string().parse(req.params.id);
      const result = await write(user.activeCompanyId, async tx => {
        const rows = await tx.update(routeStops).set({ isActive: false, updatedAt: sql`greatest(date_trunc('milliseconds', clock_timestamp()), ${routeStops.updatedAt} + interval '1 millisecond')` }).where(and(eq(routeStops.id, id), eq(routeStops.companyId, user.activeCompanyId))).returning();
        if (!rows.length) throw new VisitError(404, "NOT_FOUND");
        const cancelled = await tx.update(visits).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(visits.companyId, user.activeCompanyId), eq(visits.routeStopId, id), eq(visits.sourceType, "route"), eq(visits.status, "planned"), gte(visits.visitDate, companyToday()))).returning({ id: visits.id });
        return { stop: rows[0], cancelled: cancelled.length };
      });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  app.get("/api/routes/needs", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const service = serviceFilter(req) ?? "mowing";
      const result = await db.transaction(async tx => {
        const coverage = await loadContractCoverage(tx, user.activeCompanyId);
        const stops = await tx.select().from(routeStops).where(and(eq(routeStops.companyId, user.activeCompanyId), eq(routeStops.serviceKey, service), eq(routeStops.isActive, true)));
        const byProperty = new Map(stops.map(s => [s.customerId, s]));
        const needs: { customerId: string; name: string; serviceKey: string; season: number; reason: string; stopId?: string; contract: ReturnType<typeof contractReport>; minutes: number | null }[] = [];
        for (const property of coverage.properties.filter(p => p.active === "true" && p.status === "active")) {
          const season = reportYear(property.id, service, coverage.resolve);
          const entitlement = coverage.resolve(property.id, service, season);
          const stop = byProperty.get(property.id);
          if (entitlement && !stop) needs.push({ customerId: property.id, name: property.name, serviceKey: service, season, reason: "Needs a route", contract: contractReport(entitlement), minutes: null });
          if (stop && !entitlement) needs.push({ customerId: property.id, name: property.name, serviceKey: service, season, stopId: stop.id, reason: "Route ends with contract",
            contract: contractReport(coverage.resolve(property.id, service, season - 1)), minutes: stop.minutes });
        }
        return needs.sort((a, b) => a.name.localeCompare(b.name) || a.customerId.localeCompare(b.customerId));
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
  app.get("/api/routes/progress", async (req, res): Promise<void> => {
    const user = authorize(req, res); if (!user) return;
    try {
      const customerId = z.string().min(1).parse(req.query.customerId), service = serviceFilter(req) ?? "mowing", year = seasonYear(req.query.season);
      const result = await db.transaction(async tx => {
        const coverage = await loadContractCoverage(tx, user.activeCompanyId);
        if (!coverage.properties.some(p => p.id === customerId)) throw new VisitError(400, "INVALID_REFERENCE");
        const entitlement = coverage.resolve(customerId, service, year);
        // A signed season can cross New Year. Count its ORIGINAL occurrence
        // dates within the governing term, never the current/slid visit dates.
        const from = entitlement?.term.startDate ?? `${year}-01-01`, to = entitlement?.term.endDate ?? `${year}-12-31`;
        const counts = await tx.select({ status: visits.status, count: sql<number>`count(*)::int` }).from(visits).where(and(
          eq(visits.companyId, user.activeCompanyId), eq(visits.sourceType, "route"), eq(visits.customerId, customerId), eq(visits.serviceKey, service),
          gte(visits.routeOccurrenceDate, from), lte(visits.routeOccurrenceDate, to),
        )).groupBy(visits.status);
        const count = (status: string) => counts.find(c => c.status === status)?.count ?? 0;
        return { customerId, serviceKey: service, season: year, quantity: entitlement?.scope.quantity ?? null, contract: contractReport(entitlement),
          contractStatus: entitlement ? "covered" : "no_contract", termId: entitlement?.term.id ?? null,
          done: count("done"), planned: count("planned"), skipped: count("skipped") + count("cancelled"), inProgress: count("in_progress"), cancelled: count("cancelled") };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.json(result);
    } catch (error) { routeFailure(res, error); }
  });
}
