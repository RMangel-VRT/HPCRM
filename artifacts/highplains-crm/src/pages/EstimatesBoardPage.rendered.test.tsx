// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import EstimatesBoardPage from "./EstimatesBoardPage";
import { apiRequest } from "@/lib/queryClient";
import i18n from "@/i18n";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "admin" } }) }));
const styles = readFileSync("src/index.css", "utf8");
const board = { stages: ["new", "estimating", "proposal", "sent", "decision", "won"].map((key) => ({
  key, tickets: key === "new" ? [{ id: "t1", title: "Aspen Ridge bid", typeKey: "estimate_request", statusKey: "new", statusName: "New",
    customer: { id: "c", name: "Aspen Ridge HOA" }, assignee: null, owner: null, priority: "high", estimateNumber: "E-104", daysInStage: 8 }] : [] })) };
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(async () => ({ json: async () => board })) }));

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockImplementation(async () => ({ json: async () => board }) as Response);
  document.documentElement.className = "";
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
    expect(screen.getByTestId("column-won")).toBeTruthy();
  });
  it.each([
    ["en", "light"], ["en", "dark"], ["es", "light"], ["es", "dark"],
  ])("renders read-only Won destinations and keyboard links in %s / %s", async (lang, theme) => {
    await i18n.changeLanguage(lang);
    document.documentElement.className = theme === "dark" ? "dark" : "";
    const statuses = ["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing"];
    const tickets = statuses.map((statusKey, i) => {
      const sectionKey = i < 2 ? "scheduling" : "invoicing";
      return { ...board.stages[0].tickets[0], id: statusKey, statusKey, statusName: "Renamed status",
        owner: { sectionKey, label: `in ${sectionKey}`, href: `/dashboard/${sectionKey}` } };
    });
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({
      stages: [...board.stages.slice(0, 5), { key: "won", tickets }],
    }) } as Response);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const loc = memoryLocation({ path: "/dashboard/estimates", record: true });
    render(<QueryClientProvider client={client}><Router hook={loc.hook}><EstimatesBoardPage /></Router></QueryClientProvider>);
    await screen.findByTestId("card-bid-ready_to_schedule");
    const won = screen.getByTestId("column-won");
    expect(won.getAttribute("aria-label")).toBe(lang === "en" ? "Won — in flight" : "Ganado — en curso");
    expect(within(won).getByRole("heading").className).toContain("border-dashed");
    expect(within(won).getByRole("heading").className).toContain("text-muted-foreground");
    expect(won.className).toContain("opportunity-won");
    expect(styles).toContain(theme === "dark"
      ? ".dark .opportunity-won { --tt-project: #5eead4; }"
      : ".opportunity-won { --tt-project: #0f766e; }");
    expect(within(won).queryByRole("button")).toBeNull();
    for (const ticket of tickets) {
      const card = within(won).getByTestId(`card-bid-${ticket.id}`);
      expect(card.getAttribute("href")).toBe(ticket.owner.href);
      expect(card.textContent).toContain("Project");
      expect(card.textContent).toContain("Aspen Ridge HOA");
      expect(card.innerHTML).toContain("--tt-project");
      expect(card.getAttribute("style")).toContain("--tt-project");
      expect(card.className).not.toMatch(/hover|cursor-grab|rounded|shadow/);
      expect(card.className).toContain("border-b");
      expect(card.className).toContain("focus-visible:ring-2");
      expect(card.getAttribute("draggable")).toBeNull();
      expect(within(card).queryByTestId(`text-bid-days-${ticket.id}`)).toBeNull();
      expect(within(card).getByTestId(`owner-${ticket.id}`).textContent).toBe(i18n.t(`estimates.owner.${ticket.owner.sectionKey}`));
    }
    // Native links participate in keyboard navigation, while the active card retains
    // its ticket-detail destination and warning.
    const keyboard = userEvent.setup();
    const first = screen.getByTestId("card-bid-t1");
    first.focus();
    await keyboard.tab();
    expect(document.activeElement).toBe(screen.getByTestId("card-bid-ready_to_schedule"));
    await keyboard.keyboard("{Enter}");
    expect(loc.history?.at(-1)).toBe("/dashboard/scheduling");
    // A successful refresh after ready_for_billing -> invoicing removes that row.
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({
      stages: [...board.stages.slice(0, 5), { key: "won", tickets: tickets.slice(0, 3) }],
    }) } as Response);
    await act(async () => { await client.invalidateQueries({ queryKey: ["/api/estimates/board"] }); });
    await waitFor(() => expect(screen.queryByTestId("card-bid-ready_for_billing")).toBeNull());
    expect(screen.getByTestId("count-won").textContent).toBe("3");
    client.clear();
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
