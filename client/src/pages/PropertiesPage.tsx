import { useState, useEffect } from "react";
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
import { insertPropertySchema, type Property, type Contact, type InsertProperty } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, MapPin, User, Phone, Mail, Building, Trash2, Pencil } from "lucide-react";

export default function PropertiesPage() {
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
        <div className="text-muted-foreground">Loading properties...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your customer properties and contacts
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openDialog()} data-testid="button-add-property">
              <Plus className="w-4 h-4 mr-2" />
              Add Property
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
            <h3 className="text-lg font-medium mb-2">No properties yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Get started by adding your first property
            </p>
            <Button onClick={() => openDialog()} data-testid="button-add-first-property">
              <Plus className="w-4 h-4 mr-2" />
              Add Property
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
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/properties/${property.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Property deleted successfully" });
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
                  <AlertDialogTitle>Delete Property</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{property.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid={`button-cancel-delete-property-${property.id}`}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid={`button-confirm-delete-property-${property.id}`}
                  >
                    Delete
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
            <div className="text-xs font-medium text-muted-foreground">Property Manager</div>
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
      toast({ title: "Property created successfully" });
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
      toast({ title: "Property updated successfully" });
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
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit Property" : "Add Property"}</DialogTitle>
        <DialogDescription>
          {isEditing ? "Update property information and contacts" : "Enter property information and contacts"}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Greenwood HOA" data-testid="input-property-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Address</FormLabel>
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
                          <Input {...field} placeholder="City" data-testid="input-city" />
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
                          <Input {...field} placeholder="State" data-testid="input-state" />
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
                        <Input {...field} placeholder="ZIP Code" data-testid="input-zip" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-medium">Property Manager (Optional)</h3>
              
              <FormField
                control={form.control}
                name="propertyManagerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
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
                      <FormLabel>Phone</FormLabel>
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
                      <FormLabel>Email</FormLabel>
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
                  <FormLabel>Notes</FormLabel>
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

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-property">
              {isPending ? "Saving..." : isEditing ? "Update Property" : "Create Property"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}
