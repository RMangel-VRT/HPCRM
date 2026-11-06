import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ChevronDown, ChevronRight, Search, Ticket as TicketIcon } from "lucide-react";
import type { Ticket } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TicketTypeBadge } from "@/components/TicketIdentity";
import { useCustomerScope } from "@/lib/customerScope";
import { isOpenTicket } from "@/components/customer/customerBadges";
import { calendarAge } from "@/components/customer/dashboard/dashboardModel";
import {
  DisplayStatusBadge, PageEmptyState, ROW_CLASS, TableSkeleton, displayStatus, fromNestedControl, rowKeyOpen, useCustomerDates,
} from "@/components/customer/page";

type TicketType = { id: string; name: string; typeKey?: string | null; color?: string | null };
type TicketStatus = { id: string; ticketTypeId?: string; name: string; statusKey?: string | null; actionType?: "needs_action" | "waiting" | null; isFinal?: "true" | "false" | null };
type CompanyUser = { user?: { id: string; name?: string | null } | null };
export type TicketRow = Ticket & { branchName?: string };

/**
 * CP4 customer Tickets: compact Ticket / Type / Status / Assignee / Age (open) or Done date (completed).
 * Open first; Completed collapsed by default. No page-level New ticket (the header Add menu owns it).
 * Parents pass `branches` and get a Branch column.
 */
