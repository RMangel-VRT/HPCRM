import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Search, 
  MapPin, 
  Check,
  Loader2,
  FileCheck,
  Receipt,
  FolderKanban,
  Briefcase,
  Calculator,
  Navigation,
  X,
  Building2,
  Plus,
  Pencil,
  Camera,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Customer, TicketType, CompanyUser, User, WorkType } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const WORK_TYPE_ICONS: Record<WorkType, typeof FileCheck> = {
  contract: FileCheck,
  extra_work: Receipt,
  project: FolderKanban,
  admin: Briefcase,
  estimate_request: Calculator,
};

function LocationMarker({ 
  position, 
  onPositionChange 
}: { 
  position: [number, number] | null;
  onPositionChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return position ? <Marker position={position} /> : null;
}

function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 16);
  }, [center, map]);
  return null;
}

export default function NewTicket() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<"workType" | "customer" | "details">("workType");
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [isGeocodingLoading, setIsGeocodingLoading] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  
  const [photos, setPhotos] = useState<{ path: string; previewUrl: string }[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const { data: ticketTypes = [] } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  interface CompanyUserWithDetails {
    companyUser: CompanyUser;
    user: User;
    isSuperAdmin: boolean;
  }

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

  const teamMembers = useMemo(() => {
    return companyUsersData
      .filter(item => item.companyUser.role === "admin" || item.companyUser.role === "office" || item.companyUser.role === "field_manager")
      .map(item => ({
        id: item.companyUser.userId,
        name: item.user?.name || item.user?.email || item.companyUser.userId,
        role: item.companyUser.role,
      }));
  }, [companyUsersData]);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.street?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.city?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedWorkTypeConfig = selectedWorkType ? WORK_TYPE_CATALOG[selectedWorkType] : null;

  const getTicketTypeForWorkType = (workType: WorkType): string | null => {
    const activeTypes = ticketTypes.filter(t => t.isActive === "true");
    
    if (workType === "project") {
      const projectType = activeTypes.find(t => t.category === "project" || t.name.toLowerCase().includes("project"));
      return projectType?.id || activeTypes[0]?.id || null;
    }
    
    const quickTaskType = activeTypes.find(t => 
      t.category === "quick_task" || 
      t.name.toLowerCase().includes("quick") ||
      t.name.toLowerCase().includes("task") ||
      t.name.toLowerCase().includes("maintenance")
    );
    return quickTaskType?.id || activeTypes[0]?.id || null;
  };

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const ticketTypeId = getTicketTypeForWorkType(selectedWorkType!);
      if (!ticketTypeId) {
        throw new Error("No ticket type available");
      }
      
      const billingBehavior = WORK_TYPE_CATALOG[selectedWorkType!].billingBehavior;
      
      return apiRequest("POST", "/api/tickets", {
        ticketTypeId,
        customerId: selectedCustomerId,
        workType: selectedWorkType,
        billingBehavior,
        title,
        description: description || null,
        priority,
        assignedToId: assignedToId,
        dueDate: dueDate ? new Date(dueDate) : null,
        locationLat: locationLat,
        locationLng: locationLng,
        locationLabel: locationLabel || null,
        locationDescription: locationDescription || null,
        photos: photos.length > 0 ? photos.map(p => p.path) : null,
      });
    },
    onSuccess: async (res) => {
      const ticket = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket created successfully" });
      navigate(`/dashboard/tickets/${ticket.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create ticket", description: error.message, variant: "destructive" });
    },
  });

  const handleSelectWorkType = (workType: WorkType) => {
    setSelectedWorkType(workType);
    setStep("customer");
  };

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setShowCustomerDialog(false);
    setStep("details");
  };

  const handleUsePropertyAddress = async () => {
    if (!selectedCustomer) return;
    
    const address = [
      selectedCustomer.street,
      selectedCustomer.city,
      selectedCustomer.state,
      selectedCustomer.zip
    ].filter(Boolean).join(", ");

    if (!address) {
      toast({ title: "No address available for this customer", variant: "destructive" });
      return;
    }

    setIsGeocodingLoading(true);
    try {
      const response = await fetch(
        `/api/geocode?address=${encodeURIComponent(address)}`,
        { credentials: "include" }
      );
      
      if (response.ok) {
        const data = await response.json();
        setLocationLat(data.lat);
        setLocationLng(data.lng);
        setMapCenter([data.lat, data.lng]);
        setLocationLabel(selectedCustomer.name);
        toast({ title: "Location set to property address" });
      } else if (response.status === 404) {
        toast({ title: "Could not find coordinates for this address", variant: "destructive" });
      } else {
        toast({ title: "Geocoding service error", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to geocode address", variant: "destructive" });
    } finally {
      setIsGeocodingLoading(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLocationLat(lat);
        setLocationLng(lng);
        setMapCenter([lat, lng]);
        setLocationLabel("Current Location");
        toast({ title: "Location set to your current position" });
      },
      (error) => {
        toast({ title: "Could not get your location", description: error.message, variant: "destructive" });
      }
    );
  };

  const handleMapClick = (lat: number, lng: number) => {
    setLocationLat(lat);
    setLocationLng(lng);
  };

  const handleClearLocation = () => {
    setLocationLat(null);
    setLocationLng(null);
    setLocationLabel("");
    setLocationDescription("");
  };

  const handleSaveLocation = () => {
    setShowLocationDialog(false);
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "Only images are allowed", variant: "destructive" });
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast({ title: "Image must be under 10MB", variant: "destructive" });
          continue;
        }

        const uploadUrlResponse = await apiRequest("POST", "/api/tickets/photo-upload-url");
        const { uploadURL } = await uploadUrlResponse.json();

        const uploadResponse = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload photo");
        }

        const url = new URL(uploadURL);
        const path = url.pathname;

        const previewUrl = URL.createObjectURL(file);
        setPhotos((prev) => [...prev, { path, previewUrl }]);
        toast({ title: "Photo added" });
      }
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setIsUploadingPhoto(false);
      event.target.value = "";
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].previewUrl);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }
    
    createTicketMutation.mutate();
  };

  const canSubmit = selectedWorkType && selectedCustomerId && title.trim() && assignedToId;
  const hasLocation = locationLat !== null && locationLng !== null;

  const workTypeOptions: WorkType[] = ["contract", "extra_work", "project", "admin", "estimate_request"];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          New Ticket
        </h1>
      </div>

      {step === "workType" && (
        <div className="space-y-4">
          <p className="text-muted-foreground">What type of work is this?</p>
          
          <div className="grid gap-3">
            {workTypeOptions.map((type) => {
              const config = WORK_TYPE_CATALOG[type];
              const Icon = WORK_TYPE_ICONS[type];
              
              return (
                <Card 
                  key={type}
                  className="hover-elevate active-elevate-2 cursor-pointer"
                  onClick={() => handleSelectWorkType(type)}
                  data-testid={`card-worktype-${type}`}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${config.color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{config.name}</h3>
                        <Badge variant={config.badgeVariant} className="text-xs">
                          {config.billingLabel}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {config.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {step === "customer" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span 
              className="hover:text-foreground cursor-pointer"
              onClick={() => setStep("workType")}
            >
              {selectedWorkTypeConfig?.name}
            </span>
            <span>/</span>
            <span>Select Customer</span>
          </div>
          
          <Card 
            className="hover-elevate cursor-pointer"
            onClick={() => setShowCustomerDialog(true)}
            data-testid="card-select-customer"
          >
            <CardContent className="p-4 flex items-center gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {selectedCustomer ? selectedCustomer.name : "Select a customer..."}
              </span>
            </CardContent>
          </Card>

          <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
            <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Select Customer</DialogTitle>
              </DialogHeader>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-customer-search"
                />
              </div>
              
              <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2 min-h-[200px] max-h-[400px]">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No customers found
                  </p>
                ) : (
                  filteredCustomers.map((customer) => (
                    <Card 
                      key={customer.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() => handleSelectCustomer(customer.id)}
                      data-testid={`customer-option-${customer.id}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{customer.name}</p>
                          {customer.city && (
                            <p className="text-xs text-muted-foreground truncate">
                              {customer.city}{customer.state ? `, ${customer.state}` : ""}
                            </p>
                          )}
                        </div>
                        {selectedCustomerId === customer.id && (
                          <Check className="w-5 h-5 text-primary shrink-0" />
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {step === "details" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <span 
              className="hover:text-foreground cursor-pointer"
              onClick={() => setStep("workType")}
            >
              {selectedWorkTypeConfig?.name}
            </span>
            <span>/</span>
            <span 
              className="hover:text-foreground cursor-pointer"
              onClick={() => setStep("customer")}
            >
              {selectedCustomer?.name}
            </span>
            <span>/</span>
            <span>Details</span>
          </div>

          {selectedWorkTypeConfig && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Badge variant={selectedWorkTypeConfig.badgeVariant}>
                {selectedWorkTypeConfig.billingLabel}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {selectedWorkTypeConfig.billingBehavior === "invoice_required" 
                  ? "This work will require an invoice" 
                  : selectedWorkTypeConfig.billingBehavior === "internal"
                  ? "Internal work - not invoiced"
                  : "Covered by existing contract"}
              </span>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description of the work"
                className="h-11"
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add any additional details..."
                rows={3}
                data-testid="input-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Location (optional)</Label>
              {hasLocation ? (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm truncate">
                        {locationLabel || `${locationLat!.toFixed(4)}, ${locationLng!.toFixed(4)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLocationDialog(true)}
                        data-testid="button-edit-location"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearLocation}
                        data-testid="button-clear-location"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {locationDescription && (
                    <p className="text-xs text-muted-foreground pl-6">{locationDescription}</p>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 h-11"
                  onClick={() => setShowLocationDialog(true)}
                  data-testid="button-add-location"
                >
                  <Plus className="w-4 h-4" />
                  Add Location
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Photos (optional)</Label>
              <div className="space-y-3">
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group aspect-square">
                        <img
                          src={photo.previewUrl}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemovePhoto(index)}
                          data-testid={`button-remove-photo-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    id="photo-capture"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={isUploadingPhoto}
                  />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    id="photo-gallery"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={isUploadingPhoto}
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 h-11"
                    onClick={() => document.getElementById("photo-capture")?.click()}
                    disabled={isUploadingPhoto}
                    data-testid="button-take-photo"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    Take Photo
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 h-11"
                    onClick={() => document.getElementById("photo-gallery")?.click()}
                    disabled={isUploadingPhoto}
                    data-testid="button-choose-photo"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ImageIcon className="w-4 h-4" />
                    )}
                    Choose Photo
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority" data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10"
                  data-testid="input-due-date"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assign To <span className="text-destructive">*</span></Label>
              <Select 
                value={assignedToId || ""} 
                onValueChange={(v) => setAssignedToId(v)}
              >
                <SelectTrigger id="assignedTo" data-testid="select-assigned-to">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} ({member.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!assignedToId && (
                <p className="text-xs text-muted-foreground">
                  All tickets must be assigned to a team member
                </p>
              )}
            </div>
          </div>

          <div className="pt-4">
            <Button 
              type="submit" 
              className="w-full h-12"
              disabled={!canSubmit || createTicketMutation.isPending}
              data-testid="button-create-ticket"
            >
              {createTicketMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Create Ticket"
              )}
            </Button>
          </div>
        </form>
      )}

      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Set Location</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Tap on the map or use one of the options below.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUsePropertyAddress}
                disabled={isGeocodingLoading}
                data-testid="button-use-property-address"
              >
                {isGeocodingLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Building2 className="w-4 h-4 mr-2" />
                )}
                {isGeocodingLoading ? "Finding..." : "Use Property Address"}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleGetCurrentLocation}
                data-testid="button-current-location"
              >
                <Navigation className="w-4 h-4 mr-2" />
                My Location
              </Button>
              {hasLocation && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleClearLocation}
                  data-testid="button-dialog-clear-location"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>

            <div className="rounded-lg overflow-hidden border h-[200px] md:h-[250px]">
              <MapContainer
                center={mapCenter}
                zoom={4}
                style={{ height: "100%", width: "100%" }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker
                  position={hasLocation ? [locationLat!, locationLng!] : null}
                  onPositionChange={handleMapClick}
                />
                {hasLocation && (
                  <MapCenterUpdater center={[locationLat!, locationLng!]} />
                )}
              </MapContainer>
            </div>

            {hasLocation && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    {locationLat!.toFixed(6)}, {locationLng!.toFixed(6)}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="locationLabel" className="text-xs">Location Name (optional)</Label>
                  <Input
                    id="locationLabel"
                    placeholder="e.g., Near the pool, Back gate entrance..."
                    value={locationLabel}
                    onChange={(e) => setLocationLabel(e.target.value)}
                    className="h-9"
                    data-testid="input-location-label"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="locationDescription" className="text-xs">Additional Notes (optional)</Label>
                  <Textarea
                    id="locationDescription"
                    placeholder="Any specific instructions to find this spot..."
                    value={locationDescription}
                    onChange={(e) => setLocationDescription(e.target.value)}
                    rows={2}
                    data-testid="input-location-description"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setShowLocationDialog(false)}
              data-testid="button-cancel-location"
            >
              Cancel
            </Button>
            <Button 
              className="flex-1"
              onClick={handleSaveLocation}
              disabled={isGeocodingLoading}
              data-testid="button-save-location"
            >
              {isGeocodingLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : hasLocation ? (
                "Save Location"
              ) : (
                "Skip Location"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
