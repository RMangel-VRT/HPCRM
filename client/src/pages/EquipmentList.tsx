import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Truck, AlertCircle, CheckCircle, WrenchIcon, XCircle, Trash2, ClipboardPlus, Scissors, Package, Hammer, Bike, Settings2, Car } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
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

const newEquipTicketSchema = z.object({
  equipmentId: z.string().min(1, "Select equipment"),
  category: z.enum(["preventative_maintenance", "repair", "inspection", "safety", "breakdown"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  dueDate: z.string().optional(),
});

type NewEquipTicketFormData = z.infer<typeof newEquipTicketSchema>;

function getStatusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case "active":
      return <Badge variant="default" className="bg-green-600 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />{t("equipment.statusLabels.active")}</Badge>;
    case "in_repair":
      return <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-600"><WrenchIcon className="w-3 h-3 mr-1" />{t("equipment.statusLabels.in_repair")}</Badge>;
    case "out_of_service":
      return <Badge variant="default" className="bg-red-600 hover:bg-red-600"><XCircle className="w-3 h-3 mr-1" />{t("equipment.statusLabels.out_of_service")}</Badge>;
    case "retired":
      return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />{t("equipment.statusLabels.retired")}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getEquipmentTypeIcon(equipmentType: string): React.ComponentType<{ className?: string }> {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    truck: Truck,
    mower: Scissors,
    trailer: Package,
    skid_steer: Hammer,
    atv_utv: Bike,
    specialty: Settings2,
    other_vehicle: Car,
  };
  return icons[equipmentType] ?? Truck;
}

export default function EquipmentList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [equipmentToDelete, setEquipmentToDelete] = useState<EquipmentWithTicketCount | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const canEdit = user?.activeRole === "admin" || user?.activeRole === "shop_manager" || user?.activeRole === "office";
  const canDelete = user?.activeRole === "admin" || user?.activeRole === "office" || user?.activeRole === "shop_manager";

  const TICKET_CATEGORIES = [
    { value: "preventative_maintenance", label: t("equipmentTicket.categories.preventative_maintenance") },
    { value: "repair", label: t("equipmentTicket.categories.repair") },
    { value: "inspection", label: t("equipmentTicket.categories.inspection") },
    { value: "safety", label: t("equipmentTicket.categories.safety") },
    { value: "breakdown", label: t("equipmentTicket.categories.breakdown") },
  ];

  const TICKET_PRIORITIES = [
    { value: "low", label: t("priorities.low") },
    { value: "normal", label: t("priorities.normal") },
    { value: "high", label: t("priorities.high") },
    { value: "urgent", label: t("priorities.urgent") },
  ];

  const EQUIPMENT_TYPES = [
    { value: "all", label: t("equipment.allTypes") },
    { value: "truck", label: t("equipment.types.truck") },
    { value: "mower", label: t("equipment.types.mower") },
    { value: "trailer", label: t("equipment.types.trailer") },
    { value: "skid_steer", label: t("equipment.types.skid_steer") },
    { value: "atv_utv", label: t("equipment.types.atv_utv") },
    { value: "specialty", label: t("equipment.types.specialty") },
    { value: "other_vehicle", label: t("equipment.types.other_vehicle") },
  ];

  const STATUS_OPTIONS = [
    { value: "all", label: t("equipment.filterByStatus") },
    { value: "active", label: t("equipment.statusLabels.active") },
    { value: "in_repair", label: t("equipment.statusLabels.in_repair") },
    { value: "out_of_service", label: t("equipment.statusLabels.out_of_service") },
    { value: "retired", label: t("equipment.statusLabels.retired") },
  ];

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
      toast({ title: t("equipment.ticketCreated") });
    },
    onError: (error: Error) => {
      toast({ title: t("equipment.ticketCreateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/equipment/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({
        title: t("common.success"),
        description: t("equipment.deleted"),
      });
      setDeleteDialogOpen(false);
      setEquipmentToDelete(null);
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("equipment.deleteFailed"),
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

  const getEquipmentTypeLabel = (type: string) => {
    const found = EQUIPMENT_TYPES.find(t => t.value === type);
    return found ? found.label : type;
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("equipment.title")}</h1>
          <p className="text-muted-foreground">{t("equipment.manage")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" onClick={() => setNewTicketOpen(true)} data-testid="button-new-equipment-ticket">
              <ClipboardPlus className="w-4 h-4 mr-2" />
              {t("equipment.newTicket")}
            </Button>
          )}
          {canEdit && (
            <Button asChild data-testid="button-add-equipment">
              <Link href="/dashboard/equipment/new">
                <Plus className="w-4 h-4 mr-2" />
                {t("equipment.addEquipment")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("equipment.totalEquipment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("equipment.active")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-stat-active">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("equipment.inRepair")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-stat-repair">{stats.inRepair}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("equipment.openTickets")}</CardTitle>
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
                placeholder={t("equipment.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder={t("equipment.filterByType")} />
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
                <SelectValue placeholder={t("equipment.filterByStatus")} />
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
              <p>{t("equipment.noEquipmentFound")}</p>
              {canEdit && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/dashboard/equipment/new">{t("equipment.addFirstEquipment")}</Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("equipment.makeModel")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("equipment.openTickets")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment?.map((item) => (
                  <TableRow key={item.id} data-testid={`row-equipment-${item.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center" data-testid={`thumb-equipment-${item.id}`}>
                          {item.profilePhotoPath ? (
                            <img
                              src={item.profilePhotoPath}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (() => { const Icon = getEquipmentTypeIcon(item.equipmentType); return <Icon className="w-5 h-5 text-muted-foreground opacity-50" />; })()
                          )}
                        </div>
                        <div>
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
                        </div>
                      </div>
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
                    <TableCell>{getStatusBadge(item.status, t)}</TableCell>
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
                          <Link href={`/dashboard/equipment/${item.id}`}>{t("common.view")}</Link>
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
            <AlertDialogTitle>{t("equipment.deleteEquipment")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("equipment.deleteConfirm", { name: equipmentToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("equipment.newTicket")}</DialogTitle>
          </DialogHeader>
          <Form {...newTicketForm}>
            <form onSubmit={newTicketForm.handleSubmit((data) => createTicketMutation.mutate(data))} className="space-y-4">
              <FormField
                control={newTicketForm.control}
                name="equipmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("equipment.title")} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ticket-equipment">
                          <SelectValue placeholder={t("equipment.title")} />
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
                    <FormLabel>{t("common.title")} *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("equipmentTicket.workPerformedPlaceholder")} data-testid="input-equip-ticket-title" />
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
                      <FormLabel>{t("tickets.ticketType")}</FormLabel>
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
                      <FormLabel>{t("common.priority")}</FormLabel>
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
                    <FormLabel>{t("common.description")} *</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder={t("equipmentTicket.workPerformedPlaceholder")} data-testid="input-equip-ticket-description" />
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
                    <FormLabel>{t("ticketDetail.dueDate")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-equip-ticket-due" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setNewTicketOpen(false)} data-testid="button-cancel-equip-ticket">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createTicketMutation.isPending} data-testid="button-submit-equip-ticket">
                  {createTicketMutation.isPending ? t("common.creating") : t("newTicket.createTicket")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
