import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Map, Plus, ChevronDown, Check, ArrowLeft, FolderOpen } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VisualScopeSheet } from "@shared/schema";
import { format } from "date-fns";

type VisualScopeWithCustomer = VisualScopeSheet & { customerName: string };

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export default function VisualScopeList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [title, setTitle] = useState("");
  const [scopeDate, setScopeDate] = useState(todayStr());

  const { data: sheets, isLoading } = useQuery<VisualScopeWithCustomer[]>({
    queryKey: ["/api/visual-scope-sheets"],
  });

  const { data: customers } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/visual-scope-sheets", {
        customerId: selectedCustomerId,
        title: title.trim() || "Visual Scope",
        scopeDate: scopeDate || todayStr(),
      });
      return res.json();
    },
    onSuccess: (sheet: VisualScopeSheet) => {
      queryClient.invalidateQueries({ queryKey: ["/api/visual-scope-sheets"] });
      setDialogOpen(false);
      resetForm();
      navigate(`/dashboard/tools/visual-scope/${sheet.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setSelectedCustomerId("");
    setSelectedCustomerName("");
    setTitle("");
    setScopeDate(todayStr());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) return;
    createMutation.mutate();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/tools">
          <Button variant="ghost" size="icon" data-testid="button-back-tools">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Visual Scope Sheets</h1>
          <p className="text-sm text-muted-foreground">Satellite-based visual scopes for customer proposals</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-visual-scope">
          <Plus className="w-4 h-4 mr-2" /> New Visual Scope
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !sheets?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Map className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">No visual scope sheets yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first one to get started with map-based visuals</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-new-empty-state">
              <Plus className="w-4 h-4 mr-2" /> New Visual Scope
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sheets.map(sheet => (
            <Card key={sheet.id} className="hover-elevate" data-testid={`card-scope-${sheet.id}`}>
              <CardContent className="py-3 px-4 flex items-center gap-4">
                <Map className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" data-testid={`text-scope-title-${sheet.id}`}>{sheet.title}</p>
                  <p className="text-sm text-muted-foreground" data-testid={`text-scope-customer-${sheet.id}`}>{sheet.customerName}</p>
                </div>
                <span className="text-sm text-muted-foreground shrink-0" data-testid={`text-scope-date-${sheet.id}`}>
                  {sheet.scopeDate}
                </span>
                <Badge variant="secondary" data-testid={`badge-scope-status-${sheet.id}`}>
                  {sheet.status}
                </Badge>
                <Link href={`/dashboard/tools/visual-scope/${sheet.id}`}>
                  <Button size="sm" variant="outline" data-testid={`button-open-scope-${sheet.id}`}>
                    <FolderOpen className="w-4 h-4 mr-1" /> Open
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent data-testid="dialog-new-scope">
          <DialogHeader>
            <DialogTitle>New Visual Scope Sheet</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    data-testid="button-select-customer"
                  >
                    {selectedCustomerName || "Select customer…"}
                    <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customers…" data-testid="input-customer-search" />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {(customers ?? []).map(c => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setSelectedCustomerId(c.id);
                              setSelectedCustomerName(c.name);
                              setCustomerOpen(false);
                            }}
                            data-testid={`option-customer-${c.id}`}
                          >
                            <Check className={`w-4 h-4 mr-2 ${selectedCustomerId === c.id ? "opacity-100" : "opacity-0"}`} />
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
              <Label htmlFor="vs-title">Title</Label>
              <Input
                id="vs-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Visual Scope"
                data-testid="input-scope-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vs-date">Date</Label>
              <Input
                id="vs-date"
                type="date"
                value={scopeDate}
                onChange={e => setScopeDate(e.target.value)}
                data-testid="input-scope-date"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-new-scope">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedCustomerId || createMutation.isPending}
                data-testid="button-create-scope"
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
