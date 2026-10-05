import {
  Calculator,
  Check,
  ClipboardList,
  FilePlus,
  FileText,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import {
  deriveStatusState,
  isSeededTicketType,
  STATUS_STATE_LABEL,
  STATUS_STATE_VAR,
  type TicketTypeKey,
  typeHueVar,
} from "@shared/ticketVisuals";
import { useTranslation } from "react-i18next";

const TYPE_ICON: Record<TicketTypeKey, typeof ClipboardList> = {
  estimate_request: Calculator,
  project: Layers,
  task: ClipboardCheck,
  rfp_request: FilePlus,
  invoice: FileText,
  todo: Check,
};

export interface TicketTypeLike {
  name: string;
  typeKey?: string | null;
}

export interface TicketStatusLike {
  name: string;
  statusKey?: string | null;
  actionType?: "needs_action" | "waiting" | null;
  isFinal?: "true" | "false" | null;
}

/** Resolve a ticket type's hue, including a distinct hue for invoices. */
export function ticketHue(type: TicketTypeLike | null | undefined): string {
  return typeHueVar(type);
}

export function TicketTypeBadge({
  type,
  hueType,
  testId,
  billingBehavior,
}: {
  type: TicketTypeLike | null | undefined;
  hueType?: TicketTypeLike | null;
  testId?: string;
  billingBehavior?: string | null;
}) {
  if (!type) return null;
  const hue = typeHueVar(hueType ?? type);
  const iconKey = (Object.keys(TYPE_ICON) as TicketTypeKey[])
    .find((key) => isSeededTicketType(type, key));
  const Icon = iconKey ? TYPE_ICON[iconKey] : ClipboardList;

  return (
    <>
    <span
      className="inline-flex items-center overflow-hidden rounded-md border bg-background"
      style={{ borderColor: `color-mix(in srgb, ${hue} 38%, var(--border))` }}
      data-testid={testId}
    >
      <span
        className="flex w-5 self-stretch items-center justify-center"
        style={{ background: hue, color: "var(--tt-on-hue)" }}
      >
        <Icon className="h-3 w-3" />
      </span>
      <span
        className="whitespace-nowrap px-2 py-0.5 text-[11.5px] font-semibold"
        style={{ color: `color-mix(in srgb, ${hue} 82%, var(--foreground))` }}
      >
        {type.name}
      </span>
    </span>
    {isSeededTicketType(type, "task") && billingBehavior !== undefined && (
      <TaskBillingBadge billingBehavior={billingBehavior} />
    )}
    </>
  );
}

export function TaskBillingBadge({ billingBehavior }: { billingBehavior?: string | null }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex rounded-md border px-2 py-0.5 text-xs font-normal" data-testid="badge-task-billing">
      {billingBehavior === "invoice_required" ? t('workTypes.extra_work') : t('workTypes.contract')}
    </span>
  );
}

export function TicketStatusPill({
  status,
  testId,
}: {
  status: TicketStatusLike | null | undefined;
  testId?: string;
}) {
  if (!status) return null;
  const state = deriveStatusState(status);
  const color = STATUS_STATE_VAR[state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${state === "waiting" ? "border-dashed" : ""}`}
      style={{
        background: `color-mix(in srgb, ${color} 13%, var(--background))`,
        color: `color-mix(in srgb, ${color} 80%, var(--foreground))`,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
      }}
      title={STATUS_STATE_LABEL[state]}
      data-testid={testId}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {status.name}
    </span>
  );
}
