import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./ContractBadges";
import { money } from "./contractFormat";

export interface LinkedContract {
  agreementId: string; termId: string; customerName: string; line: string; form: string;
  seasonLabel: string; displayStatus: string; annualPriceCents: number | null; snowPricing?: string | null;
}
export function LinkedContractRow({ contract: c }: { contract: LinkedContract }) {
  const { t } = useTranslation();
  return <Link href={`/dashboard/contracts/${c.agreementId}`} onClick={e => e.stopPropagation()}
    data-testid={`rfp-contract-${c.termId}`} className="block rounded border p-2 text-xs hover:bg-muted">
    <div>{c.customerName} · {t(`rfpContracts.line.${c.line}`)}</div>
    <div className="flex flex-wrap items-center gap-1.5">
      <span>{t(`rfpContracts.form.${c.form}`)} · {c.seasonLabel}</span>
      <StatusPill status={c.displayStatus} />
      <span>{c.line === "snow" && c.snowPricing === "time_and_materials" ? t("rfpContracts.tm") : money(c.annualPriceCents)}</span>
    </div>
  </Link>;
}
export function RfpContracts({ ticketId, statuses, statusId }: {
  ticketId: string; statuses: { id: string; statusKey?: string | null; isFinal: string; displayOrder: number }[]; statusId: string;
}) {
  const { t } = useTranslation(), { user } = useAuth();
  const current = statuses.find(s => s.id === statusId), draft = statuses.find(s => s.statusKey === "proposal_draft");
  const final = current?.isFinal === "true" || ["closed_lost", "closed_won"].includes(current?.statusKey ?? "");
  const eligible = !!current && !!draft && current.displayOrder >= draft.displayOrder;
  const contracts = useQuery<LinkedContract[]>({
    queryKey: ["/api/contract-center/contracts", user?.activeCompanyId, user?.id, { bidTicketId: ticketId }],
    queryFn: async () => (await apiRequest("GET", `/api/contract-center/contracts?bidTicketId=${encodeURIComponent(ticketId)}`)).json(),
    staleTime: 0, refetchInterval: 60_000,
  });
  return <Card data-testid="card-rfp-contracts">
    <CardHeader><CardTitle className="text-base">{t("rfpContracts.title")}</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      {contracts.isLoading ? <p className="text-xs text-muted-foreground">{t("rfpContracts.loading")}</p>
        : contracts.isError ? <Button variant="outline" size="sm" onClick={() => void contracts.refetch()}>{t("rfpContracts.retry")}</Button>
        : contracts.data?.map(c => <LinkedContractRow key={c.termId} contract={c} />)}
      {!final && (eligible ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/contracts/new?fromRfp=${encodeURIComponent(ticketId)}`}>{t("rfpContracts.create")}</Link></Button>
        : <p className="text-xs text-muted-foreground">{t("rfpContracts.beforeDraft")}</p>)}
    </CardContent>
  </Card>;
}
