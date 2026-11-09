import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FeeTag } from "./PaymentEditor";
import { money } from "./contractFormat";
import { parseDollarsToCents } from "./rateCardUtils";
import {
  cellInvalid, cellKey, explicitTotals, gridMonths, monthPlace, newComponentId,
} from "./explicitSchedule";
import type { ExplicitDraft } from "./explicitSchedule";

export const monthLabel = (month: string, locale = "en") =>
  `${new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${month.slice(0, 7)}-01T12:00:00Z`))} ${month.slice(0, 4)}`;

/** Full-term dated grid: one row per month, one column per component. */
export function ExplicitScheduleEditor({ draft, onChange, startDate, endDate, readOnly, feesOnly }: {
  draft: ExplicitDraft; onChange: (d: ExplicitDraft) => void; startDate: string; endDate: string; readOnly?: boolean; feesOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const months = gridMonths(draft, startDate, endDate);
  const totals = explicitTotals(draft, startDate);
  const set = (p: Partial<ExplicitDraft>) => onChange({ ...draft, ...p });
  const colSum = (id: string) => Object.entries(draft.cells).reduce((s, [k, v]) => {
    if (!k.startsWith(`${id}|`) || v.trim() === "") return s;
    const c = parseDollarsToCents(v.trim()); return s + (c ?? 0);
  }, 0);
  const earliest = months[0];
  const earliestEmpty = !!earliest && draft.components.every(c => (draft.cells[cellKey(c.id, earliest)] ?? "").trim() === "");
  const preStartRows = months.some(m => monthPlace(m, startDate, endDate) === "pre"
    && draft.components.some(c => (draft.cells[cellKey(c.id, m)] ?? "").trim() !== ""));

  return (
    <div className="space-y-3" data-testid="explicit-schedule">
      {!readOnly && <p className="text-xs text-muted-foreground">{t("contractFees.exactHint")}</p>}
      {feesOnly && !readOnly && <p className="text-xs text-muted-foreground">{t("contractFees.tmFeesOnly")}</p>}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={draft.preStart >= 2} onClick={() => set({ preStart: draft.preStart + 1 })}
            data-testid="button-add-prestart">{t("contractFees.addPreStart")}</Button>
          {draft.preStart > 0 && (
            <Button type="button" size="sm" variant="ghost" disabled={!earliestEmpty} onClick={() => set({ preStart: draft.preStart - 1 })}
              data-testid="button-remove-prestart">{t("contractFees.removePreStart")}</Button>
          )}
          <Button type="button" size="sm" variant="outline" className="ml-auto" data-testid="button-add-component"
            onClick={() => set({ components: [...draft.components, { id: newComponentId(), name: "", fee: !!feesOnly }] })}>
            <Plus className="w-4 h-4 mr-1" />{t("contractFees.addComponent")}
          </Button>
        </div>
      )}
      {draft.components.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="empty-explicit">{t("contractFees.noRows")}</p> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs" data-testid="table-explicit-schedule">
            <thead className="bg-muted/50">
              <tr className="border-b align-bottom">
                <th className="sticky left-0 bg-muted/50 px-2 py-1.5 text-left font-medium text-muted-foreground w-28">{t("contractFees.month")}</th>
                {draft.components.map((c, ci) => (
                  <th key={c.id} className="px-1.5 py-1.5 text-left font-medium min-w-[8.5rem]" data-testid={`col-explicit-${ci}`}>
                    {readOnly ? <span className="text-foreground">{c.name}{c.fee && <FeeTag testId={`tag-fee-col-${ci}`} />}</span> : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Input className="h-7 px-1.5 text-xs" value={c.name} placeholder={t("contractFees.componentName")} aria-label={t("contractFees.componentName")}
                            onChange={e => set({ components: draft.components.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) })}
                            data-testid={`input-explicit-name-${ci}`} />
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={t("contractFees.removeComponent", { name: c.name })}
                            onClick={() => {
                              const cells = Object.fromEntries(Object.entries(draft.cells).filter(([k]) => !k.startsWith(`${c.id}|`)));
                              set({ components: draft.components.filter(x => x.id !== c.id), cells });
                            }} data-testid={`button-remove-component-${ci}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                        <label className="flex items-start gap-1 font-normal text-[11px] leading-tight text-muted-foreground">
                          <input type="checkbox" className="mt-0.5" checked={c.fee}
                            onChange={e => set({ components: draft.components.map(x => x.id === c.id ? { ...x, fee: e.target.checked } : x) })}
                            data-testid={`checkbox-explicit-fee-${ci}`} />
                          <span>{t("contractFees.checkbox")}</span>
                        </label>
                        {c.fee && <FeeTag testId={`tag-fee-col-${ci}`} />}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const place = monthPlace(m, startDate, endDate);
                return (
                  <tr key={m} className={cn("border-b last:border-b-0", place !== "in" && "bg-muted/30")} data-testid={`row-explicit-${m}`}>
                    <td className="sticky left-0 bg-card px-2 py-1 whitespace-nowrap tabular-nums">
                      {monthLabel(m, i18n.language)}
                      {place === "pre" && <span className="block text-[10px] text-muted-foreground" data-testid={`tag-prestart-${m}`}>{t("contractFees.beforeStart")}</span>}
                      {place === "outside" && <span className="block text-[10px] text-destructive" data-testid={`tag-outside-${m}`}>{t("contractFees.outsideTerm")}</span>}
                    </td>
                    {draft.components.map((c, ci) => {
                      const raw = draft.cells[cellKey(c.id, m)] ?? "";
                      return (
                        <td key={c.id} className="px-1.5 py-1 text-right tabular-nums" data-testid={`cell-explicit-${ci}-${m}`}>
                          {readOnly ? (raw.trim() === "" ? <span className="text-muted-foreground">{"\u2014"}</span> : money(parseDollarsToCents(raw) ?? 0)) : (
                            <Input className="h-7 px-1 text-xs text-right tabular-nums" inputMode="decimal" value={raw} aria-label={`${c.name} ${monthLabel(m)}`}
                              aria-invalid={cellInvalid(raw)} onChange={e => set({ cells: { ...draft.cells, [cellKey(c.id, m)]: e.target.value } })}
                              data-testid={`input-explicit-${ci}-${m}`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50 font-medium">
                <td className="sticky left-0 bg-muted/50 px-2 py-1.5">{t("contractFees.total")}</td>
                {draft.components.map((c, ci) => <td key={c.id} className="px-1.5 py-1.5 text-right tabular-nums" data-testid={`text-explicit-col-total-${ci}`}>{money(colSum(c.id))}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!readOnly && preStartRows && (
        <label className="flex items-start gap-2 rounded-md border p-2 text-sm" data-testid="label-allow-prestart">
          <input type="checkbox" className="mt-1" checked={draft.allowPreStart} onChange={e => set({ allowPreStart: e.target.checked })} data-testid="checkbox-allow-prestart" />
          <span>{t("contractFees.allowPreStart")}</span>
        </label>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t pt-2 text-sm" data-testid="explicit-totals">
        <dt className="text-muted-foreground">{t("contractFees.yearOne")}</dt><dd className="text-right tabular-nums font-semibold" data-testid="text-explicit-year1">{money(totals.year1)}</dd>
        <dt className="text-muted-foreground">{t("contractFees.allContract")}</dt><dd className="text-right tabular-nums" data-testid="text-explicit-contract-total">{money(totals.contract)}</dd>
        {totals.fees > 0 && <><dt className="text-muted-foreground">{t("contractFees.feesAll")}</dt><dd className="text-right tabular-nums" data-testid="text-explicit-fees">{money(totals.fees)}</dd></>}
      </dl>
    </div>
  );
}

/** "Monthly pattern" / "Exact dates" switch. */
export function ScheduleModeToggle({ mode, onChange, storedMode }: { mode: "pattern" | "explicit"; onChange: (m: "pattern" | "explicit") => void; storedMode?: "pattern" | "explicit" }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5" data-testid="schedule-mode">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("contractFees.schedule")}</span>
        <div role="radiogroup" aria-label={t("contractFees.schedule")} className="inline-flex rounded-md border bg-muted/40 p-0.5">
          {(["pattern", "explicit"] as const).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => onChange(m)}
              className={cn("px-3 h-7 text-xs rounded", mode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
              data-testid={`button-schedule-${m}`}>{t(m === "pattern" ? "contractFees.modePattern" : "contractFees.modeExact")}</button>
          ))}
        </div>
      </div>
      {storedMode && storedMode !== mode && (
        <p className="text-xs rounded-md border border-dashed px-2 py-1" data-testid="note-schedule-convert">{t(mode === "pattern" ? "contractFees.toPattern" : "contractFees.toExact")}</p>
      )}
    </div>
  );
}
