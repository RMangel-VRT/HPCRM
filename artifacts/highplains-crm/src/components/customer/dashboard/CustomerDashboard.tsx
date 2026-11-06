import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Clock, Copy, DollarSign, FileText, Mail, Map as MapIcon,
  Phone, StickyNote, Ticket as TicketIcon, Users, RefreshCw,
} from "lucide-react";
import type { Contact, Customer, CustomerMapLayer, Note, PropertyManagementCompany, PropertyManager, ProposalWithDetails, Ticket } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCustomerScope } from "@/lib/customerScope";
import { formatCurrency } from "@/lib/currency";
import { companyToday } from "@/lib/schedulingStatus";
import LayerMapViewer from "@/components/LayerMapViewer";
import SiteDetailsCard from "@/components/customer/SiteDetailsCard";
import { isOpenTicket, FINAL_PROPOSAL_STATUSES } from "@/components/customer/customerBadges";
import { customerPageHref, type CustomerPageKey } from "@/components/customer/customerPages";
import { useDashboardActivity } from "@/hooks/useDashboardActivity";
import type { CustomerContractSummary } from "@/hooks/useCustomerContractSummary";
import type { CustomerService } from "@/hooks/useCustomerServices";
import type { QuickBooksCard } from "@/lib/qboReview";
import { aggregateTerms, calendarAge, evaluateAttention, serviceDashboardRows, type AttentionItem } from "./dashboardModel";
import { CustomerCard } from "@/components/customer/page";
import { dashboardNote } from "@/hooks/useCustomerNotes";
import { QBO_TONE, type Loadable, type QboStateKind } from "@/components/customer/header/CustomerHeader";
import type { SetupState } from "@/components/customerWizard/FinishSetupBanner";

/* ---------- shared bits (regular + parent) ---------- */

export function useDateFns() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith("es") ? esLocale : undefined;
  const safe = (v: unknown) => { const d = v ? new Date(v as string) : null; return d && Number.isFinite(d.getTime()) ? d : null; };
  return {
    day: (v: unknown) => { const d = safe(v); return d ? format(d, "MMM d, yyyy", { locale }) : "\u2014"; },
    ymd: (v: string | null | undefined) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? format(new Date(`${v}T12:00:00`), "MMM d, yyyy", { locale }) : "\u2014",
    ago: (v: unknown) => { const d = safe(v); return d ? formatDistanceToNow(d, { addSuffix: true, locale }) : "\u2014"; },
  };
}

/** CP3 Dashboard card, now the shared CP4 CustomerCard (icon + title + optional link). */
export function DashCard({ icon, title, link, children, testId, className = "" }: {
  icon: typeof Clock; title: string; link?: { href: string; label: string; testId: string }; children: ReactNode; testId: string; className?: string;
}) {
  return <CustomerCard icon={icon} title={title} link={link} testId={testId} className={className}>{children}</CustomerCard>;
}
export function CardError({ onRetry, testId }: { onRetry: () => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid={testId}>
      <AlertTriangle className="h-4 w-4 text-destructive" />{t("cp3.loadFailed")}
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onRetry}><RefreshCw className="mr-1 h-3.5 w-3.5" />{t("common.retry", { defaultValue: "Retry" })}</Button>
    </div>
  );
}

export function Kpi({ label, value, sub, testId, children }: { label: string; value: ReactNode; sub?: ReactNode; testId: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border bg-card px-4 py-3" data-testid={testId}>
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="text-[22px] font-semibold tracking-[-0.01em] tabular-nums break-words" data-testid={`${testId}-value`}>{value}</span>
      {children}
      {sub != null && <span className="text-xs text-muted-foreground break-words" data-testid={`${testId}-sub`}>{sub}</span>}
    </div>
  );
}

export function AttentionStrip({ items, customerId, pages }: { items: AttentionItem[]; customerId: string; pages: CustomerPageKey[] }) {
  const { t } = useTranslation();
  const visible = items.filter(i => i.href || (i.tab && pages.includes(i.tab as CustomerPageKey)));
  if (!visible.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[hsl(var(--est-warn-bg))] px-3.5 py-2.5" role="region"
      aria-label={t("cp3.attention.title")} data-testid="strip-attention">
      <span className="mr-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--est-warn))]">
        <AlertTriangle className="h-4 w-4" />{t("cp3.attention.title")}
      </span>
      {visible.map(i => {
        const href = i.href ?? customerPageHref(customerId, i.tab as CustomerPageKey);
        return (
          <Link key={i.key} href={href} data-testid={`chip-attention-${i.key}`} data-href={href}
            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--est-warn)/0.3)] bg-background px-2.5 py-[3px] text-[12.5px] hover:border-[hsl(var(--est-warn))]">
            {t(i.labelKey, i.values)}<ArrowRight className="h-3 w-3 text-muted-foreground" />
          </Link>
        );
      })}
    </div>
  );
}

