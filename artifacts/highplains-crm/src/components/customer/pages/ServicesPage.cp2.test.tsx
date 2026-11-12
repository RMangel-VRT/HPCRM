// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { customerServicesFixture, serviceRowFixture, serviceSeasonFixture } from "@/lib/contractCustomerServices.fixtures";
import ServicesPage from "./ServicesPage";
import { gapLink, accessFor, seasonOptionLabel } from "./services/ServiceParts";
import { serviceStatusLabel } from "@/lib/contractCustomerServices";

const fx = vi.hoisted(() => ({ data: {} as any, error: null as any, unavailable: false, loading: false, role: "admin", reset: vi.fn(), select: vi.fn(), term: undefined as string | undefined }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { accessRole: fx.role } }) }));
vi.mock("@/lib/customerScope", () => ({ useCustomerScope: () => ({ scope: ["company", "viewer"], enabled: false }) }));
vi.mock("@/hooks/useContractCustomerServices", () => ({
  useContractCustomerServices: () => ({ data: fx.data, error: fx.error, isLoading: fx.loading, unavailable: fx.unavailable, refetch: vi.fn() }),
  useServiceSeason: () => ({ scopeKey: "scope", termId: fx.term, selectTerm: fx.select, resetTerm: fx.reset }),
}));
vi.mock("@/hooks/useCustomerServices", () => ({ useCustomerServices: () => ({
  items: [{ id: "item1", campaignId: "round1", customerId: "customer1", customerName: "Example property",
    status: "completed", completedAt: "2026-05-12T12:00:00Z", currentStep: "work_completed",
    campaignTitle: "Spring irrigation", campaignCategory: "irrigation", campaignWindowStart: "2026-05-01", campaignWindowEnd: "2026-05-31" }],
  isLoading: false, error: null,
}) }));
beforeEach(async () => {
  await i18n.changeLanguage("en");
  fx.data = customerServicesFixture(); fx.error = null; fx.unavailable = false; fx.loading = false; fx.role = "admin"; fx.term = undefined;
  fx.reset.mockReset(); fx.select.mockReset();
});
afterEach(cleanup);
function page() { return render(<QueryClientProvider client={new QueryClient()}><ServicesPage customerId="customer1" parentName="Parent HOA" /></QueryClientProvider>); }
const rowButton = (key = "irrigation_activation") => within(screen.getByTestId(`row-service-${key}`)).getByRole("button");

