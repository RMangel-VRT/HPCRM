// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CustomerLocationEditor from "./CustomerLocationEditor";

const fx = vi.hoisted(() => ({ write: vi.fn(async () => ({})) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/customerScope", () => ({ useCustomerScope: () => ({ request: fx.write }) }));
vi.mock("mapbox-gl", () => ({ default: {
  accessToken: "", Map: class { constructor() { throw new Error("Failed to initialize WebGL"); } },
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(canEdit: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["/api/config/mapbox-token"], { token: "public-test-token" });
  return render(<QueryClientProvider client={client}>
    <CustomerLocationEditor customer={{ id: "property", locationLat: 40, locationLng: -105 } as any}
      canEdit={canEdit} autoEdit={canEdit} />
  </QueryClientProvider>);
}
describe("CP2 location editor without WebGL", () => {
  it("reports map failure and permits valid coordinate editing without throwing", async () => {
    mount(true);
    expect(await screen.findByTestId("location-map-unavailable")).toBeDefined();
    const latitude = screen.getByTestId("input-location-latitude");
    fireEvent.change(latitude, { target: { value: "95" } });
    expect((screen.getByTestId("button-save-location") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(latitude, { target: { value: "40.25" } });
    fireEvent.click(screen.getByTestId("button-save-location"));
    await vi.waitFor(() => expect(fx.write).toHaveBeenCalledWith("PATCH", "/api/customers/property",
      { locationLat: 40.25, locationLng: -105 }));
  });
  it("never exposes coordinate mutation inputs to read-only readers", async () => {
    mount(false);
    expect(await screen.findByTestId("location-map-unavailable")).toBeDefined();
    expect(screen.queryByTestId("input-location-latitude")).toBeNull();
    expect(screen.queryByTestId("button-save-location")).toBeNull();
    expect(fx.write).not.toHaveBeenCalled();
  });
});
