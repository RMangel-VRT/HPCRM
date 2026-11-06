/** All customer-page money is cents; preserve null, and never fabricate T&M zero. */
export function formatCurrency(cents: number | null | undefined, whole = false, locale = "en") {
  if (cents == null) return "—";
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}
