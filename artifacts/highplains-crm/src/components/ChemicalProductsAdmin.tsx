import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Leaf, FileText, Upload, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChemicalProduct } from "@shared/schema";

type ProductFormValues = {
  name: string;
  epaRegistrationNumber: string;
  activeIngredient: string;
  targetPest: string;
  applicationRate: string;
  reEntryInterval: string;
  mowingRestriction: string;
  signalWord: "none" | "caution" | "warning" | "danger";
  isOrganic: boolean;
  isActive: boolean;
  notes: string;
  defaultPostApplicationExpectation: string;
  defaultPostApplicationWatering: string;
};

type ExtractResult = {
  storageKey: string;
  extracted: Partial<{
    name: string;
    epaRegistrationNumber: string;
    activeIngredient: string;
    targetPest: string;
    applicationRate: string;
    reEntryInterval: string;
    mowingRestriction: string;
    signalWord: string;
    isOrganic: boolean;
  }>;
  warning?: string;
  warningType?: "no_text" | "ai_error";
};

export default function ChemicalProductsAdmin() {
  const { t } = useTranslation();

  const productFormSchema = z.object({
    name: z.string().min(1, t("chemicalProducts.nameRequired")),
    epaRegistrationNumber: z.string().optional().default(""),
    activeIngredient: z.string().optional().default(""),
    targetPest: z.string().optional().default(""),
    applicationRate: z.string().optional().default(""),
    reEntryInterval: z.string().optional().default(""),
    mowingRestriction: z.string().optional().default(""),
    signalWord: z.enum(["none", "caution", "warning", "danger"]).default("none"),
    isOrganic: z.boolean().default(false),
    isActive: z.boolean().default(true),
    notes: z.string().optional().default(""),
    defaultPostApplicationExpectation: z.string().optional().default(""),
    defaultPostApplicationWatering: z.string().optional().default(""),
  });
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ChemicalProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ChemicalProduct | null>(null);

  // Label PDF state
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);
  const [extractWarningType, setExtractWarningType] = useState<"no_text" | "ai_error" | null>(null);
  const [pendingStorageKey, setPendingStorageKey] = useState<string | null>(null);
  const [existingLabelKey, setExistingLabelKey] = useState<string | null>(null);
  const [labelViewUrl, setLabelViewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: products = [], isLoading } = useQuery<ChemicalProduct[]>({
    queryKey: ["/api/chemical-products"],
  });

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      epaRegistrationNumber: "",
      activeIngredient: "",
      targetPest: "",
      applicationRate: "",
      reEntryInterval: "",
      mowingRestriction: "",
      signalWord: "none",
      isOrganic: false,
      isActive: true,
      notes: "",
      defaultPostApplicationExpectation: "",
      defaultPostApplicationWatering: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormValues) => {
      const payload: Record<string, unknown> = { ...data };
      if (pendingStorageKey) {
        payload.labelPdfStorageKey = pendingStorageKey;
      }
      if (editingProduct) {
        return apiRequest("PATCH", `/api/chemical-products/${editingProduct.id}`, payload);
      }
      return apiRequest("POST", "/api/chemical-products", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
      toast({ title: t("chemicalProducts.saved") });
      setDialogOpen(false);
      setEditingProduct(null);
      form.reset();
    },
    onError: () => {
      toast({ title: t("chemicalProducts.saveFailed"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/chemical-products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
      toast({ title: t("chemicalProducts.deleted") });
      setDeletingProduct(null);
    },
    onError: () => {
      toast({ title: t("chemicalProducts.deleteFailed"), variant: "destructive" });
    },
  });

  function resetLabelState() {
    setPendingStorageKey(null);
    setExistingLabelKey(null);
    setLabelViewUrl(null);
    setExtractWarning(null);
    setExtractWarningType(null);
    setIsAnalyzing(false);
    setIsDragging(false);
  }

  function openAdd() {
    setEditingProduct(null);
    resetLabelState();
    form.reset({
      name: "",
      epaRegistrationNumber: "",
      activeIngredient: "",
      targetPest: "",
      applicationRate: "",
      reEntryInterval: "",
      mowingRestriction: "",
      signalWord: "none",
      isOrganic: false,
      isActive: true,
      notes: "",
      defaultPostApplicationExpectation: "",
      defaultPostApplicationWatering: "",
    });
    setDialogOpen(true);
  }

  async function openEdit(product: ChemicalProduct) {
    setEditingProduct(product);
    resetLabelState();
    if (product.labelPdfStorageKey) {
      setExistingLabelKey(product.labelPdfStorageKey);
      // Fetch the presigned URL
      try {
        const resp = await fetch(`/api/chemical-products/${product.id}/label-pdf-url`);
        if (resp.ok) {
          const data = await resp.json();
          setLabelViewUrl(data.url);
        }
      } catch {
        // ignore
      }
    }
    form.reset({
      name: product.name,
      epaRegistrationNumber: product.epaRegistrationNumber ?? "",
      activeIngredient: product.activeIngredient ?? "",
      targetPest: product.targetPest ?? "",
      applicationRate: product.applicationRate ?? "",
      reEntryInterval: product.reEntryInterval ?? "",
      mowingRestriction: product.mowingRestriction ?? "",
      signalWord: (product.signalWord ?? "none") as "caution" | "warning" | "danger" | "none",
      isOrganic: product.isOrganic ?? false,
      isActive: product.isActive ?? true,
      notes: product.notes ?? "",
      defaultPostApplicationExpectation: product.defaultPostApplicationExpectation ?? "",
      defaultPostApplicationWatering: product.defaultPostApplicationWatering ?? "",
    });
    setDialogOpen(true);
  }

  async function processLabelFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast({ title: t("chemicalProducts.labelInvalidFile"), variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: t("chemicalProducts.labelFileTooLarge"), variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    setExtractWarning(null);
    setExtractWarningType(null);
    setPendingStorageKey(null);
    setLabelViewUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/chemical-products/extract-label", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        toast({ title: err.error || t("chemicalProducts.labelExtractFailed"), variant: "destructive" });
        setIsAnalyzing(false);
        return;
      }
      const result: ExtractResult = await resp.json();
      setPendingStorageKey(result.storageKey);

      if (result.warning) {
        setExtractWarning(result.warning);
        setExtractWarningType(result.warningType ?? null);
      }

      // Auto-fill form fields
      const ex = result.extracted;
      if (ex.name) form.setValue("name", ex.name);
      if (ex.epaRegistrationNumber) form.setValue("epaRegistrationNumber", ex.epaRegistrationNumber);
      if (ex.activeIngredient) form.setValue("activeIngredient", ex.activeIngredient);
      if (ex.targetPest) form.setValue("targetPest", ex.targetPest);
      if (ex.applicationRate) form.setValue("applicationRate", ex.applicationRate);
      if (ex.reEntryInterval) form.setValue("reEntryInterval", ex.reEntryInterval);
      if (ex.mowingRestriction) form.setValue("mowingRestriction", ex.mowingRestriction);
      if (ex.signalWord && ["none", "caution", "warning", "danger"].includes(ex.signalWord)) {
        form.setValue("signalWord", ex.signalWord as "none" | "caution" | "warning" | "danger");
      }
      if (typeof ex.isOrganic === "boolean") {
        form.setValue("isOrganic", ex.isOrganic);
      }
    } catch {
      toast({ title: t("chemicalProducts.labelExtractFailed"), variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processLabelFile(file);
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processLabelFile(file);
    // Reset so the same file can be selected again
    e.target.value = "";
  }, []);

  function onSubmit(data: ProductFormValues) {
    saveMutation.mutate(data);
  }

  const hasLabel = pendingStorageKey || existingLabelKey;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>{t("chemicalProducts.title")}</CardTitle>
            <CardDescription>{t("chemicalProducts.description")}</CardDescription>
          </div>
          <Button onClick={openAdd} data-testid="button-add-chemical-product">
            <Plus className="w-4 h-4 mr-2" />
            {t("chemicalProducts.addProduct")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("common.loading")}</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("chemicalProducts.noProducts")}</p>
          ) : (
            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md border bg-card"
                  data-testid={`row-chemical-product-${product.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {product.isOrganic && (
                      <Leaf className="w-4 h-4 text-green-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" data-testid={`text-product-name-${product.id}`}>{product.name}</span>
                        {!product.isActive && (
                          <Badge variant="secondary" className="text-xs">{t("common.inactive")}</Badge>
                        )}
                        {product.signalWord && product.signalWord !== "none" && (
                          <Badge
                            variant={product.signalWord === "danger" ? "destructive" : "outline"}
                            className="text-xs capitalize"
                          >
                            {t(`chemicalProducts.signalWord${product.signalWord.charAt(0).toUpperCase() + product.signalWord.slice(1)}`)}
                          </Badge>
                        )}
                        {product.labelPdfStorageKey && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <FileText className="w-3 h-3" />
                            {t("chemicalProducts.labelOnFile")}
                          </Badge>
                        )}
                      </div>
                      {product.activeIngredient && (
                        <p className="text-xs text-muted-foreground truncate">{product.activeIngredient}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(product)}
                      data-testid={`button-edit-product-${product.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletingProduct(product)}
                      data-testid={`button-delete-product-${product.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingProduct(null); resetLabelState(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? t("chemicalProducts.editProduct") : t("chemicalProducts.addProduct")}
            </DialogTitle>
          </DialogHeader>

          {/* Label PDF upload zone */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("chemicalProducts.labelUploadTitle")}</p>

            {/* "On file" indicator (existing label, not yet replaced) */}
            {existingLabelKey && !pendingStorageKey && (
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/40">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground flex-1">{t("chemicalProducts.labelOnFile")}</span>
                {labelViewUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    asChild
                    data-testid="button-view-label"
                  >
                    <a href={labelViewUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {t("chemicalProducts.labelView")}
                    </a>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-replace-label"
                >
                  {t("chemicalProducts.labelReplace")}
                </Button>
              </div>
            )}

            {/* After a new file is uploaded/analyzing */}
            {isAnalyzing && (
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/40" data-testid="status-analyzing-label">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">{t("chemicalProducts.labelAnalyzing")}</span>
              </div>
            )}

            {/* New label stored after successful upload */}
            {pendingStorageKey && !isAnalyzing && (
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/40">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground flex-1">{t("chemicalProducts.labelOnFile")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-replace-label-new"
                >
                  {t("chemicalProducts.labelReplace")}
                </Button>
              </div>
            )}

            {/* Warning banner */}
            {extractWarning && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30" data-testid="status-extract-warning">
                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    {extractWarningType === "no_text"
                      ? t("chemicalProducts.labelNoTextTitle")
                      : extractWarningType === "ai_error"
                      ? t("chemicalProducts.labelAiErrorTitle")
                      : t("chemicalProducts.labelExtractWarning")}
                  </p>
                  {(extractWarningType === "no_text" || extractWarningType === "ai_error") && (
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      {extractWarningType === "no_text"
                        ? t("chemicalProducts.labelNoTextDetail")
                        : t("chemicalProducts.labelAiErrorDetail")}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Drop zone — shown when no label is uploading/uploaded, or when replacing */}
            {!isAnalyzing && !pendingStorageKey && !existingLabelKey && (
              <div
                className={`relative flex flex-col items-center justify-center gap-2 p-6 rounded-md border-2 border-dashed cursor-pointer transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/20"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="zone-label-upload"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
              >
                <Upload className="w-6 h-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">{t("chemicalProducts.labelUploadDrop")}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{t("chemicalProducts.labelUploadHint")}</p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileInputChange}
              data-testid="input-label-pdf"
            />
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("chemicalProducts.name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("chemicalProducts.namePlaceholder")} {...field} data-testid="input-product-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="epaRegistrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.epaReg")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("chemicalProducts.epaRegPlaceholder")} {...field} data-testid="input-product-epa" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="signalWord"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.signalWord")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-signal-word">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t("chemicalProducts.signalWordNone")}</SelectItem>
                          <SelectItem value="caution">{t("chemicalProducts.signalWordCaution")}</SelectItem>
                          <SelectItem value="warning">{t("chemicalProducts.signalWordWarning")}</SelectItem>
                          <SelectItem value="danger">{t("chemicalProducts.signalWordDanger")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="activeIngredient"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.activeIngredient")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-active-ingredient" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="targetPest"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.targetPest")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-target-pest" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="applicationRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.applicationRate")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-app-rate" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reEntryInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.reEntryInterval")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-rei" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mowingRestriction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.mowingRestriction")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-product-mowing" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="md:col-span-2 flex items-center gap-6">
                  <FormField
                    control={form.control}
                    name="isOrganic"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-product-organic" />
                        </FormControl>
                        <FormLabel className="cursor-pointer">{t("chemicalProducts.isOrganic")}</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-product-active" />
                        </FormControl>
                        <FormLabel className="cursor-pointer">{t("chemicalProducts.isActive")}</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t("chemicalProducts.notes")}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} data-testid="textarea-product-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-sm font-medium">{t("chemicalProducts.completionEmailDefaults")}</p>
                <FormField
                  control={form.control}
                  name="defaultPostApplicationExpectation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.defaultPostExpectation")}</FormLabel>
                      <FormDescription>{t("chemicalProducts.defaultPostExpectationHint")}</FormDescription>
                      <FormControl>
                        <Textarea rows={3} {...field} data-testid="textarea-product-post-expectation" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultPostApplicationWatering"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.defaultPostWatering")}</FormLabel>
                      <FormDescription>{t("chemicalProducts.defaultPostWateringHint")}</FormDescription>
                      <FormControl>
                        <Textarea rows={3} {...field} data-testid="textarea-product-post-watering" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetLabelState(); }} data-testid="button-cancel-product">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending || isAnalyzing} data-testid="button-save-product">
                  {t(saveMutation.isPending ? "common.saving" : "common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => { if (!open) setDeletingProduct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chemicalProducts.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chemicalProducts.deleteMsg")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-product">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingProduct && deleteMutation.mutate(deletingProduct.id)}
              data-testid="button-confirm-delete-product"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
