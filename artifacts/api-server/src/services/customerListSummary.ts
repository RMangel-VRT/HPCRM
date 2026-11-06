import { and, eq, inArray, sql } from "drizzle-orm";
import {
  customers, propertyManagementCompanies, propertyManagers, contacts, qboCustomerReviews,
  tickets, ticketTypes, ticketTypeStatuses, type Customer,
} from "@workspace/db";
import { billsThroughParent } from "@workspace/customer-billing";
import type { Reader } from "../lib/contractCenterPersistence";
import {
  customerContractProjector, loadCustomerContractInputs, type CustomerContractInputs,
  type CustomerContractSummary,
} from "../lib/customerContractSummary";

export type CustomerListQboState = "linked" | "not_linked" | "waiting" | "via_parent" | "error" | "collision";
export type ListMetadata = { management: string | null; managerSearch: string; qboState: CustomerListQboState };

/** Same precedence as QboCustomerCard.cardState; all inputs are same-company facts. */
export function customerListQboState(customer: Customer, parent: Customer | undefined, collision: boolean): CustomerListQboState {
  if (billsThroughParent(customer, parent) || customer.qboSyncState === "via_parent") return "via_parent";
  if (collision) return "collision";
  if (customer.qboSyncState === "error") return "error";
  if (customer.qboSyncState === "pending_push") return "waiting";
  return customer.qboCustomerId ? "linked" : "not_linked";
}

/** Fixed-size batch of directory/review reads, never a per-customer lookup. */
export async function loadCustomerListMetadata(reader: Reader, companyId: string, rows: Customer[]) {
  if (!rows.length) return new Map<string, ListMetadata>();
  const ids = rows.map(c => c.id);
  const parentIds = [...new Set(rows.flatMap(c => c.parentCustomerId ? [c.parentCustomerId] : []))];
  const [companies, managers, contactRows, reviews, parents] = await Promise.all([
    reader.select({ id: propertyManagementCompanies.id, name: propertyManagementCompanies.name })
      .from(propertyManagementCompanies).where(eq(propertyManagementCompanies.companyId, companyId)),
    reader.select({ id: propertyManagers.id, name: propertyManagers.name })
      .from(propertyManagers).where(eq(propertyManagers.companyId, companyId)),
    reader.select({ customerId: contacts.customerId, name: contacts.name })
      .from(contacts).where(and(eq(contacts.companyId, companyId), inArray(contacts.customerId, ids))),
    reader.select({ customerId: qboCustomerReviews.customerId }).from(qboCustomerReviews)
      .where(and(eq(qboCustomerReviews.companyId, companyId), eq(qboCustomerReviews.status, "open"),
        eq(qboCustomerReviews.kind, "name_taken"), inArray(qboCustomerReviews.customerId, ids))),
    parentIds.length ? reader.select().from(customers).where(and(eq(customers.companyId, companyId),
      inArray(customers.id, parentIds))) : Promise.resolve([]),
  ]);
  const companyNames = new Map(companies.map(c => [c.id, c.name]));
  const managerNames = new Map(managers.map(c => [c.id, c.name]));
  const parentsById = new Map(parents.map(c => [c.id, c]));
  const collisions = new Set(reviews.map(r => r.customerId));
  const contactNames = new Map<string, string[]>();
  for (const c of contactRows) {
    const group = contactNames.get(c.customerId) ?? []; group.push(c.name); contactNames.set(c.customerId, group);
  }
  return new Map(rows.map(c => {
    const management = c.propertyManagementCompanyId ? companyNames.get(c.propertyManagementCompanyId) ?? null : c.managementCompany;
    return [c.id, {
      management,
      managerSearch: [management, c.propertyManagerId ? managerNames.get(c.propertyManagerId) : null,
        ...(contactNames.get(c.id) ?? [])].filter(Boolean).join(" "),
      qboState: customerListQboState(c, c.parentCustomerId ? parentsById.get(c.parentCustomerId) : undefined, collisions.has(c.id)),
    }] as const;
  }));
}