export function QboLine({ state }: { state: QboStateKind | null }) {
  const { t } = useTranslation();
  if (!state) return <span>{t("cp3.unavailable")}</span>;
  return <span className="inline-flex items-center gap-1.5" data-testid="text-dashboard-qbo-state" data-state={state}>
    <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${QBO_TONE[state]}`} />{t(`cp3.qbo.${state}`)}</span>;
}

export function BillingSummary({ card, state, customerId, pages }: { card: { data?: QuickBooksCard; isLoading: boolean; isError: boolean; refetch: () => void }; state: QboStateKind | null; customerId: string; pages: CustomerPageKey[] }) {
  const { t } = useTranslation();
  const link = pages.includes("billing") ? { href: customerPageHref(customerId, "billing"), label: t("cp3.links.billing"), testId: "link-dashboard-billing" } : undefined;
  return (
    <DashCard icon={DollarSign} title={t("cp3.cards.billing")} link={link} testId="card-dashboard-billing">
      {card.isLoading ? <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
        : card.isError || !card.data ? <CardError onRetry={card.refetch} testId="error-dashboard-billing" />
        : (() => {
          const d = card.data; const eff = d.effectiveCustomer;
          const billTo = "problem" in d.billTo ? null : d.billTo;
          return (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-[13px]">
              <dt className="text-muted-foreground">{t("cp3.billing.billTo")}</dt>
              <dd className="min-w-0 break-words" data-testid="text-dashboard-bill-to">{billTo ? [billTo.name, ...billTo.lines].filter(Boolean).join(", ") : t("cp3.billing.incomplete")}</dd>
              <dt className="text-muted-foreground">{t("cp3.billing.emails")}</dt>
              <dd className="min-w-0 break-words" data-testid="text-dashboard-bill-emails">{eff.billingEmails?.length ? eff.billingEmails.join(", ") : t("cp3.none")}</dd>
              <dt className="text-muted-foreground">{t("cp3.billing.terms")}</dt>
              <dd data-testid="text-dashboard-bill-terms">{eff.qboTermId ? (d.termLabel ?? t("cp3.unavailable")) : t("cp3.none")}</dd>
              <dt className="text-muted-foreground">{t("cp3.chips.quickbooks")}</dt>
              <dd><QboLine state={state} /></dd>
            </dl>
          );
        })()}
    </DashCard>
  );
}

/* ---------- regular / branch dashboard ---------- */

type Q<T> = { data?: T; isLoading: boolean; error?: unknown; isError?: boolean; refetch: () => unknown };

export interface CustomerDashboardProps {
  customer: Customer & { parentCustomer?: Customer | null };
  pages: CustomerPageKey[];
  privileged: boolean;
  canEditCustomer: boolean;
  contacts: Q<Contact[]>;
  notes: Q<Note[]>;
  tickets: Q<Ticket[]>;
  ticketStatuses?: { id: string; isFinal?: string | boolean | null }[];
  proposals?: Q<ProposalWithDetails[]>;
  summary: Q<CustomerContractSummary>;
  services: { services: CustomerService[]; isLoading: boolean; error: unknown };
  qboCard?: { data?: QuickBooksCard; isLoading: boolean; isError: boolean; refetch: () => void };
  qboState: QboStateKind | null;
  qboAttention: boolean;
  setup: SetupState;
  management: Loadable<{ company: string | null; manager: string | null } | null>;
  snowFlagCount: number;
  accountManagerName: string | null;
  accountManagerLoaded: boolean;
  pmCompany: PropertyManagementCompany | null;
  pmManager: PropertyManager | null;
  today?: string;
}

const channelKey = (c?: string | null) => (c && ["email", "sms", "phone", "meeting", "note", "other"].includes(c) ? c : "other");

export default function CustomerDashboard(p: CustomerDashboardProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dates = useDateFns();
  const scope = useCustomerScope();
  const id = p.customer.id;
  const today = p.today ?? companyToday();
  const activity = useDashboardActivity(id);
  const layers = useQuery<CustomerMapLayer[]>({
    queryKey: ["/api/customers", id, "map-layers", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<CustomerMapLayer[]>(`/api/customers/${id}/map-layers`, signal),
  });
  const pageLink = (page: CustomerPageKey, label: string, testId: string) =>
    p.pages.includes(page) ? { href: customerPageHref(id, page), label, testId } : undefined;

  const terms = p.summary.data?.current ?? [];
  const agg = aggregateTerms(terms);
  const svc = serviceDashboardRows(p.services.services);
  const tickets = p.tickets.data ?? [];
  const openTickets = tickets.filter(tk => isOpenTicket(tk, p.ticketStatuses))
    .sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  const oldestAge = openTickets.length ? calendarAge(openTickets[0].createdAt as unknown as string, today) : null;
  const openProposals = (p.proposals?.data ?? []).filter(pr => !(FINAL_PROPOSAL_STATUSES as readonly string[]).includes(pr.status ?? ""));

  const attention = evaluateAttention({
    customerId: id, today, services: p.services.services, tickets: tickets as never, statuses: p.ticketStatuses,
    proposals: p.privileged ? p.proposals?.data : undefined, missingSetupCount: p.setup.fields.length,
    snowFlagCount: p.snowFlagCount, managerName: p.accountManagerName ?? t("accountManagers.notAssigned"),
    qboAttention: p.privileged && p.qboAttention, terms: p.privileged ? terms : undefined,
  });

  // A failed setup read is surfaced, never presented as "nothing missing".
  if (p.setup.isError) attention.push({ key: "setupUnknown", labelKey: "cp3.attention.setupUnknown", values: {}, href: `/dashboard/customers/${id}/edit` });

  const comms = useMemo(() => [...(activity.data?.communications ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [activity.data]);
  const last = comms[0] ?? null;

  type Feed = { key: string; kind: "service" | "ticket" | "comm"; title: string; at: string; sub: string; href?: string };
  const feed: Feed[] = [
    ...p.services.services.filter(s => s.state === "done" && s.completedAt).map(s => ({
      key: `svc-${s.id}`, kind: "service" as const, title: s.title, at: s.completedAt!, sub: t("cp3.activity.serviceDone"),
      href: p.pages.includes("services") ? customerPageHref(id, "services") : undefined })),
    ...(activity.data?.ticketChanges ?? []).map(c => ({ key: `tk-${c.id}`, kind: "ticket" as const, title: c.title, at: c.at,
      sub: t("cp3.activity.ticketChange"), href: `/dashboard/tickets/${c.ticketId}` })),
    ...comms.map(c => ({ key: `cm-${c.id}`, kind: "comm" as const, title: c.title || t("cp3.activity.noSubject"), at: c.at,
      sub: [t(`cp3.channel.${channelKey(c.channel)}`), c.person].filter(Boolean).join(" \u00b7 "),
      href: p.pages.includes("communications") ? customerPageHref(id, "communications") : undefined })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);

  // CP4: first pinned note, otherwise the newest.
  const newestNote = dashboardNote(p.notes.data as (Note & { pinnedAt?: Date | string | null })[] | undefined);
  const contacts = p.contacts.data ?? [];
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); toast({ title: t("cp3.copied") }); };

  const outlineIds = new Set((layers.data ?? []).filter(l => l.layerType === "community_outline").map(l => l.id));
  const lat = p.customer.locationLat != null ? Number(p.customer.locationLat) : NaN;
  const lng = p.customer.locationLng != null ? Number(p.customer.locationLng) : NaN;
  const pin: [number, number] | null = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;

  const servicesLoading = p.services.isLoading;
  const pct = svc.total ? Math.round((svc.done / svc.total) * 100) : 0;
  const stateTone: Record<string, string> = {
    overdue: "bg-destructive/10 text-destructive", in_window: "bg-[hsl(var(--est-warn-bg))] text-[hsl(var(--est-warn))]",
    upcoming: "bg-muted text-muted-foreground", done: "bg-primary/15 text-[hsl(var(--rail-heading))]", skipped: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4" data-testid="customer-dashboard">
      <AttentionStrip items={attention} customerId={id} pages={p.pages} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-kpis">
        {p.privileged && (
          <Kpi testId="kpi-this-season" label={t("cp3.kpi.thisSeason")}
            value={p.summary.isLoading ? <Skeleton className="h-7 w-24" /> : p.summary.error ? t("cp3.unavailable")
              : !terms.length ? t("cp1.noContract")
              : agg.annualCents != null ? formatCurrency(agg.annualCents, true, i18n.language)
              : agg.hasSnowTm ? t("cp1.timeAndMaterials") : agg.hasInherited ? t("cp3.chips.parentPriced") : t("cp3.chips.priceNotSet")}
            sub={p.summary.error ? t("cp1.loadFailed") : terms.length && !p.summary.isLoading ? [agg.labels.join(", "),
              agg.lines.length === 2 ? t("cp1.both") : agg.lines[0] ? t(`cp1.${agg.lines[0]}`) : null,
              agg.annualCents != null && agg.hasUnpriced ? t("cp3.chips.plusUnpriced") : null,
              agg.annualCents != null && agg.hasInherited ? t("cp3.chips.plusParent") : null,
              agg.annualCents != null && agg.hasSnowTm ? t("cp3.chips.snowTm") : null,
              agg.monthlyCents != null ? t("cp3.kpi.perMonth", { amount: formatCurrency(agg.monthlyCents, true, i18n.language) }) : null,
            ].filter(Boolean).join(" \u00b7 ") : undefined} />
        )}
        <Kpi testId="kpi-services" label={t("cp3.kpi.services")}
          value={servicesLoading ? <Skeleton className="h-7 w-28" /> : p.services.error ? t("cp3.unavailable") : t("cp3.kpi.doneOf", { done: svc.done, total: svc.total })}
          sub={!servicesLoading && !p.services.error ? t("cp3.kpi.serviceSub", { overdue: svc.overdue, inWindow: svc.inWindow }) : undefined}>
          {!servicesLoading && !p.services.error && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={svc.total} aria-valuenow={svc.done}
              aria-label={t("cp3.kpi.services")} data-testid="progress-services">
              <div className="h-full origin-left bg-primary transition-transform" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          )}
        </Kpi>
        <Kpi testId="kpi-open-tickets" label={t("cp3.kpi.openTickets")}
          value={p.tickets.isLoading ? <Skeleton className="h-7 w-10" /> : p.tickets.error ? t("cp3.unavailable") : openTickets.length}
          sub={!p.tickets.isLoading && !p.tickets.error ? (oldestAge != null ? t("cp3.kpi.oldest", { count: oldestAge }) : t("cp3.kpi.noneOpen")) : undefined} />
        {p.privileged && (
          <Kpi testId="kpi-last-contact" label={t("cp3.kpi.lastContact")}
            value={activity.isLoading ? <Skeleton className="h-7 w-24" /> : activity.error ? t("cp3.unavailable") : last ? <span data-testid="text-kpi-last-contact-date">{dates.day(last.at)}</span> : t("cp3.kpi.noContact")}
            sub={last && !activity.error ? [dates.day(last.at), last.person, t(`cp3.channel.${channelKey(last.channel)}`)].filter(Boolean).join(" \u00b7 ") : undefined} />
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <DashCard icon={CalendarCheck} title={t("cp3.cards.thisSeason")} testId="card-season-services"
            link={pageLink("services", t("cp3.links.allServices"), "link-dashboard-services")}>
            {servicesLoading ? <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
              : p.services.error ? <CardError onRetry={() => p.summary.refetch()} testId="error-season-services" />
              : !svc.rows.length ? <p className="py-3 text-sm text-muted-foreground" data-testid="empty-season-services">{t("cp3.empty.services")}</p>
              : <div className="divide-y" data-testid="list-season-services">
                  {svc.rows.map(s => (
                    <div key={s.id} className="flex min-h-[44px] items-center gap-3 py-2" data-testid={`row-season-service-${s.id}`} data-state={s.state}>
                      <span className={`shrink-0 rounded-full px-2 py-px text-[11.5px] font-medium ${stateTone[s.state]}`}>{t(`cp1.serviceStates.${s.state}`)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {s.state === "done" && s.completedAt ? t("cp3.services.completedOn", { date: dates.day(s.completedAt) })
                          : s.start === s.end ? dates.ymd(s.start) : `${dates.ymd(s.start)} \u2013 ${dates.ymd(s.end)}`}
                      </span>
                    </div>
                  ))}
                  {svc.remainingCompleted > 0 && <p className="pt-2 text-xs text-muted-foreground" data-testid="text-more-completed">{t("cp3.services.moreCompleted", { count: svc.remainingCompleted })}</p>}
                </div>}
          </DashCard>

          <DashCard icon={TicketIcon} title={t("cp3.cards.openWork")} testId="card-open-work" link={pageLink("tickets", t("cp3.links.tickets"), "link-dashboard-tickets")}>
            {p.tickets.isLoading || p.proposals?.isLoading ? <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
              : p.tickets.error ? <CardError onRetry={() => p.tickets.refetch()} testId="error-open-work" />
              : !openTickets.length && !openProposals.length ? <p className="py-3 text-sm text-muted-foreground" data-testid="empty-open-work">{t("cp3.empty.openWork")}</p>
              : <div className="divide-y" data-testid="list-open-work">
                  {openTickets.map(tk => (
                    <Link key={tk.id} href={`/dashboard/tickets/${tk.id}`} className="flex min-h-[44px] items-center gap-3 py-2 hover:bg-muted/50 -mx-2 px-2 rounded-md" data-testid={`row-open-ticket-${tk.id}`}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><TicketIcon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{tk.title}</span>
                        <span className="text-xs text-muted-foreground">{t("cp3.openWork.ticket")}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t("cp3.kpi.ageDays", { count: calendarAge(tk.createdAt as unknown as string, today) ?? 0 })}</span>
                    </Link>
                  ))}
                  {openProposals.map(pr => (
                    <Link key={pr.id} href={`/dashboard/tools/proposals/${pr.id}`} className="flex min-h-[44px] items-center gap-3 py-2 hover:bg-muted/50 -mx-2 px-2 rounded-md" data-testid={`row-open-proposal-${pr.id}`}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{pr.title}</span>
                        <span className="text-xs text-muted-foreground">{t("cp3.openWork.proposal")}{" \u00b7 "}{t(`cp3.proposalStatus.${pr.status}`, { defaultValue: t("cp3.proposalStatus.pending") })}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{dates.day(pr.updatedAt ?? pr.createdAt)}</span>
                    </Link>
                  ))}
                </div>}
          </DashCard>

          <DashCard icon={Clock} title={t("cp3.cards.recentActivity")} testId="card-recent-activity"
            link={pageLink("communications", t("cp3.links.communications"), "link-dashboard-communications")}>
            {activity.isLoading ? <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
              : activity.error ? <CardError onRetry={() => activity.refetch()} testId="error-recent-activity" />
              : !feed.length ? <p className="py-3 text-sm text-muted-foreground" data-testid="empty-recent-activity">{t("cp3.empty.activity")}</p>
              : <div className="divide-y" data-testid="list-recent-activity">
                  {feed.map(f => {
                    const Icon = f.kind === "service" ? CheckCircle2 : f.kind === "ticket" ? TicketIcon : Mail;
                    const body = (<>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{f.title}</span><span className="text-xs text-muted-foreground">{f.sub}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{dates.ago(f.at)}</span>
                    </>);
                    return f.href
                      ? <Link key={f.key} href={f.href} className="flex min-h-[44px] items-center gap-3 py-2 hover:bg-muted/50 -mx-2 px-2 rounded-md" data-testid={`row-activity-${f.key}`}>{body}</Link>
                      : <div key={f.key} className="flex min-h-[44px] items-center gap-3 py-2" data-testid={`row-activity-${f.key}`}>{body}</div>;
                  })}
                </div>}
          </DashCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <DashCard icon={StickyNote} title={t("cp3.cards.latestNote")} testId="card-latest-note"
            className="bg-[hsl(var(--est-warn-bg)/0.55)]" link={pageLink("notes", t("cp3.links.notes"), "link-dashboard-notes")}>
            {p.notes.isLoading ? <Skeleton className="h-12 w-full" />
              : p.notes.error ? <CardError onRetry={() => p.notes.refetch()} testId="error-latest-note" />
              : newestNote ? <div><p className="whitespace-pre-wrap break-words text-sm line-clamp-5" data-testid="text-latest-note">{newestNote.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{dates.day(newestNote.createdAt)}</p></div>
              : <p className="text-sm text-muted-foreground" data-testid="empty-latest-note">{t("customerDetail.noNotes")}</p>}
          </DashCard>

          <DashCard icon={Users} title={t("cp3.cards.people")} testId="card-people" link={pageLink("contacts", t("cp3.links.allContacts"), "link-dashboard-contacts")}>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-[13px]">
              <dt className="text-muted-foreground">{t("cp3.people.company")}</dt>
              <dd className="min-w-0 break-words" data-testid="text-people-company">{p.management.status === "loading" ? <Skeleton className="h-4 w-28" />
                : p.management.status === "error" ? t("cp3.unavailable") : p.pmCompany?.name ?? (p.pmManager ? t("cp3.none") : t("cp3.chips.selfManaged"))}</dd>
              {p.pmManager && (<>
                <dt className="text-muted-foreground">{t("cp3.people.manager")}</dt>
                <dd className="min-w-0" data-testid="text-people-manager">
                  <span className="font-medium">{p.pmManager.name}</span>
                  {p.pmManager.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{p.pmManager.email}</span>
                    <button type="button" className="rounded p-0.5 hover:text-foreground" aria-label={t("cp3.copyEmail")} onClick={() => copy(p.pmManager!.email!)} data-testid="button-copy-manager-email"><Copy className="h-3 w-3" /></button></span>}
                  {p.pmManager.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" /><span className="truncate">{p.pmManager.phone}</span>
                    <button type="button" className="rounded p-0.5 hover:text-foreground" aria-label={t("cp3.copyPhone")} onClick={() => copy(p.pmManager!.phone!)} data-testid="button-copy-manager-phone"><Copy className="h-3 w-3" /></button></span>}
                </dd>
              </>)}
              <dt className="text-muted-foreground">{t("cp3.people.contacts")}</dt>
              <dd className="min-w-0 break-words" data-testid="text-people-contacts">
                {p.contacts.isLoading ? <Skeleton className="h-4 w-32" /> : p.contacts.error ? t("cp3.unavailable")
                  : contacts.length ? t(p.customer.customerType === "hoa" ? "cp3.people.hoaContacts" : "cp3.people.contactCount", { count: contacts.length, names: contacts.slice(0, 4).map(c => c.name).join(", ") })
                  : t("customerDetail.noContacts")}
              </dd>
              <dt className="text-muted-foreground">{t("accountManagers.label")}</dt>
              <dd data-testid="text-people-account-manager">{!p.accountManagerLoaded ? t("cp3.unavailable") : p.accountManagerName ?? t("accountManagers.notAssigned")}</dd>
              {!!p.customer.tags?.length && (<>
                <dt className="text-muted-foreground">{t("cp3.people.tags")}</dt>
                <dd className="flex flex-wrap gap-1" data-testid="text-people-tags">{p.customer.tags.map((tag: string) => <span key={tag} className="rounded-full border px-2 py-px text-xs">{tag}</span>)}</dd>
              </>)}
            </dl>
          </DashCard>

          <SiteDetailsCard customer={p.customer} canEdit={p.canEditCustomer} />

          <DashCard icon={MapIcon} title={t("cp3.cards.property")} testId="card-dashboard-property" link={pageLink("property", t("cp3.links.openMap"), "link-dashboard-map")}>
            <div className="relative h-40 overflow-hidden rounded-md border bg-muted" data-testid="dashboard-mini-map">
              {layers.isLoading ? <Skeleton className="absolute inset-0" />
                : layers.error ? <div className="grid h-full place-items-center p-3"><CardError onRetry={() => layers.refetch()} testId="error-mini-map" /></div>
                : !pin && !outlineIds.size ? <p className="grid h-full place-items-center p-3 text-center text-xs text-muted-foreground" data-testid="empty-mini-map">{t("cp3.property.noMap")}</p>
                : <LayerMapViewer key={id} customerId={id} contained light pin={pin} shownLayerIds={outlineIds}
                    initialCenter={pin ?? undefined} initialZoom={pin ? 16 : undefined} />}
            </div>
            {!layers.isLoading && !layers.error && !outlineIds.size && pin && <p className="mt-1.5 text-xs text-muted-foreground" data-testid="text-no-outline">{t("cp3.property.noOutline")}</p>}
            <p className="mt-2 text-[13px]" data-testid="text-property-facts">
              {[p.customer.acres ? t("cp3.property.acres", { value: p.customer.acres }) : null,
                p.customer.complexityScore ? t("cp3.property.complexity", { value: p.customer.complexityScore }) : null].filter(Boolean).join(" \u00b7 ") || t("cp3.property.noFacts")}
            </p>
          </DashCard>

          {p.privileged && p.qboCard && <BillingSummary card={p.qboCard} state={p.qboState} customerId={id} pages={p.pages} />}
        </div>
      </div>
    </div>
  );
}
