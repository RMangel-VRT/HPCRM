import type { UserWithContext } from "../auth";
import type { IStorage } from "../storage";
import type { CommunicationWithDetails } from "@workspace/db";
import { resolveVisibleMailboxes } from "./mailboxScope";

/** Delivered outbound, received inbound, and manually logged contacts, never drafts/failures. */
export function actualCommunications(rows: CommunicationWithDetails[]) {
  return rows.filter(c => c.status !== "draft" && c.status !== "scheduled" && c.status !== "failed" &&
    c.deliveryStatus !== "failed" && (c.status === "sent" || (c.direction === "inbound" && c.receivedAt != null)));
}
export function contactInstant(c: CommunicationWithDetails) {
  return (c.direction === "inbound" ? c.receivedAt ?? c.sentAt : c.sentAt ?? c.receivedAt) ?? c.createdAt;
}

/** Apply the canonical server scope BEFORE optional client narrowing. */
export async function readDashboardCommunications(
  storage: Pick<IStorage, "getCommunications">, user: UserWithContext, customerId: string,
  viewAs?: string, mailboxIds?: string,
) {
  const scope = await resolveVisibleMailboxes({
    userId: user.id, companyId: user.activeCompanyId, role: user.activeRole,
    isSuperAdmin: user.isSuperAdminBool, viewAs,
  });
  const rows = await storage.getCommunications(user.activeCompanyId, { customerId }, scope);
  const selected = mailboxIds === undefined ? null : new Set(mailboxIds.split(",").filter(Boolean));
  return actualCommunications(selected ? rows.filter(c => c.mailboxAccountId && selected.has(c.mailboxAccountId)) : rows);
}
