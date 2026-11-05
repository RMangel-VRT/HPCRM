import type { ResolveCoverage } from "./routeFill";
import { companyToday } from "./companyDay";

export function reportYear(customerId: string | null, service: string, resolve: ResolveCoverage, today = companyToday()) {
  const year = Number(today.slice(0, 4)), current = resolve(customerId, service, year);
  return current && current.term.endDate >= today && (!current.window || current.window.end >= today) ? year : year + 1;
}
export function contractReport(coverage: ReturnType<ResolveCoverage>) {
  if (!coverage) return null;
  return {
    agreementId: coverage.term.agreementId, termId: coverage.term.id,
    seasonLabel: coverage.term.seasonLabel,
    sourceDescription: `${coverage.term.seasonLabel} contract`,
    quantity: coverage.scope.quantity,
    monthSpread: coverage.scope.monthSpread ?? null,
    startDate: coverage.term.startDate, endDate: coverage.term.endDate,
    window: coverage.window,
  };
}
