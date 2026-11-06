import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canPromote, qboJson, viewerScope } from "@/lib/qboReview";
import type { MissingField } from "./wizardModel";

/** Lists missing required-for-active fields with a Finish setup link. */
export function MissingFieldsNotice({ customerId, fields, variant = "banner" }: { customerId: string; fields: MissingField[]; variant?: "banner" | "inline" }) {
  const { t } = useTranslation();
  const labels = fields.map(f => t(`customerWizard.fields.${f}`)).join(", ");
  return (
    <div role={variant === "inline" ? "alert" : "status"} data-testid={variant === "inline" ? "notice-activation-blocked" : "banner-finish-setup"}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <span className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        {t(variant === "inline" ? "customerWizard.activationBlocked" : "customerWizard.finishBanner", { fields: labels })}
      </span>
      <Link href={`/dashboard/customers/${customerId}/edit`} className="rounded-md border border-amber-600/40 bg-background px-3 py-1 text-xs font-medium hover:bg-muted" data-testid="link-finish-setup">
        {t("customerWizard.finishAction")}
      </Link>
    </div>
  );
}

/** Advisory for prospects and legacy active customers with incomplete setup. */
/** Shared (deduplicated) setup read: the Dashboard turns this into a Needs-attention chip. */
export function useSetupMissingFields(customerId: string | undefined, status: string | null | undefined) {
  const { user } = useAuth();
  const enabled = !!customerId && (status === "prospect" || status === "active") && canPromote(user);
  const q = useQuery<{ missingFields: MissingField[] }>({
    queryKey: ["/api/customers", customerId, "setup", user?.activeCompanyId ?? null, ...viewerScope(user)],
    queryFn: () => qboJson("GET", `/api/customers/${customerId}/setup`, user?.activeCompanyId),
    enabled, retry: false, staleTime: 30_000,
  });
  return { enabled, isLoading: enabled && q.isLoading, isError: enabled && !!q.error,
    fields: enabled ? q.data?.missingFields ?? [] : [], refetch: q.refetch };
}
export type SetupState = ReturnType<typeof useSetupMissingFields>;

export function FinishSetupBanner({ customerId, status }: { customerId: string; status: string | null | undefined }) {
  const { user } = useAuth();
  const enabled = (status === "prospect" || status === "active") && canPromote(user);
  const q = useQuery<{ missingFields: MissingField[] }>({
    queryKey: ["/api/customers", customerId, "setup", user?.activeCompanyId ?? null, ...viewerScope(user)],
    queryFn: () => qboJson("GET", `/api/customers/${customerId}/setup`, user?.activeCompanyId),
    enabled, retry: false, staleTime: 30_000,
  });
  const fields = q.data?.missingFields ?? [];
  if (!enabled || !fields.length) return null;
  return <MissingFieldsNotice customerId={customerId} fields={fields} />;
}
