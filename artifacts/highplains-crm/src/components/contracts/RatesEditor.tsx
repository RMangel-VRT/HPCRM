import { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RATE_CARD_DEFAULTS } from "@/shared/contractCatalog";
import { LINE_LABELS, LINE_ORDER, centsToInput, parseDollarsToCents } from "./rateCardUtils";
import type { RateLine } from "./rateCardUtils";
import { TintChip } from "./ContractBadges";
import { money } from "./contractFormat";
import type { AgreementLine, TermRateRow } from "./contractTypes";

export interface RateRow extends TermRateRow { input: string }

export const toRateRows = (rows: TermRateRow[]): RateRow[] =>
  rows.map(r => ({ ...r, input: r.priceCents != null ? centsToInput(r.priceCents) : "" }));

const DEFAULT_KEYS = new Set(RATE_CARD_DEFAULTS.map(r => r.key));
export const isCustomRate = (r: TermRateRow) =>
  r.rateKey.startsWith("custom_") ||
  (!DEFAULT_KEYS.has(r.rateKey) && r.cardPriceCents == null && r.cardPriceText == null && (r.priceCents != null || !!r.priceText));
export const isChangedRate = (r: TermRateRow) =>
  !isCustomRate(r) && (r.priceCents !== r.cardPriceCents || (r.priceText ?? null) !== (r.cardPriceText ?? null));

const price = (r: RateRow) => (r.input.trim() === "" ? { cents: null as number | null, ok: true } : (() => {
  const c = parseDollarsToCents(r.input);
  return { cents: c, ok: c !== null };
})());

export const rateProblems = (rows: RateRow[]) => rows.filter(r => !price(r).ok).map(r => `${r.label}: enter a dollar amount`);

/** Rows as saved by PUT …/rates. */
export function ratesPayload(rows: RateRow[]) {
  return rows.map(r => ({
    rateKey: r.rateKey, priceCents: price(r).cents, priceText: price(r).cents == null ? r.priceText : null,
    minimum: r.minimum, label: r.label, unit: r.unit, category: r.category, line: r.line as RateLine,
  }));
}
/** Comparable snapshot of what would be saved (for dirty detection). */
export const ratesFingerprint = (rows: RateRow[]) =>
  JSON.stringify(rows.map(r => [r.rateKey, r.input.trim(), r.priceCents, r.priceText, r.minimum, r.label, r.unit, r.category]));

const asLine = (l: string): RateLine => (LINE_ORDER.includes(l as RateLine) ? (l as RateLine) : "general");

