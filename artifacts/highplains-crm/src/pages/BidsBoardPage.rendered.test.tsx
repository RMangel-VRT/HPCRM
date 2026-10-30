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
  { name: "estimates", Page: EstimatesBoardPage, keys: ["new", "estimating", "proposal", "sent", "decision", "won"], type: "estimate_request" },
];
afterEach(async () => { cleanup(); vi.resetAllMocks(); document.documentElement.className = ""; await i18n.changeLanguage("en"); });

describe.each(configs)("$name shared rendering", ({ name, Page, keys, type }) => {
  function mount() {
    return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={memoryLocation({ path: `/dashboard/${name}` }).hook}><Page /></Router>
    </QueryClientProvider>);
  }
  it.each(["light", "dark"])("resolves approved display identity with matching rails in %s", async theme => {
    document.documentElement.className = theme === "dark" ? "dark" : "";
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({ stages: [{
      key: "decision", tickets: [{
        id: "raw", title: "Opportunity", typeKey: type, statusKey: "scheduled", statusName: "Unexpected",
        customer: null, assignee: null, priority: "normal", estimateNumber: null, daysInStage: 0,
      }],
    }] }) } as Response);
    mount();
    const card = await screen.findByTestId("card-bid-raw");
    const token = type === "estimate_request" ? "--tt-project" : "--tt-rfp";
    expect(card.innerHTML).toContain(token);
    expect(card.getAttribute("style")).toContain(token);
    expect(card.textContent).toContain(type === "estimate_request" ? "Project" : i18n.t(`${name}.typeLabel`));
    if (name === "bids") {
      expect(card.innerHTML).not.toContain("--tt-project");
      expect(screen.queryByTestId("column-won")).toBeNull();
    }
  });
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
    if (name === "estimates") expect(apiRequest).toHaveBeenCalledWith("GET", `/api/${name}/board`, undefined, { headers: { "X-Company-Id": "c1" } });
    else expect(apiRequest).toHaveBeenCalledWith("GET", `/api/${name}/board`);
    expect(screen.queryByTestId("rail-rfp_request")).toBeNull();
    expect(screen.getByTestId(`${name}-board`).className).toContain("overflow-x-auto");
  });
  it("shows loading, then empty columns", async () => {
    let release!: (value: Response) => void;
    vi.mocked(apiRequest).mockReturnValue(new Promise(resolve => { release = resolve; }));
    mount();
    expect(screen.getAllByRole("status")).toHaveLength(keys.length);
    release({ json: async () => ({ stages: [] }) } as Response);
    await waitFor(() => expect(screen.getAllByText(i18n.t(`${name}.empty`))).toHaveLength(name === "estimates" ? 5 : 6));
    if (name === "estimates") expect(screen.getByTestId("empty-won").textContent).toBe(i18n.t("estimates.emptyWon"));
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
  it.each(["en", "es"])("renders linked contracts and narrow create eligibility in %s", async lang => {
    await i18n.changeLanguage(lang);
    const ticket = (id: string, statusKey: string, contracts: any[] = []) => ({
      id, title: id, typeKey: type, statusKey, statusName: statusKey, customer: null, assignee: null,
      priority: "normal", estimateNumber: null, daysInStage: 0, contracts,
    });
    const contract = { agreementId: "agreement", termId: "term", customerName: "Branch", line: "both",
      form: "ours", seasonLabel: "2027", displayStatus: "sent", annualPriceCents: 4151500, snowPricing: "time_and_materials" };
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({ stages: [{
      key: "proposal", tickets: [ticket("with-contract", "proposal_draft", [contract, { ...contract, termId: "snow", line: "snow" }]),
        ticket("create", "proposal_draft"), ticket("early", "new"), ticket("later", "proposal_sent")],
    }] }) } as Response);
    mount();
    await screen.findByTestId("card-bid-create");
    if (name === "bids") {
      expect(screen.getByTestId("rfp-contract-term").getAttribute("href")).toBe("/dashboard/contracts/agreement");
      expect(screen.getByText("$41,515")).toBeTruthy();
      expect(screen.getByText(i18n.t("rfpContracts.tm"))).toBeTruthy();
      expect(screen.getAllByTestId("pill-status-sent")[0].textContent).toContain(i18n.t("rfpContracts.status.sent"));
      expect(screen.getByTestId("create-contract-create").getAttribute("href")).toBe("/dashboard/contracts/new?fromRfp=create");
      expect(screen.queryByTestId("create-contract-with-contract")).toBeNull();
      expect(screen.queryByTestId("create-contract-early")).toBeNull();
      expect(screen.queryByTestId("create-contract-later")).toBeNull();
      expect(screen.getByTestId("rfp-contract-term").closest("[data-testid='card-bid-with-contract']")).toBeNull();
    } else {
      expect(screen.queryByTestId("rfp-contract-term")).toBeNull();
      expect(screen.queryByTestId("create-contract-create")).toBeNull();
    }
  });
});
