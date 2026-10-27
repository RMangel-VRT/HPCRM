import type {
  Contract, ContractService, ContractMonthlyAmount, ContractDocument, ContractStatusHistory,
  CustomerServicePlan, CustomerRateSheet, Customer, PropertyManagementCompany, RateCardItem,
  TermLegacySource, Agreement, AgreementTerm, TermScopeLine, TermRate, TermBillingMonth,
  TermDocument, TermStatusHistory, BillingType, TermStatus,
} from "@workspace/db";
import { LEGACY_CONTRACT_LINE, LEGACY_SERVICE_TO_SCOPE, SCOPE_CATALOG } from "../shared/contractCatalog";

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
  agreements: Array<{ line: "landscape" | "snow" | "both"; terms: TermReport[] }>;
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
    // Disabled planner-only grouping hint, never an agreements column.
    agreement: Pick<Agreement, "customerId" | "propertyManagementCompanyId"> & { line: AgreementTerm["line"] };
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
  rate_operator_labor: "operatorLabor", rate_snowblower: "snowBlower",
};

type DocumentIdentity = { storageObjectPath: string; filename: string; fileSize: number };
const sameDocument = (a: DocumentIdentity, b: DocumentIdentity) =>
  (!!a.storageObjectPath && a.storageObjectPath === b.storageObjectPath) ||
  (a.filename === b.filename && a.fileSize === b.fileSize);
