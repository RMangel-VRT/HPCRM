import { useState, type FormEvent } from "react";
import { AlertTriangle, Pencil, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/hardscapeCatalog";
import { cn } from "@/lib/utils";
import { DEFAULT_LABOR_DISCOUNT_LABEL, DEFAULT_TOTAL_DISCOUNT_LABEL, ESTIMATE_DISCOUNT_LABEL_MAX, estimateDiscountInputSchema,
  type EstimateDiscountInput, type EstimateDiscountKind, type EstimateTotalsDto, type EstimateVersionDto } from "../../../../../lib/db/src/estimateContracts";
import { basisPointsToPercentString } from "../../../../../lib/db/src/estimateMath";

export type DiscountScope = "labor" | "total";

const centsToDollars = (cents: number) => `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`.replace(/\.00$/, "");

/** Stored settings for one scope: basis points or cents, plus the optional customer label. */
function settingOf(version: EstimateVersionDto, scope: DiscountScope) {
  const kind = scope === "labor" ? version.laborDiscountKind : version.totalDiscountKind;
  const value = scope === "labor" ? version.laborDiscountValue : version.totalDiscountValue;
  const label = scope === "labor" ? version.laborDiscountLabel : version.totalDiscountLabel;
  return kind && value != null ? { kind, value, label } : null;
}
/** The exact customer-facing wording: documents are English, so defaults are too. */
export function discountDisplayLabel(version: EstimateVersionDto, scope: DiscountScope) {
  const setting = settingOf(version, scope);
  if (!setting) return null;
  const name = setting.label || (scope === "labor" ? DEFAULT_LABOR_DISCOUNT_LABEL : DEFAULT_TOTAL_DISCOUNT_LABEL);
  return setting.kind === "percent" ? `${name} (${basisPointsToPercentString(setting.value)}%)` : name;
}

/** One discount row in the Totals card: Add → inline editor → amount with Edit/Remove. */
export function EstimateDiscountRow({ scope, version, totals, editable, lang, onSave }: {
  scope: DiscountScope; version: EstimateVersionDto; totals: EstimateTotalsDto; editable: boolean; lang: string;
  onSave: (input: EstimateDiscountInput | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const setting = settingOf(version, scope);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<EstimateDiscountKind>("percent");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const cents = scope === "labor" ? totals.laborDiscountCents : totals.totalDiscountCents;
  const capped = scope === "labor" ? totals.laborDiscountCapped : totals.totalDiscountCapped;
  const noLabor = scope === "labor" && totals.laborDiscountNoLaborLines;
  const defaultLabel = scope === "labor" ? DEFAULT_LABOR_DISCOUNT_LABEL : DEFAULT_TOTAL_DISCOUNT_LABEL;
  const id = `estimate-discount-${scope}`;

  function open() {
    setKind(setting?.kind ?? "percent");
    setValue(setting ? setting.kind === "percent" ? basisPointsToPercentString(setting.value) : centsToDollars(setting.value) : "");
    setLabel(setting?.label ?? "");
    setInvalid(false);
    setEditing(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const parsed = estimateDiscountInputSchema.safeParse({ kind, value: value.trim().replace(/^\$/, "").replace(/%$/, ""), label: label.trim() || null });
    if (!parsed.success) { setInvalid(true); return; }
    setSaving(true);
    const ok = await onSave(parsed.data);
    setSaving(false);
    if (ok) setEditing(false);
  }
  async function remove() {
    if (saving) return;
    setSaving(true);
    await onSave(null);
    setSaving(false);
  }

  if (editing && editable) {
    return (
      <form onSubmit={save} className="space-y-2 rounded-md border bg-muted/30 p-2" data-testid={`form-discount-${scope}`} noValidate>
        <div className="flex items-center gap-2">
          <div role="group" aria-label={t("estimateBuilder.discount.type")} className="inline-flex shrink-0 rounded-md border bg-background p-0.5">
            {(["percent", "amount"] as const).map(k => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setInvalid(false); }}
                className={cn("rounded px-2 py-0.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                data-testid={`toggle-discount-${scope}-${k}`}>{k === "percent" ? "%" : "$"}</button>
            ))}
          </div>
          <label htmlFor={`${id}-value`} className="sr-only">{t(kind === "percent" ? "estimateBuilder.discount.percentValue" : "estimateBuilder.discount.amountValue")}</label>
          <Input id={`${id}-value`} inputMode="decimal" autoFocus value={value} aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined} className="h-8 tabular-nums"
            placeholder={kind === "percent" ? "15" : "250.00"} onChange={e => { setValue(e.target.value); setInvalid(false); }}
            data-testid={`input-discount-${scope}-value`} />
        </div>
        <div>
          <label htmlFor={`${id}-label`} className="mb-1 block text-xs text-muted-foreground">{t("estimateBuilder.discount.label")}</label>
          <Input id={`${id}-label`} value={label} maxLength={ESTIMATE_DISCOUNT_LABEL_MAX} placeholder={defaultLabel} className="h-8"
            onChange={e => setLabel(e.target.value)} data-testid={`input-discount-${scope}-label`} />
        </div>
        {invalid && <p id={`${id}-error`} role="alert" className="text-xs text-destructive" data-testid={`text-discount-${scope}-invalid`}>
          {t(kind === "percent" ? "estimateBuilder.discount.invalidPercent" : "estimateBuilder.discount.invalidAmount")}
        </p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}
            data-testid={`button-discount-${scope}-cancel`}>{t("common.cancel")}</Button>
          <Button type="submit" size="sm" disabled={saving} data-testid={`button-discount-${scope}-save`}>{t("common.save")}</Button>
        </div>
      </form>
    );
  }
  if (!setting) {
    if (!editable) return null;
    return (
      <button type="button" onClick={open}
        className="flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`button-add-discount-${scope}`}>
        <Plus aria-hidden className="h-3.5 w-3.5" />{t(scope === "labor" ? "estimateBuilder.discount.addLabor" : "estimateBuilder.discount.addTotal")}
      </button>
    );
  }
  const warning = !editable ? null : noLabor ? t("estimateBuilder.discount.noLabor")
    : capped ? t(scope === "labor" ? "estimateBuilder.discount.cappedLabor" : "estimateBuilder.discount.cappedTotal") : null;
  return (
    <div data-testid={`row-discount-${scope}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 break-words text-muted-foreground" data-testid={`text-discount-${scope}-label`}>{discountDisplayLabel(version, scope)}</span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="tabular-nums" data-testid={`text-discount-${scope}-amount`}>−{formatCents(cents, lang)}</span>
          {editable && <>
            <button type="button" onClick={open} aria-label={t("estimateBuilder.discount.edit", { name: discountDisplayLabel(version, scope) })}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`button-edit-discount-${scope}`}><Pencil aria-hidden className="h-3 w-3" /></button>
            <button type="button" onClick={() => void remove()} disabled={saving} aria-label={t("estimateBuilder.discount.remove", { name: discountDisplayLabel(version, scope) })}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`button-remove-discount-${scope}`}><X aria-hidden className="h-3 w-3" /></button>
          </>}
        </span>
      </div>
      {warning && <p className="mt-0.5 flex items-start gap-1 text-xs text-[hsl(var(--est-warn))]" data-testid={`text-discount-${scope}-warning`}>
        <AlertTriangle aria-hidden className="mt-px h-3 w-3 shrink-0" />{warning}
      </p>}
    </div>
  );
}
