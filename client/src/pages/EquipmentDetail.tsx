import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, Save, Edit2, X, CheckCircle, WrenchIcon, XCircle, Loader2, Upload, FileText, Trash2, Download, Image as ImageIcon, Plus, Clock, AlertTriangle, CircleDot } from "lucide-react";
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
      return <Badge variant="outline">Low</Badge>;
    case "normal":
      return <Badge variant="outline">Normal</Badge>;
    case "high":
      return <Badge variant="default" className="bg-orange-600 hover:bg-orange-600">High</Badge>;
    case "urgent":
      return <Badge variant="default" className="bg-red-600 hover:bg-red-600"><AlertTriangle className="w-3 h-3 mr-1" />Urgent</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}

const newTicketFormSchema = z.object({
  category: z.enum(["preventative_maintenance", "repair", "inspection", "safety", "breakdown"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.string().optional(),
});

type NewTicketFormData = z.infer<typeof newTicketFormSchema>;

const EQUIPMENT_TYPES = [
  { value: "truck", label: "Truck" },
  { value: "mower", label: "Mower" },
  { value: "trailer", label: "Trailer" },
  { value: "skid_steer", label: "Skid Steer" },
  { value: "atv_utv", label: "ATV/UTV" },
  { value: "specialty", label: "Specialty Equipment" },
  { value: "other_vehicle", label: "Other Vehicle" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "in_repair", label: "In Repair" },
  { value: "out_of_service", label: "Out of Service" },
  { value: "retired", label: "Retired" },
];

const FUEL_TYPES = [
  { value: "", label: "Not specified" },
  { value: "gasoline", label: "Gasoline" },
  { value: "diesel", label: "Diesel" },
  { value: "propane", label: "Propane" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
];

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
});

type EquipmentFormData = z.infer<typeof equipmentFormSchema>;

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

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "-";
  return format(new Date(date), "MMM d, yyyy");
}