describe("CP2 preserved details with CP6 contract demand", () => {
  it("shows server-supplied renewal state in collapsed rows and expanded rounds", () => {
    fx.data.rows[0].rounds[0].renewalPending = true;
    page();
    expect(screen.getByText("Renewal not entered")).toBeTruthy();
    fireEvent.click(rowButton());
    expect(screen.getAllByText("Renewal not entered")).toHaveLength(2);
  });
  it.each(["on_track", "complete", "closed_with_skips", "not_owed", "overdue", "missing_item",
    "waiting_on_signature", "no_route", "no_count", "needs_rounds", "legacy_chemical", "invalid_count", "duplicate_lines"])(
    "renders returned primary %s without replacing it with a secondary issue", status => {
      fx.data.rows = [serviceRowFixture({ status, issues: ["invalid_count", "waiting_on_signature"] })];
      page();
      expect(screen.getByTestId("status-service-irrigation_activation").textContent).toBe(serviceStatusLabel(status));
      if (status !== "invalid_count") expect(screen.getByTestId("chip-issue-irrigation_activation-invalid_count")).toBeTruthy();
      if (status !== "waiting_on_signature") expect(screen.getByTestId("chip-issue-irrigation_activation-waiting_on_signature")).toBeTruthy();
    });
  it("expands rounds and opens the existing real checklist panel with canonical links", async () => {
    page();
    fireEvent.click(rowButton());
    const round = screen.getByTestId("round-irrigation_activation-calendar1-2026");
    expect(round.textContent).toContain("Apr 1, 2026 – Apr 20, 2026");
    expect(round.textContent).toContain("Standard count");
    expect(round.textContent).toContain("Calendar timing");
    expect(within(round).getByText("Round", { selector: "a" }).getAttribute("href")).toBe("/dashboard/campaigns/round1");
    fireEvent.click(within(round).getByText("Item"));
    expect(await screen.findByTestId("checklist-item-detail-panel")).toBeDefined();
    expect(screen.getByTestId("panel-campaign-title").textContent).toBe("Spring irrigation");
    expect(screen.getByTestId("link-open-execution").closest("a")?.getAttribute("href")).toBe("/dashboard/campaigns/round1/items/item1");
  });
  it("renders ordered counts/null setup tiles and every secondary issue, without manual inflation", () => {
    fx.data = customerServicesFixture({
      rows: [serviceRowFixture({ skipped: 1, status: "overdue", issues: ["overdue", "no_route", "invalid_count"] }),
        serviceRowFixture({ serviceKey: "gap", label: "Gap", owed: null, remaining: null, status: "needs_rounds", issues: ["needs_rounds"] })],
      otherWork: [{ campaignId: "manual", itemId: "manual-item", title: "Hand-built special", status: "pending" }],
    });
    page();
    expect(screen.getByTestId("text-tile-count-irrigation_activation").textContent).toBe("1 / 2");
    expect(screen.getByTestId("text-service-counts-irrigation_activation").textContent).toBe("Owed 2 / Done 1 / Remaining 1");
    expect(screen.getByTestId("text-service-skipped-irrigation_activation").textContent).toBe("Skipped 1");
    const gap = screen.getByTestId("tile-service-gap");
    expect(gap.textContent).toContain("—"); expect(gap.textContent).toContain("More visits than calendar rounds");
    expect(gap.querySelector("[style]")).toBeNull();
    expect(screen.getByTestId("chip-issue-irrigation_activation-invalid_count")).toBeTruthy();
    expect(screen.getByTestId("chip-issue-irrigation_activation-no_route")).toBeTruthy();
    expect(screen.getByTestId("link-gap-gap-settings").getAttribute("href")).toBe("/dashboard/settings/service-calendar");
    expect(screen.getByTestId("services-summary").textContent).not.toContain("Hand-built");
    expect(screen.getByTestId("services-other-work").textContent).toContain("These never count");
    expect(screen.queryByTestId("services-retained")).toBeNull();
  });
  it("shows all round states, no broken missing-item links and chemical promise plus window", () => {
    const states = ["completed", "skipped", "pending", "overdue", "waiting_on_signature", "missing_item"] as const;
    fx.data.rows[0].rounds = states.map((state, index) => ({ ...fx.data.rows[0].rounds[0], calendarEntryId: `calendar${index + 1}`, state,
      itemId: state === "missing_item" ? null : "item1", dateKind: state === "pending" ? "chemical_promise" : "round_window" }));
    page(); fireEvent.keyDown(rowButton(), { key: "Enter" });
    for (const [index] of states.entries()) expect(screen.getByTestId(`status-round-irrigation_activation-calendar${index + 1}-2026`)).toBeTruthy();
    expect(screen.queryByTestId("button-round-item-irrigation_activation-calendar6-2026")).toBeNull();
    expect(screen.getByTestId("text-round-window-irrigation_activation-calendar3-2026").textContent).toContain("Window Apr 1");
    expect(screen.getByTestId("text-round-window-irrigation_activation-calendar3-2026").textContent).toContain("Promised Apr 20");
    expect(screen.getByTestId("text-service-next-irrigation_activation").textContent).toBe("Window opens Apr 7");
  });
  it("shows uncounted classes, manual history with no season, and retained only when supplied", () => {
    fx.data = customerServicesFixture({ rows: [], selectedTerm: null, availableTerms: [],
      otherWork: [{ campaignId: "manual", itemId: "manual-item", title: "Hand-built special", status: "skipped" }],
      retainedWork: [{ campaignId: "round1", itemId: "item1", serviceKey: "irrigation_activation", status: "completed" }] });
    page();
    expect(screen.getByTestId("services-no-season").textContent).toContain("No contract season for this property.");
    expect(screen.getByTestId("services-other-work").textContent).toContain("Hand-built special");
    expect(screen.getByTestId("services-retained").textContent).toContain("Spring irrigation");
    cleanup();
    fx.data = customerServicesFixture({ alsoInContract: [
      { serviceKey: "a", label: "Optional", scheduling: "on_request" }, { serviceKey: "b", label: "Winter", scheduling: "event" },
      { serviceKey: "c", label: "Pond", scheduling: "none" },
    ] });
    page();
    expect(screen.getByTestId("services-also-in-contract").textContent).toMatch(/On request.*Snow.*Not scheduled/);
  });
  it("keeps route drawer and gap links permission-bound and targets exact season", () => {
    expect(gapLink("no_count", serviceSeasonFixture, accessFor("admin"))).toBe("/dashboard/contracts/agreement1#term-term1");
    for (const status of ["invalid_count", "duplicate_lines"]) expect(gapLink(status, serviceSeasonFixture, accessFor("admin"))).toContain("#term-term1");
    expect(gapLink("needs_rounds", serviceSeasonFixture, accessFor("field"))).toBeNull();
    expect(gapLink("no_route", serviceSeasonFixture, accessFor("field"))).toBeNull();
    fx.data.rows = [serviceRowFixture({ scheduling: "route" })];
    page(); fireEvent.keyDown(rowButton(), { key: " " });
    expect(screen.getByTestId("link-route-visit").getAttribute("href")).toBe("/dashboard/routes");
  });
  it("renders inherited/sent season context and selecting an option requests explicit season", () => {
    const inherited = { ...serviceSeasonFixture, termId: "sent", status: "sent", parentCustomerId: "parent1" };
    expect(seasonOptionLabel(inherited, s => String(s), (key: string, o: any) => o.defaultValue.replace("{{name}}", o.name), "Parent HOA"))
      .toContain("via Parent HOA");
    fx.data.availableTerms.push(inherited);
    page(); fireEvent.click(screen.getByTestId("select-services-season"));
    fireEvent.click(screen.getByTestId("option-season-sent"));
    expect(fx.select).toHaveBeenCalledWith("sent");
  });
  it("handles denied/loading/error and resets only an explicit 404", async () => {
    fx.unavailable = true; page(); expect(screen.getByTestId("services-unavailable")).toBeTruthy(); cleanup();
    fx.unavailable = false; fx.loading = true; page(); expect(screen.getByTestId("services-skeleton")).toBeTruthy(); cleanup();
    fx.loading = false; fx.error = { status: 404 }; fx.term = "gone"; page();
    await waitFor(() => expect(fx.reset).toHaveBeenCalledTimes(1)); cleanup();
    fx.reset.mockClear(); fx.term = undefined; page();
    expect(screen.getByTestId("services-error")).toBeTruthy(); expect(fx.reset).not.toHaveBeenCalled();
    expect(screen.getByTestId("button-services-retry")).toBeTruthy();
  });
});
