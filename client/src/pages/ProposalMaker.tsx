import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipboardList, Plus, ChevronDown, Check, ArrowLeft, Link2, FileText, Loader2, Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProposalWithDetails } from "@shared/schema";
import type { Customer } from "@shared/schema";

export default function ProposalMaker() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { t } = useTranslation();

  const params = new URLSearchParams(search);
  const contextTicketId = params.get("ticketId") || null;
  const contextTicketTitle = params.get("ticketTitle") || null;
  const contextCustomerId = params.get("customerId") || null;
  const hasTicketContext = !!contextTicketId;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [title, setTitle] = useState("Proposal");
  const [submitting, setSubmitting] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<"title" | "customer" | "status" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: proposals = [], isLoading } = useQuery<ProposalWithDetails[]>({
    queryKey: ["/api/proposals"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/proposals", {
        customerId: selectedCustomer!.id,
        title: title.trim() || "Proposal",
        proposalDate: new Date().toISOString().split("T")[0],
        ...(contextTicketId ? { ticketId: contextTicketId } : {}),
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      setCreateDialogOpen(false);
      resetCreateDialog();
      const dest = contextTicketId
        ? `/dashboard/tools/proposals/${data.id}?ticketId=${encodeURIComponent(contextTicketId)}&ticketTitle=${encodeURIComponent(contextTicketTitle ?? "")}`
        : `/dashboard/tools/proposals/${data.id}`;
      navigate(dest);
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("proposals.createFailed"), variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      return apiRequest("PATCH", `/api/proposals/${proposalId}`, {
        ticketId: contextTicketId,
      });
    },
    onSuccess: async (res, proposalId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      if (contextTicketId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tickets", contextTicketId, "proposals"] });
      }
      setLinkDialogOpen(false);
      const dest = contextTicketId
        ? `/dashboard/tools/proposals/${proposalId}?ticketId=${encodeURIComponent(contextTicketId)}&ticketTitle=${encodeURIComponent(contextTicketTitle ?? "")}`
        : `/dashboard/tools/proposals/${proposalId}`;
      navigate(dest);
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("proposals.linkFailed"), variant: "destructive" });
    },
  });

  const resetCreateDialog = () => {
    setSelectedCustomer(null);
    setTitle("Proposal");
  };

  const handleOpenCreateDialog = () => {
    if (contextCustomerId) {
      const match = customers.find(c => c.id === contextCustomerId);
      if (match) setSelectedCustomer(match);
    }
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!selectedCustomer) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync();
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split("-");
      return `${month}/${day}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const filteredLinkable = proposals.filter(p =>
    !linkSearch ||
    p.title.toLowerCase().includes(linkSearch.toLowerCase()) ||
    (p.customerName ?? "").toLowerCase().includes(linkSearch.toLowerCase()) ||
    (p.proposalNumber ?? "").toLowerCase().includes(linkSearch.toLowerCase())
  );

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
        <div className="flex items-center justify-between gap-3 mb-5 p-3 rounded-md border bg-muted/40 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("proposals.linkingToTicket")}</p>
              <p className="text-sm font-medium truncate">{contextTicketTitle}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => navigate(`/dashboard/tickets/${contextTicketId}`)}
            data-testid="button-back-to-ticket"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("proposals.backToTicket")}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("proposals.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("tools.proposalMakerDesc")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasTicketContext && (
            <Button
              variant="outline"
              onClick={() => setLinkDialogOpen(true)}
              data-testid="button-link-existing-proposal"
            >
              <Link2 className="w-4 h-4 mr-2" />
              {t("proposals.linkExisting")}
            </Button>
          )}
          <Button onClick={handleOpenCreateDialog} data-testid="button-new-proposal">
            <Plus className="w-4 h-4 mr-2" />
            {t("proposals.newProposal")}
          </Button>
        </div>
      </div>

      {isLoading ? (
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
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">{t("proposals.noProposals")}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {t("proposals.createFirst")}
          </p>
          <Button onClick={handleOpenCreateDialog} data-testid="button-new-proposal-empty">
            <Plus className="w-4 h-4 mr-2" />
            {t("proposals.newProposal")}
          </Button>
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
                      onClick={() => navigate(`/dashboard/tools/proposals/${p.id}`)}
                      data-testid={`row-proposal-${p.id}`}
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono whitespace-nowrap hidden sm:table-cell" data-testid={`text-proposal-number-${p.id}`}>
                        {p.proposalNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="font-medium truncate" data-testid={`text-proposal-title-${p.id}`}>
                            {p.title}
                          </span>
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
                        {formatDate(p.proposalDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetCreateDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("proposals.newProposal")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("common.customer")} <span className="text-destructive">*</span></Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    data-testid="button-select-customer"
                  >
                    {selectedCustomer ? selectedCustomer.name : t("proposals.selectCustomer")}
                    <ChevronDown className="ml-2 w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("proposals.searchCustomers")} data-testid="input-customer-search" />
                    <CommandList>
                      <CommandEmpty>{t("proposals.noCustomersFound")}</CommandEmpty>
                      <CommandGroup>
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setSelectedCustomer(c);
                              setCustomerPopoverOpen(false);
                            }}
                            data-testid={`option-customer-${c.id}`}
                          >
                            <Check className={`mr-2 w-4 h-4 ${selectedCustomer?.id === c.id ? "opacity-100" : "opacity-0"}`} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposal-title">{t("common.title")}</Label>
              <Input
                id="proposal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Proposal"
                data-testid="input-proposal-title"
              />
            </div>

            {hasTicketContext && (
              <p className="text-xs text-muted-foreground">
                {t("proposals.linkingToTicket")}: <span className="font-medium text-foreground">{contextTicketTitle}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetCreateDialog(); }} data-testid="button-cancel-dialog">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedCustomer || submitting}
              data-testid="button-create-proposal"
            >
              {submitting ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("proposals.linkExisting")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              {t("proposals.selectUnlinked")} <span className="font-medium text-foreground">{contextTicketTitle}</span>.
            </p>
            <Input
              placeholder={t("proposals.searchProposals")}
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              data-testid="input-link-search"
            />
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {proposals.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("proposals.noProposalsFound")}
                </div>
              ) : filteredLinkable.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("proposals.noProposalsMatch")}
                </div>
              ) : (
                filteredLinkable.map(p => {
                  const alreadyLinkedHere = p.ticketId === contextTicketId;
                  return (
                    <button
                      key={p.id}
                      className="w-full text-left flex items-center justify-between p-3 rounded-md border gap-3 disabled:opacity-60 disabled:cursor-not-allowed hover-elevate"
                      onClick={() => !alreadyLinkedHere && linkMutation.mutate(p.id)}
                      disabled={linkMutation.isPending || alreadyLinkedHere}
                      data-testid={`button-link-proposal-${p.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {p.proposalNumber && (
                            <span className="text-xs font-mono text-muted-foreground shrink-0">{p.proposalNumber}</span>
                          )}
                          <p className="text-sm font-medium truncate">{p.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{p.customerName} · {formatDate(p.proposalDate)}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {alreadyLinkedHere && (
                          <Badge variant="secondary" className="text-xs">{t("proposals.alreadyLinked")}</Badge>
                        )}
                        {!alreadyLinkedHere && p.ticketId && (
                          <Badge variant="outline" className="text-xs">{t("proposals.relink")}</Badge>
                        )}
                        {linkMutation.isPending && !alreadyLinkedHere ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : !alreadyLinkedHere ? (
                          <Link2 className="w-4 h-4 text-muted-foreground" />
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} data-testid="button-cancel-link">
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
