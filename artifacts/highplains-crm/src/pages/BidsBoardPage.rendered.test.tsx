// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import BidsBoardPage from "./BidsBoardPage";
import EstimatesBoardPage from "./EstimatesBoardPage";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "admin" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
const configs = [
  { name: "bids", Page: BidsBoardPage, keys: ["new", "reviewing", "walk", "proposal", "submitted", "decision"], type: "rfp_request" },
  { name: "estimates", Page: EstimatesBoardPage, keys: ["new", "estimating", "proposal", "sent", "decision"], type: "estimate_request" },
];
afterEach(async () => { cleanup(); vi.resetAllMocks(); document.documentElement.className = ""; await i18n.changeLanguage("en"); });

describe.each(configs)("$name shared rendering", ({ name, Page, keys, type }) => {
  function mount() {
    return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={memoryLocation({ path: `/dashboard/${name}` }).hook}><Page /></Router>
    </QueryClientProvider>);
  }
  it.each(["en", "es"])("uses independent %s labels and shared identity, warnings and links", async lang => {
    await i18n.changeLanguage(lang);
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({ stages: keys.map(key => ({
      key, tickets: key === "new" ? [{
        id: "one", title: "Opportunity", typeKey: type, statusName: "Renamed", statusKey: "new",
        customer: null, assignee: null, priority: "high", estimateNumber: null, daysInStage: 7,
      }] : [],
    })) }) } as Response);
    mount();
    const card = await screen.findByTestId("card-bid-one");
    expect(card.getAttribute("href")).toBe("/dashboard/tickets/one");
    expect(screen.getByTestId("text-bid-days-one").getAttribute("data-warn")).toBe("true");
    expect(screen.getByText(i18n.t(`${name}.typeLabel`))).toBeTruthy();
    for (const key of keys) expect(screen.getByRole("region", { name: i18n.t(`${name}.stage.${key}`) })).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith("GET", `/api/${name}/board`);
    expect(screen.queryByTestId("rail-rfp_request")).toBeNull();
    expect(screen.getByTestId(`${name}-board`).className).toContain("overflow-x-auto");
  });
  it("shows loading, then empty columns", async () => {
    let release!: (value: Response) => void;
    vi.mocked(apiRequest).mockReturnValue(new Promise(resolve => { release = resolve; }));
    mount();
    expect(screen.getAllByRole("status")).toHaveLength(keys.length);
    release({ json: async () => ({ stages: [] }) } as Response);
    await waitFor(() => expect(screen.getAllByText(i18n.t(`${name}.empty`))).toHaveLength(keys.length));
  });
  it("retries a failed board and recovers without fabricated zeros", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue({ json: async () => ({ stages: [] }) } as Response);
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByTestId(`${name}-board`)).toBeNull();
    fireEvent.click(screen.getByTestId(`button-${name}-retry`));
    await screen.findByTestId(`${name}-board`);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