type SummaryTerm = CustomerContractSummary["current"][number];
export function listSeason(terms: SummaryTerm[]) {
  const unique = [...new Map(terms.map(t => [t.termId, t])).values()];
  const priced = unique.filter(t => !t.parentCustomerId && t.annualCents != null);
  return {
    annualCents: priced.length ? priced.reduce((sum, t) => sum + t.annualCents!, 0) : null,
    hasSnowTm: unique.some(t => t.snowPricing === "time_and_materials"),
    hasTerm: unique.length > 0,
  };
}

/** Parent totals include every underlying branch even when not in this page.
 * Only effective owned terms contribute; inherited parent terms are counted once.
 * This is the same selection/deduplication as CP3's parent-rollup.
 */
export function projectCustomerListContracts(data: CustomerContractInputs, ids: string[], today?: string) {
  const project = customerContractProjector(data, today);
  const children = new Map<string, Customer[]>();
  for (const c of data.customers) if (c.parentCustomerId) {
    const group = children.get(c.parentCustomerId) ?? []; group.push(c); children.set(c.parentCustomerId, group);
  }
  const byId = new Map(data.customers.map(c => [c.id, c]));
  return Object.fromEntries(ids.flatMap(id => {
    const c = byId.get(id); if (!c) return [];
    const branches = children.get(id) ?? [];
    const own = project(id)?.current ?? [];
    const current = c.isParent === "true"
      ? [...new Map([...own, ...branches.flatMap(b => (project(b.id)?.current ?? []).filter(t => !t.parentCustomerId))]
        .map(t => [t.termId, t])).values()]
      : own;
    return [[id, { current, season: listSeason(current), branchCount: branches.length }]];
  }));
}

export async function loadCustomerListSummary(reader: Reader, companyId: string, ids: string[]) {
  const data = await loadCustomerContractInputs(reader, companyId, true);
  const byId = new Map(data.customers.map(c => [c.id, c]));
  const rows = ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const projected = projectCustomerListContracts(data, ids);
  const requestedParents = new Set(rows.filter(c => c.isParent === "true").map(c => c.id));
  const contributions = data.customers.filter(c => ids.includes(c.id) || (c.parentCustomerId && requestedParents.has(c.parentCustomerId)));
  const contributionIds = contributions.map(c => c.id);
  const [metadata, counts] = await Promise.all([
    loadCustomerListMetadata(reader, companyId, rows),
    contributionIds.length ? reader.select({ customerId: tickets.customerId, count: sql<number>`count(*)::int` })
      .from(tickets).leftJoin(ticketTypes, and(eq(ticketTypes.id, tickets.ticketTypeId), eq(ticketTypes.companyId, companyId)))
      .leftJoin(ticketTypeStatuses, and(eq(ticketTypeStatuses.id, tickets.currentStatusId),
        eq(ticketTypeStatuses.ticketTypeId, ticketTypes.id)))
      .where(and(eq(tickets.companyId, companyId), inArray(tickets.customerId, contributionIds),
        sql`CASE WHEN ${ticketTypeStatuses.id} IS NOT NULL
          THEN ${ticketTypeStatuses.isFinal} <> 'true'
          ELSE ${tickets.completedAt} IS NULL END`))
      .groupBy(tickets.customerId) : Promise.resolve([]),
  ]);
  const open = new Map(counts.map(c => [c.customerId, c.count]));
  return { summaries: Object.fromEntries(rows.map(c => [c.id, {
    ...projected[c.id], ...metadata.get(c.id),
    openTickets: c.isParent === "true"
      ? (open.get(c.id) ?? 0) + contributions.filter(b => b.parentCustomerId === c.id)
        .reduce((sum, b) => sum + (open.get(b.id) ?? 0), 0)
      : open.get(c.id) ?? 0,
  }])) };
}
