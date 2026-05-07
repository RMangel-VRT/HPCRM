import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ContractService, InsertContractService } from "@shared/schema";
import { insertContractServiceSchema } from "@shared/schema";
import { SERVICE_CATALOG, MONTH_ABBREV, type ServiceType } from "../../../shared/serviceCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";

interface ContractServicesProps {
  contractId: string;
  canEdit: boolean;
}

export default function ContractServices({ contractId, canEdit }: ContractServicesProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ContractService | null>(null);
  const { toast } = useToast();

  const { data: services = [], isLoading } = useQuery<ContractService[]>({
    queryKey: ["/api/contracts", contractId, "services"],
  });

  const form = useForm<Omit<InsertContractService, "contractId" | "companyId">>({
    resolver: zodResolver(insertContractServiceSchema.omit({ contractId: true, companyId: true })),
    defaultValues: {
      serviceType: "mowing",
      annualCount: 26,
      monthlyDistribution: [0, 0, 0, 2, 4, 4, 4, 4, 4, 2, 0, 0],
      serviceParameters: {},
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<InsertContractService, "contractId" | "companyId">) => {
      return apiRequest("POST", `/api/contracts/${contractId}/services`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "services"] });
      toast({
        title: "Success",
        description: "Service added successfully",
      });
      setIsAddDialogOpen(false);
      setEditingService(null);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add service",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertContractService> }) => {
      return apiRequest("PATCH", `/api/contracts/${contractId}/services/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "services"] });
      toast({
        title: "Success",
        description: "Service updated successfully",
      });
      setIsAddDialogOpen(false);
      setEditingService(null);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update service",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/contracts/${contractId}/services/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "services"] });
      toast({
        title: "Success",
        description: "Service removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove service",
        variant: "destructive",
      });
    },
  });

  const handleServiceTypeChange = (type: ServiceType) => {
    const catalog = SERVICE_CATALOG[type];
    form.setValue("serviceType", type);
    form.setValue("annualCount", catalog.defaultAnnualCount);
    form.setValue("monthlyDistribution", [...catalog.defaultMonthlyDistribution]);
    form.setValue("serviceParameters", {});
  };

  const handleEdit = (service: ContractService) => {
    setEditingService(service);
    form.reset({
      serviceType: service.serviceType,
      annualCount: service.annualCount,
      monthlyDistribution: [...service.monthlyDistribution],
      serviceParameters: service.serviceParameters || {},
      notes: service.notes || "",
    });
    setIsAddDialogOpen(true);
  };

  const handleSubmit = (data: Omit<InsertContractService, "contractId" | "companyId">) => {
    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const selectedServiceType = form.watch("serviceType");
  const selectedCatalog = SERVICE_CATALOG[selectedServiceType as ServiceType];
  
  const formValues = form.watch();
  
  useEffect(() => {
    const monthlyDistribution = formValues.monthlyDistribution;
    if (monthlyDistribution && Array.isArray(monthlyDistribution) && monthlyDistribution.length === 12) {
      const sum = monthlyDistribution.reduce((total, count) => {
        const value = typeof count === 'number' ? count : parseInt(count as any) || 0;
        return total + value;
      }, 0);
      const currentAnnualCount = formValues.annualCount;
      if (currentAnnualCount !== sum) {
        form.setValue("annualCount", sum, { shouldValidate: false, shouldDirty: false });
      }
    }
  }, [formValues]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Services Included</p>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => {
              setEditingService(null);
              const defaultCatalog = SERVICE_CATALOG.mowing;
              form.reset({
                serviceType: "mowing",
                annualCount: defaultCatalog.defaultAnnualCount,
                monthlyDistribution: [...defaultCatalog.defaultMonthlyDistribution],
                serviceParameters: {},
                notes: "",
              });
              setIsAddDialogOpen(true);
            }}
            data-testid="button-add-service"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Service
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : services.length === 0 ? (
        <div className="text-center py-6 border rounded-md bg-muted/30">
          <p className="text-sm text-muted-foreground">No services included yet</p>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add First Service
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((service) => {
            const catalog = SERVICE_CATALOG[service.serviceType as ServiceType];
            return (
              <div key={service.id} className="border rounded-md p-3" data-testid={`service-${service.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{catalog.name}</p>
                    <p className="text-xs text-muted-foreground">{service.annualCount} visits/year</p>
                    {service.serviceParameters && Object.keys(service.serviceParameters).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1 space-x-2">
                        {service.serviceParameters.organic !== undefined && (
                          <span>• {service.serviceParameters.organic ? "Organic" : "Non-organic"}</span>
                        )}
                        {service.serviceParameters.stationCount !== undefined && (
                          <span>• {service.serviceParameters.stationCount} stations</span>
                        )}
                        {service.serviceParameters.visitsPerWeek !== undefined && (
                          <span>• {service.serviceParameters.visitsPerWeek}x/week</span>
                        )}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(service)}
                        data-testid={`button-edit-service-${service.id}`}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(service.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-service-${service.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              Configure which service is included in this contract and how often it occurs.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              <FormField
                control={form.control}
                name="serviceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Type</FormLabel>
                    <Select
                      onValueChange={handleServiceTypeChange}
                      value={field.value}
                      disabled={!!editingService}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-service-type">
                          <SelectValue placeholder="Select a service" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(SERVICE_CATALOG).map((service) => (
                          <SelectItem key={service.type} value={service.type}>
                            {service.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedCatalog.description && (
                <p className="text-sm text-muted-foreground">{selectedCatalog.description}</p>
              )}

              <FormField
                control={form.control}
                name="annualCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Visit Count (Auto-calculated)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        disabled
                        className="bg-muted"
                        data-testid="input-annual-count"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      This is automatically calculated from the monthly distribution
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Label>Monthly Distribution</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Specify how many visits occur in each month
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {MONTH_ABBREV.map((month, index) => (
                    <FormField
                      key={index}
                      control={form.control}
                      name={`monthlyDistribution.${index}` as any}
                      render={({ field }) => (
                        <FormItem>
                          <Label className="text-xs">{month}</Label>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              className="text-sm"
                              data-testid={`input-month-${index + 1}`}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>

              {selectedCatalog.parameters?.hasOrganic && (
                <FormField
                  control={form.control}
                  name="serviceParameters.organic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-organic"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Organic Products</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}

              {selectedCatalog.parameters?.hasStationCount && (
                <FormField
                  control={form.control}
                  name="serviceParameters.stationCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Stations</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          data-testid="input-station-count"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedCatalog.parameters?.hasVisitsPerWeek && (
                <FormField
                  control={form.control}
                  name="serviceParameters.visitsPerWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visits Per Week</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          data-testid="input-visits-per-week"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any special instructions or notes..."
                        {...field}
                        value={field.value || ""}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              </div>
              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingService
                    ? "Update Service"
                    : "Add Service"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
