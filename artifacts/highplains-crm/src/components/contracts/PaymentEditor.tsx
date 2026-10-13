import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amberBox } from "./ContractBadges";
import { monthName, money } from "./contractFormat";
import {
  LINE_SUGGESTIONS, PRESET_LABEL, SNOW_LINE, annualCents, applyPreset, blankLine, cycle, lineMismatch, lineSum, monthPct,
  recompute, setMonthRaw, totalInvalid,
} from "./paymentDraft";
import type { PaymentLine, PresetKey } from "./paymentDraft";
import { centsToInput, parseDollarsToCents } from "./rateCardUtils";
import type { AgreementLine } from "./contractTypes";

export const TM_TEXT = "Billed time and materials, invoiced monthly, net 30";

function MonthInput({ value, bad, onRaw, testId }: { value: number; bad: boolean; onRaw: (raw: string) => void; testId: string }) {
  const [text, setText] = useState(value ? centsToInput(value) : "");
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value ? centsToInput(value) : ""); }
  }, [value]);
  return (
    <Input className="h-8 px-1 text-xs text-right tabular-nums" inputMode="decimal" value={text} aria-label="Month amount" aria-invalid={bad} data-testid={testId}
      onChange={e => {
        setText(e.target.value);
        const c = e.target.value.trim() === "" ? 0 : parseDollarsToCents(e.target.value);
        if (c !== null) last.current = c;
        onRaw(e.target.value);
      }} />
  );
}

