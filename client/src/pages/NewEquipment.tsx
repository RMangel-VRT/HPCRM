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
import type { User } from "@shared/schema";

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
  { value: "not_specified", label: "Not specified" },
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
  fuelType: z.string().optional(),
  notes: z.string().optional(),
  customSpecs: z.record(z.string(), z.string()).optional().nullable(),
});

type EquipmentFormData = z.infer<typeof equipmentFormSchema>;

export default function NewEquipment() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const canRetireOrDelete = user?.activeRole === "admin" || user?.activeRole === "shop_manager";

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
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EquipmentFormData) => {
      const payload = {
        ...data,
        assignedToId: data.assignedToId === "none" ? null : data.assignedToId || null,
        year: data.year || null,
        customSpecs: data.customSpecs || null,
      };
      const res = await apiRequest("POST", "/api/equipment", payload);
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Equipment created successfully" });
      navigate(`/dashboard/equipment/${result.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create equipment", description: error.message, variant: "destructive" });
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Add Equipment</h1>
          <p className="text-muted-foreground">Add a new truck, mower, trailer, or other equipment</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <FormLabel>Name *</FormLabel>
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
                      <FormLabel>Type *</FormLabel>
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
          </div>

          {equipmentType === "specialty" && (
            <Card>
              <CardHeader>
                <CardTitle>Custom Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Add custom specifications for this specialty equipment (e.g., pump capacity, spray width, hopper size).
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
                                placeholder="Name"
                                value={key}
                                onChange={(e) => updateSpecKey(key, e.target.value)}
                                className="flex-1"
                                data-testid={`input-spec-name-${index}`}
                              />
                              <Input
                                placeholder="Value"
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
                            Add Specification
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
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea {...field} rows={4} placeholder="Additional notes about this equipment..." data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button asChild variant="outline" data-testid="button-cancel">
              <Link href="/dashboard/equipment">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-save">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Create Equipment
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
