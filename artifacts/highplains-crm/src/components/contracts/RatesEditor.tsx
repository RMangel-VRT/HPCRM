import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RATE_CARD_DEFAULTS } from "@/shared/contractCatalog";
import { LINE_ORDER, centsToInput, parseDollarsToCents } from "./rateCardUtils";
import i18n from "i18next";
import type { RateCardItem, RateLine } from "./rateCardUtils";
import { TintChip } from "./ContractBadges";
import { money } from "./contractFormat";
import type { AgreementLine, TermRateRow } from "./contractTypes";
import { useScopedRateCard } from "./useRateCard";

export interface RateRow extends TermRateRow { input: string }

export const toRateRows = (rows: TermRateRow[]): RateRow[] =>
  rows.map(r => ({ ...r, input: r.priceCents != null ? centsToInput(r.priceCents) : "" }));

const DEFAULT_KEYS = new Set(RATE_CARD_DEFAULTS.map(r => r.key));
export const isCustomRate = (r: TermRateRow) =>
  r.rateKey.startsWith("custom_") ||
  (!DEFAULT_KEYS.has(r.rateKey) && r.cardPriceCents == null && r.cardPriceText == null && (r.priceCents != null || !!r.priceText));
export const isChangedRate = (r: TermRateRow) =>
  !isCustomRate(r) && (r.priceCents !== r.cardPriceCents || (r.priceText ?? null) !== (r.cardPriceText ?? null));

/** Same rule as the server's applies(): which rate lines belong to a contract line. */
export function rateApplies(line: AgreementLine, rateLine: string) {
  return line === "both" || rateLine === "general" || (line === "snow" ? rateLine === "snow" : ["landscape", "irrigation"].includes(rateLine));
}

/** Active card rows for the line, in card order, as editable rows (used only by "Start from the card"). */
export function cardRateRows(card: RateCardItem[], line: AgreementLine): RateRow[] {
  return toRateRows(card.filter(r => r.active && rateApplies(line, r.line))
    .sort((a, b) => LINE_ORDER.indexOf(a.line) - LINE_ORDER.indexOf(b.line) || a.sortOrder - b.sortOrder)
    .map(cardToRow));
}
export const cardToRow = (r: RateCardItem): TermRateRow => ({
  rateKey: r.rateKey, line: r.line, category: r.category, label: r.label, priceCents: r.priceCents, priceText: r.priceText,
  unit: r.unit, minimum: r.minimum, cardPriceCents: r.priceCents, cardPriceText: r.priceText,
});

const price = (r: RateRow) => (r.input.trim() === "" ? { cents: null as number | null, ok: true } : (() => {
  const c = parseDollarsToCents(r.input);
  return { cents: c, ok: c !== null };
})());

export const rateProblems = (rows: RateRow[]) => rows.flatMap(r => [
  ...(!price(r).ok ? [`${r.label || i18n.t("contractRates.rate")}: ${i18n.t("contractRates.badPrice")}`] : []),
  ...(!r.label.trim() || !r.unit.trim() ? [`${r.label || r.rateKey}: ${i18n.t("contractRates.required")}`] : []),
]);

/** Rows as saved by PUT …/rates, create and renew: exactly the contract's list, in order. */
export function ratesPayload(rows: RateRow[]) {
  return rows.map(r => {
    const cents = price(r).cents;
    return {
      // A numeric price may also have stated text. Null, empty and whitespace
      // are distinct snapshots; reordering or editing a sibling must not rewrite them.
      rateKey: r.rateKey, priceCents: cents, priceText: r.priceText,
      minimum: r.minimum, label: r.label, unit: r.unit, category: r.category,
      line: r.line as RateLine,
    };
  });
}
export type RatesWire = ReturnType<typeof ratesPayload>;
/** Comparable snapshot of what would be saved (for dirty detection). Order matters. */
export const ratesFingerprint = (rows: RateRow[]) =>
  JSON.stringify(rows.map(r => [r.rateKey, r.input.trim(), r.priceCents, r.priceText, r.minimum, r.label, r.unit, r.category, r.line]));

export const rateDisplay = (cents: number | null, text: string | null | undefined, onRequest: string) =>
  cents != null ? money(cents) : text || onRequest;

