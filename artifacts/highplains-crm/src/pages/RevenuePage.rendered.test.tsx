// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import { revenueIncomeFixture, revenueTargetsFixture, revenueTrendsFixture } from "@/components/revenue-v2/revenueFixtures";
import RevenuePage from "./RevenuePage";

const auth = vi.hoisted(() => ({
  user: { id: "user1", activeCompanyId: "company-a", accessRole: "admin" },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/schedulingStatus", () => ({ companyToday: () => "2026-11-23" }));

const year = 2026;
const accounts = [
  { qboAccountId: "1", name: "Maintenance", active: true, lastYearCents: 250_500, stream: "contract" },
  { qboAccountId: "2", name: "Miscellaneous", active: false, lastYearCents: -25_000, stream: null },
  { qboAccountId: "3", name: "Irrigation", active: true, lastYearCents: 88_000, stream: "irrigation" },
];
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const fetchMock = vi.fn<typeof fetch>();
const calls = (path: string, method?: string) => fetchMock.mock.calls.filter(([input, init]) =>
  String(input).startsWith(path) && (!method || init?.method === method));

function useFixture(options: {
  loaded?: boolean; targets?: boolean; connected?: boolean;
  respond?: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;
} = {}) {
  const { loaded = true, targets = false, connected = true, respond } = options;
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "https://test.invalid");
    const override = respond?.(url, init);
    if (override !== undefined) return override;
    switch (url.pathname) {
      case "/api/revenue/qbo/status":
        return response({ connected, unmappedCount: 0, years: Array.from({ length: loaded ? 6 : 0 }, (_, i) => (
          { year: year - i, fetchedAt: `${year}-11-18T13:01:00Z` }
        )) });
      case "/api/revenue/qbo/accounts": return response(init?.method === "PUT" ? { ok: true } : accounts);
      case "/api/revenue/qbo/refresh": return response({ year: JSON.parse(String(init?.body)).year, fetchedAt: `${year}-11-18T13:01:00Z` });
      case "/api/revenue/income/years": return response(revenueTrendsFixture(year));
      case "/api/revenue/income": {
        const selected = Number(url.searchParams.get("year"));
        return response(revenueIncomeFixture(selected, year, { targets, loaded: loaded && selected <= year }));
      }
      case "/api/revenue/plan/2027": return response({ goalCents: 115_000_000 });
      default:
        if (url.pathname.startsWith("/api/revenue/targets/")) return response(revenueTargetsFixture(Number(url.pathname.split("/").at(-1))));
        throw new Error(`Unexpected fixture request: ${url.pathname}`);
    }
  });
}

function mount(search = "") {
  const route = memoryLocation({ path: `/dashboard/revenue${search}`, record: true });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={cache}>
    <Router hook={route.hook} searchHook={route.searchHook}><RevenuePage /></Router>
  </QueryClientProvider>;
  return { ...render(tree()), route, cache, tree };
}

