import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DatePickerField } from "@/components/DatePickerField";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Search, 
  CheckSquare, 
  FileText,
  ArrowLeft,
  ArrowRight,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { TicketType, TicketTypeStatus, CompanyUser, User, Customer } from "@shared/schema";

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: User;
  isSuperAdmin: boolean;
}

interface BatchResult {
  success: boolean;
  created: Array<{ id: string; customerId: string; customerName: string }>;
  skipped: Array<{ customerId: string; customerName: string; reason: string }>;
  failed: Array<{ customerId: string; error: string }>;
  summary: {
    total: number;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
  };
}

interface BatchTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketTypeName: "To-Do" | "Invoice";
}

export default function BatchTicketDialog({ 
  open, 
  onOpenChange,
  ticketTypeName 
}: BatchTicketDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Form state
  const [step, setStep] = useState<"details" | "customers" | "review">("details");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [invoiceCategory, setInvoiceCategory] = useState<"general_maintenance" | "snow" | null>(null);
  const [workCompletedDate, setWorkCompletedDate] = useState<Date | undefined>(undefined);
  
  // Customer selection state
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [customerSearch, setCustomerSearch] = useState("");
  
  // Queries
  const { data: ticketTypes = [] } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const ticketType = ticketTypes.find(tt => tt.name === ticketTypeName);

  // Filter out internal customers for batch creation
  const selectableCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name !== "Internal Tasks" && 
      c.active === "true"
    );
  }, [customers]);

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return selectableCustomers;
    const search = customerSearch.toLowerCase();
    return selectableCustomers.filter(c => 
      c.name.toLowerCase().includes(search) ||
      c.city.toLowerCase().includes(search)
    );
  }, [selectableCustomers, customerSearch]);

  // Team members who can be assigned
  const teamMembers = companyUsersData
    .filter(item => 
      item.companyUser.role === "admin" || 
      item.companyUser.role === "office" || 
      item.companyUser.role === "field_manager" ||
      item.companyUser.role === "chemical_manager" ||
      item.companyUser.role === "irrigation_manager" ||
      item.companyUser.role === "shop_manager"
    )
    .map(item => ({
      id: item.companyUser.userId,
      name: item.user.name,
      role: item.companyUser.role,
    }));

  // Initialize To-Do ticket type if needed
  const initTodoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ticket-types/init-todo");
      return res.json();
    },
  });

  // Initialize Invoice ticket type if needed
  const initInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ticket-types/init-invoice");
      return res.json();
    },
  });

  // Batch create mutation
  const batchCreateMutation = useMutation({
    mutationFn: async (data: {
      customerIds: string[];
      title: string;
      description: string | null;
      ticketTypeId: string;
      assignedToId: string;
      dueDate: string | null;
      priority: string;
      workType: string;
      invoiceCategory: "general_maintenance" | "snow" | null;
      workCompletedDate: string | null;
    }) => {
      const res = await apiRequest("POST", "/api/tickets/batch", data);
      return res.json() as Promise<BatchResult>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      
      const { summary } = result;
      if (summary.createdCount > 0) {
        toast({ 
          title: `Created ${summary.createdCount} ${ticketTypeName} ticket${summary.createdCount > 1 ? "s" : ""}`,
          description: summary.skippedCount > 0 
            ? `${summary.skippedCount} skipped (duplicates)` 
            : undefined
        });
      } else if (summary.skippedCount > 0) {
        toast({ 
          title: "All tickets skipped",
          description: "Open tickets with the same title already exist",
          variant: "destructive"
        });
      }
      
      handleClose();
    },
    onError: () => {
      toast({ title: "Failed to create tickets", variant: "destructive" });
    },
  });

  const handleClose = () => {
    setStep("details");
    setTitle("");
    setDescription("");
    setAssignedToId(null);
    setDueDate(undefined);
    setInvoiceCategory(null);
    setWorkCompletedDate(undefined);
    setSelectedCustomerIds(new Set());
    setCustomerSearch("");
    onOpenChange(false);
  };

  const handleOpen = async () => {
    // Ensure the ticket type exists before opening the dialog
    if (!ticketType) {
      try {
        if (ticketTypeName === "To-Do") {
          await initTodoMutation.mutateAsync();
        } else if (ticketTypeName === "Invoice") {
          await initInvoiceMutation.mutateAsync();
        }
        await queryClient.invalidateQueries({ queryKey: ["/api/ticket-types"] });
      } catch {
        toast({ title: "Failed to initialize ticket type", variant: "destructive" });
      }
    }
  };

  const handleNextStep = () => {
    if (step === "details") {
      if (!title.trim()) {
        toast({ title: "Please enter a title", variant: "destructive" });
        return;
      }
      if (!assignedToId) {
        toast({ title: "Please select an assignee", variant: "destructive" });
        return;
      }
      if (ticketTypeName === "Invoice" && !invoiceCategory) {
        toast({ title: "Please select an invoice category", variant: "destructive" });
        return;
      }
      setStep("customers");
    } else if (step === "customers") {
      if (selectedCustomerIds.size === 0) {
        toast({ title: "Please select at least one property", variant: "destructive" });
        return;
      }
      setStep("review");
    }
  };

  const handlePrevStep = () => {
    if (step === "customers") {
      setStep("details");
    } else if (step === "review") {
      setStep("customers");
    }
  };

  const handleSubmit = async () => {
    if (!ticketType) {
      toast({ title: "Ticket type not found", variant: "destructive" });
      return;
    }

    await batchCreateMutation.mutateAsync({
      customerIds: Array.from(selectedCustomerIds),
      title: title.trim(),
      description: description.trim() || null,
      ticketTypeId: ticketType.id,
      assignedToId: assignedToId!,
      dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      priority: "normal",
      workType: "admin",
      invoiceCategory: ticketTypeName === "Invoice" ? invoiceCategory : null,
      workCompletedDate: ticketTypeName === "Invoice" && workCompletedDate ? format(workCompletedDate, "yyyy-MM-dd") : null,
    });
  };

  const toggleCustomer = (customerId: string) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCustomerIds(new Set(filteredCustomers.map(c => c.id)));
  };

  const clearAll = () => {
    setSelectedCustomerIds(new Set());
  };

  const selectedCustomers = selectableCustomers.filter(c => selectedCustomerIds.has(c.id));
  const assigneeName = teamMembers.find(m => m.id === assignedToId)?.name || "Unknown";

  const isLoading = initTodoMutation.isPending || batchCreateMutation.isPending;
  const Icon = ticketTypeName === "To-Do" ? CheckSquare : FileText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={handleOpen}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            Batch {ticketTypeName} Creation
            <Badge variant="secondary" className="ml-2">
              {step === "details" ? "Step 1/3" : step === "customers" ? "Step 2/3" : "Step 3/3"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {step === "details" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="batch-title">Task Title</Label>
              <Input
                id="batch-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={ticketTypeName === "To-Do" ? "e.g., Create Irrigation Proposals" : "e.g., Snow Removal - Jan 5 Storm"}
                data-testid="input-batch-title"
              />
              <p className="text-xs text-muted-foreground">
                This title will be used for all tickets created
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch-description">Description (optional)</Label>
              <Textarea
                id="batch-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
                rows={3}
                data-testid="input-batch-description"
              />
            </div>

            {ticketTypeName === "Invoice" && (
              <div className="space-y-2">
                <Label>Invoice Category</Label>
                <Select 
                  value={invoiceCategory || ""} 
                  onValueChange={(v) => setInvoiceCategory(v as "general_maintenance" | "snow")}
                >
                  <SelectTrigger data-testid="select-invoice-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general_maintenance" data-testid="select-category-general">General Maintenance</SelectItem>
                    <SelectItem value="snow" data-testid="select-category-snow">Snow</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines which rates from the customer rate sheet will be displayed
                </p>
              </div>
            )}

            {ticketTypeName === "Invoice" && (
              <div className="space-y-2">
                <Label>Work Completed Date</Label>
                <DatePickerField
                  value={workCompletedDate}
                  onChange={setWorkCompletedDate}
                  placeholder="Select date"
                  data-testid="button-batch-work-completed-date"
                />
                <p className="text-xs text-muted-foreground">
                  The date the work was completed for billing reference
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={assignedToId || ""} onValueChange={setAssignedToId}>
                  <SelectTrigger data-testid="select-batch-assignee">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member, idx) => (
                      <SelectItem 
                        key={member.id} 
                        value={member.id}
                        data-testid={`select-assignee-option-${idx}`}
                      >
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Due Date (optional)</Label>
                <DatePickerField
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="None"
                  data-testid="button-batch-due-date"
                />
              </div>
            </div>
          </div>
        )}

        {step === "customers" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search properties..."
                  className="pl-9"
                  data-testid="input-batch-customer-search"
                />
              </div>
              <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} data-testid="button-clear-all">
                Clear
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedCustomerIds.size} of {selectableCustomers.length} properties selected
            </div>

            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredCustomers.map(customer => (
                  <div
                    key={customer.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate ${
                      selectedCustomerIds.has(customer.id) ? "bg-primary/10" : ""
                    }`}
                    onClick={() => toggleCustomer(customer.id)}
                    data-testid={`customer-row-${customer.id}`}
                  >
                    <Checkbox
                      checked={selectedCustomerIds.has(customer.id)}
                      onCheckedChange={() => toggleCustomer(customer.id)}
                      data-testid={`checkbox-customer-${customer.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{customer.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {customer.city}, {customer.state}
                      </div>
                    </div>
                    {selectedCustomerIds.has(customer.id) && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No properties found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Title:</div>
                <div className="font-medium">{title}</div>
                
                <div className="text-muted-foreground">Assigned to:</div>
                <div className="font-medium">{assigneeName}</div>
                
                <div className="text-muted-foreground">Due Date:</div>
                <div className="font-medium">{dueDate ? format(dueDate, "PPP") : "None"}</div>
                
                <div className="text-muted-foreground">Properties:</div>
                <div className="font-medium">{selectedCustomerIds.size} selected</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Properties to receive tickets:</Label>
              <ScrollArea className="h-[200px] border rounded-md">
                <div className="p-2 space-y-1">
                  {selectedCustomers.map(customer => (
                    <div key={customer.id} className="flex items-center gap-2 p-2 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-muted-foreground">- {customer.city}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
              <p className="text-amber-800 dark:text-amber-200">
                This will create <strong>{selectedCustomerIds.size} {ticketTypeName} ticket{selectedCustomerIds.size > 1 ? "s" : ""}</strong>.
                Duplicates (properties with existing open tickets of the same title) will be skipped.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2">
          {step !== "details" ? (
            <Button variant="outline" onClick={handlePrevStep} disabled={isLoading}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
          )}
          
          <div className="flex gap-2">
            {step === "details" && (
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            )}
            
            {step !== "review" ? (
              <Button onClick={handleNextStep} disabled={isLoading}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isLoading} data-testid="button-batch-create">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Create {selectedCustomerIds.size} Tickets
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
