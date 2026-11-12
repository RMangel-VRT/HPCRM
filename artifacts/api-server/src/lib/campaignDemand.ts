import type { DemandGapKind, DemandReport, DemandRound, DemandNonmember } from "../../../../lib/db/src/campaignGenerationContracts";
import type { ServiceCalendar } from "@workspace/db";
import type { CustomerContractInputs } from "./customerContractSummary";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { inStandardPackage } from "@workspace/api-zod/contractScope";
import { campaignDemandCoverage } from "./campaignDemandCoverage";

export type DemandCalendarEntry = Pick<ServiceCalendar, "id" | "serviceKey" | "kind" | "position" | "name" | "opensMd" | "dueMd" | "inStandard"> &
  { companyId?: string };
export const calendarInstance = (entry: DemandCalendarEntry, year: number) => ({
  serviceKey: entry.serviceKey, calendarEntryId: entry.id, roundYear: year, name: entry.name,
  opens: `${entry.dueMd < entry.opensMd ? year - 1 : year}-${entry.opensMd}`,
  due: `${year}-${entry.dueMd}`,
});

/** Pure deadline demand and authoritative omission classification. Never reads stored months. */
export function campaignDemand(inputs: CustomerContractInputs & { calendar: DemandCalendarEntry[] }, year: number, _today: string): DemandReport {
  if (!inputs.scope) throw new Error("Campaign demand requires scope inputs");
  const rounds = new Map<string, DemandRound>(), gaps: DemandReport["gaps"] = [];
  const seenGaps = new Set<string>();
  const services = SCOPE_CATALOG.filter(s => ["campaign", "checklist", "legacy"].includes(s.scheduling));
  for (const property of inputs.customers.filter(c => c.isParent !== "true")) {
    const calendar = inputs.calendar.filter(e => e.companyId === undefined || e.companyId === property.companyId);
    for (const service of services) {
      const entries = calendar.filter(e => e.serviceKey === service.key && e.kind !== "recurring")
        .sort((a, b) => a.position - b.position);
      const instances = entries.map(e => calendarInstance(e, year));
      const packageService = inStandardPackage(service, calendar);
      // Probe real deadlines plus dates for no-calendar gaps; no synthetic rounds.
      const dates = [...instances.map(i => i.due), ...Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, "0")}-01`),
        ...inputs.terms.filter(t => t.startDate.startsWith(String(year))).map(t => t.startDate)];
      const probes = [...instances.map(instance => ({ date: instance.due, instance })),
        ...[...new Set(dates)].filter(date => !instances.some(i => i.due === date)).map(date => ({ date, instance: undefined }))];
      for (const { date, instance } of probes) {
        const coverage = campaignDemandCoverage(inputs, property.id, service.key, date);
        if (!coverage) continue;
        const { term, scope, lines, renewalPending, blocked } = coverage;
        const gap = (kind: DemandGapKind, extra: Partial<DemandReport["gaps"][number]> = {}) => {
          const id = `${property.id}:${term.id}:${service.key}:${kind}`;
          if (seenGaps.has(id)) return;
          seenGaps.add(id);
          gaps.push({ propertyId: property.id, propertyName: property.name, termId: term.id, agreementId: term.agreementId,
            seasonLabel: term.seasonLabel, serviceKey: service.key, kind, ...extra });
        };
        const omit = (reason: DemandNonmember["reason"]) => {
          if (!instance) return;
          const id = `${instance.calendarEntryId}:${year}`;
          let round = rounds.get(id);
          if (!round) { round = { ...instance, members: [], nonmembers: [] }; rounds.set(id, round); }
          round.nonmembers!.push({ propertyId: property.id, propertyName: property.name, termId: term.id,
            seasonLabel: term.seasonLabel, reason, ...(term.nonRenewalOn ? { nonRenewalOn: term.nonRenewalOn } : {}) });
        };
        // Only-if-listed services never enumerate silent properties.
        if (service.packageDefault === false && !lines.length) continue;
        if (lines.length > 1 && lines.some(l => l.included)) { if (!blocked) gap("duplicate_lines"); continue; }
        const implicit = !lines.length && packageService;
        if (!scope && !implicit) {
          if (lines.length) omit("excluded_by_contract");
          else if (service.scheduling !== "legacy") omit("not_in_package");
          continue;
        }
        const quantity = scope?.quantity ?? null;
        if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 24)) { if (!blocked) gap("invalid_count"); continue; }
        if (quantity === 0) { omit("excluded_by_contract"); continue; }
        if (service.scheduling === "legacy") { if (!blocked) gap("legacy_chemical", { informational: true }); continue; }
        if (blocked) { omit(blocked); continue; }
        const standard = entries.filter(e => e.inStandard);
        const count = quantity ?? (standard.length || undefined);
        if (!entries.length) { gap("no_count"); continue; }
        let selected: typeof instances = [];
        if (service.scheduling === "checklist") selected = instances;
        else if (count === undefined) { gap("no_count"); continue; }
        else if (count > entries.length) { gap("needs_rounds", { count }); continue; }
        else if (quantity === null) selected = instances.filter(i => standard.some(e => e.id === i.calendarEntryId));
        else selected = instances.slice(0, count);
        if (!instance) continue;
        if (!selected.some(i => i.calendarEntryId === instance.calendarEntryId)) { omit("count_covers_fewer"); continue; }
        const id = `${instance.calendarEntryId}:${year}`;
        let round = rounds.get(id);
        if (!round) { round = { ...instance, members: [], nonmembers: [] }; rounds.set(id, round); }
        round.members.push({ propertyId: property.id, propertyName: property.name, termId: term.id, agreementId: term.agreementId,
          seasonLabel: term.seasonLabel, termStatus: term.status, timing: "calendar", renewalPending,
          count: quantity === null ? "standard" : "contract" });
      }
    }
  }
  return { rounds: [...rounds.values()].sort((a, b) => a.due.localeCompare(b.due) || a.calendarEntryId.localeCompare(b.calendarEntryId))
    .map(r => ({ ...r, members: r.members.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.propertyId.localeCompare(b.propertyId)),
      nonmembers: r.nonmembers!.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.propertyId.localeCompare(b.propertyId)) })), gaps };
}