const SNOW_AMOUNT_WARNING = "Snow contract had monthly amounts entered, but none of the current snow contracts are flat-rate. Check whether they belong on the landscape contract.";

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
      const normalized = oldContracts.map(contract => {
          const flags: string[] = [];
          const start = normalizeDate(contract.startDate, "start", s => flags.push(s));
          const end = contract.endDate ? normalizeDate(contract.endDate, "end", s => flags.push(s)) : assumedEnd(start);
          if (!contract.endDate) flags.push("Had no end date; assumed 12 months");
          if (end < start) throw new Error(`End date precedes start date for contract ${contract.id}`);
          return { contract, start, end, flags };
      });
      // Determine legacy ended status before merging, then use the more active side.
      const initial = (["landscape", "snow"] as const).flatMap(line => {
        const groups = [...indexBy(normalized.filter(c => LEGACY_CONTRACT_LINE[c.contract.serviceType] === line),
          c => `${c.start}/${c.end}`)].sort(([a], [b]) => a.localeCompare(b));
        return groups.map(([, group], index) => ({
          line: line as "landscape" | "snow" | "both", group,
          status: (group.every(g => g.contract.status === "ended")
            ? index < groups.length - 1 ? "renewed" : "lost" : "active") as TermStatus,
        }));
      });
      const landscapes = initial.filter(g => g.line === "landscape");
      const snows = initial.filter(g => g.line === "snow");
      const merged = new Set<(typeof initial)[number]>();
      const finalGroups = [...initial];
      for (const landscape of landscapes) for (const snow of snows) {
        const l = landscape.group[0], s = snow.group[0];
        const identicalDates = l.start === s.start && l.end === s.end;
        const docs = (g: typeof landscape) => g.group.flatMap(c => documents.get(c.contract.id) ?? []);
        const shared = docs(landscape).some(a => docs(snow).some(b => sameDocument(a, b)));
        if (shared && identicalDates) {
          merged.add(landscape); merged.add(snow);
          const priority: TermStatus[] = ["lost", "renewed", "active"];
          finalGroups.push({ line: "both", group: [...landscape.group, ...snow.group].sort((a, b) => a.contract.id.localeCompare(b.contract.id)),
            status: priority[Math.max(priority.indexOf(landscape.status), priority.indexOf(snow.status))] });
        } else if (shared || identicalDates) {
          for (const [self, other] of [[landscape, snow], [snow, landscape]]) {
            const dates = other.group[0];
            const warning = shared
              ? `Shares a signed document with the ${other.line} contract but the dates differ (${dates.start} – ${dates.end}); check the dates.`
              : `Same dates as the ${other.line} contract but a different or missing signed document; kept separate.`;
            self.group[0].flags.push(warning);
          }
        }
      }
      for (const line of ["landscape", "snow", "both"] as const) {
        const groups = finalGroups.filter(g => g.line === line && !merged.has(g))
          .sort((a, b) => `${a.group[0].start}/${a.group[0].end}`.localeCompare(`${b.group[0].start}/${b.group[0].end}`));
        if (!groups.length) continue;
        const agreementReport = { line, terms: [] as TermReport[] };
        customerReport.agreements.push(agreementReport);
        const agreementPlan = {
          agreement: { customerId, line, propertyManagementCompanyId: customer.propertyManagementCompanyId },
          terms: [] as TermPlan[],
        };
        customerPlan.agreements.push(agreementPlan);
        for (const { group, status } of groups) {
          const { start, end } = group[0];
          const old = group.map(g => g.contract);
          const ids = old.map(c => c.id);
          const flags: string[] = [];
          const flag = (s: string) => { if (!flags.includes(s)) flags.push(s); };
          group.flatMap(g => g.flags).forEach(flag);
          if (!old.some(c => c.status === "active") && old.some(c => c.status === "paused")) flag("Was paused in the old system");
          if (status === "lost") flag("Old status was ended; confirm whether it was lost or just expired");
          const notes = old.map(c => c.notes).filter((n): n is string => !!n);
          const termAmounts = old.filter(c => LEGACY_CONTRACT_LINE[c.serviceType] === "landscape").flatMap(c => amounts.get(c.id) ?? []);
          const snowAmounts = old.filter(c => LEGACY_CONTRACT_LINE[c.serviceType] === "snow").flatMap(c => amounts.get(c.id) ?? []);
          const patterns = [...new Set(old.map(c => c.billingPattern))];
          patterns.forEach(pattern => notes.push(`Old billing pattern: ${pattern}`));
          if (snowAmounts.length) flag(SNOW_AMOUNT_WARNING);
          for (const a of snowAmounts) {
            if (!Number.isInteger(a.month) || a.month < 1 || a.month > 12) flag(`Monthly amount with invalid month number ${a.month}`);
            notes.push(`Old snow monthly amount, ${months[a.month - 1] ?? a.month}: $${(a.amount / 100).toFixed(2)}`);
          }
          if (patterns.length > 1) flag(`Billing patterns differed: ${patterns.join(", ")}`);
          const totals = new Map<number, number>();
          for (const a of termAmounts) {
            if (!Number.isInteger(a.month) || a.month < 1 || a.month > 12) { flag(`Monthly amount with invalid month number ${a.month}`); continue; }
            totals.set(a.month, (totals.get(a.month) ?? 0) + a.amount);
          }
          const billingType: BillingType = line === "snow" ? "time_and_materials"
            : !totals.size || (totals.size === 12 && new Set(totals.values()).size === 1) ? "equal_monthly" : "monthly_variable";
          const billingMonths: TermPlan["billingMonths"] = [];
          const [sy, sm] = start.split("-").map(Number);
          const [ey, em] = end.split("-").map(Number);
          const termMonths = (ey - sy) * 12 + em - sm + 1;
          const invalidDates = sy < 2000 || termMonths > 60;
          if (invalidDates) flag(`Contract dates look wrong (${start} – ${end}); fix them in the old system before copying`);
          if (termMonths >= 12 && termMonths % 12 !== 0) flag(`Contract runs ${termMonths} months (not whole years); check the dates`);
          for (let offset = 0; offset < (invalidDates ? 0 : Math.max(12, termMonths)); offset++) {
            const index = sy * 12 + sm - 1 + offset;
            const month = index % 12 + 1;
            const amountCents = totals.get(month);
            if (amountCents !== undefined && amountCents !== 0) billingMonths.push({
              component: "Contract", month: `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`, amountCents,
            });
          }
          billingMonths.sort((a, b) => a.month.localeCompare(b.month));
          const annualPriceCents = totals.size ? [...totals.values()].reduce((sum, a) => sum + a, 0) : null;
          if (line !== "snow") {
            if (!totals.size) flag("No monthly amounts entered");
            else if (totals.size < 12) flag(`Only ${totals.size} of 12 monthly amounts entered`);
          }
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
              if ((line !== "both" && (line === "snow") !== (catalog.line === "snow")) || scope.has(key)) continue;
              addScope(mapService(plan.serviceCategory), plan.expectedQuantity, null, {}, plan.notes);
              flag("Added from a service plan, not the contract");
            }
          }
          const sheet = sheets.get(customerId);
          const applicableLines = line === "both" ? ["landscape", "irrigation", "snow", "general"] : line === "snow" ? ["snow", "general"] : ["landscape", "irrigation", "general"];
          for (const [key, applicableLine] of [["rate_operator_labor", "landscape"], ["rate_snowblower", "snow"]]) {
            if (applicableLines.includes(applicableLine) && sheet?.[overrideKeys[key]] != null && !rates.some(r => r.rateKey === key))
              flag(`Rate sheet value for ${key} skipped; add the missing standard rates in Settings first`);
          }
          const termRates = rates.filter(r => applicableLines.includes(r.line)).map(r => {
            const override = sheet && overrideKeys[r.rateKey] ? sheet[overrideKeys[r.rateKey]] : null;
            const price = override;
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
          const uniqueDocuments: ContractDocument[] = [];
          for (const d of ids.flatMap(id => documents.get(id) ?? []).sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime() || a.id.localeCompare(b.id))) {
            if (!uniqueDocuments.some(previous => sameDocument(previous, d))) uniqueDocuments.push(d);
          }
          const termPlan: TermPlan = {
            report: termReport, renewedFromIndex: agreementPlan.terms.length ? agreementPlan.terms.length - 1 : null,
            term: { bidTicketId: null, line, form: "ours", seasonLabel: termReport.seasonLabel, startDate: start, endDate: end, status, billingType,
              snowPricing: line === "landscape" ? null : "time_and_materials", snowFlatPriceCents: null,
              annualPriceCents, renewalIncreasePct: null, legalName: null, managingAgentName: manager?.name ?? customer.managementCompany ?? null,
              projectContact: null, contactPhone: null, contactEmail: null,
              projectAddress: `${customer.street}, ${customer.city}, ${customer.state} ${customer.zip}`,
              snowTriggers: null, po: old[0].po, sentAt: null, signedAt: null, masterId: null,
              needsReview: flags.length > 0, reviewNote: flags.length ? flags.join("; ") : null, notes: notes.join("\n") || null },
            scope: scopeLines, rates: termRates, billingMonths,
            documents: uniqueDocuments.map(d => ({
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
