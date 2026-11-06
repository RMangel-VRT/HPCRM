import { useTranslation } from "react-i18next";
import { money } from "./contractFormat";

type Change = { rateKey: string; label: string; reason: "added" | "removed" | "changed";
  fields: { field: string; old: unknown; new: unknown }[] };
export function RateHistoryNote({ note }: { note: string }) {
  const { t } = useTranslation();
  if (!note.startsWith("Rates updated: ")) return <>{note}</>;
  let changes: Change[];
  try {
    const value: unknown = JSON.parse(note.slice("Rates updated: ".length));
    if (!Array.isArray(value) || !value.every(c => c && typeof c.rateKey === "string" && typeof c.label === "string" &&
      ["added", "removed", "changed"].includes(c.reason) && Array.isArray(c.fields) &&
      c.fields.every((f: unknown) => f && typeof f === "object" && "field" in f && typeof f.field === "string"))) return <>{note}</>;
    changes = value;
  } catch { return <>{note}</>; }
  const display = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "priceCents" && typeof value === "number") return money(value);
    if (field === "sortOrder" && typeof value === "number") return String(value + 1);
    if (field === "line" && typeof value === "string") return t(`contractRates.lines.${value}`);
    return String(value);
  };
  return <div data-testid="rates-updated-history">
    <span className="font-medium">{t("contractRates.updated")}</span>
    <ul className="mt-1 space-y-1 text-xs">
      {changes.map(c => <li key={c.rateKey}>
        <span className="font-medium">{t(`contractRates.${c.reason}`)}: {c.label}</span>
        <span className="text-muted-foreground"> ({c.rateKey})</span>
        <div className="text-muted-foreground">{c.fields.map(f => {
          const label = f.field === "priceCents" ? t("contractRates.price") : f.field === "sortOrder" ? t("contractRates.order")
            : f.field === "label" ? t("contractRates.rate") : t(`contractRates.${f.field}`);
          return `${label}: ${c.reason === "changed" ? `${display(f.field, f.old)} → ${display(f.field, f.new)}` : display(f.field, c.reason === "removed" ? f.old : f.new)}`;
        }).join(" · ")}</div>
      </li>)}
    </ul>
  </div>;
}
