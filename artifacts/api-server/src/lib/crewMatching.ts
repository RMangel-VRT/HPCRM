/** Pure proposal shared by the guarded linker and the read-only dry run. */
export interface StandingMatch {
  id: string; companyId: string; name: string; supervisorUserId: string; isActive: boolean;
}
export interface PlannerMatch {
  id: string; companyId: string; name: string; crewId: string | null;
}
export interface TeamMatch {
  id: string; companyId: string; leaderUserId: string; crewId: string | null;
}
export function proposeCrewLinks(standing: StandingMatch[], planner: PlannerMatch[], teams: TeamMatch[]) {
  const plannerLinks: Array<{ id: string; crewId: string }> = [];
  const campaignLinks: Array<{ id: string; crewId: string }> = [];
  const counters = new Map<string, { plannerLinked: number; ambiguous: number; unmatched: number; campaignLinked: number; campaignUnmatched: number }>();
  const claimed = new Set(planner.flatMap(p => p.crewId ? [p.crewId] : []));
  const names = new Map<string, StandingMatch[]>();
  const supervisors = new Map<string, StandingMatch[]>();
  const key = (company: string, value: string) => JSON.stringify([company, value]);
  for (const crew of standing.filter(c => c.isActive)) {
    for (const [map, value] of [[names, crew.name.trim().toLowerCase()], [supervisors, crew.supervisorUserId]] as const) {
      const k = key(crew.companyId, value);
      map.set(k, [...(map.get(k) ?? []), crew]);
    }
  }
  const count = (company: string) => {
    if (!counters.has(company)) counters.set(company, { plannerLinked: 0, ambiguous: 0, unmatched: 0, campaignLinked: 0, campaignUnmatched: 0 });
    return counters.get(company)!;
  };
  // Stable order makes competing planner rows deterministic; never steal a target.
  for (const p of [...planner].sort((a,b) => a.id.localeCompare(b.id))) {
    const c = count(p.companyId);
    if (p.crewId) continue;
    const matches = names.get(key(p.companyId, p.name.trim().toLowerCase())) ?? [];
    if (matches.length > 1) c.ambiguous++;
    else if (matches.length === 1 && !claimed.has(matches[0].id)) {
      plannerLinks.push({ id: p.id, crewId: matches[0].id });
      claimed.add(matches[0].id);
      c.plannerLinked++;
    } else c.unmatched++;
  }
  for (const t of teams) {
    const c = count(t.companyId);
    if (t.crewId) continue;
    const matches = supervisors.get(key(t.companyId, t.leaderUserId)) ?? [];
    if (matches.length === 1) {
      campaignLinks.push({ id: t.id, crewId: matches[0].id });
      c.campaignLinked++;
    } else c.campaignUnmatched++;
  }
  return { plannerLinks, campaignLinks, counters };
}
