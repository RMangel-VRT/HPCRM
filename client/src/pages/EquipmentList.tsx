import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Truck, AlertCircle, CheckCircle, WrenchIcon, XCircle, Trash2, ClipboardPlus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { EquipmentWithTicketCount } from "@shared/schema";

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

const newEquipTicketSchema = z.object({
  equipmentId: z.string().min(1, "Select equipment"),
  category: z.enum(["preventative_maintenance", "repair", "inspection", "safety", "breakdown"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  dueDate: z.string().optional(),
});

type NewEquipTicketFormData = z.infer<typeof newEquipTicketSchema>;

const EQUIPMENT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "truck", label: "Truck" },
  { value: "mower", label: "Mower" },
  { value: "trailer", label: "Trailer" },
  { value: "skid_steer", label: "Skid Steer" },
  { value: "atv_utv", label: "ATV/UTV" },
  { value: "specialty", label: "Specialty Equipment" },
  { value: "other_vehicle", label: "Other Vehicle" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "in_repair", label: "In Repair" },
  { value: "out_of_service", label: "Out of Service" },
  { value: "retired", label: "Retired" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="default" className="bg-green-600 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
    case "in_repair":
      return <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-600"><WrenchIcon className="w-3 h-3 mr-1" />In Repair</Badge>;
    case "out_of_service":
      return <Badge variant="default" className="bg-red-600 hover:bg-red-600"><XCircle className="w-3 h-3 mr-1" />Out of Service</Badge>;
    case "retired":
      return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Retired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getEquipmentTypeLabel(type: string) {
  const found = EQUIPMENT_TYPES.find(t => t.value === type);
  return found ? found.label : type;
}

export default function EquipmentList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<EquipmentWithTicketCount | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const canEdit = user?.activeRole === "admin" || user?.activeRole === "shop_manager" || user?.activeRole === "office";
  const canDelete = user?.activeRole === "admin" || user?.activeRole === "shop_manager";

  const { data: equipment, isLoading } = useQuery<EquipmentWithTicketCount[]>({
    queryKey: ["/api/equipment"],
  });

  const newTicketForm = useForm<NewEquipTicketFormData>({
    resolver: zodResolver(newEquipTicketSchema),
    defaultValues: {
      equipmentId: "",
      category: "repair",
      priority: "normal",
      title: "",
      description: "",
      dueDate: "",
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: NewEquipTicketFormData) => {
      const res = await apiRequest("POST", "/api/equipment-tickets", {
        equipmentId: data.equipmentId,
        category: data.category,
        priority: data.priority,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-tickets"] });
      setNewTicketOpen(false);
      newTicketForm.reset();
      toast({ title: "Equipment ticket created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create ticket", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/equipment/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({
        title: "Success",
        description: "Equipment deleted successfully",
      });
      setDeleteDialogOpen(false);
      setEquipmentToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete equipment",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (item: EquipmentWithTicketCount) => {
    setEquipmentToDelete(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (equipmentToDelete) {
      deleteMutation.mutate(equipmentToDelete.id);
    }
  };

  const filteredEquipment = equipment?.filter((item) => {
    const matchesSearch =
      searchTerm === "" ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.licensePlate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === "all" || item.equipmentType === typeFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = {
    total: equipment?.length || 0,
    active: equipment?.filter(e => e.status === "active").length || 0,
    inRepair: equipment?.filter(e => e.status === "in_repair").length || 0,
    openTickets: equipment?.reduce((sum, e) => sum + e.openTicketCount, 0) || 0,
  };

  return (
    <div className="p-6 space-y-6" data-testid="equipment-list-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Equipment</h1>
          <p className="text-muted-foreground">Manage trucks, mowers, trailers, and other equipment</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" onClick={() => setNewTicketOpen(true)} data-testid="button-new-equipment-ticket">
              <ClipboardPlus className="w-4 h-4 mr-2" />
              New Ticket
            </Button>
          )}
          {canEdit && (
            <Button asChild data-testid="button-add-equipment">
              <Link href="/dashboard/equipment/new">
                <Plus className="w-4 h-4 mr-2" />
                Add Equipment
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-stat-active">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Repair</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-stat-repair">{stats.inRepair}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-stat-tickets">{stats.openTickets}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search equipment..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEquipment?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No equipment found</p>
              {canEdit && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/dashboard/equipment/new">Add your first equipment</Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Make/Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Open Tickets</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment?.map((item) => (
                  <TableRow key={item.id} data-testid={`row-equipment-${item.id}`}>
                    <TableCell>
                      <Link
                        href={`/dashboard/equipment/${item.id}`}
                        className="font-medium hover:underline"
                        data-testid={`link-equipment-${item.id}`}
                      >
                        {item.name}
                      </Link>
                      {item.licensePlate && (
                        <div className="text-sm text-muted-foreground">{item.licensePlate}</div>
                      )}
                    </TableCell>
                    <TableCell>{getEquipmentTypeLabel(item.equipmentType)}</TableCell>
                    <TableCell>
                      {item.make || item.model ? (
                        <>
                          {item.make} {item.model}
                          {item.year && <span className="text-muted-foreground ml-1">({item.year})</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      {item.openTicketCount > 0 ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {item.openTicketCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm" data-testid={`button-view-${item.id}`}>
                          <Link href={`/dashboard/equipment/${item.id}`}>View</Link>
                        </Button>
                        {canDelete && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteClick(item)}
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{equipmentToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Equipment Ticket</DialogTitle>
          </DialogHeader>
          <Form {...newTicketForm}>
            <form onSubmit={newTicketForm.handleSubmit((data) => createTicketMutation.mutate(data))} className="space-y-4">
              <FormField
                control={newTicketForm.control}
                name="equipmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipment *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ticket-equipment">
                          <SelectValue placeholder="Select equipment" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {equipment?.filter(e => e.status !== "retired").map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} {e.make || e.model ? `(${[e.make, e.model].filter(Boolean).join(" ")})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newTicketForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Brief description of the issue" data-testid="input-equip-ticket-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={newTicketForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-equip-ticket-category">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TICKET_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={newTicketForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-equip-ticket-priority">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TICKET_PRIORITIES.map((pri) => (
                            <SelectItem key={pri.value} value={pri.value}>{pri.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={newTicketForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Detailed description of the issue or work needed" data-testid="input-equip-ticket-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newTicketForm.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-equip-ticket-due" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setNewTicketOpen(false)} data-testid="button-cancel-equip-ticket">
                  Cancel
                </Button>
                <Button type="submit" disabled={createTicketMutation.isPending} data-testid="button-submit-equip-ticket">
                  {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
