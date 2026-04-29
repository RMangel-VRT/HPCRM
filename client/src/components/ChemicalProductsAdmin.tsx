import { useState } from "react";
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
import { Plus, Pencil, Trash2, Leaf } from "lucide-react";
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
      if (editingProduct) {
        return apiRequest("PATCH", `/api/chemical-products/${editingProduct.id}`, data);
      }
      return apiRequest("POST", "/api/chemical-products", data);
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

  function openAdd() {
    setEditingProduct(null);
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

  function openEdit(product: ChemicalProduct) {
    setEditingProduct(product);
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

  function onSubmit(data: ProductFormValues) {
    saveMutation.mutate(data);
  }

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

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingProduct(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? t("chemicalProducts.editProduct") : t("chemicalProducts.addProduct")}
            </DialogTitle>
          </DialogHeader>
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
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-product">
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-product">
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
