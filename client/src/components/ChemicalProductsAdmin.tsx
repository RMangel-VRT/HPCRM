import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FlaskConical, FileText, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ChemicalProduct } from "@shared/schema";

const SIGNAL_WORD_OPTIONS = [
  { value: "caution", label: "Caution" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" },
  { value: "danger_poison", label: "Danger/Poison" },
];

const CATEGORY_OPTIONS = [
  { value: "herbicide", label: "Herbicide" },
  { value: "insecticide", label: "Insecticide" },
  { value: "fungicide", label: "Fungicide" },
  { value: "fertilizer", label: "Fertilizer" },
  { value: "other", label: "Other" },
];

const MAX_LABEL_BYTES = 10 * 1024 * 1024;

const productFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  manufacturer: z.string().max(200).optional().or(z.literal("")),
  category: z.enum(["herbicide", "insecticide", "fungicide", "fertilizer", "other"]).nullable().optional(),
  epaRegistrationNumber: z.string().optional().or(z.literal("")),
  activeIngredient: z.string().optional().or(z.literal("")),
  signalWord: z.enum(["caution", "warning", "danger", "danger_poison"]).nullable().optional(),
  reentryIntervalHours: z.coerce.number().min(0).nullable().optional(),
  wateringInstructions: z.string().optional().or(z.literal("")),
  mowingInstructions: z.string().optional().or(z.literal("")),
  purposeDescription: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

export default function ChemicalProductsAdmin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ChemicalProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChemicalProduct | null>(null);
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery<ChemicalProduct[]>({
    queryKey: ["/api/chemical-products"],
  });

  const emptyForm: ProductFormValues = {
    name: "",
    manufacturer: "",
    category: undefined,
    epaRegistrationNumber: "",
    activeIngredient: "",
    signalWord: undefined,
    reentryIntervalHours: undefined,
    wateringInstructions: "",
    mowingInstructions: "",
    purposeDescription: "",
    notes: "",
    isActive: true,
  };

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: emptyForm,
  });

  function openCreate() {
    setEditingProduct(null);
    form.reset(emptyForm);
    setShowForm(true);
  }

  function openEdit(product: ChemicalProduct) {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      manufacturer: product.manufacturer || "",
      category: (product.category as ProductFormValues["category"]) ?? undefined,
      epaRegistrationNumber: product.epaRegistrationNumber || "",
      activeIngredient: product.activeIngredient || "",
      signalWord: (product.signalWord as ProductFormValues["signalWord"]) ?? undefined,
      reentryIntervalHours: product.reentryIntervalHours ?? undefined,
      wateringInstructions: product.wateringInstructions || "",
      mowingInstructions: product.mowingInstructions || "",
      purposeDescription: product.purposeDescription || "",
      notes: product.notes || "",
      isActive: product.isActive,
    });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const payload = {
        ...values,
        manufacturer: values.manufacturer || null,
        category: values.category || null,
        epaRegistrationNumber: values.epaRegistrationNumber || null,
        activeIngredient: values.activeIngredient || null,
        signalWord: values.signalWord || null,
        reentryIntervalHours: values.reentryIntervalHours ?? null,
        wateringInstructions: values.wateringInstructions || null,
        mowingInstructions: values.mowingInstructions || null,
        purposeDescription: values.purposeDescription || null,
        notes: values.notes || null,
      };
      if (editingProduct) {
        return apiRequest("PATCH", `/api/chemical-products/${editingProduct.id}`, payload);
      } else {
        return apiRequest("POST", "/api/chemical-products", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
      toast({ title: editingProduct ? t("chemicalProducts.updated") : t("chemicalProducts.created") });
      setShowForm(false);
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/chemical-products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
      toast({ title: t("chemicalProducts.deleted") });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/chemical-products/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/chemical-products/${id}/label`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
      toast({ title: t("chemicalProducts.labelRemoved") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  async function handleLabelUpload(product: ChemicalProduct, file: File) {
    if (!file) return;
    if (file.size > MAX_LABEL_BYTES) {
      toast({ title: t("chemicalProducts.labelTooLarge"), variant: "destructive" });
      return;
    }
    setUploadingLabel(product.id);
    try {
      const encodedFilename = encodeURIComponent(file.name);
      const res = await fetch(`/api/chemical-products/${product.id}/label?filename=${encodedFilename}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error ?? "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/chemical-products"] });
      toast({ title: t("chemicalProducts.labelUploaded") });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.error");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setUploadingLabel(null);
    }
  }

  async function handleViewLabel(product: ChemicalProduct) {
    try {
      const res = await apiRequest("GET", `/api/chemical-products/${product.id}/label-url`);
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  }

  const signalWordBadge = (sw: string | null | undefined) => {
    if (!sw) return null;
    const colors: Record<string, string> = {
      caution: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      warning: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      danger_poison: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
    };
    const labels: Record<string, string> = {
      caution: "Caution",
      warning: "Warning",
      danger: "Danger",
      danger_poison: "Danger/Poison",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[sw] || ""}`}>
        {labels[sw] || sw}
      </span>
    );
  };

  const categoryLabel = (cat: string | null | undefined) => {
    if (!cat) return null;
    const opt = CATEGORY_OPTIONS.find((o) => o.value === cat);
    return opt ? opt.label : cat;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5" />
              {t("chemicalProducts.title")}
            </CardTitle>
          </div>
          <Button onClick={openCreate} data-testid="button-create-chemical-product" size="default">
            <Plus className="w-4 h-4 mr-2" />
            {t("chemicalProducts.addProduct")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("chemicalProducts.noProducts")}</p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name")}</TableHead>
                      <TableHead>{t("chemicalProducts.category")}</TableHead>
                      <TableHead>{t("chemicalProducts.epaRegNumber")}</TableHead>
                      <TableHead>{t("chemicalProducts.signalWord")}</TableHead>
                      <TableHead>{t("chemicalProducts.reentryInterval")}</TableHead>
                      <TableHead>{t("chemicalProducts.label")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                        <TableCell className="font-medium">
                          <div>{product.name}</div>
                          {product.manufacturer && (
                            <div className="text-xs text-muted-foreground">{product.manufacturer}</div>
                          )}
                          {product.activeIngredient && (
                            <div className="text-xs text-muted-foreground">{product.activeIngredient}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{categoryLabel(product.category) || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{product.epaRegistrationNumber || "—"}</TableCell>
                        <TableCell>{signalWordBadge(product.signalWord)}</TableCell>
                        <TableCell className="text-sm">
                          {product.reentryIntervalHours != null ? `${product.reentryIntervalHours}h` : "—"}
                        </TableCell>
                        <TableCell>
                          {product.labelStorageKey ? (
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleViewLabel(product)} data-testid={`button-view-label-${product.id}`}>
                                <FileText className="w-3.5 h-3.5 mr-1" />
                                {t("chemicalProducts.viewLabel")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteLabelMutation.mutate(product.id)}
                                data-testid={`button-remove-label-${product.id}`}
                                title={t("chemicalProducts.removeLabel")}
                              >
                                <X className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleLabelUpload(product, e.target.files[0])}
                                data-testid={`input-label-upload-${product.id}`}
                              />
                              <Button variant="outline" size="sm" asChild disabled={uploadingLabel === product.id}>
                                <span>
                                  <Upload className="w-3.5 h-3.5 mr-1" />
                                  {uploadingLabel === product.id ? t("common.saving") : t("chemicalProducts.uploadLabel")}
                                </span>
                              </Button>
                            </label>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={product.isActive}
                            onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: product.id, isActive: checked })}
                            data-testid={`toggle-active-${product.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(product)} data-testid={`button-edit-product-${product.id}`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(product)} data-testid={`button-delete-product-${product.id}`}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-3">
                {products.map((product) => (
                  <Card key={product.id} data-testid={`card-product-${product.id}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{product.name}</p>
                          {product.manufacturer && (
                            <p className="text-xs text-muted-foreground">{product.manufacturer}</p>
                          )}
                          {product.activeIngredient && (
                            <p className="text-xs text-muted-foreground">{product.activeIngredient}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(product)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        {product.category && (
                          <Badge variant="outline">{categoryLabel(product.category)}</Badge>
                        )}
                        {signalWordBadge(product.signalWord)}
                        {product.reentryIntervalHours != null && (
                          <Badge variant="outline">{product.reentryIntervalHours}h re-entry</Badge>
                        )}
                        <Switch
                          checked={product.isActive}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: product.id, isActive: checked })}
                          data-testid={`toggle-active-mobile-${product.id}`}
                        />
                      </div>
                      {product.labelStorageKey && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleViewLabel(product)}>
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            {t("chemicalProducts.viewLabel")}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteLabelMutation.mutate(product.id)}>
                            <X className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? t("chemicalProducts.editProduct") : t("chemicalProducts.addProduct")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.name")} *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-product-name" placeholder="e.g. Roundup Pro" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="manufacturer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.manufacturer")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-manufacturer" placeholder="e.g. Bayer" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.category")}</FormLabel>
                      <Select
                        value={field.value || ""}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder={t("common.select")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="epaRegistrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("chemicalProducts.epaRegNumber")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-epa-reg-number" placeholder="000000-000" />
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
                      <Select
                        value={field.value || ""}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-signal-word">
                            <SelectValue placeholder={t("common.select")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SIGNAL_WORD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="activeIngredient"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("chemicalProducts.activeIngredient")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-active-ingredient" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reentryIntervalHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("chemicalProducts.reentryInterval")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        step={0.5}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                        data-testid="input-reentry-interval"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purposeDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("chemicalProducts.purpose")}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-purpose" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wateringInstructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("chemicalProducts.wateringInstructions")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="textarea-watering-instructions" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mowingInstructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("chemicalProducts.mowingInstructions")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="textarea-mowing-instructions" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("chemicalProducts.notes")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="textarea-product-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-is-active" />
                    </FormControl>
                    <FormLabel className="mb-0">{t("chemicalProducts.activeProduct")}</FormLabel>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-product">
                  {saveMutation.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chemicalProducts.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chemicalProducts.confirmDeleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-product"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
