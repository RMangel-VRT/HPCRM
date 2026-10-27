import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Power, RotateCcw, Truck, Receipt } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiErrorMessage, centsToInput, fetchJson, formatCents, parseDollarsToCents } from "@/lib/hardscapeCatalog";
import {
  QUICK_ITEMS_API, QUICK_ITEM_LABEL_MAX, QUICK_KINDS, QUICK_UNITS, UMBRELLA_KEYS, defaultUmbrellaForKind, scopeOf, sendJson,
  type QuickItem, type QuickItemEditable, type QuickKind, type QuickUnit, type UmbrellaKey,
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

type FormState = { label: string; kind: QuickKind; unit: QuickUnit; rate: string; umbrellaKey: UmbrellaKey; umbrellaTouched: boolean; isActive: boolean };
type FormErrors = Partial<Record<"label" | "rate" | "form", string>>;

function toForm(item: QuickItem | null, kind: QuickKind): FormState {
  return item
    ? { label: item.label, kind: item.kind, unit: item.defaultUnit, rate: centsToInput(item.defaultRateCents), umbrellaKey: item.umbrellaKey, umbrellaTouched: true, isActive: item.isActive }
    : { label: "", kind, unit: kind === "fee" ? "flat" : "hour", rate: "", umbrellaKey: defaultUmbrellaForKind(kind), umbrellaTouched: false, isActive: true };
}

function QuickItemDialog(props: { item: QuickItem | null; initialKind: QuickKind; companyId: string; onClose: () => void; onSaved: () => void }) {
  const { item, initialKind, companyId, onClose, onSaved } = props;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(item, initialKind));
  const [errors, setErrors] = useState<FormErrors>({});
  const save = useMutation({
    mutationFn: (body: Partial<QuickItemEditable>) =>
      item ? sendJson<QuickItem>("PATCH", `${QUICK_ITEMS_API}/${item.id}`, companyId, body) : sendJson<QuickItem>("POST", QUICK_ITEMS_API, companyId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QUICK_ITEMS_API] }); onSaved(); },
    onError: (err) => setErrors({ form: apiErrorMessage(err) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: FormErrors = {};
    const label = form.label.trim();
    if (!label) errs.label = t("equipmentFees.err.required");
    else if (label.length > QUICK_ITEM_LABEL_MAX) errs.label = t("equipmentFees.err.tooLong", { max: QUICK_ITEM_LABEL_MAX });
    const rate = parseDollarsToCents(form.rate);
    if (rate === "invalid") errs.rate = t("equipmentFees.err.dollars");
    if (rate === "tooLarge") errs.rate = t("equipmentFees.err.tooLarge");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const full: QuickItemEditable = { kind: form.kind, label, defaultUnit: form.unit, defaultRateCents: rate as number | null, umbrellaKey: form.umbrellaKey, isActive: form.isActive };
    let body: Partial<QuickItemEditable> = full;
    if (item) {
      body = {};
      (Object.keys(full) as (keyof QuickItemEditable)[]).forEach((k) => { if (full[k] !== item[k]) (body as Record<string, unknown>)[k] = full[k]; });
      if (Object.keys(body).length === 0) { onSaved(); return; }
    }
    save.mutate(body);
  }

  const setKind = (k: QuickKind) => setForm((f) => ({ ...f, kind: k, umbrellaKey: f.umbrellaTouched ? f.umbrellaKey : defaultUmbrellaForKind(k) }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-quick-item">
        <DialogHeader>
          <DialogTitle>{item ? t("equipmentFees.edit") : t("equipmentFees.add")}</DialogTitle>
          <DialogDescription>{t("equipmentFees.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="qi-label">{t("equipmentFees.field.label")}</Label>
            <Input id="qi-label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} aria-invalid={!!errors.label} data-testid="input-label" />
            {errors.label && <p className="text-xs font-medium text-destructive" data-testid="error-label">{errors.label}</p>}
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("equipmentFees.field.kind")}</span>
            <div className="inline-flex w-fit rounded-md border p-0.5" role="radiogroup" aria-label={t("equipmentFees.field.kind")}>
              {QUICK_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setKind(k)} data-testid={`radio-kind-${k}`}
                  className={cn("rounded px-3 py-1 text-sm transition-colors", form.kind === k ? "bg-rail-active font-semibold text-rail-active-foreground" : "text-muted-foreground hover:bg-rail-hover")}>
                  {t(`equipmentFees.kind.${k}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="qi-unit">{t("equipmentFees.field.unit")}</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v as QuickUnit }))}>
                <SelectTrigger id="qi-unit" data-testid="select-unit"><SelectValue /></SelectTrigger>
                <SelectContent>{QUICK_UNITS.map((u) => <SelectItem key={u} value={u}>{t(`equipmentFees.unit.${u}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="qi-rate">
                {t("equipmentFees.field.rate")} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("equipmentFees.field.rateOptional")}</span>
              </Label>
              <Input id="qi-rate" inputMode="decimal" placeholder="—" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} className="tabular-nums" aria-invalid={!!errors.rate} data-testid="input-rate" />
              {errors.rate ? <p className="text-xs font-medium text-destructive" data-testid="error-rate">{errors.rate}</p>
                : <p className="text-[11px] text-muted-foreground">{t("equipmentFees.field.rateHint")}</p>}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qi-umbrella">{t("equipmentFees.field.umbrella")}</Label>
            <Select value={form.umbrellaKey} onValueChange={(v) => setForm((f) => ({ ...f, umbrellaKey: v as UmbrellaKey, umbrellaTouched: true }))}>
              <SelectTrigger id="qi-umbrella" data-testid="select-umbrella"><SelectValue /></SelectTrigger>
              <SelectContent>{UMBRELLA_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`qboSetup.umbrella.${k}`)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{t("equipmentFees.field.umbrellaHint")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="qi-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} data-testid="switch-active" />
            <Label htmlFor="qi-active">{t("equipmentFees.field.isActive")}</Label>
          </div>
          {errors.form && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-form">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-item">{t("equipmentFees.cancel")}</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-item">
              {save.isPending ? t("equipmentFees.saving") : item ? t("equipmentFees.save") : t("equipmentFees.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EquipmentFeesCatalog() {
  const { user } = useAuth();
  return <EquipmentFeesContent key={scopeOf(user)} />;
}

function EquipmentFeesContent() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const scope = scopeOf(user);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; return () => { scopeRef.current = ""; }; }, [scope]);
  const [companyId] = useState(() => user?.activeCompanyId ?? "");
  const [kind, setKind] = useState<QuickKind | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [dialog, setDialog] = useState<{ item: QuickItem | null; n: number } | null>(null);
  const [confirmItem, setConfirmItem] = useState<QuickItem | null>(null);

  const url = kind ? `${QUICK_ITEMS_API}?kind=${kind}` : QUICK_ITEMS_API;
  const { data, isLoading, isError, refetch, isFetching } = useQuery<QuickItem[]>({
    queryKey: [QUICK_ITEMS_API, user?.activeCompanyId, user?.id, user?.activeRole, kind],
    queryFn: ({ signal }) => fetchJson<QuickItem[]>(url, companyId, signal),
    enabled: !!user,
  });
  const items = useMemo(() => {
    const all = (data ?? []).filter((i) => showInactive || i.isActive);
    return [...all].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }, [data, showInactive]);

  const toggle = useMutation({
    mutationFn: (vars: { item: QuickItem; next: boolean; scope: string }) =>
      vars.next ? sendJson("PATCH", `${QUICK_ITEMS_API}/${vars.item.id}`, companyId, { isActive: true }) : sendJson("DELETE", `${QUICK_ITEMS_API}/${vars.item.id}`, companyId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [QUICK_ITEMS_API] });
      if (vars.scope !== scopeRef.current) return;
      toast({ title: vars.next ? t("equipmentFees.reactivated") : t("equipmentFees.deactivated"), description: vars.item.label });
    },
    onError: (err, vars) => {
      if (vars.scope !== scopeRef.current) return;
      toast({ title: t("equipmentFees.actionFailed"), description: apiErrorMessage(err), variant: "destructive" });
    },
  });
  const lang = i18n.language;

  return (
    <SectionRailLayout rail={<EstimatesRail activeKey="equipment_fees" />}>
      <div className="mx-auto max-w-6xl" data-testid="page-equipment-fees">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--rail-active-icon))]">{t("estimates.catalogs")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight" data-testid="text-page-title">{t("equipmentFees.title")}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("equipmentFees.subtitle")}</p>
          </div>
          <Button onClick={() => setDialog({ item: null, n: Date.now() })} data-testid="button-add-item">
            <Plus className="mr-1.5 h-4 w-4" />{t("equipmentFees.add")}
          </Button>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("equipmentFees.kindsLabel")}>
            {([null, ...QUICK_KINDS] as (QuickKind | null)[]).map((k) => (
              <button key={k ?? "all"} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`chip-kind-${k ?? "all"}`}
                className={cn("h-7 rounded-full border px-3 text-[12.5px] transition-colors",
                  kind === k ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover")}>
                {t(`equipmentFees.kind.${k ?? "all"}`)}
              </button>
            ))}
          </div>
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-show-inactive" />
            {t("equipmentFees.showInactive")}
          </label>
        </div>

        <div className="mt-4">
          {isError ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-5" data-testid="quick-items-error">
              <p className="text-sm">{t("equipmentFees.loadError")}</p>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-retry">{t("equipmentFees.retry")}</Button>
            </div>
          ) : isLoading ? (
            <div role="status" aria-label={t("equipmentFees.loading")} className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed bg-card/60 px-6 py-12 text-center" data-testid="quick-items-empty">
              <div className="mx-auto mb-3 flex w-fit gap-2 text-muted-foreground"><Truck className="h-5 w-5" /><Receipt className="h-5 w-5" /></div>
              <p className="font-semibold">{kind || (data?.length ?? 0) > 0 ? t("equipmentFees.emptyKind") : t("equipmentFees.empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("equipmentFees.emptyHint")}</p>
            </div>
          ) : (
            <div className={cn("overflow-x-auto rounded-md border bg-card transition-opacity", isFetching && "opacity-70")}>
              <Table data-testid="table-quick-items">
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead>{t("equipmentFees.col.label")}</TableHead>
                    <TableHead>{t("equipmentFees.col.kind")}</TableHead>
                    <TableHead>{t("equipmentFees.col.unit")}</TableHead>
                    <TableHead className="text-right">{t("equipmentFees.col.rate")}</TableHead>
                    <TableHead>{t("equipmentFees.col.umbrella")}</TableHead>
                    <TableHead>{t("equipmentFees.col.active")}</TableHead>
                    <TableHead className="text-right"><span className="sr-only">{t("equipmentFees.col.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id} data-testid={`row-item-${it.id}`} className={cn(!it.isActive && "text-muted-foreground")}>
                      <TableCell className="font-medium text-foreground" data-testid={`text-label-${it.id}`}>{it.label}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                          {it.kind === "fee" ? <Receipt className="h-3 w-3" /> : <Truck className="h-3 w-3" />}{t(`equipmentFees.kind.${it.kind}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{t(`equipmentFees.unit.${it.defaultUnit}`)}</TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-rate-${it.id}`}>
                        {it.defaultRateCents == null ? <span className="text-muted-foreground">{t("equipmentFees.noRate")}</span> : formatCents(it.defaultRateCents, lang)}
                      </TableCell>
                      <TableCell className="text-xs" data-testid={`text-umbrella-${it.id}`}>{t(`qboSetup.umbrella.${it.umbrellaKey}`)}</TableCell>
                      <TableCell>
                        <span data-testid={`status-active-${it.id}`} className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: it.isActive ? "var(--ts-done)" : "var(--ts-open)" }} />
                          {it.isActive ? t("equipmentFees.active") : t("equipmentFees.inactive")}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button size="icon" variant="ghost" aria-label={`${t("equipmentFees.edit")}: ${it.label}`} onClick={() => setDialog({ item: it, n: Date.now() })} data-testid={`button-edit-${it.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {it.isActive ? (
                          <Button size="icon" variant="ghost" aria-label={`${t("equipmentFees.deactivate")}: ${it.label}`} onClick={() => setConfirmItem(it)} data-testid={`button-deactivate-${it.id}`}>
                            <Power className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" aria-label={`${t("equipmentFees.reactivate")}: ${it.label}`} disabled={toggle.isPending}
                            onClick={() => toggle.mutate({ item: it, next: true, scope })} data-testid={`button-reactivate-${it.id}`}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-xs tabular-nums text-muted-foreground" data-testid="text-item-count">{t("equipmentFees.itemCount", { count: items.length })}</p>
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <QuickItemDialog key={`${dialog.item?.id ?? "new"}-${dialog.n}`} item={dialog.item} initialKind={kind ?? "equipment"} companyId={companyId}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); toast({ title: t("equipmentFees.saved") }); }} />
      )}

      <AlertDialog open={!!confirmItem} onOpenChange={(o) => { if (!o) setConfirmItem(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-deactivate">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("equipmentFees.deactivateTitle", { name: confirmItem?.label ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("equipmentFees.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">{t("equipmentFees.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-deactivate"
              onClick={() => { if (confirmItem) toggle.mutate({ item: confirmItem, next: false, scope }); setConfirmItem(null); }}>
              {t("equipmentFees.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionRailLayout>
  );
}
