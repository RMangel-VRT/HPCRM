import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractApiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DatePickerField } from "@/components/DatePickerField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Clock,
  SkipForward,
  Camera,
  X,
  RotateCcw,
  MapPin,
  User,
  Layers,
  ExternalLink,
  CalendarDays,
  StickyNote,
  ImageIcon,
  Mail,
  Wrench,
  Send,
  AlertCircle,
  Activity,
  ChevronDown,
  ChevronRight,
  Archive,
  ClipboardList,
  FlaskConical,
  Eye,
  FileText,
  Upload,
  Maximize2,
} from "lucide-react";
import type { CampaignChecklistAuditLogWithUser } from "@shared/schema";
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
import { Separator } from "@/components/ui/separator";
import type { Campaign, CampaignItem, CampaignChecklistTask, Contact } from "@shared/schema";
import LayerMapViewer from "@/components/LayerMapViewer";
import WeatherCapturePanel, { type WeatherCapturableItem } from "@/components/WeatherCapturePanel";
import { Label } from "@/components/ui/label";

interface CampaignItemWithUser extends Omit<CampaignItem,
  | 'completionEmailSentAt'
  | 'workCompletedAt'
  | 'completionPhotoStorageKeys'
  | 'weatherTemp'
  | 'weatherWindSpeed'
  | 'weatherWindDirection'
  | 'weatherHumidity'
  | 'weatherConditions'
  | 'weatherRecordedAt'
  | 'finishedWithoutComms'
  | 'actualAreasTreated'
  | 'actualConditions'
  | 'completionNotes'
  | 'postApplicationExpectationOverride'
  | 'postApplicationWateringOverride'
  | 'reEntryIntervalOverride'
  | 'mowingRestrictionOverride'
  | 'labelPdfOverrideKey'
  | 'chemicalProductId'
  | 'applicatorUserId'
  | 'workCompletedById'
> {
  completedByName?: string | null;
  preCommSentByName?: string | null;
  workCompletedByName?: string | null;
  postCommSentByName?: string | null;
  customerType?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  customerAddress?: string;
  finishedWithoutComms?: string | null;
  weatherTemp?: number | null;
  weatherWindSpeed?: number | null;
  weatherWindDirection?: string | null;
  weatherHumidity?: number | null;
  weatherConditions?: string | null;
  weatherRecordedAt?: string | null;
  actualAreasTreated?: string | null;
  actualConditions?: string | null;
  completionNotes?: string | null;
  completionPhotoStorageKeys?: string[] | null;
  postApplicationExpectationOverride?: string | null;
  postApplicationWateringOverride?: string | null;
  reEntryIntervalOverride?: string | null;
  mowingRestrictionOverride?: string | null;
  labelPdfOverrideKey?: string | null;
  completionEmailSentAt?: string | null;
  workCompletedAt?: string | null;
  workCompletedById?: string | null;
  chemicalProductId?: string | null;
  applicatorUserId?: string | null;
}

interface CampaignDetailData extends Campaign {
  items: CampaignItemWithUser[];
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  assignedToName?: string;
  createdByName?: string;
  checklistTasks?: CampaignChecklistTask[];
  itemTaskCompletions?: Record<string, string[]>;
  notificationTemplateName?: string | null;
}

function highlightUnresolvedVars(html: string): string {
  return html.replace(/\{\{[^}]+\}\}/g, (match) =>
    `<span style="background-color:#fef08a;padding:0 2px;border-radius:3px;font-weight:600;color:#78350f;">${match}</span>`,
  );
}

function countUnresolvedVars(subject: string, htmlBody: string): number {
  const matches = [
    ...(subject.match(/\{\{[^}]+\}\}/g) ?? []),
    ...(htmlBody.match(/\{\{[^}]+\}\}/g) ?? []),
  ];
  return new Set(matches).size;
}

function renderSubjectWithHighlights(subject: string): React.ReactNode {
  if (!subject) return '—';
  const parts = subject.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <span
        key={i}
        style={{ backgroundColor: '#fef08a', padding: '0 2px', borderRadius: '3px', fontWeight: 600, color: '#78350f' }}
      >
        {part}
      </span>
    ) : (
      part || null
    ),
  );
}