beforeEach(async () => {
  auth.user = { id: "user1", activeCompanyId: "company-a", accessRole: "admin" };
  await i18n.changeLanguage("en");
  vi.stubGlobal("fetch", fetchMock);
  useFixture();
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Revenue Income", () => {
  it("renders five streams with exactly five columns and opens Contract maintenance detail", async () => {
    const { container } = mount();
    const table = await screen.findByTestId("revenue-glance-streams");
    expect(table.querySelectorAll("thead th")).toHaveLength(5);
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(row.children).toHaveLength(5);
    expect(container.querySelectorAll("[data-testid^='revenue-target-tick']")).toHaveLength(0);
    fireEvent.click(within(table).getByRole("button", { name: /Contract maintenance/ }));
    const panel = await screen.findByRole("dialog");
    expect(panel.textContent).toContain("Contract maintenance");
    expect(panel.textContent).toMatch(/Earned/);
    expect(within(panel).getAllByRole("row").length).toBeGreaterThanOrEqual(12);
  });

  it("renders target ticks only for supplied targets, including a zero target", async () => {
    useFixture({ respond(url) {
      if (url.pathname === "/api/revenue/income") {
        const income = revenueIncomeFixture(year, year);
        income.streams.contract.targetCents = 0;
        income.totals.targetCents = 0;
        income.targetMonths = Array(12).fill(0);
        return response(income);
      }
      return undefined;
    } });
    mount();
    const table = await screen.findByTestId("revenue-glance-streams");
    expect(within(table).getAllByTestId(/^revenue-target-tick/)).toHaveLength(2);
  });

  it("shows the missing QuickBooks banner, and loads just the selected year for an admin", async () => {
    let loaded = false;
    useFixture({ loaded: false, respond(url, init) {
      if (url.pathname === "/api/revenue/income") return response(revenueIncomeFixture(2024, year, { loaded }));
      if (url.pathname === "/api/revenue/qbo/refresh") {
        expect(JSON.parse(String(init?.body))).toEqual({ year: 2024 });
        loaded = true;
      }
      return undefined;
    } });
    mount("?year=2024");
    expect((await screen.findByTestId("revenue-qbo-missing")).textContent).toContain("2024");
    fireEvent.click(await screen.findByTestId("button-revenue-qbo-load"));
    await screen.findByTestId("revenue-qbo-fresh");
    expect(screen.queryByTestId("revenue-qbo-missing")).toBeNull();
    expect(screen.getByTestId("button-revenue-qbo-refresh")).toBeTruthy();
  });

  it("keeps office out of Setup and never offers Load or Refresh", async () => {
    auth.user.accessRole = "office";
    useFixture({ loaded: false });
    const { route } = mount("?tab=accounts&year=2025");
    await screen.findByTestId("revenue-qbo-missing");
    expect(screen.getByTestId("rail-glance").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByTestId("rail-accounts")).toBeNull();
    expect(screen.queryByTestId("button-revenue-qbo-load")).toBeNull();
    expect(screen.queryByTestId("button-revenue-qbo-refresh")).toBeNull();
    expect(calls("/api/revenue/qbo/accounts")).toHaveLength(0);
    expect(route.history).toHaveLength(1);
  });

  it("preserves the URL year, tab and unrelated query parameters across navigation", async () => {
    const { route } = mount("?audit=review&year=2024");
    await screen.findByTestId("revenue-glance-streams");
    fireEvent.click(screen.getByTestId("rail-monthly"));
    await screen.findByTestId("revenue-month-grid");
    fireEvent.click(screen.getByTestId("button-revenue-year-2025"));
    await screen.findByTestId("revenue-month-grid");
    const url = new URL(route.history!.at(-1)!, "https://test.invalid");
    expect(Object.fromEntries(url.searchParams)).toEqual({ audit: "review", year: "2025", tab: "monthly" });
    expect(calls("/api/revenue/income?year=2025", "GET")).toHaveLength(1);
  });

  it("explains Monthly target and variance modes when no targets exist", async () => {
    mount("?tab=monthly");
    await screen.findByTestId("revenue-month-grid");
    fireEvent.click(screen.getByRole("button", { name: /^vs target$/i }));
    expect(await screen.findByText(/No target for 2026/i)).toBeTruthy();
    expect(screen.getByText(/Plan page/i)).toBeTruthy();
    expect(calls("/api/revenue/targets/")).toHaveLength(0);
  });

  it("uses the saved target grid in Monthly and colors variance by its sign", async () => {
    useFixture({ targets: true });
    mount("?tab=monthly");
    const grid = await screen.findByTestId("revenue-month-grid");
    expect(within(grid).getAllByRole("columnheader")).toHaveLength(14);
    expect(within(grid).getByTestId("row-month-running")).toBeTruthy();
    expect(within(grid).getByRole("columnheader", { name: /^Nov$/ }).getAttribute("aria-current")).toBe("date");
    fireEvent.click(screen.getByRole("button", { name: /^Target$/ }));
    expect(within(grid).queryByTestId("row-month-running")).toBeNull();
    expect(calls("/api/revenue/targets/2026", "GET")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^vs target$/i }));
    expect(grid.querySelector(".rv-pos")).not.toBeNull();
    expect(grid.querySelector(".rv-neg")).not.toBeNull();
  });

  it("loads five comparison years and no selected-year income for Year over year", async () => {
    mount("?tab=yoy&year=2024");
    await screen.findByTestId("revenue-seasonality");
    expect(calls("/api/revenue/income/years?from=2022&to=2026", "GET")).toHaveLength(1);
    expect(calls("/api/revenue/income?")).toHaveLength(0);
    expect(screen.queryByTestId("button-revenue-year-2024")).toBeNull();
    expect(screen.getByRole("columnheader", { name: /2026.*fcst/i })).toBeTruthy();
    expect(screen.getAllByTestId("seasonality-open-dot")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("button-season-snow"));
    expect(screen.getByTestId("button-season-snow").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps current open-month forecasts visible without plotting unloaded closed months", async () => {
    useFixture({ loaded: false });
    mount("?tab=yoy");
    await screen.findByTestId("seasonality-partial");
    expect(screen.getByTestId("seasonality-missing-2025")).toBeTruthy();
    const current = screen.getByTestId("seasonality-line-2026");
    expect(current.querySelectorAll("circle")).toHaveLength(2);
    expect(within(current).getAllByTestId("seasonality-open-dot")).toHaveLength(2);
  });

  it("shows next year's server plan goal without the current-year risk section", async () => {
    mount("?year=2027");
    expect((await screen.findByTestId("revenue-card-target")).textContent).toMatch(/Goal.*\$1,150,000/);
    expect(screen.getByTestId("revenue-card-earned").textContent).toContain("Already signed");
    expect(screen.queryByTestId("revenue-risk")).toBeNull();
    expect(screen.queryByTestId("revenue-qbo-missing")).toBeNull();
  });

  it("does not reuse the old company's scoped Revenue data on switch", async () => {
    const view = mount();
    await screen.findByTestId("revenue-glance-streams");
    auth.user.activeCompanyId = "company-b";
    view.rerender(view.tree());
    await screen.findByTestId("revenue-glance-streams");
    const requests = calls("/api/revenue/income?year=");
    expect(requests.map(([, init]) => new Headers(init?.headers).get("X-Company-Id"))).toEqual(["company-a", "company-b"]);
  });
});

