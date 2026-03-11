import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CheckSquare, Plus, Loader2, CalendarIcon } from "lucide-react";
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

interface InitTodoResponse {
  success: boolean;
  typeId: string;
  statuses: Record<string, string>;
  internalCustomerId: string;
}

interface QuickAddToDoProps {
  variant?: "ghost" | "outline" | "default";
}

export default function QuickAddToDo({ variant = "ghost" }: QuickAddToDoProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const [cachedTodoTypeId, setCachedTodoTypeId] = useState<string | null>(null);
  const [cachedOpenStatusId, setCachedOpenStatusId] = useState<string | null>(null);
  const [cachedInternalCustomerId, setCachedInternalCustomerId] = useState<string | null>(null);

  const { data: ticketTypes = [], refetch: refetchTicketTypes } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const todoType = ticketTypes.find(tt => tt.name === "To-Do");
  const internalCustomer = customers.find(c => c.name === "Internal Tasks");

  const { data: todoStatuses = [], refetch: refetchStatuses } = useQuery<TicketTypeStatus[]>({
    queryKey: ["/api/ticket-types", todoType?.id || cachedTodoTypeId, "statuses"],
    enabled: !!(todoType?.id || cachedTodoTypeId),
  });

  const initTodoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ticket-types/init-todo");
      return res.json() as Promise<InitTodoResponse>;
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description: string | null;
      ticketTypeId: string;
      currentStatusId: string;
      customerId: string;
      assignedToId: string;
      dueDate: string | null;
      priority: string;
      workType: string;
    }) => {
      return apiRequest("POST", "/api/tickets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "To-Do created" });
      resetAndClose();
    },
    onError: () => {
      toast({ title: "Failed to create To-Do", variant: "destructive" });
    },
  });

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
      name: item.user?.name || item.user?.email || item.companyUser.userId,
      role: item.companyUser.role,
    }));

  const resetAndClose = () => {
    setTitle("");
    setDescription("");
    setAssignedToId(null);
    setDueDate(undefined);
    setOpen(false);
  };

  const handleOpen = async () => {
    setIsInitializing(true);
    try {
      // Always call init-todo to ensure To-Do type and Internal Tasks customer exist
      // This is idempotent - it only creates them if they don't exist
      const result = await initTodoMutation.mutateAsync();
      setCachedTodoTypeId(result.typeId);
      setCachedOpenStatusId(result.statuses["Open"]);
      setCachedInternalCustomerId(result.internalCustomerId);
      
      if (!todoType) {
        await queryClient.invalidateQueries({ queryKey: ["/api/ticket-types"] });
        await refetchTicketTypes();
      }
      if (!internalCustomer) {
        await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      }
      if (todoStatuses.length === 0) {
        await refetchStatuses();
      }
      setOpen(true);
    } catch (error) {
      toast({ title: "Failed to initialize To-Do", variant: "destructive" });
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }

    const typeId = todoType?.id || cachedTodoTypeId;
    if (!typeId) {
      toast({ title: "To-Do type not initialized. Please try again.", variant: "destructive" });
      return;
    }

    const openStatus = todoStatuses.find(s => s.name === "Open");
    const statusId = openStatus?.id || cachedOpenStatusId;
    
    if (!statusId) {
      toast({ title: "To-Do statuses not found. Please try again.", variant: "destructive" });
      return;
    }

    // Auto-assign to current user if no assignee selected
    const finalAssignedToId = assignedToId || user?.id || null;
    
    if (!finalAssignedToId) {
      toast({ title: "Unable to determine assignee. Please select one.", variant: "destructive" });
      return;
    }

    // Get internal customer ID
    const customerId = internalCustomer?.id || cachedInternalCustomerId;
    if (!customerId) {
      toast({ title: "Internal Tasks customer not found. Please try again.", variant: "destructive" });
      return;
    }

    await createTicketMutation.mutateAsync({
      title: title.trim(),
      description: description.trim() || null,
      ticketTypeId: typeId,
      currentStatusId: statusId,
      customerId: customerId,
      assignedToId: finalAssignedToId,
      dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      priority: "normal",
      workType: "admin",
    });
  };

  const isLoading = isInitializing || createTicketMutation.isPending;

  return (
    <>
      <Button
        variant={variant}
        size={variant === "ghost" ? "icon" : "default"}
        onClick={handleOpen}
        disabled={isInitializing}
        data-testid="button-quick-add-todo"
        title="Quick Add To-Do"
        className={variant !== "ghost" ? "gap-2" : ""}
      >
        {isInitializing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckSquare className="h-5 w-5" />
        )}
        {variant !== "ghost" && <span className="hidden sm:inline">To-Do</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Quick Add To-Do
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="todo-title">What needs to be done?</Label>
              <Input
                id="todo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Call John about proposal"
                data-testid="input-todo-title"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-description">Notes (optional)</Label>
              <Textarea
                id="todo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any additional details..."
                data-testid="input-todo-description"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select
                  value={assignedToId || "unassigned"}
                  onValueChange={(v) => setAssignedToId(v === "unassigned" ? null : v)}
                >
                  <SelectTrigger data-testid="select-todo-assignee">
                    <SelectValue placeholder="Unassigned" />
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

              <div className="space-y-2">
                <Label>Due date</Label>
                <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-todo-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "MMM d, yyyy") : "None"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(date) => {
                        setDueDate(date);
                        setDueDateOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isLoading || !title.trim()}
              data-testid="button-create-todo"
            >
              {createTicketMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add To-Do
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
