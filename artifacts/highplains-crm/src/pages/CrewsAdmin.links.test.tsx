import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { standingCrewFormSchema, insertCampaignCrewSchema, insertMaintenanceCrewSchema } from "../shared/schema";

const fixtures = vi.hoisted(() => ({ crews: [] as any[], planners: [] as any[] }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "/api/maintenance-crews" ? fixtures.planners : queryKey[0] === "/api/crews" ? fixtures.crews : [],
    isLoading: false,
  }),
}));
import CrewsAdmin from "./CrewsAdmin";
const render = () => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><CrewsAdmin /></QueryClientProvider>);
beforeEach(() => { fixtures.crews = []; fixtures.planners = []; });

describe("standing crew settings and form payloads", () => {
  it("shows color, hours/day, planner link and up/down controls", () => {
    fixtures.crews = [{ id: "s", name: "North", isActive: true, color: "#16a34a", defaultHoursPerDay: 0, plannerCrew: { id: "p", name: "Planner North" } }];
    const html = render();
    expect(html).toContain("Hours/day");
    expect(html).toContain("Planner North");
    expect(html).toContain("background-color:#16a34a");
    expect(html).toContain('aria-label="Move North up"');
    expect(html).toContain('aria-label="Move North down"');
    expect(html).toContain("<td");
  });
  it("counts only active unlinked planner crews with the exact actionable warning", () => {
    fixtures.planners = [
      { id: "p", name: "First", isActive: true, crewId: null },
      { id: "p2", name: "Second", isActive: true, crewId: null },
      { id: "p3", name: "Inactive", isActive: false, crewId: null },
      { id: "p4", name: "Linked", isActive: true, crewId: "s" },
    ];
    expect(render()).toContain("2 planner crews aren&#x27;t linked to a crew yet. They won&#x27;t appear on the Scheduling board.");
    expect(render()).toContain('role="alert"');
  });
  it("does not show the warning when all active planners are linked", () => {
    fixtures.planners = [{ id: "p", name: "Linked", isActive: true, crewId: "s" }];
    expect(render()).not.toContain('role="alert"');
  });
  it("preserves new standing fields, including zero hours and explicit clearing", () => {
    const body = { name: "North", supervisorUserId: "u", isActive: true, color: "#123456", defaultHoursPerDay: 0, displayOrder: 2, plannerCrewId: null };
    expect(standingCrewFormSchema.parse(body)).toEqual(body);
  });
  it.each([-1, 25])("rejects %i hours", hours => {
    expect(standingCrewFormSchema.safeParse({ name: "North", supervisorUserId: "u", defaultHoursPerDay: hours }).success).toBe(false);
  });
  it("client stub preserves campaign selection, leader and name, including auto-link/null", () => {
    for (const crewId of ["s", null]) {
      expect(insertCampaignCrewSchema.parse({ name: "Team", leaderUserId: "u", crewId })).toMatchObject({ name: "Team", leaderUserId: "u", crewId });
    }
  });
  it("client stub preserves planner links and current payload fields", () => {
    const body = { name: "Planner", crewId: "s", isActive: true, color: "#16a34a", defaultHoursPerDay: 6 };
    expect(insertMaintenanceCrewSchema.parse(body)).toEqual(body);
  });
});
