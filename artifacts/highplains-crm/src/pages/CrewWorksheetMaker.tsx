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
import { HardHat, Plus, ChevronDown, Check, ArrowLeft, FileText, Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { CrewWorksheetWithDetails, Customer } from "@shared/schema";

const CW_WRITE_ROLES = new Set(["admin", "office", "field_manager", "crew_supervisor", "landscape_supervisor"]);

export default function CrewWorksheetMaker() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = CW_WRITE_ROLES.has(user?.activeRole ?? "");

  const params = new URLSearchParams(search);
  const contextTicketId = params.get("ticketId") || null;
  const contextTicketTitle = params.get("ticketTitle") || null;
  const contextCustomerId = params.get("customerId") || null;
  const hasTicketContext = !!contextTicketId;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [title, setTitle] = useState("Crew Worksheet");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<"title" | "customer" | "status" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: worksheets = [], isLoading } = useQuery<CrewWorksheetWithDetails[]>({
    queryKey: ["/api/crew-worksheets"],
  });

  const { data: customersResp } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers"],
  });
  const customers = customersResp?.customers ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/crew-worksheets", {
        customerId: selectedCustomer!.id,
        title: title.trim() || "Crew Worksheet",
        worksheetDate: new Date().toISOString().split("T")[0],
        ...(contextTicketId ? { ticketId: contextTicketId } : {}),
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/crew-worksheets"] });
      setCreateDialogOpen(false);
      setSelectedCustomer(null);
      setTitle("Crew Worksheet");
      navigate(`/dashboard/tools/crew-worksheets/${data.id}`);
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("crewWorksheets.createFailed"), variant: "destructive" });
    },
  });

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
    try { await createMutation.mutateAsync(); } finally { setSubmitting(false); }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try { const [y, m, d] = dateStr.split("-"); return `${m}/${d}/${y}`; } catch { return dateStr; }
  };

  const handleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDir("asc"); }
  };

  const statusOrder: Record<string, number> = { draft: 0, finalized: 1 };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const f = q
      ? worksheets.filter(w =>
          w.title.toLowerCase().includes(q) ||
          (w.customerName ?? "").toLowerCase().includes(q) ||
          (w.worksheetNumber ?? "").toLowerCase().includes(q))
      : worksheets;
    return [...f].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "title") cmp = a.title.localeCompare(b.title);
      else if (sortColumn === "customer") cmp = (a.customerName ?? "").localeCompare(b.customerName ?? "");
      else if (sortColumn === "status") cmp = (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
      else cmp = (a.worksheetDate ?? "").localeCompare(b.worksheetDate ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [worksheets, searchQuery, sortColumn, sortDir]);

  const SortIcon = ({ col }: { col: typeof sortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
  };

  const statusBadge = (status: string) => {
    if (status === "finalized") return <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/50">{t("statuses.finalized")}</Badge>;
    return <Badge variant="secondary">{t("statuses.draft")}</Badge>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {hasTicketContext && (
        <div className="flex items-center justify-between gap-3 mb-5 p-3 rounded-md border bg-muted/40 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("crewWorksheets.linkingToTicket")}</p>
              <p className="text-sm font-medium truncate">{contextTicketTitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 shrink-0"
            onClick={() => navigate(`/dashboard/tickets/${contextTicketId}`)}
            data-testid="button-back-to-ticket">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("crewWorksheets.backToTicket")}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("crewWorksheets.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("tools.crewWorksheetsDesc")}</p>
        </div>
        {canWrite && (
          <Button onClick={handleOpenCreateDialog} data-testid="button-new-crew-worksheet">
            <Plus className="w-4 h-4 mr-2" />
            {t("crewWorksheets.newWorksheet")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="border rounded-md overflow-hidden">
          <div className="divide-y">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-1/5" />
                <div className="h-5 bg-muted rounded w-16 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      ) : worksheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <HardHat className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">{t("crewWorksheets.noWorksheets")}</h3>
          <p className="text-muted-foreground text-sm mb-4">{canWrite ? t("crewWorksheets.createFirst") : t("crewWorksheets.noWorksheetsReadOnly", { defaultValue: "No crew worksheets yet." })}</p>
          {canWrite && (
            <Button onClick={handleOpenCreateDialog} data-testid="button-new-crew-worksheet-empty">
              <Plus className="w-4 h-4 mr-2" />
              {t("crewWorksheets.newWorksheet")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("crewWorksheets.searchWorksheets")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-crew-worksheet-search"
            />
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                    {t("crewWorksheets.worksheetNum")}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button type="button" className="flex items-center gap-1.5 hover:text-foreground" onClick={() => handleSort("title")} data-testid="sort-title">
                      {t("common.title")}<SortIcon col="title" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button type="button" className="flex items-center gap-1.5 hover:text-foreground" onClick={() => handleSort("customer")} data-testid="sort-customer">
                      {t("common.customer")}<SortIcon col="customer" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button type="button" className="flex items-center gap-1.5 hover:text-foreground" onClick={() => handleSort("status")} data-testid="sort-status">
                      {t("common.status")}<SortIcon col="status" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    <button type="button" className="flex items-center gap-1.5 hover:text-foreground" onClick={() => handleSort("date")} data-testid="sort-date">
                      {t("common.date")}<SortIcon col="date" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">{t("crewWorksheets.noWorksheetsMatch")}</td></tr>
                ) : filtered.map(w => (
                  <tr key={w.id}
                    className="hover-elevate cursor-pointer transition-colors"
                    onClick={() => navigate(`/dashboard/tools/crew-worksheets/${w.id}`)}
                    data-testid={`row-crew-worksheet-${w.id}`}>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono whitespace-nowrap hidden sm:table-cell" data-testid={`text-worksheet-number-${w.id}`}>
                      {w.worksheetNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium truncate" data-testid={`text-worksheet-title-${w.id}`}>{w.title}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" data-testid={`text-worksheet-customer-${w.id}`}>{w.customerName}</td>
                    <td className="px-4 py-3">{statusBadge(w.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(w.worksheetDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setSelectedCustomer(null); setTitle("Crew Worksheet"); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crewWorksheets.newWorksheet")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("common.customer")} <span className="text-destructive">*</span></Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal" data-testid="button-select-customer">
                    {selectedCustomer ? selectedCustomer.name : t("crewWorksheets.selectCustomer")}
                    <ChevronDown className="ml-2 w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("crewWorksheets.searchCustomers")} data-testid="input-customer-search" />
                    <CommandList>
                      <CommandEmpty>{t("crewWorksheets.noCustomersFound")}</CommandEmpty>
                      <CommandGroup>
                        {customers.map(c => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => { setSelectedCustomer(c); setCustomerPopoverOpen(false); }} data-testid={`option-customer-${c.id}`}>
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
              <Label htmlFor="cw-title">{t("common.title")}</Label>
              <Input id="cw-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crew Worksheet" data-testid="input-crew-worksheet-title" />
            </div>
            {hasTicketContext && (
              <p className="text-xs text-muted-foreground">
                {t("crewWorksheets.linkingToTicket")}: <span className="font-medium text-foreground">{contextTicketTitle}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-dialog">{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={!selectedCustomer || submitting} data-testid="button-create-crew-worksheet">
              {submitting ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
