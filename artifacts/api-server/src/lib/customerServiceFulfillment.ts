import type { AgreementTerm, Campaign, CampaignItem, RouteStop, ServiceProgram, Visit } from "@workspace/db";
import type { CustomerServices, ServiceFulfillment as FulfillmentRow, ServiceRound as FulfillmentRound } from "@workspace/api-zod";
import type { CustomerContractInputs } from "./customerContractSummary";
import { campaignDemand } from "./campaignDemand";
import { compareTermPriority } from "./contractCenterService";
import { addCalendarDays, companyToday } from "./companyDay";
import { SCOPE_CATALOG } from "../shared/contractCatalog";
import { CAMPAIGN_TERM_STATUSES } from "../../../../lib/db/src/serviceProgramContracts";

export interface ServiceFulfillmentInputs extends CustomerContractInputs {
  programs: ServiceProgram[];
  campaigns: Campaign[];
  items: CampaignItem[];
  visits: Visit[];
  stops: RouteStop[];
}
export class ServiceTermUnavailable extends Error {}

const propertyOf = (item: CampaignItem) => item.propertyId ?? item.customerId;
const roundKey = (key: string, month: string, seq: number) => `${key}:${month}:${seq}`;
const termRef = (term: AgreementTerm, owner: string, customerId: string) => ({
  termId: term.id, agreementId: term.agreementId, label: term.seasonLabel,
  startDate: term.startDate, endDate: term.endDate, status: term.status,
  parentCustomerId: owner === customerId ? null : owner,
});
type RoundState = FulfillmentRound["state"];
export type { CustomerServices, FulfillmentRow, FulfillmentRound };

/** One reusable pure read model. Owed campaign rounds come only from campaignDemand;
 * outcomes come only from items. Route activity comes only from route visits.
 * Inputs may be batch-loaded once and reused across customers by later reports.
 */
