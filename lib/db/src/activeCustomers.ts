/** Driver-free, read-time Contract Center responsibility. All dates are calendar days. */
export type CustomerStatus = "active" | "prospect" | "inactive";
export type ActiveCustomerFlag = "ending_soon" | "should_fall_off" | "lapsed" | "starting_soon" | "mismatch";
export type LineNote = "not_renewing" | "renewed" | "renewal_sent" | "renewal_drafted" | "lost" | null;
export interface ActiveCustomerSeason {
  agreementId: string; id: string; seasonLabel: string;
  line: "landscape" | "snow" | "both"; status: string;
  startDate: string; endDate: string; renewedFromTermId: string | null;
  nonRenewalOn: string | null; managingAgentName?: string | null;
  viaParent?: boolean; parentName?: string;
}
export interface ActiveCustomer {
  id: string; name: string; status: CustomerStatus; parentCustomerId: string | null;
}
export interface LineState {
  state: "in_effect" | "starting" | "lapsed" | "ended" | "none";
  seasonId: string | null; agreementId: string | null; seasonLabel: string | null;
  startDate: string | null; endDate: string | null; note: LineNote;
}
export interface ActiveCustomerRow {
  customerId: string; customerName: string; customerStatus: CustomerStatus;
  managingAgentName: string | null; responsible: boolean;
  landscape: LineState; snow: LineState; flags: ActiveCustomerFlag[];
  viaParent?: boolean; parentName?: string; noContract?: boolean;
}
export interface ActiveCustomersCounts {
  responsible: number; landscape: number; snow: number;
  ending_soon: number; lapsed: number; should_fall_off: number;
  starting_soon: number; mismatch: number; noContract: number;
}
export interface ActiveCustomersResponse { asOf: string; counts: ActiveCustomersCounts; rows: ActiveCustomerRow[] }

const signed = (s: ActiveCustomerSeason) => ["signed", "active", "renewed"].includes(s.status);
const latestStart = (a: ActiveCustomerSeason, b: ActiveCustomerSeason) =>
  b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id);
const inEffect = (s: ActiveCustomerSeason, asOf: string) => signed(s) && s.startDate <= asOf && asOf <= s.endDate;
const dayNumber = (day: string) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  return date.getTime() / 86400000;
};
function successors(source: ActiveCustomerSeason, seasons: ActiveCustomerSeason[]) {
  // Adjacency matters: unrelated later agreements (or sparse pending chains)
  // must not masquerade as a renewal of this season.
  return seasons.filter(s => s.renewedFromTermId === source.id &&
    s.agreementId === source.agreementId && s.startDate > source.startDate);
}
function renewalNote(source: ActiveCustomerSeason, seasons: ActiveCustomerSeason[]): LineNote {
  const next = successors(source, seasons);
  if (source.nonRenewalOn) return "not_renewing";
  if (next.some(signed)) return "renewed";
  if (next.some(s => s.status === "sent")) return "renewal_sent";
  if (next.some(s => s.status === "draft")) return "renewal_drafted";
  return source.status === "lost" ? "lost" : null;
}
function lineState(seasons: ActiveCustomerSeason[], asOf: string): LineState {
  const current = seasons.filter(s => inEffect(s, asOf)).sort(latestStart)[0];
  const future = seasons.filter(s => s.status === "signed" && s.startDate > asOf)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.id.localeCompare(a.id))[0];
  // Pending renewal years do not replace the worked season they renew.
  const last = seasons.filter(s => (s.endDate < asOf || ["lost", "cancelled"].includes(s.status)) &&
    !(s.renewedFromTermId && ["draft", "sent"].includes(s.status)))
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || latestStart(a, b))[0];
  const chosen = current ?? future ?? last;
  if (!chosen) return { state: "none", seasonId: null, agreementId: null, seasonLabel: null, startDate: null, endDate: null, note: null };
  const note = renewalNote(chosen, seasons);
  const pendingSeasons = successors(chosen, seasons).filter(s => ["draft", "sent"].includes(s.status));
  const pending = !["lost", "cancelled"].includes(chosen.status) && chosen.endDate < asOf && pendingSeasons.length > 0;
  return {
    state: current ? "in_effect" : future ? "starting" : pending ? "lapsed" : "ended",
    seasonId: chosen.id, agreementId: chosen.agreementId, seasonLabel: chosen.seasonLabel,
    startDate: chosen.startDate, endDate: chosen.endDate,
    note: future && !current ? null : !current && pending
      ? pendingSeasons.some(s => s.status === "sent") ? "renewal_sent" : "renewal_drafted" : note,
  };
}
export function classifyCustomer(input: { customer: ActiveCustomer; seasons: ActiveCustomerSeason[]; asOf: string }): ActiveCustomerRow {
  const { customer, seasons, asOf } = input;
  const landscapeSeasons = seasons.filter(s => s.line !== "snow");
  const snowSeasons = seasons.filter(s => s.line !== "landscape");
  const landscape = lineState(landscapeSeasons, asOf), snow = lineState(snowSeasons, asOf);
  const lines = [landscape, snow];
  const responsible = lines.some(l => l.state === "in_effect");
  const flags: ActiveCustomerFlag[] = [];
  if (lines.some((l, i) => {
    const lineSeasons = i === 0 ? landscapeSeasons : snowSeasons;
    const source = lineSeasons.find(s => s.id === l.seasonId);
    return l.state === "in_effect" && dayNumber(l.endDate!) - dayNumber(asOf) <= 30 &&
      source && !successors(source, lineSeasons).some(signed);
  })) flags.push("ending_soon");
  if (customer.status === "active" && seasons.length > 0 &&
    !lines.some(l => ["in_effect", "starting", "lapsed"].includes(l.state))) flags.push("should_fall_off");
  if (lines.some(l => l.state === "lapsed")) flags.push("lapsed");
  if (lines.some(l => l.state === "starting" && dayNumber(l.startDate!) - dayNumber(asOf) <= 30)) flags.push("starting_soon");
  if (customer.status === "inactive" && responsible) flags.push("mismatch");
  const agentSeason = seasons.filter(s => inEffect(s, asOf)).sort(latestStart)[0] ?? [...seasons].sort(latestStart)[0];
  const parent = seasons.find(s => s.viaParent);
  return { customerId: customer.id, customerName: customer.name, customerStatus: customer.status,
    managingAgentName: agentSeason?.managingAgentName ?? null, responsible, landscape, snow, flags,
    ...(parent ? { viaParent: true, parentName: parent.parentName } : {}),
    ...(!seasons.length && customer.status === "active" ? { noContract: true } : {}) };
}

