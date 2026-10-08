import { deriveStatusState, type TicketStatusState } from "./ticketVisuals";

/** Client-only mirror of the list API relationship contract. */
export interface TicketLinkSummary {
  invoices: Array<{
    id: string; title: string; statusKey: string | null; statusName: string; isFinal: boolean;
  }>;
  parent: { id: string; title: string; typeKey: string | null; typeName: string } | null;
}

const STATE_PROGRESS: Record<TicketStatusState, number> = {
  open: 0, active: 1, waiting: 2, lost: 3, done: 4,
};

export function invoiceChip(summary?: TicketLinkSummary): { label: string; state: TicketStatusState } | null {
  if (!summary?.invoices.length) return null;
  const pending = summary.invoices.filter(invoice => !invoice.isFinal).length;
  const states = summary.invoices.map(invoice => deriveStatusState({
    statusKey: invoice.statusKey, isFinal: invoice.isFinal ? "true" : "false",
  }));
  const state = states.reduce((least, next) => STATE_PROGRESS[next] < STATE_PROGRESS[least] ? next : least);
  return {
    label: summary.invoices.length === 1
      ? `Invoice · ${pending ? "Pending" : "Invoiced"}`
      : `${summary.invoices.length} invoices · ${pending} pending`,
    state,
  };
}
