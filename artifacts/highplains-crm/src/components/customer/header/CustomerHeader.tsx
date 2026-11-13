import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import type { TFunction } from "i18next";
import {
  ArrowLeft, Check, ChevronDown, Edit, FileText, Mail, MapPin, MessageSquare, Plus, Ticket as TicketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/currency";
import { customerPageHref, type CustomerPageKey } from "@/components/customer/customerPages";
import { aggregateTerms, customerInitials } from "@/components/customer/dashboard/dashboardModel";

export type TermsAggregate = ReturnType<typeof aggregateTerms>;
export type QboStateKind = "linked" | "not_linked" | "waiting" | "via_parent" | "error" | "collision";
export type Loadable<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: T };

/** "{labels} · {annual} · {lines}" with T&M snow named, never priced as zero. */
export function contractValueText(agg: TermsAggregate, t: TFunction, lang: string): string {
  const parts: string[] = [];
  if (agg.labels.length) parts.push(agg.labels.join(", "));
  if (agg.annualCents != null) parts.push(formatCurrency(agg.annualCents, true, lang)
    + (agg.hasUnpriced ? ` ${t("cp3.chips.plusUnpriced")}` : "") + (agg.hasInherited ? ` ${t("cp3.chips.plusParent")}` : "")
    + (agg.hasSnowTm ? ` ${t("cp3.chips.snowTm")}` : ""));
  else if (agg.hasSnowTm) parts.push(t("cp1.timeAndMaterials"));
  else if (agg.hasInherited) parts.push(t("cp3.chips.parentPriced"));
  else parts.push(t("cp3.chips.priceNotSet"));
  if (agg.lines.length) parts.push(agg.lines.length === 2 ? t("cp1.both") : t(`cp1.${agg.lines[0]}`));
  if (agg.attentionState) parts.push(t(`contractAttention.state.${agg.attentionState}`));
  if (agg.missingDocument) parts.push(t("contractAttention.noPdf"));
  return parts.join(" \u00b7 ");
}

export const QBO_TONE: Record<QboStateKind, string> = {
  linked: "bg-[hsl(var(--success))]", via_parent: "bg-[hsl(var(--chart-5))]", collision: "bg-[hsl(var(--est-warn))]",
  waiting: "bg-[hsl(var(--est-warn))]", error: "bg-destructive", not_linked: "bg-muted-foreground",
};

export interface CustomerHeaderProps {
  customer: { id: string; name: string; status?: string | null; customerType?: string | null; ranking?: string | null;
    includeInRoute?: boolean | null; street?: string | null; city?: string | null; state?: string | null; zip?: string | null };
  kind: "regular" | "branch" | "parent";
  parent?: { id: string; name: string } | null;
  pages: CustomerPageKey[];
  switcherCustomers: { id: string; name: string }[];
  /** Commercial chips (Contract/This season, QuickBooks) render only when provided (admin/office). */
  contract?: Loadable<TermsAggregate | null>;
  qbo?: Loadable<QboStateKind | null>;
  billingName?: string | null;
  managedBy?: Loadable<{ company: string | null; manager: string | null } | null>;
  accountManager: Loadable<string | null>;
  branchCount?: number;
  canEdit: boolean;
  actions: { note: boolean; ticket: boolean; proposal: boolean; logCommunication: boolean };
  onAddNote: () => void;
  onAddProposal: () => void;
  onLogCommunication: () => void;
  proposalPending?: boolean;
}

function Chip({ label, value, href, testId, dot }: { label: string; value: ReactNode; href?: string; testId: string; dot?: string }) {
  const inner = (<>
    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
    <span className="text-[13px] font-semibold text-foreground inline-flex items-center gap-1.5 min-w-0" data-testid={`${testId}-value`}>
      {dot && <span aria-hidden className={`inline-block h-[7px] w-[7px] rounded-full shrink-0 ${dot}`} />}
      <span className="break-words">{value}</span>
    </span>
  </>);
  const cls = "inline-flex items-baseline gap-2 rounded-full border bg-background px-3 py-[5px] max-w-full";
  return href
    ? <Link href={href} className={`${cls} hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors`} data-testid={testId} data-href={href}>{inner}</Link>
    : <span className={cls} data-testid={testId}>{inner}</span>;
}