export function RatesEditor(props: { line: AgreementLine; rows: RateRow[]; editing: boolean; onChange: (rows: RateRow[]) => void }) {
  const { rows, editing, onChange } = props;
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ label: "", line: (props.line === "snow" ? "snow" : "landscape") as RateLine, category: "Custom", unit: "", minimum: "", price: "" });
  const [err, setErr] = useState<string | null>(null);
  const patch = (key: string, p: Partial<RateRow>) => onChange(rows.map(r => (r.rateKey === key ? { ...r, ...p } : r)));

  function addCustom() {
    const cents = f.price.trim() === "" ? null : parseDollarsToCents(f.price);
    if (!f.label.trim() || !f.unit.trim() || !f.category.trim()) return setErr("Label, category and unit are required");
    if (f.price.trim() !== "" && cents === null) return setErr("Enter the price as a dollar amount");
    const slug = f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "rate";
    let key = `custom_${slug}`, n = 2;
    while (rows.some(r => r.rateKey === key)) key = `custom_${slug}_${n++}`;
    onChange([...rows, { rateKey: key, line: f.line, category: f.category.trim(), label: f.label.trim(), priceCents: cents, priceText: null,
      unit: f.unit.trim(), minimum: f.minimum.trim() || null, cardPriceCents: null, cardPriceText: null, input: cents != null ? centsToInput(cents) : "" }]);
    setF({ ...f, label: "", unit: "", minimum: "", price: "" });
    setErr(null); setAdding(false);
  }

  const groups = LINE_ORDER.map(line => {
    const inLine = rows.filter(r => asLine(r.line) === line);
    const cats: { category: string; rows: RateRow[] }[] = [];
    for (const r of inLine) {
      let c = cats.find(x => x.category === r.category);
      if (!c) cats.push((c = { category: r.category, rows: [] }));
      c.rows.push(r);
    }
    return { line, cats };
  }).filter(g => g.cats.length);

  return (
    <div className="space-y-6" data-testid="editor-rates">
      {!groups.length && <p className="text-sm text-muted-foreground">No rates on this contract.</p>}
      {groups.map(g => (
        <section key={g.line} data-testid={`rates-group-${g.line}`}>
          <h3 className="text-sm font-semibold mb-2">{LINE_LABELS[g.line]}</h3>
          {g.cats.map(c => (
            <div key={c.category} className="mb-4 overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="p-2 font-medium">{c.category}</th>
                    <th className="p-2 font-medium">Rate card</th>
                    <th className="p-2 font-medium">This contract</th>
                    <th className="p-2 font-medium">Unit</th>
                    <th className="p-2 font-medium">Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map(r => {
                    const custom = isCustomRate(r), changed = isChangedRate({ ...r, priceCents: price(r).cents ?? (r.input.trim() ? r.priceCents : null) });
                    return (
                      <tr key={r.rateKey} className="border-t" data-testid={`rate-row-${r.rateKey}`}>
                        <td className="p-2">
                          <span>{r.label}</span>{" "}
                          {custom && <TintChip kind="custom">Custom</TintChip>}
                          {changed && <TintChip kind="changed">Changed</TintChip>}
                        </td>
                        <td className="p-2 tabular-nums text-muted-foreground">
                          {custom ? "\u2014" : r.cardPriceCents != null ? money(r.cardPriceCents) : r.cardPriceText ?? "On request"}
                        </td>
                        <td className="p-2 tabular-nums">
                          {editing ? (
                            <div className="flex items-center gap-1">
                              <Input className="h-8 w-28" inputMode="decimal" value={r.input} placeholder={r.priceText ?? "On request"}
                                aria-label={`${r.label} price`} data-testid={`input-rate-${r.rateKey}`}
                                onChange={e => patch(r.rateKey, { input: e.target.value })} />
                              {changed && (
                                <Button type="button" size="sm" variant="ghost" aria-label={`Reset ${r.label}`} data-testid={`button-reset-rate-${r.rateKey}`}
                                  onClick={() => patch(r.rateKey, { priceCents: r.cardPriceCents, priceText: r.cardPriceText,
                                    input: r.cardPriceCents != null ? centsToInput(r.cardPriceCents) : "" })}>
                                  <RotateCcw className="w-3 h-3 mr-1" />Reset
                                </Button>
                              )}
                            </div>
                          ) : r.priceCents != null ? money(r.priceCents) : r.priceText ?? "On request"}
                        </td>
                        <td className="p-2">{r.unit}</td>
                        <td className="p-2">{r.minimum ?? "\u2014"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
      {editing && (adding ? (
        <div className="rounded-md border p-3 grid gap-2 sm:grid-cols-3" data-testid="form-custom-rate">
          <Input placeholder="Label" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} data-testid="input-custom-rate-label" />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.line} aria-label="Line"
            onChange={e => setF({ ...f, line: e.target.value as RateLine })}>
            {LINE_ORDER.map(l => <option key={l} value={l}>{LINE_LABELS[l]}</option>)}
          </select>
          <Input placeholder="Category" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} />
          <Input placeholder="Unit (per ton)" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} data-testid="input-custom-rate-unit" />
          <Input placeholder="Minimum" value={f.minimum} onChange={e => setF({ ...f, minimum: e.target.value })} />
          <Input placeholder="Price ($)" inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} data-testid="input-custom-rate-price" />
          {err && <p className="text-xs text-destructive sm:col-span-3">{err}</p>}
          <div className="sm:col-span-3 flex gap-2">
            <Button type="button" size="sm" onClick={addCustom} data-testid="button-save-custom-rate">Add rate</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="button-add-custom-rate">
          <Plus className="w-4 h-4 mr-1" />Add custom rate
        </Button>
      ))}
    </div>
  );
}
