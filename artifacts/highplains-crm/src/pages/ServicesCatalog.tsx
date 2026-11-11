import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FolderCog, Pencil, Plus, Power, RotateCcw, Sprout } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiErrorMessage, centsToInput, fetchJson, formatCents, parseDollarsToCents } from "@/lib/hardscapeCatalog";
import {
  QUICK_ITEMS_API, QUICK_ITEM_LABEL_MAX, QUICK_UNITS, SERVICE_CATEGORIES_API, SERVICE_CATEGORY_NAME_MAX, UMBRELLA_KEYS, scopeOf, sendJson,
  type QuickItem, type QuickUnit, type ServiceCategory, type ServiceCategoryEditable, type UmbrellaKey,
} from "@/lib/estimateSettings";
import { SectionRailLayout } from "@/components/nav/SectionRail";
import { EstimatesRail } from "@/components/nav/estimatesRail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const UNIT_FALLBACK: QuickUnit = "1,000 sq ft";
const UMBRELLA_FALLBACK: UmbrellaKey = "landscape_labor";
const sortCats = (a: ServiceCategory, b: ServiceCategory) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/* ---------------------------------- Service dialog ---------------------------------- */

type ServiceForm = {
  label: string; categoryId: string; unit: QuickUnit; unitTouched: boolean; rate: string;
  umbrellaKey: UmbrellaKey; umbrellaTouched: boolean; isActive: boolean;
};
type ServiceErrors = Partial<Record<"label" | "rate" | "category" | "form", string>>;

function toServiceForm(item: QuickItem | null, cat: ServiceCategory | undefined): ServiceForm {
  if (item) return {
    label: item.label, categoryId: item.serviceCategoryId ?? "", unit: item.defaultUnit, unitTouched: true, rate: centsToInput(item.defaultRateCents),
    umbrellaKey: item.umbrellaKey, umbrellaTouched: true, isActive: item.isActive,
  };
  return {
    label: "", categoryId: cat?.id ?? "", unit: cat?.defaultUnit ?? UNIT_FALLBACK, unitTouched: false, rate: "",
    umbrellaKey: cat?.defaultUmbrellaKey ?? UMBRELLA_FALLBACK, umbrellaTouched: false, isActive: true,
  };
}

