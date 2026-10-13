import type {
  Contract, ContractService, ContractMonthlyAmount, ContractDocument, ContractStatusHistory,
  CustomerServicePlan, CustomerRateSheet, Customer, PropertyManagementCompany, RateCardItem,
  TermLegacySource, Agreement, AgreementTerm, TermScopeLine, TermRate, TermBillingMonth,
  TermDocument, TermStatusHistory, BillingType, TermStatus,
} from "@workspace/db";
import { LEGACY_BILLING_TYPE, LEGACY_CONTRACT_LINE, LEGACY_SERVICE_TO_SCOPE, SCOPE_CATALOG } from "../shared/contractCatalog";

export interface CopyInput {
  companyId: string;
  contracts: Contract[];
  services: ContractService[];
  monthlyAmounts: ContractMonthlyAmount[];
  documents: ContractDocument[];
  history: ContractStatusHistory[];
  servicePlans: CustomerServicePlan[];
  rateSheets: CustomerRateSheet[];
  customers: Customer[];
  managementCompanies: PropertyManagementCompany[];
  legacySources: TermLegacySource[];
  rateCard: RateCardItem[];
}
export interface TermReport {
  legacyContractIds: string[];
  seasonLabel: string; startDate: string; endDate: string;
  status: string; billingType: string; annualPriceCents: number | null;
  scope: Array<{ serviceKey: string; quantity: number | null }>;
  flags: string[];
}
export interface CustomerReport {
  customerId: string; customerName: string;
  agreements: Array<{ line: "landscape" | "snow"; terms: TermReport[] }>;
  // Failed customers remain visible but are never counted as copied.
  error?: string;
}
export interface CopyReport {
  dryRun: boolean;
  summary: { customers: number; agreements: number; terms: number; scopeLines: number;
    billingMonths: number; documents: number; needsReview: number; alreadyCopied: number };
  customers: CustomerReport[];
  ignoredServicePlans: number;
  failures: Array<{ customerId: string; customerName: string; error: string }>;
}
type WithoutContext<T> = Omit<T, "id" | "companyId" | "termId" | "createdAt" | "updatedAt">;
export interface TermPlan {
  report: TermReport;
  term: Omit<AgreementTerm, "id" | "companyId" | "agreementId" | "renewedFromTermId" | "createdBy" | "createdAt" | "updatedAt">;
  renewedFromIndex: number | null;
  scope: WithoutContext<TermScopeLine>[];
  rates: WithoutContext<TermRate>[];
  billingMonths: WithoutContext<TermBillingMonth>[];
  documents: Array<WithoutContext<TermDocument> & { createdAt: Date }>;
  history: Array<WithoutContext<TermStatusHistory> & { createdAt: Date }>;
}
export interface CustomerPlan {
  report: CustomerReport;
  agreements: Array<{
    agreement: Pick<Agreement, "customerId" | "line" | "propertyManagementCompanyId">;
    terms: TermPlan[];
  }>;
}
export interface CopyPlan { report: CopyReport; customers: CustomerPlan[] }

