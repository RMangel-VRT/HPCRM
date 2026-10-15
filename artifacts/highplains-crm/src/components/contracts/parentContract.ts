import type { ContractListItem } from "./contractTypes";
import { formatDollars } from "./rateCardUtils";

export function contractCustomerLabel(item: ContractListItem) {
  return `${item.customerName}${item.locationCount ? ` · ${item.locationCount} locations` : ""}`;
}

/** A display hint only. Never use a name match as billing ownership. */
export function branchPaymentHint(item: ContractListItem) {
  if (!item.viaParent || !item.branch) return null;
  const prefixes = [item.branch.billingCode, item.branch.name].filter((p): p is string => !!p?.trim())
    .map(p => p.trim().toLocaleLowerCase());
  const line = item.payments?.find(p => prefixes.some(prefix => p.component.trim().toLocaleLowerCase().startsWith(prefix)));
  const amount = line?.months.find(m => m.amountCents > 0)?.amountCents;
  return line && amount !== undefined ? `Your branch: ${line.component}, ${formatDollars(amount)}/month` : null;
}
