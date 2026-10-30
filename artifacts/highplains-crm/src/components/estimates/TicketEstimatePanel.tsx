import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isSeededTicketType } from "@shared/ticketVisuals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchJson, formatCents } from "@/lib/hardscapeCatalog";
import { builderPath, sendEstimate, formatCalendarDate } from "@/lib/estimateBuilder";
import type { EstimateTicketSummaryDto } from "@shared/schema";
import { TicketAdvanceNotice } from "./TicketAdvanceNotice";
import { StatusPill } from "./StatusPill";

interface Props {
  ticket: { id: string; customerId: string | null; title: string; currentStatusId: string };
  ticketType: { name: string; typeKey?: string | null };
  statuses: { id: string; statusKey?: string | null }[];
}
export function TicketEstimatePanel(props: Props) {
  const { user } = useAuth();
  if (!["admin", "office"].includes(user?.activeRole ?? "") || !user?.activeCompanyId
    || !isSeededTicketType(props.ticketType, "estimate_request")) return null;
  return <Panel key={`${user.activeCompanyId}|${user.id}|${user.activeRole}|${props.ticket.id}`} {...props} />;
}
function Panel({ ticket, statuses }: Props) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const company = user!.activeCompanyId!;
  const active = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const url = `/api/estimates/by-ticket/${encodeURIComponent(ticket.id)}`;
  const query = useQuery<EstimateTicketSummaryDto | null>({
    queryKey: ["/api/estimates", "by-ticket", company, user?.id, user?.activeRole, ticket.id],
    queryFn: ({ signal }) => fetchJson(url, company, signal),
    staleTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: true, retry: false,
  });
  async function act(kind: "create" | "void") {
    if (busyRef.current || (kind === "create" && !ticket.customerId)) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = kind === "create"
        ? await sendEstimate("POST", "/api/estimates", company, { ticketId: ticket.id, customerId: ticket.customerId, title: ticket.title })
        : await sendEstimate("POST", `/api/estimates/${encodeURIComponent(query.data!.id)}/void`, company, { reason: "Ticket closed lost" });
      if (!active.current) return;
      await qc.invalidateQueries({ queryKey: ["/api/estimates"] });
      void qc.invalidateQueries({ queryKey: ["/api/estimates/board"] });
      if (kind === "create") navigate(builderPath(result.id));
    } catch (error) {
      if (!active.current) return;
      const match = error instanceof Error ? error.message.match(/^409: ([\s\S]*)$/) : null;
      if (kind === "create" && match) {
        try {
          const id = JSON.parse(match[1]).existingEstimateId;
          if (typeof id === "string" && id) { navigate(builderPath(id)); return; }
        } catch { /* Not the documented duplicate conflict. */ }
      }
      toast({ title: t("estimateTicket.actionFailed"), variant: "destructive" });
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }
  const estimate = query.data;
  const accepted = estimate?.versions.find(v => v.status === "accepted");
  const closedLost = statuses.find(s => s.id === ticket.currentStatusId)?.statusKey === "closed_lost";
  return <Card data-testid="ticket-estimate-panel">
    <CardHeader className="pb-3"><CardTitle className="text-base">{t("estimateTicket.title")}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {query.isLoading ? <p role="status">{t("common.loading")}</p> : query.isError ? <div role="alert">
        <p>{t("estimateTicket.loadFailed")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("estimateBuilder.retry")}</Button>
      </div> : !estimate ? <Tooltip><TooltipTrigger asChild><span className="inline-block" tabIndex={!ticket.customerId ? 0 : undefined}>
        <Button disabled={busy || !ticket.customerId} onClick={() => void act("create")}>{t("estimateTicket.create")}</Button>
      </span></TooltipTrigger>{!ticket.customerId && <TooltipContent>{t("estimateTicket.noCustomer")}</TooltipContent>}</Tooltip> : <>
        <div className="flex flex-wrap items-center gap-2"><strong>{estimate.estimateNumber}</strong>
          <span>v{estimate.version.versionNumber}</span><StatusPill status={estimate.version.status} label={t(`estimateBuilder.status.${estimate.version.status}`)} /></div>
        <p className="font-semibold tabular-nums">{estimate.subtotalCents === null ? "—" : formatCents(estimate.subtotalCents, i18n.language)}</p>
        {accepted && <div className="space-y-1 text-sm">
          {estimate.version.status === "draft" && estimate.version.id !== accepted.id &&
            <p>{t("estimateTicket.changeOrder", { accepted: accepted.versionNumber, draft: estimate.version.versionNumber })}</p>}
          <p>{t("estimateTicket.acceptedOn", { date: formatCalendarDate(accepted.acceptedOn, i18n.language) })}</p>
          {accepted.acceptanceMethod && <p>{t(`estimateBuilder.life.acceptMethod.${accepted.acceptanceMethod}`)}</p>}
          {accepted.poNumber && <p>{t("estimateTicket.po", { number: accepted.poNumber })}</p>}
        </div>}
        <Link className="inline-block text-sm underline" href={builderPath(estimate.id)}>{t("estimateTicket.open")}</Link>
        {closedLost && !accepted && !estimate.voidedAt && <div className="rounded bg-muted p-3 text-sm">
          <p>{t("estimateTicket.closedLost")}</p>
          <Button className="mt-2" variant="outline" disabled={busy} onClick={() => void act("void")}>{t("estimateTicket.void")}</Button>
        </div>}
        <TicketAdvanceNotice estimate={estimate} />
      </>}
    </CardContent>
  </Card>;
}
