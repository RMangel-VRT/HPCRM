// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SettingsRailLayout } from "@/components/nav/SettingsRailLayout";
import SettingsPage from "./SettingsPage";
import i18n from "@/i18n";

const fx = vi.hoisted(() => ({
  user: { activeRole: "admin", isSuperAdminBool: false },
  settings: { companyName: "Test company", mowingSeasonMonths: ["Apr", "May"], cleanupSeasonMonths: ["Oct"] },
  seasons: [{ id: "season-one", name: "A season record" }],
  company: { pesticideLicenseNumber: "1" },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(), queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "/api/settings" ? fx.settings
      : queryKey[0] === "/api/seasons" ? fx.seasons
      : queryKey[0] === "/api/qbo/connection" ? { status: "not_connected" }
      : queryKey[0] === "/api/company" ? fx.company : [],
    isLoading: false, refetch: vi.fn(),
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/ServicePlanTemplatesAdmin", () => ({ default: () => <p>Service plan body</p> }));
vi.mock("@/components/ChemicalProductsAdmin", () => ({ default: () => <p>Chemical product body</p> }));
vi.mock("@/pages/CrewsAdmin", () => ({ default: () => <p>Crew body</p> }));
vi.mock("@/components/WorkItemTemplatesAdmin", () => ({ default: () => <p>Work item body</p> }));
vi.mock("@/components/contracts/ContractSettings", () => ({ default: () => <p>Contract body</p> }));
vi.mock("@/components/MigrationsAdmin", () => ({ default: () => <p>Database body</p> }));

beforeEach(async () => {
  fx.user = { activeRole: "admin", isSuperAdminBool: false };
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("URL-driven Settings bodies", () => {
  it("opens Benchmarks directly, with no mount-only tab state", () => {
    const loc = memoryLocation({ path: "/dashboard/settings/benchmarks" });
    render(<Router hook={loc.hook}><SettingsPage /></Router>);
    expect(screen.getByTestId("rail-benchmarks").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("button-save-benchmarks")).toBeTruthy();
    expect(screen.queryByTestId("button-save-company")).toBeNull();
  });
  it("pushes navigation and follows browser Back and Forward on the same mounted page", async () => {
    window.history.replaceState({}, "", "/dashboard/settings/company");
    render(<Router><SettingsPage /></Router>);
    fireEvent.click(screen.getByTestId("rail-benchmarks"));
    expect(window.location.pathname).toBe("/dashboard/settings/benchmarks");
    expect(screen.getByTestId("button-save-benchmarks")).toBeTruthy();
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByTestId("rail-company").getAttribute("aria-current")).toBe("page"));
    expect(window.location.pathname).toBe("/dashboard/settings/company");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByTestId("rail-benchmarks").getAttribute("aria-current")).toBe("page"));
    expect(screen.getByTestId("button-save-benchmarks")).toBeTruthy();
  });
  it.each(["/dashboard/settings", "/dashboard/settings/not-a-section"])("admin defaults to Company at %s", path => {
    const loc = memoryLocation({ path });
    render(<Router hook={loc.hook}><SettingsPage /></Router>);
    expect(screen.getByTestId("rail-company").getAttribute("aria-current")).toBe("page");
  });
  it("office contracts deep link and role changes fall back to Property managers", () => {
    const loc = memoryLocation({ path: "/dashboard/settings/contracts" });
    const view = render(<Router hook={loc.hook}><SettingsPage /></Router>);
    expect(screen.getByText("Contract body")).toBeTruthy();
    fx.user.activeRole = "office";
    view.rerender(<Router hook={loc.hook}><SettingsPage /></Router>);
    expect(screen.queryByText("Contract body")).toBeNull();
    expect(screen.getByTestId("rail-property-management").getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link").filter(a => a.getAttribute("data-testid")?.startsWith("rail-"))).toHaveLength(1);
  });
  it("co-locates months and independent season records with create and real detail links", () => {
    const loc = memoryLocation({ path: "/dashboard/settings/seasons" });
    render(<Router hook={loc.hook}><SettingsPage /></Router>);
    expect(screen.getByText("Service months")).toBeTruthy();
    expect(screen.getByText("Season records")).toBeTruthy();
    expect(screen.getByTestId("button-save-seasons")).toBeTruthy();
    expect(screen.getByTestId("badge-mowing-apr")).toBeTruthy();
    expect(screen.getByTestId("button-create-season")).toBeTruthy();
    expect(screen.getByRole("link", { name: "A season record" }).getAttribute("href")).toBe("/dashboard/seasons/season-one");
    expect(screen.queryByTestId("link-season-records")).toBeNull();
    fireEvent.click(screen.getByTestId("button-create-season"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("input-season-name")).toBeTruthy();
  });
  it("QuickBooks billing remains reachable on the rail with its original body, not a tab trigger", () => {
    const loc = memoryLocation({ path: "/dashboard/settings/company", record: true });
    render(<Router hook={loc.hook}><SettingsPage /></Router>);
    fireEvent.click(screen.getByTestId("rail-billing"));
    expect(loc.history).toEqual(["/dashboard/settings/company", "/dashboard/settings/billing"]);
    expect(screen.getByTestId("rail-billing").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByTestId("tab-billing")).toBeNull();
    expect(screen.getAllByText("Billing", { exact: true })).toHaveLength(2);
    expect(screen.getByTestId("rail-qbo-customers").getAttribute("href")).toBe("/dashboard/settings/qbo-customers");
    fireEvent.click(screen.getByTestId("rail-features"));
    expect(screen.getByTestId("button-qbo-connect")).toBeTruthy();
  });
});

describe("shared standalone Settings chrome", () => {
  it.each(["notification-templates", "shared-mailboxes", "qbo-customers"])("marks %s active", activeKey => {
    render(<Router><SettingsRailLayout activeKey={activeKey}><p>Standalone body</p></SettingsRailLayout></Router>);
    expect(screen.getByTestId(`rail-${activeKey}`).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Standalone body")).toBeTruthy();
  });
});
