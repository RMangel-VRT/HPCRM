import type { ServiceFulfillmentInputs, FulfillmentRow } from "../lib/customerServiceFulfillment";
import { customerServiceFulfillment, ServiceTermUnavailable } from "../lib/customerServiceFulfillment";
import { calendarInstance } from "../lib/campaignDemand";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { displayDate, money } from "./documents/layout";

type Wording = { name: string; description: string; unit: readonly [string, string] };
const wording = (name: string, description = "", singular = "", plural = singular ? `${singular}s` : ""): Wording =>
  ({ name, description, unit: [singular, plural] });
export const CUSTOMER_SERVICE_WORDING: Readonly<Record<string, Wording>> = {
  mowing: wording("Weekly turf service", "Mowing, trimming and blowing; monthly hard edging", "visit"),
  aeration: wording("Spring core aeration"),
  cleanups: wording("Clean-ups", "Leaf and debris removal from turf and beds", "visit"),
  shrub_trimming: wording("Shrub trimming", "Light shaping and walkway clearance", "trim"),
  ornamental_grass: wording("Ornamental grass cutback"),
  tree_pruning: wording("Light tree pruning", "Branches up to 10 ft; sucker removal"),
  native_areas: wording("Native grass areas", "Full mow of native areas", "mow"),
  fertilization: wording("Turf fertilization", "", "application"),
  broadleaf: wording("Broadleaf weed control", "Selective herbicide on turf", "application"),
  chemical: wording("Fertilization and weed control", "", "application"),
  pet_station: wording("Pet waste stations", "Bags restocked and waste removed", "visit"),
  winter_visits: wording("Winter site visits", "Litter, small branches and light debris", "visit"),
  irrigation_open: wording("Irrigation start-up"),
  irrigation_inspection: wording("Irrigation inspection", "Every zone checked"),
  irrigation_winterization: wording("Irrigation winterization", "Blowout with compressed air"),
  backflow: wording("Backflow testing", "Annual test of each device", "device"),
  retention_pond: wording("Detention / retention pond", "", "visit"),
};
export class ScopeNeedsReview extends Error {
  constructor(readonly services: string[]) { super("SCOPE_NEEDS_REVIEW"); }
}
export type DocumentVisit = { date: string; label: string; completed: string };
export type ContractedServiceRow = { key: string; name: string; description: string; included: string; visits: DocumentVisit[] };
export interface ContractedServicesModel {
  customerName: string; address: string; managementCompany: string | null; agreement: string;
  season: string; dateLine: string; lines: string; rows: ContractedServiceRow[];
  boundaryNote: string; sections: { title: string; entries: string[] }[];
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthText = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1];
export function dateRange(start: string, end: string): string {
  if (start === end) return displayDate(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${displayDate(start)} – ${displayDate(end)}`;
  return `${monthText(start)} ${Number(start.slice(8))} – ${displayDate(end)}`;
}
/** Iterate calendar components, not instants: November–March stays in season order. */
export function frequencyPhrase(spread: number[] | null | undefined, start: string, end: string): string {
  if (!spread?.some(n => n > 0)) return "";
  const months: { m: number; y: number; f: string }[] = [];
  for (let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7)); `${y}-${String(m).padStart(2, "0")}` <= end.slice(0, 7); m === 12 ? (m = 1, y++) : m++) {
    const n = spread[m - 1];
    if (n > 0) months.push({ m, y, f: n >= 4 ? "Weekly" : n >= 2 ? "Twice a month" : "Monthly" });
  }
  const frequencies = [...new Set(months.map(m => m.f))].sort((a, b) =>
    ["Weekly", "Twice a month", "Monthly"].indexOf(a) - ["Weekly", "Twice a month", "Monthly"].indexOf(b));
  return frequencies.map((f, i) => {
    const selected = months.filter(m => m.f === f);
    const groups: typeof months[] = [];
    for (const m of selected) {
      const last = groups.at(-1)?.at(-1);
      if (last && last.y * 12 + last.m + 1 === m.y * 12 + m.m) groups.at(-1)!.push(m);
      else groups.push([m]);
    }
    const label = groups.map(g => {
      const a = g[0], b = g.at(-1)!;
      return g.length === 1 ? `${MONTHS[a.m - 1]}${i === 0 ? ` ${a.y}` : ""}` :
        `${MONTHS[a.m - 1]}${a.y !== b.y ? ` ${a.y}` : ""} – ${MONTHS[b.m - 1]} ${b.y}`;
    }).join(" and ");
    return `${i ? f.toLowerCase() : f}${i && groups.every(g => g.length === 1) ? " in" : ""} ${label}`;
  }).join("; ");
}
export function blockingServices(rows: FulfillmentRow[]): string[] {
  return rows.filter(r => CUSTOMER_SERVICE_WORDING[r.serviceKey] && r.issues.some(issue =>
    (r.scheduling === "route" ? ["invalid_count", "duplicate_lines"] : ["no_count", "needs_rounds", "invalid_count", "duplicate_lines"]).includes(issue)))
    .map(r => CUSTOMER_SERVICE_WORDING[r.serviceKey].name);
}
export function buildContractedServicesModel(data: ServiceFulfillmentInputs, customerId: string, termId: string,
  access: { commercial: boolean } = { commercial: false }): ContractedServicesModel {
  const fulfillment = customerServiceFulfillment(data, customerId, termId);
  if (!fulfillment?.selectedTerm) throw new ServiceTermUnavailable();
  const term = data.terms.find(t => t.id === termId)!;
  const customer = data.customers.find(c => c.id === customerId)!;
  const scope = (data.scope ?? []).filter(s => s.companyId === customer.companyId && s.termId === termId && s.included);
  // Check every issue BEFORE zero filtering: null means unknown, never zero.
  const blockers = blockingServices(fulfillment.rows);
  if (blockers.length) throw new ScopeNeedsReview(blockers);
  const rows: ContractedServiceRow[] = [];
  for (const service of SCOPE_CATALOG) {
    const w = CUSTOMER_SERVICE_WORDING[service.key];
    if (!w) continue;
    const row = fulfillment.rows.find(r => r.serviceKey === service.key);
    if (!row || row.owed === 0) {
      if (!row && fulfillment.alsoInContract.some(r => r.serviceKey === service.key && r.scheduling === "none"))
        rows.push({ key: service.key, ...w, included: "Per your agreement", visits: [] });
      continue;
    }
    let included = row.owed === null ? "" : row.owed === 1 ?
      row.scheduling === "route" && w.unit[0] ? `1 ${w.unit[0]}` : "1" : `${row.owed}${w.unit[1] ? ` ${w.unit[1]}` : ""}`;
    let visits: DocumentVisit[];
    if (row.scheduling === "route") {
      const recurring = data.calendar.find(c => c.serviceKey === service.key && c.kind === "recurring");
      const phrase = frequencyPhrase(scope.find(s => s.serviceKey === service.key)?.monthSpread, term.startDate, term.endDate);
      const safePattern = recurring?.pattern?.trim() && !/\d/.test(recurring.pattern) ? recurring.pattern.trim() : "";
      let when = phrase;
      if (row.owed === null) included = when = phrase || safePattern || "As scheduled";
      else if (!when && recurring) {
        const year = Number(term.startDate.slice(0, 4)) + (recurring.dueMd < term.startDate.slice(5) ? 1 : 0);
        const window = calendarInstance(recurring, year);
        when = `${monthText(window.opens)}${window.opens.slice(0, 4) !== window.due.slice(0, 4) ? ` ${window.opens.slice(0, 4)}` : ""} – ${monthText(window.due)} ${window.due.slice(0, 4)}`;
      }
      visits = [{ date: when || "As scheduled", label: "", completed: row.done > 0 ? row.owed === null ? `${row.done} done` : `${row.done} of ${row.owed} done` : "" }];
    } else visits = [...row.rounds].sort((a, b) => a.windowStart.localeCompare(b.windowStart) || a.windowEnd.localeCompare(b.windowEnd)).map(r => ({
      date: r.dateKind === "chemical_promise" ? displayDate(r.dueDate) : dateRange(r.windowStart, r.windowEnd),
      label: row.rounds.length > 1 ? r.customerLabel?.trim() ?? "" : "",
      completed: r.state === "skipped" ? "Skipped" : r.completedOn ? displayDate(r.completedOn) : "",
    }));
    rows.push({ key: service.key, name: w.name, description: w.description, included, visits });
  }
  const snow = scope.filter(s => SCOPE_CATALOG.find(c => c.key === s.serviceKey)?.scheduling === "event");
  if (snow.length) rows.push({ key: "snow", name: "Snow removal and ice melt", description: term.snowTriggers ||
    snow.map(s => SCOPE_CATALOG.find(c => c.key === s.serviceKey)!.label).join("; "), included: "As needed",
    visits: [{ date: "As snow falls", label: "", completed: "" }] });
  const after: string[] = [];
  for (const row of rows) {
    // Calendar-year documents need no off-calendar-season explanation.
    if (term.startDate.slice(5) === "01-01" && term.endDate === `${term.startDate.slice(0, 4)}-12-31`) continue;
    if (!fulfillment.rows.some(r => r.serviceKey === row.key && r.scheduling !== "route")) continue;
    for (const c of data.calendar.filter(c => c.serviceKey === row.key && c.kind === "round")) {
      for (const year of [Number(term.endDate.slice(0, 4)), Number(term.endDate.slice(0, 4)) + 1]) {
        const r = calendarInstance(c, year);
        if (r.opens <= term.endDate && r.due > term.endDate)
          after.push(`${c.customerLabel?.trim() || row.name} (due ${displayDate(r.due)})`);
      }
    }
  }
  const price = (cents: number | null, text: unknown, unit?: string | null) =>
    [typeof text === "string" && text ? text : cents !== null ? `$${money(cents)}` : "", unit].filter(Boolean).join(" · ");
  const sections: ContractedServicesModel["sections"] = [];
  for (const [billing, title] of [["billed_when_done", "Billed separately"], ["on_request", "On request (priced when ordered)"]]) {
    const entries = scope.filter(s => billing === "on_request" ?
      SCOPE_CATALOG.find(c => c.key === s.serviceKey)?.scheduling === "on_request" : (s.details as any)?.billing === billing)
      .map(s => [CUSTOMER_SERVICE_WORDING[s.serviceKey]?.name ?? SCOPE_CATALOG.find(c => c.key === s.serviceKey)?.label.replace(/\s*\(on request\)/i, ""),
        price(s.priceCents, (s.details as any)?.billingPrice, s.unit)].filter(Boolean).join(" · "));
    if (access.commercial && entries.length) sections.push({ title, entries });
  }
  const rates = (data.rates ?? []).filter(r => r.companyId === customer.companyId && r.termId === termId)
    .sort((a, b) => a.sortOrder - b.sortOrder).map(r => [r.label, r.priceCents !== null ? `$${money(r.priceCents)}` : "", r.priceText, r.unit, r.minimum].filter(Boolean).join(" · "));
  if (access.commercial && rates.length) sections.push({ title: "Rates in your agreement", entries: rates });
  const lines = ["landscape", "irrigation", "winter", "snow"].filter(line => rows.some(r =>
    (r.key === "snow" ? "snow" : r.key === "winter_visits" ? "winter" : SCOPE_CATALOG.find(c => c.key === r.key)?.line) === line));
  const lineLabel = lines.map((l, i) => i === 0 ? l.replace(/^./, c => c.toUpperCase()) : l);
  return { customerName: customer.name, address: term.projectAddress || [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
    managementCompany: term.managingAgentName || customer.managementCompany, agreement: term.line === "snow" ? "Snow Maintenance Contract" : "Landscape Maintenance Contract",
    season: term.seasonLabel, dateLine: `Contract year ${displayDate(term.startDate)} – ${displayDate(term.endDate)}`,
    lines: lineLabel.length > 1 ? `${lineLabel.slice(0, -1).join(", ")} and ${lineLabel.at(-1)}` : lineLabel.join(""),
    rows, sections, boundaryNote: after.length ? `Your agreement ends ${displayDate(term.endDate)}. The ${[...new Set(after)].join(" and ")} ${after.length === 1 ? "comes" : "come"} after that date, so ${after.length === 1 ? "it is" : "they are"} not part of this contract year.` : "" };
}
