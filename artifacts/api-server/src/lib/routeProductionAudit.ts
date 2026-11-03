import { coverageResolver, type CoverageInputs } from "./contractCoverage";
import { planPlannerRoutes, type PlannerInputs } from "./importPlannerRoutes";
import { companyToday } from "./companyDay";

/** Sanitized SELECT result, not a second implementation of import/coverage.
 * No import invocation or approval mutation occurs here.
 */
export interface ProductionRouteAuditInput extends PlannerInputs {
  companyId: string;
  observedAt: string;
  agreements: CoverageInputs["agreements"];
  terms: CoverageInputs["terms"];
  scopes: CoverageInputs["scopes"];
  properties: PlannerInputs["properties"] & CoverageInputs["customers"];
}
export function planProductionRouteAudit(input: ProductionRouteAuditInput, templateId: string, today = companyToday()) {
  const matches = input.templates.filter(t => t.companyId === input.companyId
    && t.id === templateId && t.name === "Randy And Luciano (Copy)");
  if (matches.length !== 1) throw new Error("Authorized named template does not resolve uniquely within the intended company");
  const resolve = coverageResolver({ customers: input.properties, agreements: input.agreements, terms: input.terms, scopes: input.scopes });
  const { proposed, decisionSnapshots, ...report } = planPlannerRoutes(input.companyId, input, resolve, today, templateId);
  return { companyId: input.companyId, observedAt: input.observedAt, ...report,
    approvalGatePassed: !report.blocked && proposed.length === 39 && decisionSnapshots.length === 0 };
}
