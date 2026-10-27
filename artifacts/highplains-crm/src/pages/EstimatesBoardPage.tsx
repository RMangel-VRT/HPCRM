import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { TicketTypeBadge, ticketHue } from "@/components/TicketIdentity";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type StageKey = "new" | "estimating" | "proposal" | "sent" | "decision";
export const STAGE_KEYS: StageKey[] = ["new", "estimating", "proposal", "sent", "decision"];
export interface BoardTicket {
  id: string; title: string; typeKey: "estimate_request" | "rfp_request";
  statusKey: string; statusName: string;
  customer: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  priority: string; estimateNumber: string | null; daysInStage: number;
}
export interface BoardResponse { stages: { key: StageKey; tickets: BoardTicket[] }[] }

export function BidCard({ ticket }: { ticket: BoardTicket }) {
  const { t } = useTranslation();
  const type = { name: t(`estimates.type.${ticket.typeKey}`), typeKey: ticket.typeKey };
  const stale = ticket.daysInStage >= 7;
  return (
    <Link
      href={`/dashboard/tickets/${ticket.id}`}
      data-testid={`card-bid-${ticket.id}`}
      className="block rounded-md border bg-card p-3 border-l-4 hover-elevate"
      style={{ borderLeftColor: ticketHue(type) }}
    >
      <div className="text-sm font-semibold leading-snug" data-testid={`text-bid-title-${ticket.id}`}>{ticket.title}</div>
      <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{ticket.customer?.name ?? ""}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TicketTypeBadge type={type} />
        {ticket.estimateNumber && <span className="text-xs font-medium tabular-nums">{ticket.estimateNumber}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="truncate">{ticket.assignee?.name ?? t("estimates.unassigned")}</span>
        <span className="capitalize">{t("estimates.priority")}: {t(`priorities.${ticket.priority}`, { defaultValue: ticket.priority })}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{ticket.statusName}</span>
        <span
          data-testid={`text-bid-days-${ticket.id}`}
          data-warn={stale ? "true" : "false"}
          className={stale ? "rounded px-1.5 py-0.5 font-semibold" : "font-medium"}
          style={stale ? { color: "hsl(var(--est-warn))", background: "hsl(var(--est-warn-bg))" } : undefined}
        >
          {t("estimates.days", { count: ticket.daysInStage })}
        </span>
      </div>
    </Link>
  );
}

export default function EstimatesBoardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const search = useSearch();
  const raw = new URLSearchParams(search).get("type");
  const type = raw === "estimate_request" || raw === "rfp_request" ? raw : null;
  const url = type ? `/api/estimates/board?type=${type}` : "/api/estimates/board";

  const { data, isLoading, isError, refetch } = useQuery<BoardResponse>({
    queryKey: ["/api/estimates/board", user?.activeCompanyId, user?.id, user?.activeRole, type],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const rail = <EstimatesRail activeKey={type ?? "all"} />;

  return (
    <SectionRailLayout rail={rail}>
      {isError ? (
        <div className="flex flex-col items-start gap-3" role="alert" data-testid="estimates-error">
          <p className="text-sm text-muted-foreground">{t("estimates.error")}</p>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-estimates-retry">{t("estimates.retry")}</Button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" data-testid="estimates-board" aria-busy={isLoading}>
          {STAGE_KEYS.map((key) => {
            const tickets = data?.stages.find((s) => s.key === key)?.tickets ?? [];
            return (
              <section key={key} className="w-[280px] shrink-0" data-testid={`column-${key}`} aria-label={t(`estimates.stage.${key}`)}>
                <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  <span>{t(`estimates.stage.${key}`)}</span>
                  <span className="rounded-full bg-muted px-2 text-xs tabular-nums" data-testid={`count-${key}`}>{isLoading ? "–" : tickets.length}</span>
                </h3>
                <div className="space-y-2 rounded-md bg-muted/40 p-2 min-h-[120px]">
                  {isLoading ? (
                    <div role="status" aria-label={t("estimates.loading")} className="space-y-2">
                      <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
                    </div>
                  ) : tickets.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-muted-foreground" data-testid={`empty-${key}`}>{t("estimates.empty")}</p>
                  ) : tickets.map((tk) => <BidCard key={tk.id} ticket={tk} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </SectionRailLayout>
  );
}
