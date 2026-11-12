import { CAMPAIGN_TERM_STATUSES } from "../../../../lib/db/src/serviceCalendarContracts";
import type { DemandGapKind, DemandReport, DemandRound } from "../../../../lib/db/src/campaignGenerationContracts";
import type { ServiceCalendar } from "@workspace/db";
import type { CustomerContractInputs } from "./customerContractSummary";
import { coverageResolver } from "./contractCoverage";
import { SCOPE_CATALOG } from "../shared/contractCatalog";

export type DemandCalendarEntry = Pick<ServiceCalendar, "id" | "serviceKey" | "kind" | "position" | "name" | "opensMd" | "dueMd" | "inStandard">;
export const calendarInstance = (entry: DemandCalendarEntry, year: number) => ({
  serviceKey: entry.serviceKey, calendarEntryId: entry.id, roundYear: year, name: entry.name,
  opens: `${entry.dueMd < entry.opensMd ? year - 1 : year}-${entry.opensMd}`,
  due: `${year}-${entry.dueMd}`,
});

/** Pure calendar demand. Deadline alone selects the contract. No catalog defaults. */
export function campaignDemand(inputs: CustomerContractInputs & { calendar: DemandCalendarEntry[] }, year: number, _today: string): DemandReport {
  if (!inputs.scope) throw new Error("Campaign demand requires scope inputs");
  const resolve = coverageResolver({ ...inputs, scopes: inputs.scope }, { statuses: CAMPAIGN_TERM_STATUSES });
  const rounds = new Map<string, DemandRound>(), gaps: DemandReport["gaps"] = [];
  const seenGaps = new Set<string>();
  const services = SCOPE_CATALOG.filter(s => ["campaign", "checklist", "legacy"].includes(s.scheduling));
  for (const property of inputs.customers.filter(c => c.isParent !== "true")) {
    for (const service of services) {
      const entries = inputs.calendar.filter(e => e.serviceKey === service.key && e.kind !== "recurring")
        .sort((a, b) => a.position - b.position);
      const instances = entries.map(e => calendarInstance(e, year));
      // Include months only to surface gaps when a service has no calendar at all.
      // Selection of obligations below ALWAYS uses the exact deadline.
      const coverages = new Map<string, NonNullable<ReturnType<typeof resolve.forDate>>>();
      for (const date of [...instances.map(i => i.due), ...Array.from({ length: 12 }, (_, m) => `${year}-${String(m + 1).padStart(2, "0")}-01`),
        ...inputs.terms.filter(t => t.startDate.startsWith(String(year))).map(t => t.startDate)]) {
        const coverage = resolve.forDate(property.id, service.key, date);
        if (coverage) coverages.set(coverage.term.id, coverage);
      }
      for (const { term, scope, lines } of coverages.values()) {
        const gap = (kind: DemandGapKind, extra: Partial<DemandReport["gaps"][number]> = {}) => {
          const id = `${property.id}:${term.id}:${service.key}:${kind}`;
          if (seenGaps.has(id)) return;
          seenGaps.add(id);
          gaps.push({ propertyId: property.id, propertyName: property.name, termId: term.id, agreementId: term.agreementId,
            seasonLabel: term.seasonLabel, serviceKey: service.key, kind, ...extra });
        };
        if (lines.length > 1 && lines.some(l => l.included)) { gap("duplicate_lines"); continue; }
        if (!scope) continue;
        const quantity = scope.quantity;
        if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 24)) { gap("invalid_count"); continue; }
        if (quantity === 0) continue;
        if (service.scheduling === "legacy") {
          const split = inputs.scope.some(l => l.termId === term.id && ["fertilization", "broadleaf"].includes(l.serviceKey));
          gap("legacy_chemical", { informational: split }); continue;
        }
        const standard = entries.filter(e => e.inStandard);
        const count = quantity ?? (standard.length || undefined);
        let selected: typeof instances = [];
        if (!entries.length) { gap("no_count"); continue; }
        if (service.scheduling === "checklist") selected = instances;
        else if (count === undefined) gap("no_count");
        else if (count > entries.length) gap("needs_rounds", { count });
        else if (quantity === null) selected = instances.filter(i => standard.some(e => e.id === i.calendarEntryId));
        else selected = instances.slice(0, count);
        for (const instance of selected) {
          const governing = resolve.forDate(property.id, service.key, instance.due);
          if (governing?.term.id !== term.id) continue;
          const id = `${instance.calendarEntryId}:${year}`;
          let round = rounds.get(id);
          if (!round) { round = { ...instance, members: [] }; rounds.set(id, round); }
          round.members.push({ propertyId: property.id, propertyName: property.name, termId: term.id, agreementId: term.agreementId,
            seasonLabel: term.seasonLabel, termStatus: term.status, timing: "calendar",
            count: quantity === null ? "standard" : "contract" });
        }
      }
    }
  }
  return { rounds: [...rounds.values()].sort((a, b) => a.due.localeCompare(b.due) || a.calendarEntryId.localeCompare(b.calendarEntryId))
    .map(r => ({ ...r, members: r.members.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.propertyId.localeCompare(b.propertyId)) })), gaps };
}
