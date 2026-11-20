import { and, asc, eq, inArray } from "drizzle-orm";
import { contacts, customers, mailboxAccounts, propertyManagerEmails, propertyManagers } from "@workspace/db";
import { estimateEmailInput, type EstimateEmailOptionsDto } from "@workspace/db/estimate-contracts";
import type { UserWithContext } from "../auth";
import { db } from "../db";
import { companyDocumentEmailOptions } from "./companyDocumentEmail";
import { requireEstimate } from "./estimateErrors";
import { resolveVisibleMailboxes } from "./mailboxScope";

export async function visibleEstimateSenders(user: UserWithContext, mailboxId?: string) {
  const companyId = user.activeCompanyId;
  const visibility = await resolveVisibleMailboxes({ companyId, userId: user.id, role: user.activeRole, isSuperAdmin: user.isSuperAdminBool });
  if (visibility.mailboxIds?.length === 0) return [];
  return db.select({ id: mailboxAccounts.id, displayName: mailboxAccounts.displayName, emailAddress: mailboxAccounts.emailAddress,
    accountType: mailboxAccounts.accountType, ownerUserId: mailboxAccounts.ownerUserId })
    .from(mailboxAccounts).where(and(eq(mailboxAccounts.companyId, companyId), eq(mailboxAccounts.isActive, true),
      eq(mailboxAccounts.syncEnabled, true), eq(mailboxAccounts.syncStatus, "connected"),
      mailboxId ? eq(mailboxAccounts.id, mailboxId) : undefined,
      visibility.mailboxIds ? inArray(mailboxAccounts.id, visibility.mailboxIds) : undefined))
    .orderBy(asc(mailboxAccounts.displayName), asc(mailboxAccounts.id));
}

export async function estimateEmailOptions(user: UserWithContext, customerId: string): Promise<EstimateEmailOptionsDto> {
  const companyId = user.activeCompanyId;
  const [customer] = await db.select({ billing: customers.billingEmails, managerId: customers.propertyManagerId })
    .from(customers).where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
  const { billing, managerId } = requireEstimate(customer);
  const [mailboxes, settings, people, managers] = await Promise.all([
    visibleEstimateSenders(user), companyDocumentEmailOptions(companyId),
    db.select({ name: contacts.name, emails: contacts.emails, primary: contacts.isPrimary }).from(contacts)
      .where(and(eq(contacts.companyId, companyId), eq(contacts.customerId, customerId))).orderBy(asc(contacts.name)),
    managerId ? db.select({ name: propertyManagers.name, email: propertyManagerEmails.email, legacy: propertyManagers.email })
      .from(propertyManagers).leftJoin(propertyManagerEmails, and(eq(propertyManagerEmails.companyId, companyId),
        eq(propertyManagerEmails.propertyManagerId, propertyManagers.id)))
      .where(and(eq(propertyManagers.companyId, companyId), eq(propertyManagers.id, managerId))) : [],
  ]);
  const options = new Map<string, { email: string; name: string }>();
  const preferred = new Set<string>();
  const add = (address: string | null, name: string, primary = false) => {
    if (!address) return;
    const parsed = estimateEmailInput.shape.to.element.safeParse(address);
    if (!parsed.success) return;
    const email = parsed.data, key = email.toLowerCase();
    if (primary) preferred.add(key);
    if (!options.has(key)) options.set(key, { email, name });
  };
  for (const manager of managers) {
    add(manager.email, manager.name, true);
    add(manager.legacy, manager.name, true);
  }
  for (const person of people) for (const email of person.emails ?? []) add(email, person.name, person.primary === "true");
  for (const email of billing) add(email, "");
  const ranked = [...mailboxes].sort((a, b) => {
    const rank = (m: typeof a) => m.accountType === "shared" ? 0 : m.ownerUserId === user.id ? 1 : 2;
    return rank(a) - rank(b);
  });
  return { ...settings, mailboxes: ranked.map(({ id, displayName, emailAddress }) => ({ id, displayName, emailAddress })),
    defaultMailboxId: ranked.find(m => m.accountType === "shared" || m.ownerUserId === user.id)?.id ?? null,
    recipients: [...options.values()], defaultTo: preferred.size === 1 ? options.get([...preferred][0])!.email : null };
}
