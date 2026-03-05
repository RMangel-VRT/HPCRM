import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipboardList, Plus, ChevronDown, Check, CalendarDays, Hash, ArrowLeft, Link2, FileText, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProposalWithDetails } from "@shared/schema";
import type { Customer } from "@shared/schema";

export default function ProposalMaker() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

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
      toast({ title: "Error", description: "Failed to create proposal", variant: "destructive" });
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
      toast({ title: "Error", description: "Failed to link proposal", variant: "destructive" });
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
    (p.customerName ?? "").toLowerCase().includes(linkSearch.toLowerCase())
  );

  const getStatusBadge = (status: string | null | undefined) => {
    if (status === "finalized") {
      return <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/50">Finalized</Badge>;
    }
    if (status === "published") {
      return <Badge>Published</Badge>;
    }
    return <Badge variant="secondary">Draft</Badge>;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {hasTicketContext && (
        <div className="flex items-center justify-between gap-3 mb-5 p-3 rounded-md border bg-muted/40 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Linking to ticket</p>
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
            Back to ticket
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            Proposal Maker
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build and store proposal drafts with QB estimate PDFs and scope of work
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
              Link Existing
            </Button>
          )}
          <Button onClick={handleOpenCreateDialog} data-testid="button-new-proposal">
            <Plus className="w-4 h-4 mr-2" />
            New Proposal
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No proposals yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Create your first proposal draft to get started
          </p>
          <Button onClick={handleOpenCreateDialog} data-testid="button-new-proposal-empty">
            <Plus className="w-4 h-4 mr-2" />
            New Proposal
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proposals.map((p) => (
            <Card
              key={p.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/dashboard/tools/proposals/${p.id}`)}
              data-testid={`card-proposal-${p.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base font-medium" data-testid={`text-proposal-title-${p.id}`}>
                    {p.title}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span data-testid={`badge-status-${p.id}`}>{getStatusBadge(p.status)}</span>
                    {p.versions && p.versions.length > 0 && (
                      <Badge variant="outline" data-testid={`badge-latest-version-${p.id}`}>
                        v{p.versions[p.versions.length - 1].versionNumber}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground" data-testid={`text-proposal-customer-${p.id}`}>
                  {p.customerName}
                </p>
                {p.ticketId && (
                  <Badge variant="outline" className="text-xs gap-1 mt-1 w-fit" data-testid={`badge-linked-ticket-${p.id}`}>
                    <Link2 className="w-3 h-3" />
                    Linked to ticket
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {formatDate(p.proposalDate)}
                  </span>
                  {p.estimateNumber && (
                    <span className="flex items-center gap-1" data-testid={`text-estimate-num-${p.id}`}>
                      <Hash className="w-3 h-3" />
                      {p.estimateNumber}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Proposal Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetCreateDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    data-testid="button-select-customer"
                  >
                    {selectedCustomer ? selectedCustomer.name : "Select a customer..."}
                    <ChevronDown className="ml-2 w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customers..." data-testid="input-customer-search" />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
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
              <Label htmlFor="proposal-title">Title</Label>
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
                This proposal will be linked to: <span className="font-medium text-foreground">{contextTicketTitle}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetCreateDialog(); }} data-testid="button-cancel-dialog">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedCustomer || submitting}
              data-testid="button-create-proposal"
            >
              {submitting ? "Creating..." : "Create Proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Existing Proposal Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Existing Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Select an unlinked proposal to connect to <span className="font-medium text-foreground">{contextTicketTitle}</span>.
            </p>
            <Input
              placeholder="Search proposals..."
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              data-testid="input-link-search"
            />
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {proposals.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No proposals found.
                </div>
              ) : filteredLinkable.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No proposals match your search.
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
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground">{p.customerName} · {formatDate(p.proposalDate)}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {alreadyLinkedHere && (
                          <Badge variant="secondary" className="text-xs">Already linked</Badge>
                        )}
                        {!alreadyLinkedHere && p.ticketId && (
                          <Badge variant="outline" className="text-xs">Relink</Badge>
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
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
