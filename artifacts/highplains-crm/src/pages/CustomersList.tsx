import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAccountManagers, ACCOUNT_MANAGERS_API } from "@/hooks/use-account-managers";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import type { Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, Archive, ArchiveRestore, ChevronRight, ChevronDown, Building2, GitBranch, MoreHorizontal, ExternalLink, Pencil, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getRecentCustomerIds } from "@/lib/last-viewed-customer";
import { QBO_TONE, type QboStateKind } from "@/components/customer/header/CustomerHeader";
import { isPrivilegedRole } from "@/components/customer/customerPages";
import { DisplayStatusBadge, PageEmptyState, ROW_CLASS, TableSkeleton, fromNestedControl, rowKeyOpen, type DisplayStatus } from "@/components/customer/page";
import { LIST_SUMMARY_API, paginateRows, seasonText, summaryIdsForPage, type ListSummary } from "@/components/customers/listSummary";

type ListCustomer = Customer & { branchCount?: number; management?: string | null; managerSearch?: string; qboState?: QboStateKind | null };
const QBO_STATES: QboStateKind[] = ["linked", "not_linked", "waiting", "via_parent", "error", "collision"];
const CUSTOMER_STATUS_TONE: Record<string, DisplayStatus> = { active: "active", prospect: "pending", inactive: "ended" };

export default function CustomersList() {
  const { user } = useAuth();
  return <CustomersListBody key={`${user?.activeCompanyId}|${user?.id}|${user?.activeRole}`} />;
}

