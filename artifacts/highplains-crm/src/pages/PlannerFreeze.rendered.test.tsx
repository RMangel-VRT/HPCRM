// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: auth.role } }) }));
vi.mock("./WeeklySchedulerPage", () => ({ default: () => <div data-testid="planner-builder" /> }));
vi.mock("./ScheduleViewer", () => ({ default: () => <div data-testid="planner-viewer" /> }));
import SchedulePage from "./SchedulePage";
import CustomerSchedulingSection from "@/components/CustomerSchedulingSection";
import SchedulePreview from "@/components/SchedulePreview";

const MSG = "The Maintenance planner was replaced by Routes. This is a read-only record of the 2026 planner.";
const state = { imported: false };

beforeEach(() => {
  auth.role = "admin";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const json = (() => {
      if (url === "/api/planner/readiness") return { imported: state.imported, plannerReadOnly: state.imported, plannerMessage: MSG };
      if (url === "/api/planner/route-preview") return { imported: state.imported, stops: [{ id: "s1", customerId: "p1", name: "Current property", serviceKey: "mowing", crew: { id: "k1", name: "Crew 1" }, weekday: 4, everyWeeks: 2, minutes: 45 }] };
      if (url.endsWith("/route-summary")) return { imported: state.imported, stops: state.imported ? [{ id: "s1", serviceKey: "mowing", crew: { id: "k1", name: "Crew 1" }, weekday: 4, everyWeeks: 2, minutes: 45 }] : [] };
      if (url.includes("maintenance-config")) return null;
      return [];
    })();
    return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(cleanup);

it("replaces the dashboard's historical preview with live read-only route summaries", async () => {
  state.imported = true;
  wrap(<SchedulePreview />);
  expect(await screen.findByText("Current property")).toBeTruthy();
  expect(screen.getByText("Thursday")).toBeTruthy();
  expect(screen.getByText("Every 2 weeks")).toBeTruthy();
  expect(screen.getByText(MSG)).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("schedule-blocks"))).toBe(false);
});

function wrap(node: React.ReactNode) {
  const { hook } = memoryLocation({ path: "/dashboard/schedule" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(queryKey.join("/").replace(/\/\//g, "/"))).json() } } });
  return render(<QueryClientProvider client={qc}><Router hook={hook}>{node}</Router></QueryClientProvider>);
}

describe("legacy planner freeze is conditional on the company import marker", () => {
  it("not imported: editor remains, no banner", async () => {
    state.imported = false;
    wrap(<SchedulePage />);
    expect(await screen.findByTestId("planner-builder")).toBeTruthy();
    expect(screen.queryByTestId("banner-planner-replaced")).toBeNull();
  });
  it("imported: read-only viewer with the exact banner and Routes link", async () => {
    state.imported = true;
    wrap(<SchedulePage />);
    expect((await screen.findByTestId("banner-planner-replaced")).textContent).toContain(MSG);
    expect(screen.getByTestId("link-planner-routes").getAttribute("href")).toBe("/dashboard/routes");
    expect(screen.getByTestId("planner-viewer")).toBeTruthy();
    expect(screen.queryByTestId("planner-builder")).toBeNull();
    expect(screen.queryByTestId("tab-builder")).toBeNull();
  });
  it("irrigation manager sees the banner without a Routes link", async () => {
    state.imported = true; auth.role = "irrigation_manager";
    wrap(<SchedulePage />);
    await screen.findByTestId("banner-planner-replaced");
    expect(screen.queryByTestId("link-planner-routes")).toBeNull();
  });
});

describe("customer scheduling section", () => {
  it("imported: read-only route-stop summary", async () => {
    state.imported = true;
    wrap(<CustomerSchedulingSection customerId="cu1" />);
    const row = await screen.findByTestId("row-customer-route-s1");
    expect(row.textContent).toContain("Mowing");
    expect(row.textContent).toContain("Crew 1");
    expect(row.textContent).toContain("Thursday");
    expect(row.textContent).toContain("Every 2 weeks");
  });
  it("not imported: legacy section retained", async () => {
    state.imported = false;
    wrap(<CustomerSchedulingSection customerId="cu1" />);
    expect(await screen.findByText("Mowing Schedule Configuration")).toBeTruthy();
    expect(screen.queryByTestId("card-customer-routes")).toBeNull();
  });
});
