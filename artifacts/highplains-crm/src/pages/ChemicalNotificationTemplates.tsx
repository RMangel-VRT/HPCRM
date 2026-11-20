import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { companyRequest } from "@/components/companyDocuments/companyDocumentsApi";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { SettingsRailLayout } from "@/components/nav/SettingsRailLayout";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Plus, Pencil, Trash2, Eye, Mail, Loader2, ChevronDown, ChevronUp, AlertTriangle, FileText, Upload, X, Check, ArrowLeft } from "lucide-react";

type ChemicalNotificationTemplate = {
  id: string;
  name: string;
  serviceType: string | null;
  isDefault: boolean;

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

const SERVICE_TYPE_OPTIONS = [
  { value: "broadleaf_weed_control" },
  { value: "fertilizer_application" },
  { value: "pre_emergent_application" },
  { value: "crabgrass_treatment" },
  { value: "fungicide_application" },
  { value: "insecticide_application" },
  { value: "aeration_overseeding" },
  { value: "custom" },
];

const BLANK_FORM = {
  name: "",
  serviceType: SERVICE_TYPE_OPTIONS[0].value,
  isDefault: false,

  productName: "",
  activeIngredient: "",
  epaRegNumber: "",
  purposeText: "",
  reentryInterval: "",
  wateringInstructions: "",
  mowingInstructions: "",
  postApplicationExpectation: "",
};

type Preview = { subject: string; htmlBody: string };
const templateUrl = "/api/chemical-notification-templates";

export default function ChemicalNotificationTemplates() {
  const { user } = useAuth();
  const companyId = user?.activeCompanyId;
  return <SettingsRailLayout activeKey="notification-templates">
    {companyId && <ChemicalNotificationTemplatesContent key={companyId} companyId={companyId} />}
  </SettingsRailLayout>;
}

function ChemicalNotificationTemplatesContent({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showProductDetails, setShowProductDetails] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadingTemplateLabel, setUploadingTemplateLabel] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const templateKey = [templateUrl, companyId];

  const { data: templateCampaigns = [], isLoading: campaignsLoading, isError: campaignsError } = useQuery<{ id: string; title: string; status: string }[]>({
    queryKey: [...templateKey, deleteId, "campaigns"],
    queryFn: async () => (await companyRequest(companyId, "GET", `${templateUrl}/${deleteId}/campaigns`)).json(),
    enabled: !!deleteId,
  });
  const { data: templates = [], isLoading } = useQuery<ChemicalNotificationTemplate[]>({
    queryKey: templateKey,
    queryFn: async () => (await companyRequest(companyId, "GET", templateUrl)).json(),
  });
  const currentTemplate = editingId ? templates.find(t => t.id === editingId) : null;
  const otherDefault = templates.find(t => t.isDefault && t.id !== editingId);
  const preview = useQuery({
    queryKey: [...templateKey, "preview", editingId, currentTemplate?.updatedAt, form],
    enabled: previewOpen,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const render = async (emailType: "pre" | "post"): Promise<Preview> => {
        const result = await companyRequest(companyId, "POST", `${templateUrl}/preview`,
          { ...form, templateId: editingId ?? undefined, emailType }, signal);
        return result.json();
      };
      const [pre, post] = await Promise.all([render("pre"), render("post")]);
      return { pre, post };
    },
  });

  const closeEditor = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowProductDetails(false);
    setPreviewOpen(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof BLANK_FORM) => {
      const res = await companyRequest(companyId, "POST", "/api/chemical-notification-templates", {
        ...data,
        serviceType: data.serviceType,
        productName: data.productName || null,
        activeIngredient: data.activeIngredient || null,
        epaRegNumber: data.epaRegNumber || null,
        purposeText: data.purposeText || null,
        reentryInterval: data.reentryInterval || null,
        wateringInstructions: data.wateringInstructions || null,
        mowingInstructions: data.mowingInstructions || null,
        postApplicationExpectation: data.postApplicationExpectation || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKey });
      toast({ title: t("campaigns.chemTemplateCreated") });
      closeEditor();
    },
    onError: (error: Error) => {
      toast({
        title: t("campaigns.chemTemplateCreateError"),
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof BLANK_FORM }) => {
      const res = await companyRequest(companyId, "PATCH", `/api/chemical-notification-templates/${id}`, {
        ...data,
        serviceType: data.serviceType,
        productName: data.productName || null,
        activeIngredient: data.activeIngredient || null,
        epaRegNumber: data.epaRegNumber || null,
        purposeText: data.purposeText || null,
        reentryInterval: data.reentryInterval || null,
        wateringInstructions: data.wateringInstructions || null,
        mowingInstructions: data.mowingInstructions || null,
        postApplicationExpectation: data.postApplicationExpectation || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKey });
      toast({ title: t("campaigns.chemTemplateUpdated") });
      closeEditor();
    },
    onError: (error: Error) => {
      toast({
        title: t("campaigns.chemTemplateUpdateError"),
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await companyRequest(companyId, "DELETE", `/api/chemical-notification-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKey });
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
      serviceType: tpl.serviceType || SERVICE_TYPE_OPTIONS[0].value,
      isDefault: tpl.isDefault,

      productName: tpl.productName || "",
      activeIngredient: tpl.activeIngredient || "",
      epaRegNumber: tpl.epaRegNumber || "",
      purposeText: tpl.purposeText || "",
      reentryInterval: tpl.reentryInterval || "",
      wateringInstructions: tpl.wateringInstructions || "",
      mowingInstructions: tpl.mowingInstructions || "",
      postApplicationExpectation: tpl.postApplicationExpectation || "",
    });
    setShowProductDetails(false);
    setPreviewOpen(false);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: t("campaigns.chemTemplateNameRequired"), variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const LabelUploadSection = () => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{t("campaigns.chemTemplateLabelSection")}</Label>
      <p className="text-xs text-muted-foreground">{t("campaigns.chemTemplateLabelSectionHint")}</p>
      {!editingId ? (
        <p className="text-xs text-muted-foreground italic" data-testid="text-label-create-hint">
          {t("campaigns.chemTemplateLabelCreateHint")}
        </p>
      ) : currentTemplate?.defaultLabelPdfFilename ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs flex-1 truncate" data-testid="text-template-label-filename">{currentTemplate.defaultLabelPdfFilename}</span>
            <Button
              variant="ghost"
              size="icon"
              disabled={uploadingTemplateLabel}
              onClick={async () => {
                setUploadingTemplateLabel(true);
                try {
                  await companyRequest(companyId, "DELETE", `/api/chemical-notification-templates/${editingId}/label`);
                  queryClient.invalidateQueries({ queryKey: templateKey });
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
                    headers: { "Content-Type": "application/pdf", "X-Company-Id": companyId },
                    body: arrayBuffer,
                    credentials: "include",
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || t("campaigns.chemTemplateLabelUploadError"));
                  }
                  queryClient.invalidateQueries({ queryKey: templateKey });
                  toast({ title: t("campaigns.chemTemplateLabelUploaded") });
                } catch (err: unknown) {
                  toast({ title: err instanceof Error ? err.message : t("campaigns.chemTemplateLabelUploadError"), variant: "destructive" });
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
                  headers: { "Content-Type": "application/pdf", "X-Company-Id": companyId },
                  body: arrayBuffer,
                  credentials: "include",
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || t("campaigns.chemTemplateLabelUploadError"));
                }
                queryClient.invalidateQueries({ queryKey: templateKey });
                toast({ title: t("campaigns.chemTemplateLabelUploaded") });
              } catch (err: unknown) {
                toast({ title: err instanceof Error ? err.message : t("campaigns.chemTemplateLabelUploadError"), variant: "destructive" });
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

  const previews = preview.data;
  if (showForm) {
    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col" data-testid="dialog-template-form">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 px-6 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={closeEditor} data-testid="button-cancel-template">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {editingId ? t("campaigns.chemTemplateEditTitle") : t("campaigns.chemTemplateNewTitle")}
              </h1>
              {form.name && (
                <p className="text-xs text-muted-foreground truncate">{form.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={closeEditor} data-testid="button-cancel-template-top">
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-template">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? t("campaigns.chemTemplateSave") : t("campaigns.chemTemplateCreate")}
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-8">

            {/* Basic fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="input-template-name">{t("campaigns.chemTemplateName")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  id="input-template-name" data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="select-template-service-type">{t("campaigns.chemTemplateServiceType")}</Label>
                <Select value={form.serviceType} onValueChange={(v) => setForm(f => ({ ...f, serviceType: v }))}>
                  <SelectTrigger id="select-template-service-type" data-testid="select-template-service-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{t(`campaigns.chemTemplateServices.${o.value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Checkbox id="chemical-template-default" checked={form.isDefault}
                  disabled={!form.isDefault && !!otherDefault}
                  onCheckedChange={value => setForm(f => ({ ...f, isDefault: value === true }))} />
                <Label htmlFor="chemical-template-default">{t("campaigns.chemTemplateDefault")}</Label>
              </div>
              {!form.isDefault && otherDefault && <p className="text-xs text-muted-foreground">
                {t("campaigns.chemTemplateOtherDefault", { name: otherDefault.name })}
              </p>}
            </div>

            <LabelUploadSection />

            <Separator />

            {/* Product Details — collapsible */}
            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground transition-colors"
                onClick={() => setShowProductDetails(v => !v)}
                data-testid="button-toggle-product-details"
              >
                {showProductDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {t("campaigns.chemTemplateProductDetails")}
              </button>
              {showProductDetails && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("campaigns.chemTemplateProductHint")}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="input-product-name" className="text-xs">{t("campaigns.chemTemplateProductName")}</Label>
                      <Input
                        value={form.productName}
                        onChange={(e) => setForm(f => ({ ...f, productName: e.target.value }))}
                        id="input-product-name" data-testid="input-product-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="input-active-ingredient" className="text-xs">{t("campaigns.chemTemplateActiveIngredient")}</Label>
                      <Input
                        value={form.activeIngredient}
                        onChange={(e) => setForm(f => ({ ...f, activeIngredient: e.target.value }))}
                        id="input-active-ingredient" data-testid="input-active-ingredient"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="input-epa-reg-number" className="text-xs">{t("campaigns.chemTemplateEpa")}</Label>
                      <Input
                        value={form.epaRegNumber}
                        onChange={(e) => setForm(f => ({ ...f, epaRegNumber: e.target.value }))}
                        id="input-epa-reg-number" data-testid="input-epa-reg-number"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="input-reentry-interval" className="text-xs">{t("campaigns.chemTemplateReentry")}</Label>
                      <Input
                        value={form.reentryInterval}
                        onChange={(e) => setForm(f => ({ ...f, reentryInterval: e.target.value }))}
                        id="input-reentry-interval" data-testid="input-reentry-interval"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="input-purpose-text" className="text-xs">{t("campaigns.chemTemplatePurpose")}</Label>
                      <Input
                        value={form.purposeText}
                        onChange={(e) => setForm(f => ({ ...f, purposeText: e.target.value }))}
                        id="input-purpose-text" data-testid="input-purpose-text"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="textarea-watering-instructions" className="text-xs">{t("campaigns.chemTemplateWatering")}</Label>
                      <Textarea
                        value={form.wateringInstructions}
                        onChange={(e) => setForm(f => ({ ...f, wateringInstructions: e.target.value }))}

                        rows={2}
                        id="textarea-watering-instructions" data-testid="textarea-watering-instructions"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="textarea-mowing-instructions" className="text-xs">{t("campaigns.chemTemplateMowing")}</Label>
                      <Textarea
                        value={form.mowingInstructions}
                        onChange={(e) => setForm(f => ({ ...f, mowingInstructions: e.target.value }))}

                        rows={2}
                        id="textarea-mowing-instructions" data-testid="textarea-mowing-instructions"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="textarea-post-application-expectation" className="text-xs">{t("campaigns.chemTemplateExpectation")}</Label>
                      <Textarea
                        value={form.postApplicationExpectation}
                        onChange={(e) => setForm(f => ({ ...f, postApplicationExpectation: e.target.value }))}

                        rows={2}
                        id="textarea-post-application-expectation" data-testid="textarea-post-application-expectation"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <Separator />

            <Button variant="outline" disabled={!form.name.trim()} onClick={() => setPreviewOpen(true)} data-testid="button-preview-chemical-emails">
              <Eye className="w-4 h-4 mr-2" />{t("campaigns.chemTemplatePreview")}
            </Button>

            {/* Bottom save/cancel */}
            <div className="flex justify-end gap-2 pb-4">
              <Button variant="outline" onClick={closeEditor} data-testid="button-cancel-template-bottom">
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-template-bottom">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? t("campaigns.chemTemplateSave") : t("campaigns.chemTemplateCreate")}
              </Button>
            </div>
          </div>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="dialog-chemical-email-preview">
            <DialogHeader>
              <DialogTitle>{t("campaigns.chemTemplatePreviewTitle")}</DialogTitle>
              <DialogDescription>{t("campaigns.chemTemplatePreviewHint")}</DialogDescription>
            </DialogHeader>
            {preview.isFetching && !preview.data && <p role="status">{t("campaigns.chemTemplatePreviewLoading")}</p>}
            {preview.isError && <div role="alert" className="flex items-center gap-3 text-sm">
              {t("campaigns.chemTemplatePreviewError")}
              <Button variant="outline" size="sm" onClick={() => void preview.refetch()}>{t("campaigns.chemTemplatePreviewRetry")}</Button>
            </div>}
            {previews && <Tabs defaultValue="pre">
              <TabsList>
                <TabsTrigger value="pre">{t("campaigns.chemTemplatePreviewPre")}</TabsTrigger>
                <TabsTrigger value="post">{t("campaigns.chemTemplatePreviewPost")}</TabsTrigger>
              </TabsList>
              {(["pre", "post"] as const).map(kind => {
                const notice = previews[kind];
                return <TabsContent key={kind} value={kind}>
                  <p className="mb-2 text-sm font-medium">{t("campaigns.chemTemplatePreviewSubject", { subject: notice.subject })}</p>
                  <iframe title={t(kind === "pre" ? "campaigns.chemTemplatePreviewPre" : "campaigns.chemTemplatePreviewPost")}
                    srcDoc={notice.htmlBody} sandbox="" className="h-[60vh] w-full rounded border bg-white"
                    data-testid={`iframe-${kind}-visit-preview`} />
                </TabsContent>;
              })}
            </Tabs>}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-notification-templates">{t("campaigns.chemTemplateListTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("campaigns.chemTemplateListHint")}</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(BLANK_FORM); setShowForm(true); }} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          {t("campaigns.chemTemplateNewTitle")}
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
              <p className="text-sm">{t("campaigns.chemTemplateListEmpty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("campaigns.chemTemplateListName")}</TableHead>
                  <TableHead>{t("campaigns.chemTemplateServiceType")}</TableHead>
                  <TableHead>Label PDF</TableHead>
                  <TableHead>{t("campaigns.chemTemplateListUpdated")}</TableHead>
                  <TableHead className="text-right">{t("campaigns.chemTemplateListActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id} data-testid={`row-template-${tpl.id}`}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell>
                      {tpl.serviceType ? (
                        <Badge variant="secondary" className="text-xs">{t(`campaigns.chemTemplateServices.${tpl.serviceType}`, { defaultValue: tpl.serviceType })}</Badge>
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
