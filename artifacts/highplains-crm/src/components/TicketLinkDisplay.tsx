import { invoiceChip, type TicketLinkSummary } from "@shared/ticketLinks";
import { STATUS_STATE_VAR, typeHueVar } from "@shared/ticketVisuals";

/** Display-only: safe inside a card's existing navigation link. */
export function InvoiceLinkChip({ summary }: { summary?: TicketLinkSummary }) {
  const chip = invoiceChip(summary);
  if (!chip) return null;
  const color = STATUS_STATE_VAR[chip.state];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium"
      data-testid="invoice-link-chip"
      style={{
        background: `color-mix(in srgb, ${color} 13%, var(--background))`,
        color: `color-mix(in srgb, ${color} 80%, var(--foreground))`,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {chip.label}
    </span>
  );
}

export function InvoiceParentLine({ summary, typeKey }: { summary?: TicketLinkSummary; typeKey?: string | null }) {
  const parent = summary?.parent;
  if (typeKey !== "invoice" || !parent) return null;
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="invoice-parent-line">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: typeHueVar({ name: parent.typeName, typeKey: parent.typeKey }) }} />
      <span className="truncate">For: {parent.title}</span>
    </div>
  );
}
