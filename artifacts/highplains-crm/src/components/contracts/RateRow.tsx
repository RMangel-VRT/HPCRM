import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { centsToInput, parseDollarsToCents, type RateCardItem } from "./rateCardUtils";

interface Props {
  row: RateCardItem;
  /** Resolves true on success. */
  onSave: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onInvalid: (message: string) => void;
  saving: boolean;
}

function useDraft(server: string) {
  const [v, setV] = useState(server);
  useEffect(() => setV(server), [server]);
  return [v, setV] as const;
}

export default function RateRow({ row, onSave, onInvalid, saving }: Props) {
  const priceServer = row.priceText != null ? row.priceText : row.priceCents != null ? centsToInput(row.priceCents) : "";
  const [label, setLabel] = useDraft(row.label);
  const [category, setCategory] = useDraft(row.category);
  const [price, setPrice] = useDraft(priceServer);
  const [unit, setUnit] = useDraft(row.unit);
  const [minimum, setMinimum] = useDraft(row.minimum ?? "");
  const [editingPrice, setEditingPrice] = useState(false);
  const isText = row.priceText != null;
  const unset = row.priceCents == null && !isText;

  const commit = async (patch: Record<string, unknown>, revert: () => void) => {
    const ok = await onSave(row.id, patch);
    if (!ok) revert();
  };

  const blurText = (v: string, server: string, field: "label" | "category" | "unit", set: (s: string) => void, max?: number) => {
    const t = v.trim();
    if (t === server) { set(server); return; }
    if (!t || (max !== undefined && t.length > max)) {
      onInvalid(!t ? `${field[0].toUpperCase() + field.slice(1)} is required` : `${field} must be ${max} characters or fewer`);
      set(server);
      return;
    }
    void commit({ [field]: t }, () => set(server));
  };

  const blurMinimum = () => {
    const t = minimum.trim();
    const server = row.minimum ?? "";
    if (t === server) { setMinimum(server); return; }
    if (t.length > 40) { onInvalid("Minimum must be 40 characters or fewer"); setMinimum(server); return; }
    void commit({ minimum: t === "" ? null : t }, () => setMinimum(server));
  };

  const blurPrice = () => {
    const t = price.trim();
    if (t === priceServer.trim()) { setPrice(priceServer); setEditingPrice(false); return; }
    if (isText) {
      if (t.length > 60) { onInvalid("Price text must be 60 characters or fewer"); setPrice(priceServer); return; }
      void commit({ priceText: t === "" ? null : t }, () => setPrice(priceServer));
    } else if (t === "") {
      void commit({ priceCents: null }, () => setPrice(priceServer));
    } else {
      const cents = parseDollarsToCents(t);
      if (cents == null) { onInvalid("Enter a dollar amount like 145 or 1.45"); setPrice(priceServer); setEditingPrice(false); return; }
      if (cents === row.priceCents) { setPrice(priceServer); setEditingPrice(false); return; }
      setPrice(centsToInput(cents));
      void commit({ priceCents: cents }, () => setPrice(priceServer));
    }
    setEditingPrice(false);
  };

  const cell = "h-8 text-sm";
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };

  return (
    <TableRow data-testid={`row-rate-${row.rateKey}`} className={row.active ? "" : "opacity-60"}>
      <TableCell className="min-w-[200px]">
        <Input className={cell} value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => blurText(label, row.label, "label", setLabel)} onKeyDown={onEnter} data-testid={`input-rate-label-${row.rateKey}`} aria-label="Rate label" />
        <Input className="h-6 mt-1 text-xs text-muted-foreground border-transparent px-3" value={category} onChange={(e) => setCategory(e.target.value)} onBlur={() => blurText(category, row.category, "category", setCategory)} onKeyDown={onEnter} data-testid={`input-rate-category-${row.rateKey}`} aria-label="Category" />
      </TableCell>
      <TableCell className="min-w-[140px]">
        {unset && !editingPrice ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground italic" data-testid={`text-rate-unset-${row.rateKey}`}>Set per contract</span>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingPrice(true)} data-testid={`button-rate-set-price-${row.rateKey}`}>Set price</Button>
          </div>
        ) : isText ? (
          <Input className={cell} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={blurPrice} onKeyDown={onEnter} data-testid={`input-rate-price-${row.rateKey}`} aria-label="Price text" />
        ) : (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input className={`${cell} pl-6`} inputMode="decimal" autoFocus={editingPrice} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={blurPrice} onKeyDown={onEnter} placeholder="0.00" data-testid={`input-rate-price-${row.rateKey}`} aria-label="Price in dollars" />
          </div>
        )}
      </TableCell>
      <TableCell className="min-w-[160px]">
        <Input className={cell} value={unit} onChange={(e) => setUnit(e.target.value)} onBlur={() => blurText(unit, row.unit, "unit", setUnit, 80)} onKeyDown={onEnter} data-testid={`input-rate-unit-${row.rateKey}`} aria-label="Unit" />
      </TableCell>
      <TableCell className="min-w-[130px]">
        <Input className={cell} value={minimum} onChange={(e) => setMinimum(e.target.value)} onBlur={blurMinimum} onKeyDown={onEnter} placeholder="None" data-testid={`input-rate-minimum-${row.rateKey}`} aria-label="Minimum" />
      </TableCell>
      <TableCell>
        <Switch checked={row.active} disabled={saving} onCheckedChange={(v) => void onSave(row.id, { active: v })} data-testid={`switch-rate-active-${row.rateKey}`} aria-label="Active" />
      </TableCell>
    </TableRow>
  );
}
