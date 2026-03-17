import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, Save, Edit2, X, CheckCircle, WrenchIcon, XCircle, Loader2, Upload, FileText, Trash2, Download, Plus, Clock, AlertTriangle, CircleDot, Truck, Scissors, Package, Hammer, Bike, Settings2, Car } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import type { Equipment, User, EquipmentFile, EquipmentTicket } from "@shared/schema";
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
import { useRef } from "react";

const newTicketFormSchema = z.object({
  category: z.enum(["preventative_maintenance", "repair", "inspection", "safety", "breakdown"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.string().optional(),
});

type NewTicketFormData = z.infer<typeof newTicketFormSchema>;

const equipmentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  equipmentType: z.enum(["truck", "mower", "trailer", "skid_steer", "atv_utv", "specialty", "other_vehicle"]),
  status: z.enum(["active", "in_repair", "out_of_service", "retired"]),
  assignedToId: z.string().nullable().optional(),
  location: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().nullable().optional(),
  serialNumber: z.string().optional(),
  licensePlate: z.string().optional(),
  registrationExpiration: z.string().optional(),
  insuranceExpiration: z.string().optional(),
  purchaseDate: z.string().optional(),
  warrantyExpiration: z.string().optional(),
  currentMileage: z.coerce.number().nullable().optional(),
  serviceMileageInterval: z.coerce.number().nullable().optional(),
  currentHours: z.coerce.number().nullable().optional(),
  serviceHoursInterval: z.coerce.number().nullable().optional(),
  deckSize: z.string().optional(),
  axleCount: z.coerce.number().nullable().optional(),
  loadRating: z.string().optional(),
  tireSize: z.string().optional(),
  fuelType: z.string().optional(),
  notes: z.string().optional(),
  customSpecs: z.record(z.string(), z.string()).optional().nullable(),
});

type EquipmentFormData = z.infer<typeof equipmentFormSchema>;

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "-";
  return format(new Date(date), "MMM d, yyyy");
}

