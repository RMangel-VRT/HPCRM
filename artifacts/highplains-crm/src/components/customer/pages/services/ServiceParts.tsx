import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ChevronDown, ChevronRight, ExternalLink, Info, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { ServiceFulfillment, ServiceRound, ServiceSeason } from "@workspace/api-client-react";
import { DisplayStatusBadge, rowKeyOpen, fromNestedControl, useCustomerDates } from "@/components/customer/page";
import { serviceDisplayStatus, serviceNextLabel, serviceStatusLabel, isServiceSetup } from "@/lib/contractCustomerServices";
import { useCustomerServices } from "@/hooks/useCustomerServices";
import ChecklistItemDetailPanel from "@/components/ChecklistItemDetailPanel";
import { Skeleton } from "@/components/ui/skeleton";

export const DASH = "\u2014";
const fmtN = (n: number | null | undefined) => (n == null ? DASH : String(n));

/** Destination permissions mirror App.tsx route guards; never widen access. */
export interface ServiceAccess { timing: boolean; contracts: boolean; routes: boolean; campaigns: boolean }
export function accessFor(role: string | undefined): ServiceAccess {
  const r = role ?? "";
  return {
    timing: ["admin", "office"].includes(r),
    contracts: ["admin", "office"].includes(r),
    routes: ["admin", "office", "field_manager", "irrigation_manager"].includes(r),
    campaigns: ["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"].includes(r),
  };
}

const BLOCKING_GAPS = ["no_count", "invalid_count", "duplicate_lines"];

export function gapLink(issue: string, term: ServiceSeason | null, access: ServiceAccess): string | null {
  if (issue === "no_timing") return access.timing ? "/dashboard/settings/service-timing" : null;
  if (BLOCKING_GAPS.includes(issue)) return access.contracts && term ? `/dashboard/contracts/${encodeURIComponent(term.agreementId)}#term-${encodeURIComponent(term.termId)}` : null;
  if (issue === "no_route") return access.routes ? "/dashboard/routes" : null;
  return null;
}

export function seasonOptionLabel(s: ServiceSeason, day: (v: unknown) => string, t: any, parentName?: string) {
  const parts = [s.label, `${day(s.startDate)} – ${day(s.endDate)}`];
  if (s.parentCustomerId) parts.push(t("customerPages.services.viaParent", { name: parentName ?? t("customerPages.services.parent", { defaultValue: "parent" }), defaultValue: "via {{name}}" }));
  if (s.status === "sent") parts.push(t("customerPages.services.waitingSignature", { defaultValue: "Waiting on signature" }));
  return parts.join(" \u00b7 ");
}

