import { useState, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ClipboardList, ArrowLeft, Link2, Search, ArrowUp, ArrowDown, ArrowUpDown, Calculator } from "lucide-react";
import { ESTIMATE_BUILDER_PATH, formatCalendarDate } from "@/lib/estimateBuilder";
import { OLD_PROPOSALS_PATH, ProposalRetiredNotice, useProposalHistory } from "@/components/proposals/ProposalHistory";
import type { ProposalWithDetails } from "@shared/schema";

export default function ProposalMaker() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { t, i18n } = useTranslation();

  const params = new URLSearchParams(search);
  const contextTicketId = params.get("ticketId") || null;
  const contextTicketTitle = params.get("ticketTitle") || null;
  const hasTicketContext = !!contextTicketId;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<"title" | "customer" | "status" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isPending, isError, refetch } = useProposalHistory<ProposalWithDetails[]>();
  const proposals = data ?? [];

  const handleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortDir("asc");
    }
  };

  const statusOrder = { draft: 0, published: 1, finalized: 2 };

  const filteredSortedProposals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? proposals.filter(p =>
          p.title.toLowerCase().includes(q) ||
          (p.customerName ?? "").toLowerCase().includes(q) ||
          (p.proposalNumber ?? "").toLowerCase().includes(q)
        )
      : proposals;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortColumn === "customer") {
        cmp = (a.customerName ?? "").localeCompare(b.customerName ?? "");
      } else if (sortColumn === "status") {
        cmp = (statusOrder[a.status as keyof typeof statusOrder] ?? 0) - (statusOrder[b.status as keyof typeof statusOrder] ?? 0);
      } else {
        cmp = (a.proposalDate ?? "").localeCompare(b.proposalDate ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [proposals, searchQuery, sortColumn, sortDir]);

  const SortIcon = ({ col }: { col: typeof sortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3.5 h-3.5" />
      : <ArrowDown className="w-3.5 h-3.5" />;
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (status === "finalized") {
      return <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/50">{t("statuses.finalized")}</Badge>;
    }
    if (status === "published") {
      return <Badge>{t("statuses.published")}</Badge>;
    }
    return <Badge variant="secondary">{t("statuses.draft")}</Badge>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {hasTicketContext && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Link href={`/dashboard/tickets/${encodeURIComponent(contextTicketId!)}`} className="inline-flex items-center gap-1.5 text-primary underline" data-testid="button-back-to-ticket">
            <ArrowLeft className="h-4 w-4" />{t("proposals.backToTicket")}
          </Link>
          {contextTicketTitle && <span className="truncate text-muted-foreground">{contextTicketTitle}</span>}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("proposals.history.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("proposals.history.listDescription")}
          </p>
        </div>
        <Button asChild variant="outline" data-testid="button-go-to-estimates">
          <Link href={ESTIMATE_BUILDER_PATH}><Calculator className="w-4 h-4 mr-2" />{t("proposals.history.goToEstimates")}</Link>
        </Button>
      </div>
      <div className="mb-5"><ProposalRetiredNotice /></div>

      {isPending ? (
        <div className="border rounded-md overflow-hidden">
          <div className="divide-y">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-1/5" />
                <div className="h-5 bg-muted rounded w-16 ml-auto" />
                <div className="h-4 bg-muted rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : isError ? (
        <div role="alert" className="flex items-center gap-3 text-sm">
          {t("proposals.history.loadError")}
          <Button size="sm" variant="outline" onClick={() => void refetch()}>{t("estimateBuilder.retry")}</Button>
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">{t("proposals.noProposals")}</h3>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("proposals.searchProposals")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-proposal-search"
            />
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                    {t("proposals.proposalNum")}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                      onClick={() => handleSort("title")}
                      data-testid="sort-title"
                    >
                      {t("common.title")}
                      <SortIcon col="title" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                      onClick={() => handleSort("customer")}
                      data-testid="sort-customer"
                    >
                      {t("common.customer")}
                      <SortIcon col="customer" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                      onClick={() => handleSort("status")}
                      data-testid="sort-status"
                    >
                      {t("common.status")}
                      <SortIcon col="status" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">
                    {t("proposals.version")}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">
                    {t("proposals.estimateNum")}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                      onClick={() => handleSort("date")}
                      data-testid="sort-date"
                    >
                      {t("common.date")}
                      <SortIcon col="date" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSortedProposals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      {t("proposals.noProposalsMatch")}
                    </td>
                  </tr>
                ) : (
                  filteredSortedProposals.map((p) => (
                    <tr
                      key={p.id}
                      className="hover-elevate cursor-pointer transition-colors"
                      onClick={() => navigate(`${OLD_PROPOSALS_PATH}/${encodeURIComponent(p.id)}`)}
                      data-testid={`row-proposal-${p.id}`}
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono whitespace-nowrap hidden sm:table-cell" data-testid={`text-proposal-number-${p.id}`}>
                        {p.proposalNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 min-w-0">
                          <Link href={`${OLD_PROPOSALS_PATH}/${encodeURIComponent(p.id)}`} onClick={event => event.stopPropagation()}
                            className="truncate font-medium hover:underline" data-testid={`text-proposal-title-${p.id}`}>
                            {p.title}
                          </Link>
                          {p.ticketId && (
                            <Badge variant="outline" className="text-xs gap-1 w-fit" data-testid={`badge-linked-ticket-${p.id}`}>
                              <Link2 className="w-3 h-3" />
                              {t("proposals.linkedToTicket")}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" data-testid={`text-proposal-customer-${p.id}`}>
                        {p.customerName}
                      </td>
                      <td className="px-4 py-3" data-testid={`badge-status-${p.id}`}>
                        {getStatusBadge(p.status)}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {p.versions && p.versions.length > 0 && (
                          <Badge variant="outline" data-testid={`badge-latest-version-${p.id}`}>
                            v{p.versions[p.versions.length - 1].versionNumber}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell" data-testid={`text-estimate-num-${p.id}`}>
                        {p.estimateNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatCalendarDate(p.proposalDate, i18n.language)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
