import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, Save, Edit2, X, CheckCircle, WrenchIcon, XCircle, Loader2 } from "lucide-react";
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
import type { Equipment, User } from "@shared/schema";

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
            <CardHeader>
              <CardTitle>Files & Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">Files tab coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Open Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">Tickets tab coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Service History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">Service history coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
