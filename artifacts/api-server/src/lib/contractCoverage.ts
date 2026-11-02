import type { AgreementTerm, TermScopeLine, Customer, Agreement } from "@workspace/db";
import { compareTermPriority } from "./contractCenterService";
import { addCalendarDays } from "./companyDay";
import { scopeServiceByKey } from "../shared/contractCatalog";

export interface CoverageInputs {
  customers: Pick<Customer, "id" | "parentCustomerId">[];
  agreements: Pick<Agreement, "id" | "customerId">[];
  terms: AgreementTerm[];
  scopes: TermScopeLine[];
}
/** Shared operational Contract Center coverage, not the board's display fallback.
 * Own property wins even when its scope excludes a service (owner-approved).
 * Parent means immediate parent only, matching loadContractList.
 */
export function coverageResolver(data: CoverageInputs) {
  const parents = new Map(data.customers.map(c => [c.id, c.parentCustomerId]));
  const owners = new Map(data.agreements.filter(a => parents.has(a.customerId)).map(a => [a.id, a.customerId]));
  const termsByOwner = new Map<string, AgreementTerm[]>();
  const scopes = new Map<string, TermScopeLine[]>();
  for (const term of data.terms) {
    const owner = owners.get(term.agreementId);
    if (!owner || !["signed", "active", "renewed"].includes(term.status)) continue;
    const group = termsByOwner.get(owner) ?? []; group.push(term); termsByOwner.set(owner, group);
  }
  for (const scope of data.scopes) {
    const group = scopes.get(scope.termId) ?? []; group.push(scope); scopes.set(scope.termId, group);
  }
  return (customerId: string | null | undefined, serviceKey: string, year: number) => {
    if (!customerId || !parents.has(customerId)) return null;
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const line = scopeServiceByKey(serviceKey)?.line === "snow" ? "snow" : "landscape";
    const eligible = (owner?: string | null) => (owner ? termsByOwner.get(owner) ?? [] : [])
      .filter(t => (t.line === line || t.line === "both") && t.startDate <= to && t.endDate >= from).sort(compareTermPriority);
    const term = eligible(customerId)[0] ?? eligible(parents.get(customerId))[0];
    const scope = term && scopes.get(term.id)?.find(s => s.serviceKey === serviceKey && s.included);
    if (!term || !scope) return null;
    const months = scope.monthSpread?.flatMap((n, i) => n > 0 ? [i + 1] : []) ?? [];
    const first = months[0], last = months[months.length - 1];
    let window: { start: string; end: string } | null = null;
    if (first && last) {
      const start = [`${year}-${String(first).padStart(2, "0")}-01`, term.startDate].sort().at(-1)!;
      const endMonth = last === 12 ? `${year + 1}-01-01` : `${year}-${String(last + 1).padStart(2, "0")}-01`;
      const end = [addCalendarDays(endMonth, -1), term.endDate].sort()[0];
      if (start <= end) window = { start, end };
    }
    return { term, scope, window, months };
  };
}