export default function CustomerTicketsPage({ customerId, branches }: { customerId: string; branches?: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const scope = useCustomerScope();
  const dates = useCustomerDates();
  const [, navigate] = useLocation();
  const isParentView = !!branches;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);

  const sourceIds = isParentView ? branches!.map(b => b.id) : [customerId];
  const ticketQueries = useQueries({
    queries: sourceIds.map(id => ({
      queryKey: ["/api/customers", id, "tickets", ...scope.scope],
      queryFn: ({ signal }: { signal: AbortSignal }) => scope.getJson<Ticket[]>(`/api/customers/${encodeURIComponent(id)}/tickets`, signal),
      enabled: scope.enabled,
    })),
  });
  const types = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<TicketType[]>("/api/ticket-types", signal),
  });
  const statuses = useQuery<TicketStatus[]>({
    queryKey: ["/api/ticket-type-statuses", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<TicketStatus[]>("/api/ticket-type-statuses", signal),
  });
  const users = useQuery<CompanyUser[]>({
    queryKey: ["/api/companies/users", ...scope.scope], enabled: scope.enabled,
    queryFn: ({ signal }) => scope.getJson<CompanyUser[]>("/api/companies/users", signal),
  });

  const loading = ticketQueries.some(q => q.isLoading) || types.isLoading || statuses.isLoading;
  const failed = ticketQueries.some(q => q.error);
  const branchName = useMemo(() => new Map((branches ?? []).map(b => [b.id, b.name])), [branches]);
  const tickets: TicketRow[] = ticketQueries.flatMap((q, i) => (q.data ?? []).map(tk => ({ ...tk, branchName: isParentView ? branchName.get(sourceIds[i]!) : undefined })));
  const typeById = new Map((types.data ?? []).map(tt => [tt.id, tt]));
  const statusById = new Map((statuses.data ?? []).map(s => [s.id, s]));
  const userName = new Map((users.data ?? []).flatMap(u => u.user ? [[u.user.id, u.user.name ?? ""] as const] : []));
  const assigneeOf = (tk: Ticket) => (tk.assignedToId ? userName.get(tk.assignedToId) || null : null);

  const q = search.trim().toLowerCase();
  const filtered = tickets.filter(tk =>
    (!q || tk.title.toLowerCase().includes(q) || (tk.branchName ?? "").toLowerCase().includes(q) || (assigneeOf(tk) ?? "").toLowerCase().includes(q))
    && (typeFilter === "all" || tk.ticketTypeId === typeFilter)
    && (assigneeFilter === "all" || (assigneeFilter === "none" ? !tk.assignedToId : tk.assignedToId === assigneeFilter)));
  const ts = (v: unknown) => (v ? new Date(v as string).getTime() || 0 : 0);
  const open = filtered.filter(tk => isOpenTicket(tk, statuses.data)).sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
  const doneDate = (tk: Ticket) => tk.completedAt ?? tk.workCompletedDate ?? tk.updatedAt;
  const completed = filtered.filter(tk => !isOpenTicket(tk, statuses.data)).sort((a, b) => ts(doneDate(b)) - ts(doneDate(a)));
  const assignees = [...new Set(tickets.map(tk => tk.assignedToId).filter((v): v is string => !!v))]
    .map(id => ({ id, name: userName.get(id) || t("cp4.tickets.unknownUser") })).sort((a, b) => a.name.localeCompare(b.name));
  const usedTypes = [...new Set(tickets.map(tk => tk.ticketTypeId))].map(id => typeById.get(id)).filter((v): v is TicketType => !!v);

  if (loading) return <TableSkeleton rows={6} cols={isParentView ? 6 : 5} testId="tickets-skeleton" />;
  if (failed) return <PageEmptyState icon={TicketIcon} message={t("cp4.loadFailed")} testId="tickets-error"
    action={<Button size="sm" variant="outline" onClick={() => ticketQueries.forEach(q => void q.refetch())} data-testid="button-retry-tickets">{t("cp4.retry")}</Button>} />;

  const header = (completedTable: boolean) => (
    <TableHeader>
      <TableRow className="bg-[hsl(var(--table-header))] hover:bg-[hsl(var(--table-header))]">
        <TableHead className="h-9">{t("cp4.tickets.ticket")}</TableHead>
        {isParentView && <TableHead className="h-9" data-testid="col-branch">{t("cp4.tickets.branch")}</TableHead>}
        <TableHead className="h-9">{t("cp4.tickets.type")}</TableHead>
        <TableHead className="h-9">{t("cp4.tickets.status")}</TableHead>
        <TableHead className="h-9">{t("cp4.tickets.assignee")}</TableHead>
        <TableHead className="h-9 text-right">{completedTable ? t("cp4.tickets.doneDate") : t("cp4.tickets.age")}</TableHead>
      </TableRow>
    </TableHeader>
  );
  const row = (tk: TicketRow, completedTable: boolean) => {
    const href = `/dashboard/tickets/${tk.id}`;
    const status = statusById.get(tk.currentStatusId);
    const age = calendarAge(tk.createdAt as unknown as string);
    const assignee = assigneeOf(tk);
    return (
      <TableRow key={tk.id} tabIndex={0} className={ROW_CLASS} data-testid={`row-ticket-${tk.id}`}
        onClick={e => { if (!fromNestedControl(e)) navigate(href); }} onKeyDown={rowKeyOpen(() => navigate(href))}>
        <TableCell className="max-w-[24rem] py-1.5"><Link href={href} className="block truncate font-medium hover:underline" data-testid={`link-ticket-${tk.id}`}>{tk.title}</Link></TableCell>
        {isParentView && <TableCell className="py-1.5 text-muted-foreground" data-testid={`text-ticket-branch-${tk.id}`}>{tk.branchName ?? "\u2014"}</TableCell>}
        <TableCell className="py-1.5"><TicketTypeBadge type={typeById.get(tk.ticketTypeId) ?? null} billingBehavior={tk.billingBehavior} testId={`badge-ticket-type-${tk.id}`} /></TableCell>
        <TableCell className="py-1.5"><DisplayStatusBadge status={displayStatus("ticket", status)} title={status?.name} testId={`status-ticket-${tk.id}`} /></TableCell>
        <TableCell className="py-1.5">{assignee ?? <span className="text-muted-foreground">{t("cp4.tickets.unassigned")}</span>}</TableCell>
        <TableCell className="whitespace-nowrap py-1.5 text-right tabular-nums text-muted-foreground" data-testid={`text-ticket-when-${tk.id}`}>
          {completedTable ? dates.day(doneDate(tk)) : age == null ? "\u2014" : t("cp4.tickets.days", { count: age })}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-3" data-testid={isParentView ? "parent-tickets-table" : "customer-tickets"}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("cp4.tickets.search")} className="h-9 pl-9" data-testid="input-ticket-search" />
        </div>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" aria-label={t("cp4.tickets.type")} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} data-testid="filter-ticket-type">
          <option value="all">{t("cp4.tickets.allTypes")}</option>
          {usedTypes.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" aria-label={t("cp4.tickets.assignee")} value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} data-testid="filter-ticket-assignee">
          <option value="all">{t("cp4.tickets.allAssignees")}</option>
          <option value="none">{t("cp4.tickets.unassigned")}</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <section aria-labelledby="tickets-open-heading" className="space-y-2">
        <h3 id="tickets-open-heading" className="text-[13.5px] font-semibold">{t("cp4.tickets.open")} <span className="font-normal text-muted-foreground tabular-nums">{open.length}</span></h3>
        {open.length ? (
          <div className="overflow-x-auto rounded-[10px] border"><Table data-testid="table-open-tickets">{header(false)}<TableBody>{open.map(tk => row(tk, false))}</TableBody></Table></div>
        ) : <PageEmptyState icon={TicketIcon} message={tickets.length ? t("cp4.tickets.noOpenMatch") : t("cp4.tickets.none")} testId="tickets-open-empty" />}
      </section>

      <section className="rounded-[10px] border">
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] font-semibold hover:bg-muted/50"
          aria-expanded={showCompleted} aria-controls="tickets-completed" onClick={() => setShowCompleted(v => !v)} data-testid="button-toggle-completed">
          {showCompleted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {t("cp4.tickets.completed")} <span className="font-normal text-muted-foreground tabular-nums">{completed.length}</span>
        </button>
        {showCompleted && (
          <div id="tickets-completed" className="overflow-x-auto border-t">
            {completed.length ? <Table data-testid="table-completed-tickets">{header(true)}<TableBody>{completed.map(tk => row(tk, true))}</TableBody></Table>
              : <p className="px-3 py-4 text-sm text-muted-foreground">{t("cp4.tickets.noCompleted")}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
