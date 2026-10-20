// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

const fx = vi.hoisted(() => ({ typesLoaded: false, customersLoaded: true, api: vi.fn() }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-leaflet", () => ({
  MapContainer: () => null, TileLayer: () => null, Marker: () => null,
  useMapEvents: () => {}, useMap: () => ({ setView: () => {} }),
}));
vi.mock("@/lib/queryClient", async original => ({
  ...await original<typeof import("@/lib/queryClient")>(),
  apiRequest: fx.api,
}));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "/api/ticket-types"
      ? fx.typesLoaded ? [
        { id: "task", typeKey: "task", isActive: "true" },
        { id: "todo", typeKey: "todo", isActive: "true" },
        { id: "estimate", typeKey: "estimate_request", isActive: "true" },
      ] : undefined
      : queryKey[0] === "/api/customers"
        ? fx.customersLoaded ? { customers: [{ id: "customer", name: "Test property" }], total: 1 } : undefined
        : [],
    isSuccess: queryKey[0] === "/api/ticket-types" ? fx.typesLoaded : fx.customersLoaded,
  }),
}));
import "@/i18n";
import NewTicket from "./NewTicket";

beforeEach(() => {
  fx.typesLoaded = false;
  fx.customersLoaded = true;
  fx.api.mockReset();
  window.history.replaceState({}, "", "/dashboard/tickets/new");
});
afterEach(cleanup);

function mount(search: string) {
  window.history.replaceState({}, "", `/dashboard/tickets/new${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => <QueryClientProvider client={client}><Router><NewTicket /></Router></QueryClientProvider>;
  const result = render(ui());
  return () => result.rerender(ui());
}

describe("New menu work-type deep links", () => {
  it.each(["contract", "extra_work", "admin", "estimate_request", "shop_todo"])("preselects %s once after types load, retaining customerId", async workType => {
    const rerender = mount(`?workType=${workType}&customerId=customer`);
    expect(screen.queryByTestId("input-title")).toBeNull();
    fx.typesLoaded = true;
    rerender();
    const title = await screen.findByTestId("input-title");
    expect(screen.queryByTestId("card-worktype-contract")).toBeNull();
    if (workType !== "shop_todo") expect(screen.getByText("Test property")).toBeTruthy();
    fireEvent.change(title, { target: { value: "Keep my edits" } });
    fx.typesLoaded = false;
    rerender();
    fx.typesLoaded = true;
    rerender();
    await waitFor(() => expect((screen.getByTestId("input-title") as HTMLInputElement).value).toBe("Keep my edits"));
    expect(fx.api).not.toHaveBeenCalled();
  });
  it("waits for customer data before selecting the existing customer path", async () => {
    fx.typesLoaded = true;
    fx.customersLoaded = false;
    const rerender = mount("?workType=contract&customerId=customer");
    expect(screen.getByTestId("card-worktype-contract")).toBeTruthy();
    fx.customersLoaded = true;
    rerender();
    expect(await screen.findByTestId("input-title")).toBeTruthy();
    expect(screen.getByText("Test property")).toBeTruthy();
  });
  it.each(["bogus", "invoice", "rfp_request", ""])("ignores unsupported query %s", async workType => {
    fx.typesLoaded = true;
    mount(`?workType=${workType}`);
    await act(async () => {});
    expect(screen.getByTestId("card-worktype-contract")).toBeTruthy();
    expect(screen.queryByTestId("input-title")).toBeNull();
  });
  it("uses customer selection when no customerId was supplied", async () => {
    fx.typesLoaded = true;
    mount("?workType=extra_work");
    expect(await screen.findByTestId("card-select-customer")).toBeTruthy();
    expect(screen.getByText("Billable")).toBeTruthy();
  });
});
