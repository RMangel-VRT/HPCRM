import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { es as esLocale } from "date-fns/locale";

/** CP4 date rules: "Apr 23, 2026" (localized) everywhere; relative only for activity feeds. */
export function useCustomerDates() {
  const { i18n } = useTranslation();
  const locale = i18n?.language?.startsWith("es") ? esLocale : undefined;
  const parse = (v: unknown): Date | null => {
    if (!v) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00`);
    const d = new Date(v as string);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  return {
    parse,
    day: (v: unknown) => { const d = parse(v); return d ? format(d, "MMM d, yyyy", { locale }) : "\u2014"; },
    dayKey: (v: unknown) => { const d = parse(v); return d ? format(d, "yyyy-MM-dd") : ""; },
    ago: (v: unknown) => { const d = parse(v); return d ? formatDistanceToNow(d, { addSuffix: true, locale }) : "\u2014"; },
  };
}
