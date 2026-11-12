import { z } from "zod/v4";

/** Browser-safe validation; classification belongs to the caller's catalog. */
export type SchedulingService = { key: string; scheduling: string };
export const CAMPAIGN_TERM_STATUSES = ["signed", "active", "renewed", "sent", "up_for_renewal"] as const;
export const calendarKinds = ["round", "checklist", "recurring"] as const;
export type CalendarKind = typeof calendarKinds[number];
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function validMonthDay(value: string): boolean {
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const [m, d] = value.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= monthDays[m - 1];
}
export function calendarKindAllowed(catalog: readonly SchedulingService[], key: string, kind: CalendarKind) {
  const service = catalog.find(s => s.key === key);
  return !!service && (kind === "round" ? service.scheduling === "campaign"
    : kind === "checklist" ? service.scheduling === "checklist"
    : service.scheduling === "route" || key === "native_areas");
}
export const calendarEntryInput = z.object({
  id: z.string().min(1).optional(),
  kind: z.enum(calendarKinds),
  position: z.number().int().min(1).max(24),
  name: z.string().trim().min(1).max(80),
  opensMd: z.string().refine(validMonthDay, "Choose a real month/day (February 29 is not allowed)"),
  dueMd: z.string().refine(validMonthDay, "Choose a real month/day (February 29 is not allowed)"),
  inStandard: z.boolean(),
  pattern: z.string().nullable().optional(),
  includes: z.string().nullable().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.opensMd === v.dueMd) ctx.addIssue({ code: "custom", path: ["dueMd"], message: "Opening and deadline must differ" });
  if (v.kind !== "round" && v.inStandard) ctx.addIssue({ code: "custom", path: ["inStandard"], message: "Only rounds can be in the standard" });
  if (v.kind !== "recurring" && (v.pattern != null || v.includes != null))
    ctx.addIssue({ code: "custom", message: "Pattern and includes belong only to recurring visits" });
  if (v.kind === "checklist" && v.position !== 1) ctx.addIssue({ code: "custom", path: ["position"], message: "A checklist has position 1" });
});
export type CalendarEntryInput = z.infer<typeof calendarEntryInput>;
export type ServiceCalendarEntry = CalendarEntryInput & { id: string; serviceKey: string; updatedAt: string };
export function serviceCalendarReplacementSchema(catalog: readonly SchedulingService[], serviceKey: string) {
  return z.object({ entries: z.array(calendarEntryInput).max(72), allowEmptyStandard: z.boolean().optional() }).strict()
    .superRefine((v, ctx) => {
      if (!catalog.some(s => ["round", "checklist", "recurring"].some(k => calendarKindAllowed(catalog, serviceKey, k as CalendarKind))))
        ctx.addIssue({ code: "custom", message: "Choose a calendar service" });
      const ids = new Set<string>(), positions = new Set<string>();
      for (const [index, entry] of v.entries.entries()) {
        const fail = (message: string) => ctx.addIssue({ code: "custom", path: ["entries", index], message });
        if (!calendarKindAllowed(catalog, serviceKey, entry.kind)) fail("Entry kind is incompatible with this service");
        if (entry.id && ids.has(entry.id)) fail("An entry identity cannot be repeated");
        if (entry.id) ids.add(entry.id);
        const key = `${entry.kind}:${entry.position}`;
        if (positions.has(key)) fail("Positions must be unique within each kind");
        positions.add(key);
      }
      for (const kind of calendarKinds) {
        const positions = v.entries.filter(e => e.kind === kind).map(e => e.position).sort((a, b) => a - b);
        if (positions.some((p, i) => p !== i + 1))
          ctx.addIssue({ code: "custom", message: "Use consecutive positions starting at 1 within each kind" });
      }
      if (v.entries.some(e => e.kind === "round") && !v.entries.some(e => e.inStandard) && !v.allowEmptyStandard)
        ctx.addIssue({ code: "custom", message: "Explicitly authorize an empty standard; blank-count seasons become gaps" });
    });
}
export type UsageLine = {
  termId: string; agreementId: string; customerId: string; customerName: string;
  serviceKey: string; quantity: number | null; monthSpread: number[] | null;
};
export type UsageProblem = Omit<UsageLine, "serviceKey" | "quantity" | "monthSpread"> & { reason: string };
export type ServiceCalendarUsage = {
  serviceKey: string; seasons: number;
  byCount: { rounds: number; seasons: number }[];
  noCount: number; needsRounds: UsageProblem[];
  zero: number; invalid: number; duplicate: number;
  problems: UsageProblem[]; legacyChemical: UsageProblem[];
};
export type ServiceCalendarResponse = { entries: ServiceCalendarEntry[]; usage: ServiceCalendarUsage[] };
/** Raw eligible included seasons, not expanded property demand. One count per term/service. */
export function summarizeServiceUsage(catalog: readonly SchedulingService[], lines: UsageLine[],
  entries: readonly (CalendarEntryInput & { serviceKey: string })[]): ServiceCalendarUsage[] {
  return catalog.filter(s => ["campaign", "checklist"].includes(s.scheduling)).map(service => {
    const rounds = entries.filter(e => e.serviceKey === service.key && e.kind === "round");
    const result: ServiceCalendarUsage = { serviceKey: service.key, seasons: 0, byCount: [], noCount: 0,
      needsRounds: [], zero: 0, invalid: 0, duplicate: 0, problems: [], legacyChemical: [] };
    const groups = new Map<string, UsageLine[]>();
    for (const line of lines.filter(l => l.serviceKey === service.key))
      groups.set(line.termId, [...(groups.get(line.termId) ?? []), line]);
    const ref = (l: UsageLine, reason: string): UsageProblem => ({
      termId: l.termId, agreementId: l.agreementId, customerId: l.customerId, customerName: l.customerName, reason,
    });
    for (const group of groups.values()) {
      result.seasons++;
      const l = group[0], q = l.quantity;
      const problem = (reason: string) => result.problems.push(ref(l, reason));
      if (group.length > 1) { result.duplicate++; problem("duplicate"); continue; }
      if (q !== null && (!Number.isInteger(q) || q < 0 || q > 24)) { result.invalid++; problem("invalid_count"); continue; }
      if (q === 0) { result.zero++; problem("zero"); continue; }
      if (q === null) {
        result.noCount++;
        problem("no_count"); continue;
      }
      let count = result.byCount.find(c => c.rounds === q);
      if (!count) { count = { rounds: q, seasons: 0 }; result.byCount.push(count); }
      count.seasons++;
      if (service.scheduling === "campaign" && q > rounds.length)
        result.needsRounds.push(ref(l, "needs_rounds"));
    }
    if (service.key === "fertilization") {
      const seen = new Set<string>();
      for (const l of lines.filter(l => l.serviceKey === "chemical")) {
        if (!seen.has(l.termId) && !lines.some(n => n.termId === l.termId && ["fertilization", "broadleaf"].includes(n.serviceKey))) {
          result.legacyChemical.push(ref(l, "legacy_chemical")); seen.add(l.termId);
        }
      }
    }
    result.byCount.sort((a, b) => a.rounds - b.rounds);
    return result;
  });
}

