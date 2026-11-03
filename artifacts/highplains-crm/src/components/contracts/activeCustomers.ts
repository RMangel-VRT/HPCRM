import type { ActiveCustomerFlag, ActiveCustomerRow, LineState } from "../../../../../lib/db/src/activeCustomers";

export type ActiveCard = "responsible" | ActiveCustomerFlag | "noContract";
export type LineFilter = "all" | "landscape" | "snow";
export const CARD_ORDER: ActiveCard[] = ["responsible", "ending_soon", "lapsed", "should_fall_off", "starting_soon", "mismatch", "noContract"];
export const cardTestId = (c: ActiveCard) => `card-${c === "noContract" ? "no-contract" : c.replace(/_/g, "-")}`;

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Calendar-only rendering, with month names and order owned by the locale. */
export function activeCustomerDate(value: string | null | undefined, t: T): string {
  if (!value) return "\u2014";
  const [year, month, day] = value.split("-");
  return t("activeCustomers.date", { year, month: t(`activeCustomers.months.${Number(month)}`), day: Number(day) });
}

export function lineText(line: LineState, t: T, row?: Pick<ActiveCustomerRow, "viaParent" | "parentName">): string {
  const note = line.note ? ` · ${t(`activeCustomers.note.${line.note}`)}` : "";
  let text: string;
  switch (line.state) {
    case "in_effect": text = t("activeCustomers.state.in_effect", { date: activeCustomerDate(line.endDate, t) }) + note; break;
    case "starting": text = t("activeCustomers.state.starting", { date: activeCustomerDate(line.startDate, t) }); break;
    case "lapsed": case "ended": text = t("activeCustomers.state.ended", { date: activeCustomerDate(line.endDate, t) }) + note; break;
    default: return "\u2014";
  }
  return row?.viaParent && row.parentName ? `${text} · ${t("activeCustomers.through", { parent: row.parentName })}` : text;
}

export type Tone = "green" | "amber" | "muted" | "blue" | "none";
export function lineTone(line: LineState, flags: string[], asOf: string): Tone {
  const days = line.endDate ? (Date.parse(`${line.endDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000 : Infinity;
  if (line.state === "in_effect") return line.note === "not_renewing" ||
    (flags.includes("ending_soon") && days >= 0 && days <= 30 && line.note !== "renewed") ? "amber" : "green";
  if (line.state === "lapsed") return "amber";
  if (line.state === "starting") return "blue";
  if (line.state === "ended") return "muted";
  return "none";
}

export const lineHref = (line: LineState) =>
  line.agreementId && line.seasonId ? `/dashboard/contracts/${line.agreementId}#term-${line.seasonId}` : null;

export function matchesCard(row: ActiveCustomerRow, card: ActiveCard | null, lineFilter: LineFilter): boolean {
  if (!card) return true;
  if (card === "noContract") return !!row.noContract;
  if (card === "responsible") {
    if (lineFilter === "landscape") return row.landscape.state === "in_effect";
    if (lineFilter === "snow") return row.snow.state === "in_effect";
    return row.responsible;
  }
  return row.flags.includes(card);
}

export function visibleRows(rows: ActiveCustomerRow[], card: ActiveCard | null, lineFilter: LineFilter, q: string): ActiveCustomerRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter(r => {
    if (needle && !r.customerName.toLowerCase().includes(needle)) return false;
    if (lineFilter !== "all" && r[lineFilter].state === "none") return false;
    return matchesCard(r, card, lineFilter);
  });
}

/** Quote a CSV cell and neutralise spreadsheet formulas. */
export function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: ActiveCustomerRow[], t: T): string {
  const head = ["customer", "status", "agent", "landscape", "snow", "flags"].map(k => t(`activeCustomers.csv.${k}`));
  const lines = rows.map(r => [
    r.customerName, t(`activeCustomers.status.${r.customerStatus}`), r.managingAgentName ?? "",
    lineText(r.landscape, t, r), lineText(r.snow, t, r),
    [...r.flags.map(f => t(`activeCustomers.flag.${f}`)), ...(r.noContract ? [t("activeCustomers.flag.noContract")] : [])].join("; "),
  ]);
  return [head, ...lines].map(cols => cols.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Last ended date across both lines, for the confirm copy. */
export function lastEnded(row: ActiveCustomerRow): string | null {
  const ends = [row.landscape.endDate, row.snow.endDate].filter((d): d is string => !!d).sort();
  return ends.length ? ends[ends.length - 1] : null;
}