function CustomersListBody() {
  const { user } = useAuth();
  const managers = useAccountManagers();
  const scope = `${user?.activeCompanyId}|${user?.id}|${user?.activeRole}`;
  const companyId = user?.activeCompanyId ?? "";
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => { currentScope.current = ""; };
  }, [scope]);
  const privileged = isPrivilegedRole(user?.accessRole);
  const canAssign = user?.accessRole === "admin" || user?.accessRole === "office";
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [managerFilter, setManagerFilter] = useState("all");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [targetManager, setTargetManager] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [qboFilter, setQboFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  useEffect(() => { setSelection(new Set()); setManagerFilter("all"); setTargetManager(""); }, [scope]);

  useSetBreadcrumbs([{ label: t("customers.title") }], []);

  const { data: customersResult, isLoading, error, refetch } = useQuery<{ customers: ListCustomer[]; total: number }>({
    queryKey: ["/api/customers?page=1&limit=200", scope, "listMetadata"],
    queryFn: async () => {
      const all: ListCustomer[] = [];
      let total = 0;
      for (let p = 1; ; p++) {
        const result = await (await apiRequest("GET", `/api/customers?page=${p}&limit=200&listMetadata=true`, undefined,
          { headers: { "X-Company-Id": companyId } })).json();
        all.push(...result.customers); total = result.total;
        if (all.length >= total || !result.customers.length) break;
      }
      return { customers: all, total };
    },
    enabled: !!companyId,
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, refetchInterval: 30_000,
  });
  const customers = useMemo(() => customersResult?.customers ?? [], [customersResult]);

  const invalidateCustomers = () => queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" &&
    (q.queryKey[0].startsWith("/api/customers") || q.queryKey[0] === ACCOUNT_MANAGERS_API) });
  const bulk = useMutation({
    mutationFn: async (input: { ids: string[]; manager: string | null; company: string; scope: string }) =>
      ({ ...input, result: await (await apiRequest("POST", "/api/customers/account-manager",
        { customerIds: input.ids, accountManagerId: input.manager },
        { headers: { "X-Company-Id": input.company } })).json() }),
    onSuccess: ({ result, scope: startedScope }) => {
      if (startedScope !== currentScope.current) return;
      setSelection(new Set());
      void invalidateCustomers();
      toast({ title: t("accountManagers.changed", { count: result.changedCount }) });
    },
    onError: (_error, variables) => {
      if (variables.scope !== currentScope.current) return;
      void invalidateCustomers();
      toast({ title: t("accountManagers.failed"), variant: "destructive" });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/customers/${id}`, { active: active ? "true" : "false" }, { headers: { "X-Company-Id": companyId } }),
    onSuccess: () => { void invalidateCustomers(); toast({ title: t("common.success"), description: t("customers.updated") }); },
    onError: () => toast({ title: t("common.error"), description: t("customers.updateFailed"), variant: "destructive" }),
  });

  const childrenByParent = useMemo(() => customers.reduce<Record<string, ListCustomer[]>>((acc, c) => {
    if (c.parentCustomerId) (acc[c.parentCustomerId] ??= []).push(c);
    return acc;
  }, {}), [customers]);
  const byId = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const amName = (c: Customer) => managers.data?.assignments[c.id]?.name ?? "";
  const q = search.trim().toLowerCase();
  const applyFilter = (c: ListCustomer) => {
    const hay = [c.name, c.street, c.city, c.state, c.zip, c.management, c.managerSearch, amName(c)].filter(Boolean).join(" ").toLowerCase();
    const isParentRow = c.isParent === "true";
    const manager = managers.data?.assignments[c.id];
    return (!q || hay.includes(q))
      && (statusFilter === "all" || c.status === statusFilter)
      && (showArchived || c.active === "true")
      && (managerFilter === "all" || (managerFilter === "none" ? !manager : manager?.id === managerFilter))
      && (typeFilter === "all" || (typeFilter === "parent" ? isParentRow : !isParentRow && c.customerType === typeFilter))
      && (qboFilter === "all" || c.qboState === qboFilter);
  };
  const filtersActive = !!q || statusFilter !== "all" || managerFilter !== "all" || typeFilter !== "all" || qboFilter !== "all";

  const eligibleFiltered = customers.filter(c => !c.parentCustomerId && applyFilter(c));
  useEffect(() => {
    const eligibleIds = new Set(eligibleFiltered.map(c => c.id));
    setSelection(old => {
      const next = new Set([...old].filter(id => eligibleIds.has(id)));
      return next.size === old.size ? old : next;
    });
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customersResult, managers.data, managerFilter, statusFilter, search, showArchived, typeFilter, qboFilter]);

  /** A parent stays visible when it matches or when any of its branches match (auto-shown). */
  const matchingChildren = (p: ListCustomer) => (childrenByParent[p.id] ?? []).filter(applyFilter);
  const topLevel = customers.filter(c => !c.parentCustomerId)
    .filter(c => applyFilter(c) || matchingChildren(c).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Flatten first (top-level + expanded/auto-shown branches), then paginate the flattened rows.
  const allRows: { customer: ListCustomer; isChild: boolean; isParent: boolean; childCount: number }[] = [];
  for (const c of topLevel) {
    const kids = childrenByParent[c.id] ?? [];
    const isParent = c.isParent === "true" || kids.length > 0;
    const shownKids = filtersActive ? matchingChildren(c) : kids;
    const autoOpen = filtersActive && !applyFilter(c) && shownKids.length > 0;
    allRows.push({ customer: c, isChild: false, isParent, childCount: kids.length });
    if (isParent && (expandedParents.has(c.id) || autoOpen)) {
      for (const k of [...shownKids].sort((a, b) => a.name.localeCompare(b.name))) allRows.push({ customer: k, isChild: true, isParent: false, childCount: 0 });
    }
  }
  const { rows, pageCount, page: currentPage } = paginateRows(allRows, page);
  const isOpen = (id: string) => allRows.some(r => r.isChild && r.customer.parentCustomerId === id);

  // One batch for exactly the rendered rows (parents' totals already include every branch server-side).
  const summaryIds = summaryIdsForPage(rows.map(r => r.customer.id));
  const summaries = useQuery<{ summaries: Record<string, ListSummary> }>({
    queryKey: [LIST_SUMMARY_API, scope, summaryIds.join(",")],
    queryFn: async ({ signal }) => (await apiRequest("GET", `${LIST_SUMMARY_API}?ids=${summaryIds.map(encodeURIComponent).join(",")}`, undefined,
      { headers: { "X-Company-Id": companyId }, signal })).json(),
    enabled: !!companyId && privileged && summaryIds.length > 0,
    // No placeholder data: a new page/id set shows skeletons, never another page's values.
  });
  const sum = (id: string) => summaries.data?.summaries?.[id];
  /** Summary cell states: skeleton while the page batch loads; "Unavailable" when the batch failed or omitted the id. "—" is reserved for no terms. */
  const summaryCell = (id: string, testId: string, render: (s: ListSummary) => ReactNode, right = false) => {
    if (summaries.isLoading) return <Skeleton className={`h-3.5 w-14 ${right ? "ml-auto" : ""}`} data-testid={`${testId}-loading`} />;
    const s = sum(id);
    if (!s) return <span className="text-xs text-muted-foreground" data-testid={`${testId}-unavailable`}>{t("cp4.list.unavailable")}</span>;
    return render(s);
  };

  const recent = getRecentCustomerIds(companyId).map(id => byId.get(id)).filter((c): c is ListCustomer => !!c && c.active === "true").slice(0, 5);
  const toggle = (id: string) => setExpandedParents(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const open = (c: Customer) => navigate(`/dashboard/customers/${c.id}`);
  const typeLabel = (c: Customer) => c.isParent === "true" ? t("cp4.list.typeParent") : c.customerType === "hoa" ? t("cp4.list.typeHoa") : t("cp4.list.typeCommercial");
  const selectCls = "h-9 min-w-0 rounded-md border bg-background px-2 text-[12.5px]";
  const colCount = 5 + (canAssign ? 1 : 0) + (privileged ? 4 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          {t("customers.title")}
          {customersResult && <span className="text-sm font-normal tabular-nums text-muted-foreground" data-testid="text-customer-count">{topLevel.length}</span>}
        </h1>
        {privileged && (
          <Button className="ml-auto" onClick={() => navigate("/dashboard/customers/new")} data-testid="button-add-customer">
            <Plus className="mr-2 h-4 w-4" />{t("customers.addCustomer")}
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" data-testid="recent-customers">
          <h2 id="recent-heading" className="mb-2 text-[13px] font-semibold text-muted-foreground">{t("cp4.list.recent")}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {recent.map(c => (
              <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="rounded-[10px] border bg-card px-3 py-2.5 hover:bg-muted/50" data-testid={`card-recent-${c.id}`}>
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{[c.isParent === "true" ? null : c.city, typeLabel(c)].filter(Boolean).join(" \u00b7 ")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap" data-testid="customer-filters">
        <div className="relative min-w-[160px] flex-1 xl:min-w-[120px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("cp4.list.search")} value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-9" data-testid="input-search" />
        </div>
        <div className="flex gap-1" role="group" aria-label={t("common.status")}>
          {["all", "active", "prospect", "inactive"].map(s => (
            <button key={s} type="button" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)} data-testid={`chip-status-${s}`}
              className={`whitespace-nowrap rounded-full border px-2 py-1 text-[12.5px] ${statusFilter === s ? "border-transparent bg-[hsl(var(--rail-active))] font-semibold text-[hsl(var(--rail-heading))]" : "bg-background hover:bg-muted"}`}>
              {s === "all" ? t("common.all") : t(`statuses.${s}`)}
            </button>
          ))}
        </div>
        <select disabled={!managers.data || managers.isError} className={`${selectCls} w-[150px] shrink-0`} aria-label={t("accountManagers.label")} value={managerFilter}
          onChange={e => { setManagerFilter(e.target.value); setSelection(new Set()); }} data-testid="filter-account-manager">
          <option value="all">{t("accountManagers.all")}</option>
          <option value="none">{t("accountManagers.notAssigned")}</option>
          {managers.data?.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className={`${selectCls} w-[104px] shrink-0`} aria-label={t("cp4.list.type")} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} data-testid="filter-type">
          <option value="all">{t("cp4.list.allTypes")}</option>
          <option value="hoa">{t("cp4.list.typeHoa")}</option>
          <option value="commercial">{t("cp4.list.typeCommercial")}</option>
          <option value="parent">{t("cp4.list.typeParent")}</option>
        </select>
        {privileged && (
          <select className={`${selectCls} w-[150px] shrink-0`} aria-label={t("cp3.chips.quickbooks")} value={qboFilter} onChange={e => setQboFilter(e.target.value)} data-testid="filter-qbo">
            <option value="all">{t("cp4.list.allQbo")}</option>
            {QBO_STATES.map(s => <option key={s} value={s}>{t(`cp3.qbo.${s}`)}</option>)}
          </select>
        )}
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} data-testid="toggle-show-archived" />
          <Label htmlFor="show-archived" className="cursor-pointer text-[12.5px]">{t("customers.showArchived")}</Label>
        </div>
      </div>

      {canAssign && selection.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border bg-[hsl(var(--rail-active))]/40 px-3 py-2" data-testid="bulk-bar">
          <span className="text-sm font-medium">{t("cp4.list.selected", { count: selection.size })}</span>
          <select className={selectCls} aria-label={t("accountManagers.set")} value={targetManager} onChange={e => setTargetManager(e.target.value)} disabled={bulk.isPending}>
            <option value="">{t("accountManagers.notAssigned")}</option>
            {managers.data?.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Button size="sm" disabled={!selection.size || bulk.isPending || managers.isFetching}
            onClick={() => bulk.mutate({ ids: [...selection], manager: targetManager || null, company: companyId, scope })} data-testid="bulk-set-account-manager">
            {bulk.isPending ? t("accountManagers.pending") : t("accountManagers.set")} ({selection.size})
          </Button>
        </div>
      )}
      {canAssign && managers.isError && <button type="button" role="alert" className="text-sm underline" onClick={() => void managers.refetch()}>{t("accountManagers.retry")}</button>}

      {privileged && summaries.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-destructive/40 px-3 py-2 text-sm" data-testid="summary-error">
          {t("cp4.list.summaryFailed")}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void summaries.refetch()} data-testid="button-retry-summary">{t("cp4.retry")}</Button>
        </div>
      )}
      {isLoading ? <TableSkeleton rows={8} cols={7} testId="customers-skeleton" />
        : error ? <PageEmptyState icon={Users} message={t("cp4.loadFailed")} testId="customers-error"
            action={<Button size="sm" variant="outline" onClick={() => void refetch()}>{t("cp4.retry")}</Button>} />
        : topLevel.length === 0 ? <PageEmptyState icon={Users} message={filtersActive || customers.length ? t("customers.noCustomersFound") : t("cp4.list.none")} testId="customers-empty" />
        : (
          <>
            <div className="overflow-x-auto rounded-[10px] border">
              <Table data-testid="table-customers" className={`w-full ${privileged ? "min-w-[1040px]" : "min-w-[640px]"} table-fixed text-[13px] [&_th]:px-2 [&_td]:px-2`}>
                <colgroup>
                  {canAssign && <col style={{ width: "3%" }} />}
                  <col style={{ width: "23.5%" }} />
                  <col style={{ width: "8%" }} />
                  {privileged && <col style={{ width: "11%" }} />}
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  {privileged && <col style={{ width: "11%" }} />}
                  {privileged && <col style={{ width: "13%" }} />}
                  {privileged && <col style={{ width: "8%" }} />}
                  <col style={{ width: "4.5%" }} />
                </colgroup>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))] hover:bg-[hsl(var(--table-header))]">
                    {canAssign && <TableHead className="h-9 w-8"><input type="checkbox" aria-label={t("accountManagers.selectAll")}
                      checked={eligibleFiltered.length > 0 && eligibleFiltered.every(c => selection.has(c.id))}
                      disabled={bulk.isPending || managers.isLoading || managers.isError}
                      onChange={e => setSelection(e.target.checked ? new Set(eligibleFiltered.map(c => c.id)) : new Set())} /></TableHead>}
                    <TableHead className="h-9">{t("cp4.list.customer")}</TableHead>
                    <TableHead className="h-9">{t("cp4.list.city")}</TableHead>
                    {privileged && <TableHead className="h-9">{t("cp4.list.management")}</TableHead>}
                    <TableHead className="h-9">{t("accountManagers.label")}</TableHead>
                    <TableHead className="h-9">{t("common.status")}</TableHead>
                    {privileged && <TableHead className="h-9 text-right">{t("cp3.chips.thisSeason")}</TableHead>}
                    {privileged && <TableHead className="h-9">{t("cp3.chips.quickbooks")}</TableHead>}
                    {privileged && <TableHead className="h-9 text-right">{t("cp4.list.openTickets")}</TableHead>}
                    <TableHead className="h-9 w-10"><span className="sr-only">{t("common.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="leading-4">
                  {rows.map(({ customer: c, isChild, isParent, childCount }) => {
                    const s = sum(c.id);
                    const qbo: QboStateKind | null = s?.qboState ?? c.qboState ?? null;
                    const mgmt = c.management ?? s?.management ?? null;
                    const expanded = isOpen(c.id);
                    return (
                      <TableRow key={c.id} tabIndex={0} className={`${ROW_CLASS} ${isChild ? "bg-muted/25" : ""}`} data-testid={`row-customer-${c.id}`}
                        onClick={e => { if (!fromNestedControl(e)) open(c); }} onKeyDown={rowKeyOpen(() => open(c))}>
                        {canAssign && <TableCell className="py-1"><span data-row-ignore title={c.parentCustomerId ? t("accountManagers.branchHelp") : undefined}>
                          <input type="checkbox" aria-label={t("accountManagers.select", { name: c.name })}
                            disabled={!!c.parentCustomerId || bulk.isPending || managers.isLoading || managers.isError}
                            checked={!c.parentCustomerId && selection.has(c.id)}
                            onChange={e => setSelection(old => { const n = new Set(old); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                        </span></TableCell>}
                        <TableCell className="py-1">
                          <span className={`flex items-center gap-1.5 ${isChild ? "pl-6" : ""}`}>
                            {isParent ? (
                              <button type="button" onClick={() => toggle(c.id)} aria-expanded={expanded} className="rounded p-0.5 hover:bg-muted"
                                aria-label={t(expanded ? "cp4.list.collapseBranches" : "cp4.list.expandBranches", { name: c.name, count: childCount })}
                                data-testid={`button-expand-${c.id}`}>
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : isChild ? <GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <span className="w-5" />}
                            {isParent && <Building2 className="h-4 w-4 text-primary" aria-label={t("cp4.list.typeParent")} />}
                            <span className="min-w-0">
                              <span className="block truncate font-medium leading-4">{c.name}</span>
                              <span className="block text-[11.5px] leading-4 text-muted-foreground">{typeLabel(c)}{c.active === "false" ? ` \u00b7 ${t("cp4.list.archived")}` : ""}</span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-1 text-muted-foreground">
                          {isParent ? t("cp1.branches", { count: s?.branchCount ?? c.branchCount ?? childCount }) : c.city || "\u2014"}
                        </TableCell>
                        {privileged && <TableCell className="max-w-[12rem] truncate py-1 text-muted-foreground" data-testid={`management-${c.id}`}>{mgmt || "\u2014"}</TableCell>}
                        <TableCell className="py-1" data-testid={`account-manager-${c.id}`}>{!managers.data || managers.isError ? "\u2014" : managers.data.assignments[c.id]?.name ?? t("accountManagers.notAssigned")}</TableCell>
                        <TableCell className="py-1"><DisplayStatusBadge status={CUSTOMER_STATUS_TONE[c.status] ?? "pending"} label={t(`statuses.${c.status}`, { defaultValue: t("statuses.active") })} /></TableCell>
                        {privileged && <TableCell className="whitespace-nowrap py-1 text-right tabular-nums" data-testid={`season-${c.id}`}>{summaryCell(c.id, `season-${c.id}`, x => seasonText(x, t, i18n.language), true)}</TableCell>}
                        {privileged && <TableCell className="whitespace-nowrap py-1" data-testid={`qbo-${c.id}`}>
                          {qbo ? <span className="inline-flex items-center gap-1.5 text-[12.5px]"><span aria-hidden className={`h-[7px] w-[7px] rounded-full ${QBO_TONE[qbo]}`} />{t(`cp3.qbo.${qbo}`)}</span> : "\u2014"}
                        </TableCell>}
                        {privileged && <TableCell className="py-1 text-right tabular-nums" data-testid={`open-tickets-${c.id}`}>{summaryCell(c.id, `open-tickets-${c.id}`, x => x.openTickets, true)}</TableCell>}
                        <TableCell className="py-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("cp4.list.rowMenu", { name: c.name })} data-testid={`button-row-menu-${c.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => open(c)} data-testid={`menu-open-${c.id}`}><ExternalLink className="mr-2 h-4 w-4" />{t("cp4.list.open")}</DropdownMenuItem>
                              {privileged && <DropdownMenuItem onSelect={() => navigate(`/dashboard/customers/${c.id}/edit`)} data-testid={`menu-edit-${c.id}`}><Pencil className="mr-2 h-4 w-4" />{t("common.edit")}</DropdownMenuItem>}
                              {!isParent && (
                                <DropdownMenuItem disabled={archiveMutation.isPending} onSelect={() => archiveMutation.mutate({ id: c.id, active: c.active === "false" })} data-testid={`button-archive-${c.id}`}>
                                  {c.active === "false" ? <><ArchiveRestore className="mr-2 h-4 w-4" />{t("customers.unarchive")}</> : <><Archive className="mr-2 h-4 w-4" />{t("customers.archive")}</>}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && <TableRow><TableCell colSpan={colCount} /></TableRow>}
                </TableBody>
              </Table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} data-testid="button-list-prev">{t("common.previous")}</Button>
                <span className="tabular-nums">{t("cp4.list.page", { page: currentPage, total: pageCount })}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} data-testid="button-list-next">{t("common.next")}</Button>
              </div>
            )}
          </>
        )}
    </div>
  );
}
