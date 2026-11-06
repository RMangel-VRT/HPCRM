import type { Communication } from "@workspace/db";

/** A local communication log, not provider-delivered/imported or automated mail.
 * A deleted mailbox must not reclassify its retained provider messages as logs.
 */
export function isLoggedCustomerCommunication(c: Pick<Communication,
  "mailboxAccountId" | "providerMessageId" | "deliveryProvider" | "automationRuleId">) {
  return !c.mailboxAccountId && !c.providerMessageId && !c.deliveryProvider && !c.automationRuleId;
}
