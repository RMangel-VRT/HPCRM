/** All customer-page money is cents; preserve null, and never fabricate T&M zero. */
export function formatCurrency(cents: number | null | undefined, whole = false, locale = "en") {
  if (cents == null) return "—";
  // `whole` drops cents only when the amount is whole dollars; money is never rounded.
  const drop = whole && Math.round(cents) % 100 === 0;
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: drop ? 0 : 2, maximumFractionDigits: drop ? 0 : 2,
  }).format(cents / 100);
}
