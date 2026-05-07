import { db } from "../db";
import { contacts, customers, communications, unsortedEmails } from "@shared/schema";
import { eq, and, or, sql, inArray } from "drizzle-orm";

export interface ParsedMessage {
  providerMessageId: string;
  providerThreadId: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  receivedAt: Date;
  attachmentsJson?: unknown[];
  /** The syncing mailbox's own email address — excluded from participant matching so the mailbox owner is never treated as a customer contact */
  mailboxEmailAddress?: string;
}

export type RoutingAction = "route" | "unsorted" | "discard";
export type RoutingMethod = "email_match" | "thread_match" | "content_match" | "manual";

export interface RoutingResult {
  action: RoutingAction;
  customerId?: string;
  routingMethod?: RoutingMethod;
  routingConfidence?: number;
  candidateCustomerIds?: string[];
  routingNotes?: string;
}

export interface RouteMessageOpts {
  direction?: "inbound" | "outbound";
}

/**
 * Deterministic 4-tier routing ladder.
 * Returns a RoutingResult indicating how the message should be stored.
 * No sensitive content (addresses, bodies) is logged — only IDs and counts.
 *
 * @param opts.direction - "inbound" (default): match on fromAddress (customer sent to mailbox).
 *                         "outbound": match on toAddresses/ccAddresses (mailbox sent to customer).
 */
