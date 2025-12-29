import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ArrowLeft, 
  Send, 
  Check, 
  ChevronRight, 
  MapPin, 
  User, 
  CalendarDays,
  MessageSquare,
  History,
  Loader2,
  ExternalLink,
  Navigation,
  Image as ImageIcon,
  FileText,
  Briefcase,
  ClipboardList,
  Layers,
  Link2,
  Trash2,
  Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Ticket, TicketType, TicketTypeStatus, TicketTypeField, TicketFieldValue, TicketComment, TicketStatusHistory, Customer, Contract, ContractService, WorkType, TicketLink, User as UserType, CompanyUser } from "@shared/schema";
import { WORK_TYPE_CATALOG } from "@shared/workTypeCatalog";
import { format, formatDistanceToNow } from "date-fns";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import LayerMapViewer from "@/components/LayerMapViewer";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LinkedTicketInfo {
  link: TicketLink;
  ticket: Ticket | null;
  ticketType: TicketType | null;
  currentStatus: TicketTypeStatus | null;
  relationship: "source" | "target";
}

interface TicketDetails {
  ticket: Ticket;
  ticketType: TicketType;
  statuses: (TicketTypeStatus & { fields: TicketTypeField[] })[];
  fieldValues: TicketFieldValue[];
  statusHistory: TicketStatusHistory[];
  comments: TicketComment[];
  customer: Customer;
  contract: Contract | null;
  contractServices: ContractService[];
  assignedUser: { id: string; email: string } | null;
  linkedTickets: LinkedTicketInfo[];
}

const priorityConfig = {
  urgent: { color: "bg-red-500", textColor: "text-red-700 dark:text-red-400", label: "Urgent", bgColor: "bg-red-50 dark:bg-red-900/20" },
  high: { color: "bg-orange-500", textColor: "text-orange-700 dark:text-orange-400", label: "High", bgColor: "bg-orange-50 dark:bg-orange-900/20" },
  normal: { color: "bg-blue-500", textColor: "text-blue-700 dark:text-blue-400", label: "Normal", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  low: { color: "bg-gray-400", textColor: "text-gray-600 dark:text-gray-400", label: "Low", bgColor: "bg-gray-50 dark:bg-gray-900/20" },
};

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: UserType;
  isSuperAdmin: boolean;
}