export function PaymentEditor(props: {
  lines: PaymentLine[]; onChange: (lines: PaymentLine[]) => void; startMonth: number; readOnly?: boolean;
  line?: AgreementLine; snowPricing?: string | null; flatSnowAllowed?: boolean; errors?: boolean;
}) {
  const { lines, startMonth, readOnly } = props;
  const order = cycle(startMonth);
  // Re-run presets when the term's start month moves.
  const lastStart = useRef(startMonth);
  const linesRef = useRef(lines); linesRef.current = lines;
  const changeRef = useRef(props.onChange); changeRef.current = props.onChange;
  useEffect(() => {
    if (lastStart.current === startMonth) return;
    lastStart.current = startMonth;
    changeRef.current(linesRef.current.map(l => recompute(l, startMonth)));
  }, [startMonth]);

  if (props.line === "snow" && props.snowPricing !== "flat_rate") {
    return <p className="text-sm rounded-md border p-3" data-testid="text-time-and-materials">{TM_TEXT}</p>;
  }
  const patch = (id: string, fn: (l: PaymentLine) => PaymentLine) => props.onChange(lines.map(l => (l.id === id ? fn(l) : l)));
  const presetsFor = (l: PaymentLine): PresetKey[] => [
    "equal12", "msi", "equalOver", ...(props.flatSnowAllowed && l.name.trim() === SNOW_LINE ? ["flatSnow" as const] : []), "custom",
  ];

  return (
    <div className="space-y-4" data-testid="payment-editor">
      <datalist id="payment-line-names">{LINE_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
      {props.errors && props.flatSnowAllowed && !lines.some(l => l.name.trim() === SNOW_LINE && lineSum(l) > 0) && (
        <p className="text-sm text-destructive" data-testid="error-flat-snow-line">
          Flat-rate snow requires a payment line named "Snow" with a yearly amount above $0.
        </p>
      )}
      {lines.map((l, idx) => {
        const mismatch = lineMismatch(l);
        const missingName = props.errors && !l.name.trim();
        return (
          <div key={l.id} className="rounded-md border p-3 space-y-3" data-testid={`payment-line-${idx}`}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 min-w-[12rem] flex-1">
                <span className="text-xs text-muted-foreground">Line name</span>
                <Input list="payment-line-names" value={l.name} disabled={readOnly} aria-invalid={!!missingName}
                  onChange={e => patch(l.id, x => ({ ...x, name: e.target.value }))} data-testid={`input-line-name-${idx}`} />
                {missingName && <span className="text-xs text-destructive" data-testid={`error-line-name-${idx}`}>Give this payment line a name</span>}
              </label>
              <label className="space-y-1 w-36">
                <span className="text-xs text-muted-foreground">Yearly total</span>
                <Input inputMode="decimal" value={l.total} disabled={readOnly} placeholder="0.00"
                  onChange={e => patch(l.id, x => recompute({ ...x, total: e.target.value }, startMonth))} data-testid={`input-line-total-${idx}`} />
              </label>
              <div className="text-sm">
                <span className="text-xs text-muted-foreground block">Preset</span>
                <span data-testid={`text-line-preset-${idx}`}>{PRESET_LABEL[l.preset]}</span>
              </div>
              {!readOnly && (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => patch(l.id, x => ({ ...x, pickerOpen: !x.pickerOpen }))}
                    data-testid={`button-toggle-presets-${idx}`}>{l.pickerOpen ? "Hide presets" : "Choose preset"}</Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove payment line"
                    onClick={() => props.onChange(lines.filter(x => x.id !== l.id))} data-testid={`button-remove-line-${idx}`}><Trash2 className="w-4 h-4" /></Button>
                </>
              )}
            </div>
            {!readOnly && l.pickerOpen && (
              <div className="space-y-2" data-testid={`presets-${idx}`}>
                <div className="flex flex-wrap gap-2">
                  {presetsFor(l).map(p => (
                    <Button key={p} type="button" size="sm" variant={l.preset === p ? "default" : "outline"} aria-pressed={l.preset === p}
                      onClick={() => patch(l.id, x => applyPreset(x, p, startMonth))} data-testid={`button-preset-${p}-${idx}`}>{PRESET_LABEL[p]}</Button>
                  ))}
                </div>
                {l.preset === "equalOver" && (
                  <div className="flex flex-wrap gap-3" data-testid={`chosen-months-${idx}`}>
                    {order.map(m => (
                      <label key={m} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={l.chosen.includes(m)}
                          onChange={e => patch(l.id, x => recompute({ ...x, chosen: e.target.checked ? [...x.chosen, m].sort((a, b) => a - b) : x.chosen.filter(c => c !== m) }, startMonth))}
                          data-testid={`checkbox-month-${idx}-${m}`} />
                        {monthName(m)}
                      </label>
                    ))}
                  </div>
                )}
                {l.preset !== "custom" && !(l.total.trim()) && <p className="text-xs text-muted-foreground">Type a yearly total to fill the months.</p>}
              </div>
            )}
            <div className="overflow-x-auto">
              <div className="grid grid-cols-12 gap-1 min-w-[48rem]">
                {order.map(m => (
                  <div key={m} className="space-y-1" data-testid={`cell-${idx}-${m}`}>
                    <div className="text-center text-xs text-muted-foreground">{monthName(m)}</div>
                    {readOnly
                      ? <div className="text-right text-xs tabular-nums h-8 flex items-center justify-end" data-testid={`value-month-${idx}-${m}`}>{l.months[m - 1] ? money(l.months[m - 1]) : "\u2014"}</div>
                      : <MonthInput value={l.months[m - 1]} bad={!!l.invalid?.[m]} testId={`input-month-${idx}-${m}`} onRaw={raw => patch(l.id, x => setMonthRaw(x, m, raw))} />}
                    <div className="text-center text-[10px] text-muted-foreground tabular-nums" data-testid={`pct-month-${idx}-${m}`}>{monthPct(l, m).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium tabular-nums" data-testid={`text-line-sum-${idx}`}>{money(lineSum(l))} per year</span>
              {(Object.keys(l.invalid ?? {}).length > 0 || totalInvalid(l)) && (
                <span className="text-xs text-destructive" data-testid={`error-line-amount-${idx}`}>Enter amounts as dollars, like 1,250.00</span>
              )}
              {mismatch && (
                <span className="rounded-md px-2 py-1 text-xs" style={amberBox} data-testid={`warning-line-${idx}`}>
                  Months add up to {money(mismatch.sum)}, not {money(mismatch.total)}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {!readOnly && props.flatSnowAllowed && !lines.some(l => l.name.trim() === SNOW_LINE) && (
        <Button type="button" size="sm" variant="outline" data-testid="button-add-snow-line"
          onClick={() => props.onChange([...lines, blankLine(SNOW_LINE, { preset: "flatSnow", pickerOpen: true })])}>Add Snow line</Button>
      )}
      {!readOnly && <p className="text-xs text-muted-foreground">Lines with no amounts are not saved.</p>}
      {!readOnly && (
        <Button type="button" size="sm" variant="outline" data-testid="button-add-line"
          onClick={() => props.onChange([...lines, blankLine("", { pickerOpen: true })])}><Plus className="w-4 h-4 mr-1" />Add payment line</Button>
      )}
      <div className="flex justify-between border-t pt-3 text-sm font-semibold">
        <span>Annual price</span><span className="tabular-nums" data-testid="text-annual-price">{money(annualCents(lines))}</span>
      </div>
    </div>
  );
}