export async function routeMessage(companyId: string, msg: ParsedMessage, opts: RouteMessageOpts = {}): Promise<RoutingResult> {
  const direction = opts.direction ?? "inbound";
  const mailboxLower = (msg.mailboxEmailAddress ?? "").toLowerCase().trim();

  // ── Tier 1: Exact email address match against contacts.emails ──────────────
  // For inbound: the customer is the sender — match fromAddress.
  // For outbound: the mailbox is the sender (excluded), customer is a recipient — match toAddresses + ccAddresses.
  const tier1Candidates: string[] =
    direction === "outbound"
      ? [...(msg.toAddresses ?? []), ...(msg.ccAddresses ?? [])]
          .map(a => a.toLowerCase().trim())
          .filter(a => a && a !== mailboxLower)
      : [msg.fromAddress]
          .map(a => a.toLowerCase().trim())
          .filter(a => a && a !== mailboxLower);

  const uniqueTier1 = [...new Set(tier1Candidates)];

  let tier1CustomerIds: string[] = [];
  if (uniqueTier1.length > 0) {
    const addressConditions = uniqueTier1.map(
      addr => sql`lower(${contacts.emails}::text)::text[] @> ARRAY[${addr}]::text[]`
    );
    const contactRows = await db
      .select({ customerId: contacts.customerId })
      .from(contacts)
      .where(
        and(
          eq(contacts.companyId, companyId),
          or(...addressConditions)
        )
      );
    tier1CustomerIds = [...new Set(contactRows.map(r => r.customerId).filter(Boolean))] as string[];
  }

  if (tier1CustomerIds.length === 1) {
    return {
      action: "route",
      customerId: tier1CustomerIds[0],
      routingMethod: "email_match",
      routingConfidence: 1.0,
      routingNotes: `[email-sync] Tier 1 email_match: matched contact email address`,
    };
  }
  if (tier1CustomerIds.length > 1) {
    return {
      action: "unsorted",
      candidateCustomerIds: tier1CustomerIds,
      routingNotes: `[email-sync] Tier 1 email_match: multiple customers share a participant email (count=${tier1CustomerIds.length})`,
    };
  }

  // ── Tier 2: In-Reply-To / threadId match against communications ─────────────
  const threadCandidates: string[] = [];

  if (msg.inReplyTo || msg.providerThreadId) {
    const conditions = [];
    if (msg.inReplyTo) {
      conditions.push(eq(communications.providerMessageId, msg.inReplyTo));
    }
    if (msg.providerThreadId) {
      conditions.push(eq(communications.providerThreadId, msg.providerThreadId));
    }

    const threadRows = await db
      .select({ customerId: communications.customerId })
      .from(communications)
      .where(and(eq(communications.companyId, companyId), or(...conditions)));

    const ids = [...new Set(threadRows.map(r => r.customerId).filter(Boolean))] as string[];
    threadCandidates.push(...ids);
  }

  if (threadCandidates.length === 1) {
    return {
      action: "route",
      customerId: threadCandidates[0],
      routingMethod: "thread_match",
      routingConfidence: 0.95,
      routingNotes: `[email-sync] Tier 2 thread_match: matched existing thread/in-reply-to`,
    };
  }
  if (threadCandidates.length > 1) {
    return {
      action: "unsorted",
      candidateCustomerIds: threadCandidates,
      routingNotes: `[email-sync] Tier 2 thread_match: multiple customers in thread (count=${threadCandidates.length})`,
    };
  }

  // ── Tier 3: keyword search — customer name / number / street ────────────────
  const searchCorpus = (msg.subject + " " + msg.bodyText.slice(0, 5000)).toLowerCase();

  const allCustomers = await db
    .select({
      id: customers.id,
      name: customers.name,
      customerNumber: customers.customerNumber,
      street: customers.street,
    })
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.active, "true")));

  // Tier 3: content-signal keywords (property name, street, account number) — always unsorted.
  // Any content match, whether single or multiple, requires human triage.
  const tier3Matches: string[] = [];
  for (const cust of allCustomers) {
    const nameLower = cust.name.toLowerCase();
    const streetLower = (cust.street ?? "").toLowerCase();
    const numberLower = (cust.customerNumber ?? "").toLowerCase();

    const nameMatch = nameLower.length >= 3 && searchCorpus.includes(nameLower);
    const streetMatch = streetLower.length >= 5 && searchCorpus.includes(streetLower);
    const numberMatch = numberLower.length >= 2 && searchCorpus.includes(numberLower);

    if (nameMatch || streetMatch || numberMatch) {
      tier3Matches.push(cust.id);
    }
  }

  const tier3Unique = [...new Set(tier3Matches)];
  if (tier3Unique.length >= 1) {
    return {
      action: "unsorted",
      candidateCustomerIds: tier3Unique.slice(0, 10),
      routingNotes: `[email-sync] Tier 3 content_match: ${tier3Unique.length === 1 ? "single" : "multiple"} customer${tier3Unique.length > 1 ? "s" : ""} matched via property name/address/number (count=${tier3Unique.length})`,
    };
  }

  // ── Tier 4: PMC / management company name search ────────────────────────────
  const pmcCustomers = await db
    .select({
      id: customers.id,
      managementCompany: customers.managementCompany,
    })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        eq(customers.active, "true"),
        sql`management_company IS NOT NULL AND management_company != ''`
      )
    );

  const pmcMatches: string[] = [];
  for (const cust of pmcCustomers) {
    const pmcLower = (cust.managementCompany ?? "").toLowerCase();
    if (pmcLower.length >= 3 && searchCorpus.includes(pmcLower)) {
      pmcMatches.push(cust.id);
    }
  }

  const pmcUnique = [...new Set(pmcMatches)];
  if (pmcUnique.length === 1) {
    return {
      action: "route",
      customerId: pmcUnique[0],
      routingMethod: "content_match",
      routingConfidence: 0.6,
      routingNotes: `[email-sync] Tier 4 pmc_match: single customer matched via management company name`,
    };
  }
  if (pmcUnique.length > 1) {
    return {
      action: "unsorted",
      candidateCustomerIds: pmcUnique.slice(0, 10),
      routingNotes: `[email-sync] Tier 4 pmc_match: multiple customers matched via PMC name (count=${pmcUnique.length})`,
    };
  }

  // ── No match — discard ───────────────────────────────────────────────────────
  return {
    action: "discard",
    routingNotes: `[email-sync] No CRM signals found — discarding message`,
  };
}
