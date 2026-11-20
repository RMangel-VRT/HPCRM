import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProposalWithDetails } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { fetchJson } from "@/lib/hardscapeCatalog";
import { scopeOf } from "@/lib/estimateSettings";

export const OLD_PROPOSALS_PATH = "/dashboard/tools/proposals";
export const PROPOSALS_API = "/api/proposals";

export function useProposalHistory<T = ProposalWithDetails>(id?: string) {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId ?? "";
  const identity = scopeOf(user);
  const path = id ? `${PROPOSALS_API}/${encodeURIComponent(id)}` : PROPOSALS_API;
  return useQuery<T>({
    queryKey: [PROPOSALS_API, id ?? "list", identity],
    queryFn: ({ signal }) => fetchJson<T>(path, companyId, signal),
    enabled: !!companyId && (user?.accessRole === "admin" || user?.accessRole === "office"),
    retry: false,
  });
}

export function ProposalRetiredNotice() {
  const { t } = useTranslation();
  return (
    <div role="note" className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm" data-testid="banner-proposals-retired">
      <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      {t("proposals.history.banner")}
    </div>
  );
}