export function customerServiceFulfillment(data: ServiceFulfillmentInputs, customerId: string,
  termId?: string, today = companyToday()): CustomerServices | null {
  const customer = data.customers.find(c => c.id === customerId);
  if (!customer) return null;
  const parent = data.customers.find(c => c.id === customer.parentCustomerId && c.companyId === customer.companyId);
  const owners = new Map(data.agreements.filter(a => a.companyId === customer.companyId &&
    (a.customerId === customerId || a.customerId === parent?.id)).map(a => [a.id, a.customerId]));
  const terms = data.terms.filter(t => t.companyId === customer.companyId && owners.has(t.agreementId) &&
    CAMPAIGN_TERM_STATUSES.includes(t.status as typeof CAMPAIGN_TERM_STATUSES[number]));
  const byPriority = (a: AgreementTerm, b: AgreementTerm) =>
    Number(a.status === "sent") - Number(b.status === "sent") || compareTermPriority(a, b);
  // Current own coverage precedes inherited coverage; future/previous terms do
  // not suppress an in-effect parent's season.
  const select = (pool: AgreementTerm[]) => {
    const own = pool.filter(t => owners.get(t.agreementId) === customerId);
    return [...(own.length ? own : pool)].sort(byPriority)[0];
  };
  const current = terms.filter(t => t.startDate <= today && t.endDate >= today);
  const future = terms.filter(t => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = terms.filter(t => t.endDate < today).sort((a, b) => b.endDate.localeCompare(a.endDate));
  const term = termId ? terms.find(t => t.id === termId) : select(current) ??
    select(future.filter(t => t.startDate === future[0]?.startDate)) ??
    select(past.filter(t => t.endDate === past[0]?.endDate));
  if (termId && !term) throw new ServiceTermUnavailable("Season not available for this customer");
  const availableTerms = [...terms].sort((a, b) => b.startDate.localeCompare(a.startDate) || byPriority(a, b))
    .map(t => termRef(t, owners.get(t.agreementId)!, customerId));
  const base = { asOf: today, customerId, availableTerms };
  if (!term) {
    const campaigns = new Map(data.campaigns.filter(c => c.companyId === customer.companyId).map(c => [c.id, c]));
    const items = data.items.filter(i => i.companyId === customer.companyId && propertyOf(i) === customerId);
    return { ...base, selectedTerm: null, rows: [] as FulfillmentRow[],
      alsoInContract: [] as { serviceKey: string; label: string; scheduling: string }[],
      otherWork: items.filter(i => campaigns.get(i.campaignId)?.source === "manual").map(i => ({
        campaignId: i.campaignId, itemId: i.id, title: campaigns.get(i.campaignId)!.title, status: i.status,
      })),
      retainedWork: items.filter(i => campaigns.get(i.campaignId)?.source === "contract").map(i => ({
        campaignId: i.campaignId, itemId: i.id, serviceKey: campaigns.get(i.campaignId)!.serviceKey, status: i.status,
      })) };
  }

  // Target plus immediate parent avoids the engine's term-level gap deduplication
  // hiding a branch's gap behind another branch. Keep ALL competing terms/scope.
  const inputs = { ...data, customers: [customer, ...(parent ? [parent] : [])] };
  const reports = [];
  for (let year = Number(term.startDate.slice(0, 4)); year <= Number(term.endDate.slice(0, 4)); year++)
    reports.push(campaignDemand(inputs, year, today));
  const demand = reports.flatMap(r => r.rounds.flatMap(r => r.members
    .filter(m => m.propertyId === customerId && m.termId === term.id).map(member => ({ ...r, member }))));
  const gaps = reports.flatMap(r => r.gaps).filter(g => g.termId === term.id);
  const companyCampaigns = data.campaigns.filter(c => c.companyId === customer.companyId);
  const campaigns = new Map(companyCampaigns.filter(c => c.source === "contract" && c.serviceKey && c.roundMonth && c.roundSeq)
    .map(c => [roundKey(c.serviceKey!, c.roundMonth!, c.roundSeq!), c]));
  const items = data.items.filter(i => i.companyId === customer.companyId && propertyOf(i) === customerId);
  const byCampaign = new Map(items.map(i => [i.campaignId, i]));
  const included = data.scope?.filter(s => s.companyId === customer.companyId && s.termId === term.id && s.included) ?? [];
  const serviceKeys = [...new Set(included.map(s => s.serviceKey))];
  const rows: FulfillmentRow[] = [];
  const alsoInContract: { serviceKey: string; label: string; scheduling: string }[] = [];
  const countedItems = new Set<string>();
  for (const key of serviceKeys) {
    const service = SCOPE_CATALOG.find(s => s.key === key);
    const scope = included.find(s => s.serviceKey === key)!;
    if (service?.scheduling !== "campaign" && service?.scheduling !== "route") {
      alsoInContract.push({ serviceKey: key, label: service?.label ?? key, scheduling: service?.scheduling ?? "none" });
      continue;
    }
    const row: FulfillmentRow = { serviceKey: key, label: service.label, scheduling: service.scheduling,
      statedQuantity: scope.quantity, owed: null, done: 0, skipped: 0, remaining: null,
      planned: 0, inProgress: 0, status: "on_track", issues: [], next: null, rounds: [] };
    if (service.scheduling === "campaign") {
      row.issues = [...new Set(gaps.filter(g => g.serviceKey === key).map(g => g.kind))];
      for (const round of demand.filter(r => r.serviceKey === key)) {
        const campaign = campaigns.get(roundKey(key, round.roundMonth, round.roundSeq));
        const item = campaign && byCampaign.get(campaign.id);
        if (item) countedItems.add(item.id);
        const [year, month] = round.roundMonth.split("-").map(Number);
        const end = addCalendarDays(month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`, -1);
        const windowEnd = [campaign?.windowEnd ?? end, term.endDate].sort()[0];
        const windowStart = [campaign?.windowStart ?? round.roundMonth, term.startDate].sort().at(-1)!;
        // Fert/chem target/backup remain item-owned. Backup is the latest promise.
        // Other campaigns have a window, never an invented property appointment.
        const promise = key === "chemical" && item && (item.backupDate || item.targetDate);
        const dueDate = promise || windowEnd;
        const state: RoundState = item?.status === "completed" ? "completed" : item?.status === "skipped" ? "skipped" :
          !item ? "missing_item" : round.member.termStatus === "sent" ? "waiting_on_signature" :
          dueDate < today ? "overdue" : "pending";
        row.rounds.push({ roundMonth: round.roundMonth, roundSeq: round.roundSeq, campaignId: campaign?.id ?? null,
          itemId: item?.id ?? null, dueDate, windowStart, windowEnd, dateKind: promise ? "chemical_promise" : "round_window",
          state, timing: round.member.timing, countSource: round.member.count });
        if (round.member.termStatus === "sent") row.issues.push("waiting_on_signature");
        if (["missing_item", "overdue"].includes(state)) row.issues.push(state);
      }
      row.owed = row.issues.some(i => ["no_count", "no_timing", "invalid_count", "duplicate_lines"].includes(i))
        ? null : row.rounds.length;
      row.done = row.rounds.filter(r => r.state === "completed").length;
      row.skipped = row.rounds.filter(r => r.state === "skipped").length;
      const next = row.rounds.filter(r => !["completed", "skipped"].includes(r.state))
        .sort((a, b) => (a.dateKind === "chemical_promise" ? a.dueDate : a.windowStart)
          .localeCompare(b.dateKind === "chemical_promise" ? b.dueDate : b.windowStart) || a.roundSeq - b.roundSeq)[0];
      if (next) row.next = { date: next.dateKind === "chemical_promise" ? next.dueDate : next.windowStart,
        kind: next.dateKind, campaignId: next.campaignId, itemId: next.itemId, visitId: null };
    } else {
      const duplicates = data.scope!.filter(s => s.termId === term.id && s.serviceKey === key).length > 1;
      row.owed = !duplicates && scope.quantity !== null && Number.isSafeInteger(scope.quantity) && scope.quantity >= 0 ? scope.quantity : null;
      if (duplicates) row.issues.push("duplicate_lines");
      else if (row.owed === null) row.issues.push(scope.quantity === null ? "no_count" : "invalid_count");
      const activity = data.visits.filter(v => v.companyId === customer.companyId && v.customerId === customerId &&
        v.sourceType === "route" && v.serviceKey === key && v.visitDate >= term.startDate && v.visitDate <= term.endDate);
      row.done = activity.filter(v => v.status === "done").length;
      row.skipped = activity.filter(v => v.status === "skipped").length;
      row.planned = activity.filter(v => v.status === "planned").length;
      row.inProgress = activity.filter(v => v.status === "in_progress").length;
      const stop = data.stops.some(s => s.companyId === customer.companyId && s.customerId === customerId &&
        s.serviceKey === key && s.isActive && (!s.seasonStart || s.seasonStart <= term.endDate) &&
        (!s.seasonEnd || s.seasonEnd >= term.startDate));
      if (!stop && row.owed !== 0) row.issues.push("no_route");
      const next = activity.filter(v => v.status === "planned" || v.status === "in_progress")
        .sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.id.localeCompare(b.id))[0];
      if (next) {
        row.next = { date: next.visitDate, kind: "route_visit", campaignId: null, itemId: null, visitId: next.id };
        if (next.visitDate < today) row.issues.push("overdue");
      }
    }
    if (term.status === "sent" && row.owed !== 0) row.issues.push("waiting_on_signature");
    row.issues = [...new Set(row.issues)];
    row.remaining = row.owed === null ? null : Math.max(0, row.owed - row.done - row.skipped);
    if (service.scheduling === "route" && row.remaining !== null && row.remaining > 0 && term.endDate < today)
      row.issues = [...new Set([...row.issues, "overdue"])];
    row.status = ["duplicate_lines", "invalid_count", "no_count", "no_timing", "waiting_on_signature",
      "overdue", "missing_item", "no_route"].find(s => row.issues.includes(s)) ??
      (row.owed === 0 ? "not_owed" : row.remaining === 0 ? (row.skipped ? "closed_with_skips" : "complete") : "on_track");
    rows.push(row);
  }
  const seasonalCampaigns = companyCampaigns.filter(c => c.windowStart <= term.endDate && c.windowEnd >= term.startDate);
  const manualIds = new Map(seasonalCampaigns.filter(c => c.source === "manual").map(c => [c.id, c]));
  const generatedIds = new Map(seasonalCampaigns.filter(c => c.source === "contract").map(c => [c.id, c]));
  return { ...base, selectedTerm: termRef(term, owners.get(term.agreementId)!, customerId), rows, alsoInContract,
    otherWork: items.filter(i => manualIds.has(i.campaignId)).map(i => ({
      campaignId: i.campaignId, itemId: i.id, title: manualIds.get(i.campaignId)!.title, status: i.status,
    })),
    retainedWork: items.filter(i => generatedIds.has(i.campaignId) && !countedItems.has(i.id)).map(i => ({
      campaignId: i.campaignId, itemId: i.id, serviceKey: generatedIds.get(i.campaignId)!.serviceKey, status: i.status,
    })) };
}