export function ServiceTile({ row }: { row: ServiceFulfillment }) {
  const { t } = useTranslation();
  const known = row.owed != null;
  const pct = known && row.owed! > 0 ? Math.min(100, (row.done / row.owed!) * 100) : 0;
  return (
    <div className="rounded-md border bg-card px-3 py-2" data-testid={`tile-service-${row.serviceKey}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{row.label}</span>
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums" data-testid={`text-tile-count-${row.serviceKey}`}>
          {known ? `${row.done} / ${row.owed}` : DASH}
        </span>
      </div>
      {known ? (
        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground truncate" data-testid={`text-tile-setup-${row.serviceKey}`}>
          {serviceStatusLabel(row.status, t)}
        </p>
      )}
    </div>
  );
}

const ROUND_STATE_VAR: Record<string, string> = {
  completed: "text-[hsl(var(--success))]", skipped: "text-muted-foreground", overdue: "text-destructive",
  waiting_on_signature: "text-[hsl(var(--est-warn))]", missing_item: "text-[hsl(var(--est-warn))]", pending: "text-muted-foreground",
};
const ROUND_STATE_DEFAULT: Record<string, string> = {
  completed: "Completed", skipped: "Skipped", overdue: "Overdue", waiting_on_signature: "Waiting on signature",
  missing_item: "Not on a round yet", pending: "Pending",
};

function RoundLine({ round, row, access, onOpenItem }: { round: ServiceRound; row: ServiceFulfillment; access: ServiceAccess; onOpenItem: (r: ServiceRound) => void }) {
  const { t } = useTranslation();
  const day = useCustomerDates().day;
  const id = `${row.serviceKey}-${round.roundMonth}-${round.roundSeq}`;
  const windowText = round.windowStart === round.windowEnd ? day(round.windowStart) : `${day(round.windowStart)} – ${day(round.windowEnd)}`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[7rem_minmax(0,1fr)_9rem_auto] items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs border-t first:border-t-0" data-testid={`round-${id}`}>
      <span className="font-medium tabular-nums">{t("customerPages.services.round", { seq: round.roundSeq, defaultValue: "Round {{seq}}" })} <span className="text-muted-foreground">{round.roundMonth}</span></span>
      <span className="text-muted-foreground tabular-nums order-3 md:order-none col-span-2 md:col-span-1" data-testid={`text-round-window-${id}`}>
        {t("customerPages.services.windowRange", { range: windowText, defaultValue: "Window {{range}}" })}
        {round.dateKind === "chemical_promise" && <> · {t("customerPages.services.promisedBy", { date: day(round.dueDate), defaultValue: "Promised {{date}}" })}</>}
        <span className="ml-2" data-testid={`text-round-provenance-${id}`}>
          <span className="inline-flex rounded border px-1">{t(`customerPages.services.countSource.${round.countSource}`, { defaultValue: round.countSource === "contract" ? "Contract count" : "Standard count" })}</span>
          {" "}
          <span className="inline-flex rounded border px-1">{t(`customerPages.services.timing.${round.timing}`, { defaultValue: round.timing === "contract" ? "contract timing" : "program timing" })}</span>
        </span>
      </span>
      <span className={`font-medium ${ROUND_STATE_VAR[round.state] ?? ""}`} data-testid={`status-round-${id}`}>
        {t(`customerPages.services.roundStates.${round.state}`, { defaultValue: ROUND_STATE_DEFAULT[round.state] ?? round.state })}
      </span>
      <span className="flex items-center gap-2 justify-end">
        {round.itemId && (
          <button type="button" onClick={() => onOpenItem(round)} className="text-primary hover:underline" data-testid={`button-round-item-${id}`}>
            {t("customerPages.services.openItem", { defaultValue: "Item" })}
          </button>
        )}
        {round.campaignId && access.campaigns && (
          <Link href={`/dashboard/campaigns/${round.campaignId}`} className="inline-flex items-center gap-0.5 text-primary hover:underline" data-testid={`link-round-campaign-${id}`}>
            {t("customerPages.services.openRound", { defaultValue: "Round" })}<ExternalLink className="w-3 h-3" aria-hidden="true" />
          </Link>
        )}
      </span>
    </li>
  );
}

export function ServiceRowItem({ row, term, access, expanded, onToggle, onOpen, onOpenItem }: {
  row: ServiceFulfillment; term: ServiceSeason | null; access: ServiceAccess; expanded: boolean;
  onToggle: () => void; onOpen: () => void; onOpenItem: (r: ServiceRound) => void;
}) {
  const { t, i18n } = useTranslation();
  const isRoute = row.scheduling === "route";
  const expandable = !isRoute && row.rounds.length > 0;
  const issues = row.issues.filter(i => i !== row.status);
  const gapIssues = [row.status, ...issues];
  const links = Array.from(new Set(gapIssues.map(i => gapLink(i, term, access)).filter(Boolean))) as string[];
  const k = row.serviceKey;
  const Icon = row.status === "overdue" ? AlertCircle : row.status === "complete" ? CheckCircle2 : Clock;
  return (
    <div className="border-b last:border-b-0" data-testid={`row-service-${k}`}>
      <div
        role="button" tabIndex={0}
        aria-expanded={expandable ? expanded : undefined}
        onClick={e => { if (!fromNestedControl(e)) (expandable ? onToggle() : onOpen()); }}
        onKeyDown={rowKeyOpen(() => (expandable ? onToggle() : onOpen()))}
        className="w-full min-h-[44px] cursor-pointer flex items-start md:items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${row.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
        <span className="mt-0.5 md:mt-0 w-4 h-4 text-muted-foreground" aria-hidden="true">
          {expandable ? (expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
          <span className="md:flex-1 md:min-w-0 flex items-center gap-2">
            <span className="text-sm font-medium truncate" data-testid={`text-service-label-${k}`}>{row.label}</span>
            <span className="shrink-0 rounded border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground" data-testid={`tag-service-scheduling-${k}`}>
              {isRoute ? t("customerPages.services.tagRoute", { defaultValue: "Route" }) : t("customerPages.services.tagRound", { defaultValue: "Round" })}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
            <span data-testid={`text-service-counts-${k}`}>
              {t("customerPages.services.owed", { defaultValue: "Owed" })} <b className="text-foreground font-semibold">{fmtN(row.owed)}</b>
              {" / "}{t("customerPages.services.done", { defaultValue: "Done" })} <b className="text-foreground font-semibold">{row.done}</b>
              {" / "}{t("customerPages.services.remaining", { defaultValue: "Remaining" })} <b className="text-foreground font-semibold">{fmtN(row.remaining)}</b>
            </span>
            {row.skipped > 0 && <span data-testid={`text-service-skipped-${k}`}>{t("customerPages.services.skippedN", { count: row.skipped, defaultValue: "Skipped {{count}}" })}</span>}
            {row.next && <span className="md:w-40 truncate" data-testid={`text-service-next-${k}`}>{serviceNextLabel(row.next, i18n.language)}</span>}
          </span>
        </span>
        <DisplayStatusBadge status={serviceDisplayStatus(row.status)} label={serviceStatusLabel(row.status, t)} testId={`status-service-${k}`} />
      </div>
      {(issues.length > 0 || links.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 pl-10 -mt-1">
          {issues.map(i => (
            <span key={i} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${i === "count_mismatch" ? "text-muted-foreground" : "text-foreground"}`} data-testid={`chip-issue-${k}-${i}`}>
              {i === "count_mismatch" && <Info className="w-3 h-3" aria-hidden="true" />}
              {serviceStatusLabel(i, t)}
            </span>
          ))}
          {links.map(href => (
            <Link key={href} href={href} className="text-[11px] text-primary hover:underline" data-testid={`link-gap-${k}-${href.split("/")[2]}`}>
              {href.includes("service-timing") ? t("customerPages.services.fixTiming", { defaultValue: "Set service timing" })
                : href.includes("/routes") ? t("customerPages.services.fixRoute", { defaultValue: "Open Routes" })
                : t("customerPages.services.fixContract", { defaultValue: "Review contract season" })}
            </Link>
          ))}
          {isServiceSetup(row) && links.length === 0 && (
            <span className="text-[11px] text-muted-foreground" data-testid={`text-gap-noaccess-${k}`}>{t("customerPages.services.askOffice", { defaultValue: "Office can fix this setup." })}</span>
          )}
        </div>
      )}
      {expandable && expanded && (
        <ul className="mx-3 mb-2 ml-10 rounded border bg-muted/30" data-testid={`rounds-${k}`}>
          {row.rounds.map(r => <RoundLine key={`${r.roundMonth}-${r.roundSeq}`} round={r} row={row} access={access} onOpenItem={onOpenItem} />)}
        </ul>
      )}
    </div>
  );
}

/** Loads item history only once a drawer actually needs it. */
export function RoundItemPanel({ customerId, itemId, fallback, onClose }: {
  customerId: string; itemId: string; fallback: { title: string; start: string; end: string; category: string }; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { items, isLoading, error } = useCustomerServices(customerId);
  if (isLoading) return <div className="space-y-2" data-testid="drawer-item-loading"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-24 w-full" /></div>;
  const item = items.find((i: any) => i.id === itemId);
  if (error || !item) return <p className="text-sm text-muted-foreground" data-testid="drawer-item-missing">{t("customerPages.services.itemUnavailable", { defaultValue: "Item history is not available." })}</p>;
  return <ChecklistItemDetailPanel item={{
    ...item,
    campaignTitle: item.campaignTitle || fallback.title,
    campaignWindowStart: item.campaignWindowStart || fallback.start,
    campaignWindowEnd: item.campaignWindowEnd || fallback.end,
    campaignCategory: item.campaignCategory || fallback.category,
  }} onClose={onClose} />;
}
