// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import SettingsPage from "./SettingsPage";
import { apiRequest } from "@/lib/queryClient";
import i18n from "@/i18n";

const fx = vi.hoisted(() => ({
  user: { activeRole: "admin", isSuperAdminBool: false },
  settings: {
    companyName: "Test company",
    mowingSeasonMonths: ["Apr"],
    cleanupSeasonMonths: ["Oct"],
    featureFlags: JSON.stringify({ tickets_v2: true, forecast_v2: false, qbo_write: false }),
  },
  company: { pesticideLicenseNumber: "1" },
  isolateFeatures: false,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "/api/settings" ? fx.settings
      : queryKey[0] === "/api/qbo/connection" ? { status: "not_connected" }
      : queryKey[0] === "/api/company" ? fx.company : [],
    isLoading: false, refetch: vi.fn(),
  }),
}));
// Only isolate the body for permission tests; the real rail and normal selector
// remain unchanged, including the non-admin navigation regression below.
vi.mock("@/components/nav/settingsNav", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/nav/settingsNav")>();
  return {
    ...actual,
    settingsSectionFor: (...args: Parameters<typeof actual.settingsSectionFor>) =>
      fx.isolateFeatures ? "features" : actual.settingsSectionFor(...args),
  };
});
vi.mock("@/components/ServicePlanTemplatesAdmin", () => ({ default: () => null }));
vi.mock("@/components/ChemicalProductsAdmin", () => ({ default: () => null }));
vi.mock("@/pages/CrewsAdmin", () => ({ default: () => null }));
vi.mock("@/components/WorkItemTemplatesAdmin", () => ({ default: () => null }));
vi.mock("@/components/contracts/ContractSettings", () => ({ default: () => null }));
vi.mock("@/components/MigrationsAdmin", () => ({ default: () => null }));

const confirmation = "Customers waiting to send will be updated in QuickBooks within 15 minutes.";
let client: QueryClient;
function renderFeatures() {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const loc = memoryLocation({ path: "/dashboard/settings/features" });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={loc.hook}><SettingsPage /></Router>
    </QueryClientProvider>,
  );
}
function qboSwitch() {
  return screen.getByTestId("switch-qbo-write") as HTMLButtonElement;
}

beforeEach(async () => {
  fx.user = { activeRole: "admin", isSuperAdminBool: false };
  fx.isolateFeatures = false;
  fx.settings.featureFlags = JSON.stringify({ tickets_v2: true, forecast_v2: false, qbo_write: false });
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue(new Response("{}"));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  client?.clear();
  vi.restoreAllMocks();
});

describe("QuickBooks Write Access Features setting", () => {
  it.each([
    { activeRole: "admin", isSuperAdminBool: false },
    { activeRole: "office", isSuperAdminBool: true },
  ])("lets $activeRole with super-admin=$isSuperAdminBool confirm locally, then save all flags", async user => {
    fx.user = user;
    renderFeatures();
    expect(qboSwitch().disabled).toBe(false);
    expect(qboSwitch().getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Only admins can change this")).toBeNull();
    fireEvent.click(qboSwitch());
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(confirmation);
    expect(qboSwitch().getAttribute("aria-checked")).toBe("true");
    expect(apiRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("switch-forecast-v2"));
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-save-features"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/settings", {
      featureFlags: JSON.stringify({ tickets_v2: true, forecast_v2: true, qbo_write: true }),
    }));
  });

  it("keeps writes OFF on cancellation and saves the unchanged flag only on Save Changes", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderFeatures();
    fireEvent.click(qboSwitch());
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(confirmation);
    expect(qboSwitch().getAttribute("aria-checked")).toBe("false");
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-save-features"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/settings", {
      featureFlags: JSON.stringify({ tickets_v2: true, forecast_v2: false, qbo_write: false }),
    }));
  });

  it("turns saved writes OFF without confirmation or an immediate save", async () => {
    fx.settings.featureFlags = JSON.stringify({ tickets_v2: true, forecast_v2: false, qbo_write: true });
    renderFeatures();
    expect(qboSwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(qboSwitch());
    expect(qboSwitch().getAttribute("aria-checked")).toBe("false");
    expect(window.confirm).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-save-features"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledExactlyOnceWith("PATCH", "/api/settings", {
      featureFlags: JSON.stringify({ tickets_v2: true, forecast_v2: false, qbo_write: false }),
    }));
  });

  it.each([false, true])("disables the isolated non-admin switch when writes are %s", enabled => {
    fx.user = { activeRole: "office", isSuperAdminBool: false };
    fx.isolateFeatures = true;
    fx.settings.featureFlags = JSON.stringify({ tickets_v2: true, forecast_v2: false, qbo_write: enabled });
    renderFeatures();
    expect(qboSwitch().disabled).toBe(true);
    expect(screen.getByText("Only admins can change this", { exact: true })).toBeTruthy();
    fireEvent.click(qboSwitch());
    expect(qboSwitch().getAttribute("aria-checked")).toBe(String(enabled));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId("rail-features")).toBeNull();
  });

  it("still excludes Features from non-admin navigation and direct links", () => {
    fx.user = { activeRole: "office", isSuperAdminBool: false };
    renderFeatures();
    expect(screen.queryByTestId("rail-features")).toBeNull();
    expect(screen.queryByTestId("switch-qbo-write")).toBeNull();
    expect(screen.getByTestId("rail-property-management").getAttribute("aria-current")).toBe("page");
  });
});
