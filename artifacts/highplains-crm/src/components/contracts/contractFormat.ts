const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
export const monthName = (m: number) => MONTHS[(m - 1 + 120) % 12];

/** $1,234.56, or $1,235 when the cents are zero (whole-dollar rule). */
export function money(cents: number | null | undefined): string {
  if (cents == null) return "\u2014";
  const abs = Math.abs(cents);
  const whole = abs % 100 === 0;
  const text = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${cents < 0 ? "-" : ""}$${text}`;
}

/** Date-only strings (YYYY-MM-DD) are formatted without any Date/timezone conversion. */
export function dateOnly(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

const DENVER = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
/** Colorado calendar day for an instant. */
export function coloradoDay(value: string | Date): string {
  return DENVER.format(typeof value === "string" ? new Date(value) : value);
}
export const coloradoToday = () => coloradoDay(new Date());

export function dateTime(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const day = coloradoDay(value);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  return `${dateOnly(day)}, ${time}`;
}

export function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const m = /^(\d{3}): ([\s\S]*)$/.exec(raw);
  const body = m ? m[2] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch { /* plain text */ }
  return body || "Request failed";
}
export const errorStatus = (error: unknown): number | null => {
  const m = /^(\d{3}):/.exec(error instanceof Error ? error.message : "");
  return m ? Number(m[1]) : null;
};
