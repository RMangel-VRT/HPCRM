import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, CheckCircle2, Clock, FilePen, FileText, Hammer, MoreHorizontal, PhoneCall, Send, UserPlus, XCircle,
} from "lucide-react";
import type { EstimateActionTicket } from "@shared/schema";
import { builderPath } from "@/lib/estimateBuilder";
import { formatCents } from "@/lib/hardscapeCatalog";
import { canQuickSend, messageParams } from "@/lib/estimateActionList";
import { TicketTypeBadge, ticketHue } from "@/components/TicketIdentity";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowAction = "followUp" | "accept" | "decline" | "send" | "build" | "pdf";
export interface Member { id: string; name: string }

const RED = "hsl(var(--est-danger))";
const STAGE_LABELS: Record<string, string> = {
  new: "estimates.stage.new", estimating: "estimates.stage.estimating",
  proposal_draft: "estimates.stage.proposal", proposal_sent: "estimates.stage.sent",
  decision_received: "estimates.stage.decision",
};
const money = (c: number | null | undefined, lang: string) => c === null || c === undefined ? "—" : formatCents(c, lang);

function IconAction({ label, icon, onClick, testId, disabled }: { label: string; icon: ReactNode; onClick: () => void; testId: string; disabled: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={label} onClick={onClick} disabled={disabled} data-testid={testId}>{icon}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function AssignMenu({ members, onPick, disabled, testId, trigger, meId }: { members: Member[]; onPick: (m: Member) => void; disabled: boolean; testId: string; trigger: ReactNode; meId: string }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid={`${testId}-menu`}>
        <DropdownMenuLabel>{t("estimateActions.actions.assignTo")}</DropdownMenuLabel>
        {members.length === 0 && <DropdownMenuItem disabled>{t("estimateActions.actions.noTeam")}</DropdownMenuItem>}
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onPick(m)} data-testid={`${testId}-${m.id}`}>
            {m.id === meId ? t("estimateActions.actions.me", { name: m.name }) : m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EstimateActionRow(props: {
  ticket: EstimateActionTicket; busy: boolean; members: Member[]; meId: string;
  onAction: (a: RowAction, t: EstimateActionTicket) => void; onAssign: (t: EstimateActionTicket, m: Member) => void;
}) {
  const { t, i18n } = useTranslation();
  const { ticket: r, busy } = props;
  const na = r.nextAction;
  const lang = i18n.language;
  const customer = r.customer?.name ?? t("estimateActions.noCustomer");
  const est = r.estimate;
  const reasonText = t(na.reason.key, messageParams(na.reason, lang));
  const detailText = na.detail ? t(na.detail.key, messageParams(na.detail, lang)) : null;
  const ticketHref = `/dashboard/tickets/${encodeURIComponent(r.id)}`;

  if (na.bucket === "won") {
    const project = { name: t("estimates.projectLabel"), typeKey: "project" };
    return (
      <li className="opportunity-won flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-2.5 text-sm last:border-b-0"
        style={{ boxShadow: `inset 4px 0 0 ${ticketHue(project)}` }} data-testid={`row-${r.id}`} data-bucket="won">
        <span className="min-w-0 flex-1 truncate">
          <Link href={ticketHref} className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-ticket-${r.id}`}>{customer}</Link>
          <span className="text-muted-foreground"> · {r.title}</span>
        </span>
        <TicketTypeBadge type={project} />
        <span className="tabular-nums font-medium" data-testid={`text-amount-${r.id}`}>{money(est?.subtotalCents, lang)}</span>
        {r.owner && (
          <Link href={r.owner.href} className="inline-flex items-center gap-1 text-xs font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`owner-${r.id}`}>
            <CheckCircle2 className="h-3.5 w-3.5" />{t(`estimates.owner.${r.owner.sectionKey}`)}
          </Link>
        )}
      </li>
    );
  }

  const act = (a: RowAction) => () => props.onAction(a, r);
  const sentOrDecide = est?.status === "sent" || na.bucket === "decide";
  const primaryLabel: Record<string, { label: string; icon: ReactNode; action?: RowAction }> = {
    follow_up: { label: t("estimateActions.actions.logFollowUp"), icon: <PhoneCall className="mr-1.5 h-3.5 w-3.5" />, action: "followUp" },
    decide: { label: t("estimateActions.actions.markWon"), icon: <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />, action: "accept" },
    send: { label: t("estimateActions.actions.send"), icon: <Send className="mr-1.5 h-3.5 w-3.5" />, action: "send" },
    finish: { label: t("estimateActions.actions.build"), icon: <Hammer className="mr-1.5 h-3.5 w-3.5" />, action: "build" },
    start: { label: t("estimateActions.actions.build"), icon: <Hammer className="mr-1.5 h-3.5 w-3.5" />, action: "build" },
  };
  let primary: ReactNode = null;
  if (na.bucket === "finish" && est) {
    primary = (
      <Button size="sm" asChild data-testid={`act-${r.id}`}>
        <Link href={builderPath(est.id)}><FilePen className="mr-1.5 h-3.5 w-3.5" />{t("estimateActions.actions.openDraft")}</Link>
      </Button>
    );
  } else if ((na.bucket === "start" || (na.bucket === "finish" && !est)) && !r.assignee) {
    primary = <AssignMenu members={props.members} meId={props.meId} disabled={busy} onPick={(m) => props.onAssign(r, m)} testId={`assign-${r.id}`}
      trigger={<Button size="sm" disabled={busy} data-testid={`act-${r.id}`}><UserPlus className="mr-1.5 h-3.5 w-3.5" />{t("estimateActions.actions.assign")}</Button>} />;
  } else if (primaryLabel[na.bucket] && (na.bucket === "start" || na.bucket === "follow_up" || na.bucket === "finish" || est)) {
    const p = primaryLabel[na.bucket];
    primary = <Button size="sm" onClick={act(p.action!)} disabled={busy} data-testid={`act-${r.id}`}>{p.icon}{p.label}</Button>;
  }

  return (
    <li className={cn("grid items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_232px]",
      na.bucket === "waiting" && "bg-muted/20")}
      style={{ boxShadow: `inset 4px 0 0 ${na.urgency === "red" ? RED : na.urgency === "amber" ? "hsl(var(--est-warn))" : "transparent"}` }}
      data-testid={`row-${r.id}`} data-bucket={na.bucket} data-urgency={na.urgency ?? "none"}>
      <div className="min-w-0">
        <Link href={ticketHref} className="block truncate text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-ticket-${r.id}`}>{customer}</Link>
        <div className="truncate text-[13px] text-muted-foreground">{r.title}</div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground" data-testid={`text-stage-${r.id}`}>{t(STAGE_LABELS[r.statusKey] ?? "estimates.typeLabel")}</span>
        {est ? <>
          <Link href={builderPath(est.id)} className="tabular-nums underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-estimate-${r.id}`}>{est.number}</Link>
          <span className="font-semibold tabular-nums" data-testid={`text-amount-${r.id}`}>{money(est.subtotalCents, lang)}</span>
        </> : r.estimateNumber && <span className="tabular-nums">{r.estimateNumber}</span>}
      </div>
      <div className="min-w-0 text-xs">
        <div className={cn("flex items-center gap-1.5 font-semibold", na.urgency === "red" ? "text-[hsl(var(--est-danger))]" : na.urgency === "amber" ? "text-[hsl(var(--est-warn))]" : "text-foreground")}
          data-testid={`text-reason-${r.id}`}>
          {na.urgency ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="truncate">{reasonText}</span>
        </div>
        {detailText && <div className="mt-0.5 truncate text-muted-foreground" data-testid={`text-detail-${r.id}`}>{detailText}</div>}
        <div className="mt-0.5 text-muted-foreground" data-testid={`text-assignee-${r.id}`}>{r.assignee?.name ?? t("estimateActions.unassigned")}</div>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <div className="flex items-center gap-1.5">
          {na.bucket === "decide" && est && <IconAction label={t("estimateActions.actions.markLost")} icon={<XCircle className="h-3.5 w-3.5" />} onClick={act("decline")} disabled={busy} testId={`icon-lost-${r.id}`} />}
          {canQuickSend(r) && <IconAction label={t("estimateActions.actions.sendNumber", { number: est!.number })} icon={<Send className="h-3.5 w-3.5" />} onClick={act("send")} disabled={busy} testId={`icon-send-${r.id}`} />}
        </div>
        <div className="w-[140px] [&>*]:w-full">{primary}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("estimateActions.actions.more", { customer })} data-testid={`menu-${r.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-testid={`menu-content-${r.id}`}>
            <DropdownMenuItem asChild><Link href={ticketHref} data-testid={`menu-ticket-${r.id}`}>{t("estimateActions.actions.openTicket")}</Link></DropdownMenuItem>
            {est && <DropdownMenuItem asChild><Link href={builderPath(est.id)} data-testid={`menu-estimate-${r.id}`}>{t("estimateActions.actions.openEstimate")}</Link></DropdownMenuItem>}
            {est && <DropdownMenuItem onSelect={act("pdf")} data-testid={`menu-pdf-${r.id}`}><FileText className="mr-2 h-3.5 w-3.5" />{t("estimateActions.actions.previewPdf")}</DropdownMenuItem>}
            <DropdownMenuItem disabled={busy} onSelect={act("followUp")} data-testid={`menu-follow-up-${r.id}`}>{t("estimateActions.actions.setFollowUp")}</DropdownMenuItem>
            {est && sentOrDecide && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onSelect={act("accept")} data-testid={`menu-won-${r.id}`}>{t("estimateActions.actions.markWon")}</DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onSelect={act("decline")} data-testid={`menu-lost-${r.id}`}>{t("estimateActions.actions.markLost")}</DropdownMenuItem>
            </>}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={busy} data-testid={`menu-reassign-${r.id}`}>{t("estimateActions.actions.reassign")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {props.members.length === 0 && <DropdownMenuItem disabled>{t("estimateActions.actions.noTeam")}</DropdownMenuItem>}
                {props.members.map((m) => (
                  <DropdownMenuItem key={m.id} disabled={m.id === r.assignee?.id} onSelect={() => props.onAssign(r, m)} data-testid={`menu-reassign-${r.id}-${m.id}`}>
                    {m.id === props.meId ? t("estimateActions.actions.me", { name: m.name }) : m.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
