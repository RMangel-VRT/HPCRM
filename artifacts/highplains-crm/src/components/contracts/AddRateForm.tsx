import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { LINE_ORDER, LINE_LABELS, RATE_KEY_RE, parseDollarsToCents, type RateLine } from "./rateCardUtils";

interface Props {
  pending: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
  onInvalid: (message: string) => void;
}

export default function AddRateForm({ pending, onSubmit, onInvalid }: Props) {
  const [open, setOpen] = useState(false);
  const [rateKey, setRateKey] = useState("");
  const [line, setLine] = useState<RateLine>("landscape");
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [minimum, setMinimum] = useState("");

  const reset = () => { setRateKey(""); setCategory(""); setLabel(""); setPrice(""); setUnit(""); setMinimum(""); setLine("landscape"); };

  const submit = async () => {
    const key = rateKey.trim();
    if (!RATE_KEY_RE.test(key)) return onInvalid("Key must start with a lowercase letter and use only lowercase letters, numbers and underscores (2 to 63 characters)");
    if (!category.trim() || !label.trim()) return onInvalid("Category and label are required");
    const u = unit.trim();
    if (!u || u.length > 80) return onInvalid("Unit is required (80 characters or fewer)");
    if (minimum.trim().length > 40) return onInvalid("Minimum must be 40 characters or fewer");
    const body: Record<string, unknown> = { rateKey: key, line, category: category.trim(), label: label.trim(), unit: u };
    if (price.trim()) {
      const cents = parseDollarsToCents(price);
      if (cents == null) return onInvalid("Enter a dollar amount like 145 or 1.45");
      body.priceCents = cents;
    }
    if (minimum.trim()) body.minimum = minimum.trim();
    if (await onSubmit(body)) { reset(); setOpen(false); }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="button-add-rate">
        <Plus className="w-3 h-3 mr-1" />Add rate
      </Button>
    );
  }

  return (
    <div className="rounded-md border p-4 space-y-3" data-testid="form-add-rate">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="add-rate-key">Key</Label>
          <Input id="add-rate-key" value={rateKey} onChange={(e) => setRateKey(e.target.value)} placeholder="rate_mulch_install" data-testid="input-add-rate-key" /></div>
        <div className="space-y-1.5"><Label>Line</Label>
          <Select value={line} onValueChange={(v) => setLine(v as RateLine)}>
            <SelectTrigger data-testid="select-add-rate-line"><SelectValue /></SelectTrigger>
            <SelectContent>{LINE_ORDER.map((l) => <SelectItem key={l} value={l}>{LINE_LABELS[l]}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5"><Label htmlFor="add-rate-category">Category</Label>
          <Input id="add-rate-category" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="input-add-rate-category" /></div>
        <div className="space-y-1.5"><Label htmlFor="add-rate-label">Label</Label>
          <Input id="add-rate-label" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="input-add-rate-label" /></div>
        <div className="space-y-1.5"><Label htmlFor="add-rate-price">Price</Label>
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input id="add-rate-price" className="pl-6" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" data-testid="input-add-rate-price" /></div></div>
        <div className="space-y-1.5"><Label htmlFor="add-rate-unit">Unit</Label>
          <Input id="add-rate-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="per hour" data-testid="input-add-rate-unit" /></div>
        <div className="space-y-1.5"><Label htmlFor="add-rate-minimum">Minimum</Label>
          <Input id="add-rate-minimum" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="Optional" data-testid="input-add-rate-minimum" /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(false); }} data-testid="button-cancel-add-rate">Cancel</Button>
        <Button size="sm" onClick={() => void submit()} disabled={pending} data-testid="button-save-add-rate">{pending ? "Saving..." : "Add rate"}</Button>
      </div>
    </div>
  );
}
