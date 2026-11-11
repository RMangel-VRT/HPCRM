import { CAMPAIGN_TERM_STATUSES } from "../../../../lib/db/src/serviceCalendarContracts";
import type { DemandGapKind, DemandReport, DemandRound, DemandTimingProgram } from "../../../../lib/db/src/campaignGenerationContracts";
import type { CustomerContractInputs } from "./customerContractSummary";
import { coverageResolver } from "./contractCoverage";
import { SCOPE_CATALOG } from "../shared/contractCatalog";

/** Pure governing monthly demand. No catalog quantity/month defaults, no writes. */
export function campaignDemand(inputs: CustomerContractInputs & { programs: DemandTimingProgram[] }, year: number, _today: string): DemandReport {
  if (!inputs.scope) throw new Error("Campaign demand requires scope inputs");
  const resolve = coverageResolver({ ...inputs, scopes: inputs.scope }, { statuses: CAMPAIGN_TERM_STATUSES });
  const rounds = new Map<string, DemandRound>(), gaps: DemandReport["gaps"] = [];
  const seenGaps = new Set<string>();
  // Legacy chemical still honors stated contract months; new selection hides it.
  const services = SCOPE_CATALOG.filter(s => s.scheduling === "campaign" || s.scheduling === "legacy");
  for (const property of inputs.customers.filter(c => c.isParent !== "true")) {
    for (const service of services) {
      for (let m = 0; m < 12; m++) {
        const roundMonth = `${year}-${String(m + 1).padStart(2, "0")}-01`;
        const coverage = resolve.forMonth(property.id, service.key, roundMonth);
        if (!coverage) continue;
        const { term, scope, lines } = coverage;
        const gap = (kind: DemandGapKind, count?: number, monthTotal?: number) => {
          const key = `${term.id}:${service.key}:${kind}`;
          if (seenGaps.has(key)) return;
          seenGaps.add(key);
          gaps.push({ propertyId: property.id, propertyName: property.name, termId: term.id, agreementId: term.agreementId,
            seasonLabel: term.seasonLabel, serviceKey: service.key, kind, count, monthTotal });
        };
        if (lines.length > 1 && lines.some(l => l.included)) { gap("duplicate_lines"); continue; }
        if (!scope) continue;
        const quantity = scope.quantity;
        if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 24)) { gap("invalid_count"); continue; }
        // An explicit zero never consumes a standard/program or generates rounds.
        if (quantity === 0) continue;
        const standard = inputs.programs.find(p => p.serviceKey === service.key && p.isStandard);
        const count = quantity ?? standard?.rounds;
        if (count == null) { gap("no_count"); continue; }
        if (!Number.isInteger(count) || count < 1 || count > 24) { gap("invalid_count"); continue; }
        const months = scope.monthSpread;
        if (months !== null && (months.length !== 12 || months.some(n => !Number.isSafeInteger(n) || n < 0))) {
          gap("invalid_count", count); continue;
        }
        const sum = months?.reduce((a, b) => a + b, 0) ?? 0;
        if (sum > 24) { gap("invalid_count", count, sum); continue; }
        const stated = sum > 0;
        // Stated months win even on a mismatch: report it, never redistribute.
        if (stated && sum !== count) gap("count_mismatch", count, sum);
        const program = inputs.programs.find(p => p.serviceKey === service.key && p.rounds === count);
        if (!stated && !program) { gap("no_timing", count); continue; }
        const n = (stated ? months! : program!.monthSpread)[m];
        for (let seq = 1; seq <= n; seq++) {
          const key = `${service.key}:${roundMonth}:${seq}`;
          let round = rounds.get(key);
          if (!round) { round = { serviceKey: service.key, roundMonth, roundSeq: seq, members: [] }; rounds.set(key, round); }
          round.members.push({ propertyId: property.id, propertyName: property.name, termId: term.id, agreementId: term.agreementId,
            seasonLabel: term.seasonLabel, termStatus: term.status, timing: stated ? "contract" : "program",
            count: quantity === null ? "standard" : "contract" });
        }
      }
    }
  }
  return { rounds: [...rounds.values()].sort((a, b) => a.roundMonth.localeCompare(b.roundMonth) ||
    services.findIndex(s => s.key === a.serviceKey) - services.findIndex(s => s.key === b.serviceKey) || a.roundSeq - b.roundSeq)
    .map(r => ({ ...r, members: r.members.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.propertyId.localeCompare(b.propertyId)) })),
  gaps };
}