describe("Revenue QuickBooks Setup", () => {
  it("sorts unassigned first and saves only changed accounts, sending null when cleared", async () => {
    let saved = false;
    useFixture({ respond(url, init) {
      if (url.pathname !== "/api/revenue/qbo/accounts") return;
      if (init?.method === "PUT") { saved = true; return response({ ok: true }); }
      if (saved) return response(accounts.map(row => row.qboAccountId === "1" ? { ...row, stream: null } : row));
      return undefined;
    } });
    mount("?tab=accounts");
    const table = await screen.findByTestId("revenue-account-table");
    expect(table.querySelector("tbody tr")?.getAttribute("data-testid")).toBe("revenue-account-2");
    const save = screen.getByTestId("button-revenue-save-mappings") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("select-revenue-account-1"), { target: { value: "unassigned" } });
    fireEvent.change(screen.getByTestId("select-revenue-account-2"), { target: { value: "extra" } });
    fireEvent.change(screen.getByTestId("select-revenue-account-2"), { target: { value: "unassigned" } });
    fireEvent.click(save);
    await screen.findByText("Account mappings saved.");
    const [[, write]] = calls("/api/revenue/qbo/accounts", "PUT");
    expect(JSON.parse(String(write?.body))).toEqual([{ qboAccountId: "1", stream: null }]);
    expect(new Headers(write?.headers).get("X-Company-Id")).toBe("company-a");
    expect(save.disabled).toBe(true);
  });

  it("runs year refreshes in sequence and keeps per-year failures visible", async () => {
    let release!: (value: Response) => void;
    useFixture({ respond(url, init) {
      if (url.pathname !== "/api/revenue/qbo/refresh") return;
      const { year: y } = JSON.parse(String(init?.body));
      if (y === 2026) return new Promise<Response>(resolve => { release = resolve; });
      if (y === 2025) return response({ message: "Provider error" }, 502);
      return undefined;
    } });
    mount("?tab=accounts");
    fireEvent.change(await screen.findByTestId("select-revenue-history-years"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("button-revenue-load-history"));
    await waitFor(() => expect(calls("/api/revenue/qbo/refresh", "POST")).toHaveLength(1));
    expect(screen.getByTestId("revenue-refresh-result-2025").textContent).toContain("Waiting");
    release(response({ year: 2026, fetchedAt: "2026-11-24T12:00:00Z" }));
    await waitFor(() => expect(screen.getByTestId("revenue-refresh-result-2024").textContent).toContain("Loaded"));
    expect(screen.getByTestId("revenue-refresh-result-2025").textContent).toContain("Couldn't load this year");
    expect(calls("/api/revenue/qbo/refresh", "POST").map(([, req]) => [
      JSON.parse(String(req?.body)).year, new Headers(req?.headers).get("X-Company-Id"),
    ])).toEqual([[2026, "company-a"], [2025, "company-a"], [2024, "company-a"]]);
  });

  it("stops queued refreshes when the server reports a company switch", async () => {
    useFixture({ respond(url) {
      return url.pathname === "/api/revenue/qbo/refresh" ? response({ message: "Company changed" }, 409) : undefined;
    } });
    mount("?tab=accounts");
    fireEvent.click(await screen.findByTestId("button-revenue-load-history"));
    await screen.findByText("Active company changed. Reload and try again.");
    expect(screen.getByTestId("revenue-refresh-result-2025").textContent).toContain("Not started");
    expect(calls("/api/revenue/qbo/refresh", "POST")).toHaveLength(1);
  });

  it("offers Settings instead of history when disconnected, with stored mappings still editable", async () => {
    useFixture({ connected: false });
    mount("?tab=accounts");
    expect((await screen.findByTestId("link-revenue-setup-connect")).getAttribute("href")).toBe("/dashboard/settings/features");
    expect(screen.queryByTestId("button-revenue-load-history")).toBeNull();
    await screen.findByTestId("revenue-account-table");
    expect(screen.queryByText("Inactive")).toBeNull();
    expect(calls("/api/revenue/qbo/accounts", "GET")).toHaveLength(1);
  });
});
