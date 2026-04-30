import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const insertPropertySchema = z.object({
  name: z.string().min(1),
  street: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zip: z.string().default(""),
  propertyManagerName: z.string().optional(),
  propertyManagerPhone: z.string().optional(),
  propertyManagerEmail: z.string().optional(),
  notes: z.string().optional(),
});

type InsertProperty = z.infer<typeof insertPropertySchema>;
type Property = InsertProperty & { id: string; companyId: string; createdAt: string; updatedAt: string };
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, MapPin, User, Phone, Mail, Building, Trash2, Pencil } from "lucide-react";

export default function PropertiesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const openDialog = (property?: Property) => {
    setSelectedProperty(property || null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setSelectedProperty(null);
    setIsDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("propertiesPage.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("propertiesList.manage")}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openDialog()} data-testid="button-add-property">
              <Plus className="w-4 h-4 mr-2" />
              {t("propertiesPage.addProperty")}
            </Button>
          </DialogTrigger>
          <PropertyDialog 
            property={selectedProperty} 
            onClose={closeDialog}
          />
        </Dialog>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">{t("propertiesPage.noProperties")}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {t("propertiesPage.getStarted")}
            </p>
            <Button onClick={() => openDialog()} data-testid="button-add-first-property">
              <Plus className="w-4 h-4 mr-2" />
              {t("propertiesPage.addProperty")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <PropertyCard 
              key={property.id} 
              property={property} 
              onEdit={() => openDialog(property)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property, onEdit }: { property: Property; onEdit: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/properties/${property.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: t("propertiesPage.deleted") });
    },
    onError: () => {
      toast({ title: "Failed to delete property", variant: "destructive" });
    },
  });

  return (
    <Card className="hover-elevate" data-testid={`card-property-${property.id}`}>
      <CardHeader className="gap-2 space-y-0 pb-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{property.name}</CardTitle>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={onEdit}
              data-testid={`button-edit-property-${property.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-property-${property.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("propertiesPage.deleteProperty")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("propertiesPage.deleteConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid={`button-cancel-delete-property-${property.id}`}>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid={`button-confirm-delete-property-${property.id}`}
                  >
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <div>{property.street}</div>
            <div className="text-muted-foreground">
              {property.city}, {property.state} {property.zip}
            </div>
          </div>
        </div>

        {property.propertyManagerName && (
          <div className="pt-2 border-t space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{t("propertiesPage.propertyManager")}</div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span data-testid={`text-manager-name-${property.id}`}>{property.propertyManagerName}</span>
            </div>
            {property.propertyManagerPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span data-testid={`text-manager-phone-${property.id}`}>{property.propertyManagerPhone}</span>
              </div>
            )}
            {property.propertyManagerEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span data-testid={`text-manager-email-${property.id}`}>{property.propertyManagerEmail}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PropertyDialog({ property, onClose }: { property: Property | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEditing = !!property;

  const form = useForm<InsertProperty>({
    resolver: zodResolver(insertPropertySchema),
    defaultValues: {
      name: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      propertyManagerName: "",
      propertyManagerPhone: "",
      propertyManagerEmail: "",
      notes: "",
    },
  });

  // Reset form when property changes
  useEffect(() => {
    if (property) {
      form.reset({
        ...property,
        propertyManagerName: property.propertyManagerName || "",
        propertyManagerPhone: property.propertyManagerPhone || "",
        propertyManagerEmail: property.propertyManagerEmail || "",
        notes: property.notes || "",
      });
    } else {
      form.reset({
        name: "",
        street: "",
        city: "",
        state: "",
        zip: "",
        propertyManagerName: "",
        propertyManagerPhone: "",
        propertyManagerEmail: "",
        notes: "",
      });
    }
  }, [property, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertProperty) => {
      const response = await apiRequest("POST", "/api/properties", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: t("propertiesPage.created") });
      onClose();
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create property", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertProperty) => {
      const response = await apiRequest("PATCH", `/api/properties/${property!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: t("propertiesPage.updated") });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update property", variant: "destructive" });
    },
  });

  const onSubmit = (data: InsertProperty) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{isEditing ? t("propertiesPage.editProperty") : t("propertiesPage.addProperty")}</DialogTitle>
        <DialogDescription>
          {isEditing ? t("propertiesPage.updateProperty") : t("propertiesPage.createProperty")}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 space-y-6 pr-1">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("propertiesPage.propertyName")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Greenwood HOA" data-testid="input-property-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>{t("common.address")}</FormLabel>
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} placeholder="123 Main Street" data-testid="input-street" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormControl>
                          <Input {...field} placeholder={t("propertiesPage.city")} data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...field} placeholder={t("propertiesPage.state")} data-testid="input-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} placeholder={t("propertiesPage.zipCode")} data-testid="input-zip" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-medium">{t("propertiesPage.propertyManager")}</h3>
              
              <FormField
                control={form.control}
                name="propertyManagerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John Smith" data-testid="input-manager-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="propertyManagerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.phone")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="(555) 123-4567" data-testid="input-manager-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyManagerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.email")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="john@example.com" data-testid="input-manager-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.notes")}</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Additional property information..." 
                      rows={3}
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-property">
              {isPending ? t("common.saving") : isEditing ? t("propertiesPage.updateProperty") : t("propertiesPage.createProperty")}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}
