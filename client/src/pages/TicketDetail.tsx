import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MentionTextarea, renderMentionedText } from "@/components/MentionTextarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  UserRoundCheck,
  CornerDownLeft,
  Mail,
  RotateCw,
  Undo2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Ticket, TicketType, TicketTypeStatus, TicketTypeField, TicketFieldValue, TicketComment, TicketStatusHistory, Customer, Contact, Contract, ContractService, WorkType, TicketLink, User as UserType, CompanyUser, CustomerRateSheet, EmailLogWithDetails, ProposalWithDetails } from "@shared/schema";
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
  delegatedByUser: { id: string; email: string } | null;
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
  const { t } = useTranslation();
  const [, params] = useRoute("/dashboard/tickets/:id");
  const ticketId = params?.id;
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  
  const [newComment, setNewComment] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});
  const [statusNotes, setStatusNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "workflow" | "comments" | "history" | "emails">("overview");
  const [showPropertyMaps, setShowPropertyMaps] = useState(false);
  
  // Delegation state
  const [showDelegateDialog, setShowDelegateDialog] = useState(false);
  const [delegateTargetId, setDelegateTargetId] = useState<string | null>(null);
  
  // Proposal choice dialog state
  const [showProposalChoiceDialog, setShowProposalChoiceDialog] = useState(false);

  // Step-back state
  const [showStepBackDialog, setShowStepBackDialog] = useState(false);
  const [stepBackNotes, setStepBackNotes] = useState("");
  const [stepBackInvoiceWarning, setStepBackInvoiceWarning] = useState<{
    invoiceTicketId: string;
    invoiceTicketTitle: string;
    isCompleted: boolean;
  } | null>(null);
  
  
  // Completion email recipient state (multi-select)
  const [selectedRecipientEmails, setSelectedRecipientEmails] = useState<Set<string>>(new Set());

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
    invoiceCategory: null as "general_maintenance" | "snow" | null,
  });
  
  // Navigation for redirects
  const [, setLocation] = useLocation();
  
  // Check if current user can reassign or delegate tickets (admin, office, or super admin)
  const canReassign = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;
  const canDelegate = currentUser?.activeRole === "admin" || currentUser?.activeRole === "office" || currentUser?.isSuperAdminBool;
  
  // Check if current user can delete tickets (admin or office)
  const canDelete = currentUser?.activeRole === "admin" || currentUser?.activeRole === "office" || currentUser?.isSuperAdminBool;
  
  const canEdit = currentUser?.activeRole === "admin" || currentUser?.isSuperAdminBool;
  const isAdminOrOffice = currentUser?.activeRole === "admin" || currentUser?.activeRole === "office" || currentUser?.isSuperAdminBool;

  const { data: details, isLoading } = useQuery<TicketDetails>({
    queryKey: ["/api/tickets", ticketId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticket");
      return res.json();
    },
    enabled: !!ticketId,
  });

  // Fetch customer rate sheet for Invoice tickets
  const { data: rateSheet } = useQuery<CustomerRateSheet | null>({
    queryKey: ["/api/customers", details?.customer?.id, "rate-sheet"],
    enabled: !!details?.customer?.id && details?.ticketType?.name === "Invoice",
  });

  useSetBreadcrumbs([
    { label: t('ticketDetail.breadcrumb'), href: "/dashboard/tickets" },
    { label: details?.ticket?.title || t('common.loading') },
  ], [details?.ticket?.title]);

  // Fetch company users for reassignment/delegation dropdown
  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
    enabled: canReassign || canDelegate,
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
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my"] });
      toast({ title: t('ticketDetail.reassigned') });
    },
    onError: (error: Error) => {
      toast({ title: t('ticketDetail.reassignFailed'), description: error.message, variant: "destructive" });
    },
  });

  // Mutation to delegate ticket
  const delegateMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      return apiRequest("PATCH", `/api/tickets/${ticketId}`, {
        assignedToId: targetUserId,
        delegatedById: currentUser?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my"] });
      setShowDelegateDialog(false);
      setDelegateTargetId(null);
      toast({ title: t('ticketDetail.delegated') });
    },
    onError: (error: Error) => {
      toast({ title: t('ticketDetail.reassignFailed'), description: error.message, variant: "destructive" });
    },
  });

  // Mutation to delete ticket
  const deleteTicketMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/tickets/${ticketId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my"] });
      toast({ title: t('ticketDetail.deleted') });
      setLocation("/dashboard/tickets");
    },
    onError: (error: Error) => {
      toast({ title: t('tickets.deleteFailed'), description: error.message, variant: "destructive" });
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
      invoiceCategory?: "general_maintenance" | "snow" | null;
    }) => {
      return apiRequest("PATCH", `/api/tickets/${ticketId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my"] });
      setShowEditDialog(false);
      toast({ title: t('ticketDetail.updated') });
    },
    onError: (error: Error) => {
      toast({ title: t('tickets.unexpectedError'), description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ statusId, notes, confirmDeleteInvoice }: { statusId: string; notes?: string; confirmDeleteInvoice?: boolean }) => {
      const body: Record<string, unknown> = {
        currentStatusId: statusId,
        statusChangeNotes: notes,
      };
      if (confirmDeleteInvoice) {
        body.confirmDeleteInvoice = true;
      }
      
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      
      if (res.status === 409) {
        const data = await res.json();
        if (data.error === "INVOICE_COMPLETED") {
          throw { isInvoiceConflict: true, ...data };
        }
        throw new Error(`409: ${data.message || "Conflict"}`);
      }
      
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "proposals"] });
      setShowStatusDialog(false);
      setPendingStatusId(null);
      setFieldInputs({});
      setStatusNotes("");
      setStepBackInvoiceWarning(null);
      toast({ title: t('ticketDetail.statusUpdated') });
    },
    onError: (error: any) => {
      if (error?.isInvoiceConflict) {
        setStepBackInvoiceWarning({
          invoiceTicketId: error.invoiceTicketId,
          invoiceTicketTitle: error.invoiceTicketTitle,
          isCompleted: true,
        });
        return;
      }
      toast({ title: t('ticketDetail.statusUpdated'), description: error.message, variant: "destructive" });
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
      toast({ title: t('ticketDetail.commentAdded') });
    },
  });

  const { data: emailLogs = [] } = useQuery<EmailLogWithDetails[]>({
    queryKey: ["/api/email-logs", { ticketId }],
    queryFn: async () => {
      const res = await fetch(`/api/email-logs?ticketId=${ticketId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!ticketId && isAdminOrOffice,
  });

  const resendEmailMutation = useMutation({
    mutationFn: async (emailLogId: string) => {
      return apiRequest("POST", `/api/email-logs/${emailLogId}/resend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-logs", { ticketId }] });
      toast({ title: t('ticketDetail.emailResent') });
    },
    onError: () => {
      toast({ title: t('tickets.unexpectedError'), variant: "destructive" });
    },
  });

  const ticketWorkType = details?.ticket?.workType;
  const showProposals = isAdminOrOffice
    && (ticketWorkType === "estimate_request" || ticketWorkType === "project")
    && details?.ticketType?.name !== "Project (No Estimate)";

  const { data: linkedProposals = [], isLoading: proposalsLoading } = useQuery<ProposalWithDetails[]>({
    queryKey: ["/api/tickets", ticketId, "proposals"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/proposals`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showProposals && !!ticketId,
    staleTime: 0,
  });

  const customerId = details?.ticket?.customerId;
  const { data: customerContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/customers", customerId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId && isAdminOrOffice,
  });

  const contactEmailOptions = useMemo(() => {
    const options: { label: string; email: string; isPrimary: boolean }[] = [];
    for (const contact of customerContacts) {
      if (contact.emails && contact.emails.length > 0) {
        for (const email of contact.emails) {
          options.push({
            label: `${contact.name} — ${email}`,
            email,
            isPrimary: contact.isPrimary === "true",
          });
        }
      }
    }
    return options;
  }, [customerContacts]);

  useEffect(() => {
    if (contactEmailOptions.length > 0 && selectedRecipientEmails.size === 0) {
      const primaryEmails = contactEmailOptions.filter(o => o.isPrimary).map(o => o.email);
      if (primaryEmails.length > 0) {
        setSelectedRecipientEmails(new Set(primaryEmails));
      } else {
        setSelectedRecipientEmails(new Set([contactEmailOptions[0].email]));
      }
    }
  }, [contactEmailOptions]);

  const sendCompletionEmailMutation = useMutation({
    mutationFn: async (toEmails: string[]) => {
      return apiRequest("POST", `/api/tickets/${ticketId}/send-completion-email`, { toEmails });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-logs", { ticketId }] });
      toast({ title: t('ticketDetail.completionEmailSent') });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t('ticketDetail.completionEmailSent'), variant: "destructive" });
    },
  });

  if (isLoading || !details) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { ticket, ticketType, statuses, fieldValues, statusHistory, comments, customer, contract, contractServices = [], assignedUser, delegatedByUser, linkedTickets = [] } = details;
  const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const currentStatus = statuses.find(s => s.id === ticket.currentStatusId);
  const sortedStatuses = [...statuses].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedCurrentIndex = sortedStatuses.findIndex(s => s.id === ticket.currentStatusId);
  
  // Handle RFP Request branching at "Decision Received" status
  const getNextStatus = () => {
    // Use sorted index to find next status in order
    const defaultNext = sortedStatuses[sortedCurrentIndex + 1];
    
    // Check if this is at Decision Received - need to branch based on outcome
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

    if (currentStatus?.name === "Decision Received" && ticketType.name === "Project") {
      const decisionField = currentStatus.fields?.find(f => f.fieldKey === "decision_outcome");
      const decisionValue = decisionField ? fieldValues.find(fv => fv.fieldId === decisionField.id)?.value : null;

      if (decisionValue === "Denied") {
        return statuses.find(s => s.name === "Closed - Lost") || defaultNext;
      }
    }
    
    return defaultNext;
  };
  
  const nextStatus = getNextStatus();
  const previousStatus = sortedCurrentIndex > 0 ? sortedStatuses[sortedCurrentIndex - 1] : null;
  const isComplete = !!ticket.completedAt || currentStatus?.isFinal === "true";
  
  // Check if ticket is at "Ready to Schedule" on a Project workflow - show delegate option
  const isAtReadyToSchedule = currentStatus?.name === "Ready to Schedule"
    && (ticketType.name === "Project" || ticketType.name === "Project (No Estimate)");
  const isDelegated = !!ticket.delegatedById;
  
  // Check if ticket is waiting for a linked invoice to complete (hide advance button)
  const isAwaitingInvoiceCompletion = (() => {
    if (!linkedTickets?.length) return false;
    const linkedInvoice = linkedTickets.find(
      lt => lt.link.linkType === "invoice_for" && lt.relationship === "source" && lt.ticket
    );
    if (!linkedInvoice) return false;
    const invoiceComplete = linkedInvoice.currentStatus?.isFinal === "true";
    // Block advancement if at "Ready for Billing" with a pending invoice (any ticket type)
    const isAtBillingStatus = currentStatus?.name === "Ready for Billing";
    return isAtBillingStatus && !invoiceComplete;
  })();

  const handleAdvanceStatus = (bypassProposalCheck = false) => {
    if (!nextStatus) return;

    // Intercept: Project ticket advancing from Estimating → Create Proposal
    if (
      !bypassProposalCheck &&
      currentStatus?.name === "Estimating" &&
      ticketType?.name === "Project" &&
      nextStatus?.name === "Create Proposal"
    ) {
      setShowProposalChoiceDialog(true);
      return;
    }
    
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
      updateStatusMutation.mutate({ 
        statusId: nextStatus.id,
      });
    }
  };

  const handleStepBack = () => {
    if (!previousStatus) return;
    setStepBackInvoiceWarning(null);
    setShowStepBackDialog(true);
  };

  const handleConfirmStepBack = (forceDeleteInvoice?: boolean) => {
    if (!previousStatus) return;
    updateStatusMutation.mutate({
      statusId: previousStatus.id,
      notes: stepBackNotes || `Stepped back to ${previousStatus.name}`,
      confirmDeleteInvoice: forceDeleteInvoice || false,
    }, {
      onSuccess: () => {
        setShowStepBackDialog(false);
        setStepBackNotes("");
        setStepBackInvoiceWarning(null);
      },
    });
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatusId) return;

    // Intercept: if the pending target is "Create Proposal" on a Project ticket,
    // close the field dialog and show the proposal choice dialog instead.
    const pendingTargetStatus = statuses.find(s => s.id === pendingStatusId);
    if (
      pendingTargetStatus?.name === "Create Proposal" &&
      ticketType?.name === "Project"
    ) {
      // Save any current-status field values entered by the user before showing choice
      for (const [fieldId, value] of Object.entries(fieldInputs)) {
        if (value) {
          try { await saveFieldValueMutation.mutateAsync({ fieldId, value }); } catch {}
        }
      }
      setShowStatusDialog(false);
      setShowProposalChoiceDialog(true);
      return;
    }
    
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
    
    // Handle Project decision branching
    if (currentStatus?.name === "Decision Received" && ticketType.name === "Project") {
      const decisionField = currentStatusFields.find(f => f.fieldKey === "decision_outcome");
      const decisionValue = decisionField ? fieldInputs[decisionField.id] : null;
      
      if (decisionValue === "Denied") {
        // Go to Closed - Lost
        const lostStatus = statuses.find(s => s.name === "Closed - Lost");
        if (lostStatus) actualTargetStatusId = lostStatus.id;
      }
      // Approved continues to natural next step (Work Completed)
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
    });
  };

  const handleUseProposalMaker = () => {
    setShowProposalChoiceDialog(false);
    // Move to "Create Proposal" status directly (fields already saved if we came via field dialog)
    const createProposalStatus = statuses.find(s => s.name === "Create Proposal");
    if (createProposalStatus) {
      updateStatusMutation.mutate({ statusId: createProposalStatus.id });
    } else {
      // Fallback: use normal advance flow with bypass
      handleAdvanceStatus(true);
    }
  };

  const handleSkipProposal = () => {
    const decisionStatus = statuses.find(s => s.name === "Decision Received");
    if (decisionStatus) {
      updateStatusMutation.mutate({ statusId: decisionStatus.id, notes: "Proposal steps skipped" });
    }
    setShowProposalChoiceDialog(false);
  };

  const getFieldValue = (fieldId: string) => {
    return fieldValues.find(fv => fv.fieldId === fieldId)?.value || "";
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
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
      invoiceCategory: ticket.invoiceCategory as "general_maintenance" | "snow" | null,
    });
    setShowEditDialog(true);
  };

  // Save ticket edits
  const handleSaveEdit = () => {
    const updates: any = {
      title: editForm.title,
      description: editForm.description || null,
      priority: editForm.priority,
      dueDate: editForm.dueDate ? new Date(editForm.dueDate + "T12:00:00") : null,
      workCompletedDate: editForm.workCompletedDate ? new Date(editForm.workCompletedDate + "T12:00:00") : null,
      invoiceCategory: editForm.invoiceCategory,
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
            <Badge 
              variant="secondary" 
              className="text-xs"
              style={{ 
                backgroundColor: ticketType.color ? `${ticketType.color}20` : undefined,
                borderColor: ticketType.color || undefined,
                color: ticketType.color || undefined,
              }}
              data-testid="badge-ticket-type"
            >
              {ticketType.name}
            </Badge>
            {isComplete && (
              <Badge variant="default" className="text-xs bg-green-600">
                <Check className="w-3 h-3 mr-1" />
                {t('statuses.completed')}
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
          {t('ticketDetail.tabs.overview')}
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
          {t('ticketDetail.tabs.workflow')}
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
        {isAdminOrOffice && (
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "emails"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("emails")}
            data-testid="tab-emails"
          >
            <Mail className="w-4 h-4" />
            {emailLogs.length > 0 && <span className="text-xs">({emailLogs.length})</span>}
          </button>
        )}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card data-testid="card-ticket-summary">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('common.priority')}</p>
                  <div className={`flex items-center gap-1.5 ${priority.textColor}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${priority.color}`} />
                    <span className="font-medium">{priority.label}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('tickets.workType')}</p>
                  {ticket.workType && WORK_TYPE_CATALOG[ticket.workType as WorkType] ? (
                    <Badge 
                      variant={WORK_TYPE_CATALOG[ticket.workType as WorkType].badgeVariant}
                      data-testid="badge-worktype"
                    >
                      {WORK_TYPE_CATALOG[ticket.workType as WorkType].billingLabel}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('common.none')}</span>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('common.status')}</p>
                  <Badge variant="outline" className="font-medium">
                    {currentStatus?.name || t('common.unknown')}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('ticketDetail.dueDate')}</p>
                  {ticket.dueDate ? (
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{format(new Date(ticket.dueDate), "MMM d, yyyy")}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('common.none')}</span>
                  )}
                </div>

                {ticket.workCompletedDate && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('ticketDetail.workCompletedDate')}</p>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{format(new Date(ticket.workCompletedDate), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                )}

                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('ticketDetail.assignedTo')}</p>
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
                          <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
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
                      <span className="font-medium">{assignedUser?.email || t('common.unassigned')}</span>
                    </div>
                  )}
                </div>
                
                {isDelegated && delegatedByUser && (
                  <div className="col-span-2 space-y-1" data-testid="delegation-indicator">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('ticketDetail.delegateTicket')}</p>
                    <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                      <CornerDownLeft className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{delegatedByUser.email}</span>
                        <p className="text-xs text-amber-600 dark:text-amber-400">{t('ticketDetail.delegateTicket')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Service Request Type for RFP tickets */}
          {ticketType.name === "RFP Request" && (
            <Card data-testid="card-service-request">
              <CardContent className="p-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('newTicket.serviceRequestType')}</p>
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
                  {t('common.description')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>
          )}

          {customer && (
            <Card data-testid="card-customer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {t('common.customer')} & {t('common.property')}
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
                      {t('customerDetail.tabs.maps')}
                    </Button>
                    <Link href={`/dashboard/customers/${customer.id}`}>
                      <Button variant="outline" size="sm" data-testid="button-view-customer">
                        {t('common.view')}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {contract && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">{t('common.contract')}</p>
                    <Link href={`/dashboard/customers/${customer.id}`}>
                      <Badge variant="secondary" className="hover-elevate cursor-pointer">
                        {contract.serviceType?.replace(/_/g, " ") || "Contract"}
                      </Badge>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {linkedTickets && linkedTickets.length > 0 && (
            <Card data-testid="card-linked-tickets">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  {t('ticketDetail.linkedTickets')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {linkedTickets.map((linked) => {
                  if (!linked.ticket) return null;
                  
                  let linkLabel = "Related ticket";
                  const isSource = linked.relationship === "source";
                  
                  if (linked.link.linkType === "invoice_for") {
                    linkLabel = isSource ? "Invoice generated for this work" : "Original billable work";
                  } else if (linked.link.linkType === "project_for") {
                    linkLabel = isSource ? "Project created from this request" : "Source RFP Request";
                  }
                  
                  const isChild = (linked.link.linkType === "invoice_for" || linked.link.linkType === "project_for") && isSource;
                  
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

          {showProposals && (() => {
            const ticket = details?.ticket;
            const params = new URLSearchParams({
              ticketId: ticketId ?? "",
              ticketTitle: ticket?.title ?? "",
              ...(ticket?.customerId ? { customerId: ticket.customerId } : {}),
            });
            const proposalMakerUrl = `/dashboard/tools/proposals?${params.toString()}`;

            if (proposalsLoading) {
              return (
                <div className="h-9 bg-muted animate-pulse rounded-md" />
              );
            }

            if (linkedProposals.length === 0) {
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full justify-start"
                  onClick={() => setLocation(proposalMakerUrl)}
                  data-testid="button-open-proposal-maker"
                >
                  <FileText className="w-4 h-4" />
                  {t('ticketDetail.openProposalMaker')}
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </Button>
              );
            }

            return (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {linkedProposals.length === 1 ? "Proposal" : "Proposals"}
                </p>
                {linkedProposals.map((proposal) => {
                  const statusBadge = (() => {
                    if (proposal.status === "finalized") {
                      return <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/50" data-testid={`badge-proposal-status-${proposal.id}`}>Finalized</Badge>;
                    }
                    if (proposal.status === "published") {
                      return <Badge data-testid={`badge-proposal-status-${proposal.id}`}>Published</Badge>;
                    }
                    return <Badge variant="secondary" data-testid={`badge-proposal-status-${proposal.id}`}>Draft</Badge>;
                  })();

                  return (
                    <Card key={proposal.id} data-testid={`card-linked-proposal-${proposal.id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              {proposal.proposalNumber && (
                                <p className="text-xs font-mono text-muted-foreground" data-testid={`text-proposal-number-${proposal.id}`}>{proposal.proposalNumber}</p>
                              )}
                              <span className="text-sm font-medium truncate">{proposal.title}</span>
                            </div>
                          </div>
                          {statusBadge}
                        </div>
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 w-full justify-start"
                            onClick={() => {
                              const p = new URLSearchParams({
                                ticketId: ticketId ?? "",
                                ticketTitle: details?.ticket?.title ?? "",
                              });
                              setLocation(`/dashboard/tools/proposals/${proposal.id}?${p.toString()}`);
                            }}
                            data-testid={`button-view-proposal-${proposal.id}`}
                          >
                            {t('common.view')}
                            <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 w-full justify-start text-muted-foreground"
                  onClick={() => setLocation(proposalMakerUrl)}
                  data-testid="button-open-proposal-maker"
                >
                  <Plus className="w-4 h-4" />
                  {t('ticketDetail.openProposalMaker')}
                </Button>
              </div>
            );
          })()}

          {(() => {
            const isAtBillingOrFinal = (
              currentStatus?.name === "Ready for Billing" || 
              currentStatus?.isFinal === "true"
            );
            const linkedInvoice = linkedTickets?.find(
              lt => lt.link.linkType === "invoice_for" && lt.relationship === "source" && lt.ticket
            );
            
            if (isAtBillingOrFinal && linkedInvoice?.ticket && ticketType?.name !== "Invoice") {
              const invoiceCompleted = linkedInvoice.currentStatus?.isFinal === "true";
              return (
                <Card className={invoiceCompleted ? "border-green-500/50" : "border-primary/50"} data-testid="card-invoice-action">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2 rounded-md ${invoiceCompleted ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"}`}>
                        <FileText className={`w-5 h-5 ${invoiceCompleted ? "text-green-600 dark:text-green-400" : "text-primary"}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {invoiceCompleted ? "Invoice Completed" : "Invoice Pending"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invoiceCompleted 
                            ? "The linked invoice has been completed. This ticket will auto-advance."
                            : "Complete the linked invoice ticket to advance this ticket to its final status."
                          }
                        </p>
                      </div>
                    </div>
                    <Link href={`/dashboard/tickets/${linkedInvoice.ticket.id}`}>
                      <Button variant={invoiceCompleted ? "outline" : "default"} className="w-full" data-testid="button-go-to-invoice">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {invoiceCompleted ? "View Invoice Ticket" : "Go to Invoice Ticket"}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            }
            return null;
          })()}

          {ticketType?.name === "Invoice" && rateSheet && ticket?.invoiceCategory && (
            <Card data-testid="card-rate-sheet">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {ticket.invoiceCategory === "snow" ? "Snow & Ice Rates" : "Maintenance Rates"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm space-y-2 bg-muted/30 p-3 rounded-md">
                  {ticket.invoiceCategory === "snow" ? (
                    <>
                      {rateSheet.handShovelLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Hand Shovel:</span>
                          <span className="font-medium">${(rateSheet.handShovelLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.plowTruck !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Plow Truck:</span>
                          <span className="font-medium">${(rateSheet.plowTruck / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.atv !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ATV:</span>
                          <span className="font-medium">${(rateSheet.atv / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.skidSteer !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Skid Steer:</span>
                          <span className="font-medium">${(rateSheet.skidSteer / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.snowBlower !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Snow Blower:</span>
                          <span className="font-medium">${(rateSheet.snowBlower / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.iceMeltMaterial !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ice Melt Material:</span>
                          <span className="font-medium">${(rateSheet.iceMeltMaterial / 100).toFixed(2)}/lb</span>
                        </div>
                      )}
                      {rateSheet.iceMeltApplicationLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ice Melt Application:</span>
                          <span className="font-medium">${(rateSheet.iceMeltApplicationLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {rateSheet.generalLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">General Labor:</span>
                          <span className="font-medium">${(rateSheet.generalLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.operatorLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Operator Labor:</span>
                          <span className="font-medium">${(rateSheet.operatorLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.irrigationLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Irrigation Labor:</span>
                          <span className="font-medium">${(rateSheet.irrigationLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.emergencyGeneralLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Emergency General:</span>
                          <span className="font-medium">${(rateSheet.emergencyGeneralLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                      {rateSheet.emergencyIrrigationLabor !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Emergency Irrigation:</span>
                          <span className="font-medium">${(rateSheet.emergencyIrrigationLabor / 100).toFixed(2)}/hr</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {fieldValues.length > 0 && (() => {
            const allFields = statuses.flatMap(s => (s.fields || []).map(f => ({ ...f, statusName: s.name, statusColor: s.color })));
            const filledFields = allFields.filter(f => {
              const val = fieldValues.find(fv => fv.fieldId === f.id);
              return val && val.value.trim() !== "";
            });
            if (filledFields.length === 0) return null;

            const statusOrder = statuses.map(s => s.name);
            const groupedByStatus: Record<string, typeof filledFields> = {};
            for (const field of filledFields) {
              if (!groupedByStatus[field.statusName]) groupedByStatus[field.statusName] = [];
              groupedByStatus[field.statusName].push(field);
            }
            const sortedGroups = Object.entries(groupedByStatus).sort(
              ([a], [b]) => statusOrder.indexOf(a) - statusOrder.indexOf(b)
            );

            const formatFieldValue = (field: typeof filledFields[0], value: string) => {
              if (field.fieldType === "currency") {
                const num = parseFloat(value);
                return isNaN(num) ? value : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
              if (field.fieldType === "date") {
                try { return format(new Date(value), "MMM d, yyyy"); } catch { return value; }
              }
              return value;
            };

            return (
              <Card data-testid="card-collected-details">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />
                    {t('common.details')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {sortedGroups.map(([statusName, fields]) => (
                    <div key={statusName}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: fields[0]?.statusColor || "#6b7280" }}
                        />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {statusName}
                        </p>
                      </div>
                      <div className="space-y-1 ml-4">
                        {fields.sort((a, b) => a.displayOrder - b.displayOrder).map((field) => {
                          const fv = fieldValues.find(v => v.fieldId === field.id);
                          if (!fv) return null;
                          const displayValue = formatFieldValue(field, fv.value);
                          const isLongText = field.fieldType === "textarea" && fv.value.length > 60;
                          return (
                            <div key={field.id} className={isLongText ? "" : "flex items-baseline justify-between gap-2"} data-testid={`field-value-${field.fieldKey}`}>
                              <span className="text-xs text-muted-foreground shrink-0">{field.fieldLabel}</span>
                              {isLongText ? (
                                <p className="text-sm whitespace-pre-wrap mt-0.5">{displayValue}</p>
                              ) : (
                                <span className="text-sm font-medium text-right">{displayValue}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

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
                      {t('ticketDetail.location')}
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
                  {t('ticketDetail.photos')} ({ticket.photos.length})
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

          {ticket.documents && ticket.documents.length > 0 && ticket.workType === "estimate_request" && (
            <Card data-testid="card-documents">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t('ticketDetail.documents')} ({ticket.documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="space-y-2">
                  {ticket.documents.map((doc, index) => {
                    const docUrl = doc.startsWith("/objects/") 
                      ? doc 
                      : `/objects/${doc.replace(/^\/[^/]+\/[^/]+\//, "")}`;
                    const fileName = ticket.documentNames?.[index] || `Document ${index + 1}`;
                    return (
                      <a
                        key={index}
                        href={docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-md border hover:ring-2 hover:ring-primary transition-all bg-muted/30"
                        data-testid={`document-link-${index}`}
                      >
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate flex-1">{fileName}</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
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
                  {t('ticketDetail.tabs.comments')}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("comments")} data-testid="button-view-all-comments">
                  {t('common.view')}
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

          {isAdminOrOffice && (isComplete || currentStatus?.isFinal === "true") && ticket.customerId && (
            <Card data-testid="card-overview-send-email">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('ticketDetail.sendCompletionEmail')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('ticketDetail.sendCompletionEmail')}
                    </p>
                  </div>
                </div>
                {contactEmailOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{t('ticketDetail.sendCompletionEmail')}</Label>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        data-testid="button-overview-select-all-recipients"
                        onClick={() => {
                          const allEmails = contactEmailOptions.map(o => o.email);
                          const allSelected = allEmails.every(e => selectedRecipientEmails.has(e));
                          if (allSelected) {
                            setSelectedRecipientEmails(new Set());
                          } else {
                            setSelectedRecipientEmails(new Set(allEmails));
                          }
                        }}
                      >
                        {contactEmailOptions.every(o => selectedRecipientEmails.has(o.email)) ? t('common.clear') : t('common.select')}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {contactEmailOptions.map((opt) => (
                        <label
                          key={opt.email}
                          className="flex items-center gap-2 text-sm cursor-pointer rounded p-1 hover-elevate"
                          data-testid={`checkbox-overview-recipient-${opt.email}`}
                        >
                          <Checkbox
                            checked={selectedRecipientEmails.has(opt.email)}
                            onCheckedChange={(checked) => {
                              setSelectedRecipientEmails(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(opt.email);
                                else next.delete(opt.email);
                                return next;
                              });
                            }}
                          />
                          <span>{opt.label}{opt.isPrimary ? " (Primary)" : ""}</span>
                        </label>
                      ))}
                    </div>
                    <Button
                      variant="default"
                      onClick={() => {
                        const emails = Array.from(selectedRecipientEmails);
                        if (emails.length > 0) sendCompletionEmailMutation.mutate(emails);
                      }}
                      disabled={sendCompletionEmailMutation.isPending || selectedRecipientEmails.size === 0}
                      data-testid="button-overview-send-completion-email"
                    >
                      {sendCompletionEmailMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {t('ticketDetail.sendCompletionEmail')} ({selectedRecipientEmails.size})
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('customers.noCustomersFound')}
                  </p>
                )}
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
            const isCurrent = status.id === ticket.currentStatusId;
            const currentStatusOrder = sortedStatuses.find(s => s.id === ticket.currentStatusId)?.displayOrder ?? 0;
            const isCompleted = visitedIds.has(status.id) && !isCurrent && (parseInt(String(status.displayOrder)) <= parseInt(String(currentStatusOrder)));
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
                          <Badge variant="secondary" className="text-xs">{t('statuses.active')}</Badge>
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
                <p className="text-sm text-muted-foreground">{t('tickets.noTicketsFound')}</p>
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
                        <p className="text-sm whitespace-pre-wrap">{renderMentionedText(comment.body)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-3">
              <MentionTextarea
                placeholder="Add a comment... Type @ to mention someone"
                value={newComment}
                onChange={setNewComment}
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
                      {t('ticketDetail.sendComment')}
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
                <p className="text-sm text-muted-foreground">{t('ticketDetail.activityLog')}</p>
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

      {activeTab === "emails" && isAdminOrOffice && (
        <div className="space-y-2">
          {(isComplete || currentStatus?.isFinal === "true") && ticket.customerId && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">{t('ticketDetail.sendCompletionEmail')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('ticketDetail.sendCompletionEmail')}
                  </p>
                </div>
                {contactEmailOptions.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{t('ticketDetail.sendCompletionEmail')}</Label>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        data-testid="button-select-all-recipients"
                        onClick={() => {
                          const allEmails = contactEmailOptions.map(o => o.email);
                          const allSelected = allEmails.every(e => selectedRecipientEmails.has(e));
                          if (allSelected) {
                            setSelectedRecipientEmails(new Set());
                          } else {
                            setSelectedRecipientEmails(new Set(allEmails));
                          }
                        }}
                      >
                        {contactEmailOptions.every(o => selectedRecipientEmails.has(o.email)) ? t('common.clear') : t('common.select')}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {contactEmailOptions.map((opt) => (
                        <label
                          key={opt.email}
                          className="flex items-center gap-2 text-sm cursor-pointer rounded p-1 hover-elevate"
                          data-testid={`checkbox-recipient-${opt.email}`}
                        >
                          <Checkbox
                            checked={selectedRecipientEmails.has(opt.email)}
                            onCheckedChange={(checked) => {
                              setSelectedRecipientEmails(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(opt.email);
                                else next.delete(opt.email);
                                return next;
                              });
                            }}
                          />
                          <span>{opt.label}{opt.isPrimary ? " (Primary)" : ""}</span>
                        </label>
                      ))}
                    </div>
                    <Button
                      variant="default"
                      onClick={() => {
                        const emails = Array.from(selectedRecipientEmails);
                        if (emails.length > 0) sendCompletionEmailMutation.mutate(emails);
                      }}
                      disabled={sendCompletionEmailMutation.isPending || selectedRecipientEmails.size === 0}
                      data-testid="button-send-completion-email"
                    >
                      {sendCompletionEmailMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      {t('ticketDetail.sendCompletionEmail')} ({selectedRecipientEmails.size})
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('customers.noCustomersFound')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {emailLogs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {(isComplete || currentStatus?.isFinal === "true")
                    ? t('ticketDetail.sendCompletionEmail')
                    : t('ticketDetail.emailResent')}
                </p>
              </CardContent>
            </Card>
          ) : (
            emailLogs.map((log) => (
              <Card key={log.id} data-testid={`email-log-${log.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{log.subject}</p>
                        <Badge
                          variant={log.status === "sent" || log.status === "delivered" ? "default" : log.status === "failed" || log.status === "bounced" ? "destructive" : "secondary"}
                          className="text-xs"
                          data-testid={`email-status-${log.id}`}
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        To: {log.toEmail}
                      </p>
                      {log.customerName && (
                        <p className="text-xs text-muted-foreground">
                          Customer: {log.customerName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.sentAt
                          ? `Sent ${formatDistanceToNow(new Date(log.sentAt), { addSuffix: true })}`
                          : `Created ${formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}`}
                      </p>
                      {log.errorJson && (
                        <p className="text-xs text-destructive mt-1">
                          Error: {typeof log.errorJson === 'object' && log.errorJson !== null && 'message' in log.errorJson ? String((log.errorJson as any).message) : 'Unknown error'}
                        </p>
                      )}
                    </div>
                    {canEdit && (log.status === "failed" || log.status === "bounced") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => resendEmailMutation.mutate(log.id)}
                        disabled={resendEmailMutation.isPending}
                        data-testid={`button-resend-email-${log.id}`}
                      >
                        <RotateCw className={`w-4 h-4 ${resendEmailMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {isAwaitingInvoiceCompletion && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('ticketDetail.linkedTickets')}</span>
          </div>
        </div>
      )}

      {nextStatus && !isComplete && !isAwaitingInvoiceCompletion && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          {isAtReadyToSchedule && !isDelegated && canDelegate ? (
            <div className="flex gap-2">
              {isAdminOrOffice && previousStatus && (
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={handleStepBack}
                  disabled={updateStatusMutation.isPending}
                  data-testid="button-step-back"
                >
                  <Undo2 className="w-5 h-5" />
                </Button>
              )}
              <Button 
                variant="outline"
                className="flex-1 h-12 text-base gap-2" 
                onClick={() => setShowDelegateDialog(true)}
                data-testid="button-delegate-ticket"
              >
                <UserRoundCheck className="w-5 h-5" />
                {t('ticketDetail.delegateTicket')}
              </Button>
              <Button 
                className="flex-1 h-12 text-base gap-2" 
                onClick={() => handleAdvanceStatus()}
                disabled={updateStatusMutation.isPending}
                data-testid="button-advance-status"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Move to: {nextStatus.name}
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {isAdminOrOffice && previousStatus && (
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={handleStepBack}
                  disabled={updateStatusMutation.isPending}
                  data-testid="button-step-back"
                >
                  <Undo2 className="w-5 h-5" />
                </Button>
              )}
              <Button 
                className="flex-1 h-12 text-base gap-2" 
                onClick={() => handleAdvanceStatus()}
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
        </div>
      )}

      {isComplete && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:left-64">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 flex-1 justify-center">
              <Check className="w-5 h-5" />
              <span className="font-medium">{t('statuses.completed')}</span>
            </div>
            {isAdminOrOffice && previousStatus && (
              <Button 
                variant="outline"
                className="gap-2 shrink-0"
                onClick={handleStepBack}
                disabled={updateStatusMutation.isPending}
                data-testid="button-step-back-completed"
              >
                <Undo2 className="w-4 h-4" />
                {t('ticketDetail.stepBack')}
              </Button>
            )}
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
                ? "Select Approved to continue to Work Completed, or Denied to close the project."
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
              <Label htmlFor="statusNotes">{t('ticketDetail.statusChangeNotes')}</Label>
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
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleConfirmStatusChange}
              disabled={updateStatusMutation.isPending || saveFieldValueMutation.isPending}
              data-testid="button-confirm-status"
            >
              {(updateStatusMutation.isPending || saveFieldValueMutation.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('common.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showStepBackDialog} onOpenChange={(open) => { setShowStepBackDialog(open); if (!open) { setStepBackInvoiceWarning(null); setStepBackNotes(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{stepBackInvoiceWarning ? "Warning: Invoice Ticket Will Be Deleted" : `Step Back to: ${previousStatus?.name}`}</DialogTitle>
            <DialogDescription>
              {stepBackInvoiceWarning 
                ? "A completed Invoice ticket is linked to this ticket. Stepping back will permanently delete it."
                : "Move this ticket back to the previous status. This will clear any data entered at the steps being undone and be recorded in the workflow history."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {stepBackInvoiceWarning ? (
              <div className="p-3 rounded-md border border-destructive bg-destructive/10 space-y-2">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">{t('ticketDetail.deleteTicket')}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Invoice ticket "{stepBackInvoiceWarning.invoiceTicketTitle}" has already been completed. 
                  Stepping back past "Ready for Billing" will permanently delete this invoice ticket and all its data.
                </p>
                <p className="text-sm font-medium text-destructive">This action cannot be undone.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-md border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm line-through" data-testid="text-current-status">{currentStatus?.name}</span>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium text-foreground" data-testid="text-target-status">{previousStatus?.name}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="step-back-notes">{t('ticketDetail.statusChangeNotes')}</Label>
                  <Textarea
                    id="step-back-notes"
                    placeholder="Why is this ticket being stepped back?"
                    value={stepBackNotes}
                    onChange={(e) => setStepBackNotes(e.target.value)}
                    rows={3}
                    data-testid="input-step-back-notes"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowStepBackDialog(false); setStepBackNotes(""); setStepBackInvoiceWarning(null); }} data-testid="button-cancel-step-back">
              {t('common.cancel')}
            </Button>
            {stepBackInvoiceWarning ? (
              <Button 
                variant="destructive"
                onClick={() => handleConfirmStepBack(true)}
                disabled={updateStatusMutation.isPending}
                data-testid="button-confirm-delete-invoice"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                Delete Invoice & Step Back
              </Button>
            ) : (
              <Button 
                onClick={() => handleConfirmStepBack()}
                disabled={updateStatusMutation.isPending}
                data-testid="button-confirm-step-back"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Undo2 className="w-4 h-4 mr-2" />
                )}
                {t('ticketDetail.stepBack')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPropertyMaps && customer && (
        <LayerMapViewer
          customerId={customer.id}
          fullScreen
          onClose={() => setShowPropertyMaps(false)}
        />
      )}

      {/* Delegate Ticket Dialog */}
      <Dialog open={showDelegateDialog} onOpenChange={(open) => {
        setShowDelegateDialog(open);
        if (!open) setDelegateTargetId(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ticketDetail.delegateTicket')}</DialogTitle>
            <DialogDescription>
              Choose a team member to handle this work. When they mark it as completed, the ticket will automatically return to you for the final billing steps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('ticketDetail.assignedTo')}</Label>
              <Select
                value={delegateTargetId || ""}
                onValueChange={setDelegateTargetId}
              >
                <SelectTrigger data-testid="select-delegate-target">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers
                    .filter(m => m.id !== currentUser?.id)
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id} data-testid={`delegate-option-${member.id}`}>
                        {member.name} ({member.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelegateDialog(false)} data-testid="button-cancel-delegate">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (delegateTargetId) {
                  delegateMutation.mutate(delegateTargetId);
                }
              }}
              disabled={!delegateTargetId || delegateMutation.isPending}
              data-testid="button-confirm-delegate"
            >
              {delegateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <UserRoundCheck className="w-4 h-4 mr-2" />
              )}
              {t('ticketDetail.delegate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Ticket Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ticketDetail.deleteTicket')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ticketDetail.deleteConfirm')} {t('ticketDetail.cannotUndo')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTicketMutation.mutate()}
              disabled={deleteTicketMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteTicketMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Ticket Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
            <DialogDescription>
              {t('common.edit')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t('newTicket.titleLabel')}</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ticket title"
                data-testid="input-edit-title"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('common.description')}</Label>
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
                <Label htmlFor="edit-priority">{t('common.priority')}</Label>
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
                    <SelectItem value="low">{t('priorities.low')}</SelectItem>
                    <SelectItem value="normal">{t('priorities.normal')}</SelectItem>
                    <SelectItem value="high">{t('priorities.high')}</SelectItem>
                    <SelectItem value="urgent">{t('priorities.urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-dueDate">{t('ticketDetail.dueDate')}</Label>
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
              <Label htmlFor="edit-workCompletedDate">{t('ticketDetail.workCompletedDate')}</Label>
              <Input
                id="edit-workCompletedDate"
                type="date"
                value={editForm.workCompletedDate}
                onChange={(e) => setEditForm(prev => ({ ...prev, workCompletedDate: e.target.value }))}
                data-testid="input-edit-workCompletedDate"
              />
            </div>

            {ticketType?.name === "Invoice" && (
              <div className="space-y-2">
                <Label htmlFor="edit-invoiceCategory">{t('ticketDetail.invoiceCategory')}</Label>
                <Select 
                  value={editForm.invoiceCategory || ""} 
                  onValueChange={(value: "general_maintenance" | "snow") => 
                    setEditForm(prev => ({ ...prev, invoiceCategory: value }))
                  }
                >
                  <SelectTrigger id="edit-invoiceCategory" data-testid="select-edit-invoice-category">
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
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={editTicketMutation.isPending || !editForm.title.trim()}
              data-testid="button-save-edit"
            >
              {editTicketMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proposal Choice Dialog */}
      <Dialog open={showProposalChoiceDialog} onOpenChange={setShowProposalChoiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Proposal Maker?</DialogTitle>
            <DialogDescription>
              Would you like to create a formal proposal for this project using the Proposal Maker tool?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSkipProposal}
              disabled={updateStatusMutation.isPending}
              data-testid="button-skip-proposal"
            >
              No, skip to decision
            </Button>
            <Button
              className="flex-1"
              onClick={handleUseProposalMaker}
              disabled={updateStatusMutation.isPending}
              data-testid="button-use-proposal-maker"
            >
              Yes, use Proposal Maker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