function uniqueCustomKey(label: string, rows: RateRow[]) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "rate";
  let key = `custom_${slug}`, n = 2;
  while (rows.some(r => r.rateKey === key)) key = `custom_${slug}_${n++}`;
  return key;
}

const selectCls = "h-8 rounded-md border bg-background px-2 text-sm";

export function RatesEditor(props: {
  line: AgreementLine; rows: RateRow[]; editing: boolean; onChange: (rows: RateRow[]) => void;
  /** Card rows when the page already has them; otherwise the editor loads the card lazily. */
  card?: RateCardItem[];
}) {
  const { rows, editing, onChange, line } = props;
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ label: "", line: (line === "snow" ? "snow" : "landscape") as RateLine, category: "Custom", unit: "", minimum: "", price: "", priceText: "" });
  const [err, setErr] = useState<string | null>(null);
  const lazy = useScopedRateCard(!props.card && editing && (picking || starting));
  const card = props.card ?? lazy.data;
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  const candidates = (card ?? []).filter(c => c.active && rateApplies(line, c.line) && !rows.some(r => r.rateKey === c.rateKey));
  const startFrom = (list: RateCardItem[]) => {
    const cur = rowsRef.current;
    const extra = cardRateRows(list, line).filter(r => !cur.some(x => x.rateKey === r.rateKey));
    onChangeRef.current([...cur, ...extra]);
  };
  useEffect(() => {
    if (starting && card) { startFrom(card); setStarting(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting, card]);

  const patch = (key: string, p: Partial<RateRow>) => onChange(rows.map(r => (r.rateKey === key ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= rows.length) return;
    const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const remove = (key: string) => onChange(rows.filter(r => r.rateKey !== key));
  const pick = (c: RateCardItem) => { onChange([...rows, ...toRateRows([cardToRow(c)])]); setQuery(""); };

  function addCustom() {
    const cents = f.price.trim() === "" ? null : parseDollarsToCents(f.price);
    if (!f.label.trim() || !f.unit.trim() || !f.category.trim()) return setErr(t("contractRates.required"));
    if (f.price.trim() !== "" && cents === null) return setErr(t("contractRates.badPrice"));
    const key = uniqueCustomKey(f.label, rows);
    onChange([...rows, { rateKey: key, line: f.line, category: f.category.trim(), label: f.label.trim(), priceCents: cents,
      priceText: f.priceText === "" ? null : f.priceText,
      unit: f.unit.trim(), minimum: f.minimum === "" ? null : f.minimum, cardPriceCents: null, cardPriceText: null, input: cents != null ? centsToInput(cents) : "" }]);
    setF({ ...f, label: "", unit: "", minimum: "", price: "", priceText: "" });
    setErr(null); setAdding(false);
  }

  const onReq = t("contractRates.onRequest");
  const q = query.trim().toLowerCase();
  const matches = candidates.filter(c => !q || `${c.label} ${c.category} ${c.unit} ${c.rateKey}`.toLowerCase().includes(q));
  const cardError = !props.card && lazy.isError;

  if (!editing) {
    if (!rows.length) return <p className="text-sm text-muted-foreground" data-testid="empty-rates">{t("contractRates.empty")}</p>;
    return (
      <div className="overflow-x-auto rounded-md border" data-testid="editor-rates">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">{t("contractRates.rate")}</th><th className="p-2 font-medium">{t("contractRates.price")}</th>
            <th className="p-2 font-medium">{t("contractRates.unit")}</th><th className="p-2 font-medium">{t("contractRates.minimum")}</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.rateKey} className="border-t" data-testid={`rate-row-${r.rateKey}`}>
              <td className="p-2">{r.label}</td><td className="p-2 tabular-nums">{rateDisplay(r.priceCents, r.priceText, onReq)}</td>
              <td className="p-2">{r.unit}</td><td className="p-2">{r.minimum ?? "\u2014"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="editor-rates">
      {!rows.length ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="empty-rates">{t("contractRates.empty")}</div>
      ) : (
        <ol className="space-y-2" data-testid="list-rates-edit">
          {rows.map((r, i) => {
            const custom = isCustomRate(r);
            const onCard = card?.find(c => c.rateKey === r.rateKey);
            const cents = price(r);
            const differs = !custom && (r.cardPriceCents != null || r.cardPriceText != null) &&
              (cents.cents !== r.cardPriceCents || (cents.cents == null && (r.priceText ?? null) !== (r.cardPriceText ?? null)));
            return (
              <li key={r.rateKey} className="rounded-md border bg-card p-2" data-testid={`rate-row-${r.rateKey}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-1.5 w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="grid flex-1 min-w-0 gap-2 sm:grid-cols-[minmax(10rem,2fr)_6.5rem_minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(6rem,1fr)]">
                    <div className="min-w-0 space-y-1">
                      <Input className="h-8" value={r.label} aria-label={t("contractRates.rate")} data-testid={`input-rate-label-${r.rateKey}`}
                        onChange={e => patch(r.rateKey, { label: e.target.value })} />
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {custom && <TintChip kind="custom">{t("contractRates.custom")}</TintChip>}
                        {onCard && !onCard.active && <TintChip kind="changed">{t("contractRates.inactive")}</TintChip>}
                        {differs && <span data-testid={`text-rate-card-${r.rateKey}`}>{t("contractRates.cardNote", { price: rateDisplay(r.cardPriceCents, r.cardPriceText, onReq) })}</span>}
                      </div>
                    </div>
                    <Input className="h-8" inputMode="decimal" value={r.input} placeholder="$" aria-label={`${r.label} price`}
                      aria-invalid={!cents.ok} data-testid={`input-rate-${r.rateKey}`} onChange={e => patch(r.rateKey, { input: e.target.value })} />
                    <Input className="h-8" value={r.priceText ?? ""} placeholder={t("contractRates.priceText")}
                      aria-label={`${r.label} ${t("contractRates.priceText")}`} data-testid={`input-rate-text-${r.rateKey}`}
                      onChange={e => patch(r.rateKey, { priceText: e.target.value })} />
                    <Input className="h-8" value={r.unit} placeholder={t("contractRates.unit")} aria-label={`${r.label} ${t("contractRates.unit")}`}
                      data-testid={`input-rate-unit-${r.rateKey}`} onChange={e => patch(r.rateKey, { unit: e.target.value })} />
                    <Input className="h-8" value={r.minimum ?? ""} placeholder={t("contractRates.minimum")} aria-label={`${r.label} ${t("contractRates.minimum")}`}
                      data-testid={`input-rate-minimum-${r.rateKey}`} onChange={e => patch(r.rateKey, { minimum: e.target.value })} />
                    {custom && (
                      <div className="flex flex-wrap gap-2 sm:col-span-5">
                        <Input className="h-8 w-40" value={r.category} placeholder={t("contractRates.category")} aria-label={`${r.label} ${t("contractRates.category")}`}
                          data-testid={`input-rate-category-${r.rateKey}`} onChange={e => patch(r.rateKey, { category: e.target.value })} />
                        <select className={selectCls} value={r.line} aria-label={`${r.label} ${t("contractRates.line")}`} data-testid={`select-rate-line-${r.rateKey}`}
                          onChange={e => patch(r.rateKey, { line: e.target.value })}>
                          {LINE_ORDER.filter(l => rateApplies(line, l)).map(l => <option key={l} value={l}>{t(`contractRates.lines.${l}`)}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)}
                      aria-label={t("contractRates.moveUp", { label: r.label })} data-testid={`button-rate-up-${r.rateKey}`}><ArrowUp className="w-3.5 h-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={i === rows.length - 1} onClick={() => move(i, 1)}
                      aria-label={t("contractRates.moveDown", { label: r.label })} data-testid={`button-rate-down-${r.rateKey}`}><ArrowDown className="w-3.5 h-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(r.rateKey)}
                      aria-label={t("contractRates.remove", { label: r.label })} data-testid={`button-rate-remove-${r.rateKey}`}><X className="w-4 h-4" /></Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {picking && (
        <div className="rounded-md border p-2 space-y-2" data-testid="picker-card-rates">
          <div className="relative">
            <Search className="absolute left-2 top-2 w-4 h-4 text-muted-foreground" />
            <Input autoFocus className="h-8 pl-8" value={query} placeholder={t("contractRates.search")} aria-label={t("contractRates.search")}
              onKeyDown={e => { if (e.key === "Escape") setPicking(false); }} onChange={e => setQuery(e.target.value)} data-testid="input-rate-search" />
          </div>
          {!card && !cardError && <p className="text-xs text-muted-foreground" data-testid="loading-rate-card">{t("contractRates.cardLoading")}</p>}
          {cardError && (
            <p className="text-xs text-destructive" data-testid="error-rate-card">{t("contractRates.cardError")}{" "}
              <button type="button" className="underline" onClick={() => void lazy.refetch()}>{t("contractRates.retry")}</button></p>
          )}
          {card && (
            <ul className="max-h-60 overflow-y-auto divide-y text-sm" role="listbox">
              {!candidates.length ? <li className="p-2 text-xs text-muted-foreground">{t("contractRates.allListed")}</li>
                : !matches.length ? <li className="p-2 text-xs text-muted-foreground">{t("contractRates.noMatches")}</li>
                : matches.map(c => (
                  <li key={c.rateKey}>
                    <button type="button" role="option" aria-selected={false} className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left hover:bg-muted/60 rounded-sm"
                      onClick={() => pick(c)} data-testid={`option-card-rate-${c.rateKey}`}>
                      <span className="min-w-0 flex-1 truncate">{c.label}<span className="ml-1.5 text-xs text-muted-foreground">{c.category}</span></span>
                      <span className="tabular-nums">{rateDisplay(c.priceCents, c.priceText, onReq)}</span>
                      <span className="text-xs text-muted-foreground">{c.unit}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setPicking(false)} data-testid="button-close-picker">{t("contractRates.cancel")}</Button>
        </div>
      )}

      {adding && (
        <div className="rounded-md border p-3 grid gap-2 sm:grid-cols-3" data-testid="form-custom-rate">
          <Input placeholder={t("contractRates.rate")} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} data-testid="input-custom-rate-label" />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.line} aria-label={t("contractRates.line")}
            onChange={e => setF({ ...f, line: e.target.value as RateLine })} data-testid="select-custom-rate-line">
            {LINE_ORDER.filter(l => rateApplies(line, l)).map(l => <option key={l} value={l}>{t(`contractRates.lines.${l}`)}</option>)}
          </select>
          <Input placeholder={t("contractRates.category")} value={f.category} onChange={e => setF({ ...f, category: e.target.value })} data-testid="input-custom-rate-category" />
          <Input placeholder={`${t("contractRates.unit")} (per ton)`} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} data-testid="input-custom-rate-unit" />
          <Input placeholder={t("contractRates.minimum")} value={f.minimum} onChange={e => setF({ ...f, minimum: e.target.value })} data-testid="input-custom-rate-minimum" />
          <Input placeholder={`${t("contractRates.price")} ($)`} inputMode="decimal" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} data-testid="input-custom-rate-price" />
          <Input placeholder={t("contractRates.priceText")} value={f.priceText} onChange={e => setF({ ...f, priceText: e.target.value })} data-testid="input-custom-rate-text" />
          {err && <p className="text-xs text-destructive sm:col-span-3" role="alert">{err}</p>}
          <div className="sm:col-span-3 flex gap-2">
            <Button type="button" size="sm" onClick={addCustom} data-testid="button-save-custom-rate">{t("contractRates.add")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>{t("contractRates.cancel")}</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!picking && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setPicking(true); setAdding(false); }} data-testid="button-add-rate">
            <Plus className="w-4 h-4 mr-1" />{t("contractRates.addRate")}
          </Button>
        )}
        {!adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(true); setPicking(false); }} data-testid="button-add-custom-rate">
            <Plus className="w-4 h-4 mr-1" />{t("contractRates.addCustom")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" title={t("contractRates.startHint")} disabled={(starting && !cardError) || (!!card && !candidates.length)}
          onClick={() => (card ? startFrom(card) : setStarting(true))} data-testid="button-start-from-card">
          <Sparkles className="w-4 h-4 mr-1" />{t("contractRates.startFromCard")}
        </Button>
      </div>
      {starting && cardError && (
        <p className="text-xs text-destructive">{t("contractRates.cardError")}{" "}
          <button type="button" className="underline" onClick={() => void lazy.refetch()}>{t("contractRates.retry")}</button></p>
      )}
    </div>
  );
}
