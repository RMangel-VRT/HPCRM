import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useTranslation } from "react-i18next";
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
  DialogFooter,
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
  Upload,
  FilePlus,
  UserPlus,
  FileText,
  Wrench,
  FolderCheck,
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
  shop_todo: Wrench,
  rfp_request: Calculator,
  invoice: Receipt,
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
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Check for pre-selected customer from URL query param
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = urlParams.get("customerId");
  
  const [step, setStep] = useState<"workType" | "customer" | "details">("workType");
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(preselectedCustomerId);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  
  // RFP Request specific state
  const [isRFPRequest, setIsRFPRequest] = useState(false);
  // Invoice specific state
  const [isInvoice, setIsInvoice] = useState(false);
  // Project (No Estimate) specific state
  const [isProjectNoEstimate, setIsProjectNoEstimate] = useState(false);
  const [showCreateProspectDialog, setShowCreateProspectDialog] = useState(false);
  const [newProspectName, setNewProspectName] = useState("");
  const [newProspectContactName, setNewProspectContactName] = useState("");
  const [newProspectContactEmail, setNewProspectContactEmail] = useState("");
  const [newProspectContactPhone, setNewProspectContactPhone] = useState("");
  const [serviceRequestType, setServiceRequestType] = useState<string>("");
  
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
  const [workCompletedDate, setWorkCompletedDate] = useState("");
  const [invoiceCategory, setInvoiceCategory] = useState<"general_maintenance" | "snow" | null>(null);
  
  const [photos, setPhotos] = useState<{ path: string; previewUrl: string }[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  const [documents, setDocuments] = useState<{ path: string; fileName: string }[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  
  // Shop to-do specific state
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);

  const { data: ticketTypes = [] } = useQuery<TicketType[]>({
    queryKey: ["/api/ticket-types"],
  });
  
  // Equipment query for shop_todo tickets
  interface EquipmentItem {
    id: string;
    name: string;
    type: string;
    status: string;
  }
  const { data: equipmentList = [] } = useQuery<EquipmentItem[]>({
    queryKey: ["/api/equipment"],
    enabled: selectedWorkType === "shop_todo",
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  useSetBreadcrumbs([
    { label: t('tickets.title'), href: "/dashboard/tickets" },
    { label: t('newTicket.title') },
  ], []);

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
      .filter(item => item.companyUser.role === "admin" || item.companyUser.role === "office" || item.companyUser.role === "field_manager" || item.companyUser.role === "chemical_manager" || item.companyUser.role === "irrigation_manager" || item.companyUser.role === "shop_manager")
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
  
  // Check if preselected customer is valid (exists in loaded customers list)
  const isPreselectedCustomerValid = preselectedCustomerId && customers.length > 0 && customers.some(c => c.id === preselectedCustomerId);

  const getTicketTypeForWorkType = (workType: WorkType): string | null => {
    const activeTypes = ticketTypes.filter(t => t.isActive === "true");
    
    // For RFP Request, find the specific RFP Request ticket type
    if (isRFPRequest) {
      const rfpType = activeTypes.find(t => t.name === "RFP Request");
      return rfpType?.id || null;
    }
    
    // For Invoice, find the Invoice ticket type
    if (isInvoice) {
      const invoiceType = activeTypes.find(t => t.name === "Invoice");
      return invoiceType?.id || null;
    }
    
    if (workType === "project" || workType === "estimate_request") {
      // Project (No Estimate) uses its own dedicated ticket type
      if (isProjectNoEstimate) {
        const pneType = activeTypes.find(t => t.name === "Project (No Estimate)");
        return pneType?.id || null;
      }
      const projectType = activeTypes.find(t => t.name === "Project") 
        || activeTypes.find(t => t.category === "project" && t.name !== "Project (No Estimate)");
      return projectType?.id || activeTypes[0]?.id || null;
    }
    
    // Extra Billable gets its own dedicated ticket type
    if (workType === "extra_work") {
      const ebType = activeTypes.find(t => t.name === "Extra Billable");
      return ebType?.id || null;
    }
    
    // For admin, contract, shop_todo - look for simple task-based ticket type (To-Do)
    const eligibleTypes = activeTypes.filter(t => 
      t.name !== "Invoice" && 
      t.name !== "RFP Request" &&
      t.name !== "Extra Billable"
    );
    
    const quickTaskType = eligibleTypes.find(t => 
      t.category === "quick_task" || 
      t.name.toLowerCase().includes("quick") ||
      t.name.toLowerCase().includes("task") ||
      t.name.toLowerCase().includes("maintenance")
    );
    
    return quickTaskType?.id || eligibleTypes.find(t => t.name === "Project")?.id || eligibleTypes[0]?.id || null;
  };
  
  // Initialize RFP Request ticket type if needed
  const initRFPMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ticket-types/init-rfp", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ticket-types"] });
    },
  });
  
  // Initialize Invoice ticket type if needed
  const initInvoiceMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ticket-types/init-invoice", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ticket-types"] });
    },
  });
  
  // Initialize Project ticket type if needed
  const initProjectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ticket-types/init-project", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ticket-types"] });
    },
  });
  
  // Create prospect customer mutation
  const createProspectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/customers", {
        name: newProspectName,
        status: "prospect",
        street: "",
        city: "",
        state: "",
        zip: "",
      });
    },
    onSuccess: async (res) => {
      const customer = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      
      // Create contact if provided
      if (newProspectContactName || newProspectContactEmail || newProspectContactPhone) {
        try {
          await apiRequest("POST", `/api/customers/${customer.id}/contacts`, {
            name: newProspectContactName || "Primary Contact",
            email: newProspectContactEmail || null,
            phone: newProspectContactPhone || null,
            title: "Primary Contact",
            isPrimary: "true",
          });
        } catch (e) {
          console.error("Failed to create contact:", e);
        }
      }
      
      setShowCreateProspectDialog(false);
      setNewProspectName("");
      setNewProspectContactName("");
      setNewProspectContactEmail("");
      setNewProspectContactPhone("");
      handleSelectCustomer(customer.id);
      toast({ title: t('newTicket.prospectCreated') });
    },
    onError: (error: Error) => {
      toast({ title: t('newTicket.createFailed'), description: error.message, variant: "destructive" });
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const ticketTypeId = getTicketTypeForWorkType(selectedWorkType!);
      if (!ticketTypeId) {
        throw new Error("No ticket type available");
      }
      
      const billingBehavior = WORK_TYPE_CATALOG[selectedWorkType!].billingBehavior;
      
      // For RFP Request, use auto-generated title
      const ticketTitle = isRFPRequest 
        ? `Request for Proposal - ${selectedCustomer?.name}` 
        : title;
      
      return apiRequest("POST", "/api/tickets", {
        ticketTypeId,
        customerId: selectedCustomerId,
        workType: selectedWorkType,
        billingBehavior,
        title: ticketTitle,
        description: description || null,
        priority,
        assignedToId: assignedToId,
        dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
        locationLat: locationLat,
        locationLng: locationLng,
        locationLabel: locationLabel || null,
        locationDescription: locationDescription || null,
        photos: !isRFPRequest && photos.length > 0 ? photos.map(p => p.path) : null,
        documents: selectedWorkType === "estimate_request" && documents.length > 0 ? documents.map(d => d.path) : null,
        documentNames: selectedWorkType === "estimate_request" && documents.length > 0 ? documents.map(d => d.fileName) : null,
        // Invoice-specific fields
        workCompletedDate: isInvoice && workCompletedDate ? new Date(workCompletedDate + "T12:00:00") : null,
        invoiceCategory: isInvoice ? invoiceCategory : null,
        // RFP-specific fields to be saved after ticket creation
        initialFieldValues: isRFPRequest ? {
          service_request_type: serviceRequestType,
        } : undefined,
        // Shop to-do specific - equipment link
        equipmentId: selectedWorkType === "shop_todo" ? selectedEquipmentId : null,
      });
    },
    onSuccess: async (res) => {
      const ticket = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: t('newTicket.ticketCreated') });
      navigate(`/dashboard/tickets/${ticket.id}`);
    },
    onError: (error: Error) => {
      toast({ title: t('newTicket.createFailed'), description: error.message, variant: "destructive" });
    },
  });

  const handleSelectProjectNoEstimate = async () => {
    setSelectedWorkType("project");
    setIsProjectNoEstimate(true);
    setIsRFPRequest(false);
    setIsInvoice(false);
    setStep(isPreselectedCustomerValid ? "details" : "customer");
  };

  const handleSelectWorkType = async (workType: WorkType) => {
    // Initialize Project ticket type if needed for project or estimate_request
    if (workType === "project" || workType === "estimate_request") {
      const projectType = ticketTypes.find(t => t.name === "Project");
      if (!projectType) {
        await initProjectMutation.mutateAsync();
      }
    }
    setSelectedWorkType(workType);
    setIsRFPRequest(false);
    setIsInvoice(false);
    setIsProjectNoEstimate(false);
    // Shop to-do tickets don't require a customer - go directly to details
    if (workType === "shop_todo") {
      setStep("details");
    } else {
      // Skip to details if customer is pre-selected and valid
      setStep(isPreselectedCustomerValid ? "details" : "customer");
    }
  };
  
  const handleSelectRFPRequest = async () => {
    // Initialize RFP Request ticket type if not exists
    const rfpType = ticketTypes.find(t => t.name === "RFP Request");
    if (!rfpType) {
      await initRFPMutation.mutateAsync();
    }
    setSelectedWorkType("admin"); // RFP Request uses admin work type (non-billable)
    setIsRFPRequest(true);
    setIsInvoice(false);
    setIsProjectNoEstimate(false);
    // Skip to details if customer is pre-selected and valid
    setStep(isPreselectedCustomerValid ? "details" : "customer");
  };
  
  const handleSelectInvoice = async () => {
    // Initialize Invoice ticket type if not exists
    const invoiceType = ticketTypes.find(t => t.name === "Invoice");
    if (!invoiceType) {
      await initInvoiceMutation.mutateAsync();
    }
    setSelectedWorkType("extra_work"); // Invoice uses extra_work type for billing
    setIsInvoice(true);
    setIsRFPRequest(false);
    setIsProjectNoEstimate(false);
    // Skip to details if customer is pre-selected and valid
    setStep(isPreselectedCustomerValid ? "details" : "customer");
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
      toast({ title: t('newTicket.usePropertyAddress'), variant: "destructive" });
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
        toast({ title: t('newTicket.locationSet') });
      } else if (response.status === 404) {
        toast({ title: t('newTicket.locationSet'), variant: "destructive" });
      } else {
        toast({ title: t('newTicket.createFailed'), variant: "destructive" });
      }
    } catch (error) {
      toast({ title: t('newTicket.createFailed'), variant: "destructive" });
    } finally {
      setIsGeocodingLoading(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: t('newTicket.getCurrentLocation'), variant: "destructive" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLocationLat(lat);
        setLocationLng(lng);
        setMapCenter([lat, lng]);
        setLocationLabel(t('newTicket.getCurrentLocation'));
        toast({ title: t('newTicket.locationSet') });
      },
      (error) => {
        toast({ title: t('newTicket.getCurrentLocation'), description: error.message, variant: "destructive" });
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

  const uploadFiles = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return;

    setIsUploadingPhoto(true);

    try {
      for (const file of fileList) {
        if (!file.type.startsWith("image/")) {
          toast({ title: t('newTicket.photoAdded'), variant: "destructive" });
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast({ title: t('newTicket.photoAdded'), variant: "destructive" });
          continue;
        }

        const uploadUrlResponse = await apiRequest("POST", "/api/tickets/photo-upload-url");
        const { uploadURL, objectPath } = await uploadUrlResponse.json();

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

        const previewUrl = URL.createObjectURL(file);
        setPhotos((prev) => [...prev, { path: objectPath, previewUrl }]);
        toast({ title: t('newTicket.photoAdded') });
      }
    } catch (error) {
      console.error("Photo upload error:", error);
      toast({ title: t('newTicket.createFailed'), variant: "destructive" });
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [toast, t]);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    event.target.value = "";
  };

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropzoneRef.current && !dropzoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  }, [uploadFiles]);

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => {
      const newPhotos = [...prev];
      URL.revokeObjectURL(newPhotos[index].previewUrl);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const uploadDocumentFiles = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return;

    setIsUploadingDocument(true);

    try {
      for (const file of fileList) {
        if (file.type !== "application/pdf") {
          toast({ title: t('newTicket.pdfOnly'), variant: "destructive" });
          continue;
        }

        if (file.size > 20 * 1024 * 1024) {
          toast({ title: t('newTicket.pdfOnly'), variant: "destructive" });
          continue;
        }

        const uploadUrlResponse = await apiRequest("POST", "/api/tickets/document-upload-url");
        const { uploadURL, objectPath } = await uploadUrlResponse.json();

        const uploadResponse = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload document");
        }

        setDocuments((prev) => [...prev, { path: objectPath, fileName: file.name }]);
        toast({ title: t('newTicket.documentAdded') });
      }
    } catch (error) {
      console.error("Document upload error:", error);
      toast({ title: t('newTicket.createFailed'), variant: "destructive" });
    } finally {
      setIsUploadingDocument(false);
    }
  }, [toast, t]);

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadDocumentFiles(Array.from(files));
    event.target.value = "";
  };

  const handleRemoveDocument = (index: number) => {
    setDocuments((prev) => {
      const newDocs = [...prev];
      newDocs.splice(index, 1);
      return newDocs;
    });
  };

  const [isDraggingOverDocs, setIsDraggingOverDocs] = useState(false);
  const docDropzoneRef = useRef<HTMLDivElement>(null);

  const handleDocDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverDocs(true);
  }, []);

  const handleDocDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (docDropzoneRef.current && !docDropzoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDraggingOverDocs(false);
    }
  }, []);

  const handleDocDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverDocs(false);
    const files = Array.from(e.dataTransfer.files);
    await uploadDocumentFiles(files);
  }, [uploadDocumentFiles]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // RFP and Invoice have required titles, regular tickets need manual title
    if (!isRFPRequest && !isInvoice && !title.trim()) {
      toast({ title: t('newTicket.enterTitle'), variant: "destructive" });
      return;
    }
    
    // RFP requires service request type
    if (isRFPRequest && !serviceRequestType) {
      toast({ title: t('newTicket.serviceRequestType'), variant: "destructive" });
      return;
    }
    
    // Invoice requires a title
    if (isInvoice && !title.trim()) {
      toast({ title: t('newTicket.enterTitle'), variant: "destructive" });
      return;
    }
    
    // Invoice requires category selection
    if (isInvoice && !invoiceCategory) {
      toast({ title: t('newTicket.invoiceCategory'), variant: "destructive" });
      return;
    }
    
    createTicketMutation.mutate();
  };

  // RFP doesn't need manual title (auto-generated), but requires serviceRequestType
  // Invoice needs a title and customer
  // Shop to-do doesn't require a customer
  const canSubmit = isRFPRequest 
    ? selectedWorkType && selectedCustomerId && serviceRequestType && assignedToId
    : selectedWorkType === "shop_todo"
    ? selectedWorkType && title.trim() && assignedToId
    : selectedWorkType && selectedCustomerId && title.trim() && assignedToId;
  const hasLocation = locationLat !== null && locationLng !== null;

  const workTypeOptions: WorkType[] = ["contract", "extra_work", "project", "admin", "estimate_request", "shop_todo"];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          {t('newTicket.title')}
        </h1>
      </div>

      {step === "workType" && (
        <div className="space-y-4">
          <p className="text-muted-foreground">{t('newTicket.whatType')}</p>
          
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
            
            {/* RFP Request - Special ticket type for proposal tracking */}
            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer border-dashed"
              onClick={handleSelectRFPRequest}
              data-testid="card-worktype-rfp"
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#8b5cf620" }}
                >
                  <FilePlus className="w-5 h-5" style={{ color: "#8b5cf6" }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">RFP Request</h3>
                    <Badge variant="outline" className="text-xs">
                      Pipeline
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    Track a proposal request from first contact through award
                  </p>
                </div>
              </CardContent>
            </Card>
            
            {/* Invoice - Direct invoice creation */}
            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer border-dashed"
              onClick={handleSelectInvoice}
              data-testid="card-worktype-invoice"
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#f59e0b20" }}
                >
                  <FileText className="w-5 h-5" style={{ color: "#f59e0b" }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Invoice</h3>
                    <Badge variant="default" className="text-xs">
                      Billing
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    Create an invoice for billable work
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Project (No Estimate) - For pre-approved work with no estimating phase */}
            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer border-dashed"
              onClick={handleSelectProjectNoEstimate}
              data-testid="card-worktype-project-no-estimate"
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#0ea5e920" }}
                >
                  <FolderCheck className="w-5 h-5" style={{ color: "#0ea5e9" }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Project (No Estimate)</h3>
                    <Badge variant="default" className="text-xs">
                      Invoice Required
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    Pre-approved project — skip estimating and proposal steps
                  </p>
                </div>
              </CardContent>
            </Card>
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
              {isRFPRequest ? "RFP Request" : isInvoice ? "Invoice" : isProjectNoEstimate ? "Project (No Estimate)" : selectedWorkTypeConfig?.name}
            </span>
            <span>/</span>
            <span>{t('newTicket.selectCustomer')}</span>
          </div>
          
          <Card 
            className="hover-elevate cursor-pointer"
            onClick={() => setShowCustomerDialog(true)}
            data-testid="card-select-customer"
          >
            <CardContent className="p-4 flex items-center gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {selectedCustomer ? selectedCustomer.name : t('newTicket.selectCustomer')}
              </span>
            </CardContent>
          </Card>

          <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
            <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{t('newTicket.selectCustomer')}</DialogTitle>
              </DialogHeader>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('tickets.searchPlaceholder')}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-customer-search"
                />
              </div>
              
              {/* Create New Prospect button - shown for RFP Requests */}
              {isRFPRequest && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowCustomerDialog(false);
                    setShowCreateProspectDialog(true);
                  }}
                  data-testid="button-create-prospect"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t('newTicket.createNewProspect')}
                </Button>
              )}
              
              <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2 min-h-[200px] max-h-[400px]">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {t('customers.noCustomersFound')}
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
          
          {/* Create Prospect Dialog */}
          <Dialog open={showCreateProspectDialog} onOpenChange={setShowCreateProspectDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('newTicket.createNewProspect')}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prospect-name">
                    {t('newTicket.contactName')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="prospect-name"
                    value={newProspectName}
                    onChange={(e) => setNewProspectName(e.target.value)}
                    placeholder="e.g., Oak Valley HOA"
                    data-testid="input-prospect-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="prospect-contact-name">{t('newTicket.contactName')}</Label>
                  <Input
                    id="prospect-contact-name"
                    value={newProspectContactName}
                    onChange={(e) => setNewProspectContactName(e.target.value)}
                    placeholder="e.g., John Smith"
                    data-testid="input-prospect-contact-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="prospect-contact-email">{t('newTicket.contactEmail')}</Label>
                  <Input
                    id="prospect-contact-email"
                    type="email"
                    value={newProspectContactEmail}
                    onChange={(e) => setNewProspectContactEmail(e.target.value)}
                    placeholder="e.g., john@example.com"
                    data-testid="input-prospect-contact-email"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="prospect-contact-phone">{t('newTicket.contactPhone')}</Label>
                  <Input
                    id="prospect-contact-phone"
                    type="tel"
                    value={newProspectContactPhone}
                    onChange={(e) => setNewProspectContactPhone(e.target.value)}
                    placeholder="e.g., (555) 123-4567"
                    data-testid="input-prospect-contact-phone"
                  />
                </div>
              </div>
              
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateProspectDialog(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => createProspectMutation.mutate()}
                  disabled={!newProspectName.trim() || createProspectMutation.isPending}
                  data-testid="button-create-prospect-submit"
                >
                  {createProspectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  {t('newTicket.createProspect')}
                </Button>
              </DialogFooter>
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
              {isRFPRequest ? "RFP Request" : isInvoice ? "Invoice" : isProjectNoEstimate ? "Project (No Estimate)" : selectedWorkTypeConfig?.name}
            </span>
            {/* Show customer in breadcrumb only for non-shop_todo tickets */}
            {selectedWorkType !== "shop_todo" && (
              <>
                <span>/</span>
                <span 
                  className="hover:text-foreground cursor-pointer"
                  onClick={() => setStep("customer")}
                >
                  {selectedCustomer?.name}
                </span>
              </>
            )}
            <span>/</span>
            <span>{t('ticketDetail.tabs.overview')}</span>
          </div>

          {/* Hide billing behavior for Invoice tickets since it's already clear it's for billing */}
          {selectedWorkTypeConfig && !isInvoice && (
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
            {/* RFP Request has auto-generated title */}
            {isRFPRequest ? (
              <div className="space-y-2">
                <Label>{t('newTicket.titleLabel')}</Label>
                <div className="h-11 px-3 flex items-center rounded-md border bg-muted/50 text-sm">
                  Request for Proposal - {selectedCustomer?.name}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="title">
                  {t('newTicket.titleLabel')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('newTicket.titlePlaceholder')}
                  className="h-11"
                  data-testid="input-title"
                />
              </div>
            )}

            {/* Service Request Type - RFP only */}
            {isRFPRequest && (
              <div className="space-y-2">
                <Label htmlFor="serviceRequestType">
                  {t('newTicket.serviceRequestType')} <span className="text-red-500">*</span>
                </Label>
                <Select value={serviceRequestType} onValueChange={setServiceRequestType}>
                  <SelectTrigger id="serviceRequestType" className="h-11" data-testid="select-service-request-type">
                    <SelectValue placeholder="Select service type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Maintenance only">Maintenance only</SelectItem>
                    <SelectItem value="Snow Removal Only">Snow Removal Only</SelectItem>
                    <SelectItem value="Maintenance & Snow Removal">Maintenance & Snow Removal</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">{t('common.description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('newTicket.descriptionPlaceholder')}
                rows={3}
                data-testid="input-description"
              />
            </div>

            {/* Equipment selection - Shop to-do only */}
            {selectedWorkType === "shop_todo" && (
              <div className="space-y-2">
                <Label htmlFor="equipment">{t('tickets.equipment')}</Label>
                <Select 
                  value={selectedEquipmentId || "none"} 
                  onValueChange={(value) => setSelectedEquipmentId(value === "none" ? null : value)}
                >
                  <SelectTrigger id="equipment" className="h-11" data-testid="select-equipment">
                    <SelectValue placeholder="Link to equipment..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.none')}</SelectItem>
                    {equipmentList
                      .filter(e => e.status !== "retired")
                      .map((equipment) => (
                        <SelectItem key={equipment.id} value={equipment.id}>
                          {equipment.name}{equipment.type ? ` (${equipment.type.replace("_", " ")})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link this task to a piece of equipment to track it in that equipment's service history.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('ticketDetail.location')}</Label>
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

            {/* Photo upload - hidden for RFP requests only */}
            {!isRFPRequest && (
              <div className="space-y-2">
                <Label>{t('ticketDetail.photos')}</Label>
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
                  
                  <div
                    ref={dropzoneRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById("photo-gallery")?.click()}
                    className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 cursor-pointer transition-colors ${
                      isDraggingOver
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    } ${isUploadingPhoto ? "pointer-events-none opacity-50" : ""}`}
                    data-testid="dropzone-photo"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-muted-foreground" />
                    )}
                    <p className="text-sm text-muted-foreground text-center">
                      Drag & drop images here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Max 10 MB per file
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      id="photo-capture"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={isUploadingPhoto}
                      data-testid="input-photo-capture"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      id="photo-gallery"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={isUploadingPhoto}
                      data-testid="input-photo-gallery"
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
            )}

            {selectedWorkType === "estimate_request" && (
              <div className="space-y-2">
                <Label>{t('newTicket.documents')}</Label>
                <div className="space-y-3">
                  {documents.length > 0 && (
                    <div className="space-y-2">
                      {documents.map((doc, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate flex-1" data-testid={`text-document-name-${index}`}>{doc.fileName}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveDocument(index)}
                            data-testid={`button-remove-document-${index}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div
                    ref={docDropzoneRef}
                    onDragOver={handleDocDragOver}
                    onDragLeave={handleDocDragLeave}
                    onDrop={handleDocDrop}
                    onClick={() => document.getElementById("document-picker")?.click()}
                    className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 cursor-pointer transition-colors ${
                      isDraggingOverDocs
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    } ${isUploadingDocument ? "pointer-events-none opacity-50" : ""}`}
                    data-testid="dropzone-document"
                  >
                    {isUploadingDocument ? (
                      <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 text-muted-foreground" />
                    )}
                    <p className="text-sm text-muted-foreground text-center">
                      {t('newTicket.dragDropDocuments')}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      {t('newTicket.pdfOnly')}
                    </p>
                  </div>

                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    id="document-picker"
                    className="hidden"
                    onChange={handleDocumentUpload}
                    disabled={isUploadingDocument}
                    data-testid="input-document-picker"
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 h-11"
                    onClick={() => document.getElementById("document-picker")?.click()}
                    disabled={isUploadingDocument}
                    data-testid="button-choose-document"
                  >
                    {isUploadingDocument ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    {t('newTicket.choosePdf')}
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">{t('common.priority')}</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority" data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('priorities.low')}</SelectItem>
                    <SelectItem value="normal">{t('priorities.normal')}</SelectItem>
                    <SelectItem value="high">{t('priorities.high')}</SelectItem>
                    <SelectItem value="urgent">{t('priorities.urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">{t('newTicket.dueDate')}</Label>
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

            {/* Work Completed Date - only for Invoice tickets */}
            {isInvoice && (
              <div className="space-y-2">
                <Label htmlFor="workCompletedDate">{t('newTicket.workCompletedDate')}</Label>
                <Input
                  id="workCompletedDate"
                  type="date"
                  value={workCompletedDate}
                  onChange={(e) => setWorkCompletedDate(e.target.value)}
                  className="h-10"
                  data-testid="input-work-completed-date"
                />
                <p className="text-xs text-muted-foreground">
                  Reference date for when the work was completed (for billing purposes)
                </p>
              </div>
            )}

            {/* Invoice Category - only for Invoice tickets */}
            {isInvoice && (
              <div className="space-y-2">
                <Label htmlFor="invoiceCategory">{t('newTicket.invoiceCategory')} <span className="text-destructive">*</span></Label>
                <Select 
                  value={invoiceCategory || ""} 
                  onValueChange={(v) => setInvoiceCategory(v as "general_maintenance" | "snow")}
                >
                  <SelectTrigger id="invoiceCategory" data-testid="select-invoice-category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general_maintenance">General Maintenance</SelectItem>
                    <SelectItem value="snow">Snow</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines which rates from the customer rate sheet will be displayed
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="assignedTo">{t('newTicket.assignedTo')} <span className="text-destructive">*</span></Label>
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
                t('newTicket.createTicket')
              )}
            </Button>
          </div>
        </form>
      )}

      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('newTicket.setLocation')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              {t('newTicket.setLocation')}
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
                {isGeocodingLoading ? t('common.loading') : t('newTicket.usePropertyAddress')}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleGetCurrentLocation}
                data-testid="button-current-location"
              >
                <Navigation className="w-4 h-4 mr-2" />
                {t('newTicket.getCurrentLocation')}
              </Button>
              {hasLocation && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleClearLocation}
                  data-testid="button-dialog-clear-location"
                >
                  <X className="w-4 h-4 mr-2" />
                  {t('common.clear')}
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
                  <Label htmlFor="locationLabel" className="text-xs">{t('ticketDetail.location')}</Label>
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
                  <Label htmlFor="locationDescription" className="text-xs">{t('common.description')}</Label>
                  <Textarea
                    id="locationDescription"
                    placeholder={t('newTicket.descriptionPlaceholder')}
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
                t('newTicket.setLocation')
              ) : (
                t('common.skip')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
