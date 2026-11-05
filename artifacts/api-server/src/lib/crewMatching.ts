/** Pure campaign-team proposal. Identity is always owned by standing crews. */
export interface StandingMatch {
  id: string; companyId: string; name: string; supervisorUserId: string; isActive: boolean;
}
export interface TeamMatch {
  id: string; companyId: string; leaderUserId: string; crewId: string | null;
}
export function proposeCrewLinks(standing: StandingMatch[], teams: TeamMatch[]) {
  const campaignLinks: Array<{ id: string; crewId: string }> = [];
  const supervisors = new Map<string, StandingMatch[]>();
  const key = (company: string, value: string) => JSON.stringify([company, value]);
  for (const crew of standing.filter(c => c.isActive)) {
    const k = key(crew.companyId, crew.supervisorUserId);
    supervisors.set(k, [...(supervisors.get(k) ?? []), crew]);
  }
  for (const t of teams) {
    if (t.crewId) continue;
    const matches = supervisors.get(key(t.companyId, t.leaderUserId)) ?? [];
    if (matches.length === 1) campaignLinks.push({ id: t.id, crewId: matches[0].id });
  }
  return { campaignLinks };
}