/** Inputs must already be scoped to one company. Inheritance is direct, never recursive. */
export function projectActiveCustomers(input: {
  customers: ActiveCustomer[]; agreements: Array<{ id: string; customerId: string }>;
  seasons: ActiveCustomerSeason[]; asOf: string;
}): ActiveCustomersResponse {
  const owners = new Map(input.customers.map(c => [c.id, c]));
  const ownAgreements = new Map<string, Set<string>>();
  const seasonsByCustomer = new Map<string, ActiveCustomerSeason[]>();
  const agreementOwners = new Map<string, string>();
  for (const a of input.agreements) {
    if (!owners.has(a.customerId)) continue;
    const ids = ownAgreements.get(a.customerId) ?? new Set<string>();
    ids.add(a.id); ownAgreements.set(a.customerId, ids); agreementOwners.set(a.id, a.customerId);
  }
  for (const s of input.seasons) {
    const owner = agreementOwners.get(s.agreementId);
    if (!owner) continue;
    const group = seasonsByCustomer.get(owner) ?? [];
    group.push(s); seasonsByCustomer.set(owner, group);
  }
  const rows = input.customers.flatMap(customer => {
    const parent = !ownAgreements.has(customer.id) && customer.parentCustomerId ? owners.get(customer.parentCustomerId) : undefined;
    const seasons = parent ? (seasonsByCustomer.get(parent.id) ?? []).map(s => ({ ...s, viaParent: true, parentName: parent.name }))
      : seasonsByCustomer.get(customer.id) ?? [];
    return seasons.length || customer.status === "active" ? [classifyCustomer({ customer, seasons, asOf: input.asOf })] : [];
  }).sort((a, b) => a.customerName.localeCompare(b.customerName) || a.customerId.localeCompare(b.customerId));
  const counts: ActiveCustomersCounts = { responsible: 0, landscape: 0, snow: 0, ending_soon: 0, lapsed: 0,
    should_fall_off: 0, starting_soon: 0, mismatch: 0, noContract: 0 };
  for (const row of rows) {
    if (row.responsible) counts.responsible++;
    if (row.landscape.state === "in_effect") counts.landscape++;
    if (row.snow.state === "in_effect") counts.snow++;
    if (row.noContract) counts.noContract++;
    for (const flag of row.flags) counts[flag]++;
  }
  return { asOf: input.asOf, counts, rows };
}