function formatDateForInput(date: string | Date | null | undefined) {
  if (!date) return "";
  return format(new Date(date), "yyyy-MM-dd");
}

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

  const canModify = user?.activeRole === "admin" || user?.activeRole === "shop_manager";

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
      };
      return apiRequest("PATCH", `/api/equipment/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setIsEditing(false);
      toast({ title: "Equipment updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update equipment", description: error.message, variant: "destructive" });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<EquipmentFile | null>(null);

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
      toast({ title: "File uploaded successfully" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({ title: "Failed to upload file", description: error.message, variant: "destructive" });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest("DELETE", `/api/equipment/${id}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id, "files"] });
      setFileToDelete(null);
      toast({ title: "File deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete file", description: error.message, variant: "destructive" });
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

  const newTicketForm = useForm<NewTicketFormData>({
    resolver: zodResolver(newTicketFormSchema),
    defaultValues: {
      category: "repair",
      priority: "normal",
      title: "",
      description: "",
      assignedToId: null,
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
      toast({ title: "Ticket created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create ticket", description: error.message, variant: "destructive" });
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
          <p className="text-muted-foreground">Equipment not found</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/equipment">Back to Equipment</Link>
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
        {canModify && !isEditing && (
          <Button onClick={startEditing} data-testid="button-edit">
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancelEditing} data-testid="button-cancel">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={updateMutation.isPending} data-testid="button-save">
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="files" data-testid="tab-files">Files</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets">Tickets</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">Service History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6 mt-6">
          {isEditing ? (
            <Form {...form}>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
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
                            <FormLabel>Type</FormLabel>
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
                            <FormLabel>Status</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-status">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {STATUS_OPTIONS.map((status) => (
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
                            <FormLabel>Assigned To</FormLabel>
                            <Select value={field.value || "none"} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-assigned">
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
                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location</FormLabel>
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
                      <CardTitle>Make & Model</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="make"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Make</FormLabel>
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
                            <FormLabel>Model</FormLabel>
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
                            <FormLabel>Year</FormLabel>
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
                            <FormLabel>Serial Number / VIN</FormLabel>
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
                            <FormLabel>Fuel Type</FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-fuel">
                                  <SelectValue placeholder="Select fuel type" />
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
                      <CardTitle>Registration & Dates</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="licensePlate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>License Plate</FormLabel>
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
                            <FormLabel>Registration Expiration</FormLabel>
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
                            <FormLabel>Insurance Expiration</FormLabel>
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
                            <FormLabel>Purchase Date</FormLabel>
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
                            <FormLabel>Warranty Expiration</FormLabel>
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
                      <CardTitle>Service Tracking</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="currentMileage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Current Mileage</FormLabel>
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
                            <FormLabel>Service Interval (miles)</FormLabel>
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
                            <FormLabel>Current Hours</FormLabel>
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
                            <FormLabel>Service Interval (hours)</FormLabel>
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
                        <CardTitle>Mower Specifications</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="deckSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Deck Size</FormLabel>
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
                        <CardTitle>Trailer Specifications</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="axleCount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Axle Count</FormLabel>
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
                              <FormLabel>Load Rating</FormLabel>
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
                              <FormLabel>Tire Size</FormLabel>
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
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea {...field} rows={4} placeholder="Additional notes..." data-testid="input-notes" />
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
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{equipment.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span>{getEquipmentTypeLabel(equipment.equipmentType)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    {getStatusBadge(equipment.status)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span>{assignedUser?.name || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{equipment.location || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Make & Model</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Make</span>
                    <span>{equipment.make || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span>{equipment.model || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Year</span>
                    <span>{equipment.year || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Serial / VIN</span>
                    <span className="font-mono text-sm">{equipment.serialNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fuel Type</span>
                    <span className="capitalize">{equipment.fuelType || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Registration & Dates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">License Plate</span>
                    <span className="font-mono">{equipment.licensePlate || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Registration Expires</span>
                    <span>{formatDate(equipment.registrationExpiration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Insurance Expires</span>
                    <span>{formatDate(equipment.insuranceExpiration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Purchase Date</span>
                    <span>{formatDate(equipment.purchaseDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Warranty Expires</span>
                    <span>{formatDate(equipment.warrantyExpiration)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Service Tracking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Mileage</span>
                    <span>{equipment.currentMileage?.toLocaleString() || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Interval</span>
                    <span>{equipment.serviceMileageInterval?.toLocaleString() || "-"} miles</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Hours</span>
                    <span>{equipment.currentHours || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Interval</span>
                    <span>{equipment.serviceHoursInterval || "-"} hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Service</span>
                    <span>{formatDate(equipment.lastServiceDate)}</span>
                  </div>
                </CardContent>
              </Card>

              {equipment.equipmentType === "mower" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Mower Specifications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deck Size</span>
                      <span>{equipment.deckSize || "-"}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {equipment.equipmentType === "trailer" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Trailer Specifications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Axle Count</span>
                      <span>{equipment.axleCount || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Load Rating</span>
                      <span>{equipment.loadRating || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tire Size</span>
                      <span>{equipment.tireSize || "-"}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {equipment.notes && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
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
              <CardTitle>Files & Attachments</CardTitle>
              {canModify && (
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
                    Upload File
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
                  <p>No files attached</p>
                  {canModify && (
                    <p className="text-sm mt-2">Upload photos, manuals, registration documents, or other files</p>
                  )}
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
                        {canModify && (
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
                <AlertDialogTitle>Delete File</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{fileToDelete?.fileName}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => fileToDelete && deleteFileMutation.mutate(fileToDelete.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle>Open Tickets ({openTickets.length})</CardTitle>
              {canModify && (
                <Button onClick={() => setIsNewTicketOpen(true)} data-testid="button-new-ticket">
                  <Plus className="w-4 h-4 mr-2" />
                  New Ticket
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
                  <p>No open tickets</p>
                  {canModify && (
                    <p className="text-sm mt-2">Create a ticket for repairs, maintenance, or inspections</p>
                  )}
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
                                Due: {format(new Date(ticket.dueDate), "MMM d, yyyy")}
                              </span>
                            )}
                            <span>Created: {format(new Date(ticket.createdAt), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-view-ticket-${ticket.id}`}
                        >
                          <Link href={`/dashboard/equipment-tickets/${ticket.id}`}>View</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Equipment Ticket</DialogTitle>
              </DialogHeader>
              <Form {...newTicketForm}>
                <form onSubmit={newTicketForm.handleSubmit((data) => createTicketMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={newTicketForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Brief description of the issue" data-testid="input-ticket-title" />
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
                          <FormLabel>Priority</FormLabel>
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
                        <FormLabel>Description *</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} placeholder="Detailed description of the issue or work needed" data-testid="input-ticket-description" />
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
                          <FormLabel>Assign To</FormLabel>
                          <Select value={field.value || "none"} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-ticket-assigned">
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
                    <FormField
                      control={newTicketForm.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
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
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createTicketMutation.isPending} data-testid="button-create-ticket">
                      {createTicketMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Create Ticket
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
              <CardTitle>Service History ({completedTickets.length})</CardTitle>
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
                  <p>No completed service records</p>
                  <p className="text-sm mt-2">Completed tickets will appear here</p>
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
                              <span>Completed: {format(new Date(ticket.completedAt), "MMM d, yyyy")}</span>
                            )}
                            {ticket.laborTime && (
                              <span>{ticket.laborTime} hrs labor</span>
                            )}
                            {ticket.totalCost && (
                              <span>${(ticket.totalCost / 100).toFixed(2)} total</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          data-testid={`button-view-history-${ticket.id}`}
                        >
                          <Link href={`/dashboard/equipment-tickets/${ticket.id}`}>View</Link>
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
