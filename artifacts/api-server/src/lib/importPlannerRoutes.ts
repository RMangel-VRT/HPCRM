import { and, eq } from "drizzle-orm";
import {
  companies, routeStops, routeImportDecisions, crews, maintenanceCrews, maintenanceVisitConfigs, weeklyScheduleTemplates, scheduleBlocks,
  type InsertRouteStop, type WeeklyScheduleTemplate, type ScheduleBlock, type MaintenanceCrew, type MaintenanceVisitConfig, type Crew,
} from "@workspace/db";
import { db } from "../db";
import { loadContractCoverage, type Reader } from "./contractCenterPersistence";
import { companyToday, addCalendarDays } from "./companyDay";
import { routeWeekday, type ResolveCoverage } from "./routeFill";
import { lockVisitCompany } from "./visitSync";
import { lockCrewCompany } from "./crewLinks";
import { routeSchemaReady } from "./routeSchema";
import { routeImportApprovals } from "./routeImportApproval";
import { logger } from "./logger";
import { plannerSourceFingerprint } from "./plannerSourceFingerprint";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export interface PlannerInputs {
  templates: WeeklyScheduleTemplate[]; blocks: ScheduleBlock[];
  columns: MaintenanceCrew[]; configs: (MaintenanceVisitConfig & { notesDigest?: string })[]; crews: Crew[];
  properties: { id: string; name: string; active: string; status: string }[];
  existing: { customerId: string | null; serviceKey: string }[];
}
export function planPlannerRoutes(companyId: string, data: PlannerInputs, resolve: ResolveCoverage, today = companyToday(), templateId?: string) {
  const companyTemplates = data.templates.filter(t => t.companyId === companyId);
  const templates = [...companyTemplates].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(t => ({ id: t.id, name: t.name, active: !!t.isActive, blocks: data.blocks.filter(b => b.templateId === t.id).length }));
  const active = templates.filter(t => t.active);
  const matches = templateId !== undefined ? companyTemplates.filter(t => t.id === templateId) : [];
  const selectedTemplateId = templateId !== undefined
    ? (matches.length === 1 ? matches[0].id : null)
    : (active.length === 1 ? active[0].id : null);
  const blocked = selectedTemplateId ? null : templateId !== undefined
    ? "Selected template must resolve uniquely within this company"
    : "Exactly one active template is required";
  const proposed: InsertRouteStop[] = [];
  const created: { property: string; crew: string; weekday: number; minutes: number; anchorDate: string; covered2027: boolean }[] = [];
  const skipped: { property: string; crew: string; weekday: string; reason: string }[] = [];
  const decisions: { property: string; crew: string; weekday: string; reason: string }[] = [];
  const decisionSnapshots: (typeof routeImportDecisions.$inferInsert)[] = [];
  const properties = new Map(data.properties.map(p => [p.id, p]));
  const configs = new Map(data.configs.map(c => [c.id, c]));
  const columns = new Map(data.columns.map(c => [c.id, c]));
  const standing = new Map(data.crews.map(c => [c.id, c]));
  const standingColumn = (id: string) => {
    const linked = columns.get(id)?.crewId;
    return linked ? standing.get(linked) : undefined;
  };
  const seen = new Set(data.existing.filter(s => s.serviceKey === "mowing").map(s => s.customerId));
  if (blocked) for (const block of data.blocks) {
    const config = configs.get(block.visitConfigId), column = columns.get(block.crewId);
    skipped.push({ property: (config && properties.get(config.customerId)?.name) ?? "Unavailable property",
      crew: (column?.crewId && standing.get(column.crewId)?.name) || column?.name || "Unavailable crew",
      weekday: block.dayOfWeek, reason: `Template selection blocked: ${blocked}` });
  }
  if (!blocked) {
    const blocks = data.blocks.filter(b => b.templateId === selectedTemplateId).sort((a, b) =>
      weekdays.indexOf(a.dayOfWeek) - weekdays.indexOf(b.dayOfWeek)
      || (standingColumn(a.crewId)?.displayOrder ?? Infinity) - (standingColumn(b.crewId)?.displayOrder ?? Infinity)
      || (standingColumn(a.crewId)?.name ?? columns.get(a.crewId)?.name ?? "").localeCompare(standingColumn(b.crewId)?.name ?? columns.get(b.crewId)?.name ?? "")
      || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      || (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") || a.id.localeCompare(b.id));
    for (const block of blocks) {
      const config = configs.get(block.visitConfigId), property = config && properties.get(config.customerId);
      const column = columns.get(block.crewId), crew = column?.crewId ? standing.get(column.crewId) : undefined;
      const item = { property: property?.name ?? "Unavailable property", crew: crew?.name ?? column?.name ?? "Unavailable crew", weekday: block.dayOfWeek };
      const weekday = weekdays.indexOf(block.dayOfWeek) + 1;
      // Never silently substitute a later placement for a skipped first block.
      if (property && seen.has(property.id)) {
        decisions.push({ ...item, reason: "Duplicate property/service placement; first block retained" });
        let anchorDate = today;
        while (weekday && routeWeekday(anchorDate) !== weekday) anchorDate = addCalendarDays(anchorDate, 1);
        decisionSnapshots.push({ companyId, sourceBlockId: block.id, snapshot: {
          customerId: property.id, propertyName: item.property, crewId: crew?.id ?? null,
          crewName: item.crew, weekday, serviceKey: "mowing", minutes: config?.estimatedDurationMinutes ?? 60,
          anchorDate, sortOrder: block.sortOrder ?? 0, notes: config?.notes ?? null,
          reason: "Duplicate property/service placement; first block retained",
        } });
        continue;
      }
      if (property) seen.add(property.id);
      let reason: string | undefined;
      if (!config || !property || !column) reason = "Missing or foreign planner reference";
      else if (!config.isActive) reason = "Inactive config";
      else if (!column.crewId || !crew) reason = "Unlinked planner column";
      else if (!crew.isActive) reason = "Inactive crew";
      else if (property.active !== "true" || property.status !== "active") reason = "Inactive property";
      else if (!weekday || config.estimatedDurationMinutes < 5 || config.estimatedDurationMinutes > 720) reason = "Invalid weekday or duration";
      if (reason) { skipped.push({ ...item, reason }); continue; }
      const coverage = resolve(property!.id, "mowing", 2027);
      // A missing window must not prevent importing a stop; fill will report it.
      const base = coverage?.window?.start && coverage.window.start < today ? coverage.window.start : today;
      let anchorDate = base;
      while (routeWeekday(anchorDate) !== weekday) anchorDate = addCalendarDays(anchorDate, 1);
      proposed.push({ companyId, customerId: property!.id, serviceKey: "mowing", crewId: crew!.id,
        weekday, sortOrder: block.sortOrder ?? 0, minutes: config!.estimatedDurationMinutes, everyWeeks: 1,
        anchorDate, notes: config!.notes, importedFromBlockId: block.id, seasonStart: null, seasonEnd: null, isActive: true });
      created.push({ property: property!.name, crew: crew!.name, weekday, minutes: config!.estimatedDurationMinutes, anchorDate, covered2027: !!coverage });
    }
  }
  const covered = created.filter(c => c.covered2027).length;
  const fingerprint = plannerSourceFingerprint(companyId, selectedTemplateId, data);
  return { summary: `Import would create ${proposed.length} route stops (${covered} with a 2027 mowing contract); ${decisions.length} need a decision.`,
    templates, activeTemplates: active.length, selectedTemplateId, blocked,
    created, skipped, decisions, covered2027: covered, withoutCoverage2027: created.length - covered, fingerprint, proposed, decisionSnapshots };
}
export async function loadPlannerInputs(reader: Reader, companyId: string, includeStops: boolean) {
  const templates = await reader.select().from(weeklyScheduleTemplates).where(eq(weeklyScheduleTemplates.companyId, companyId));
  const blocks = await reader.select({ block: scheduleBlocks }).from(scheduleBlocks).innerJoin(weeklyScheduleTemplates,
    eq(weeklyScheduleTemplates.id, scheduleBlocks.templateId)).where(eq(weeklyScheduleTemplates.companyId, companyId));
  const columns = await reader.select().from(maintenanceCrews).where(eq(maintenanceCrews.companyId, companyId));
  const configs = await reader.select().from(maintenanceVisitConfigs).where(eq(maintenanceVisitConfigs.companyId, companyId));
  const standing = await reader.select().from(crews).where(eq(crews.companyId, companyId));
  const coverage = await loadContractCoverage(reader, companyId);
  const existing = includeStops ? await reader.select().from(routeStops).where(and(eq(routeStops.companyId, companyId), eq(routeStops.isActive, true))) : [];
  return { data: { templates, blocks: blocks.map(b => b.block), columns, configs, crews: standing, properties: coverage.properties, existing }, resolve: coverage.resolve };
}
export async function importPlannerRoutes(companyId: string, opts: { dryRun: boolean; templateId?: string }) {
  const approval = routeImportApprovals[companyId];
  if (!opts.dryRun && !approval) return { disabled: true, reason: "Randy must approve the production dry run explicitly" };
  // Writes derive selection exclusively from the approval; caller overrides are forbidden.
  if (!opts.dryRun && opts.templateId !== undefined && opts.templateId !== approval?.templateId)
    return { disabled: true, reason: "Template selection must match the approval" };
  const ready = await routeSchemaReady();
  if (!opts.dryRun && !ready) return { disabled: true, reason: "Routes schema not installed" };
  return db.transaction(async tx => {
    if (!opts.dryRun) {
      // Same order as crew-link mutation: crew gate, then scheduling gate.
      await lockCrewCompany(tx, companyId);
      await lockVisitCompany(tx, companyId);
      const [company] = await tx.select({ imported: companies.routesImportedAt }).from(companies).where(eq(companies.id, companyId)).for("update");
      if (!company) return { disabled: true, reason: "Company not found" };
      if (company.imported) return { alreadyImported: true };
    }
    const { data, resolve } = await loadPlannerInputs(tx, companyId, ready);
    const { proposed, decisionSnapshots, ...report } = planPlannerRoutes(companyId, data, resolve, companyToday(),
      opts.dryRun ? opts.templateId : approval?.templateId);
    if (opts.dryRun || report.blocked) return report;
    if (approval?.fingerprint !== report.fingerprint)
      return { ...report, disabled: true, reason: "Reviewed dry run changed; Randy must approve a fresh report" };
    // Source-only approval intentionally excludes mutable route inventory. Still,
    // a pre-import route write must not turn a reviewed placement into a decision
    // and silently commit fewer stops. Recheck under the scheduling gate without
    // putting route inventory or live contractual coverage into the source hash.
    const existingMowing = new Set(data.existing.filter(s => s.serviceKey === "mowing").map(s => s.customerId));
    if (approval?.templateId && decisionSnapshots.some(d => existingMowing.has(d.snapshot.customerId)))
      return { ...report, disabled: true, reason: "Existing mowing stops conflict with the selected import; resolve them and review a fresh dry run" };
    // No ON CONFLICT here: an unexpected conflict must roll back stops AND marker.
    for (let i = 0; i < proposed.length; i += 1000) await tx.insert(routeStops).values(proposed.slice(i, i + 1000));
    // Commit review snapshots with stops and the import marker. Never write in a
    // dry run, and never recompute resolved choices from later planner edits.
    if (decisionSnapshots.length) await tx.insert(routeImportDecisions).values(decisionSnapshots);
    await tx.update(companies).set({ routesImportedAt: new Date() }).where(eq(companies.id, companyId));
    return report;
  }, opts.dryRun ? { isolationLevel: "repeatable read", accessMode: "read only" } : undefined);
}
export async function runApprovedPlannerImports() {
  // Empty by default, so registration alone cannot trigger an import.
  for (const companyId of Object.keys(routeImportApprovals)) {
    const result = await importPlannerRoutes(companyId, { dryRun: false });
    logger.info({ companyId, disabled: "disabled" in result, blocked: "blocked" in result ? result.blocked : undefined }, "Planner route import checked");
  }
}
