import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Save, Loader2, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import type { User } from "@shared/schema";

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
  fuelType: z.string().optional(),
  notes: z.string().optional(),
  customSpecs: z.record(z.string(), z.string()).optional().nullable(),
  currentMileage: z.coerce.number().nullable().optional(),
  currentHours: z.coerce.number().nullable().optional(),
  deckSize: z.string().optional(),
  axleCount: z.coerce.number().nullable().optional(),
  loadRating: z.string().optional(),
  tireSize: z.string().optional(),
  registrationExpiration: z.string().optional(),
  insuranceExpiration: z.string().optional(),
});

type EquipmentFormData = z.infer<typeof equipmentFormSchema>;

export default function NewEquipment() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const canRetireOrDelete = user?.activeRole === "admin" || user?.activeRole === "shop_manager";

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
      fuelType: "not_specified",
      notes: "",
      customSpecs: null,
      currentMileage: null,
      currentHours: null,
      deckSize: "",
      axleCount: null,
      loadRating: "",
      tireSize: "",
      registrationExpiration: "",
      insuranceExpiration: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EquipmentFormData) => {
      const payload = {
        ...data,
        assignedToId: data.assignedToId === "none" ? null : data.assignedToId || null,
        year: data.year ?? null,
        customSpecs: data.customSpecs || null,
        currentMileage: data.currentMileage ?? null,
        currentHours: data.currentHours ?? null,
        deckSize: data.deckSize || null,
        axleCount: data.axleCount ?? null,
        loadRating: data.loadRating || null,
        tireSize: data.tireSize || null,
        registrationExpiration: data.registrationExpiration || null,
        insuranceExpiration: data.insuranceExpiration || null,
      };
      const res = await apiRequest("POST", "/api/equipment", payload);
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: t("equipment.created") });
      navigate(`/dashboard/equipment/${result.id}`);
    },
    onError: (error: Error) => {
      toast({ title: t("equipment.createFailed"), description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: EquipmentFormData) => {
    createMutation.mutate(data);
  };

  const equipmentType = form.watch("equipmentType");

  return (
    <div className="p-6 space-y-6" data-testid="new-equipment-page">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon" data-testid="button-back">
          <Link href="/dashboard/equipment">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("equipment.addEquipment")}</h1>
          <p className="text-muted-foreground">{t("equipment.manage")}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <FormLabel>{t("common.name")} *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder='e.g., "Truck 12", "Wright Stand-On #3"' data-testid="input-name" />
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
                      <FormLabel>{t("common.type")} *</FormLabel>
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
                        <Input {...field} placeholder="Manufacturer/brand" data-testid="input-make" />
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
          </div>

          {(equipmentType === "truck" || equipmentType === "other_vehicle") && (
            <Card>
              <CardHeader>
                <CardTitle>{equipmentType === "truck" ? t("equipment.types.truck") : t("equipment.types.other_vehicle")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="currentMileage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("equipment.currentMileage")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value || ""} placeholder="e.g., 45000" data-testid="input-mileage" />
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
              </CardContent>
            </Card>
          )}

          {equipmentType === "mower" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("equipment.types.mower")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <FormField
                  control={form.control}
                  name="currentHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("equipment.currentHours")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} value={field.value || ""} placeholder="e.g., 1250" data-testid="input-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {equipmentType === "trailer" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("equipment.types.trailer")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="axleCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("equipment.axleCount")}</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value || ""} placeholder="e.g., 2" data-testid="input-axle" />
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
                        <Input {...field} placeholder="e.g., 205/75R15" data-testid="input-tire" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {(equipmentType === "skid_steer" || equipmentType === "atv_utv") && (
            <Card>
              <CardHeader>
                <CardTitle>{equipmentType === "skid_steer" ? t("equipment.types.skid_steer") : t("equipment.types.atv_utv")}</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="currentHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("equipment.currentHours")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} value={field.value || ""} placeholder="e.g., 500" data-testid="input-hours" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {equipmentType === "specialty" && (
            <Card>
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

          <div className="flex justify-end gap-4">
            <Button asChild variant="outline" data-testid="button-cancel">
              <Link href="/dashboard/equipment">{t("common.cancel")}</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-save">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {t("common.create")} {t("equipment.title")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