export default function TicketDetail() {
  const [, params] = useRoute("/dashboard/tickets/:id");
  const ticketId = params?.id;
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  
  const [newComment, setNewComment] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});
  const [statusNotes, setStatusNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "workflow" | "comments" | "history">("overview");
  const [showPropertyMaps, setShowPropertyMaps] = useState(false);
  
  // Execution Task handoff state for Projects
  const [showExecutionTaskPrompt, setShowExecutionTaskPrompt] = useState(false);
  const [creatingExecutionTask, setCreatingExecutionTask] = useState(false);
  
  // Invoice creation handoff state for Projects at Ready for Billing
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  
  // Delete ticket state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Edit ticket state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
    dueDate: "",
    workCompletedDate: "",
  });
  
  // Navigation for redirects
  const [, setLocation] = useLocation();
  
  // Check if current user can reassign tickets (admin or super admin)
  const canReassign = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;
  
  // Check if current user can delete tickets (admin or office)
  const canDelete = currentUser?.activeRole === "admin" || currentUser?.activeRole === "office" || currentUser?.isSuperAdminBool;
  
  // Check if current user can edit ticket details (admin only)
  const canEdit = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;

  const { data: details, isLoading } = useQuery<TicketDetails>({
    queryKey: ["/api/tickets", ticketId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticket");
      return res.json();
    },
    enabled: !!ticketId,
  });

  useSetBreadcrumbs([
    { label: "Tickets", href: "/dashboard/tickets" },
    { label: details?.ticket?.title || "Loading..." },
  ], [details?.ticket?.title]);

  // Fetch company users for reassignment dropdown (admin/super admin only)
  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
    enabled: canReassign,
  });

  // Build team members list for assignment dropdown - include all users
  const teamMembers = useMemo(() => {
    return companyUsersData
      .filter(item => item.user)
      .map(item => ({
        id: item.user.id,
        name: item.user.name || item.user.email,
        email: item.user.email,
        role: item.companyUser.role,
      }));
  }, [companyUsersData]);

  // Mutation to reassign ticket
  const reassignMutation = useMutation({
    mutationFn: async (newAssigneeId: string | null) => {
      return apiRequest("PATCH", `/api/tickets/${ticketId}`, {
        assignedToId: newAssigneeId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket reassigned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reassign ticket", description: error.message, variant: "destructive" });
    },
  });

  // Mutation to delete ticket
  const deleteTicketMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/tickets/${ticketId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket deleted successfully" });
      setLocation("/dashboard/tickets");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete ticket", description: error.message, variant: "destructive" });
    },
  });

  // Mutation to edit ticket details
  const editTicketMutation = useMutation({
    mutationFn: async (updates: {
      title?: string;
      description?: string;
      priority?: "low" | "normal" | "high" | "urgent";
      dueDate?: Date | null;
      workCompletedDate?: Date | null;
    }) => {
      return apiRequest("PATCH", `/api/tickets/${ticketId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setShowEditDialog(false);
      toast({ title: "Ticket updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update ticket", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ statusId, notes, checkProjectApproval, checkInvoicePrompt }: { statusId: string; notes?: string; checkProjectApproval?: boolean; checkInvoicePrompt?: boolean }) => {
      const result = await apiRequest("PATCH", `/api/tickets/${ticketId}`, {
        currentStatusId: statusId,
        statusChangeNotes: notes,
      });
      // Return the flags with the result
      return { result, checkProjectApproval, checkInvoicePrompt };
    },
    onSuccess: ({ checkProjectApproval, checkInvoicePrompt }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setShowStatusDialog(false);
      setPendingStatusId(null);
      setFieldInputs({});
      setStatusNotes("");
      toast({ title: "Status updated successfully" });
      
      // Check if we should prompt for Execution Task creation (Project approval)
      if (checkProjectApproval) {
        setShowExecutionTaskPrompt(true);
      }
      
      // Check if we should prompt for Invoice creation (Project at Ready for Billing)
      if (checkInvoicePrompt) {
        setShowInvoicePrompt(true);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const saveFieldValueMutation = useMutation({
    mutationFn: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      return apiRequest("PUT", `/api/tickets/${ticketId}/field-values/${fieldId}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", `/api/tickets/${ticketId}/comments`, { body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
  });

  if (isLoading || !details) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { ticket, ticketType, statuses, fieldValues, statusHistory, comments, customer, contract, contractServices = [], assignedUser, linkedTickets = [] } = details;
  const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);
  const sortedStatuses = [...statuses].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedCurrentIndex = sortedStatuses.findIndex(s => s.id === ticket.currentStatusId);
  
  // Handle RFP Request branching at "Decision Received" status
  const getNextStatus = () => {
    // Use sorted index to find next status in order
    const defaultNext = sortedStatuses[sortedCurrentIndex + 1];
    
    // Check if this is RFP Request at Decision Received - need to branch based on outcome
    if (currentStatus?.name === "Decision Received" && ticketType.name === "RFP Request") {
      // Find the decision_outcome field value
      const decisionField = currentStatus.fields?.find(f => f.fieldKey === "decision_outcome");
      const decisionValue = decisionField ? fieldValues.find(fv => fv.fieldId === decisionField.id)?.value : null;
      
      if (decisionValue === "Awarded") {
        // Go to Awarded status
        return statuses.find(s => s.name === "Awarded") || defaultNext;
      } else if (decisionValue === "Lost") {
        // Go to Closed - Lost status
        return statuses.find(s => s.name === "Closed - Lost") || defaultNext;
      }
      // No decision made yet - return Awarded as the default next for the button
      // (The actual target will be determined in handleConfirmStatusChange based on dialog input)
      return statuses.find(s => s.name === "Awarded") || defaultNext;
    }
    
    return defaultNext;
  };
  
  const nextStatus = getNextStatus();
  const isComplete = !!ticket.completedAt;

  const handleAdvanceStatus = () => {
    if (!nextStatus) return;
    
    // Check if current status has unfilled required fields
    const currentStatusFields = currentStatus?.fields || [];
    const missingCurrentFields = currentStatusFields.filter(field => {
      if (field.isRequired === "true") {
        const fieldVal = getFieldValue(field.id);
        return !fieldVal || fieldVal.trim() === "";
      }
      return false;
    });
    
    const nextStatusFields = nextStatus.fields || [];
    
    // If we have unfilled current status fields OR next status has fields, show the dialog
    if (missingCurrentFields.length > 0 || nextStatusFields.length > 0) {
      // Pre-populate fieldInputs with existing values for current status fields
      const existingValues: Record<string, string> = {};
      for (const field of currentStatusFields) {
        const val = getFieldValue(field.id);
        if (val) existingValues[field.id] = val;
      }
      setFieldInputs(existingValues);
      setPendingStatusId(nextStatus.id);
      setShowStatusDialog(true);
    } else {
      // Direct advance without dialog - check for special handoffs
      let checkProjectApproval = false;
      let checkInvoicePrompt = false;
      
      // Check if advancing from Decision Received with Approved decision (Project)
      if (currentStatus?.name === "Decision Received" && ticketType.name === "Project") {
        const decisionField = currentStatusFields.find(f => f.fieldKey === "decision_outcome");
        const decisionValue = decisionField ? getFieldValue(decisionField.id) : null;
        if (decisionValue === "Approved") {
          checkProjectApproval = true;
        }
      }
      
      // Check if advancing to Ready for Billing - only prompt for invoice if billing is required
      // Skip for internal work types (admin, estimate_request) and contract work (no_invoice)
      if (nextStatus.name === "Ready for Billing" && ticketType.name === "Project" && ticket.billingBehavior === "invoice_required") {
        checkInvoicePrompt = true;
      }
      
      updateStatusMutation.mutate({ 
        statusId: nextStatus.id,
        checkProjectApproval,
        checkInvoicePrompt,
      });
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatusId) return;
    
    // Validate CURRENT status required fields first
    const currentStatusFields = currentStatus?.fields || [];
    for (const field of currentStatusFields) {
      if (field.isRequired === "true" && !fieldInputs[field.id]?.trim()) {
        toast({ title: `Please fill in ${field.fieldLabel}`, variant: "destructive" });
        return;
      }
    }
    
    // Determine actual target status (handle RFP/Project branching based on dialog inputs)
    let actualTargetStatusId = pendingStatusId;
    let shouldPromptExecutionTask = false;
    let shouldPromptInvoice = false;
    
    if (currentStatus?.name === "Decision Received" && ticketType.name === "RFP Request") {
      const decisionField = currentStatusFields.find(f => f.fieldKey === "decision_outcome");
      const decisionValue = decisionField ? fieldInputs[decisionField.id] : null;
      
      if (decisionValue === "Awarded") {
        const awardedStatus = statuses.find(s => s.name === "Awarded");
        if (awardedStatus) actualTargetStatusId = awardedStatus.id;
      } else if (decisionValue === "Lost") {
        const lostStatus = statuses.find(s => s.name === "Closed - Lost");
        if (lostStatus) actualTargetStatusId = lostStatus.id;
      }
    }
    
    // Handle Project decision branching and Execution Task handoff
    if (currentStatus?.name === "Decision Received" && ticketType.name === "Project") {
      const decisionField = currentStatusFields.find(f => f.fieldKey === "decision_outcome");
      const decisionValue = decisionField ? fieldInputs[decisionField.id] : null;
      
      if (decisionValue === "Approved") {
        // Continue to Work Completed (the natural next step, but we'll prompt for Execution Task)
        shouldPromptExecutionTask = true;
      } else if (decisionValue === "Denied") {
        // Go to Closed - Lost
        const lostStatus = statuses.find(s => s.name === "Closed - Lost");
        if (lostStatus) actualTargetStatusId = lostStatus.id;
      }
    }
    
    // Check if advancing Project to Ready for Billing - prompt for Invoice creation
    // Only prompt if billing is required (skip for internal work types and contract work)
    const targetStatusName = statuses.find(s => s.id === actualTargetStatusId)?.name;
    if (targetStatusName === "Ready for Billing" && ticketType.name === "Project" && ticket.billingBehavior === "invoice_required") {
      shouldPromptInvoice = true;
    }
    
    // Validate target status required fields (only if not branching to a different status)
    const targetStatus = statuses.find(s => s.id === actualTargetStatusId);
    if (actualTargetStatusId === pendingStatusId) {
      const nextRequiredFields = targetStatus?.fields?.filter(f => f.isRequired === "true") || [];
      for (const field of nextRequiredFields) {
        if (!fieldInputs[field.id]?.trim()) {
          toast({ title: `Please fill in ${field.fieldLabel}`, variant: "destructive" });
          return;
        }
      }
    }

    // Save all field values
    for (const [fieldId, value] of Object.entries(fieldInputs)) {
      if (value) {
        await saveFieldValueMutation.mutateAsync({ fieldId, value });
      }
    }

    updateStatusMutation.mutate({ 
      statusId: actualTargetStatusId, 
      notes: statusNotes,
      checkProjectApproval: shouldPromptExecutionTask,
      checkInvoicePrompt: shouldPromptInvoice,
    });
  };

  const getFieldValue = (fieldId: string) => {
    return fieldValues.find(fv => fv.fieldId === fieldId)?.value || "";
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  // Handle creating an Execution Task linked to this Project
  const handleCreateExecutionTask = async () => {
    if (!details) return;
    
    setCreatingExecutionTask(true);
    try {
      // First, ensure Execution Task ticket type exists
      await apiRequest("POST", "/api/ticket-types/init-execution-task", {});
      
      // Create the Execution Task ticket with link to this Project
      const result = await apiRequest("POST", "/api/tickets/create-execution-task", {
        parentTicketId: ticketId,
        customerId: ticket.customerId,
        title: `Execute: ${ticket.title}`,
        description: ticket.description,
        priority: ticket.priority,
        locationLat: ticket.locationLat,
        locationLng: ticket.locationLng,
        locationLabel: ticket.locationLabel,
        locationDescription: ticket.locationDescription,
        photos: ticket.photos,
      });
      
      if (result && (result as any).id) {
        toast({ title: "Execution Task created successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      }
    } catch (error) {
      toast({ title: "Failed to create Execution Task", variant: "destructive" });
    } finally {
      setCreatingExecutionTask(false);
      setShowExecutionTaskPrompt(false);
    }
  };

  const handleSkipExecutionTask = () => {
    setShowExecutionTaskPrompt(false);
    toast({ title: "You can create an Execution Task later from this ticket" });
  };

  // Handle creating an Invoice ticket linked to this Project at Ready for Billing
  const handleCreateInvoice = async () => {
    if (!details) return;
    
    setCreatingInvoice(true);
    try {
      // Create the Invoice ticket with link to this Project
      const result = await apiRequest("POST", "/api/tickets/create-invoice-from-project", {
        parentTicketId: ticketId,
        customerId: ticket.customerId,
        title: `Invoice: ${ticket.title}`,
        description: `Invoice for project: ${ticket.title}\n\nOriginal description: ${ticket.description || "N/A"}`,
        priority: "normal",
      });
      
      if (result && (result as any).id) {
        toast({ title: "Invoice ticket created successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
        
        // Advance project to Invoicing status
        const invoicingStatus = statuses.find(s => s.name === "Invoicing");
        if (invoicingStatus) {
          updateStatusMutation.mutate({
            statusId: invoicingStatus.id,
            notes: "Invoice ticket created",
          });
        }
      }
    } catch (error) {
      toast({ title: "Failed to create Invoice ticket", variant: "destructive" });
    } finally {
      setCreatingInvoice(false);
      setShowInvoicePrompt(false);
    }
  };

  const handleSkipInvoice = () => {
    setShowInvoicePrompt(false);
    toast({ title: "You can create an Invoice later from this ticket" });
  };

  // Open edit dialog and populate form with current values
  const handleOpenEdit = () => {
    if (!details) return;
    const { ticket } = details;
    setEditForm({
      title: ticket.title || "",
      description: ticket.description || "",
      priority: ticket.priority || "normal",
      dueDate: ticket.dueDate ? format(new Date(ticket.dueDate), "yyyy-MM-dd") : "",
      workCompletedDate: ticket.workCompletedDate ? format(new Date(ticket.workCompletedDate), "yyyy-MM-dd") : "",
    });
    setShowEditDialog(true);
  };

  // Save ticket edits
  const handleSaveEdit = () => {
    const updates: any = {
      title: editForm.title,
      description: editForm.description || null,
      priority: editForm.priority,
      dueDate: editForm.dueDate ? new Date(editForm.dueDate) : null,
      workCompletedDate: editForm.workCompletedDate ? new Date(editForm.workCompletedDate) : null,
    };
    editTicketMutation.mutate(updates);
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" data-testid="button-back" onClick={() => window.history.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs">
              {ticketType.name}
            </Badge>
            {isComplete && (
              <Badge variant="default" className="text-xs bg-green-600">
                <Check className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight line-clamp-2" data-testid="text-ticket-title">
            {ticket.title}
          </h1>
        </div>
        {canEdit && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleOpenEdit}
            data-testid="button-edit-ticket"
          >
            <Pencil className="w-5 h-5" />
          </Button>
        )}
        {canDelete && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="button-delete-ticket"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        )}
      </div>

      <div className="flex border-b sticky top-0 bg-background z-10">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("overview")}
          data-testid="tab-overview"
        >
          <ClipboardList className="w-4 h-4" />
          Overview
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "workflow"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("workflow")}
          data-testid="tab-workflow"
        >
          Workflow
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "comments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("comments")}
          data-testid="tab-comments"
        >
          <MessageSquare className="w-4 h-4" />
          {comments.length > 0 && <span className="text-xs">({comments.length})</span>}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("history")}
          data-testid="tab-history"
        >
          <History className="w-4 h-4" />
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card data-testid="card-ticket-summary">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Priority</p>
                  <div className={`flex items-center gap-1.5 ${priority.textColor}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${priority.color}`} />
                    <span className="font-medium">{priority.label}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Work Type</p>
                  {ticket.workType && WORK_TYPE_CATALOG[ticket.workType as WorkType] ? (
                    <Badge 
                      variant={WORK_TYPE_CATALOG[ticket.workType as WorkType].badgeVariant}
                      data-testid="badge-worktype"
                    >
                      {WORK_TYPE_CATALOG[ticket.workType as WorkType].billingLabel}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not set</span>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                  <Badge variant="outline" className="font-medium">
                    {currentStatus?.name || "Unknown"}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Due Date</p>
                  {ticket.dueDate ? (
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{format(new Date(ticket.dueDate), "MMM d, yyyy")}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not set</span>
                  )}
                </div>

                {ticket.workCompletedDate && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Work Completed</p>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{format(new Date(ticket.workCompletedDate), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                )}

                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Assigned To</p>
                  {canReassign ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          <User className="w-3 h-3" />
                        </AvatarFallback>
                      </Avatar>
                      <Select 
                        value={ticket.assignedToId || "unassigned"} 
                        onValueChange={(value) => {
                          reassignMutation.mutate(value === "unassigned" ? null : value);
                        }}
                        disabled={reassignMutation.isPending}
                      >
                        <SelectTrigger className="w-[200px] h-8" data-testid="select-reassign-ticket">
                          <SelectValue placeholder="Select assignee..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {teamMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name} ({member.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {reassignMutation.isPending && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-xs">
                          <User className="w-3 h-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{assignedUser?.email || "Unassigned"}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Service Request Type for RFP tickets */}
          {ticketType.name === "RFP Request" && (
            <Card data-testid="card-service-request">
              <CardContent className="p-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Service Request</p>
                  <p className="font-medium">
                    {fieldValues.find(fv => {
                      const field = statuses.flatMap(s => s.fields || []).find(f => f.id === fv.fieldId);
                      return field?.fieldKey === "service_request_type";
                    })?.value || "Not specified"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {ticket.description && (
            <Card data-testid="card-description">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-customer">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Customer & Property
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {customer.street}, {customer.city}, {customer.state} {customer.zip}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-view-property-maps"
                    onClick={() => setShowPropertyMaps(true)}
                  >
                    <Layers className="w-3 h-3 mr-1" />
                    Maps
                  </Button>
                  <Link href={`/dashboard/customers/${customer.id}`}>
                    <Button variant="outline" size="sm" data-testid="button-view-customer">
                      View
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>

              {contract && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Related Contract</p>
                  <Link href={`/dashboard/customers/${customer.id}`}>
                    <Badge variant="secondary" className="hover-elevate cursor-pointer">
                      {contract.serviceType?.replace(/_/g, " ") || "Contract"}
                    </Badge>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {linkedTickets && linkedTickets.length > 0 && (
            <Card data-testid="card-linked-tickets">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  {ticketType?.name === "Invoice" ? "Source Work" : 
                   ticketType?.name === "Execution Task" ? "Parent Project" : 
                   "Linked Tickets"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {linkedTickets.map((linked) => {
                  if (!linked.ticket) return null;
                  
                  // Determine link relationship label based on link type and direction
                  let linkLabel = "Related ticket";
                  const isSource = linked.relationship === "source";
                  
                  if (linked.link.linkType === "invoice_for") {
                    linkLabel = isSource ? "Invoice generated for this work" : "Original billable work";
                  } else if (linked.link.linkType === "execution_for") {
                    linkLabel = isSource ? "Execution Task for this project" : "Parent Project";
                  } else if (linked.link.linkType === "project_for") {
                    linkLabel = isSource ? "Project created from this request" : "Source RFP Request";
                  }
                  
                  // Show different icon based on relationship
                  const isChild = (linked.link.linkType === "invoice_for" || linked.link.linkType === "execution_for" || linked.link.linkType === "project_for") && isSource;
                  
                  return (
                    <Link 
                      key={linked.link.id} 
                      href={`/dashboard/tickets/${linked.ticket.id}`}
                    >
                      <div className="flex items-center justify-between p-2 rounded-md border hover-elevate cursor-pointer" data-testid={`link-ticket-${linked.ticket.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div 
                            className={`w-2 h-2 rounded-full shrink-0 ${isChild ? "ring-2 ring-primary/30" : ""}`}
                            style={{ backgroundColor: linked.ticketType?.color || "#6b7280" }} 
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              {isChild && <span className="text-xs text-primary">↳</span>}
                              <p className="text-sm font-medium truncate">{linked.ticket.title}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">{linkLabel}</p>
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          style={{ 
                            borderColor: linked.currentStatus?.color || undefined, 
                            color: linked.currentStatus?.color || undefined 
                          }}
                        >
                          {linked.currentStatus?.name || "Unknown"}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {ticket.locationLat && ticket.locationLng && (
            <Card className="overflow-hidden" data-testid="card-location">
              <div className="h-[150px] relative">
                <MapContainer
                  center={[ticket.locationLat, ticket.locationLng]}
                  zoom={16}
                  style={{ height: "100%", width: "100%" }}
                  className="z-0"
                  scrollWheelZoom={false}
                  dragging={false}
                  zoomControl={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[ticket.locationLat, ticket.locationLng]} />
                </MapContainer>
              </div>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {ticket.locationLabel || "Pinned Location"}
                      </span>
                    </div>
                    {ticket.locationDescription && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 ml-6">
                        {ticket.locationDescription}
                      </p>
                    )}
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${ticket.locationLat},${ticket.locationLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <Button variant="default" size="sm" data-testid="button-navigate">
                      <Navigation className="w-4 h-4 mr-1" />
                      Navigate
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          {ticket.photos && ticket.photos.length > 0 && (
            <Card data-testid="card-photos">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Photos ({ticket.photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-3 gap-2">
                  {ticket.photos.map((photo, index) => {
                    const photoUrl = photo.startsWith("/objects/") 
                      ? photo 
                      : `/objects/${photo.replace(/^\/[^/]+\/[^/]+\//, "")}`;
                    return (
                      <a
                        key={index}
                        href={photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                        data-testid={`photo-thumbnail-${index}`}
                      >
                        <img
                          src={photoUrl}
                          alt={`Ticket photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {comments.length > 0 && (
            <Card data-testid="card-recent-comments">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Recent Comments
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("comments")} data-testid="button-view-all-comments">
                  View All
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {comments.slice(0, 2).map((comment) => (
                    <div key={comment.id} className="text-sm border-l-2 pl-3 py-1">
                      <p className="line-clamp-2">{comment.body}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "workflow" && (
        <div className="space-y-3">
          {(() => {
            // For RFP Request, filter to show only relevant branch
            const visitedStatusIds = new Set(statusHistory.map(h => h.toStatusId));
            visitedStatusIds.add(ticket.currentStatusId); // Include current status
            
            // Determine which branch we're on for RFP Request
            let filteredStatuses = sortedStatuses;
            if (ticketType.name === "RFP Request") {
              const decisionReceivedStatus = sortedStatuses.find(s => s.name === "Decision Received");
              const currentOrder = currentStatus?.displayOrder || 0;
              
              // Check if we've passed Decision Received
              if (decisionReceivedStatus && currentOrder > decisionReceivedStatus.displayOrder) {
                // Determine which branch by checking if Awarded or Closed - Lost was visited
                const isOnAwardedPath = visitedStatusIds.has(
                  sortedStatuses.find(s => s.name === "Awarded")?.id || ""
                );
                const isOnLostPath = visitedStatusIds.has(
                  sortedStatuses.find(s => s.name === "Closed - Lost")?.id || ""
                );
                
                if (isOnAwardedPath) {
                  // Filter out Closed - Lost
                  filteredStatuses = sortedStatuses.filter(s => s.name !== "Closed - Lost");
                } else if (isOnLostPath) {
                  // Filter out the Awarded path (Awarded through Closed - Won)
                  const awardedPathNames = ["Awarded", "Contract Executed", "CRM Setup Complete", 
                    "Maps Requested", "Maps Uploaded", "Contacts Collected", 
                    "Post-Award Kickoff", "Handoff to Operations", "Closed - Won"];
                  filteredStatuses = sortedStatuses.filter(s => !awardedPathNames.includes(s.name));
                }
              }
            }
            
            return filteredStatuses;
          })().map((status, index) => {
            // Use history to determine completion instead of just displayOrder
            const visitedIds = new Set(statusHistory.map(h => h.toStatusId));
            const isCompleted = visitedIds.has(status.id) && status.id !== ticket.currentStatusId;
            const isCurrent = status.id === ticket.currentStatusId;
            const isPending = !isCompleted && !isCurrent;
            const statusFields = status.fields || [];
            
            return (
              <Card 
                key={status.id}
                className={`transition-all ${
                  isCurrent ? "ring-2 ring-primary" : isCompleted ? "opacity-75" : "opacity-50"
                }`}
                data-testid={`card-status-${status.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted 
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" 
                        : isCurrent 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">{status.name}</h3>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-xs">Current</Badge>
                        )}
                      </div>
                      
                      {status.description && (
                        <p className="text-sm text-muted-foreground mt-1">{status.description}</p>
                      )}

                      {(isCompleted || isCurrent) && statusFields.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {statusFields.map(field => {
                            const value = getFieldValue(field.id);
                            return (
                              <div key={field.id} className="text-sm">
                                <span className="text-muted-foreground">{field.fieldLabel}: </span>
                                <span className="font-medium">{value || "—"}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "comments" && (
        <div className="space-y-4">
          {comments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No comments yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <Card key={comment.id} data-testid={`comment-${comment.id}`}>
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarFallback className="text-xs">
                          <User className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()} at{" "}
                            {new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-3">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                className="resize-none border-0 focus-visible:ring-0"
                data-testid="input-comment"
              />
              <div className="flex justify-end mt-2">
                <Button 
                  size="sm" 
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  data-testid="button-add-comment"
                >
                  {addCommentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-2">
          {statusHistory.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <History className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No history yet</p>
              </CardContent>
            </Card>
          ) : (
            statusHistory.map((entry, index) => {
              const toStatus = statuses.find(s => s.id === entry.toStatusId);
              const fromStatus = entry.fromStatusId ? statuses.find(s => s.id === entry.fromStatusId) : null;
              
              return (
                <Card key={entry.id} data-testid={`history-${entry.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground mt-2 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm">
                          {fromStatus ? (
                            <>
                              Changed from <span className="font-medium">{fromStatus.name}</span> to{" "}
                              <span className="font-medium">{toStatus?.name}</span>
                            </>
                          ) : (
                            <>Ticket created with status <span className="font-medium">{toStatus?.name}</span></>
                          )}
                        </p>
                        {entry.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(entry.createdAt).toLocaleDateString()} at{" "}
                          {new Date(entry.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {nextStatus && !isComplete && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          <Button 
            className="w-full h-12 text-base gap-2" 
            onClick={handleAdvanceStatus}
            disabled={updateStatusMutation.isPending}
            data-testid="button-advance-status"
          >
            {updateStatusMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {nextStatus?.name === "Decision Received" && (ticketType.name === "RFP Request" || ticketType.name === "Project")
                  ? "Record Decision"
                  : `Move to: ${nextStatus.name}`}
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      )}

      {isComplete && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <Check className="w-5 h-5" />
            <span className="font-medium">Ticket Completed</span>
          </div>
        </div>
      )}

      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {statuses.find(s => s.id === pendingStatusId)?.name === "Decision Received" && (ticketType.name === "RFP Request" || ticketType.name === "Project")
                ? "Record Decision Outcome" 
                : `Move to: ${statuses.find(s => s.id === pendingStatusId)?.name}`}
            </DialogTitle>
            <DialogDescription>
              {statuses.find(s => s.id === pendingStatusId)?.name === "Decision Received" && ticketType.name === "RFP Request"
                ? "Select Awarded or Lost to proceed to the appropriate workflow."
                : statuses.find(s => s.id === pendingStatusId)?.name === "Decision Received" && ticketType.name === "Project"
                ? "Select Approved to create an Execution Task, or Denied to close the project."
                : "Fill in the required information to proceed."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current status fields section */}
            {currentStatus?.fields && currentStatus.fields.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">Complete: {currentStatus.name}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {currentStatus.fields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>
                      {field.fieldLabel}
                      {field.isRequired === "true" && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.fieldType === "textarea" ? (
                      <Textarea
                        id={field.id}
                        value={fieldInputs[field.id] || ""}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.fieldLabel.toLowerCase()}`}
                        data-testid={`input-field-${field.fieldKey}`}
                      />
                    ) : field.fieldType === "select" && field.options ? (
                      <select
                        id={field.id}
                        value={fieldInputs[field.id] || ""}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        data-testid={`select-field-${field.fieldKey}`}
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={field.id}
                        type={field.fieldType === "number" ? "number" : "text"}
                        value={fieldInputs[field.id] || ""}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.fieldLabel.toLowerCase()}`}
                        data-testid={`input-field-${field.fieldKey}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Next status fields section - hide for Decision Received since target is determined by outcome */}
            {!(currentStatus?.name === "Decision Received" && ticketType.name === "RFP Request") && 
             statuses.find(s => s.id === pendingStatusId)?.fields && statuses.find(s => s.id === pendingStatusId)!.fields!.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground font-medium">For: {statuses.find(s => s.id === pendingStatusId)?.name}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {statuses.find(s => s.id === pendingStatusId)?.fields?.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>
                      {field.fieldLabel}
                      {field.isRequired === "true" && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.fieldType === "textarea" ? (
                      <Textarea
                        id={field.id}
                        value={fieldInputs[field.id] || ""}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.fieldLabel.toLowerCase()}`}
                        data-testid={`input-field-${field.fieldKey}`}
                      />
                    ) : field.fieldType === "select" && field.options ? (
                      <select
                        id={field.id}
                        value={fieldInputs[field.id] || ""}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        data-testid={`select-field-${field.fieldKey}`}
                      >
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={field.id}
                        type={field.fieldType === "number" ? "number" : "text"}
                        value={fieldInputs[field.id] || ""}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.fieldLabel.toLowerCase()}`}
                        data-testid={`input-field-${field.fieldKey}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="statusNotes">Notes (optional)</Label>
              <Textarea
                id="statusNotes"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Add any notes about this status change..."
                rows={2}
                data-testid="input-status-notes"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmStatusChange}
              disabled={updateStatusMutation.isPending || saveFieldValueMutation.isPending}
              data-testid="button-confirm-status"
            >
              {(updateStatusMutation.isPending || saveFieldValueMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execution Task Creation Prompt Dialog for Project Approval */}
      <Dialog open={showExecutionTaskPrompt} onOpenChange={setShowExecutionTaskPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project Approved</DialogTitle>
            <DialogDescription>
              This project has been approved. Would you like to create an Execution Task for the field crew?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">The Execution Task will include:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Scope and description from this project</li>
                <li>• Location and photos</li>
                <li>• Link back to this Project ticket</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              You can assign the Execution Task to a crew member after creation.
            </p>
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={handleSkipExecutionTask}
              disabled={creatingExecutionTask}
            >
              Skip for Now
            </Button>
            <Button 
              onClick={handleCreateExecutionTask}
              disabled={creatingExecutionTask}
              data-testid="button-create-execution-task"
            >
              {creatingExecutionTask ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Create Execution Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Creation Prompt Dialog for Project at Ready for Billing */}
      <Dialog open={showInvoicePrompt} onOpenChange={setShowInvoicePrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ready for Billing</DialogTitle>
            <DialogDescription>
              This project work is complete. Would you like to create an Invoice ticket for billing?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">The Invoice ticket will include:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Reference to this project</li>
                <li>• Customer billing information</li>
                <li>• Work description for invoicing</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Creating an invoice will advance this project to the Invoicing stage.
            </p>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={handleSkipInvoice}
              data-testid="button-skip-invoice"
            >
              Skip for Now
            </Button>
            <Button 
              onClick={handleCreateInvoice}
              disabled={creatingInvoice}
              data-testid="button-create-invoice"
            >
              {creatingInvoice ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPropertyMaps && (
        <LayerMapViewer
          customerId={customer.id}
          fullScreen
          onClose={() => setShowPropertyMaps(false)}
        />
      )}

      {/* Delete Ticket Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this ticket? This action cannot be undone.
              All comments, history, and linked data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTicketMutation.mutate()}
              disabled={deleteTicketMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteTicketMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Ticket Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Ticket</DialogTitle>
            <DialogDescription>
              Update the ticket details below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ticket title"
                data-testid="input-edit-title"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Ticket description (optional)"
                rows={3}
                data-testid="input-edit-description"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select 
                  value={editForm.priority} 
                  onValueChange={(value: "low" | "normal" | "high" | "urgent") => 
                    setEditForm(prev => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger id="edit-priority" data-testid="select-edit-priority">
                    <SelectValue placeholder="Select priority" />
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
                <Label htmlFor="edit-dueDate">Due Date</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm(prev => ({ ...prev, dueDate: e.target.value }))}
                  data-testid="input-edit-dueDate"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-workCompletedDate">Work Completed Date</Label>
              <Input
                id="edit-workCompletedDate"
                type="date"
                value={editForm.workCompletedDate}
                onChange={(e) => setEditForm(prev => ({ ...prev, workCompletedDate: e.target.value }))}
                data-testid="input-edit-workCompletedDate"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={editTicketMutation.isPending || !editForm.title.trim()}
              data-testid="button-save-edit"
            >
              {editTicketMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
