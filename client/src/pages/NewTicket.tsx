import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Search, 
  MapPin, 
  Check,
  Loader2,
  ClipboardList,
  Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Customer, TicketType, CompanyUser, User } from "@shared/schema";

export default function NewTicket() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<"type" | "customer" | "details">("type");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  const { data: ticketTypes = [], isLoading: typesLoading } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: companyUsers = [] } = useQuery<CompanyUser[]>({
    queryKey: ["/api/company-users"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: companyUsers.length > 0,
  });

  const teamMembers = useMemo(() => {
    return companyUsers
      .filter(cu => cu.role === "admin" || cu.role === "office" || cu.role === "ops")
      .map(cu => {
        const user = users.find(u => u.id === cu.userId);
        return {
          id: cu.userId,
          name: user?.name || user?.email || cu.userId,
          role: cu.role,
        };
      });
  }, [companyUsers, users]);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.street?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.city?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedType = ticketTypes.find(t => t.id === selectedTypeId);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/tickets", {
        ticketTypeId: selectedTypeId,
        customerId: selectedCustomerId,
        title,
        description: description || null,
        priority,
        assignedToId: assignedToId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      });
    },
    onSuccess: async (res) => {
      const ticket = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket created successfully" });
      navigate(`/dashboard/tickets/${ticket.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create ticket", description: error.message, variant: "destructive" });
    },
  });

  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    setStep("customer");
  };

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setShowCustomerDialog(false);
    setStep("details");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }
    
    createTicketMutation.mutate();
  };

  const canSubmit = selectedTypeId && selectedCustomerId && title.trim();

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          New Ticket
        </h1>
      </div>

      {step === "type" && (
        <div className="space-y-4">
          <p className="text-muted-foreground">Select a ticket type to get started</p>
          
          {typesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : ticketTypes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No ticket types configured</h3>
                <p className="text-sm text-muted-foreground">
                  Contact your administrator to set up ticket types.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {ticketTypes.filter(t => t.isActive === "true").map((type) => (
                <Card 
                  key={type.id}
                  className="hover-elevate active-elevate-2 cursor-pointer"
                  onClick={() => handleSelectType(type.id)}
                  data-testid={`card-type-${type.id}`}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${type.color}20` }}
                    >
                      <ClipboardList className="w-5 h-5" style={{ color: type.color || undefined }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{type.name}</h3>
                      {type.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{type.description}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "customer" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span 
              className="hover:text-foreground cursor-pointer"
              onClick={() => setStep("type")}
            >
              {selectedType?.name}
            </span>
            <span>/</span>
            <span>Select Customer</span>
          </div>
          
          <Card 
            className="hover-elevate cursor-pointer"
            onClick={() => setShowCustomerDialog(true)}
            data-testid="card-select-customer"
          >
            <CardContent className="p-4 flex items-center gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {selectedCustomer ? selectedCustomer.name : "Select a customer..."}
              </span>
            </CardContent>
          </Card>

          <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
            <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Select Customer</DialogTitle>
              </DialogHeader>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-customer-search"
                />
              </div>
              
              <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2 min-h-[200px] max-h-[400px]">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No customers found
                  </p>
                ) : (
                  filteredCustomers.map((customer) => (
                    <Card 
                      key={customer.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() => handleSelectCustomer(customer.id)}
                      data-testid={`customer-option-${customer.id}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{customer.name}</p>
                          {customer.city && (
                            <p className="text-xs text-muted-foreground truncate">
                              {customer.city}{customer.state ? `, ${customer.state}` : ""}
                            </p>
                          )}
                        </div>
                        {selectedCustomerId === customer.id && (
                          <Check className="w-5 h-5 text-primary shrink-0" />
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {step === "details" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <span 
              className="hover:text-foreground cursor-pointer"
              onClick={() => setStep("type")}
            >
              {selectedType?.name}
            </span>
            <span>/</span>
            <span 
              className="hover:text-foreground cursor-pointer"
              onClick={() => setStep("customer")}
            >
              {selectedCustomer?.name}
            </span>
            <span>/</span>
            <span>Details</span>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description of the work"
                className="h-11"
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add any additional details..."
                rows={3}
                data-testid="input-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority" data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10"
                  data-testid="input-due-date"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assign To</Label>
              <Select 
                value={assignedToId || "unassigned"} 
                onValueChange={(v) => setAssignedToId(v === "unassigned" ? null : v)}
              >
                <SelectTrigger id="assignedTo" data-testid="select-assigned-to">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4">
            <Button 
              type="submit" 
              className="w-full h-12"
              disabled={!canSubmit || createTicketMutation.isPending}
              data-testid="button-create-ticket"
            >
              {createTicketMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Create Ticket"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
