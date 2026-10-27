import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { AgreementLine } from "./contractTypes";

const tint = (color: string, pct = 14): CSSProperties => ({
  color: `hsl(var(--foreground))`,
  backgroundColor: `color-mix(in srgb, ${color} ${pct}%, transparent)`,
  borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
});
const GREEN = "var(--ts-done)";
const BLUE = "var(--ts-active)";
const AMBER = "var(--ts-waiting)";
const GREY = "var(--ts-open)";
const RED = "var(--ts-lost)";

const base = "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function LineBadge({ line, className }: { line: AgreementLine; className?: string }) {
  if (line === "both") {
    return (
      <span
        data-testid="badge-line-both"
        className={cn(base, className)}
        style={{
          color: "hsl(var(--foreground))",
          borderColor: "hsl(var(--border))",
          backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${GREEN} 22%, transparent) 50%, color-mix(in srgb, ${BLUE} 22%, transparent) 50%)`,
        }}
      >
        Landscape + Snow
      </span>
    );
  }
  return (
    <span data-testid={`badge-line-${line}`} className={cn(base, className)} style={tint(line === "snow" ? BLUE : GREEN)}>
      {line === "snow" ? "Snow" : "Landscape"}
    </span>
  );
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: GREY },
  sent: { label: "Sent", color: BLUE },
  signed: { label: "Signed", color: GREEN },
  active: { label: "Active", color: GREEN },
  expired: { label: "Expired", color: AMBER },
  renewed: { label: "Renewed", color: GREY },
  lost: { label: "Lost", color: RED },
  cancelled: { label: "Cancelled", color: GREY },
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const s = STATUS[status] ?? { label: status, color: GREY };
  return (
    <span data-testid={`pill-status-${status}`} className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", className)}>
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
      {t(`rfpContracts.status.${status}`, { defaultValue: s.label })}
    </span>
  );
}

export function RenewalChip({ className }: { className?: string }) {
  return (
    <span data-testid="chip-up-for-renewal" className={cn(base, className)} style={tint(AMBER, 18)}>
      Up for renewal
    </span>
  );
}

export function ReviewChip({ className }: { className?: string }) {
  return (
    <span data-testid="chip-needs-review" className={cn(base, className)} style={tint(AMBER, 18)}>
      Needs review
    </span>
  );
}

export function TintChip({ kind, children }: { kind: "changed" | "custom"; children: string }) {
  return (
    <span data-testid={`chip-${kind}`} className={base} style={tint(kind === "changed" ? AMBER : BLUE, 16)}>
      {children}
    </span>
  );
}

export const amberBox: CSSProperties = tint(AMBER, 14);
