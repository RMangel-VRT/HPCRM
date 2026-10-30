import type { InvoicePushReadiness, InvoiceReadinessProblem } from "@workspace/db/invoice-contracts";
import { calculateExtendedCents } from "./estimateMath";

export function invoiceLineAmount(quantity: string | null, rateCents: number | null): number | null {
  return quantity === null || rateCents === null ? null : calculateExtendedCents(quantity, rateCents);
}
export function computeInvoiceSubtotal(lines: readonly { amountCents: number | null }[]): number {
  let sum = 0n;
  for (const { amountCents } of lines) {
    if (amountCents === null) continue;
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new RangeError("Invalid amount");
    sum += BigInt(amountCents);
  }
  if (sum > 2147483647n) throw new RangeError("Subtotal exceeds supported range");
  return Number(sum);
}
export function pushReadiness(detail: {
  lines: readonly { id: string; quantity: string | null; rateCents: number | null }[];
  subtotalCents: number; qboCustomerId: string | null;
}): InvoicePushReadiness {
  const problems: InvoiceReadinessProblem[] = [];
  if (!detail.lines.length) problems.push({ code: "NO_LINES" });
  const lineIds = detail.lines.filter(l => l.quantity === null || l.rateCents === null).map(l => l.id);
  if (lineIds.length) problems.push({ code: "UNPRICED_LINE", lineIds });
  if (detail.qboCustomerId === null) problems.push({ code: "CUSTOMER_NOT_LINKED" });
  if (detail.subtotalCents === 0) problems.push({ code: "ZERO_TOTAL" });
  return { ready: problems.length === 0, problems };
}