type StartingEntry = Omit<CalendarEntryInput, "id"> & { serviceKey: string };
const round = (serviceKey: string, position: number, name: string, opensMd: string, dueMd: string): StartingEntry =>
  ({ serviceKey, position, name, opensMd, dueMd, kind: "round", inStandard: true });
const recurring = (serviceKey: string, name: string, opensMd: string, dueMd: string, pattern: string, includes: string): StartingEntry =>
  ({ serviceKey, position: 1, name, opensMd, dueMd, pattern, includes, kind: "recurring", inStandard: false });
/** Explicit empty-company load only. Never a generation fallback or an automatic seed. */
export const STARTING_SERVICE_CALENDAR: readonly StartingEntry[] = [
  round("cleanups", 1, "Spring clean-up", "03-01", "04-15"),
  round("cleanups", 2, "Fall leaf clean-up 1", "11-01", "11-30"),
  round("cleanups", 3, "Fall leaf clean-up 2", "11-15", "12-31"),
  round("aeration", 1, "Spring aeration", "03-01", "05-15"),
  round("shrub_trimming", 1, "Spring shrub trim", "04-01", "07-31"),
  round("shrub_trimming", 2, "Fall shrub trim", "09-01", "10-31"),
  round("tree_pruning", 1, "Tree trim", "09-01", "10-31"),
  round("ornamental_grass", 1, "Ornamental grass cutback", "12-01", "01-30"),
  round("fertilization", 1, "Pre-emergent / spring fertilizer", "03-01", "04-30"),
  round("fertilization", 2, "Summer fertilizer", "06-01", "07-31"),
  round("fertilization", 3, "Fall fertilizer", "08-15", "09-30"),
  round("broadleaf", 1, "Broadleaf 1", "05-01", "05-31"),
  round("broadleaf", 2, "Broadleaf 2", "06-01", "06-30"),
  round("broadleaf", 3, "Broadleaf 3", "07-01", "07-31"),
  round("irrigation_open", 1, "Spring start-up", "03-01", "04-30"),
  round("irrigation_winterization", 1, "Winterization and blowout", "10-01", "11-30"),
  round("native_areas", 1, "Spring full native mow", "04-01", "05-31"),
  round("native_areas", 2, "Fall full native mow", "09-01", "10-31"),
  { kind: "checklist", serviceKey: "backflow", position: 1, name: "Backflow testing", opensMd: "01-01", dueMd: "12-31", inStandard: false },
  recurring("mowing", "Weekly service", "04-01", "10-31", "26 visits: 2 in April, weekly May through September, 2 in October",
    "Mow, trim, blow, edge, spot spray, pet stations, ponds, bed weeding, drain pans, trash"),
  recurring("native_areas", "Native beauty bands", "04-01", "10-31", "Every other week", "Beauty bands along native areas"),
  recurring("irrigation_inspection", "Irrigation inspection", "04-01", "09-30", "Monthly", "System check"),
  recurring("winter_visits", "Winter site visits", "11-01", "03-31", "Every other week", "Site check, pet stations, trash"),
];
