import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipboardList, Plus, ChevronDown, Check, CalendarDays, Hash } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProposalWithDetails } from "@shared/schema";
import type { Customer } from "@shared/schema";

export default function ProposalMaker() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [title, setTitle] = useState("Proposal");
  const [submitting, setSubmitting] = useState(false);

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
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      setDialogOpen(false);
      resetDialog();
      navigate(`/dashboard/tools/proposals/${data.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create proposal", variant: "destructive" });
    },
  });

  const resetDialog = () => {
    setSelectedCustomer(null);
    setTitle("Proposal");
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
            Proposal Maker
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build and store proposal drafts with QB estimate PDFs and scope of work
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-proposal">
          <Plus className="w-4 h-4 mr-2" />
          New Proposal
        </Button>
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
          <Button onClick={() => setDialogOpen(true)} data-testid="button-new-proposal-empty">
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
                  <Badge variant="secondary" data-testid={`badge-draft-${p.id}`}>Draft</Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid={`text-proposal-customer-${p.id}`}>
                  {p.customerName}
                </p>
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetDialog(); }} data-testid="button-cancel-dialog">
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
    </div>
  );
}
