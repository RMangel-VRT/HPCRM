import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Eye, Mail, Loader2, ChevronDown, ChevronUp, AlertTriangle, Users, FileText, Upload, X, Check, ExternalLink } from "lucide-react";

type ChemicalNotificationTemplate = {
  id: string;
  name: string;
  serviceType: string | null;
  isDefault: boolean;
  preVisitSubject: string;
  preVisitHtml: string;
  postVisitSubject: string;
  postVisitHtml: string;
  defaultLabelPdfStorageKey: string | null;
  defaultLabelPdfFilename: string | null;
  productName: string | null;
  activeIngredient: string | null;
  epaRegNumber: string | null;
  purposeText: string | null;
  reentryInterval: string | null;
  wateringInstructions: string | null;
  mowingInstructions: string | null;
  postApplicationExpectation: string | null;
  createdAt: string;
  updatedAt: string;
};

type CustomerSearchResult = {
  id: string;
  name: string;
};

const SERVICE_TYPE_OPTIONS = [
  { value: "broadleaf_weed_control", label: "Broadleaf Weed Control" },
  { value: "fertilizer_application", label: "Fertilizer Application" },
  { value: "pre_emergent_application", label: "Pre-Emergent Application" },
  { value: "crabgrass_treatment", label: "Crabgrass Treatment" },
  { value: "fungicide_application", label: "Fungicide Application" },
  { value: "insecticide_application", label: "Insecticide Application" },
  { value: "aeration_overseeding", label: "Aeration & Overseeding" },
  { value: "custom", label: "Custom" },
];

const PRE_VISIT_VARIABLES = [
  { token: "{{companyName}}", description: "Your company name" },
  { token: "{{customerName}}", description: "The customer / property name" },
  { token: "{{campaignTitle}}", description: "Campaign title" },
  { token: "{{targetDate}}", description: "Scheduled / target visit date" },
  { token: "{{backupDate}}", description: "Backup / window end date" },
  { token: "{{notes}}", description: "Additional notes entered at send time" },
];

const POST_VISIT_VARIABLES = [
  { token: "{{companyName}}", description: "Your company name" },
  { token: "{{customerName}}", description: "The customer / property name" },
  { token: "{{campaignTitle}}", description: "Campaign title" },
  { token: "{{completionDate}}", description: "Completion date" },
  { token: "{{areasTreated}}", description: "Areas treated (entered at send time)" },
  { token: "{{applicationConditions}}", description: "Weather / application conditions (entered at send time)" },
  { token: "{{nextVisitDate}}", description: "Next scheduled visit date (entered at send time)" },
  { token: "{{notes}}", description: "Technician notes entered at send time" },
];

const SAMPLE_PRE_VARS: Record<string, string> = {
  companyName: "Greenfield Lawn Care",
  customerName: "Smith Residence",
  campaignTitle: "Spring Weed Control 2025",
  targetDate: "May 15, 2025",
  backupDate: "May 22, 2025",
  notes: "Please ensure pets are inside prior to our visit.",
};

const SAMPLE_POST_VARS: Record<string, string> = {
  companyName: "Greenfield Lawn Care",
  customerName: "Smith Residence",
  campaignTitle: "Spring Weed Control 2025",
  completionDate: "May 15, 2025",
  areasTreated: "Front lawn, back lawn",
  applicationConditions: "Temp 68°F, wind calm, partly cloudy",
  nextVisitDate: "June 12, 2025",
  notes: "Crabgrass pressure is moderate — expect full results in 2–3 weeks.",
};

function substituteVars(template: string, vars: Record<string, string>): string {
  let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    return vars[varName]?.trim() ? content : '';
  });
  return result.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

function serviceTypeLabel(serviceType: string | null): string {
  if (!serviceType) return "—";
  return SERVICE_TYPE_OPTIONS.find(o => o.value === serviceType)?.label || serviceType;
}

const BLANK_FORM = {
  name: "",
  serviceType: SERVICE_TYPE_OPTIONS[0].value,
  preVisitSubject: "",
  preVisitHtml: "",
  postVisitSubject: "",
  postVisitHtml: "",
  productName: "",
  activeIngredient: "",
  epaRegNumber: "",
  purposeText: "",
  reentryInterval: "",
  wateringInstructions: "",
  mowingInstructions: "",
  postApplicationExpectation: "",
};

type PreviewWithDataState = {
  open: boolean;
  emailType: "pre" | "post";
  subject: string;
  htmlBody: string;
};