export default function CampaignItemDetail() {
  const { id: campaignId, itemId } = useParams<{ id: string; itemId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [notes, setNotes] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [exceptionType, setExceptionType] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [showSkip, setShowSkip] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPropertyMaps, setShowPropertyMaps] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [showEmailConfirm, setShowEmailConfirm] = useState<"pre" | "post" | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ recipientEmail: string | null; subject: string; htmlBody: string; templateName: string; contactName: string | null } | null>(null);
  const [showEmailFullPreview, setShowEmailFullPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [preNoticeWindowStart, setPreNoticeWindowStart] = useState("");
  const [preNoticeWindowEnd, setPreNoticeWindowEnd] = useState("");
  const [showFinishWithoutComms, setShowFinishWithoutComms] = useState(false);
  const [finishDate, setFinishDate] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [showMarkCompleteDialog, setShowMarkCompleteDialog] = useState(false);
  const [markCompleteDate, setMarkCompleteDate] = useState("");
  const [showCompleteWorkDialog, setShowCompleteWorkDialog] = useState(false);
  const [completeWorkDate, setCompleteWorkDate] = useState("");
  const [chemCompletionAreas, setChemCompletionAreas] = useState("");
  const [chemCompletionConditions, setChemCompletionConditions] = useState("");
  const [chemCompletionNotes, setChemCompletionNotes] = useState("");
  const [chemPostExpectationOverride, setChemPostExpectationOverride] = useState("");
  const [chemPostWateringOverride, setChemPostWateringOverride] = useState("");
  const [chemReEntryIntervalOverride, setChemReEntryIntervalOverride] = useState("");
  const [chemMowingRestrictionOverride, setChemMowingRestrictionOverride] = useState("");
  const [showChemCustomize, setShowChemCustomize] = useState(false);
  const [labelPdfOverrideKey, setLabelPdfOverrideKey] = useState<string | null>(null);
  const [labelPdfUploading, setLabelPdfUploading] = useState(false);
  const [labelPdfFileName, setLabelPdfFileName] = useState<string | null>(null);
  const [completionPhotoUploads, setCompletionPhotoUploads] = useState<Array<{
    id: string;
    fileName: string;
    progress: number;
    done: boolean;
    error: string | null;
  }>>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showCompletionEmailPreview, setShowCompletionEmailPreview] = useState(false);
  const [completionEmailPreview, setCompletionEmailPreview] = useState<{ recipientEmail: string | null; subject: string; htmlBody: string; templateName: string; contactName: string | null } | null>(null);
  const [loadingCompletionEmailPreview, setLoadingCompletionEmailPreview] = useState(false);
  const [sendingCompletionEmail, setSendingCompletionEmail] = useState(false);
  const [emailDebounceTick, setEmailDebounceTick] = useState(0);
  const [postCommDate, setPostCommDate] = useState("");
  const [postCommAreasTreated, setPostCommAreasTreated] = useState("");
  const [postCommApplicationConditions, setPostCommApplicationConditions] = useState("");
  const [postCommNextVisitDate, setPostCommNextVisitDate] = useState("");
  // Dynamic chemical-template variable form state. When the resolved
  // notification template exposes user-supplied `{{variables}}`, the dialog
  // renders inputs for each one and submits the values as `templateVars`.
  // When no template is resolvable, we fall back to the legacy fixed inputs.
  type ChemTemplateVarSpec = { name: string; label: string; type: 'date' | 'textarea' | 'text' };
  type ChemTemplateVarSpecResponse = {
    hasTemplate: boolean;
    templateName: string | null;
    kind: 'pre' | 'post';
    userVariables: ChemTemplateVarSpec[];
    systemVariables: string[];
    values: Record<string, string>;
  };
  const [templateVarSpec, setTemplateVarSpec] = useState<ChemTemplateVarSpecResponse | null>(null);
  // SendGrid connectivity probe — surfaced as an in-dialog warning on the
  // chem compose dialog so admins know up-front when a send will fail.
  const { data: sendGridStatus } = useQuery<{ connected: boolean; fromEmail?: string; error?: string }>({
    queryKey: ["/api/integrations/sendgrid/status"],
    staleTime: 60_000,
  });
  const [formVars, setFormVars] = useState<Record<string, string>>({});
  const [showIrrigationCompleteDialog, setShowIrrigationCompleteDialog] = useState(false);
  const [irrigationCompleteDate, setIrrigationCompleteDate] = useState("");
  const [pendingIrrigationTaskId, setPendingIrrigationTaskId] = useState<string | null>(null);

  const { data: campaign, isLoading } = useQuery<CampaignDetailData>({
    queryKey: ["/api/campaigns", campaignId],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/customers", campaign?.items?.find(i => i.id === itemId)?.customerId, "contacts"],
    queryFn: async () => {
      const custId = campaign?.items?.find(i => i.id === itemId)?.customerId;
      if (!custId) return [];
      const res = await fetch(`/api/customers/${custId}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaign?.items?.find(i => i.id === itemId)?.customerId && campaign?.category === "chemical",
  });

  const item = campaign?.items?.find(i => i.id === itemId);

  const { data: customerExists, isLoading: customerCheckLoading } = useQuery<boolean>({
    queryKey: ["/api/customers", item?.customerId, "exists"],
    queryFn: async () => {
      if (!item?.customerId) return false;
      const res = await fetch(`/api/customers/${item.customerId}`, { credentials: "include" });
      return res.ok;
    },
    enabled: !!item?.customerId,
    staleTime: 60000,
  });

  const { data: auditLog = [], isLoading: auditLogLoading } = useQuery<CampaignChecklistAuditLogWithUser[]>({
    queryKey: ["/api/campaigns", campaignId, "items", itemId, "checklist", "audit"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/checklist/audit`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!campaignId && !!itemId && activityExpanded,
  });

  const hasCompletionPhotos = (item?.completionPhotoStorageKeys?.length ?? 0) > 0;

  const { data: completionPhotoUrls = [] } = useQuery<string[]>({
    queryKey: ["/api/campaigns", campaignId, "items", itemId, "completion-photo-urls"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/completion-photo-urls`, { credentials: "include" });
      if (!res.ok) return [];
      const data: Array<{ storageKey: string; signedUrl: string | null; expiresAt: string | null }> = await res.json();
      return data.map((item) => item.signedUrl).filter((url): url is string => !!url);
    },
    enabled: !!campaignId && !!itemId && hasCompletionPhotos,
    staleTime: 5 * 60 * 1000,
  });

  const isArchivedCampaign = campaign?.status === "archived";

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";
  const canComplete = ["admin", "office", "field_manager", "field", "chemical_manager", "landscape_supervisor"].includes(user?.activeRole || "");
  const canSendChemEmails = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const canFinishWithoutComms = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const canSkip = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const canReopen = ["admin", "office", "chemical_manager"].includes(user?.activeRole || "");
  const isChemicalCampaign = campaign?.category === "chemical";
  const isIrrigationCampaign = campaign?.category === "irrigation";

  // Extra-billable photo writes go through the dedicated raw-byte
  // /photos/drop endpoint so they get HEIC-converted, sharp-resized, and
  // EXIF-stripped server-side (instead of the legacy presigned-PUT flow).
  const isExtraBillableCampaign = campaign?.category === "extra_billable";
  const isAdminOffice = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: ebCrews = [] } = useQuery<Array<{ id: string; name: string; color: string; leaderUserId: string; leaderName?: string }>>({
    queryKey: ["/api/campaigns", campaignId, "crews"],
    enabled: !!campaignId && isExtraBillableCampaign,
  });

  const generateExtraBillableTicketMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/generate-ticket`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "billing-summary"] });
      toast({ title: t("campaigns.billingGenerateOneSuccess") });
    },
    onError: (e: Error) => {
      toast({ title: e.message || t("campaigns.billingGenerateOneFailed"), variant: "destructive" });
    },
  });
  const [showChemReset, setShowChemReset] = useState(false);
  const [chemVisitExpanded, setChemVisitExpanded] = useState(false);
  const [chemTargetDate, setChemTargetDate] = useState("");
  const [chemBackupDate, setChemBackupDate] = useState("");
  const [showNotifPreview, setShowNotifPreview] = useState(false);
  const [notifPreviewData, setNotifPreviewData] = useState<{ subject: string; htmlBody: string; templateName: string; recipientEmail: string | null; contactName: string | null } | null>(null);
  const [loadingNotifPreview, setLoadingNotifPreview] = useState(false);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [uploadingVisitLabel, setUploadingVisitLabel] = useState(false);
  const primaryContact = contacts?.find(c => c.isPrimary === "true") || contacts?.[0];
  const recipientEmail = primaryContact?.emails?.[0] || contacts?.find(c => c.emails && c.emails.length > 0)?.emails?.[0] || null;

  const saveChemVisitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${itemId}`, {
        targetDate: chemTargetDate || null,
        backupDate: chemBackupDate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({ title: t("campaigns.chemVisitSaved") });
    },
    onError: () => {
      toast({ title: t("campaigns.updateFailed"), variant: "destructive" });
    },
  });

  useEffect(() => {
    const customerName = item?.customerName;
    if (!customerName) return;
    const campaignTitle = campaign?.title;
    if (campaignTitle) {
      document.title = `${customerName} \u2014 ${campaignTitle} | High Plains Property Maintenance`;
    } else {
      document.title = `${customerName} | High Plains Property Maintenance`;
    }
    return () => {
      document.title = "High Plains Property Maintenance";
    };
  }, [item?.customerName, campaign?.title]);

  useEffect(() => {
    if (item) {
      setNotes(item.notes || "");
      setSkipReason(item.skipReason || "");
      setExceptionType(item.exceptionType || "");
      setPhotos(item.photos || []);
      setShowSkip(false);
    }
  }, [item?.id, item?.notes, item?.skipReason, item?.photos, item?.exceptionType]);

  useEffect(() => {
    if (item && isChemicalCampaign) {
      setChemTargetDate(item.targetDate || "");
      setChemBackupDate(item.backupDate || "");
    }
  }, [item?.id, isChemicalCampaign]);

  // Force a re-render while within the 60s debounce window so the send button re-enables automatically
  useEffect(() => {
    if (!item?.completionEmailSentAt) return;
    const elapsed = Date.now() - new Date(item.completionEmailSentAt).getTime();
    const remaining = 60_000 - elapsed;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setEmailDebounceTick(t => t + 1), remaining + 500);
    return () => clearTimeout(timer);
  }, [item?.completionEmailSentAt, emailDebounceTick]);

  const updateItemMutation = useMutation({
    mutationFn: async (data: { status?: string; notes?: string; skipReason?: string; exceptionType?: string | null; photos?: string[]; chemAction?: string; overrideEmail?: string; completionDate?: string; weatherTemp?: number; weatherWindSpeed?: number; weatherWindDirection?: string; weatherHumidity?: number; weatherConditions?: string; customWindowStart?: string; customWindowEnd?: string; completedAt?: string; workCompletedAt?: string; areasTreated?: string; applicationConditions?: string; nextVisitDate?: string; templateVars?: Record<string, string> }) => {
      if (data.chemAction && data.chemAction !== "reset" && data.chemAction !== "finish_without_comms") {
        const routeMap: Record<string, string> = {
          send_pre_communication: "send-pre-comm",
          complete_work: "complete-work",
          send_post_communication: "send-post-comm",
        };
        const route = routeMap[data.chemAction];
        if (route) {
          const body: Record<string, unknown> = { notes: data.notes };
          if (data.overrideEmail) body.overrideEmail = data.overrideEmail;
          if (data.customWindowStart) body.customWindowStart = data.customWindowStart;
          if (data.customWindowEnd) body.customWindowEnd = data.customWindowEnd;
          if (data.completedAt) body.completedAt = data.completedAt;
          if (data.workCompletedAt) body.workCompletedAt = data.workCompletedAt;
          if (data.areasTreated) body.areasTreated = data.areasTreated;
          if (data.applicationConditions) body.applicationConditions = data.applicationConditions;
          if (data.nextVisitDate) body.nextVisitDate = data.nextVisitDate;
          if (data.templateVars) body.templateVars = data.templateVars;
          const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/${route}`, body);
          return res.json();
        }
      }
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${itemId}`, data);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      if (variables.chemAction) {
        if (variables.chemAction === "reset") {
          toast({ title: t("campaigns.chemWorkflowReset") });
        } else if (variables.chemAction === "finish_without_comms") {
          toast({ title: t("campaigns.chemFinishWithoutCommsSuccess") });
        } else {
          toast({ title: t("campaigns.chemStepAdvanced") });
        }
      } else {
        toast({ title: t("campaigns.itemUpdated") });
      }
    },
    onError: (err: Error) => {
      toast({
        title: t("campaigns.updateFailed"),
        description: extractApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const completeWorkV2Mutation = useMutation({
    mutationFn: async (data: {
      workCompletedAt: string;
      notes?: string;
      actualAreasTreated?: string;
      actualConditions?: string;
      completionNotes?: string;
      postApplicationExpectationOverride?: string;
      postApplicationWateringOverride?: string;
      reEntryIntervalOverride?: string;
      mowingRestrictionOverride?: string;
      labelPdfOverrideKey?: string | null;
    }) => {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/complete-work-v2`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: t("campaigns.chemStepAdvanced") });
      setShowCompleteWorkDialog(false);
      setLabelPdfOverrideKey(null);
      setLabelPdfFileName(null);
    },
    onError: () => {
      toast({ title: t("campaigns.updateFailed"), variant: "destructive" });
    },
  });

  const handleSendCompletionEmail = async (resend = false) => {
    setSendingCompletionEmail(true);
    try {
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/send-completion-email`, { resend });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toast({ title: t("campaigns.chemCompletionEmailDebounce"), variant: "destructive" });
        } else {
          toast({ title: data.error || t("campaigns.chemCompletionEmailError"), variant: "destructive" });
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({ title: t("campaigns.chemCompletionEmailSent") });
    } catch {
      toast({ title: t("campaigns.chemCompletionEmailError"), variant: "destructive" });
    } finally {
      setSendingCompletionEmail(false);
    }
  };

  // Loads the dynamic-form spec for the chemical notification template (pre
  // or post), seeds the form values, then triggers an initial preview so the
  // dialog opens with both the template-driven inputs and a rendered email.
  const loadChemTemplateForm = async (kind: 'pre' | 'post', seedOverrides: Record<string, string> = {}, overrideCompletedAt?: string) => {
    let spec: ChemTemplateVarSpecResponse | null = null;
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/items/${itemId}/template-variables?kind=${kind}`,
        { credentials: 'include' },
      );
      if (res.ok) spec = await res.json();
    } catch {}
    setTemplateVarSpec(spec);
    // Only include keys that appear in userVariables so hidden alias keys
    // (windowStart, windowEnd, completionDate) from spec.values never ride
    // along in the submitted templateVars and silently override the manager's
    // input.
    const initVars: Record<string, string> = {};
    if (spec?.hasTemplate) {
      for (const v of spec.userVariables) {
        const override = seedOverrides[v.name];
        const seeded = spec.values?.[v.name];
        initVars[v.name] = override !== undefined ? override : (seeded !== undefined ? seeded : '');
      }
    }
    setFormVars(initVars);
    await refreshChemPreview(kind, {
      ...(kind === 'post' && seedOverrides.completedAt ? { completedAt: seedOverrides.completedAt } : {}),
      templateVars: initVars,
    });
  };

  // Re-renders the email preview. Calls the dedicated preview-comm endpoint
  // (POST) so user-supplied vars flow through the same resolution path as the
  // actual send, but nothing is delivered.
  // `body` is merged directly into the request so callers can supply either
  // `templateVars` (for dynamic form fields) or top-level keys like
  // `customWindowStart`/`customWindowEnd` (for the legacy window form) without
  // those values being stripped by the server's filterUserChemTemplateVars.
  const refreshChemPreview = useCallback(async (kind: 'pre' | 'post', body: Record<string, unknown> = {}) => {
    setPreviewLoading(true);
    try {
      const res = await apiRequest(
        'POST',
        `/api/campaigns/${campaignId}/items/${itemId}/preview-comm`,
        { type: kind, ...body },
      );
      if (res.ok) setEmailPreview(await res.json());
    } catch {}
    setPreviewLoading(false);
  }, [campaignId, itemId]);

  const handleLoadCompletionEmailPreview = async () => {
    setLoadingCompletionEmailPreview(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/preview-completion-email`, { credentials: "include" });
      if (res.ok) setCompletionEmailPreview(await res.json());
    } catch {}
    setLoadingCompletionEmailPreview(false);
    setShowCompletionEmailPreview(true);
  };

  const handleConfirmSend = async () => {
    const action = showEmailConfirm === "pre" ? "send_pre_communication" : "send_post_communication";
    const effectiveEmail = emailPreview?.recipientEmail || manualEmail.trim();
    const isDynamic = !!templateVarSpec?.hasTemplate;
    const customWindowStart = !isDynamic && showEmailConfirm === "pre" ? preNoticeWindowStart : undefined;
    const customWindowEnd = !isDynamic && showEmailConfirm === "pre" ? preNoticeWindowEnd : undefined;
    const completedAt = showEmailConfirm === "post" ? postCommDate : undefined;
    const areasTreated = !isDynamic && showEmailConfirm === "post" ? postCommAreasTreated : undefined;
    const applicationConditions = !isDynamic && showEmailConfirm === "post" ? postCommApplicationConditions : undefined;
    const nextVisitDate = !isDynamic && showEmailConfirm === "post" ? postCommNextVisitDate : undefined;
    const templateVars = isDynamic ? formVars : undefined;
    try {
      await updateItemMutation.mutateAsync({ chemAction: action, notes, overrideEmail: !emailPreview?.recipientEmail ? effectiveEmail : undefined, customWindowStart, customWindowEnd, completedAt, areasTreated, applicationConditions, nextVisitDate, templateVars });
    } catch {
      return;
    }
    setShowEmailFullPreview(false);
    setShowEmailConfirm(null);
    setEmailPreview(null);
    setManualEmail("");
    setPreNoticeWindowStart("");
    setPreNoticeWindowEnd("");
    setPostCommDate("");
    setPostCommAreasTreated("");
    setPostCommApplicationConditions("");
    setPostCommNextVisitDate("");
    setTemplateVarSpec(null);
    setFormVars({});
  };

  const handleOpenPreview = async () => {
    const kind = showEmailConfirm as 'pre' | 'post';
    const isDynamic = !!templateVarSpec?.hasTemplate;
    let body: Record<string, unknown>;
    if (kind === 'pre') {
      body = isDynamic
        ? { templateVars: formVars }
        : { customWindowStart: preNoticeWindowStart, customWindowEnd: preNoticeWindowEnd };
    } else {
      body = isDynamic
        ? { completedAt: postCommDate, templateVars: formVars }
        : { completedAt: postCommDate, templateVars: { areasTreated: postCommAreasTreated, applicationConditions: postCommApplicationConditions, nextVisitDate: postCommNextVisitDate } };
    }
    await refreshChemPreview(kind, body);
    setShowEmailFullPreview(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (isExtraBillableCampaign) {
        // Raw-byte drop endpoint — server processes HEIC/sharp/EXIF and
        // appends the resulting key to campaign_items.photos[] itself, so we
        // don't need to call updateItemMutation.
        const buffer = await file.arrayBuffer();
        const res = await fetch(
          `/api/campaigns/${campaignId}/items/${itemId}/photos/drop`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: buffer,
          },
        );
        if (!res.ok) {
          let key = "extraBillablePhotoUploadFailed";
          try {
            const data = await res.json();
            if (data?.error) key = data.error;
          } catch { /* ignore */ }
          throw new Error(key);
        }
        const data = (await res.json()) as { photos?: string[] };
        if (Array.isArray(data.photos)) setPhotos(data.photos);
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
        queryClient.invalidateQueries({
          queryKey: ["/api/campaigns", campaignId, "items", itemId, "photo-urls"],
        });
      } else {
        const res = await apiRequest("POST", "/api/campaigns/photo-upload-url");
        const { uploadURL, objectPath } = await res.json();
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const newPhotos = [...photos, objectPath];
        setPhotos(newPhotos);
        updateItemMutation.mutate({ photos: newPhotos });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "photoUploadFailed";
      const known = [
        "extraBillablePhotoForbidden",
        "extraBillablePhotoInvalidType",
        "extraBillablePhotoUploadFailed",
      ];
      const titleKey = known.find((k) => message.includes(k))
        ? `campaigns.${known.find((k) => message.includes(k))}`
        : "campaigns.photoUploadFailed";
      toast({ title: t(titleKey), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (idx: number) => {
    const target = photos[idx];
    if (isExtraBillableCampaign && target) {
      try {
        const res = await fetch(
          `/api/campaigns/${campaignId}/items/${itemId}/photos/${target}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!res.ok) throw new Error("delete failed");
        const data = (await res.json()) as { photos?: string[] };
        if (Array.isArray(data.photos)) setPhotos(data.photos);
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
        queryClient.invalidateQueries({
          queryKey: ["/api/campaigns", campaignId, "items", itemId, "photo-urls"],
        });
      } catch {
        toast({ title: t("campaigns.photoUploadFailed"), variant: "destructive" });
      }
      return;
    }
    const newPhotos = photos.filter((_, i) => i !== idx);
    setPhotos(newPhotos);
    updateItemMutation.mutate({ photos: newPhotos });
  };

  const handleCompletionPhotoFiles = async (files: File[]) => {
    for (const file of files) {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setCompletionPhotoUploads((prev) => [
        ...prev,
        { id: uid, fileName: file.name, progress: 0, done: false, error: null },
      ]);
      try {
        // Server-side validated upload: magic bytes checked, 8MB limit enforced
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 90);
              setCompletionPhotoUploads((prev) =>
                prev.map((u) => (u.id === uid ? { ...u, progress: pct } : u)),
              );
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else {
              let errorMsg = t("campaigns.photoUploadFailed");
              try {
                const data = JSON.parse(xhr.responseText);
                if (data.error) errorMsg = data.error;
              } catch {}
              reject(new Error(errorMsg));
            }
          });
          xhr.addEventListener("error", () => reject(new Error(t("campaigns.photoUploadFailed"))));
          xhr.open("POST", `/api/campaigns/${campaignId}/items/${itemId}/completion-photos/upload`);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          xhr.withCredentials = true;
          xhr.send(file);
        });
        setCompletionPhotoUploads((prev) =>
          prev.map((u) => (u.id === uid ? { ...u, progress: 100, done: true } : u)),
        );
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "items", itemId, "completion-photo-urls"] });
        setTimeout(() => {
          setCompletionPhotoUploads((prev) => prev.filter((u) => u.id !== uid));
        }, 1500);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : t("campaigns.photoUploadFailed");
        setCompletionPhotoUploads((prev) =>
          prev.map((u) =>
            u.id === uid ? { ...u, progress: 0, done: false, error: errorMsg } : u,
          ),
        );
      }
    }
  };

  const removeCompletionPhoto = async (storageKey: string) => {
    try {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}/items/${itemId}/completion-photos`, { storageKey });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "items", itemId, "completion-photo-urls"] });
    } catch {
      toast({ title: t("campaigns.photoUploadFailed"), variant: "destructive" });
    }
  };

  const toggleChecklistTaskMutation = useMutation({
    mutationFn: async ({ taskId, completedAt }: { taskId: string; completedAt?: string }) => {
      const body = completedAt ? { completedAt } : undefined;
      const res = await apiRequest("POST", `/api/campaigns/${campaignId}/items/${itemId}/checklist/${taskId}/toggle`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "items", itemId, "checklist", "audit"] });
    },
    onError: () => {
      toast({ title: t("campaigns.updateFailed"), variant: "destructive" });
    },
  });

  const getPhotoUrl = (photo: string) => {
    return photo.startsWith("/objects/") ? photo : `/objects/${photo.replace(/^\/[^/]+\/[^/]+\//, "")}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign || !item) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t("campaigns.notFound")}
      </div>
    );
  }

  const todayDateString = () => format(new Date(), "yyyy-MM-dd");

  const formatWindowDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return format(d, "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const statusIcon = item.status === "completed"
    ? <CheckCircle2 className="w-5 h-5 text-green-600" />
    : item.status === "skipped"
      ? <SkipForward className="w-5 h-5 text-amber-500" />
      : <Clock className="w-5 h-5 text-muted-foreground" />;

  const statusBadge = (
    <Badge
      variant={item.status === "completed" ? "default" : item.status === "skipped" ? "secondary" : "outline"}
      className={item.status === "completed" ? "bg-green-600" : ""}
      data-testid="badge-item-status"
    >
      {item.status === "completed" ? t("campaigns.completed")
        : item.status === "skipped" ? t("campaigns.skippedLabel")
        : t("campaigns.pending")}
    </Badge>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 sm:px-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 mt-0.5"
          onClick={() => navigate(`/dashboard/campaigns/${campaignId}`)}
          data-testid="button-back-campaign"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {statusIcon}
              <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="text-item-detail-name">
                {item.customerName}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge}
              {item.customerType === "hoa" && (
                <Badge variant="outline" data-testid="badge-customer-type-hoa">
                  {t("campaigns.customerTypeHoa")}
                </Badge>
              )}
              {isExtraBillableCampaign && item.assignedCampaignCrewId && (() => {
                const crew = ebCrews.find(c => c.id === item.assignedCampaignCrewId);
                if (!crew) return null;
                const isLeader = !!user?.id && crew.leaderUserId === user.id;
                return (
                  <Badge
                    variant="outline"
                    className="gap-1.5"
                    style={{ borderColor: crew.color }}
                    data-testid="chip-crew-context"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: crew.color }}
                      aria-hidden
                    />
                    {isLeader
                      ? t("campaigns.crewContextChipLeader", { name: crew.name })
                      : t("campaigns.crewContextChip", { name: crew.name })}
                  </Badge>
                );
              })()}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {campaign.title}
          </p>
        </div>
      </div>

      {isArchivedCampaign && (
        <div className="flex items-center gap-3 p-4 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300" data-testid="banner-archived-campaign">
          <Archive className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">This campaign is archived — checklist is read-only</p>
            <p className="text-xs mt-0.5 opacity-80">No actions can be performed on archived campaigns. Reactivate the campaign to make changes.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5" />
              {t("campaigns.itemLocation")}
            </div>
            <div className="text-sm font-medium">{item.customerCity || t("common.unknown")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CalendarDays className="w-3.5 h-3.5" />
              {t("campaigns.window")}
            </div>
            <div className="text-sm font-medium">
              {formatWindowDate(campaign.windowStart)} – {formatWindowDate(campaign.windowEnd)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <User className="w-3.5 h-3.5" />
              {t("campaigns.assignedTo")}
            </div>
            <div className="text-sm font-medium">{campaign.assignedToName || t("common.unassigned")}</div>
          </CardContent>
        </Card>
      </div>

      {item.completedAt && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-muted-foreground">{t("campaigns.completedAt")}:</span>
              <span className="font-medium">{format(new Date(item.completedAt), "PPp")}</span>
              {item.completedByName && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  {item.completedByName}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isExtraBillableCampaign && item.ticketId && (
        <Card className="border-green-600/40 bg-green-50" data-testid="banner-extra-billable-ticket-created">
          <CardContent className="p-3">
            <Link
              href={`/dashboard/tickets/${item.ticketId}`}
              className="flex items-center gap-2 text-sm text-green-800 hover:underline"
              data-testid="link-extra-billable-ticket"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">
                {t("campaigns.billingTicketCreatedBanner", {
                  date: item.updatedAt ? format(new Date(item.updatedAt), "PP") : "",
                })}
              </span>
              <ExternalLink className="w-3.5 h-3.5 ml-auto" />
            </Link>
          </CardContent>
        </Card>
      )}

      {isExtraBillableCampaign &&
        isAdminOffice &&
        item.status === "completed" &&
        item.billingStatus === "not_created" &&
        !item.ticketId && (
          <Card data-testid="card-generate-extra-billable-inline">
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{t("campaigns.billingGenerateRowConfirm")}</span>
              <Button
                size="sm"
                onClick={() => generateExtraBillableTicketMutation.mutate()}
                disabled={generateExtraBillableTicketMutation.isPending}
                data-testid="button-generate-extra-billable-inline"
              >
                {t("campaigns.billingGenerateInline")}
              </Button>
            </CardContent>
          </Card>
        )}

      {item.weatherTemp != null && item.weatherConditions && (
        <Card data-testid="card-weather-data">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {t("campaigns.chemWeatherConditions")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherTemp")}</span>
                <div className="font-medium">{item.weatherTemp}°F</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherWindSpeed")}</span>
                <div className="font-medium">{item.weatherWindSpeed} mph</div>
              </div>
              {item.weatherWindDirection && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherWindDirection")}</span>
                  <div className="font-medium">{item.weatherWindDirection}</div>
                </div>
              )}
              {item.weatherHumidity != null && (
                <div>
                  <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherHumidity")}</span>
                  <div className="font-medium">{item.weatherHumidity}%</div>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">{t("campaigns.chemWeatherConditions")}</span>
                <div className="font-medium">{item.weatherConditions}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {item.skipReason && item.status === "skipped" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm">
              <SkipForward className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-muted-foreground">{t("campaigns.skipReason")}:</span>
              <span>{item.skipReason}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isChemicalCampaign && item && (
        <WeatherCapturePanel
          item={item as WeatherCapturableItem}
          campaignId={campaignId!}
          customerLat={item.customerLat}
          customerLng={item.customerLng}
          customerAddress={item.customerAddress}
        />
      )}

      {isChemicalCampaign && canManage && item && (
        <Card data-testid="card-chem-visit-details">
          <CardHeader
            className="pb-3 cursor-pointer select-none"
            onClick={() => setChemVisitExpanded(!chemVisitExpanded)}
          >
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary" />
                {t("campaigns.chemVisitDetails")}
              </div>
              {chemVisitExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          {chemVisitExpanded && (
            <CardContent className="pt-0 space-y-4">
              {campaign?.notificationTemplateId ? (
                <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-sm" data-testid="banner-chem-template">
                  <FlaskConical className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground flex-1">
                    {t("campaigns.chemTemplateBanner", { name: campaign.notificationTemplateName || t("campaigns.chemTemplateUnknown") })}
                    {" "}
                    <Link href={`/dashboard/settings/notification-templates`} className="text-primary underline underline-offset-2 hover:opacity-75" data-testid="link-template-settings">
                      {t("campaigns.chemTemplateSettingsLink")}
                    </Link>
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border text-sm" data-testid="banner-chem-no-template">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground flex-1">
                    {t("campaigns.chemNoTemplateBanner")}
                    {" "}
                    <Link href={`/dashboard/campaigns/${campaignId}`} className="text-primary underline underline-offset-2 hover:opacity-75" data-testid="link-campaign-settings">
                      {t("campaigns.chemCampaignSettingsLink")}
                    </Link>
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemTargetDate")}</Label>
                  <Input
                    type="date"
                    value={chemTargetDate}
                    onChange={(e) => {
                      const newTarget = e.target.value;
                      setChemTargetDate(newTarget);
                      if (newTarget && !chemBackupDate) {
                        const d = new Date(newTarget + "T12:00:00");
                        let added = 0;
                        while (added < 2) {
                          d.setDate(d.getDate() + 1);
                          const day = d.getDay();
                          if (day !== 0 && day !== 6) added++;
                        }
                        setChemBackupDate(d.toISOString().slice(0, 10));
                      }
                    }}
                    data-testid="input-chem-target-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("campaigns.chemBackupDate")}
                    {chemTargetDate && !chemBackupDate && <span className="ml-1 text-muted-foreground/70 text-xs">{t("campaigns.chemBackupAutoHint")}</span>}
                  </Label>
                  <Input
                    type="date"
                    value={chemBackupDate}
                    onChange={(e) => setChemBackupDate(e.target.value)}
                    data-testid="input-chem-backup-date"
                  />
                </div>
              </div>

              {/* Visit-level label override */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemLabelOverride")}</Label>
                {item.labelPdfOverrideKey ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs flex-1 truncate">{item.labelPdfOverrideKey}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={uploadingVisitLabel}
                      onClick={async () => {
                        setUploadingVisitLabel(true);
                        try {
                          await apiRequest("DELETE", `/api/campaigns/${campaignId}/items/${itemId}/label`);
                          queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "items", itemId] });
                          toast({ title: t("campaigns.chemLabelRemoved") });
                        } catch {
                          toast({ title: t("campaigns.chemLabelRemoveFailed"), variant: "destructive" });
                        } finally {
                          setUploadingVisitLabel(false);
                        }
                      }}
                      data-testid="button-remove-visit-label"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".pdf"
                      style={{ display: "none" }}
                      id="visit-label-upload-input"
                      data-testid="input-visit-label-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.type !== "application/pdf") {
                          toast({ title: t("campaigns.chemLabelPdfOnly"), variant: "destructive" });
                          return;
                        }
                        setUploadingVisitLabel(true);
                        try {
                          const arrayBuffer = await file.arrayBuffer();
                          const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/label?filename=${encodeURIComponent(file.name)}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/pdf" },
                            body: arrayBuffer,
                            credentials: "include",
                          });
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(err.error || "Upload failed");
                          }
                          queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "items", itemId] });
                          toast({ title: t("campaigns.chemLabelUploaded") });
                        } catch (err: unknown) {
                          const message = err instanceof Error ? err.message : "Upload failed";
                          toast({ title: message, variant: "destructive" });
                        } finally {
                          setUploadingVisitLabel(false);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploadingVisitLabel}
                      onClick={() => document.getElementById("visit-label-upload-input")?.click()}
                      data-testid="button-upload-visit-label"
                    >
                      {uploadingVisitLabel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      {t("campaigns.chemUploadLabelOverride")}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">{t("campaigns.chemLabelOverrideHint")}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  onClick={() => saveChemVisitMutation.mutate()}
                  disabled={saveChemVisitMutation.isPending}
                  data-testid="button-save-chem-visit"
                >
                  {saveChemVisitMutation.isPending ? t("common.saving") : t("campaigns.chemSaveVisitDetails")}
                </Button>
                {canSendChemEmails && (
                  <>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setLoadingNotifPreview(true);
                        try {
                          const res = await fetch(`/api/campaigns/${campaignId}/items/${itemId}/preview-email?type=notification`, { credentials: "include" });
                          if (res.ok) {
                            const data = await res.json();
                            setNotifPreviewData(data);
                            setShowNotifPreview(true);
                          } else {
                            toast({ title: t("campaigns.previewFailed"), variant: "destructive" });
                          }
                        } catch {
                          toast({ title: t("campaigns.previewFailed"), variant: "destructive" });
                        } finally {
                          setLoadingNotifPreview(false);
                        }
                      }}
                      disabled={loadingNotifPreview}
                      data-testid="button-preview-notification-email"
                    >
                      {loadingNotifPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                      {t("campaigns.chemPreviewNotifEmail")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setSendingNotification(true);
                        try {
                          await apiRequest("PATCH", `/api/campaigns/${campaignId}/items/${itemId}`, { chemAction: "send_notification" });
                          toast({ title: t("campaigns.chemNotifSent") });
                        } catch (err: unknown) {
                          const message = err instanceof Error ? err.message : t("campaigns.chemNotifSendFailed");
                          toast({ title: message, variant: "destructive" });
                        } finally {
                          setSendingNotification(false);
                        }
                      }}
                      disabled={sendingNotification || !recipientEmail}
                      data-testid="button-send-notification-email"
                    >
                      {sendingNotification ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      {t("campaigns.chemSendNotification")}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="w-4 h-4" />
            {t("common.notes")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("campaigns.notesPlaceholder")}
            rows={5}
            data-testid="textarea-item-notes"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateItemMutation.mutate({ notes })}
            disabled={updateItemMutation.isPending}
            data-testid="button-save-notes"
          >
            {updateItemMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {t("campaigns.saveNotes")}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-exception-type">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Exception Type
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">Flag why this item could not be completed normally. Can be set independently of status.</p>
          <Select
            value={exceptionType || "none"}
            onValueChange={(val) => setExceptionType(val === "none" ? "" : val)}
          >
            <SelectTrigger data-testid="select-exception-type">
              <SelectValue placeholder="No exception" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No exception</SelectItem>
              <SelectItem value="weather_delayed">Weather Delayed</SelectItem>
              <SelectItem value="customer_declined">Customer Declined</SelectItem>
              <SelectItem value="inaccessible_area">Inaccessible Area</SelectItem>
              <SelectItem value="moved_to_next_visit">Moved to Next Visit</SelectItem>
              <SelectItem value="partial_completion">Partial Completion</SelectItem>
              <SelectItem value="waiting_on_approval">Waiting on Approval</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateItemMutation.mutate({ exceptionType: exceptionType || null })}
            disabled={updateItemMutation.isPending}
            data-testid="button-save-exception-type"
          >
            {updateItemMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save Exception
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            {t("campaigns.photos")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-md overflow-hidden border group">
                  <img
                    src={getPhotoUrl(photo)}
                    alt=""
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewPhoto(getPhotoUrl(photo))}
                    data-testid={`img-photo-${idx}`}
                  />
                  <button
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-md p-1 invisible group-hover:visible"
                    onClick={() => removePhoto(idx)}
                    data-testid={`button-remove-photo-${idx}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("campaigns.noPhotos")}</p>
          )}
          <label className="cursor-pointer inline-block">
            <Button size="sm" variant="outline" asChild disabled={uploading}>
              <span>
                {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Camera className="w-3 h-3 mr-1" />}
                {t("campaigns.addPhoto")}
              </span>
            </Button>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
              data-testid="input-photo-upload"
            />
          </label>
        </CardContent>
      </Card>

      {isChemicalCampaign && item.workflowStep === "work_in_progress" && canComplete && (
        <Card data-testid="card-completion-photos">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="w-4 h-4" />
              {t("campaigns.chemCompletionPhotosTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {(item.completionPhotoStorageKeys || []).length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {(item.completionPhotoStorageKeys || []).map((storageKey, idx) => (
                  <div key={storageKey} className="relative aspect-square rounded-md overflow-hidden border group">
                    {completionPhotoUrls[idx] ? (
                      <img
                        src={completionPhotoUrls[idx]}
                        alt=""
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewPhoto(completionPhotoUrls[idx])}
                        data-testid={`img-completion-photo-${idx}`}
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <button
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-md p-1 invisible group-hover:visible"
                      onClick={() => removeCompletionPhoto(storageKey)}
                      data-testid={`button-remove-completion-photo-${idx}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {completionPhotoUploads.length > 0 && (
              <div className="space-y-2">
                {completionPhotoUploads.map((u) => (
                  <div key={u.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate max-w-[200px]">{u.fileName}</span>
                      <span>{u.done ? t("campaigns.chemPhotoUploaded") : u.error ? t("campaigns.photoUploadFailed") : `${u.progress}%`}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${u.error ? "bg-destructive" : u.done ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${u.done ? 100 : u.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div
              className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${isDraggingOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
                if (files.length > 0) handleCompletionPhotoFiles(files);
              }}
              data-testid="dropzone-completion-photos"
            >
              <Camera className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">{t("campaigns.chemDropPhotosHere")}</p>
              <label className="cursor-pointer">
                <Button size="sm" variant="outline" asChild>
                  <span>
                    <Camera className="w-3 h-3 mr-1" />
                    {t("campaigns.chemBrowsePhotos")}
                  </span>
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) handleCompletionPhotoFiles(files);
                    e.target.value = "";
                  }}
                  data-testid="input-completion-photo-upload"
                />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t("campaigns.itemCustomerLinks")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {(!item.customerId || (!customerCheckLoading && customerExists === false)) ? (
            <div className="flex items-center gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm" data-testid="warning-missing-customer">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{!item.customerId ? "Customer record not linked" : "Linked customer record no longer exists"}</span>
            </div>
          ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPropertyMaps(true)}
              data-testid="button-view-property-maps"
            >
              <Layers className="w-3 h-3 mr-1" />
              {t("campaigns.viewPropertyMaps")}
            </Button>
            {user?.activeRole !== "field" && (
              <Link href={`/dashboard/customers/${item.customerId}`}>
                <Button variant="outline" size="sm" data-testid="button-view-customer">
                  {t("campaigns.viewCustomer")}
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
          )}
        </CardContent>
      </Card>

      {isChemicalCampaign && (
        <Card data-testid="card-chem-workflow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              {t("campaigns.chemWorkflow")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className="space-y-2">
              {item.status === "skipped" && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400" data-testid="badge-chem-skipped">
                    <SkipForward className="w-3 h-3 mr-1" />
                    {t("campaigns.skippedLabel")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{t("campaigns.chemSkippedState")}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1">
                {["pre_communication", "work_in_progress", "work_completed", "post_communication", "complete"].map((step, idx) => {
                  const stepLabels = [
                    t("campaigns.chemStepPre"),
                    t("campaigns.chemStepInProgress"),
                    t("campaigns.chemStepWorkDone"),
                    t("campaigns.chemStepPost"),
                    t("campaigns.chemStepComplete"),
                  ];
                  const stepLabelsShort = [
                    t("campaigns.chemStepPreShort"),
                    t("campaigns.chemStepInProgressShort"),
                    t("campaigns.chemStepWorkDoneShort"),
                    t("campaigns.chemStepPostShort"),
                    t("campaigns.chemStepCompleteShort"),
                  ];
                  const isSkipped = item.status === "skipped";
                  const steps = ["pre_communication", "work_in_progress", "work_completed", "post_communication"];
                  const currentIdx = item.status === "completed" ? 4 : isSkipped ? -1 : steps.indexOf(item.workflowStep ?? "pre_communication");
                  const isComplete = !isSkipped && idx < currentIdx;
                  const isCurrent = !isSkipped && idx === currentIdx;
                  return (
                    <div key={step} className="flex sm:flex-1 items-center gap-1">
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium flex-1 justify-center ${
                        isComplete ? "bg-green-600/10 text-green-700 dark:text-green-400" :
                        isCurrent ? "bg-primary/10 text-primary border border-primary/30" :
                        "bg-muted text-muted-foreground"
                      }`} data-testid={`chem-step-${step}`}>
                        {isComplete ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : isCurrent ? <Clock className="w-3 h-3 shrink-0" /> : null}
                        <span className="hidden sm:inline truncate">{stepLabels[idx]}</span>
                        <span className="sm:hidden">{stepLabelsShort[idx]}</span>
                      </div>
                      {idx < 4 && <div className="hidden sm:block w-2 h-px bg-muted-foreground/30 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              {item.preCommSentAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-pre-sent">
                  <Mail className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemPreSentAt")}: {format(new Date(item.preCommSentAt), "PPp")}</span>
                  {item.preCommSentByName && <span>({item.preCommSentByName})</span>}
                </div>
              )}
              {item.workCompletedAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-work-done">
                  <Wrench className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemWorkCompletedAt")}: {format(new Date(item.workCompletedAt), "PPp")}</span>
                  {item.workCompletedByName && <span>({item.workCompletedByName})</span>}
                </div>
              )}
              {item.postCommSentAt && (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-chem-post-sent">
                  <Send className="w-3.5 h-3.5 text-green-600" />
                  <span>{t("campaigns.chemPostSentAt")}: {format(new Date(item.postCommSentAt), "PPp")}</span>
                  {item.postCommSentByName && <span>({item.postCommSentByName})</span>}
                </div>
              )}
            </div>

            {item.status !== "skipped" && !isArchivedCampaign && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {(item.workflowStep ?? "pre_communication") === "pre_communication" && canSendChemEmails && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      const initStart = campaign.windowStart || "";
                      const initEnd = campaign.windowEnd || "";
                      setPreNoticeWindowStart(initStart);
                      setPreNoticeWindowEnd(initEnd);
                      setLoadingPreview(true);
                      setManualEmail("");
                      // Seed window dates into the dynamic form via the
                      // canonical PRE template var names.
                      const seed: Record<string, string> = {};
                      if (initStart) seed.windowStart = initStart;
                      if (initEnd) seed.windowEnd = initEnd;
                      await loadChemTemplateForm('pre', seed);
                      setLoadingPreview(false);
                      setShowEmailConfirm("pre");
                    }}
                    disabled={updateItemMutation.isPending || loadingPreview}
                    data-testid="button-chem-send-pre"
                  >
                    {loadingPreview && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <Mail className="w-4 h-4 mr-1" />
                    {t("campaigns.chemSendPreNotice")}
                  </Button>
                )}
                {(item.workflowStep ?? "pre_communication") === "work_in_progress" && canComplete && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setCompleteWorkDate(todayDateString());
                      setShowCompleteWorkDialog(true);
                    }}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-chem-complete-work"
                  >
                    {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <Wrench className="w-4 h-4 mr-1" />
                    {t("campaigns.chemMarkWorkDone")}
                  </Button>
                )}
                {(item.workflowStep ?? "pre_communication") === "work_completed" && canSendChemEmails && (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      setLoadingPreview(true);
                      setManualEmail("");
                      const today = todayDateString();
                      // Prefer the stored completion date (for re-sends); fall
                      // back to today for first-time sends.
                      const storedDate = (item.completedAt || item.workCompletedAt) as string | null | undefined;
                      const initialDate = storedDate
                        ? (() => { try { return format(new Date(storedDate), 'yyyy-MM-dd'); } catch { return today; } })()
                        : today;
                      setPostCommDate(initialDate);
                      // Seed weather conditions into the dynamic form via the
                      // canonical POST template var names.
                      let conditionsSeed = "";
                      if (item.weatherConditions || item.weatherTemp != null) {
                        const parts: string[] = [];
                        if (item.weatherTemp != null) parts.push(`${item.weatherTemp}°F`);
                        if (item.weatherWindSpeed != null) parts.push(`Wind ${item.weatherWindSpeed} mph${item.weatherWindDirection ? ` ${item.weatherWindDirection}` : ""}`);
                        if (item.weatherHumidity != null) parts.push(`Humidity ${item.weatherHumidity}%`);
                        if (item.weatherConditions) parts.push(item.weatherConditions);
                        conditionsSeed = parts.join(", ");
                        setPostCommApplicationConditions(conditionsSeed);
                      }
                      const seed: Record<string, string> = {};
                      if (conditionsSeed) seed.applicationConditions = conditionsSeed;
                      await loadChemTemplateForm('post', seed, initialDate);
                      setLoadingPreview(false);
                      setShowEmailConfirm("post");
                    }}
                    disabled={updateItemMutation.isPending || loadingPreview}
                    data-testid="button-chem-send-post"
                  >
                    {loadingPreview && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <Send className="w-4 h-4 mr-1" />
                    {t("campaigns.chemSendPostNotice")}
                  </Button>
                )}
                {item.status === "completed" && isChemicalCampaign && (
                  <Badge variant="default" className="bg-green-600" data-testid="badge-chem-done">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {t("campaigns.chemStepComplete")}
                  </Badge>
                )}
                {item.status === "completed" && item.finishedWithoutComms === "true" && (
                  <Badge variant="secondary" data-testid="badge-chem-no-comms">
                    {t("campaigns.chemCompletedWithoutComms")}
                  </Badge>
                )}
                {!isArchivedCampaign && canFinishWithoutComms && item.status !== "completed" && (item.status as string) !== "skipped" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFinishDate("");
                      setShowFinishWithoutComms(true);
                    }}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-chem-finish-no-comms"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {t("campaigns.chemFinishWithoutComms")}
                  </Button>
                )}
                {!isArchivedCampaign && canReopen && (item.workflowStep ?? "pre_communication") !== "pre_communication" && item.status !== "completed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setShowChemReset(true)}
                    data-testid="button-chem-reset"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    {t("campaigns.chemResetWorkflow")}
                  </Button>
                )}
              </div>
            )}

            {!isArchivedCampaign && item.status !== "completed" && item.status !== "skipped" && canSkip && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {!showSkip ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setShowSkip(true)}
                    data-testid="button-show-skip"
                  >
                    <SkipForward className="w-4 h-4 mr-1" />
                    {t("campaigns.skip")}
                  </Button>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                    <Input
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder={t("campaigns.skipReasonPlaceholder")}
                      className="flex-1"
                      data-testid="input-skip-reason"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => updateItemMutation.mutate({ status: "skipped", notes, skipReason })}
                      disabled={updateItemMutation.isPending || !skipReason.trim()}
                      data-testid="button-confirm-skip"
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      {t("campaigns.confirmSkip")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!isArchivedCampaign && item.status === "skipped" && canReopen && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => updateItemMutation.mutate({ chemAction: "reset" })}
                disabled={updateItemMutation.isPending}
                data-testid="button-reopen-chem-item"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                {t("campaigns.reopen")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isChemicalCampaign && item && (item.workflowStep === "work_completed" || item.workflowStep === "post_communication") && (
        <Card data-testid="card-completion-details">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              {t("campaigns.chemCompletedBannerTitle")}
              {item.workCompletedAt && (
                <span className="text-muted-foreground font-normal">
                  {" — "}{format(new Date(item.workCompletedAt), "MMM d, yyyy")}
                </span>
              )}
              {item.workCompletedByName && (
                <span className="text-muted-foreground font-normal text-xs" data-testid="text-applicator-name">
                  {t("campaigns.chemApplicatorLabel")}: {item.workCompletedByName}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {(item.actualAreasTreated || item.actualConditions || item.completionNotes) && (
              <div className="space-y-2 text-sm">
                {item.actualAreasTreated && (
                  <div>
                    <span className="text-muted-foreground">{t("campaigns.chemAreasLabel")}: </span>
                    <span data-testid="text-completion-areas">{item.actualAreasTreated}</span>
                  </div>
                )}
                {item.actualConditions && (
                  <div>
                    <span className="text-muted-foreground">{t("campaigns.chemConditionsLabel")}: </span>
                    <span data-testid="text-completion-conditions">{item.actualConditions}</span>
                  </div>
                )}
                {item.completionNotes && (
                  <div>
                    <span className="text-muted-foreground">{t("campaigns.chemCompletionNotesLabel")}: </span>
                    <span data-testid="text-completion-notes">{item.completionNotes}</span>
                  </div>
                )}
              </div>
            )}
            {hasCompletionPhotos && completionPhotoUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {completionPhotoUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-md overflow-hidden border">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewPhoto(url)}
                      data-testid={`img-banner-completion-photo-${idx}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {canSendChemEmails && item.workflowStep === "work_completed" && (
              <div className="border rounded-md p-3 space-y-2" data-testid="panel-completion-email">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="w-4 h-4" />
                  {t("campaigns.chemCompletionEmailPanel")}
                </div>
                {item.completionEmailSentAt ? (
                  <div className="text-xs text-muted-foreground" data-testid="text-completion-email-sent">
                    {t("campaigns.chemCompletionEmailSentAt", {
                      time: format(new Date(item.completionEmailSentAt), "MMM d, h:mm a"),
                      recipient: recipientEmail || "—",
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground" data-testid="text-completion-email-not-sent">
                    {t("campaigns.chemCompletionEmailNotSent")}
                  </div>
                )}
                {item.completionEmailSentAt === null && item.workCompletedAt && (() => {
                  const completedAt = new Date(item.workCompletedAt);
                  const hoursSince = (Date.now() - completedAt.getTime()) / 1000 / 3600;
                  return hoursSince > 24;
                })() && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="text-completion-email-overdue">
                    <AlertCircle className="w-3 h-3" />
                    {t("campaigns.chemCompletionUnsent24h")}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLoadCompletionEmailPreview}
                    disabled={loadingCompletionEmailPreview}
                    data-testid="button-preview-completion-email"
                  >
                    {loadingCompletionEmailPreview ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
                    {t("campaigns.chemCompletionEmailPreview")}
                  </Button>
                  {(() => {
                    const isWithinDebounce = !!item.completionEmailSentAt &&
                      (Date.now() - new Date(item.completionEmailSentAt).getTime()) < 60_000;
                    return !item.completionEmailSentAt ? (
                      <Button
                        size="sm"
                        onClick={() => handleSendCompletionEmail(false)}
                        disabled={sendingCompletionEmail || isWithinDebounce}
                        data-testid="button-send-completion-email"
                      >
                        {sendingCompletionEmail ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                        {sendingCompletionEmail ? t("campaigns.chemCompletionEmailSending") : t("campaigns.chemCompletionEmailSend")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendCompletionEmail(true)}
                        disabled={sendingCompletionEmail || isWithinDebounce}
                        title={isWithinDebounce ? t("campaigns.chemEmailDebouncePending") : undefined}
                        data-testid="button-resend-completion-email"
                      >
                        {sendingCompletionEmail ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                        {t("campaigns.chemCompletionEmailResend")}
                      </Button>
                    );
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isIrrigationCampaign && (
        <Card data-testid="card-irrigation-checklist">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t("campaigns.checklistTasks")}
              {campaign.checklistTasks && campaign.checklistTasks.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {campaign.itemTaskCompletions?.[item.id]?.length || 0}/{campaign.checklistTasks.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(!campaign.checklistTasks || campaign.checklistTasks.length === 0) ? (
              <div className="flex items-center gap-2 p-3 rounded-md border border-dashed text-sm text-muted-foreground" data-testid="empty-checklist-tasks">
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>No checklist tasks have been configured for this campaign</span>
              </div>
            ) : (
            <>
            {campaign.checklistTasks.map(task => {
              const isChecked = campaign.itemTaskCompletions?.[item.id]?.includes(task.id) || false;
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-2.5 rounded-md border ${isChecked ? "bg-green-600/5 border-green-600/20" : "bg-muted/20"}`}
                  data-testid={`checklist-item-${task.id}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      if (isArchivedCampaign) return;
                      if (!isChecked) {
                        const completedCount = campaign.itemTaskCompletions?.[item.id]?.length || 0;
                        const totalTasks = campaign.checklistTasks?.length || 0;
                        const wouldBeLastTask = completedCount === totalTasks - 1;
                        if (wouldBeLastTask && item.status !== "completed") {
                          setPendingIrrigationTaskId(task.id);
                          setIrrigationCompleteDate(todayDateString());
                          setShowIrrigationCompleteDialog(true);
                          return;
                        }
                      }
                      toggleChecklistTaskMutation.mutate({ taskId: task.id });
                    }}
                    disabled={toggleChecklistTaskMutation.isPending || item.status === "skipped" || isArchivedCampaign}
                    className="w-4 h-4 rounded accent-green-600 cursor-pointer disabled:cursor-not-allowed"
                    data-testid={`checkbox-task-${task.id}`}
                  />
                  <span className={`text-sm flex-1 ${isChecked ? "line-through text-muted-foreground" : ""}`}>
                    {task.label}
                  </span>
                </div>
              );
            })}
            {item.status === "completed" && (
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {t("campaigns.completed")}
                </Badge>
              </div>
            )}
            {!isArchivedCampaign && item.status !== "completed" && item.status !== "skipped" && canSkip && (
              <div className="flex items-center gap-2 pt-2 flex-wrap">
                {!showSkip ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSkip(true)}
                    data-testid="button-show-skip"
                  >
                    <SkipForward className="w-4 h-4 mr-1" />
                    {t("campaigns.skip")}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[200px]">
                    <Input
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder={t("campaigns.skipReasonPlaceholder")}
                      className="flex-1 min-w-[150px]"
                      data-testid="input-skip-reason"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateItemMutation.mutate({ status: "skipped", notes, skipReason })}
                      disabled={updateItemMutation.isPending || !skipReason.trim()}
                      data-testid="button-confirm-skip"
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      {t("campaigns.confirmSkip")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {!isArchivedCampaign && canReopen && (item.status === "completed" || item.status === "skipped") && (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateItemMutation.mutate({ status: "pending", notes: "", skipReason: "" })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-reopen-item"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  {t("campaigns.reopen")}
                </Button>
              </div>
            )}
            </>
            )}
          </CardContent>
        </Card>
      )}

      {isIrrigationCampaign && (
        <Card data-testid="card-checklist-activity">
          <button
            className="w-full text-left"
            onClick={() => setActivityExpanded(prev => !prev)}
            data-testid="button-toggle-activity"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Checklist Activity
                {activityExpanded ? (
                  <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
          </button>
          {activityExpanded && (
            <CardContent className="pt-0">
              {auditLogLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground" data-testid="loading-activity">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading activity...</span>
                </div>
              ) : auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="empty-activity">
                  No checklist activity yet
                </p>
              ) : (
                <div className="space-y-2" data-testid="activity-list">
                  {auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 py-2 border-b last:border-0"
                      data-testid={`activity-entry-${entry.id}`}
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${entry.action === "completed" ? "bg-green-600/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
                        {entry.action === "completed" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{entry.userName ?? "Unknown user"}</span>
                          {" "}
                          <span className="text-muted-foreground">
                            {entry.action === "completed" ? "checked off" : "unchecked"}{" "}
                            <span className="text-foreground">{entry.taskLabel}</span>
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(String(entry.timestamp)), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {!isChemicalCampaign && !isIrrigationCampaign && canComplete && !isArchivedCampaign && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {item.status === "pending" && (
                <>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setMarkCompleteDate(todayDateString());
                      setShowMarkCompleteDialog(true);
                    }}
                    disabled={updateItemMutation.isPending}
                    data-testid="button-complete-item"
                  >
                    {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {t("campaigns.markComplete")}
                  </Button>
                  {canSkip && (
                    <>
                      {!showSkip ? (
                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => setShowSkip(true)}
                          data-testid="button-show-skip"
                        >
                          <SkipForward className="w-4 h-4 mr-1" />
                          {t("campaigns.skip")}
                        </Button>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                          <Input
                            value={skipReason}
                            onChange={(e) => setSkipReason(e.target.value)}
                            placeholder={t("campaigns.skipReasonPlaceholder")}
                            className="flex-1"
                            data-testid="input-skip-reason"
                          />
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => updateItemMutation.mutate({ status: "skipped", notes, skipReason })}
                            disabled={updateItemMutation.isPending || !skipReason.trim()}
                            data-testid="button-confirm-skip"
                          >
                            <SkipForward className="w-4 h-4 mr-1" />
                            {t("campaigns.confirmSkip")}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {canReopen && (item.status === "completed" || item.status === "skipped") && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => updateItemMutation.mutate({ status: "pending", notes: "", skipReason: "" })}
                  disabled={updateItemMutation.isPending}
                  data-testid="button-reopen-item"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  {t("campaigns.reopen")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showMarkCompleteDialog} onOpenChange={setShowMarkCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("campaigns.markComplete")}</AlertDialogTitle>
            <AlertDialogDescription>Choose the date when this item was completed.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs text-muted-foreground">Completion Date *</Label>
            <DatePickerField
              value={markCompleteDate ? new Date(markCompleteDate + 'T00:00:00') : undefined}
              onChange={(date) => setMarkCompleteDate(date ? format(date, 'yyyy-MM-dd') : '')}
              data-testid="input-mark-complete-date"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateItemMutation.mutate({ status: "completed", notes, completedAt: markCompleteDate });
                setShowMarkCompleteDialog(false);
              }}
              disabled={!markCompleteDate}
              data-testid="button-confirm-mark-complete"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {t("campaigns.markComplete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showCompleteWorkDialog} onOpenChange={(open) => { if (!open) setShowCompleteWorkDialog(false); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <div className="font-semibold text-lg mb-1">{t("campaigns.chemMarkWorkDoneTitle")}</div>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("campaigns.chemCompletionDate")} *</Label>
              <DatePickerField
                value={completeWorkDate ? new Date(completeWorkDate + 'T00:00:00') : undefined}
                onChange={(date) => setCompleteWorkDate(date ? format(date, 'yyyy-MM-dd') : '')}
                data-testid="input-complete-work-date"
              />
            </div>
            {isChemicalCampaign && (
              <>
                <div className="space-y-1">
                  <Label>{t("campaigns.chemAreasLabel")}</Label>
                  <Textarea
                    placeholder={t("campaigns.chemAreasPlaceholder")}
                    value={chemCompletionAreas}
                    onChange={(e) => setChemCompletionAreas(e.target.value)}
                    rows={2}
                    data-testid="textarea-completion-areas"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("campaigns.chemConditionsLabel")}</Label>
                  <Textarea
                    placeholder={t("campaigns.chemConditionsPlaceholder")}
                    value={chemCompletionConditions}
                    onChange={(e) => setChemCompletionConditions(e.target.value)}
                    rows={2}
                    data-testid="textarea-completion-conditions"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("campaigns.chemCompletionNotesLabel")}</Label>
                  <Textarea
                    placeholder={t("campaigns.chemCompletionNotesPlaceholder")}
                    value={chemCompletionNotes}
                    onChange={(e) => setChemCompletionNotes(e.target.value)}
                    rows={2}
                    data-testid="textarea-completion-notes"
                  />
                </div>
                <div className="space-y-1">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                    onClick={() => setShowChemCustomize(v => !v)}
                    data-testid="button-toggle-chem-customize"
                  >
                    {showChemCustomize ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {t("campaigns.chemCustomizeGroup")}
                  </button>
                  {showChemCustomize && <div className="space-y-3 mt-1">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("campaigns.chemPostExpectationLabel")}</Label>
                      <Textarea
                        placeholder={t("campaigns.chemPostExpectationPlaceholder")}
                        value={chemPostExpectationOverride}
                        onChange={(e) => setChemPostExpectationOverride(e.target.value)}
                        rows={2}
                        data-testid="textarea-completion-expectation"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("campaigns.chemPostWateringLabel")}</Label>
                      <Textarea
                        placeholder={t("campaigns.chemPostWateringPlaceholder")}
                        value={chemPostWateringOverride}
                        onChange={(e) => setChemPostWateringOverride(e.target.value)}
                        rows={2}
                        data-testid="textarea-completion-watering"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("campaigns.chemReEntryIntervalLabel")}</Label>
                      <Textarea
                        placeholder={t("campaigns.chemReEntryIntervalPlaceholder")}
                        value={chemReEntryIntervalOverride}
                        onChange={(e) => setChemReEntryIntervalOverride(e.target.value)}
                        rows={1}
                        data-testid="textarea-completion-reentry"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("campaigns.chemMowingRestrictionLabel")}</Label>
                      <Textarea
                        placeholder={t("campaigns.chemMowingRestrictionPlaceholder")}
                        value={chemMowingRestrictionOverride}
                        onChange={(e) => setChemMowingRestrictionOverride(e.target.value)}
                        rows={1}
                        data-testid="textarea-completion-mowing"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("campaigns.chemLabelPdfLabel")}</Label>
                      <div className="flex items-center gap-2">
                        <label
                          className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border text-sm text-muted-foreground hover-elevate"
                          data-testid="label-pdf-upload-trigger"
                        >
                          <FileText className="w-4 h-4" />
                          {labelPdfUploading
                            ? t("campaigns.chemLabelPdfUploading")
                            : labelPdfFileName
                              ? labelPdfFileName
                              : t("campaigns.chemLabelPdfPlaceholder")}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            disabled={labelPdfUploading}
                            data-testid="input-label-pdf-override"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setLabelPdfUploading(true);
                              try {
                                await new Promise<void>((resolve, reject) => {
                                  const xhr = new XMLHttpRequest();
                                  xhr.addEventListener("load", () => {
                                    if (xhr.status >= 200 && xhr.status < 300) {
                                      const data = JSON.parse(xhr.responseText);
                                      setLabelPdfOverrideKey(data.storageKey);
                                      setLabelPdfFileName(file.name);
                                      resolve();
                                    } else {
                                      let msg = t("campaigns.chemLabelPdfUploadError");
                                      try { const d = JSON.parse(xhr.responseText); if (d.error) msg = d.error; } catch {}
                                      reject(new Error(msg));
                                    }
                                  });
                                  xhr.addEventListener("error", () => reject(new Error(t("campaigns.chemLabelPdfUploadError"))));
                                  xhr.open("POST", `/api/campaigns/${campaignId}/items/${itemId}/label-pdf/upload`);
                                  xhr.setRequestHeader("Content-Type", "application/pdf");
                                  xhr.withCredentials = true;
                                  xhr.send(file);
                                });
                                toast({ title: t("campaigns.chemLabelPdfUploaded") });
                              } catch (err) {
                                toast({ title: err instanceof Error ? err.message : t("campaigns.chemLabelPdfUploadError"), variant: "destructive" });
                              } finally {
                                setLabelPdfUploading(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                        {labelPdfFileName && (
                          <Button
                            size="icon"
                            variant="ghost"
                            type="button"
                            onClick={() => { setLabelPdfOverrideKey(null); setLabelPdfFileName(null); }}
                            data-testid="button-remove-label-pdf"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>}
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCompleteWorkDialog(false)} data-testid="button-cancel-complete-work">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (isChemicalCampaign) {
                  completeWorkV2Mutation.mutate({
                    workCompletedAt: completeWorkDate,
                    notes,
                    actualAreasTreated: chemCompletionAreas,
                    actualConditions: chemCompletionConditions,
                    completionNotes: chemCompletionNotes,
                    postApplicationExpectationOverride: chemPostExpectationOverride,
                    postApplicationWateringOverride: chemPostWateringOverride,
                    reEntryIntervalOverride: chemReEntryIntervalOverride,
                    mowingRestrictionOverride: chemMowingRestrictionOverride,
                    labelPdfOverrideKey,
                  });
                } else {
                  updateItemMutation.mutate({ chemAction: "complete_work", notes, workCompletedAt: completeWorkDate });
                  setShowCompleteWorkDialog(false);
                }
              }}
              disabled={!completeWorkDate || completeWorkV2Mutation.isPending || updateItemMutation.isPending}
              data-testid="button-confirm-complete-work"
            >
              {(completeWorkV2Mutation.isPending || updateItemMutation.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Wrench className="w-4 h-4 mr-1" />
              {t("campaigns.chemMarkWorkDone")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showIrrigationCompleteDialog} onOpenChange={(open) => { if (!open) { setShowIrrigationCompleteDialog(false); setPendingIrrigationTaskId(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Checklist</AlertDialogTitle>
            <AlertDialogDescription>All tasks will be completed. Choose the date this item was finished.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-xs text-muted-foreground">Completion Date *</Label>
            <DatePickerField
              value={irrigationCompleteDate ? new Date(irrigationCompleteDate + 'T00:00:00') : undefined}
              onChange={(date) => setIrrigationCompleteDate(date ? format(date, 'yyyy-MM-dd') : '')}
              data-testid="input-irrigation-complete-date"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingIrrigationTaskId(null); }}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingIrrigationTaskId) {
                  toggleChecklistTaskMutation.mutate({ taskId: pendingIrrigationTaskId, completedAt: irrigationCompleteDate });
                }
                setShowIrrigationCompleteDialog(false);
                setPendingIrrigationTaskId(null);
              }}
              disabled={!irrigationCompleteDate}
              data-testid="button-confirm-irrigation-complete"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Confirm & Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showChemReset} onOpenChange={setShowChemReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("campaigns.chemResetConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("campaigns.chemResetMsg")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateItemMutation.mutate({ chemAction: "reset" });
                setShowChemReset(false);
              }}
              data-testid="button-chem-reset-confirm"
            >
              {t("campaigns.chemResetWorkflow")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showNotifPreview} onOpenChange={(open) => { if (!open) { setShowNotifPreview(false); setNotifPreviewData(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-notif-preview">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{t("campaigns.chemPreviewNotifEmail")}</h3>
              <Badge variant="secondary" className="text-xs">{t("common.preview")}</Badge>
            </div>
            {notifPreviewData && (
              <>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("campaigns.emailSubject")}</p>
                  <p className="text-sm font-medium">{notifPreviewData.subject}</p>
                </div>
                {notifPreviewData.templateName && (
                  <p className="text-xs text-muted-foreground">{t("campaigns.emailTemplate")}: {notifPreviewData.templateName}</p>
                )}
                {!notifPreviewData.templateName && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t("campaigns.chemNoNotifTemplate")}</p>
                )}
                {notifPreviewData.htmlBody && (
                  <div className="border rounded-md overflow-hidden">
                    <iframe
                      srcDoc={notifPreviewData.htmlBody}
                      title="Email Preview"
                      className="w-full"
                      style={{ height: "400px", border: "none" }}
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showEmailConfirm} onOpenChange={() => { if (previewDebounceRef.current) { clearTimeout(previewDebounceRef.current); previewDebounceRef.current = null; } setShowEmailConfirm(null); setEmailPreview(null); setPreviewLoading(false); setManualEmail(""); setPreNoticeWindowStart(""); setPreNoticeWindowEnd(""); setPostCommDate(""); setPostCommAreasTreated(""); setPostCommApplicationConditions(""); setPostCommNextVisitDate(""); setTemplateVarSpec(null); setFormVars({}); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-chem-email-compose">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {showEmailConfirm === "pre" ? <Mail className="w-5 h-5 text-primary" /> : <Send className="w-5 h-5 text-primary" />}
              <h3 className="text-lg font-semibold">
                {showEmailConfirm === "pre" ? t("campaigns.chemSendPreNotice") : t("campaigns.chemSendPostNotice")}
              </h3>
            </div>
            {sendGridStatus && !sendGridStatus.connected && (
              <div
                className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/30"
                data-testid="banner-sendgrid-disconnected"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-medium">SendGrid is not connected</div>
                  <div className="text-xs opacity-90">
                    Sends will fail until an admin connects the SendGrid integration in your Replit workspace settings (Integrations → SendGrid).
                    {sendGridStatus.error ? ` (${sendGridStatus.error})` : ""}
                  </div>
                </div>
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: recipient + form inputs */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailRecipient")}</Label>
                  {emailPreview?.recipientEmail ? (
                    <div className="text-sm font-medium mt-0.5" data-testid="text-email-recipient">
                      <span>{emailPreview.contactName ? `${emailPreview.contactName} <${emailPreview.recipientEmail}>` : emailPreview.recipientEmail}</span>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{t("campaigns.chemNoRecipientManual")}</span>
                      </div>
                      <Input
                        type="email"
                        value={manualEmail}
                        onChange={(e) => setManualEmail(e.target.value)}
                        placeholder={t("campaigns.chemManualEmailPlaceholder")}
                        data-testid="input-manual-email"
                      />
                    </div>
                  )}
                </div>
                {templateVarSpec?.hasTemplate && showEmailConfirm === 'post' && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Completion Date *</Label>
                    <DatePickerField
                      value={postCommDate ? new Date(postCommDate + 'T00:00:00') : undefined}
                      onChange={(date) => {
                        const next = date ? format(date, 'yyyy-MM-dd') : '';
                        setPostCommDate(next);
                        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                        previewDebounceRef.current = setTimeout(() => {
                          void refreshChemPreview('post', { completedAt: next, templateVars: formVars });
                        }, 400);
                      }}
                      data-testid="input-post-comm-date"
                    />
                  </div>
                )}
                {templateVarSpec?.hasTemplate ? (
                  templateVarSpec.userVariables.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic" data-testid="text-template-no-inputs">
                      No additional inputs needed for this template.
                    </div>
                  ) : (
                    <div className="space-y-3" data-testid="form-template-vars">
                      {templateVarSpec.userVariables.map((v) => {
                        const value = formVars[v.name] ?? '';
                        const updateVar = (next: string) => {
                          const updated = { ...formVars, [v.name]: next };
                          setFormVars(updated);
                          // Mirror canonical names back to legacy state so the
                          // mutation submit can derive dedicated request fields.
                          if (showEmailConfirm === 'pre') {
                            if (v.name === 'windowStart') setPreNoticeWindowStart(next);
                            if (v.name === 'windowEnd') setPreNoticeWindowEnd(next);
                          } else if (showEmailConfirm === 'post') {
                            if (v.name === 'areasTreated') setPostCommAreasTreated(next);
                            if (v.name === 'applicationConditions') setPostCommApplicationConditions(next);
                            if (v.name === 'nextVisitDate') setPostCommNextVisitDate(next);
                          }
                          // Debounce the preview refresh so rapid typing doesn't
                          // fire a request on every keystroke.
                          if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                          previewDebounceRef.current = setTimeout(() => {
                            void refreshChemPreview(showEmailConfirm as 'pre' | 'post', { completedAt: postCommDate, templateVars: updated });
                          }, 400);
                        };
                        return (
                          <div key={v.name}>
                            <Label className="text-xs text-muted-foreground">{v.label}</Label>
                            {v.type === 'date' ? (
                              <DatePickerField
                                value={value ? new Date(value + 'T00:00:00') : undefined}
                                onChange={(date) => updateVar(date ? format(date, 'yyyy-MM-dd') : '')}
                                data-testid={`input-template-var-${v.name}`}
                              />
                            ) : v.type === 'textarea' ? (
                              <Textarea
                                value={value}
                                onChange={(e) => updateVar(e.target.value)}
                                rows={3}
                                data-testid={`input-template-var-${v.name}`}
                              />
                            ) : (
                              <Input
                                value={value}
                                onChange={(e) => updateVar(e.target.value)}
                                data-testid={`input-template-var-${v.name}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <>
                    {showEmailConfirm === "pre" && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">{t("campaigns.chemPreNoticeWindow")}</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("campaigns.chemWindowStart")}</Label>
                            <DatePickerField
                              value={preNoticeWindowStart ? new Date(preNoticeWindowStart + 'T00:00:00') : undefined}
                              onChange={(date) => {
                                const newStart = date ? format(date, 'yyyy-MM-dd') : '';
                                setPreNoticeWindowStart(newStart);
                                if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                                previewDebounceRef.current = setTimeout(() => {
                                  void refreshChemPreview('pre', { customWindowStart: newStart, customWindowEnd: preNoticeWindowEnd });
                                }, 400);
                              }}
                              data-testid="input-pre-notice-window-start"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">{t("campaigns.chemWindowEnd")}</Label>
                            <DatePickerField
                              value={preNoticeWindowEnd ? new Date(preNoticeWindowEnd + 'T00:00:00') : undefined}
                              onChange={(date) => {
                                const newEnd = date ? format(date, 'yyyy-MM-dd') : '';
                                setPreNoticeWindowEnd(newEnd);
                                if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                                previewDebounceRef.current = setTimeout(() => {
                                  void refreshChemPreview('pre', { customWindowStart: preNoticeWindowStart, customWindowEnd: newEnd });
                                }, 400);
                              }}
                              data-testid="input-pre-notice-window-end"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {showEmailConfirm === "post" && (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Completion Date *</Label>
                          <DatePickerField
                            value={postCommDate ? new Date(postCommDate + 'T00:00:00') : undefined}
                            onChange={(date) => {
                              const next = date ? format(date, 'yyyy-MM-dd') : '';
                              setPostCommDate(next);
                              if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                              previewDebounceRef.current = setTimeout(() => {
                                void refreshChemPreview('post', { completedAt: next, templateVars: { areasTreated: postCommAreasTreated, applicationConditions: postCommApplicationConditions, nextVisitDate: postCommNextVisitDate } });
                              }, 400);
                            }}
                            data-testid="input-post-comm-date"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Areas Treated</Label>
                          <Input
                            value={postCommAreasTreated}
                            onChange={(e) => {
                              const next = e.target.value;
                              setPostCommAreasTreated(next);
                              if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                              previewDebounceRef.current = setTimeout(() => {
                                void refreshChemPreview('post', { completedAt: postCommDate, templateVars: { areasTreated: next, applicationConditions: postCommApplicationConditions, nextVisitDate: postCommNextVisitDate } });
                              }, 400);
                            }}
                            placeholder="e.g. Front lawn, side beds"
                            data-testid="input-post-comm-areas-treated"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Application Conditions</Label>
                          <Input
                            value={postCommApplicationConditions}
                            onChange={(e) => {
                              const next = e.target.value;
                              setPostCommApplicationConditions(next);
                              if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                              previewDebounceRef.current = setTimeout(() => {
                                void refreshChemPreview('post', { completedAt: postCommDate, templateVars: { areasTreated: postCommAreasTreated, applicationConditions: next, nextVisitDate: postCommNextVisitDate } });
                              }, 400);
                            }}
                            placeholder="e.g. Temp 68°F, wind calm, partly cloudy"
                            data-testid="input-post-comm-conditions"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Next Visit Date</Label>
                          <DatePickerField
                            value={postCommNextVisitDate ? new Date(postCommNextVisitDate + 'T00:00:00') : undefined}
                            onChange={(date) => {
                              const next = date ? format(date, 'yyyy-MM-dd') : '';
                              setPostCommNextVisitDate(next);
                              if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
                              previewDebounceRef.current = setTimeout(() => {
                                void refreshChemPreview('post', { completedAt: postCommDate, templateVars: { areasTreated: postCommAreasTreated, applicationConditions: postCommApplicationConditions, nextVisitDate: next } });
                              }, 400);
                            }}
                            data-testid="input-post-comm-next-visit"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Right column: live email preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Email Preview</Label>
                  <div className="flex items-center gap-2">
                    {previewLoading && <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowEmailFullPreview(true)}
                      title="Open full preview"
                      data-testid="button-open-full-email-preview"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailTemplate")}</Label>
                  <div className="text-sm font-medium mt-0.5">{emailPreview?.templateName || "—"}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailSubject")}</Label>
                  <div className="text-sm font-medium mt-0.5 p-2 rounded-md border bg-muted/30" data-testid="text-email-subject">
                    {emailPreview?.subject || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailBody")}</Label>
                  <div className="relative mt-0.5">
                    {previewLoading && (
                      <div className="absolute inset-0 bg-background/60 rounded-md flex items-center justify-center z-10">
                        <span className="text-xs text-muted-foreground animate-pulse">Rendering…</span>
                      </div>
                    )}
                    <iframe
                      srcDoc={emailPreview?.htmlBody || "<p style='color:#888;font-family:sans-serif;padding:1rem'>—</p>"}
                      className="w-full rounded-md border bg-white"
                      style={{ height: "340px" }}
                      sandbox="allow-same-origin"
                      data-testid="iframe-pre-send-email-body"
                    />
                  </div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => { if (previewDebounceRef.current) { clearTimeout(previewDebounceRef.current); previewDebounceRef.current = null; } setShowEmailConfirm(null); setEmailPreview(null); setPreviewLoading(false); setManualEmail(""); setPreNoticeWindowStart(""); setPreNoticeWindowEnd(""); setPostCommDate(""); setPostCommAreasTreated(""); setPostCommApplicationConditions(""); setPostCommNextVisitDate(""); setTemplateVarSpec(null); setFormVars({}); }} data-testid="button-cancel-email">
                {t("common.cancel")}
              </Button>
              <Button
                variant="ghost"
                className="w-full sm:w-auto text-muted-foreground"
                onClick={handleConfirmSend}
                disabled={updateItemMutation.isPending || (!emailPreview?.recipientEmail && (!manualEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim()))) || (showEmailConfirm === "post" && !postCommDate)}
                data-testid="button-send-without-preview"
              >
                {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Send without preview
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => { void handleOpenPreview(); }}
                disabled={previewLoading || (!emailPreview?.recipientEmail && (!manualEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim()))) || (showEmailConfirm === "post" && !postCommDate)}
                data-testid="button-preview-email"
              >
                <Eye className="w-4 h-4 mr-1" />
                Preview
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-size email preview modal */}
      <Dialog open={showEmailFullPreview} onOpenChange={setShowEmailFullPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-3" data-testid="dialog-full-email-preview">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {(() => {
            const subject = emailPreview?.subject ?? '';
            const htmlBody = emailPreview?.htmlBody ?? '';
            const unresolvedCount = countUnresolvedVars(subject, htmlBody);
            const highlightedHtml = highlightUnresolvedVars(htmlBody);
            const sendDisabled = updateItemMutation.isPending || (!emailPreview?.recipientEmail && (!manualEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim()))) || (showEmailConfirm === "post" && !postCommDate);
            const toAddress = emailPreview?.recipientEmail
              ? (emailPreview.contactName ? `${emailPreview.contactName} <${emailPreview.recipientEmail}>` : emailPreview.recipientEmail)
              : manualEmail || '—';
            return (
              <>
                <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-sm space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-14 shrink-0 font-medium">Subject</span>
                    <span className="font-medium">{renderSubjectWithHighlights(subject)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-14 shrink-0 font-medium">To</span>
                    <span>{toAddress}</span>
                  </div>
                </div>
                {unresolvedCount > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400" data-testid="banner-unresolved-vars">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {unresolvedCount} variable{unresolvedCount !== 1 ? 's' : ''} not filled in — highlighted in yellow below
                    </span>
                  </div>
                )}
                <div className="flex-1 overflow-hidden rounded-md border bg-white" style={{ minHeight: 0 }}>
                  <iframe
                    srcDoc={highlightedHtml || "<p style='color:#888;font-family:sans-serif;padding:1rem'>No preview available.</p>"}
                    className="w-full"
                    style={{ height: "520px", border: "none" }}
                    sandbox="allow-same-origin"
                    data-testid="iframe-full-email-preview"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button variant="outline" onClick={() => setShowEmailFullPreview(false)} data-testid="button-preview-back">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={() => { void handleConfirmSend(); }}
                    disabled={sendDisabled}
                    data-testid="button-preview-send"
                  >
                    {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    {showEmailConfirm === "pre" ? <Mail className="w-4 h-4 mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                    {t("campaigns.chemConfirmSend")}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={showFinishWithoutComms} onOpenChange={setShowFinishWithoutComms}>
        <DialogContent className="max-w-lg" data-testid="dialog-finish-without-comms">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{t("campaigns.chemFinishWithoutCommsTitle")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{t("campaigns.chemFinishWithoutCommsDesc")}</p>
            <Separator />
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemCompletionDate")} *</Label>
                <DatePickerField
                  value={finishDate ? new Date(finishDate + 'T00:00:00') : undefined}
                  onChange={(date) => setFinishDate(date ? format(date, 'yyyy-MM-dd') : '')}
                  data-testid="input-finish-date"
                />
              </div>
              <Separator />
              <WeatherCapturePanel
                item={item as WeatherCapturableItem}
                campaignId={campaignId!}
                customerLat={item.customerLat}
                customerLng={item.customerLng}
                customerAddress={item.customerAddress}
              />
              {!(item.weatherTemp != null && item.weatherWindSpeed != null && item.weatherConditions) && (
                <p className="text-xs text-muted-foreground" data-testid="text-weather-required-hint">
                  Save weather data above to enable Confirm Finish.
                </p>
              )}
            </div>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFinishWithoutComms(false)} data-testid="button-cancel-finish-no-comms">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  updateItemMutation.mutate({
                    chemAction: "finish_without_comms",
                    notes,
                    completionDate: finishDate,
                    weatherTemp: item.weatherTemp ?? undefined,
                    weatherWindSpeed: item.weatherWindSpeed ?? undefined,
                    weatherWindDirection: item.weatherWindDirection ?? undefined,
                    weatherHumidity: item.weatherHumidity ?? undefined,
                    weatherConditions: item.weatherConditions ?? undefined,
                  });
                  setShowFinishWithoutComms(false);
                }}
                disabled={
                  updateItemMutation.isPending ||
                  !finishDate ||
                  !(item.weatherTemp != null && item.weatherWindSpeed != null && item.weatherConditions)
                }
                data-testid="button-confirm-finish-no-comms"
              >
                {updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {t("campaigns.chemConfirmFinish")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showPropertyMaps && (
        <LayerMapViewer
          customerId={item.customerId}
          fullScreen
          onClose={() => setShowPropertyMaps(false)}
        />
      )}

      <Dialog open={showCompletionEmailPreview} onOpenChange={(open) => { if (!open) { setShowCompletionEmailPreview(false); setCompletionEmailPreview(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="font-semibold text-lg mb-3">{t("campaigns.chemCompletionEmailPreviewTitle")}</div>
          {completionEmailPreview ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailTo")}</Label>
                <div className="text-sm mt-0.5" data-testid="text-completion-preview-recipient">
                  {completionEmailPreview.contactName && <span className="font-medium">{completionEmailPreview.contactName} — </span>}
                  {completionEmailPreview.recipientEmail || t("campaigns.chemEmailNoEmail")}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailSubject")}</Label>
                <div className="text-sm mt-0.5 p-2 rounded-md border bg-muted/30" data-testid="text-completion-preview-subject">
                  {completionEmailPreview.subject || "—"}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("campaigns.chemEmailBody")}</Label>
                <iframe
                  sandbox=""
                  srcDoc={completionEmailPreview.htmlBody || "<p>—</p>"}
                  title={t("chemicalProducts.emailPreviewTitle")}
                  className="w-full border rounded-md bg-white mt-0.5"
                  style={{ height: "260px" }}
                  data-testid="iframe-completion-preview-body"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("campaigns.chemEmailLoadingPreview")}</p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCompletionEmailPreview(false)} data-testid="button-close-completion-preview">
              {t("common.cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {previewPhoto && (
            <img src={previewPhoto} alt="" className="w-full h-auto" data-testid="img-photo-preview" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
