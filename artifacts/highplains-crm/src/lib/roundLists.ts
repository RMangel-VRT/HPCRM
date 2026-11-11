// Pure helpers consume projections of the generated OpenAPI contract, not a
// separately maintained response definition.
import type { CampaignRound, CampaignRoundTeam, CampaignRoundItem, CampaignRoundLists,
  CampaignRoundCalendar, CampaignRoundCalendarRoundsItem, CampaignRoundCalendarChemicalItemsItem } from "@workspace/api-client-react";

export type RoundTeam = Pick<CampaignRoundTeam, "id" | "crewId" | "name" | "color"> & Partial<Pick<CampaignRoundTeam, "leaderUserId">>;
export type RoundItem = Pick<CampaignRoundItem, "id" | "customerName" | "status" | "assignedCampaignCrewId" | "crewPosition"> &
  Partial<Pick<CampaignRoundItem, "targetDate" | "backupDate" | "customerCity" | "customerAddress">>;
export type RoundListsResponse = Omit<CampaignRoundLists, "campaign" | "teams" | "items"> & {
  campaign: Pick<CampaignRound, "id" | "title" | "category" | "source" | "windowStart" | "windowEnd" | "startedAt" | "status">;
  teams: RoundTeam[]; items: RoundItem[];
};
export interface StandingCrew { id: string; name: string; color?: string; isActive?: boolean; active?: boolean }

export const isOpenItem = (i: { status?: unknown }) => i.status === "pending";

const parse = (ymd: string) => { const [y, m, d] = ymd.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** Mon–Sat days from `from` through `through`, inclusive. Colorado calendar dates (no time math). */
export function workingDaysInclusive(from: string, through: string): number {
  if (!from || !through) return 0;
  let n = 0;
  for (let d = parse(from); d <= parse(through); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() !== 0) n++;
  return n;
}

/** Remaining work per remaining working day; null when the window has no working days left. */
export function pacePerDay(remaining: number, today: string, windowEnd: string): number | null {
  const start = windowEnd && today ? today : "";
  const days = workingDaysInclusive(start, windowEnd);
  if (days <= 0) return null;
  return Math.round((remaining / days) * 10) / 10;
}

export interface Lane { key: string; team: RoundTeam | null; open: RoundItem[]; closed: RoundItem[] }

const byPos = (a: RoundItem, b: RoundItem) =>
  (a.crewPosition ?? Number.MAX_SAFE_INTEGER) - (b.crewPosition ?? Number.MAX_SAFE_INTEGER) || a.customerName.localeCompare(b.customerName);

/** Unassigned lane first, then each team; closed work is kept outside the priority order. */
export function buildLanes(items: RoundItem[], teams: RoundTeam[]): Lane[] {
  const lanes: Lane[] = [{ key: "unassigned", team: null, open: [], closed: [] }, ...teams.map(t => ({ key: t.id, team: t, open: [] as RoundItem[], closed: [] as RoundItem[] }))];
  const map = new Map(lanes.map(l => [l.key, l]));
  for (const i of items) {
    const lane = map.get(i.assignedCampaignCrewId ?? "unassigned") ?? map.get("unassigned")!;
    (isOpenItem(i) ? lane.open : lane.closed).push(i);
  }
  for (const l of lanes) { l.open.sort(byPos); l.closed.sort((a, b) => a.customerName.localeCompare(b.customerName)); }
  return lanes;
}

/** beforeItemId for moving one item one step within its lane. undefined = no-op. */
export function stepTarget(open: RoundItem[], id: string, dir: -1 | 1): string | null | undefined {
  const i = open.findIndex(x => x.id === id);
  if (i < 0) return undefined;
  if (dir === -1) return i === 0 ? undefined : open[i - 1].id;
  if (i === open.length - 1) return undefined;
  return open[i + 2]?.id ?? null;
}

/** Keep the lane's visible order for a multi-selection. */
export function orderSelection(lanes: Lane[], selected: ReadonlySet<string>): string[] {
  return lanes.flatMap(l => l.open.filter(i => selected.has(i.id)).map(i => i.id));
}

export function startWarnings(items: RoundItem[], teams: RoundTeam[], crews: StandingCrew[] | undefined) {
  const activeIds = new Set((crews ?? []).filter(c => c.isActive !== false && c.active !== false).map(c => c.id));
  return {
    unassigned: items.filter(i => isOpenItem(i) && !i.assignedCampaignCrewId).length,
    unlinkedTeams: teams.filter(t => !t.crewId || (crews ? !activeIds.has(t.crewId) : false)).map(t => t.name),
  };
}

/* ---------------------------------------------------------------- scheduling */
export type CalendarRound = Pick<CampaignRoundCalendarRoundsItem, "id" | "title" | "windowStart" | "windowEnd" | "startedAt" | "status" | "unassigned" | "remaining"> & { teams: RoundTeam[] };
export type CalendarChemItem = Pick<CampaignRoundCalendarChemicalItemsItem, "id" | "campaignId" | "customerName" | "targetDate" | "backupDate" | "assignedCampaignCrewId" | "crewId" | "status">;
export type RoundCalendar = Omit<CampaignRoundCalendar, "rounds" | "chemicalItems"> & { rounds: CalendarRound[]; chemicalItems: CalendarChemItem[] };

/** 1-based grid column span of a window clipped to visible days; null when not visible. */
export function windowSpan(days: string[], start: string, end: string): { col: number; span: number } | null {
  const s = start.slice(0, 10), e = end.slice(0, 10);
  const idx = days.map((d, i) => (d >= s && d <= e ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return null;
  return { col: idx[0] + 1, span: idx[idx.length - 1] - idx[0] + 1 };
}

export { fmt as ymd };
