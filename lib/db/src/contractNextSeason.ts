import { isNotRenewing, type NonRenewalFacts } from "./contractNonRenewal";

export interface NextSeasonTerm extends NonRenewalFacts {
  id: string; seasonLabel: string; startDate: string; endDate: string; status: string;
  renewedFromTermId?: string | null;
  line?: string;
}
type IncomingSeason = Pick<NextSeasonTerm, "seasonLabel" | "startDate" | "endDate">;
export interface NextSeasonConflict {
  code: "noSource" | "notRenewing" | "pending" | "overlap" | "start";
  message: string; source?: string; season?: string; other?: string; status?: string;
}
/** The caller supplies the canonical selectRenewalSource result, never the displayed current season. */
export function nextSeasonConflict(source: NextSeasonTerm | undefined, terms: NextSeasonTerm[], incoming: IncomingSeason[]): NextSeasonConflict | null {
  if (!source) return { code: "noSource", message: "This contract has no season to renew." };
  const values = { source: source.seasonLabel };
  if (isNotRenewing(source)) return { code: "notRenewing", ...values, message: `Undo Not renewing on ${source.seasonLabel} first.` };
  const pending = terms.find(t => t.renewedFromTermId === source.id && ["draft", "sent"].includes(t.status));
  if (pending) return { code: "pending", ...values, status: pending.status,
    message: `${source.seasonLabel} already has a ${pending.status} renewal. Cancel it or use it instead.` };
  for (const season of incoming) {
    const overlap = terms.filter(t => !["cancelled", "lost"].includes(t.status))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
      .find(t => season.startDate <= t.endDate && t.startDate <= season.endDate);
    if (overlap) return { code: "overlap", season: season.seasonLabel, other: overlap.seasonLabel,
      message: `${season.seasonLabel} overlaps ${overlap.seasonLabel}.` };
  }
  const first = [...incoming].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (first && first.startDate <= source.startDate) return { code: "start", ...values, season: first.seasonLabel,
    message: `${first.seasonLabel} must start after ${source.seasonLabel}.` };
  return null;
}
/** Latest non-closed season controls matching, not current coverage or parent inheritance. */
export function latestMatchingSeason<T extends NextSeasonTerm>(terms: T[]) {
  return terms.filter(t => !["cancelled", "lost"].includes(t.status))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0];
}
export function matchesNewContract(agreement: { state?: string; notRenewing?: boolean }, latest: { line?: string } | undefined, line: string) {
  return !!latest && !agreement.notRenewing &&
    !["closed", "closed_recently", "lost", "not_renewing", "serving_not_renewing"].includes(agreement.state ?? "") &&
    (latest.line === line || latest.line === "both" || line === "both");
}
