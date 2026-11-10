import type { ReactNode } from "react";
import { Calculator } from "lucide-react";
import { ticketHue } from "@/components/TicketIdentity";
import { STATUS_STATE_VAR } from "@shared/ticketVisuals";
import { cn } from "@/lib/utils";

/**
 * Mirrors the ticket identity header (TicketDetail `header-ticket-identity`) with the same tokens:
 * rounded-xl card, 4px hue top border, hue-tinted border, icon-chip badge, state pill, metadata strip.
 * Mirrored rather than extracted so TicketDetail stays untouched (see docs/estimates/estimate-builder-screen.md).
 */
export const ESTIMATE_HUE = ticketHue({ name: "Estimate Request", typeKey: "estimate_request" });

export function IdentityHeaderCard({ children, footer, testId }: { children: ReactNode; footer?: ReactNode; testId: string }) {
  const hue = ESTIMATE_HUE;
  return (
    <div className="overflow-hidden rounded-xl border border-t-4 bg-card" data-testid={testId} data-hue={hue}
      style={{ borderColor: `color-mix(in srgb, ${hue} 20%, hsl(var(--border)))`, borderTopColor: hue }}>
      <div className="px-3 py-3">{children}</div>
      {footer}
    </div>
  );
}

export function DocumentBadge({ label, testId }: { label: string; testId: string }) {
  const hue = ESTIMATE_HUE;
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border bg-background" data-testid={testId}
      style={{ borderColor: `color-mix(in srgb, ${hue} 38%, hsl(var(--border)))` }}>
      <span className="flex w-6 self-stretch items-center justify-center" style={{ background: hue, color: "var(--tt-on-hue)" }}>
        <Calculator className="h-3.5 w-3.5" />
      </span>
      <span className="whitespace-nowrap px-2.5 py-1 text-[12px] font-semibold" style={{ color: `color-mix(in srgb, ${hue} 82%, hsl(var(--foreground)))` }}>
        {label}
      </span>
    </span>
  );
}

export type EstimatePillState = "action" | "waiting" | "done" | "muted";
export function estimatePillState(status: string, voided: boolean): EstimatePillState {
  if (voided) return "muted";
  if (status === "draft") return "action";
  if (status === "sent") return "waiting";
  if (status === "accepted" || status === "invoiced") return "done";
  return "muted";
}
const PILL_COLOR: Record<EstimatePillState, string> = {
  action: STATUS_STATE_VAR.active, waiting: STATUS_STATE_VAR.waiting, done: STATUS_STATE_VAR.done, muted: "hsl(var(--muted-foreground))",
};

/** Ticket-status-pill construction; draft = needs action, sent = waiting (dashed), accepted = done, others muted. */
export function EstimateStatePill({ status, voided, label, testId, title }: { status: string; voided: boolean; label: string; testId: string; title?: string }) {
  const state = estimatePillState(status, voided);
  const color = PILL_COLOR[state];
  return (
    <span data-testid={testId} data-state={state} title={title}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium", state === "waiting" && "border-dashed")}
      style={{
        background: `color-mix(in srgb, ${color} 13%, hsl(var(--background)))`,
        color: `color-mix(in srgb, ${color} 80%, hsl(var(--foreground)))`,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
      }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function MetadataStrip({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <dl className="mt-3 grid gap-x-5 gap-y-3 border-t pt-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]" data-testid={testId}>
      {children}
    </dl>
  );
}

export function MetadataCell({ label, children, testId, wide }: { label: string; children: ReactNode; testId: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "[grid-column:span_2]")} data-testid={testId}>
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}
