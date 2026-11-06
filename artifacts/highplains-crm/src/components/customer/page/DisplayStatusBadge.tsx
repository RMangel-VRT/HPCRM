import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { DISPLAY_STATUS_VAR, type DisplayStatus } from "./displayStatus";

/** Shared status pill: tinted from the existing --ts-* scale, label from cp4.status.*. */
export function DisplayStatusBadge({ status, label, title, className, testId }: {
  status: DisplayStatus; label?: string; title?: string; className?: string; testId?: string;
}) {
  const { t } = useTranslation();
  const hue = DISPLAY_STATUS_VAR[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}
      style={{ background: `color-mix(in srgb, ${hue} var(--tt-tint), transparent)`, color: `color-mix(in srgb, ${hue} 85%, var(--foreground))` }}
      title={title}
      data-status={status}
      data-testid={testId}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: hue }} />
      {label ?? t(`cp4.status.${status}`)}
    </span>
  );
}
