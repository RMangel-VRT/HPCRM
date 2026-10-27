// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import EstimatesBoardPage from "./EstimatesBoardPage";
import { apiRequest } from "@/lib/queryClient";
import i18n from "@/i18n";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "admin" } }) }));
const board = { stages: ["new", "estimating", "proposal", "sent", "decision"].map((key) => ({
  key, tickets: key === "new" ? [{ id: "t1", title: "Aspen Ridge bid", typeKey: "estimate_request", statusKey: "new", statusName: "New",
    customer: { id: "c", name: "Aspen Ridge HOA" }, assignee: null, priority: "high", estimateNumber: "E-104", daysInStage: 8 }] : [] })) };
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(async () => ({ json: async () => board })) }));

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});

describe("EstimatesBoardPage", () => {
  it("renders columns, card link and warning", async () => {
    const { hook } = memoryLocation({ path: "/dashboard/estimates" });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Router hook={hook}><EstimatesBoardPage /></Router>
      </QueryClientProvider>,
    );
    const card = await screen.findByTestId("card-bid-t1");
    expect(card.getAttribute("href")).toContain("/dashboard/tickets/t1");
    expect(screen.getByTestId("text-bid-days-t1").getAttribute("data-warn")).toBe("true");
    expect(screen.getByTestId("count-new").textContent).toBe("1");
    expect(screen.getByTestId("column-decision")).toBeTruthy();
  });
  it.each([
    ["", "/api/estimates/board", "all"],
    ["?type=estimate_request", "/api/estimates/board", "all"],
    ["?type=rfp_request", "/api/estimates/board", "all"],
    ["?type=invalid", "/api/estimates/board", "all"],
  ])("uses the URL filter %s for API and active rail", async (search, url, key) => {
    const loc = memoryLocation({ path: "/dashboard/estimates" });
    render(<QueryClientProvider client={new QueryClient()}>
      <Router hook={loc.hook} searchHook={() => search}><EstimatesBoardPage /></Router>
    </QueryClientProvider>);
    await screen.findByTestId("card-bid-t1");
    expect(apiRequest).toHaveBeenCalledWith("GET", url);
    expect(screen.getByTestId(`rail-${key}`).getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("estimates-board").className).toContain("overflow-x-auto");
  });
  it("translates stages, filters, types, priority, warning and empty columns into Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<QueryClientProvider client={new QueryClient()}>
      <Router hook={memoryLocation({ path: "/dashboard/estimates" }).hook}><EstimatesBoardPage /></Router>
    </QueryClientProvider>);
    await screen.findByTestId("card-bid-t1");
    expect(screen.getByText("Todos los estimados")).toBeTruthy();
    expect(screen.getByText("Decisión")).toBeTruthy();
    expect(screen.getByText("Solicitud de estimado")).toBeTruthy();
    expect(screen.getByText("Prioridad: Alta")).toBeTruthy();
    expect(screen.getByText("8 días")).toBeTruthy();
    expect(screen.getAllByText("No hay estimados abiertos.")).toHaveLength(4);
  });
  it("shows an explicit error rather than a false empty board", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Failed"));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={memoryLocation({ path: "/dashboard/estimates" }).hook}><EstimatesBoardPage /></Router>
    </QueryClientProvider>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("button-estimates-retry")).toBeTruthy();
    expect(screen.queryByTestId("estimates-board")).toBeNull();
  });
});
