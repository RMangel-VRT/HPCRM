import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { standingCrewFormSchema, insertCampaignCrewSchema } from "../shared/schema";
const fixtures = vi.hoisted(() => ({ crews: [] as any[], teams: [] as any[] }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "/api/crews/setup" ? { teams: fixtures.teams } : queryKey[0] === "/api/crews" ? fixtures.crews : [],
    isLoading: false,
  }),
}));
import CrewsAdmin from "./CrewsAdmin";
const render = () => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><CrewsAdmin /></QueryClientProvider>);
beforeEach(() => { fixtures.crews = []; fixtures.teams = []; });
describe("standing crew settings and campaign-only setup", () => {
  it("shows standing fields and order without retired controls", () => {
    fixtures.crews = [{ id: "s", name: "North", isActive: true, color: "#16a34a", defaultHoursPerDay: 0, campaignTeamCount: 1 }];
    const html = render();
    expect(html).toContain("Hours/day");
    expect(html).not.toMatch(/planner/i);
    expect(html).toContain('aria-label="Move North up"');
    expect(html).toContain('aria-label="Move North down"');
  });
  it("keeps setup for unlinked campaign teams", () => {
    fixtures.teams = [{ id: "t", campaignId: "c", campaignTitle: "Spring", name: "Team", color: "#123456" }];
    expect(render()).toContain("Campaign team");
    expect(render()).toContain("Create crew from this");
  });
  it("preserves zero hours and explicit clearing", () => {
    const body = { name: "North", supervisorUserId: "u", isActive: true, color: null, defaultHoursPerDay: 0, displayOrder: 2 };
    expect(standingCrewFormSchema.parse(body)).toEqual(body);
  });
  it.each([-1, 25])("rejects %i hours", defaultHoursPerDay => {
    expect(standingCrewFormSchema.safeParse({ name: "North", supervisorUserId: "u", defaultHoursPerDay }).success).toBe(false);
  });
  it("preserves campaign selection, leader and explicit None", () => {
    for (const crewId of ["s", null])
      expect(insertCampaignCrewSchema.parse({ name: "Team", leaderUserId: "u", crewId })).toMatchObject({ name: "Team", leaderUserId: "u", crewId });
  });
});
