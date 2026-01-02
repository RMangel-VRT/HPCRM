import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, Save, Loader2, Clock, AlertTriangle, CheckCircle, WrenchIcon, CircleDot, User as UserIcon, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { EquipmentTicket, Equipment, User as UserType } from "@shared/schema";

const TICKET_CATEGORIES = [
  { value: "preventative_maintenance", label: "Preventative Maintenance" },
  { value: "repair", label: "Repair" },
  { value: "inspection", label: "Inspection" },
  { value: "safety", label: "Safety" },
  { value: "breakdown", label: "Breakdown" },
];

const TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const TICKET_STATUSES = [
  { value: "new", label: "New", color: "bg-primary" },
  { value: "diagnosing", label: "Diagnosing", color: "bg-blue-600" },
  { value: "waiting_on_parts", label: "Waiting on Parts", color: "bg-yellow-600" },
  { value: "in_repair", label: "In Repair", color: "bg-orange-600" },
  { value: "completed", label: "Completed", color: "bg-green-600" },
  { value: "closed", label: "Closed", color: "bg-secondary" },
];

function getTicketStatusBadge(status: string) {
  switch (status) {
    case "new":
      return <Badge variant="default"><CircleDot className="w-3 h-3 mr-1" />New</Badge>;
    case "diagnosing":
      return <Badge variant="default" className="bg-blue-600 hover:bg-blue-600"><Clock className="w-3 h-3 mr-1" />Diagnosing</Badge>;
    case "waiting_on_parts":
      return <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-600"><Clock className="w-3 h-3 mr-1" />Waiting on Parts</Badge>;
    case "in_repair":
      return <Badge variant="default" className="bg-orange-600 hover:bg-orange-600"><WrenchIcon className="w-3 h-3 mr-1" />In Repair</Badge>;
    case "completed":
      return <Badge variant="default" className="bg-green-600 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case "closed":
      return <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />Closed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "low":
      return <Badge variant="outline">Low Priority</Badge>;
    case "normal":
      return <Badge variant="outline">Normal Priority</Badge>;
    case "high":
      return <Badge variant="default" className="bg-orange-600 hover:bg-orange-600">High Priority</Badge>;
    case "urgent":
      return <Badge variant="default" className="bg-red-600 hover:bg-red-600"><AlertTriangle className="w-3 h-3 mr-1" />Urgent</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}

const updateTicketSchema = z.object({
  status: z.string(),
  priority: z.string(),
  assignedToId: z.string().nullable().optional(),
  workPerformedNotes: z.string().optional(),
  laborTime: z.number().nullable().optional(),
  partsUsed: z.string().optional(),
  vendorUsed: z.string().optional(),
  totalCost: z.number().nullable().optional(),
});

type UpdateTicketFormData = z.infer<typeof updateTicketSchema>;

export default function EquipmentTicketDetail() {
  const [, params] = useRoute("/dashboard/equipment-tickets/:id");
  const id = params?.id;
  const { toast } = useToast();
  const { user } = useAuth();
  
  const canModify = user && (user.activeRole === "admin" || user.activeRole === "shop_manager");

  const { data: ticket, isLoading } = useQuery<EquipmentTicket>({
    queryKey: ["/api/equipment-tickets", id],
    enabled: !!id,
  });

  const { data: equipment } = useQuery<Equipment>({
    queryKey: ["/api/equipment", ticket?.equipmentId],
    enabled: !!ticket?.equipmentId,
  });

  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<UpdateTicketFormData>({
    resolver: zodResolver(updateTicketSchema),
    defaultValues: {
      status: "",
      priority: "",
      assignedToId: null,
      workPerformedNotes: "",
      laborTime: null,
      partsUsed: "",
      vendorUsed: "",
      totalCost: null,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateTicketFormData) => {
      const payload: Record<string, unknown> = {
        status: data.status,
        priority: data.priority,
        assignedToId: data.assignedToId === "none" || !data.assignedToId ? null : data.assignedToId,
      };
      
      if (data.status === "completed" || data.status === "closed") {
        payload.workPerformedNotes = data.workPerformedNotes || "";
        payload.laborTime = data.laborTime || null;
        payload.partsUsed = data.partsUsed || null;
        payload.vendorUsed = data.vendorUsed || null;
        payload.totalCost = data.totalCost ? Math.round(data.totalCost * 100) : null;
      }
      
      const res = await apiRequest("PATCH", `/api/equipment-tickets/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-tickets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", ticket?.equipmentId, "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", ticket?.equipmentId] });
      toast({ title: "Ticket updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update ticket", description: error.message, variant: "destructive" });
    },
  });

  if (ticket && !form.getValues().status) {
    form.reset({
      status: ticket.status,
      priority: ticket.priority,
      assignedToId: ticket.assignedToId || null,
      workPerformedNotes: ticket.workPerformedNotes || "",
      laborTime: ticket.laborTime || null,
      partsUsed: ticket.partsUsed || "",
      vendorUsed: ticket.vendorUsed || "",
      totalCost: ticket.totalCost ? ticket.totalCost / 100 : null,
    });
  }

  const getCategoryLabel = (category: string) => {
    return TICKET_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const getAssignedUser = () => {
    if (!ticket?.assignedToId || !users) return null;
    return users.find(u => u.id === ticket.assignedToId);
  };

  const onSubmit = (data: UpdateTicketFormData) => {
    if ((data.status === "completed" || data.status === "closed") && !data.workPerformedNotes) {
      toast({ 
        title: "Work notes required", 
        description: "Please provide work performed notes before completing the ticket", 
        variant: "destructive" 
      });
      return;
    }
    updateMutation.mutate(data);
  };

  const watchedStatus = form.watch("status");
  const showCompletionFields = watchedStatus === "completed" || watchedStatus === "closed";
  const isCompleted = ticket?.status === "completed" || ticket?.status === "closed";

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Ticket not found</p>
            <Button variant="ghost" asChild className="mt-4">
              <Link href="/dashboard/equipment">Back to Equipment</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/equipment/${ticket.equipmentId}`} data-testid="link-back-equipment">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-ticket-title">{ticket.title}</h1>
            {getTicketStatusBadge(ticket.status)}
            {getPriorityBadge(ticket.priority)}
          </div>
          <p className="text-muted-foreground">{getCategoryLabel(ticket.category)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                <p data-testid="text-ticket-description">{ticket.description}</p>
              </div>
              
              {equipment && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Equipment</h4>
                  <Link 
                    href={`/dashboard/equipment/${equipment.id}`}
                    className="flex items-center gap-2 text-primary hover:underline"
                    data-testid="link-ticket-equipment"
                  >
                    <Truck className="w-4 h-4" />
                    {equipment.name}
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Created</h4>
                  <p>{format(new Date(ticket.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
                {ticket.dueDate && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Due Date</h4>
                    <p className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {format(new Date(ticket.dueDate), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
              </div>

              {ticket.assignedToId && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Assigned To</h4>
                  <p className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    {getAssignedUser()?.name || "Unknown User"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {isCompleted && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Completion Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ticket.workPerformedNotes && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Work Performed</h4>
                    <p data-testid="text-work-notes">{ticket.workPerformedNotes}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {ticket.laborTime && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Labor Time</h4>
                      <p>{ticket.laborTime} hours</p>
                    </div>
                  )}
                  {ticket.totalCost && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Total Cost</h4>
                      <p>${(ticket.totalCost / 100).toFixed(2)}</p>
                    </div>
                  )}
                  {ticket.partsUsed && (
                    <div className="col-span-2">
                      <h4 className="font-medium text-sm text-muted-foreground mb-1">Parts Used</h4>
                      <p>{ticket.partsUsed}</p>
                    </div>
                  )}
                </div>
                
                {ticket.vendorUsed && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Vendor Used</h4>
                    <p>{ticket.vendorUsed}</p>
                  </div>
                )}
                
                {ticket.completedAt && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Completed On</h4>
                    <p>{format(new Date(ticket.completedAt), "MMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {canModify && (
            <Card>
              <CardHeader>
                <CardTitle>Update Ticket</CardTitle>
                <CardDescription>Change status, priority, or assignment</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-update-status">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TICKET_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-update-priority">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TICKET_PRIORITIES.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assignedToId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned To</FormLabel>
                          <Select value={field.value || "none"} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-update-assigned">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {users?.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {showCompletionFields && (
                      <>
                        <Separator />
                        <div className="space-y-4">
                          <h4 className="font-medium">Completion Details</h4>
                          
                          <FormField
                            control={form.control}
                            name="workPerformedNotes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Work Performed *</FormLabel>
                                <FormControl>
                                  <Textarea 
                                    {...field} 
                                    rows={3} 
                                    placeholder="Describe the work completed"
                                    data-testid="input-work-notes"
                                  />
                                </FormControl>
                                <FormDescription>Required when completing a ticket</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="laborTime"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Labor Hours</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      step="0.5"
                                      placeholder="0"
                                      {...field}
                                      value={field.value || ""}
                                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                      data-testid="input-labor-time"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="totalCost"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Total Cost ($)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      step="0.01"
                                      placeholder="0.00"
                                      {...field}
                                      value={field.value || ""}
                                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                      data-testid="input-total-cost"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="partsUsed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Parts Used</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="List parts used"
                                    data-testid="input-parts-used"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="vendorUsed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Vendor Used</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="Vendor name (if any)"
                                    data-testid="input-vendor-used"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={updateMutation.isPending}
                      data-testid="button-update-ticket"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Update Ticket
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {!canModify && (
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Current Status</h4>
                  {getTicketStatusBadge(ticket.status)}
                </div>
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Priority</h4>
                  {getPriorityBadge(ticket.priority)}
                </div>
                {ticket.assignedToId && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Assigned To</h4>
                    <p>{getAssignedUser()?.name || "Unknown User"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
