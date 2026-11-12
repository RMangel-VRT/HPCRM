import { useEffect, useMemo, useRef, useState } from "react";
import { unitLabel } from "@/lib/estimateUnits";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, BookPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fetchJson, formatCents, parseDollarsToCents } from "@/lib/hardscapeCatalog";
import { SERVICE_CATEGORIES_API, type ServiceCategory } from "@/lib/estimateSettings";
import { validQuantity, type EstimateLineType } from "@/lib/estimateBuilder";
import {
  CUSTOM_UNITS, FIXED_AFTER, FIXED_BEFORE, FIXED_TARGETS, canReuse, catalogMatchesUrl, customSaveError, referenceBody, saveToCatalogBody, unitAllowed,
  type CatalogMatch, type CategoryTarget, type CustomSaveError, type SaveCatalog,
} from "@/lib/customLine";
import { RequiredMark } from "@/components/estimates/RequiredMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Body = Record<string, unknown> & { lineType: EstimateLineType; sectionId: string; quantity: string };
type Result = { ok: true } | { ok: false; error: unknown };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

const SVC = "svc:";

/** Category-led custom line (Slice 4.7): category decides the umbrella; optional atomic save to a catalog. */
export function CustomForm({ sectionId, companyId, initial, onClose, onSubmit, onSubmitCustom }: {
  sectionId: string; companyId: string; initial?: { name?: string };
  onClose: () => void; onSubmit: (body: Body) => Promise<boolean>; onSubmitCustom?: (body: Body) => Promise<Result>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const qc = useQueryClient();
  const scopeKey = [user?.activeCompanyId, user?.id, user?.activeRole] as const;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [detail, setDetail] = useState("");
  const [unit, setUnit] = useState<string>("EA");
  const [rate, setRate] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [save, setSave] = useState(false);
  const [errs, setErrs] = useState<{ name?: string; rate?: string; quantity?: string; category?: string }>({});
  const [serverError, setServerError] = useState<CustomSaveError | null>(null);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const catsKey = [SERVICE_CATEGORIES_API, ...scopeKey] as const;
  const cats = useQuery<ServiceCategory[]>({
    queryKey: catsKey,
    staleTime: 30_000,
    queryFn: ({ signal }) => fetchJson<ServiceCategory[]>(SERVICE_CATEGORIES_API, companyId, signal),
  });
  const activeCats = useMemo(() => (cats.data ?? []).filter((c) => c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [cats.data]);

  // Hidden or inactive categories resolve to no target: never reused, never submitted.
  const target: CategoryTarget | null = useMemo(() => {
    if (!categoryId) return null;
    if (categoryId.startsWith(SVC)) {
      const c = activeCats.find((x) => x.id === categoryId.slice(SVC.length));
      return c ? { umbrella: c.defaultUmbrellaKey, save: { catalog: "service", serviceCategoryId: c.id } } : null;
    }
    return FIXED_TARGETS[categoryId as keyof typeof FIXED_TARGETS] ?? null;
  }, [categoryId, activeCats]);

  const saveTarget = target && "catalog" in target.save ? target.save : null;
  const catalogName = (c: SaveCatalog) => t(`estimateBuilder.customLine.catalogName.${c}`);
  const saveReason = !target ? t("estimateBuilder.customLine.saveReason.category")
    : !saveTarget ? t(`estimateBuilder.customLine.saveReason.${(target.save as { reason: string }).reason}`)
    : !unitAllowed(saveTarget.catalog, unit) ? t("estimateBuilder.customLine.saveReason.unit", { unit: unitLabel(unit, t), catalog: catalogName(saveTarget.catalog) })
    : null;
  const saveOn = save && !saveReason && !!saveTarget;

  const debName = useDebounced(name.trim(), 250);
  const matchesEnabled = saveOn && debName.length >= 3 && name.trim() === debName;
  const matches = useQuery<CatalogMatch[]>({
    queryKey: ["estimate-catalog-matches", ...scopeKey, saveTarget?.catalog ?? null, saveTarget?.serviceCategoryId ?? null, debName],
    staleTime: 0,
    enabled: matchesEnabled,
    queryFn: ({ signal }) => fetchJson<CatalogMatch[]>(catalogMatchesUrl(saveTarget!, debName), companyId, signal),
  });
  const matchRows = matchesEnabled ? (matches.data ?? []).slice(0, 5) : [];

  // Any edit makes the previous server message stale; fields are never cleared.
  useEffect(() => { setServerError(null); }, [categoryId, name, unit, save]);

  async function send(body: Body): Promise<boolean> {
    if (submittingRef.current) return false;
    submittingRef.current = true; setPending(true); setServerError(null);
    let result: Result;
    try {
      result = onSubmitCustom ? await onSubmitCustom(body) : (await onSubmit(body)) ? { ok: true } : { ok: false, error: null };
    } catch (error) { result = { ok: false, error }; }
    finally { submittingRef.current = false; if (mounted.current) setPending(false); }
    if (!mounted.current) return false;
    if (result.ok) { onClose(); return true; }
    const e = customSaveError(result.error);
    setServerError(e);
    if (e.code === "UMBRELLA_MISMATCH" || (e.status === 422 && saveTarget?.catalog === "service")) void qc.invalidateQueries({ queryKey: [...catsKey] });
    return false;
  }

  function checkQty(): string | null {
    const q = validQuantity(quantity);
    setErrs((x) => ({ ...x, quantity: q ? undefined : t("estimateBuilder.err.quantity") }));
    return q;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const n: typeof errs = {};
    if (!target) n.category = t("estimateBuilder.customLine.categoryRequired");
    if (!name.trim()) n.name = t("estimateBuilder.err.required");
    const c = parseDollarsToCents(rate);
    if (c === null || c === "invalid") n.rate = t("estimateBuilder.err.rate");
    if (c === "tooLarge") n.rate = t("estimateBuilder.err.tooLarge");
    const qty = validQuantity(quantity);
    if (!qty) n.quantity = t("estimateBuilder.err.quantity");
    setErrs(n);
    if (Object.keys(n).length || typeof c !== "number" || !qty || !target) return;
    void send({
      lineType: "custom", sectionId, quantity: qty, name: name.trim(), ...(detail.trim() ? { detail: detail.trim() } : {}),
      unit, unitPriceCents: c, umbrellaKey: target.umbrella,
      ...(saveOn && saveTarget ? { saveToCatalog: saveToCatalogBody(saveTarget) } : {}),
    });
  }

  /** Reuse an existing catalog item with the entered quantity, via its normal typed reference body. */
  function reuse(kind: SaveCatalog, id: string) {
    const qty = checkQty();
    if (!qty) return;
    void send({ ...referenceBody(kind, id), sectionId, quantity: qty });
  }

  const chip = (on: boolean) => cn("h-7 rounded-full border px-3 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--rail-active-icon))]",
    on ? "border-transparent bg-rail-active font-semibold text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover");
  const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const chipBtn = (id: string, label: string) => (
    <button key={id} type="button" role="radio" aria-checked={categoryId === id} className={chip(categoryId === id)}
      onClick={() => { setCategoryId(id); setErrs((x) => ({ ...x, category: undefined })); }} data-testid={`chip-custom-category-${id.replace(SVC, "service-")}`}>
      {label}
    </button>
  );
  const existing = serverError?.code === "CATALOG_ITEM_EXISTS" ? serverError.existing : undefined;
  const errorMsg = !serverError ? null
    : serverError.code === "CATALOG_ITEM_EXISTS" ? null
    : serverError.code === "UMBRELLA_MISMATCH" ? t("estimateBuilder.customLine.err.UMBRELLA_MISMATCH")
    : serverError.status === 404 || serverError.status === 409 ? t("estimateBuilder.conflict")
    : serverError.status === 422 ? t("estimateBuilder.err.unprocessable")
    : serverError.status === 400 ? t("estimateBuilder.err.invalid")
    : t("estimateBuilder.err.generic");

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("estimateBuilder.picker.title.custom")}</DialogTitle>
        <DialogDescription data-testid="text-custom-header">{t("estimateBuilder.customLine.header")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="grid gap-3" data-testid="form-free-entry">
        <div className="grid gap-1.5">
          <span id="custom-category-label" className="text-sm font-medium leading-none">{t("estimateBuilder.customLine.category")}<RequiredMark /></span>
          <div role="radiogroup" aria-labelledby="custom-category-label" aria-required="true" className="flex flex-wrap gap-1.5" data-testid="group-custom-category">
            {FIXED_BEFORE.map((k) => chipBtn(k, t(`estimateBuilder.customLine.cat.${k}`)))}
            {activeCats.map((c) => chipBtn(`${SVC}${c.id}`, c.name))}
            {FIXED_AFTER.map((k) => chipBtn(k, t(`estimateBuilder.customLine.cat.${k}`)))}
          </div>
          {cats.isError && (
            <p className="text-xs text-muted-foreground" data-testid="error-custom-service-categories">
              {t("estimateBuilder.customLine.catsError")}{" "}
              <button type="button" className="font-medium underline" onClick={() => void cats.refetch()} data-testid="button-custom-categories-retry">{t("estimateBuilder.picker.retry")}</button>
            </p>
          )}
          <p className="text-xs text-muted-foreground" data-testid="text-custom-posts-to">
            {target ? <>{t("estimateBuilder.customLine.postsTo")} <strong className="font-semibold text-foreground">{t(`qboSetup.umbrella.${target.umbrella}`)}</strong></>
              : t("estimateBuilder.customLine.pickCategory")}
          </p>
          {errs.category && <p className="text-xs text-destructive" data-testid="error-custom-category">{errs.category}</p>}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="free-name">{t("estimateBuilder.picker.name")}<RequiredMark /></Label>
          <Input id="free-name" aria-required="true" autoFocus maxLength={500} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errs.name} data-testid="input-free-name" />
          {errs.name && <p className="text-xs text-destructive">{errs.name}</p>}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="free-detail">{t("estimateBuilder.picker.detail")}</Label>
          <Input id="free-detail" value={detail} onChange={(e) => setDetail(e.target.value)} data-testid="input-free-detail" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="free-unit">{t("estimateBuilder.picker.unit")}<RequiredMark /></Label>
            <select id="free-unit" aria-required="true" className={sel} value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="select-free-unit">
              {CUSTOM_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u, t)}</option>)}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="free-rate">{t("estimateBuilder.picker.rate")}<RequiredMark /></Label>
            <Input id="free-rate" aria-required="true" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!errs.rate} className="tabular-nums" data-testid="input-free-rate" />
            {errs.rate && <p className="text-xs text-destructive">{errs.rate}</p>}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="free-qty">{t("estimateBuilder.picker.quantity")}<RequiredMark /></Label>
            <Input id="free-qty" aria-required="true" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!errs.quantity} className="tabular-nums" data-testid="input-free-quantity" />
            {errs.quantity && <p className="text-xs text-destructive" data-testid="error-picker-quantity">{errs.quantity}</p>}
          </div>
        </div>

        <label className={cn("flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
          saveReason ? "cursor-not-allowed bg-muted/40" : "cursor-pointer bg-card hover:bg-rail-hover", saveOn && "border-[hsl(var(--rail-active-icon))]/50 bg-rail-active/40")}
          data-testid="card-save-catalog">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--rail-active-icon))]" checked={saveOn} disabled={!!saveReason}
            onChange={(e) => setSave(e.target.checked)} aria-describedby="custom-save-help" data-testid="checkbox-save-catalog" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium"><BookPlus className="h-3.5 w-3.5 text-muted-foreground" />
              {saveTarget ? t("estimateBuilder.customLine.saveTo", { catalog: catalogName(saveTarget.catalog) }) : t("estimateBuilder.customLine.saveGeneric")}
            </span>
            <span id="custom-save-help" className="block text-xs text-muted-foreground">
              {saveReason ? <span data-testid="text-save-reason">{saveReason}</span> : t("estimateBuilder.customLine.saveHelp")}
            </span>
          </span>
        </label>

        {matchRows.length > 0 && (
          <div role="region" aria-label={t("estimateBuilder.customLine.matchesLabel")} data-testid="panel-catalog-matches"
            className="rounded-md border border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))]/60 p-3 text-sm">
            <p className="mb-2 flex items-start gap-1.5 text-[hsl(var(--est-warn))]"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">{t("estimateBuilder.customLine.matches", { count: matchRows.length })}</span></p>
            <ul className="divide-y rounded border bg-background">
              {matchRows.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5" data-testid={`row-match-${m.id}`}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[m.categoryName, unitLabel(m.unit, t), m.priceCents != null ? formatCents(m.priceCents, lang) : t("estimateBuilder.picker.noDefault")].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-7 shrink-0" disabled={pending} onClick={() => reuse(saveTarget!.catalog, m.id)} data-testid={`button-use-match-${m.id}`}>
                    {t("estimateBuilder.customLine.useInstead")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {matchesEnabled && matches.isError && (
          <p role="alert" className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="error-catalog-matches">
            <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--est-warn))]" />{t("estimateBuilder.customLine.matchesError")}
            <button type="button" className="font-medium underline" onClick={() => void matches.refetch()} data-testid="button-matches-retry">{t("estimateBuilder.picker.retry")}</button>
          </p>
        )}
        {existing && (
          <div role="alert" className="rounded-md border border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))]/60 p-3 text-sm" data-testid="alert-catalog-exists">
            <p className="font-medium">{t("estimateBuilder.customLine.exists", { name: existing.name, catalog: catalogName(existing.kind) })}</p>
            {canReuse(existing) ? (
              <Button type="button" size="sm" variant="outline" className="mt-2 h-7" disabled={pending} onClick={() => reuse(existing.kind, existing.id)} data-testid="button-use-existing">
                {t("estimateBuilder.customLine.useInstead")}
              </Button>
            ) : <p className="mt-1 text-xs text-muted-foreground" data-testid="text-existing-inactive">{t("estimateBuilder.customLine.existsInactive")}</p>}
          </div>
        )}
        {serverError?.code === "CATALOG_ITEM_EXISTS" && !existing && (
          <p role="alert" className="text-xs font-medium text-destructive" data-testid="error-custom-save">{t("estimateBuilder.customLine.existsUnknown")}</p>
        )}
        {errorMsg && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive" data-testid="error-custom-save">{errorMsg}</p>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} data-testid="button-picker-cancel">{t("estimateBuilder.cancel")}</Button>
          <Button type="submit" disabled={pending || !target} data-testid="button-free-add">
            {pending ? t("estimateBuilder.picker.adding") : saveOn ? t("estimateBuilder.customLine.addAndSave") : t("estimateBuilder.picker.add")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