function formatDateForInput(date: string | Date | null | undefined) {
  if (!date) return "";
  return format(new Date(date), "yyyy-MM-dd");
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

export default function EquipmentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

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
    { value: "truck", label: t("equipment.types.truck") },
    { value: "mower", label: t("equipment.types.mower") },
    { value: "trailer", label: t("equipment.types.trailer") },
    { value: "skid_steer", label: t("equipment.types.skid_steer") },
    { value: "atv_utv", label: t("equipment.types.atv_utv") },
    { value: "specialty", label: t("equipment.types.specialty") },
    { value: "other_vehicle", label: t("equipment.types.other_vehicle") },
  ];

  const STATUS_OPTIONS = [
    { value: "active", label: t("equipment.statusLabels.active") },
    { value: "in_repair", label: t("equipment.statusLabels.in_repair") },
    { value: "out_of_service", label: t("equipment.statusLabels.out_of_service") },
    { value: "retired", label: t("equipment.statusLabels.retired") },
  ];

  const FUEL_TYPES = [
    { value: "not_specified", label: t("equipment.fuelTypes.not_specified") },
    { value: "gasoline", label: t("equipment.fuelTypes.gasoline") },
    { value: "diesel", label: t("equipment.fuelTypes.diesel") },
    { value: "propane", label: t("equipment.fuelTypes.propane") },
    { value: "electric", label: t("equipment.fuelTypes.electric") },
    { value: "hybrid", label: t("equipment.fuelTypes.hybrid") },
  ];

  function getTicketStatusBadge(status: string) {
    switch (status) {
      case "new":
        return <Badge variant="default"><CircleDot className="w-3 h-3 mr-1" />{t("equipmentTicket.ticketStatuses.new")}</Badge>;
      case "diagnosing":
        return <Badge variant="default" className="bg-blue-600 hover:bg-blue-600"><Clock className="w-3 h-3 mr-1" />{t("equipmentTicket.ticketStatuses.diagnosing")}</Badge>;
      case "waiting_on_parts":
        return <Badge variant="default" className="bg-yellow-600 hover:bg-yellow-600"><Clock className="w-3 h-3 mr-1" />{t("equipmentTicket.ticketStatuses.waiting_on_parts")}</Badge>;
      case "in_repair":
        return <Badge variant="default" className="bg-orange-600 hover:bg-orange-600"><WrenchIcon className="w-3 h-3 mr-1" />{t("equipmentTicket.ticketStatuses.in_repair")}</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-600 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />{t("equipmentTicket.ticketStatuses.completed")}</Badge>;
      case "closed":
        return <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />{t("equipmentTicket.ticketStatuses.closed")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getPriorityBadge(priority: string) {
    switch (priority) {
      case "low":
        return <Badge variant="outline">{t("priorities.low")}</Badge>;
      case "normal":
        return <Badge variant="outline">{t("priorities.normal")}</Badge>;
      case "high":
        return <Badge variant="default" className="bg-orange-600 hover:bg-orange-600">{t("priorities.high")}</Badge>;
      case "urgent":
        return <Badge variant="default" className="bg-red-600 hover:bg-red-600"><AlertTriangle className="w-3 h-3 mr-1" />{t("priorities.urgent")}</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  }

  function getStatusBadge(status: string) {
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

  function getEquipmentTypeLabel(type: string) {
    const found = EQUIPMENT_TYPES.find(t => t.value === type);
    return found ? found.label : type;
  }

  const canEdit = user?.activeRole === "admin" || user?.activeRole === "shop_manager" || user?.activeRole === "office";
  const canRetireOrDelete = user?.activeRole === "admin" || user?.activeRole === "shop_manager";

  const { data: equipment, isLoading } = useQuery<Equipment>({
    queryKey: ["/api/equipment", id],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: "",
      equipmentType: "truck",
      status: "active",
      assignedToId: null,
      location: "",
      make: "",
      model: "",
      year: null,
      serialNumber: "",
      licensePlate: "",
      registrationExpiration: "",
      insuranceExpiration: "",
      purchaseDate: "",
      warrantyExpiration: "",
      currentMileage: null,
      serviceMileageInterval: null,
      currentHours: null,
      serviceHoursInterval: null,
      deckSize: "",
      axleCount: null,
      loadRating: "",
      tireSize: "",
      fuelType: "",
      notes: "",
      customSpecs: null,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EquipmentFormData) => {
      const payload = {
        ...data,
        assignedToId: data.assignedToId === "none" ? null : data.assignedToId || null,
        registrationExpiration: data.registrationExpiration || null,
        insuranceExpiration: data.insuranceExpiration || null,
        purchaseDate: data.purchaseDate || null,
        warrantyExpiration: data.warrantyExpiration || null,
        year: data.year || null,
        currentMileage: data.currentMileage || null,
        serviceMileageInterval: data.serviceMileageInterval || null,
        currentHours: data.currentHours || null,
        serviceHoursInterval: data.serviceHoursInterval || null,
        axleCount: data.axleCount || null,
        customSpecs: data.customSpecs || null,
      };
      return apiRequest("PATCH", `/api/equipment/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setIsEditing(false);
      toast({ title: t("equipment.updated") });
    },
    onError: (error: Error) => {
      toast({ title: t("equipment.updateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<EquipmentFile | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsPhotoUploading(true);
      const urlRes = await apiRequest("POST", `/api/equipment/${id}/profile-photo-upload-url`);
      const { uploadUrl, storagePath } = await urlRes.json();
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      const saveRes = await apiRequest("PATCH", `/api/equipment/${id}`, { profilePhotoPath: storagePath });
      return saveRes.json();
    },
    onSuccess: () => {
      setIsPhotoUploading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: t("equipment.photoUploaded") });
      if (photoInputRef.current) photoInputRef.current.value = "";
    },
    onError: (error: Error) => {
      setIsPhotoUploading(false);
      toast({ title: t("equipment.uploadFailed"), description: error.message, variant: "destructive" });
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/equipment/${id}`, { profilePhotoPath: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: t("equipment.photoRemoved") });
    },
    onError: (error: Error) => {
      toast({ title: t("equipment.uploadFailed"), description: error.message, variant: "destructive" });
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPhotoMutation.mutate(file);
  };

  const { data: files, isLoading: filesLoading } = useQuery<EquipmentFile[]>({
    queryKey: ["/api/equipment", id, "files"],
    enabled: !!id,
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      const uploadUrlRes = await apiRequest("POST", `/api/equipment/${id}/files/upload-url`);
      const { uploadURL } = await uploadUrlRes.json();
      
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      
      const fileRes = await apiRequest("POST", `/api/equipment/${id}/files`, {
        fileName: file.name,
        fileType: file.type.startsWith("image/") ? "image" : "document",
        fileSize: file.size,
        storagePath: uploadURL,
      });
      return fileRes.json();
    },
    onSuccess: () => {
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id, "files"] });
      toast({ title: t("equipment.fileUploaded") });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({ title: t("equipment.uploadFailed"), description: error.message, variant: "destructive" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("DELETE", `/api/equipment/${id}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id, "files"] });
      setFileToDelete(null);
      toast({ title: t("equipment.fileDeleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("equipment.fileDeleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFileMutation.mutate(file);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === "image") {
      return <ImageIcon className="w-5 h-5 text-blue-500" />;
    }
    return <FileText className="w-5 h-5 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);

  const { data: tickets, isLoading: ticketsLoading } = useQuery<EquipmentTicket[]>({
    queryKey: ["/api/equipment", id, "tickets"],
    enabled: !!id,
  });

  interface LinkedTicket {
    id: string;
    title: string;
    description: string | null;
    workType: string;
    priority: string;
    dueDate: string | null;
    completedAt: string | null;
    createdAt: string;
  }
  const { data: linkedTickets, isLoading: linkedTicketsLoading } = useQuery<LinkedTicket[]>({
    queryKey: ["/api/equipment", id, "linked-tickets"],
    enabled: !!id,
  });

  const openLinkedTickets = linkedTickets?.filter(t => !t.completedAt) || [];
  const completedLinkedTickets = linkedTickets?.filter(t => t.completedAt) || [];

  const newTicketForm = useForm<NewTicketFormData>({
    resolver: zodResolver(newTicketFormSchema),
    defaultValues: {
      category: "repair",
      priority: "normal",
      title: "",
      description: "",
      assignedToId: user?.id || null,
      dueDate: "",
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: NewTicketFormData) => {
      const res = await apiRequest("POST", "/api/equipment-tickets", {
        equipmentId: id,
        category: data.category,
        priority: data.priority,
        title: data.title,
        description: data.description,
        assignedToId: data.assignedToId === "none" || !data.assignedToId ? null : data.assignedToId,
        dueDate: data.dueDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id, "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setIsNewTicketOpen(false);
      newTicketForm.reset();
      toast({ title: t("equipment.ticketCreated") });
    },
    onError: (error: Error) => {
      toast({ title: t("equipment.ticketCreateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const openTickets = tickets?.filter(t => !["completed", "closed"].includes(t.status)) || [];
  const completedTickets = tickets?.filter(t => ["completed", "closed"].includes(t.status)) || [];

  const getCategoryLabel = (category: string) => {
    return TICKET_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const startEditing = () => {
    if (!equipment) return;
    form.reset({
      name: equipment.name,
      equipmentType: equipment.equipmentType as EquipmentFormData["equipmentType"],
      status: equipment.status as EquipmentFormData["status"],
      assignedToId: equipment.assignedToId || "none",
      location: equipment.location || "",
      make: equipment.make || "",
      model: equipment.model || "",
      year: equipment.year || null,
      serialNumber: equipment.serialNumber || "",
      licensePlate: equipment.licensePlate || "",
      registrationExpiration: formatDateForInput(equipment.registrationExpiration),
      insuranceExpiration: formatDateForInput(equipment.insuranceExpiration),
      purchaseDate: formatDateForInput(equipment.purchaseDate),
      warrantyExpiration: formatDateForInput(equipment.warrantyExpiration),
      currentMileage: equipment.currentMileage || null,
      serviceMileageInterval: equipment.serviceMileageInterval || null,
      currentHours: equipment.currentHours || null,
      serviceHoursInterval: equipment.serviceHoursInterval || null,
      deckSize: equipment.deckSize || "",
      axleCount: equipment.axleCount || null,
      loadRating: equipment.loadRating || "",
      tireSize: equipment.tireSize || "",
      fuelType: equipment.fuelType || "",
      notes: equipment.notes || "",
      customSpecs: (equipment as any).customSpecs || null,
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    form.reset();
  };

  const onSubmit = (data: EquipmentFormData) => {
    updateMutation.mutate(data);
  };

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

  if (!equipment) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("equipment.equipmentNotFound")}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/equipment">{t("equipment.backToEquipment")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const assignedUser = users?.find(u => u.id === equipment.assignedToId);

  return (
    <div className="p-6 space-y-6" data-testid="equipment-detail-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" data-testid="button-back">
            <Link href="/dashboard/equipment">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="text-equipment-name">{equipment.name}</h1>
              {getStatusBadge(equipment.status)}
            </div>
            <p className="text-muted-foreground">{getEquipmentTypeLabel(equipment.equipmentType)}</p>
          </div>
        </div>
        {canEdit && !isEditing && (
          <Button onClick={startEditing} data-testid="button-edit">
            <Edit2 className="w-4 h-4 mr-2" />
            {t("common.edit")}
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancelEditing} data-testid="button-cancel">
              <X className="w-4 h-4 mr-2" />
              {t("common.cancel")}
            </Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={updateMutation.isPending} data-testid="button-save">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {t("common.save")}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">{t("common.details")}</TabsTrigger>
          <TabsTrigger value="files" data-testid="tab-files">{t("equipment.files")}</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets">{t("tickets.title")}</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">{t("equipment.serviceHistory")}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6 mt-6">
          {isEditing ? (
            <Form {...form}>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("equipment.basicInfo")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("common.name")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="equipmentType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("common.type")}</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {EQUIPMENT_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("common.status")}</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-status">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {STATUS_OPTIONS.filter((status) => 
                                  status.value !== "retired" || canRetireOrDelete
                                ).map((status) => (
                                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
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
                            <FormLabel>{t("ticketDetail.assignedTo")}</FormLabel>
                            <Select value={field.value || "none"} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-assigned">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">{t("common.unassigned")}</SelectItem>
                                {users?.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("ticketDetail.location")}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Shop, Yard, etc." data-testid="input-location" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>{t("equipment.makeModel")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="make"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.make")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-make" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.model")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-model" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.year")}</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} value={field.value || ""} data-testid="input-year" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="serialNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.serialNumber")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-serial" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="fuelType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.fuelType")}</FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-fuel">
                                  <SelectValue placeholder={t("equipment.fuelType")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {FUEL_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>{t("equipment.registrationInsurance")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="licensePlate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.licensePlate")}</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-plate" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="registrationExpiration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.registrationExpiration")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-reg-exp" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="insuranceExpiration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.insuranceExpiration")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-ins-exp" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="purchaseDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.purchaseDate")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-purchase" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="warrantyExpiration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.warrantyExpiration")}</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-warranty" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>{t("equipment.engineService")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="currentMileage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.currentMileage")}</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} value={field.value || ""} data-testid="input-mileage" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="serviceMileageInterval"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.serviceMileageInterval")}</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} value={field.value || ""} data-testid="input-service-miles" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="currentHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.currentHours")}</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" {...field} value={field.value || ""} data-testid="input-hours" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="serviceHoursInterval"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("equipment.serviceHoursInterval")}</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" {...field} value={field.value || ""} data-testid="input-service-hours" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {(form.watch("equipmentType") === "mower" || equipment.equipmentType === "mower") && (
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("equipment.types.mower")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="deckSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("equipment.deckSize")}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder='e.g., 60"' data-testid="input-deck" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  )}

                  {(form.watch("equipmentType") === "trailer" || equipment.equipmentType === "trailer") && (
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("equipment.types.trailer")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="axleCount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("equipment.axleCount")}</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} value={field.value || ""} data-testid="input-axle" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="loadRating"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("equipment.loadRating")}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g., 7,000 lbs" data-testid="input-load" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tireSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("equipment.tireSize")}</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-tire" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  )}

                  {(form.watch("equipmentType") === "specialty" || equipment.equipmentType === "specialty") && (
                    <Card className="md:col-span-2">
                      <CardHeader>
                        <CardTitle>{t("equipment.types.specialty")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground mb-4">
                          {t("equipment.manage")}
                        </p>
                        <FormField
                          control={form.control}
                          name="customSpecs"
                          render={({ field }) => {
                            const specs = field.value || {};
                            const specEntries = Object.entries(specs);
                            
                            const addSpec = () => {
                              const newKey = `Specification ${specEntries.length + 1}`;
                              field.onChange({ ...specs, [newKey]: "" });
                            };
                            
                            const updateSpecKey = (oldKey: string, newKey: string) => {
                              if (oldKey === newKey) return;
                              const newSpecs = { ...specs };
                              const value = newSpecs[oldKey];
                              delete newSpecs[oldKey];
                              newSpecs[newKey] = value;
                              field.onChange(newSpecs);
                            };
                            
                            const updateSpecValue = (key: string, value: string) => {
                              field.onChange({ ...specs, [key]: value });
                            };
                            
                            const removeSpec = (key: string) => {
                              const newSpecs = { ...specs };
                              delete newSpecs[key];
                              field.onChange(newSpecs);
                            };
                            
                            return (
                              <FormItem>
                                <div className="space-y-3">
                                  {specEntries.map(([key, value], index) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <Input
                                        placeholder={t("common.name")}
                                        value={key}
                                        onChange={(e) => updateSpecKey(key, e.target.value)}
                                        className="flex-1"
                                        data-testid={`input-spec-name-${index}`}
                                      />
                                      <Input
                                        placeholder={t("common.details")}
                                        value={value}
                                        onChange={(e) => updateSpecValue(key, e.target.value)}
                                        className="flex-1"
                                        data-testid={`input-spec-value-${index}`}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeSpec(key)}
                                        data-testid={`button-remove-spec-${index}`}
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={addSpec}
                                    data-testid="button-add-spec"
                                  >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t("common.add")}
                                  </Button>
                                </div>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("common.notes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea {...field} rows={4} placeholder={t("common.notes")} data-testid="input-notes" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </form>
            </Form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Profile Photo Card */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle>{t("equipment.profilePhoto")}</CardTitle>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoChange}
                          data-testid="input-photo-file"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={isPhotoUploading || uploadPhotoMutation.isPending}
                          data-testid="button-upload-photo"
                        >
                          {isPhotoUploading || uploadPhotoMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {equipment.profilePhotoPath ? t("equipment.replacePhoto") : t("equipment.uploadPhoto")}
                        </Button>
                        {equipment.profilePhotoPath && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePhotoMutation.mutate()}
                            disabled={removePhotoMutation.isPending}
                            data-testid="button-remove-photo"
                          >
                            <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                            {t("equipment.removePhoto")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {equipment.profilePhotoPath ? (
                    <div className="flex justify-center">
                      <img
                        src={equipment.profilePhotoPath}
                        alt={equipment.name}
                        className="max-h-64 rounded-md object-contain"
                        data-testid="img-profile-photo"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center h-40 rounded-md border border-dashed text-muted-foreground cursor-pointer"
                      onClick={canEdit ? () => photoInputRef.current?.click() : undefined}
                      data-testid="placeholder-photo"
                    >
                      {(() => { const Icon = getEquipmentTypeIcon(equipment.equipmentType); return <Icon className="w-10 h-10 mb-2 opacity-40" />; })()}
                      <p className="text-sm">{canEdit ? t("equipment.clickToUploadPhoto") : t("equipment.noPhoto")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("equipment.basicInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common.name")}</span>
                    <span className="font-medium">{equipment.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common.type")}</span>
                    <span>{getEquipmentTypeLabel(equipment.equipmentType)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common.status")}</span>
                    {getStatusBadge(equipment.status)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("ticketDetail.assignedTo")}</span>
                    <span>{assignedUser?.name || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("ticketDetail.location")}</span>
                    <span>{equipment.location || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("equipment.makeModel")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.make")}</span>
                    <span>{equipment.make || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.model")}</span>
                    <span>{equipment.model || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.year")}</span>
                    <span>{equipment.year || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.serialNumber")}</span>
                    <span className="font-mono text-sm">{equipment.serialNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.fuelType")}</span>
                    <span className="capitalize">{equipment.fuelType || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("equipment.registrationInsurance")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.licensePlate")}</span>
                    <span className="font-mono">{equipment.licensePlate || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.registrationExpiration")}</span>
                    <span>{formatDate(equipment.registrationExpiration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.insuranceExpiration")}</span>
                    <span>{formatDate(equipment.insuranceExpiration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.purchaseDate")}</span>
                    <span>{formatDate(equipment.purchaseDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.warrantyExpiration")}</span>
                    <span>{formatDate(equipment.warrantyExpiration)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("equipment.engineService")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.currentMileage")}</span>
                    <span>{equipment.currentMileage?.toLocaleString() || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.serviceMileageInterval")}</span>
                    <span>{equipment.serviceMileageInterval?.toLocaleString() || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.currentHours")}</span>
                    <span>{equipment.currentHours || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.serviceHoursInterval")}</span>
                    <span>{equipment.serviceHoursInterval || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("equipment.serviceHistory")}</span>
                    <span>{formatDate(equipment.lastServiceDate)}</span>
                  </div>
                </CardContent>
              </Card>

              {equipment.equipmentType === "mower" && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("equipment.types.mower")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("equipment.deckSize")}</span>
                      <span>{equipment.deckSize || "-"}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {equipment.equipmentType === "trailer" && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("equipment.types.trailer")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("equipment.axleCount")}</span>
                      <span>{equipment.axleCount || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("equipment.loadRating")}</span>
                      <span>{equipment.loadRating || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("equipment.tireSize")}</span>
                      <span>{equipment.tireSize || "-"}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {equipment.equipmentType === "specialty" && (equipment as any).customSpecs && Object.keys((equipment as any).customSpecs).length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>{t("equipment.types.specialty")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries((equipment as any).customSpecs).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}</span>
                        <span>{value as string || "-"}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {equipment.notes && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>{t("common.notes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{equipment.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>{t("equipment.files")}</CardTitle>
              {canEdit && (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    data-testid="input-file-upload"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-upload-file"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    {t("common.upload")}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {filesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : files?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t("equipment.noFilesUploaded")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files?.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                      data-testid={`row-file-${file.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.fileType)}
                        <div>
                          <p className="font-medium">{file.fileName}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.fileSize)} • {format(new Date(file.createdAt), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.storagePath && (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            data-testid={`button-download-${file.id}`}
                          >
                            <a href={file.storagePath} target="_blank" rel="noopener noreferrer">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setFileToDelete(file)}
                            data-testid={`button-delete-file-${file.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("equipment.deleteFile")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("equipment.deleteConfirm", { name: fileToDelete?.fileName })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => fileToDelete && deleteFileMutation.mutate(fileToDelete.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>{t("equipment.openTickets")} ({openTickets.length})</CardTitle>
              {canEdit && (
                <Button onClick={() => setIsNewTicketOpen(true)} data-testid="button-new-ticket">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("equipment.newTicket")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : openTickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <WrenchIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t("equipment.noOpenTickets")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {openTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`row-ticket-${ticket.id}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{ticket.title}</span>
                            {getTicketStatusBadge(ticket.status)}
                            {getPriorityBadge(ticket.priority)}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{getCategoryLabel(ticket.category)}</span>
                            {ticket.dueDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {t("ticketDetail.dueDate")}: {format(new Date(ticket.dueDate), "MMM d, yyyy")}
                              </span>
                            )}
                            <span>{t("common.date")}: {format(new Date(ticket.createdAt), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-view-ticket-${ticket.id}`}
                        >
                          <Link href={`/dashboard/equipment-tickets/${ticket.id}`}>{t("common.view")}</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(openLinkedTickets.length > 0 || completedLinkedTickets.length > 0) && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">
                  {t("workTypes.shop_todo")} ({openLinkedTickets.length} {t("statuses.open").toLowerCase()})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {linkedTicketsLoading ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {openLinkedTickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="p-4 rounded-lg border bg-card hover-elevate"
                        data-testid={`row-linked-ticket-${ticket.id}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{ticket.title}</span>
                              <Badge variant="outline" className="bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                                {t("workTypes.shop_todo")}
                              </Badge>
                              {getPriorityBadge(ticket.priority)}
                            </div>
                            {ticket.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              {ticket.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {t("ticketDetail.dueDate")}: {format(new Date(ticket.dueDate), "MMM d, yyyy")}
                                </span>
                              )}
                              <span>{t("common.date")}: {format(new Date(ticket.createdAt), "MMM d, yyyy")}</span>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            data-testid={`button-view-linked-ticket-${ticket.id}`}
                          >
                            <Link href={`/dashboard/tickets/${ticket.id}`}>{t("common.view")}</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                    {completedLinkedTickets.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">{t("statuses.completed")} ({completedLinkedTickets.length})</p>
                        <div className="space-y-2 opacity-60">
                          {completedLinkedTickets.slice(0, 5).map((ticket) => (
                            <div
                              key={ticket.id}
                              className="p-3 rounded-lg border bg-card"
                              data-testid={`row-linked-completed-${ticket.id}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                  <span className="text-sm">{ticket.title}</span>
                                </div>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/dashboard/tickets/${ticket.id}`}>{t("common.view")}</Link>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("equipment.newTicket")}</DialogTitle>
              </DialogHeader>
              <Form {...newTicketForm}>
                <form onSubmit={newTicketForm.handleSubmit((data) => createTicketMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={newTicketForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("common.title")} *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={t("equipmentTicket.workPerformedPlaceholder")} data-testid="input-ticket-title" />
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
                              <SelectTrigger data-testid="select-ticket-category">
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
                              <SelectTrigger data-testid="select-ticket-priority">
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
                          <Textarea {...field} rows={3} placeholder={t("equipmentTicket.workPerformedPlaceholder")} data-testid="input-ticket-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={newTicketForm.control}
                      name="assignedToId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("ticketDetail.assignedTo")}</FormLabel>
                          <Select value={field.value || "none"} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-ticket-assigned">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">{t("common.unassigned")}</SelectItem>
                              {users?.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                            <Input type="date" {...field} data-testid="input-ticket-due" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsNewTicketOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" disabled={createTicketMutation.isPending} data-testid="button-create-ticket">
                      {createTicketMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {t("newTicket.createTicket")}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("equipment.serviceHistory")} ({completedTickets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : completedTickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t("equipment.noCompletedTickets")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="p-4 rounded-lg border bg-card"
                      data-testid={`row-history-${ticket.id}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{ticket.title}</span>
                            {getTicketStatusBadge(ticket.status)}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {ticket.workPerformedNotes || ticket.description}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{getCategoryLabel(ticket.category)}</span>
                            {ticket.completedAt && (
                              <span>{t("statuses.completed")}: {format(new Date(ticket.completedAt), "MMM d, yyyy")}</span>
                            )}
                            {ticket.laborTime && (
                              <span>{ticket.laborTime} {t("equipmentTicket.hours")}</span>
                            )}
                            {ticket.totalCost && (
                              <span>${(ticket.totalCost / 100).toFixed(2)} {t("common.total").toLowerCase()}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          data-testid={`button-view-history-${ticket.id}`}
                        >
                          <Link href={`/dashboard/equipment-tickets/${ticket.id}`}>{t("common.view")}</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
