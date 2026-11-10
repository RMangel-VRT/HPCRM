import { z } from "zod/v4";

/** Browser-safe contracts. The caller supplies the catalog, never a second service registry. */
export type SchedulingService = { key: string; scheduling: string };
export const CAMPAIGN_TERM_STATUSES = ["signed", "active", "renewed", "sent", "up_for_renewal"] as const;
export const programMonths = z.array(z.number().int().min(0).max(4)).length(12);
export function serviceProgramSchema(catalog: readonly SchedulingService[]) {
  return z.object({
    serviceKey: z.string().refine(key => catalog.some(s => s.key === key && s.scheduling === "campaign"), "Choose a campaign service"),
    rounds: z.number().int().min(1).max(24),
    monthSpread: programMonths,
    isStandard: z.boolean(),
  }).strict().superRefine((v, ctx) => {
    if (v.monthSpread.reduce((sum, n) => sum + n, 0) !== v.rounds)
      ctx.addIssue({ code: "custom", path: ["monthSpread"], message: `Place exactly ${v.rounds} rounds` });
  });
}
export type ServiceProgramInput = z.infer<ReturnType<typeof serviceProgramSchema>>;
export type ServiceProgramDto = ServiceProgramInput & { id: string; updatedAt: string };
export type UsageLine = {
  termId: string; agreementId: string; customerId: string; customerName: string;
  serviceKey: string; quantity: number | null; monthSpread: number[] | null;
};
export type UsageProblem = {
  termId: string; agreementId: string; customerId: string; customerName: string;
  reason: "duplicate" | "invalid_count" | "invalid_months" | "zero" | "no_count";
};
export type ServiceUsage = {
  serviceKey: string; seasons: number;
  counts: { rounds: number; seasons: number; withoutMonths: number }[];
  noCount: number; noCountWithoutMonths: number;
  zero: number; invalid: number; duplicate: number;
  problems: UsageProblem[];
};
export type ServiceProgramsResponse = { rows: ServiceProgramDto[]; countsInUse: ServiceUsage[] };

/** Raw entered eligible seasons, NOT governing demand or branch-expanded coverage.
 * The loader owns company/status/end-date/included filtering. Each term/service is
 * counted once. Ambiguous duplicates are reported, never silently picked or summed.
 */
export function summarizeServiceUsage(catalog: readonly SchedulingService[], lines: UsageLine[]): ServiceUsage[] {
  return catalog.filter(s => s.scheduling === "campaign").map(service => {
    const result: ServiceUsage = { serviceKey: service.key, seasons: 0, counts: [], noCount: 0, noCountWithoutMonths: 0, zero: 0, invalid: 0, duplicate: 0, problems: [] };
    const groups = new Map<string, UsageLine[]>();
    for (const line of lines.filter(l => l.serviceKey === service.key)) {
      groups.set(line.termId, [...(groups.get(line.termId) ?? []), line]);
    }
    for (const group of groups.values()) {
      result.seasons++;
      const l = group[0], q = l.quantity, months = l.monthSpread;
      const problem = (reason: UsageProblem["reason"]) => result.problems.push({
        termId: l.termId, agreementId: l.agreementId, customerId: l.customerId, customerName: l.customerName, reason,
      });
      if (group.length > 1) { result.duplicate++; problem("duplicate"); continue; }
      if (q !== null && (!Number.isInteger(q) || q < 0 || q > 24)) {
        result.invalid++; problem("invalid_count"); continue;
      }
      const validMonths = months === null || (months.length === 12 && months.every(n => Number.isInteger(n) && n >= 0));
      const sum = months?.reduce((a, b) => a + b, 0) ?? 0;
      if (!validMonths || (sum > 0 && q !== null && sum !== q)) {
        result.invalid++; problem("invalid_months"); continue;
      }
      const missingMonths = months === null || sum === 0;
      if (q === 0) { result.zero++; problem("zero"); continue; }
      if (q === null) {
        result.noCount++; if (missingMonths) result.noCountWithoutMonths++;
        problem("no_count"); continue;
      }
      let row = result.counts.find(c => c.rounds === q);
      if (!row) { row = { rounds: q, seasons: 0, withoutMonths: 0 }; result.counts.push(row); }
      row.seasons++; if (missingMonths) row.withoutMonths++;
    }
    result.counts.sort((a, b) => a.rounds - b.rounds);
    return result;
  });
}