export default function CustomerHeader(p: CustomerHeaderProps) {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const c = p.customer;
  const isParent = p.kind === "parent";
  const href = (page: CustomerPageKey) => p.pages.includes(page) ? customerPageHref(c.id, page) : undefined;
  const loadText = <T,>(l: Loadable<T>, ready: (v: T) => string) =>
    l.status === "loading" ? t("common.loading") : l.status === "error" ? t("cp3.unavailable") : ready(l.value);
  const address = [c.street, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ").trim();
  const status = c.status && ["active", "prospect", "inactive"].includes(c.status) ? c.status : null;
  const anyAction = p.actions.note || p.actions.ticket || p.actions.proposal || p.actions.logCommunication;

  const quiet: ReactNode[] = isParent ? [
    <span key="parent" data-testid="quiet-parent-account">{t("cp3.quiet.parentAccount")}</span>,
    ...(p.billingName ? [<span key="billed" data-testid="quiet-billed-as">{t("cp3.quiet.billedAs", { name: p.billingName })}</span>] : []),
  ] : [
    <span key="type" data-testid="quiet-type">{t(`cp3.type.${c.customerType === "hoa" ? "hoa" : "commercial"}`)}</span>,
    <span key="rank" data-testid="quiet-ranking">{t(`cp3.ranking.${c.ranking ?? "standard"}`, { defaultValue: c.ranking ?? "" })}</span>,
    <span key="route" data-testid="quiet-route">{t(c.includeInRoute ? "cp3.quiet.onRoute" : "cp3.quiet.notOnRoute")}</span>,
    address ? (href("property")
      ? <Link key="addr" href={href("property")!} className="inline-flex items-center gap-1 hover:text-foreground hover:underline" data-testid="link-header-address">
          <MapPin className="h-3.5 w-3.5" />{address}</Link>
      : <span key="addr" className="inline-flex items-center gap-1" data-testid="link-header-address"><MapPin className="h-3.5 w-3.5" />{address}</span>)
      : <span key="addr" data-testid="quiet-no-address">{t("cp3.quiet.noAddress")}</span>,
    ...(p.kind === "branch" && p.parent ? [
      <Link key="parent" href={customerPageHref(p.parent.id, "dashboard")} className="hover:text-foreground hover:underline" data-testid="link-header-parent">
        {t("customerDetail.partOf", { name: p.parent.name })}</Link>] : []),
  ];

  const managed = loadText(p.managedBy ?? { status: "ready", value: null }, v => v && (v.company || v.manager)
    ? [v.company, v.manager].filter(Boolean).join(" \u00b7 ") : t("cp3.chips.selfManaged"));

  return (
    <header className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 md:-mx-8 md:-mt-8 px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-4 border-b bg-gradient-to-b from-primary/[0.13] to-background to-85%"
      data-testid="customer-header" data-kind={p.kind}>
      <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground" data-testid="link-all-customers">
        <ArrowLeft className="h-3.5 w-3.5" />{t("cp3.allCustomers")}
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div aria-hidden data-testid="customer-monogram"
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-[14px] text-xl font-bold tracking-[0.02em] ${isParent
            ? "bg-[hsl(var(--rail-heading))] text-background" : "bg-sidebar text-sidebar-foreground"}`}>
          {customerInitials(c.name)}
        </div>

        <div className="min-w-0 flex-1 basis-[16rem]">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button type="button" aria-haspopup="listbox" aria-label={t("cp3.switcher.label", { name: c.name })}
                  className="group inline-flex min-w-0 items-center gap-1.5 rounded-md py-0.5 pr-1.5 text-left hover:bg-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  data-testid="select-customer-switcher">
                  <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em] break-words" data-testid="text-customer-name">{c.name}</h1>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0" data-testid="popover-customer-switcher">
                <Command>
                  <CommandInput placeholder={t("cp3.switcher.search")} data-testid="input-customer-switcher" />
                  <CommandList>
                    <CommandEmpty>{t("customers.noCustomersFound")}</CommandEmpty>
                    <CommandGroup>
                      {p.switcherCustomers.map(sc => (
                        <CommandItem key={sc.id} value={`${sc.name} ${sc.id}`} data-testid={`option-customer-${sc.id}`}
                          onSelect={() => { setOpen(false); if (sc.id !== c.id) navigate(`/dashboard/customers/${sc.id}`); }}>
                          <Check className={`mr-2 h-4 w-4 ${sc.id === c.id ? "opacity-100" : "opacity-0"}`} />{sc.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem value="__all_customers__" onSelect={() => { setOpen(false); navigate("/dashboard/customers"); }} data-testid="option-all-customers">
                        <ArrowLeft className="mr-2 h-4 w-4" />{t("cp3.allCustomers")}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {status && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-px text-xs font-medium" data-testid="status-customer" data-status={status}>
                <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${status === "active" ? "bg-[hsl(var(--success))]" : status === "prospect" ? "bg-[hsl(var(--chart-5))]" : "bg-muted-foreground"}`} />
                {t(`cp3.status.${status}`)}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-y-1 text-[13px] text-muted-foreground [&>*+*]:before:content-['\00b7'] [&>*+*]:before:mx-2 [&>*+*]:before:text-border" data-testid="customer-quiet-line">
            {quiet}
          </div>
        </div>

        {(anyAction || (p.canEdit && !isParent)) && (
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full" data-testid="customer-header-actions">
            {anyAction && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="button-header-add"><Plus className="mr-1.5 h-4 w-4" />{t("cp3.add.label")}<ChevronDown className="ml-1 h-3.5 w-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  {p.actions.note && <DropdownMenuItem onSelect={p.onAddNote} data-testid="menu-add-note"><MessageSquare className="mr-2 h-4 w-4" />{t("cp3.add.note")}</DropdownMenuItem>}
                  {p.actions.ticket && <DropdownMenuItem onSelect={() => navigate(`/dashboard/tickets/new?customerId=${c.id}`)} data-testid="menu-add-ticket"><TicketIcon className="mr-2 h-4 w-4" />{t("cp3.add.ticket")}</DropdownMenuItem>}
                  {p.actions.proposal && <DropdownMenuItem disabled={p.proposalPending} onSelect={p.onAddProposal} data-testid="menu-add-proposal"><FileText className="mr-2 h-4 w-4" />{t("cp3.add.proposal")}</DropdownMenuItem>}
                  {p.actions.logCommunication && <DropdownMenuItem onSelect={p.onLogCommunication} data-testid="menu-log-communication"><Mail className="mr-2 h-4 w-4" />{t("cp3.add.logCommunication")}</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {p.canEdit && !isParent && (
              <Button size="sm" asChild>
                <Link href={`/dashboard/customers/${c.id}/edit`} data-testid="button-edit-customer"><Edit className="mr-1.5 h-4 w-4" />{t("cp3.editCustomer")}</Link>
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2" data-testid="customer-fact-chips">
        {isParent ? (
          <Chip label={t("cp3.chips.branches")} value={t("cp3.chips.properties", { count: p.branchCount ?? 0 })} href={href("branches")} testId="chip-branches" />
        ) : p.contract && (
          <Chip label={t("cp3.chips.contract")} href={href("contracts")} testId="chip-contract"
            value={loadText(p.contract, v => v && v.labels.length ? contractValueText(v, t, i18n.language) : t("cp1.noContract"))} />
        )}
        {isParent && p.contract && (
          <Chip label={t("cp3.chips.thisSeason")} href={href("contracts")} testId="chip-this-season"
            value={loadText(p.contract, v => v && v.labels.length ? contractValueText(v, t, i18n.language) : t("cp1.noContract"))} />
        )}
        {!isParent && <Chip label={t("cp3.chips.managedBy")} value={managed} href={href("contacts")} testId="chip-managed-by" />}
        <Chip label={t("accountManagers.label")} testId="chip-account-manager"
          value={loadText(p.accountManager, v => v ?? t("accountManagers.notAssigned"))} />
        {p.qbo && (
          <Chip label={t("cp3.chips.quickbooks")} href={href("billing")} testId="chip-quickbooks"
            dot={p.qbo.status === "ready" && p.qbo.value ? QBO_TONE[p.qbo.value] : undefined}
            value={loadText(p.qbo, v => v ? t(`cp3.qbo.${v}`) : t("cp3.unavailable"))} />
        )}
      </div>
    </header>
  );
}