function ServiceDialog(props: { item: QuickItem | null; categories: ServiceCategory[]; initialCategoryId: string | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const { item, categories, initialCategoryId, companyId, onClose, onSaved } = props;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const active = categories.filter((c) => c.isActive);
  const [form, setForm] = useState<ServiceForm>(() => toServiceForm(item, active.find((c) => c.id === initialCategoryId) ?? active[0]));
  const [errors, setErrors] = useState<ServiceErrors>({});
  // Editing an item whose category is inactive keeps that association selectable (unrelated edits preserve it).
  const options = categories.filter((c) => c.isActive || c.id === item?.serviceCategoryId);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      item ? sendJson<QuickItem>("PATCH", `${QUICK_ITEMS_API}/${item.id}`, companyId, body) : sendJson<QuickItem>("POST", QUICK_ITEMS_API, companyId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUICK_ITEMS_API] });
      qc.invalidateQueries({ queryKey: [SERVICE_CATEGORIES_API] });
      qc.invalidateQueries({ queryKey: ["estimate-picker", "service"] });
      onSaved();
    },
    onError: (err) => setErrors({ form: apiErrorMessage(err) }),
  });

  function pickCategory(id: string) {
    const c = categories.find((x) => x.id === id);
    setForm((f) => ({
      ...f, categoryId: id,
      unit: f.unitTouched || !c ? f.unit : c.defaultUnit,
      umbrellaKey: f.umbrellaTouched || !c ? f.umbrellaKey : c.defaultUmbrellaKey,
    }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: ServiceErrors = {};
    const label = form.label.trim();
    if (!label) errs.label = t("servicesCatalog.err.required");
    else if (label.length > QUICK_ITEM_LABEL_MAX) errs.label = t("servicesCatalog.err.tooLong", { max: QUICK_ITEM_LABEL_MAX });
    if (!form.categoryId) errs.category = t("servicesCatalog.err.category");
    const rate = parseDollarsToCents(form.rate);
    if (rate === "invalid") errs.rate = t("servicesCatalog.err.dollars");
    if (rate === "tooLarge") errs.rate = t("servicesCatalog.err.tooLarge");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const rateCents = rate as number | null;
    if (!item) {
      // Untouched unit/umbrella are omitted so the server resolves them from the category.
      const body: Record<string, unknown> = { kind: "service", label, serviceCategoryId: form.categoryId, defaultRateCents: rateCents, isActive: form.isActive };
      if (form.unitTouched) body.defaultUnit = form.unit;
      if (form.umbrellaTouched) body.umbrellaKey = form.umbrellaKey;
      save.mutate(body);
      return;
    }
    const full: Record<string, unknown> = { label, serviceCategoryId: form.categoryId, defaultUnit: form.unit, defaultRateCents: rateCents, umbrellaKey: form.umbrellaKey, isActive: form.isActive };
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(full)) if (v !== (item as unknown as Record<string, unknown>)[k]) body[k] = v;
    if (Object.keys(body).length === 0) { onSaved(); return; }
    save.mutate(body);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-service">
        <DialogHeader>
          <DialogTitle>{item ? t("servicesCatalog.edit") : t("servicesCatalog.add")}</DialogTitle>
          <DialogDescription>{t("servicesCatalog.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="svc-label">{t("servicesCatalog.field.label")}</Label>
            <Input id="svc-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} aria-invalid={!!errors.label} data-testid="input-label" />
            {errors.label && <p className="text-xs font-medium text-destructive" data-testid="error-label">{errors.label}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="svc-category">{t("servicesCatalog.field.category")}</Label>
            <Select value={form.categoryId} onValueChange={pickCategory}>
              <SelectTrigger id="svc-category" aria-invalid={!!errors.category} data-testid="select-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`option-category-${c.id}`}>
                    {c.isActive ? c.name : t("servicesCatalog.field.inactiveCategory", { name: c.name })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs font-medium text-destructive" data-testid="error-category">{errors.category}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="svc-unit">{t("servicesCatalog.field.unit")}</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v as QuickUnit, unitTouched: true }))}>
                <SelectTrigger id="svc-unit" data-testid="select-unit"><SelectValue /></SelectTrigger>
                <SelectContent>{QUICK_UNITS.map((u) => <SelectItem key={u} value={u}>{t(`equipmentFees.unit.${u}`)}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("servicesCatalog.field.unitHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="svc-rate">
                {t("servicesCatalog.field.rate")} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("servicesCatalog.field.rateOptional")}</span>
              </Label>
              <Input id="svc-rate" inputMode="decimal" placeholder="—" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} className="tabular-nums" aria-invalid={!!errors.rate} data-testid="input-rate" />
              {errors.rate ? <p className="text-xs font-medium text-destructive" data-testid="error-rate">{errors.rate}</p>
                : <p className="text-[11px] text-muted-foreground">{t("servicesCatalog.field.rateHint")}</p>}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="svc-umbrella">{t("servicesCatalog.field.umbrella")}</Label>
            <Select value={form.umbrellaKey} onValueChange={(v) => setForm((f) => ({ ...f, umbrellaKey: v as UmbrellaKey, umbrellaTouched: true }))}>
              <SelectTrigger id="svc-umbrella" data-testid="select-umbrella"><SelectValue /></SelectTrigger>
              <SelectContent>{UMBRELLA_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`qboSetup.umbrella.${k}`)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{t("servicesCatalog.field.umbrellaHint")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="svc-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} data-testid="switch-active" />
            <Label htmlFor="svc-active">{t("servicesCatalog.field.isActive")}</Label>
          </div>
          {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-form">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-item">{t("servicesCatalog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-item">
              {save.isPending ? t("servicesCatalog.saving") : item ? t("servicesCatalog.save") : t("servicesCatalog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Category dialog ---------------------------------- */

function CategoryDialog(props: { category: ServiceCategory | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const { category, companyId, onClose, onSaved } = props;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [umbrella, setUmbrella] = useState<UmbrellaKey>(category?.defaultUmbrellaKey ?? UMBRELLA_FALLBACK);
  const [unit, setUnit] = useState<QuickUnit>(category?.defaultUnit ?? UNIT_FALLBACK);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const save = useMutation({
    mutationFn: (body: Partial<ServiceCategoryEditable>) =>
      category ? sendJson<ServiceCategory>("PATCH", `${SERVICE_CATEGORIES_API}/${category.id}`, companyId, body)
        : sendJson<ServiceCategory>("POST", SERVICE_CATEGORIES_API, companyId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SERVICE_CATEGORIES_API] });
      qc.invalidateQueries({ queryKey: [QUICK_ITEMS_API] });
      qc.invalidateQueries({ queryKey: ["estimate-picker", "service"] });
      onSaved();
    },
    onError: (err) => setErrors({ form: apiErrorMessage(err) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setErrors({ name: t("servicesCatalog.err.required") }); return; }
    if (n.length > SERVICE_CATEGORY_NAME_MAX) { setErrors({ name: t("servicesCatalog.err.tooLong", { max: SERVICE_CATEGORY_NAME_MAX }) }); return; }
    setErrors({});
    if (!category) { save.mutate({ name: n, defaultUmbrellaKey: umbrella, defaultUnit: unit }); return; }
    const full: ServiceCategoryEditable = { name: n, defaultUmbrellaKey: umbrella, defaultUnit: unit, isActive };
    const body: Partial<ServiceCategoryEditable> = {};
    (Object.keys(full) as (keyof ServiceCategoryEditable)[]).forEach((k) => { if (full[k] !== category[k]) (body as Record<string, unknown>)[k] = full[k]; });
    if (Object.keys(body).length === 0) { onSaved(); return; }
    save.mutate(body);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-category">
        <DialogHeader>
          <DialogTitle>{category ? t("servicesCatalog.editCategory") : t("servicesCatalog.addCategory")}</DialogTitle>
          <DialogDescription>{t("servicesCatalog.category.desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cat-name">{t("servicesCatalog.category.name")}</Label>
            <Input id="cat-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} data-testid="input-category-name" />
            {errors.name && <p className="text-xs font-medium text-destructive" data-testid="error-category-name">{errors.name}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cat-umbrella">{t("servicesCatalog.category.umbrella")}</Label>
            <Select value={umbrella} onValueChange={(v) => setUmbrella(v as UmbrellaKey)}>
              <SelectTrigger id="cat-umbrella" data-testid="select-category-umbrella"><SelectValue /></SelectTrigger>
              <SelectContent>{UMBRELLA_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`qboSetup.umbrella.${k}`)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{t("servicesCatalog.category.umbrellaHint")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cat-unit">{t("servicesCatalog.category.unit")}</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as QuickUnit)}>
              <SelectTrigger id="cat-unit" data-testid="select-category-unit"><SelectValue /></SelectTrigger>
              <SelectContent>{QUICK_UNITS.map((u) => <SelectItem key={u} value={u}>{t(`equipmentFees.unit.${u}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {category && (
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <Switch id="cat-active" checked={isActive} onCheckedChange={setIsActive} data-testid="switch-category-active" />
                <Label htmlFor="cat-active">{t("servicesCatalog.category.isActive")}</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("servicesCatalog.category.activeHint")}</p>
            </div>
          )}
          {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-category-form">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-category">{t("servicesCatalog.cancel")}</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-category">
              {save.isPending ? t("servicesCatalog.saving") : category ? t("servicesCatalog.save") : t("servicesCatalog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Manage categories ---------------------------------- */

function ManageCategoriesDialog(props: { categories: ServiceCategory[]; pending: boolean; onClose: () => void; onEdit: (c: ServiceCategory) => void; onToggle: (c: ServiceCategory, next: boolean) => void }) {
  const { categories, pending, onClose, onEdit, onToggle } = props;
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-manage-categories">
        <DialogHeader>
          <DialogTitle>{t("servicesCatalog.manageCategories")}</DialogTitle>
          <DialogDescription>{t("servicesCatalog.category.manageDesc")}</DialogDescription>
        </DialogHeader>
        {categories.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t("servicesCatalog.category.none")}</p>
        ) : (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border bg-card" data-testid="list-manage-categories">
            {categories.map((c) => (
              <li key={c.id} className={cn("flex items-center justify-between gap-3 px-3 py-2 text-sm", !c.isActive && "text-muted-foreground")} data-testid={`row-category-${c.id}`}>
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t(`qboSetup.umbrella.${c.defaultUmbrellaKey}`)} · {t(`equipmentFees.unit.${c.defaultUnit}`)} · {t("servicesCatalog.category.items", { count: c.itemCount })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span data-testid={`status-category-${c.id}`} className="mr-1 inline-flex items-center gap-1.5 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.isActive ? "var(--ts-done)" : "var(--ts-open)" }} />
                    {c.isActive ? t("servicesCatalog.active") : t("servicesCatalog.inactive")}
                  </span>
                  <Button size="icon" variant="ghost" aria-label={`${t("servicesCatalog.editCategory")}: ${c.name}`} onClick={() => onEdit(c)} data-testid={`button-edit-category-${c.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {c.isActive ? (
                    <Button size="icon" variant="ghost" disabled={pending} aria-label={`${t("servicesCatalog.deactivate")}: ${c.name}`} onClick={() => onToggle(c, false)} data-testid={`button-deactivate-category-${c.id}`}>
                      <Power className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" disabled={pending} aria-label={`${t("servicesCatalog.reactivate")}: ${c.name}`} onClick={() => onToggle(c, true)} data-testid={`button-reactivate-category-${c.id}`}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} data-testid="button-close-manage">{t("servicesCatalog.cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function ServicesCatalog() {
  const { user } = useAuth();
  return <ServicesCatalogContent key={scopeOf(user)} />;
}

function ServicesCatalogContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const scope = scopeOf(user);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; return () => { scopeRef.current = ""; }; }, [scope]);
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [dialog, setDialog] = useState<{ item: QuickItem | null; n: number } | null>(null);
  const [catDialog, setCatDialog] = useState<{ category: ServiceCategory | null; n: number } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmItem, setConfirmItem] = useState<QuickItem | null>(null);
  const scopeKey = [user?.activeCompanyId, user?.id, user?.activeRole] as const;

  const itemsQ = useQuery<QuickItem[]>({
    queryKey: [QUICK_ITEMS_API, ...scopeKey, "service"],
    queryFn: ({ signal }) => fetchJson<QuickItem[]>(`${QUICK_ITEMS_API}?kind=service`, companyId, signal),
    enabled: !!user,
  });
  const catsQ = useQuery<ServiceCategory[]>({
    queryKey: [SERVICE_CATEGORIES_API, ...scopeKey],
    queryFn: ({ signal }) => fetchJson<ServiceCategory[]>(SERVICE_CATEGORIES_API, companyId, signal),
    enabled: !!user,
  });
  const categories = useMemo(() => [...(catsQ.data ?? [])].sort(sortCats), [catsQ.data]);
  const activeCats = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const chipCats = showInactive ? categories : activeCats;
  const filterCat = categories.find((c) => c.id === categoryFilter);

  // Drop a filter whose chip is no longer shown.
  useEffect(() => { if (categoryFilter && !chipCats.some((c) => c.id === categoryFilter)) setCategoryFilter(null); }, [chipCats, categoryFilter]);

  const services = useMemo(() => (itemsQ.data ?? []).filter((i) => i.kind === "service"), [itemsQ.data]);
  const items = useMemo(() => {
    const all = services.filter((i) => (showInactive || i.isActive) && (!categoryFilter || i.serviceCategoryId === categoryFilter));
    return [...all].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }, [services, showInactive, categoryFilter]);
  const catName = (i: QuickItem) => i.serviceCategoryName ?? categories.find((c) => c.id === i.serviceCategoryId)?.name ?? null;

  const toggle = useMutation({
    mutationFn: (vars: { item: QuickItem; next: boolean; scope: string }) =>
      vars.next ? sendJson("PATCH", `${QUICK_ITEMS_API}/${vars.item.id}`, companyId, { isActive: true }) : sendJson("DELETE", `${QUICK_ITEMS_API}/${vars.item.id}`, companyId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [QUICK_ITEMS_API] });
      qc.invalidateQueries({ queryKey: [SERVICE_CATEGORIES_API] });
      qc.invalidateQueries({ queryKey: ["estimate-picker", "service"] });
      if (vars.scope !== scopeRef.current) return;
      toast({ title: vars.next ? t("servicesCatalog.reactivated") : t("servicesCatalog.deactivated"), description: vars.item.label });
    },
    onError: (err, vars) => {
      if (vars.scope !== scopeRef.current) return;
      toast({ title: t("servicesCatalog.actionFailed"), description: apiErrorMessage(err), variant: "destructive" });
    },
  });
  const toggleCat = useMutation({
    mutationFn: (vars: { category: ServiceCategory; next: boolean; scope: string }) =>
      sendJson("PATCH", `${SERVICE_CATEGORIES_API}/${vars.category.id}`, companyId, { isActive: vars.next }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [SERVICE_CATEGORIES_API] });
      qc.invalidateQueries({ queryKey: [QUICK_ITEMS_API] });
      qc.invalidateQueries({ queryKey: ["estimate-picker", "service"] });
      if (vars.scope !== scopeRef.current) return;
      toast({ title: vars.next ? t("servicesCatalog.category.reactivated") : t("servicesCatalog.category.deactivated"), description: vars.category.name });
    },
    onError: (err, vars) => {
      if (vars.scope !== scopeRef.current) return;
      toast({ title: t("servicesCatalog.actionFailed"), description: apiErrorMessage(err), variant: "destructive" });
    },
  });

  const lang = i18n.language;
  const isError = itemsQ.isError || catsQ.isError;
  const isLoading = itemsQ.isLoading || catsQ.isLoading;
  const chip = (on: boolean) => cn("inline-flex h-7 items-center rounded-full border text-[12.5px] transition-colors",
    on ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover");

  return (
    <SectionRailLayout rail={<EstimatesRail activeKey="services" />}>
      <div className="mx-auto max-w-6xl" data-testid="page-services-catalog">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimates.catalogs")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="text-page-title">{t("servicesCatalog.title")}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("servicesCatalog.subtitle")}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setManageOpen(true)} disabled={!catsQ.data} data-testid="button-manage-categories">
                <FolderCog className="mr-1.5 h-4 w-4" />{t("servicesCatalog.manageCategories")}
              </Button>
              <Button onClick={() => setDialog({ item: null, n: Date.now() })} disabled={!catsQ.data || activeCats.length === 0} data-testid="button-add-item">
                <Plus className="mr-1.5 h-4 w-4" />{t("servicesCatalog.add")}
              </Button>
            </div>
            {catsQ.data && activeCats.length === 0 && <p className="text-[11px] text-muted-foreground" data-testid="text-need-category">{t("servicesCatalog.needCategory")}</p>}
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("servicesCatalog.chipsLabel")}>
            <button type="button" aria-pressed={categoryFilter === null} onClick={() => setCategoryFilter(null)} data-testid="chip-category-all" className={cn(chip(categoryFilter === null), "px-3")}>
              {t("servicesCatalog.all")}
            </button>
            {chipCats.map((c) => {
              const on = categoryFilter === c.id;
              return (
                <span key={c.id} className={cn(chip(on), !c.isActive && "border-dashed opacity-70")} data-testid={`chip-wrap-category-${c.id}`}>
                  <button type="button" aria-pressed={on} onClick={() => setCategoryFilter(c.id)} data-testid={`chip-category-${c.id}`} className="h-full pl-3 pr-1.5 tabular-nums">
                    {t("servicesCatalog.chipCount", { name: c.name, count: c.itemCount })}
                  </button>
                  <button type="button" aria-label={t("servicesCatalog.editCategoryChip", { name: c.name })} onClick={() => setCatDialog({ category: c, n: Date.now() })}
                    data-testid={`button-chip-edit-category-${c.id}`} className="mr-1 rounded-full p-1 opacity-70 hover:opacity-100">
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button type="button" onClick={() => setCatDialog({ category: null, n: Date.now() })} data-testid="button-add-category"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-3 text-[12.5px] text-muted-foreground transition-colors hover:bg-rail-hover hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />{t("servicesCatalog.addCategory")}
            </button>
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-show-inactive" />
            {t("servicesCatalog.showInactive")}
          </label>
        </div>

        <div className="mt-4">
          {isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="services-error">
              <p className="text-sm">{t("servicesCatalog.loadError")}</p>
              <Button variant="outline" onClick={() => { void itemsQ.refetch(); void catsQ.refetch(); }} data-testid="button-retry">{t("servicesCatalog.retry")}</Button>
            </div>
          ) : isLoading ? (
            <div role="status" aria-label={t("servicesCatalog.loading")} className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="services-empty">
              <div className="mx-auto mb-3 w-fit text-muted-foreground"><Sprout className="h-5 w-5" /></div>
              <p className="font-semibold">{categoryFilter || services.length > 0 ? t("servicesCatalog.emptyCategory") : t("servicesCatalog.empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("servicesCatalog.emptyHint")}</p>
            </div>
          ) : (
            <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", itemsQ.isFetching && "opacity-70")}>
              <Table data-testid="table-services">
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead>{t("servicesCatalog.col.label")}</TableHead>
                    <TableHead>{t("servicesCatalog.col.category")}</TableHead>
                    <TableHead>{t("servicesCatalog.col.unit")}</TableHead>
                    <TableHead className="text-right">{t("servicesCatalog.col.rate")}</TableHead>
                    <TableHead>{t("servicesCatalog.col.umbrella")}</TableHead>
                    <TableHead>{t("servicesCatalog.col.active")}</TableHead>
                    <TableHead className="text-right"><span className="sr-only">{t("servicesCatalog.col.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const cn_ = catName(it);
                    const catInactive = it.serviceCategoryIsActive === false;
                    return (
                      <TableRow key={it.id} data-testid={`row-item-${it.id}`} className={cn(!it.isActive && "text-muted-foreground")}>
                        <TableCell className="font-medium text-foreground" data-testid={`text-label-${it.id}`}>{it.label}</TableCell>
                        <TableCell data-testid={`text-category-${it.id}`}>
                          <span className={cn("inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs", catInactive && "line-through decoration-muted-foreground/60")}>
                            <Sprout className="h-3 w-3" />{cn_ ? (catInactive ? t("servicesCatalog.field.inactiveCategory", { name: cn_ }) : cn_) : t("servicesCatalog.noCategory")}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs" data-testid={`text-unit-${it.id}`}>{t(`equipmentFees.unit.${it.defaultUnit}`, { defaultValue: it.defaultUnit })}</TableCell>
                        <TableCell className="text-right tabular-nums" data-testid={`text-rate-${it.id}`}>
                          {it.defaultRateCents == null ? <span className="text-muted-foreground">{t("servicesCatalog.noRate")}</span> : formatCents(it.defaultRateCents, lang)}
                        </TableCell>
                        <TableCell className="text-xs" data-testid={`text-umbrella-${it.id}`}>{t(`qboSetup.umbrella.${it.umbrellaKey}`)}</TableCell>
                        <TableCell>
                          <span data-testid={`status-active-${it.id}`} className="inline-flex items-center gap-1.5 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.isActive ? "var(--ts-done)" : "var(--ts-open)" }} />
                            {it.isActive ? t("servicesCatalog.active") : t("servicesCatalog.inactive")}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button size="icon" variant="ghost" aria-label={`${t("servicesCatalog.edit")}: ${it.label}`} onClick={() => setDialog({ item: it, n: Date.now() })} data-testid={`button-edit-${it.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {it.isActive ? (
                            <Button size="icon" variant="ghost" aria-label={`${t("servicesCatalog.deactivate")}: ${it.label}`} onClick={() => setConfirmItem(it)} data-testid={`button-deactivate-${it.id}`}>
                              <Power className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" aria-label={`${t("servicesCatalog.reactivate")}: ${it.label}`} disabled={toggle.isPending}
                              onClick={() => toggle.mutate({ item: it, next: true, scope })} data-testid={`button-reactivate-${it.id}`}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-xs tabular-nums text-muted-foreground" data-testid="text-item-count">
                {filterCat ? `${filterCat.name} · ` : ""}{t("servicesCatalog.itemCount", { count: items.length })}
              </p>
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <ServiceDialog key={`${dialog.item?.id ?? "new"}-${dialog.n}`} item={dialog.item} categories={categories} initialCategoryId={categoryFilter} companyId={companyId}
          onClose={() => setDialog(null)} onSaved={() => { if (scopeRef.current !== scope) return; setDialog(null); toast({ title: t("servicesCatalog.saved") }); }} />
      )}
      {catDialog && (
        <CategoryDialog key={`${catDialog.category?.id ?? "new"}-${catDialog.n}`} category={catDialog.category} companyId={companyId}
          onClose={() => setCatDialog(null)} onSaved={() => { if (scopeRef.current !== scope) return; setCatDialog(null); toast({ title: t("servicesCatalog.categorySaved") }); }} />
      )}
      {manageOpen && !catDialog && (
        <ManageCategoriesDialog categories={categories} pending={toggleCat.isPending} onClose={() => setManageOpen(false)}
          onEdit={(c) => setCatDialog({ category: c, n: Date.now() })} onToggle={(c, next) => toggleCat.mutate({ category: c, next, scope })} />
      )}

      <AlertDialog open={!!confirmItem} onOpenChange={(o) => { if (!o) setConfirmItem(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-deactivate">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("servicesCatalog.deactivateTitle", { name: confirmItem?.label ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("servicesCatalog.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">{t("servicesCatalog.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-deactivate"
              onClick={() => { if (confirmItem) toggle.mutate({ item: confirmItem, next: false, scope }); setConfirmItem(null); }}>
              {t("servicesCatalog.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionRailLayout>
  );
}
