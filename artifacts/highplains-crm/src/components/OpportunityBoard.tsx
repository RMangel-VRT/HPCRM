import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { TicketTypeBadge, ticketHue } from "@/components/TicketIdentity";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkedContractRow, type LinkedContract } from "@/components/contracts/RfpContracts";
import { resolveDisplayTypeKey } from "@shared/ticketVisuals";

export interface BoardTicket {
  contracts?: LinkedContract[];
  id: string; title: string; typeKey: string; statusKey: string; statusName: string;
  customer: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  owner: { sectionKey: "scheduling" | "invoicing"; label: string; href: string } | null;
  priority: string; estimateNumber: string | null; daysInStage: number;
}
export interface BoardResponse { stages: { key: string; tickets: BoardTicket[] }[] }

function OpportunityCard({ ticket, labels, readOnly }: { ticket: BoardTicket; labels: string; readOnly: boolean }) {
  const { t } = useTranslation();
  // Display resolvers project approved estimates as Projects without changing stored
  // identity; pre-approval estimates and RFPs keep their original badge and rail.
  const typeKey = resolveDisplayTypeKey(ticket.typeKey, ticket.statusKey);
  const type = {
    name: t(typeKey === "project" ? "estimates.projectLabel" : `${labels}.typeLabel`),
    typeKey,
  };
  const stale = ticket.daysInStage >= 7;
  return (
    <div className="space-y-1">
    <Link href={readOnly && ticket.owner ? ticket.owner.href : `/dashboard/tickets/${encodeURIComponent(ticket.id)}`}
      data-testid={`card-bid-${ticket.id}`}
      className={`block bg-card p-3 border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${readOnly
        ? "border-b border-border" : "rounded-md border hover-elevate"}`}
      style={{ borderLeftColor: ticketHue(type) }}>
      <div className="text-sm font-semibold leading-snug" data-testid={`text-bid-title-${ticket.id}`}>{ticket.title}</div>
      <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{ticket.customer?.name ?? ""}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TicketTypeBadge type={type} />
        {!readOnly && ticket.estimateNumber && <span className="text-xs font-medium tabular-nums">{ticket.estimateNumber}</span>}
      </div>
      {readOnly ? (
        <div className="mt-2 text-xs text-muted-foreground" data-testid={`owner-${ticket.id}`}>
          {ticket.owner && t(`estimates.owner.${ticket.owner.sectionKey}`, { defaultValue: ticket.owner.label })}
        </div>
      ) : <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="truncate">{ticket.assignee?.name ?? t(`${labels}.unassigned`)}</span>
        <span className="capitalize">{t(`${labels}.priority`)}: {t(`priorities.${ticket.priority}`, { defaultValue: ticket.priority })}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{ticket.statusName}</span>
        <span data-testid={`text-bid-days-${ticket.id}`} data-warn={stale ? "true" : "false"}
          className={stale ? "rounded px-1.5 py-0.5 font-semibold" : "font-medium"}
          style={stale ? { color: "hsl(var(--est-warn))", background: "hsl(var(--est-warn-bg))" } : undefined}>
          {t(`${labels}.days`, { count: ticket.daysInStage })}
        </span>
      </div>
      </>}
    </Link>
    {labels === "bids" && <div className="space-y-1 px-1">
      {ticket.contracts?.map(c => <LinkedContractRow key={c.termId} contract={c} />)}
      {ticket.statusKey === "proposal_draft" && !ticket.contracts?.length &&
        <Link className="inline-block p-1 text-xs underline" href={`/dashboard/contracts/new?fromRfp=${encodeURIComponent(ticket.id)}`}
          onClick={e => e.stopPropagation()} data-testid={`create-contract-${ticket.id}`}>{t("rfpContracts.create")}</Link>}
    </div>}
    </div>
  );
}

export function OpportunityBoard({ board, stages, rail }: {
  board: "estimates" | "bids"; stages: readonly string[]; rail?: ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const url = `/api/${board}/board`;
  const { data, isLoading, isError, refetch } = useQuery<BoardResponse>({
    queryKey: [url, user?.activeCompanyId, user?.id, user?.activeRole],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled: !!user, staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true,
  });
  const content = isError ? (
    <div className="flex flex-col items-start gap-3" role="alert" data-testid={`${board}-error`}>
      <p className="text-sm text-muted-foreground">{t(`${board}.error`)}</p>
      <Button variant="outline" onClick={() => refetch()} data-testid={`button-${board}-retry`}>{t(`${board}.retry`)}</Button>
    </div>
  ) : (
    <div className="flex min-w-0 gap-4 overflow-x-auto pb-4 focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0} role="region" aria-label={t(`${board}.title`)} data-testid={`${board}-board`} aria-busy={isLoading}>
      {stages.map(key => {
        const readOnly = key === "won";
        const tickets = data?.stages.find(s => s.key === key)?.tickets ?? [];
        return (
          <section key={key} className={`w-[280px] shrink-0 ${readOnly ? "opportunity-won" : ""}`} data-testid={`column-${key}`} aria-label={t(`${board}.stage.${key}`)}>
            <h3 className={`mb-2 flex items-center justify-between px-1 text-sm font-semibold ${readOnly ? "border-b border-dashed border-border pb-2 text-muted-foreground" : ""}`}>
              <span>{t(`${board}.stage.${key}`)}</span>
              <span className="rounded-full bg-muted px-2 text-xs tabular-nums" data-testid={`count-${key}`}>{isLoading ? "–" : tickets.length}</span>
            </h3>
            <div className={readOnly ? "space-y-2" : "space-y-2 rounded-md bg-muted/40 p-2 min-h-[120px]"}>
              {isLoading ? (
                <div role="status" aria-label={t(`${board}.loading`)} className="space-y-2">
                  <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
                </div>
              ) : tickets.length === 0 ? (
                <p className="px-1 py-3 text-xs text-muted-foreground" data-testid={`empty-${key}`}>{t(readOnly ? `${board}.emptyWon` : `${board}.empty`)}</p>
              ) : tickets.map(ticket => <OpportunityCard key={ticket.id} ticket={ticket} labels={board} readOnly={readOnly} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
  return rail ? <SectionRailLayout rail={rail}>{content}</SectionRailLayout> : <div className="min-w-0">{content}</div>;
}