const ordered = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar arithmetic, clamping leap-day anniversaries rather than overflowing into March. */
export function assumedEnd(start: string): string {
  const [y, m, d] = start.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(y + 1, m - 1, Math.min(d, lastDay)));
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
}
function normalizeDate(value: Date | string, label: "start" | "end", flag: (s: string) => void): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label} date (stored as ${String(value)})`);
  if (![0, 6, 7].includes(date.getUTCHours())) flag(`Check ${label} date (stored as ${value instanceof Date ? value.toISOString() : value})`);
  return date.toISOString().slice(0, 10);
}
function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k) ?? [];
    bucket.push(row);
    map.set(k, bucket);
  }
  return map;
}
const overrideKeys: Record<string, keyof CustomerRateSheet> = {
  rate_general_labor: "generalLabor", rate_emergency_general_labor: "emergencyGeneralLabor",
  rate_irrigation_labor: "irrigationLabor", rate_emergency_irrigation_labor: "emergencyIrrigationLabor",
  rate_hand_shovel: "handShovelLabor", rate_plow_truck: "plowTruck", rate_skid_loader: "skidSteer",
  rate_atv: "atv", rate_ice_melt: "iceMeltMaterial", rate_ice_melt_application: "iceMeltApplicationLabor",
};

/** Company-scoped, read-only, deterministic planning. No UUID generation or database calls. */
export function planLegacyCopy(input: CopyInput, dryRun = true): CopyPlan {
  const scoped = <T extends { companyId: string }>(rows: T[]) => ordered(rows.filter(r => r.companyId === input.companyId) as (T & { id: string })[]);
  const contracts = scoped(input.contracts);
  const contractIds = new Set(contracts.map(c => c.id));
  const links = new Set(scoped(input.legacySources).map(s => s.legacyContractId));
  const remaining = contracts.filter(c => !links.has(c.id));
  const services = indexBy(scoped(input.services).filter(s => contractIds.has(s.contractId)), s => s.contractId);
  const amounts = indexBy(scoped(input.monthlyAmounts).filter(s => contractIds.has(s.contractId)), s => s.contractId);
  const documents = indexBy(scoped(input.documents).filter(s => contractIds.has(s.contractId)), s => s.contractId);
  // History has no company column: its contract relationship is the scope boundary.
  const history = indexBy(ordered(input.history.filter(h => contractIds.has(h.contractId))), h => h.contractId);
  const plans = indexBy(scoped(input.servicePlans), p => p.customerId);
  const sheets = new Map(scoped(input.rateSheets).map(s => [s.customerId, s]));
  const customers = new Map(scoped(input.customers).map(c => [c.id, c]));
  const managers = new Map(scoped(input.managementCompanies).map(c => [c.id, c]));
  const rates = scoped(input.rateCard).filter(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder || a.rateKey.localeCompare(b.rateKey));
  const report: CopyReport = {
    dryRun, summary: { customers: 0, agreements: 0, terms: 0, scopeLines: 0, billingMonths: 0,
      documents: 0, needsReview: 0, alreadyCopied: contracts.filter(c => links.has(c.id)).length },
    customers: [], ignoredServicePlans: 0, failures: [],
  };
  // Count against all source seasons, including already copied ones on a repeat preview.
  const matchingYears = new Set(contracts.map(c => `${c.customerId}:${new Date(c.startDate).getUTCFullYear()}`));
  report.ignoredServicePlans = scoped(input.servicePlans).filter(p => !matchingYears.has(`${p.customerId}:${p.year}`)).length;
  const result: CopyPlan = { report, customers: [] };
  const grouped = [...indexBy(remaining, c => c.customerId)].sort(([a], [b]) =>
    (customers.get(a)?.name ?? a).localeCompare(customers.get(b)?.name ?? b) || a.localeCompare(b));
  for (const [customerId, oldContracts] of grouped) {
    const customer = customers.get(customerId);
    const customerReport: CustomerReport = { customerId, customerName: customer?.name ?? customerId, agreements: [] };
    report.customers.push(customerReport);
    try {
      if (!customer) throw new Error("Customer is not in the active company");
      if (oldContracts.some(c => !LEGACY_CONTRACT_LINE[c.serviceType])) throw new Error("Unknown legacy contract line");
      const manager = customer.propertyManagementCompanyId ? managers.get(customer.propertyManagementCompanyId) : undefined;
      if (customer.propertyManagementCompanyId && !manager) throw new Error("Property management company is not in the active company");
      const customerPlan: CustomerPlan = { report: customerReport, agreements: [] };
      const allLines = new Set(contracts.filter(c => c.customerId === customerId).map(c => LEGACY_CONTRACT_LINE[c.serviceType]));
      for (const line of ["landscape", "snow"] as const) {
        const lineContracts = oldContracts.filter(c => LEGACY_CONTRACT_LINE[c.serviceType] === line);
        if (!lineContracts.length) continue;
        const normalized = lineContracts.map(contract => {
          const flags: string[] = [];
          const start = normalizeDate(contract.startDate, "start", s => flags.push(s));
          const end = contract.endDate ? normalizeDate(contract.endDate, "end", s => flags.push(s)) : assumedEnd(start);
          if (!contract.endDate) flags.push("Had no end date; assumed 12 months");
          if (end < start) throw new Error(`End date precedes start date for contract ${contract.id}`);
          return { contract, start, end, flags };
        });
        const groups = [...indexBy(normalized, c => `${c.start}/${c.end}`)].sort(([a], [b]) => a.localeCompare(b));
        const agreementReport = { line, terms: [] as TermReport[] };
        customerReport.agreements.push(agreementReport);
        const agreementPlan = {
          agreement: { customerId, line, propertyManagementCompanyId: customer.propertyManagementCompanyId },
          terms: [] as TermPlan[],
        };
        customerPlan.agreements.push(agreementPlan);
        for (const [, group] of groups) {
          const { start, end } = group[0];
          const old = group.map(g => g.contract);
          const ids = old.map(c => c.id);
          const flags: string[] = [];
          const flag = (s: string) => { if (!flags.includes(s)) flags.push(s); };
          group.flatMap(g => g.flags).forEach(flag);
          if (allLines.size > 1) flag("Has separate landscape and snow agreements; merge into one Both contract if they're signed as one");
          let status: TermStatus = "active";
          if (!old.some(c => c.status === "active") && old.some(c => c.status === "paused")) flag("Was paused in the old system");
          if (old.every(c => c.status === "ended")) {
            status = agreementPlan.terms.length < groups.length - 1 ? "renewed" : "lost";
            if (status === "lost") flag("Old status was ended; confirm whether it was lost or just expired");
          }
          const notes = old.map(c => c.notes).filter((n): n is string => !!n);
          const termAmounts = ids.flatMap(id => amounts.get(id) ?? []);
          const patterns = [...new Set(old.map(c => c.billingPattern))];
          const billingType = (line === "snow" && !termAmounts.length
            ? "time_and_materials" : LEGACY_BILLING_TYPE[patterns[0]]) as BillingType;
          if (line === "snow" && !termAmounts.length) notes.push(`Old billing pattern: ${patterns[0]}`);
          if (line === "snow" && termAmounts.length) flag("Snow contract had monthly amounts; check whether it's a flat seasonal price");
          if (patterns.length > 1) flag(`Billing patterns differed: ${patterns.join(", ")}`);
          const totals = new Map<number, number>();
          for (const a of termAmounts) totals.set(a.month, (totals.get(a.month) ?? 0) + a.amount);
          const billingMonths: TermPlan["billingMonths"] = [];
          const [sy] = start.split("-").map(Number);
          const [ey] = end.split("-").map(Number);
          for (const [month, amountCents] of [...totals].sort(([a], [b]) => a - b)) {
            const candidates: string[] = [];
            // Unsupported long windows are rejected without an unbounded iteration.
            if (end <= assumedEnd(start) && month >= 1 && month <= 12) {
              for (let year = sy; year <= ey; year++) {
                const date = `${year}-${String(month).padStart(2, "0")}-01`;
                 // A partial starting month still belongs to the term. Legacy
                 // month numbers have no year, so inspect every overlapping
                 // calendar month rather than dropping it at the day boundary.
                 if (date.slice(0, 7) >= start.slice(0, 7) && date.slice(0, 7) <= end.slice(0, 7)) candidates.push(date);
              }
            }
             if (candidates.length > 1) {
               flag(`Monthly amount for ${months[month - 1]} has an ambiguous year (${candidates.map(date => date.slice(0, 4)).join(" or ")}); check it`);
               notes.push(`Unplaced monthly amount for ${months[month - 1]}: $${(amountCents / 100).toFixed(2)} (possible billing months: ${candidates.join(", ")})`);
             } else if (candidates.length === 0) flag(`Monthly amount for ${months[month - 1] ?? month} doesn't fit the term dates`);
            else if (amountCents !== 0) billingMonths.push({ month: candidates[0], amountCents });
          }
          billingMonths.sort((a, b) => a.month.localeCompare(b.month));
          const annualPriceCents = billingMonths.length ? billingMonths.reduce((sum, a) => sum + a.amountCents, 0) : null;
          if (line === "landscape" && !termAmounts.length) flag("No monthly amounts entered");
          for (const c of old.filter(c => c.hasMobilizationFee)) {
            notes.push(`Mobilization fee $${(c.mobilizationFeeAmount / 100).toFixed(2)}`);
            flag("Had a mobilization fee; decide where it belongs");
          }
          const scope = new Map<string, WithoutContext<TermScopeLine>>();
          const mapService = (service: string) => {
            const mapping = LEGACY_SERVICE_TO_SCOPE[service];
            if (!mapping) flag(`Unknown service type ${service}`);
            else if (mapping.review) flag(`Mapped ${service} to ${mapping.key}; check it`);
            return mapping?.key ?? "other";
          };
          const addScope = (key: string, quantity: number, spread: number[] | null, details: Record<string, unknown>, note: string | null) => {
            const catalogIndex = SCOPE_CATALOG.findIndex(c => c.key === key);
            const catalog = SCOPE_CATALOG[catalogIndex];
            const previous = scope.get(key);
            if (previous) {
              flag(`Combined two ${key} lines`);
              previous.quantity = (previous.quantity ?? 0) + quantity;
              if (spread) previous.monthSpread = spread.map((n, i) => n + (previous.monthSpread?.[i] ?? 0));
              for (const [k, v] of Object.entries(details)) {
                if (k in (previous.details as Record<string, unknown>) && (previous.details as Record<string, unknown>)[k] !== v) {
                  flag(`Conflicting ${key} details; check it`);
                  previous.notes = [previous.notes, `Additional ${k}: ${JSON.stringify(v)}`].filter(Boolean).join("\n");
                } else (previous.details as Record<string, unknown>)[k] = v;
              }
              previous.notes = [previous.notes, note].filter(Boolean).join("\n") || null;
            } else scope.set(key, { serviceKey: key, line: catalog.line, included: true, quantity,
              unit: catalog.unit, monthSpread: spread ? [...spread] : null, details: { ...details },
              priceCents: null, notes: note, sortOrder: catalogIndex });
          };
          for (const service of ids.flatMap(id => services.get(id) ?? [])) {
            const { stationCount, ...parameters } = service.serviceParameters ?? {};
            addScope(mapService(service.serviceType), service.annualCount, service.monthlyDistribution,
              { ...parameters, ...(stationCount !== undefined ? { stations: stationCount } : {}) }, service.notes);
          }
          // Compare all derived plans against the contract-only scope, before adding independent plans.
          for (const plan of plans.get(customerId) ?? []) {
            if (plan.year !== sy) continue;
            const mapping = LEGACY_SERVICE_TO_SCOPE[plan.serviceCategory];
            const key = mapping?.key ?? "other";
            if (plan.sourceContractRef) {
              if (!ids.includes(plan.sourceContractRef)) continue;
              const copied = scope.get(key)?.quantity ?? 0;
              if (plan.expectedQuantity !== copied) flag(`Service plan says ${plan.expectedQuantity} ${key}, contract says ${copied}`);
            } else {
              const catalog = SCOPE_CATALOG.find(c => c.key === key)!;
              // A source-less snow plan is not evidence for landscape scope, or vice versa.
              if ((line === "snow") !== (catalog.line === "snow") || scope.has(key)) continue;
              addScope(mapService(plan.serviceCategory), plan.expectedQuantity, null, {}, plan.notes);
              flag("Added from a service plan, not the contract");
            }
          }
          const sheet = sheets.get(customerId);
          if (sheet?.snowBlower != null && sheet.atv != null && sheet.snowBlower !== sheet.atv)
            flag("Rate sheet has separate ATV and snowblower rates; the new card has one");
          if (sheet?.operatorLabor != null) flag("Rate sheet has an operator labor rate with no place on the new card");
          const termRates = rates.filter(r => (line === "snow" ? ["snow", "general"] : ["landscape", "irrigation", "general"]).includes(r.line)).map(r => {
            const override = sheet && overrideKeys[r.rateKey] ? sheet[overrideKeys[r.rateKey]] : null;
            const price = r.rateKey === "rate_atv" ? sheet?.atv ?? sheet?.snowBlower : override;
            return { rateKey: r.rateKey, line: r.line, category: r.category, label: r.label,
              priceCents: typeof price === "number" ? price : r.priceCents, priceText: r.priceText,
              unit: r.unit, minimum: r.minimum, cardPriceCents: r.priceCents,
              cardPriceText: r.priceText, sortOrder: r.sortOrder };
          });
          const scopeLines = [...scope.values()].sort((a, b) => a.sortOrder - b.sortOrder);
          const termReport: TermReport = { legacyContractIds: ids, seasonLabel: sy === ey ? String(sy) : `${sy}–${String(ey).slice(-2)}`,
            startDate: start, endDate: end, status, billingType, annualPriceCents,
            scope: scopeLines.map(s => ({ serviceKey: s.serviceKey, quantity: s.quantity })), flags };
          const mapStatus = (s: string): TermStatus => s === "ended" ? status : "active";
          const termPlan: TermPlan = {
            report: termReport, renewedFromIndex: agreementPlan.terms.length ? agreementPlan.terms.length - 1 : null,
            term: { seasonLabel: termReport.seasonLabel, startDate: start, endDate: end, status, billingType,
              annualPriceCents, renewalIncreasePct: null, legalName: null, managingAgentName: manager?.name ?? customer.managementCompany ?? null,
              projectContact: null, contactPhone: null, contactEmail: null,
              projectAddress: `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`,
              snowTriggers: null, po: old[0].po, sentAt: null, signedAt: null, masterId: null,
              needsReview: flags.length > 0, reviewNote: flags.length ? flags.join("; ") : null, notes: notes.join("\n") || null },
            scope: scopeLines, rates: termRates, billingMonths,
            documents: ids.flatMap(id => documents.get(id) ?? []).map(d => ({
              kind: "other", version: d.version, filename: d.filename, storageObjectPath: d.storageObjectPath,
              mimeType: d.mimeType, fileSize: d.fileSize, uploadedBy: d.uploadedBy, masterId: null, createdAt: new Date(d.uploadedAt),
            })),
            history: ids.flatMap(id => history.get(id) ?? []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id)).map(h => ({
              oldStatus: h.oldStatus ? mapStatus(h.oldStatus) : null, newStatus: mapStatus(h.newStatus),
              changedBy: h.changedBy, createdAt: new Date(h.createdAt), note: `Old system: ${h.oldStatus ?? "null"} → ${h.newStatus}`,
            })),
          };
          agreementPlan.terms.push(termPlan);
          agreementReport.terms.push(termReport);
        }
        if (agreementPlan.terms.filter(t => t.term.status === "active").length > 1) {
          for (const t of agreementPlan.terms.filter(t => t.term.status === "active")) {
            t.report.flags.push("More than one active season for this customer and line");
            t.term.needsReview = true;
            t.term.reviewNote = t.report.flags.join("; ");
          }
        }
      }
      result.customers.push(customerPlan);
    } catch (error) {
      customerReport.agreements = [];
      customerReport.error = error instanceof Error ? error.message : String(error);
      report.failures.push({ customerId, customerName: customerReport.customerName, error: customerReport.error });
    }
  }
  report.summary = summarizePlans(result.customers, report.summary.alreadyCopied);
  return result;
}

export function summarizePlans(customers: CustomerPlan[], alreadyCopied: number): CopyReport["summary"] {
  const agreements = customers.flatMap(c => c.agreements);
  const terms = agreements.flatMap(a => a.terms);
  return { customers: customers.length, agreements: agreements.length, terms: terms.length,
    scopeLines: terms.reduce((n, t) => n + t.scope.length, 0),
    billingMonths: terms.reduce((n, t) => n + t.billingMonths.length, 0),
    documents: terms.reduce((n, t) => n + t.documents.length, 0),
    needsReview: terms.filter(t => t.report.flags.length).length, alreadyCopied };
}
