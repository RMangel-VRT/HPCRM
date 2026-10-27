// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import type { PulseResponse } from "@/components/dashboard/pulseTypes";

const auth = vi.hoisted(() => ({ role: "admin", superAdmin: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({
  user: { id: "u1", activeCompanyId: "c1", activeRole: auth.role, isSuperAdminBool: auth.superAdmin }, isLoading: false,
}) }));
vi.mock("@/components/SchedulePreview", () => ({ default: () => <div data-testid="schedule-preview" /> }));
vi.mock("@/components/dashboard/SectionRouter", () => ({ default: () => <section data-testid="section-router" /> }));
vi.mock("./SuperAdminDashboard", () => ({ default: () => <div>platform home</div> }));
vi.mock("./FieldHomeDashboard", () => ({ default: () => <div>field home</div> }));
import Dashboard from "./Dashboard";

const pulse: PulseResponse = {
  stats: { customersCount: 2, activeContractsCount: 3, monthlyRevenue: 10, ytdRevenue: 100 },
  revenue: { year: 2026, months: [], priorYear: 2025, priorMonths: [] },
  unbilledTicketCount: 4, avgDaysCloseToInvoice: null,
  activeSeason: { id: "active", name: "Maintenance", startDate: "2026-01-01", endDate: "2026-12-31" },
  nextSeason: { id: "next", name: "Snow", startDate: "2026-11-01" },
  snowBook: { activeSnowContracts: 40, expiringBeforeSeasonStart: 28 }, renewals: [],
  crewsToday: [{ crewId: "crew", crewName: "Crew", stops: 6, complete: 2, flagged: 1 }],
};
afterEach(async () => { cleanup(); auth.role = "admin"; auth.superAdmin = false; document.documentElement.className = ""; await i18n.changeLanguage("en"); });
function mount(queryFn = vi.fn(async (_context: unknown) => pulse)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn } } });
  render(<QueryClientProvider client={client}><Router hook={memoryLocation().hook}><Dashboard /></Router></QueryClientProvider>);
  return queryFn;
}
describe("full-width office dashboard", () => {
  it.each([["en", ""], ["es", ""], ["en", "dark"], ["es", "dark"]])("keeps command pulse integration without rail in %s / %s", async (lang, theme) => {
    await i18n.changeLanguage(lang);
    document.documentElement.className = theme;
    const query = mount();
    await screen.findByTestId("chip-snow-book");
    expect(query.mock.calls[0][0]).toMatchObject({ queryKey: ["/api/dashboard/pulse"] });
    expect(screen.getByTestId("chip-active-season-active").textContent).toContain("Maintenance");
    expect(screen.getByTestId("chip-next-season-next").textContent).toContain("Snow");
    expect(screen.getByTestId("chip-snow-book").textContent).toContain("40");
    expect(screen.getByTestId("chip-snow-book").textContent).toContain("28");
    expect(screen.getByTestId("command-crew-ticker").textContent).toContain("6");
    const router = screen.getByTestId("section-router");
    expect(router.previousElementSibling).toBe(screen.getByTestId("command-band"));
    expect(router.nextElementSibling).toBe(screen.getByTestId("schedule-preview"));
    expect(screen.queryByTestId("pulse-rail")).toBeNull();
    expect(screen.queryByTestId("pulse-rail-loading")).toBeNull();
    expect(router.parentElement?.className).not.toContain("grid");
  });
  it("keeps loading safe and existing role branches independent of pulse", () => {
    mount(vi.fn(() => new Promise(() => {})));
    expect(screen.getByTestId("section-router")).toBeTruthy();
    expect(screen.queryByTestId("chip-snow-book")).toBeNull();
  });
  it.each([["field", false, "field home"], ["admin", true, "platform home"]])("keeps %s branch unchanged", (role, superAdmin, text) => {
    auth.role = role; auth.superAdmin = superAdmin;
    const query = mount();
    expect(screen.getByText(text)).toBeTruthy();
    expect(query).not.toHaveBeenCalled();
  });
  it("retains endpoints and Revenue's existing chart chain", () => {
    const source = readFileSync("../api-server/src/routes/routes.ts", "utf8")
      + readFileSync("../api-server/src/routes/dashboardQueue.ts", "utf8");
    for (const endpoint of ["stats", "top-customers", "monthly-revenue", "pulse"]) {
      expect(source).toContain(`/api/dashboard/${endpoint}`);
    }
    expect(readFileSync("src/pages/RevenueOverview.tsx", "utf8")).toContain("RevenueMatrixPanel");
    expect(readFileSync("src/components/RevenueMatrixPanel.tsx", "utf8")).toContain("<RevenueChart year={year}");
    expect(readFileSync("src/components/RevenueChart.tsx", "utf8")).toContain("/api/dashboard/monthly-revenue");
  });
});