export default function ChemicalNotificationTemplates() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: templateCampaigns = [], isLoading: campaignsLoading, isError: campaignsError } = useQuery<{ id: string; title: string; status: string }[]>({
    queryKey: ["/api/chemical-notification-templates", deleteId, "campaigns"],
    enabled: !!deleteId,
  });
  const [previewMode, setPreviewMode] = useState<"pre" | "post" | null>(null);
  const [showVarsPanel, setShowVarsPanel] = useState(false);

  const [previewWithData, setPreviewWithData] = useState<PreviewWithDataState>({
    open: false,
    emailType: "pre",
    subject: "",
    htmlBody: "",
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [previewCampaignTitle, setPreviewCampaignTitle] = useState("");
  const [previewRendered, setPreviewRendered] = useState<{ subject: string; htmlBody: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTemplateLabel, setUploadingTemplateLabel] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading } = useQuery<ChemicalNotificationTemplate[]>({
    queryKey: ["/api/chemical-notification-templates"],
  });

  const { data: companyData } = useQuery<{ pesticideLicenseNumber: string | null }>({
    queryKey: ["/api/company"],
  });

  const licenseIsBlank = !companyData?.pesticideLicenseNumber?.trim();

  const templateUsesPesticideLicense = (html: string) =>
    /\{\{#if\s+pesticideLicenseNumber\}\}/.test(html);

  const { data: customerResults = [] } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/customers/search", customerSearch],
    queryFn: async () => {
      if (!customerSearch.trim()) return [];
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: customerSearch.trim().length > 0,
  });

  useEffect(() => {
    if (!previewWithData.open) {
      setCustomerSearch("");
      setSelectedCustomer(null);
      setShowCustomerDropdown(false);
      setPreviewCampaignTitle("");
      setPreviewRendered(null);
    }
  }, [previewWithData.open]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof BLANK_FORM) => {
      const res = await apiRequest("POST", "/api/chemical-notification-templates", {
        ...data,
        serviceType: data.serviceType || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
      toast({ title: "Template created" });
      setShowForm(false);
      setForm(BLANK_FORM);
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof BLANK_FORM }) => {
      const res = await apiRequest("PATCH", `/api/chemical-notification-templates/${id}`, {
        ...data,
        serviceType: data.serviceType || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
      toast({ title: "Template updated" });
      setShowForm(false);
      setEditingId(null);
      setForm(BLANK_FORM);
    },
    onError: () => {
      toast({ title: "Failed to update template", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/chemical-notification-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
      toast({ title: "Template deleted" });
      setDeleteId(null);
    },
    onError: (error: Error) => {
      if (error.message.startsWith("409")) {
        toast({
          title: "Cannot delete template",
          description: "This template is used by one or more active campaigns. Archive or reassign those campaigns first.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to delete template", variant: "destructive" });
      }
    },
  });

  const handleEdit = (tpl: ChemicalNotificationTemplate) => {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name,
      serviceType: tpl.serviceType || "",
      preVisitSubject: tpl.preVisitSubject,
      preVisitHtml: tpl.preVisitHtml,
      postVisitSubject: tpl.postVisitSubject,
      postVisitHtml: tpl.postVisitHtml,
      productName: tpl.productName || "",
      activeIngredient: tpl.activeIngredient || "",
      epaRegNumber: tpl.epaRegNumber || "",
      purposeText: tpl.purposeText || "",
      reentryInterval: tpl.reentryInterval || "",
      wateringInstructions: tpl.wateringInstructions || "",
      mowingInstructions: tpl.mowingInstructions || "",
      postApplicationExpectation: tpl.postApplicationExpectation || "",
    });
    setShowForm(true);
    setPreviewMode(null);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    if (!form.preVisitSubject.trim() || !form.postVisitSubject.trim()) {
      toast({ title: "Pre-visit and post-visit subjects are required", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const previewHtml = previewMode === "pre"
    ? substituteVars(form.preVisitHtml, SAMPLE_PRE_VARS)
    : previewMode === "post"
      ? substituteVars(form.postVisitHtml, SAMPLE_POST_VARS)
      : "";

  const openPreviewWithData = (emailType: "pre" | "post") => {
    setPreviewWithData({
      open: true,
      emailType,
      subject: emailType === "pre" ? form.preVisitSubject : form.postVisitSubject,
      htmlBody: emailType === "pre" ? form.preVisitHtml : form.postVisitHtml,
    });
  };

  const handleRunPreview = async () => {
    setPreviewLoading(true);
    setPreviewRendered(null);
    try {
      const res = await apiRequest("POST", "/api/chemical-notification-templates/preview", {
        customerId: selectedCustomer?.id || null,
        subject: previewWithData.subject,
        htmlBody: previewWithData.htmlBody,
        emailType: previewWithData.emailType,
        campaignTitle: previewCampaignTitle || undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Preview failed", variant: "destructive" });
        return;
      }
      setPreviewRendered({ subject: data.subject, htmlBody: data.htmlBody });
    } catch {
      toast({ title: "Failed to generate preview", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-notification-templates">Chemical Notification Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage email templates used for chemical campaign pre-visit and post-visit notifications.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(BLANK_FORM); setShowForm(true); setPreviewMode(null); }} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No notification templates yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Service Type</TableHead>
                  <TableHead>Label PDF</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id} data-testid={`row-template-${tpl.id}`}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell>
                      {tpl.serviceType ? (
                        <Badge variant="secondary" className="text-xs">{serviceTypeLabel(tpl.serviceType)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tpl.defaultLabelPdfStorageKey ? (
                        <div className="flex items-center gap-1 text-green-700 dark:text-green-400" data-testid={`text-template-label-${tpl.id}`}>
                          <Check className="w-4 h-4 flex-shrink-0" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(tpl.updatedAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(tpl)} data-testid={`button-edit-template-${tpl.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(tpl.id)} data-testid={`button-delete-template-${tpl.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); setPreviewMode(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-template-form">
          <DialogHeader>
            <DialogTitle>{editingId ? t("campaigns.chemTemplateEditTitle") : t("campaigns.chemTemplateNewTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Broadleaf Weed Control"
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Service Type</Label>
                <Select value={form.serviceType} onValueChange={(v) => setForm(f => ({ ...f, serviceType: v }))}>
                  <SelectTrigger data-testid="select-template-service-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(() => {
              const tpl = editingId ? templates.find(tmpl => tmpl.id === editingId) : null;
              return (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("campaigns.chemTemplateLabelSection")}</Label>
                  <p className="text-xs text-muted-foreground">{t("campaigns.chemTemplateLabelSectionHint")}</p>
                  {!editingId ? (
                    <p className="text-xs text-muted-foreground italic" data-testid="text-label-create-hint">
                      {t("campaigns.chemTemplateLabelCreateHint")}
                    </p>
                  ) : tpl?.defaultLabelPdfFilename ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs flex-1 truncate" data-testid="text-template-label-filename">{tpl.defaultLabelPdfFilename}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={uploadingTemplateLabel}
                          onClick={async () => {
                            setUploadingTemplateLabel(true);
                            try {
                              await apiRequest("DELETE", `/api/chemical-notification-templates/${editingId}/label`);
                              queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
                              toast({ title: t("campaigns.chemTemplateLabelRemoved") });
                            } catch {
                              toast({ title: t("campaigns.chemTemplateLabelRemoveFailed"), variant: "destructive" });
                            } finally {
                              setUploadingTemplateLabel(false);
                            }
                          }}
                          data-testid="button-remove-template-label"
                        >
                          {uploadingTemplateLabel ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        </Button>
                      </div>
                      <div>
                        <input
                          ref={labelInputRef}
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.type !== "application/pdf") {
                              toast({ title: t("campaigns.chemTemplateLabelPdfOnly"), variant: "destructive" });
                              return;
                            }
                            setUploadingTemplateLabel(true);
                            try {
                              const arrayBuffer = await file.arrayBuffer();
                              const res = await fetch(`/api/chemical-notification-templates/${editingId}/label?filename=${encodeURIComponent(file.name)}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/pdf" },
                                body: arrayBuffer,
                                credentials: "include",
                              });
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                throw new Error(err.error || "Upload failed");
                              }
                              queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
                              toast({ title: t("campaigns.chemTemplateLabelUploaded") });
                            } catch (err: unknown) {
                              toast({ title: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
                            } finally {
                              setUploadingTemplateLabel(false);
                              if (labelInputRef.current) labelInputRef.current.value = "";
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={uploadingTemplateLabel}
                          onClick={() => labelInputRef.current?.click()}
                          data-testid="button-replace-template-label"
                        >
                          {uploadingTemplateLabel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                          {t("campaigns.chemTemplateLabelReplace")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={labelInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.type !== "application/pdf") {
                            toast({ title: t("campaigns.chemTemplateLabelPdfOnly"), variant: "destructive" });
                            return;
                          }
                          setUploadingTemplateLabel(true);
                          try {
                            const arrayBuffer = await file.arrayBuffer();
                            const res = await fetch(`/api/chemical-notification-templates/${editingId}/label?filename=${encodeURIComponent(file.name)}`, {
                              method: "POST",
                              headers: { "Content-Type": "application/pdf" },
                              body: arrayBuffer,
                              credentials: "include",
                            });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}));
                              throw new Error(err.error || "Upload failed");
                            }
                            queryClient.invalidateQueries({ queryKey: ["/api/chemical-notification-templates"] });
                            toast({ title: t("campaigns.chemTemplateLabelUploaded") });
                          } catch (err: unknown) {
                            toast({ title: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
                          } finally {
                            setUploadingTemplateLabel(false);
                            if (labelInputRef.current) labelInputRef.current.value = "";
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadingTemplateLabel}
                        onClick={() => labelInputRef.current?.click()}
                        data-testid="button-upload-template-label"
                      >
                        {uploadingTemplateLabel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {t("campaigns.chemTemplateLabelUpload")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">Pre-Visit Email</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviewMode(prev => prev === "pre" ? null : "pre")} data-testid="button-preview-pre">
                    <Eye className="w-4 h-4 mr-1" />
                    {previewMode === "pre" ? "Hide Preview" : "Preview"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openPreviewWithData("pre")} data-testid="button-preview-pre-with-data">
                    <Users className="w-4 h-4 mr-1" />
                    Preview with data
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={form.preVisitSubject}
                  onChange={(e) => setForm(f => ({ ...f, preVisitSubject: e.target.value }))}
                  placeholder="e.g. Upcoming Broadleaf Weed Control — {{customerName}}"
                  data-testid="input-pre-visit-subject"
                />
              </div>
              <div className="space-y-2">
                <Label>HTML Body</Label>
                <Textarea
                  value={form.preVisitHtml}
                  onChange={(e) => setForm(f => ({ ...f, preVisitHtml: e.target.value }))}
                  placeholder="Paste your email HTML here..."
                  rows={10}
                  className="font-mono text-xs"
                  data-testid="textarea-pre-visit-html"
                />
                {licenseIsBlank && templateUsesPesticideLicense(form.preVisitHtml) && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="warning-pesticide-license-pre">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      This template includes a pesticide license footer, but your <strong>Pesticide Applicator License #</strong> is not set. The license number will be hidden in sent emails.{" "}
                      <a href="/dashboard/settings/company" className="underline font-medium inline-flex items-center gap-0.5">
                        Add it in Company Settings <ExternalLink className="w-3 h-3" />
                      </a>
                    </span>
                  </div>
                )}
              </div>
              {previewMode === "pre" && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preview (sample data)</Label>
                  <div className="border rounded-md overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      title="Pre-visit email preview"
                      className="w-full min-h-[400px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">Post-Visit Email</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviewMode(prev => prev === "post" ? null : "post")} data-testid="button-preview-post">
                    <Eye className="w-4 h-4 mr-1" />
                    {previewMode === "post" ? "Hide Preview" : "Preview"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openPreviewWithData("post")} data-testid="button-preview-post-with-data">
                    <Users className="w-4 h-4 mr-1" />
                    Preview with data
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={form.postVisitSubject}
                  onChange={(e) => setForm(f => ({ ...f, postVisitSubject: e.target.value }))}
                  placeholder="e.g. Broadleaf Weed Control Completed — {{customerName}}"
                  data-testid="input-post-visit-subject"
                />
              </div>
              <div className="space-y-2">
                <Label>HTML Body</Label>
                <Textarea
                  value={form.postVisitHtml}
                  onChange={(e) => setForm(f => ({ ...f, postVisitHtml: e.target.value }))}
                  placeholder="Paste your email HTML here..."
                  rows={10}
                  className="font-mono text-xs"
                  data-testid="textarea-post-visit-html"
                />
                {licenseIsBlank && templateUsesPesticideLicense(form.postVisitHtml) && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="warning-pesticide-license-post">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      This template includes a pesticide license footer, but your <strong>Pesticide Applicator License #</strong> is not set. The license number will be hidden in sent emails.{" "}
                      <a href="/dashboard/settings/company" className="underline font-medium inline-flex items-center gap-0.5">
                        Add it in Company Settings <ExternalLink className="w-3 h-3" />
                      </a>
                    </span>
                  </div>
                )}
              </div>
              {previewMode === "post" && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preview (sample data)</Label>
                  <div className="border rounded-md overflow-hidden">
                    <iframe
                      srcDoc={previewHtml}
                      title="Post-visit email preview"
                      className="w-full min-h-[400px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Product Details (defaults)</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  These values are merged into rendered emails as defaults for the matching template variables.
                  Per-visit overrides on the campaign item still take precedence.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Product Name</Label>
                  <Input
                    value={form.productName}
                    onChange={(e) => setForm(f => ({ ...f, productName: e.target.value }))}
                    placeholder="e.g. Trimec Classic"
                    data-testid="input-product-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Active Ingredient</Label>
                  <Input
                    value={form.activeIngredient}
                    onChange={(e) => setForm(f => ({ ...f, activeIngredient: e.target.value }))}
                    placeholder="e.g. 2,4-D, MCPP, Dicamba"
                    data-testid="input-active-ingredient"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">EPA Reg #</Label>
                  <Input
                    value={form.epaRegNumber}
                    onChange={(e) => setForm(f => ({ ...f, epaRegNumber: e.target.value }))}
                    placeholder="e.g. 2217-543"
                    data-testid="input-epa-reg-number"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Re-entry Interval</Label>
                  <Input
                    value={form.reentryInterval}
                    onChange={(e) => setForm(f => ({ ...f, reentryInterval: e.target.value }))}
                    placeholder="e.g. Until dry (typically 1–2 hours)"
                    data-testid="input-reentry-interval"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Purpose</Label>
                  <Input
                    value={form.purposeText}
                    onChange={(e) => setForm(f => ({ ...f, purposeText: e.target.value }))}
                    placeholder="e.g. Selective control of broadleaf weeds"
                    data-testid="input-purpose-text"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Watering Instructions</Label>
                  <Textarea
                    value={form.wateringInstructions}
                    onChange={(e) => setForm(f => ({ ...f, wateringInstructions: e.target.value }))}
                    placeholder="e.g. Do not water for 24 hours after application."
                    rows={2}
                    data-testid="textarea-watering-instructions"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mowing Instructions</Label>
                  <Textarea
                    value={form.mowingInstructions}
                    onChange={(e) => setForm(f => ({ ...f, mowingInstructions: e.target.value }))}
                    placeholder="e.g. Wait at least 48 hours before mowing."
                    rows={2}
                    data-testid="textarea-mowing-instructions"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Post-Application Expectation</Label>
                  <Textarea
                    value={form.postApplicationExpectation}
                    onChange={(e) => setForm(f => ({ ...f, postApplicationExpectation: e.target.value }))}
                    placeholder="e.g. Visible weed wilt within 5–7 days; full control in 2–3 weeks."
                    rows={2}
                    data-testid="textarea-post-application-expectation"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowVarsPanel(v => !v)}
                data-testid="button-toggle-vars-panel"
              >
                {showVarsPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Variable Reference
              </button>
              {showVarsPanel && (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Pre-Visit Variables</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-1.5">
                      {PRE_VISIT_VARIABLES.map((v) => (
                        <div key={v.token} className="flex items-start gap-2">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{v.token}</code>
                          <span className="text-xs text-muted-foreground">{v.description}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Post-Visit Variables</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-1.5">
                      {POST_VISIT_VARIABLES.map((v) => (
                        <div key={v.token} className="flex items-start gap-2">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{v.token}</code>
                          <span className="text-xs text-muted-foreground">{v.description}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); setPreviewMode(null); }} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-template">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? t("campaigns.chemTemplateSave") : t("campaigns.chemTemplateCreate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewWithData.open} onOpenChange={(v) => setPreviewWithData(s => ({ ...s, open: v }))}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-preview-with-data">
          <DialogHeader>
            <DialogTitle>
              Preview with Real Data — {previewWithData.emailType === "pre" ? "Pre-Visit" : "Post-Visit"} Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer / Property</Label>
              <div className="relative" ref={customerInputRef as any}>
                <Input
                  value={selectedCustomer ? selectedCustomer.name : customerSearch}
                  onChange={(e) => {
                    setSelectedCustomer(null);
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                    setPreviewRendered(null);
                  }}
                  onFocus={() => { if (customerSearch || !selectedCustomer) setShowCustomerDropdown(true); }}
                  placeholder="Search for a customer..."
                  data-testid="input-preview-customer-search"
                />
                {showCustomerDropdown && !selectedCustomer && customerSearch.trim().length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {customerResults.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No customers found</div>
                    ) : (
                      customerResults.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 text-sm hover-elevate"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearch("");
                            setShowCustomerDropdown(false);
                            setPreviewRendered(null);
                          }}
                          data-testid={`option-customer-${c.id}`}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedCustomer && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{selectedCustomer.name}</Badge>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setSelectedCustomer(null); setPreviewRendered(null); }}
                    data-testid="button-clear-customer"
                  >
                    Clear
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The customer name and your company name will be pulled from real records. Other fields use sensible defaults unless overridden below.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Campaign Title <span className="text-muted-foreground font-normal">(optional override)</span></Label>
              <Input
                value={previewCampaignTitle}
                onChange={(e) => { setPreviewCampaignTitle(e.target.value); setPreviewRendered(null); }}
                placeholder="e.g. Spring Weed Control 2026"
                data-testid="input-preview-campaign-title"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleRunPreview} disabled={previewLoading} data-testid="button-generate-preview">
                {previewLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Generate Preview
              </Button>
            </div>

            {previewRendered && (
              <div className="space-y-3">
                <Separator />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rendered Subject</Label>
                  <p className="text-sm font-medium border rounded-md px-3 py-2 bg-muted/40" data-testid="text-preview-rendered-subject">
                    {previewRendered.subject || <span className="text-muted-foreground italic">No subject</span>}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rendered Email Body</Label>
                  <div className="border rounded-md overflow-hidden" data-testid="container-preview-rendered-html">
                    <iframe
                      srcDoc={previewRendered.htmlBody}
                      title="Email preview with real data"
                      className="w-full min-h-[400px] bg-white"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPreviewWithData(s => ({ ...s, open: false }))} data-testid="button-close-preview-dialog">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent data-testid="dialog-delete-template">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Are you sure you want to delete this notification template? This action cannot be undone.</p>
                {campaignsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-campaigns-loading">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking campaign usage...
                  </div>
                ) : campaignsError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1" data-testid="status-campaigns-error">
                    <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Unable to verify campaign usage
                    </div>
                    <p className="text-xs text-muted-foreground">Could not load the list of campaigns using this template. Deletion is disabled until this can be confirmed.</p>
                  </div>
                ) : templateCampaigns.length > 0 ? (() => {
                  const activeCampaigns = templateCampaigns.filter((c) => c.status === "active");
                  const inactiveCampaigns = templateCampaigns.filter((c) => c.status !== "active");
                  return (
                    <div className="space-y-2">
                      {activeCampaigns.length > 0 && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2" data-testid="status-campaigns-blocked">
                          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {activeCampaigns.length === 1
                              ? "1 active campaign is using this template"
                              : `${activeCampaigns.length} active campaigns are using this template`}
                          </div>
                          <p className="text-xs text-muted-foreground">Deletion is blocked while active campaigns reference this template. Archive or reassign these campaigns first:</p>
                          <ul className="space-y-1" data-testid="list-active-campaigns">
                            {activeCampaigns.map((c) => (
                              <li key={c.id} className="flex items-center gap-2 text-xs" data-testid={`item-campaign-${c.id}`}>
                                <span className="font-medium">{c.title}</span>
                                <Badge variant="secondary" className="text-xs capitalize">{c.status}</Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {inactiveCampaigns.length > 0 && (
                        <div className="rounded-md border border-muted bg-muted/30 p-3 space-y-2" data-testid="status-campaigns-warning">
                          <p className="text-xs text-muted-foreground">
                            {inactiveCampaigns.length === 1
                              ? "1 completed or archived campaign also references this template and will lose its assignment:"
                              : `${inactiveCampaigns.length} completed or archived campaigns also reference this template and will lose their assignment:`}
                          </p>
                          <ul className="space-y-1" data-testid="list-inactive-campaigns">
                            {inactiveCampaigns.map((c) => (
                              <li key={c.id} className="flex items-center gap-2 text-xs" data-testid={`item-campaign-${c.id}`}>
                                <span className="font-medium">{c.title}</span>
                                <Badge variant="secondary" className="text-xs capitalize">{c.status}</Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <p className="text-sm text-muted-foreground" data-testid="status-campaigns-none">No campaigns are currently using this template.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
              disabled={deleteMutation.isPending || campaignsLoading || !!campaignsError || templateCampaigns.some((c) => c.status === "active")}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
