import { useTranslation } from "react-i18next";
import { EyeOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CONVERSATIONS_NS } from "./i18n";
import type { ConversationKind, Staff } from "./api";

const KIND_STYLE: Record<ConversationKind, string> = {
  estimate: "bg-[hsl(32_88%_93%)] text-[hsl(28_70%_32%)] border-[hsl(32_70%_80%)]",
  inquiry: "bg-[hsl(198_70%_93%)] text-[hsl(204_62%_30%)] border-[hsl(198_50%_80%)]",
  message: "bg-[hsl(150_22%_92%)] text-[hsl(152_30%_26%)] border-[hsl(150_18%_78%)]",
  note: "bg-[hsl(48_70%_91%)] text-[hsl(42_60%_28%)] border-[hsl(46_50%_76%)]",
  call: "bg-[hsl(12_60%_93%)] text-[hsl(10_52%_34%)] border-[hsl(12_45%_80%)]",
  letter: "bg-[hsl(220_14%_92%)] text-[hsl(220_16%_30%)] border-[hsl(220_12%_80%)]",
  sms: "bg-[hsl(172_40%_91%)] text-[hsl(176_44%_24%)] border-[hsl(172_30%_76%)]",
};

export function KindBadge({ kind, className }: { kind: ConversationKind; className?: string }) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide", KIND_STYLE[kind] ?? KIND_STYLE.message, className)} data-testid={`badge-kind-${kind}`}>
      {t(`kinds.${kind}`)}
    </span>
  );
}

export function useRoleLabel() {
  const { t } = useTranslation(CONVERSATIONS_NS);
  return (role: string) => {
    if (["admin", "account_manager", "office"].includes(role)) return t(`roles.${role}`);
    return role.split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  };
}

/** Purple dashed internal-only tag. Never part of anything a customer receives. */
export function StaffTag({ staff, compact }: { staff: Staff; compact?: boolean }) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const roleLabel = useRoleLabel();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[hsl(268_48%_66%)] bg-[hsl(268_60%_97%)] px-1.5 py-px text-[11px] font-medium text-[hsl(268_42%_40%)] dark:bg-[hsl(268_30%_18%)] dark:text-[hsl(268_60%_82%)]"
          data-testid={`tag-staff-${staff.userId}`}
        >
          <EyeOff className="h-3 w-3" aria-hidden />
          {staff.name}{!compact && <span className="opacity-70"> · {roleLabel(staff.role)}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("internalTooltip")}</TooltipContent>
    </Tooltip>
  );
}

export function TeamInitials({ team }: { team: Staff[] }) {
  if (!team.length) return null;
  return (
    <span className="flex -space-x-1.5">
      {team.slice(0, 3).map((s) => (
        <span key={s.userId} title={s.name} className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-[hsl(268_48%_66%)] bg-[hsl(268_60%_97%)] text-[9px] font-bold text-[hsl(268_42%_40%)] ring-2 ring-background dark:bg-[hsl(268_30%_18%)] dark:text-[hsl(268_60%_82%)]">
          {s.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </span>
      ))}
    </span>
  );
}
