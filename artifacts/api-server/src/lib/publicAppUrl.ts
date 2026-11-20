/** Stable, customer-facing links; never fall back to a temporary preview host. */
export function publicAppUrl(): string {
  return (process.env.PUBLIC_APP_URL?.trim() || "https://app.highplainsprop.com").replace(/\/+$/, "");
}
