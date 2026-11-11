// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContractCustomerServices, useServiceSeason } from "./useContractCustomerServices";
import { customerServicesFixture } from "@/lib/contractCustomerServices.fixtures";
import ServicesPage from "@/components/customer/pages/ServicesPage";
import "@/i18n";

const fx = vi.hoisted(() => ({ user: { id: "viewer", activeRole: "admin", accessRole: "admin", activeCompanyId: "co1" }, fetch: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fx.user = { id: "viewer", activeRole: "admin", accessRole: "admin", activeCompanyId: "co1" };
  fx.fetch.mockReset().mockImplementation(async () => new Response(JSON.stringify(customerServicesFixture()), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fx.fetch);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe("CP6 generated helper boundary", () => {
  it("omits default term, includes explicit term and binds initiating company/viewer/role keys", async () => {
    const { result, rerender } = renderHook(({ term }) => useContractCustomerServices("c1", term), { wrapper, initialProps: { term: undefined as string | undefined } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fx.fetch.mock.calls[0][0]).toBe("/api/customers/c1/services");
    expect(new Headers(fx.fetch.mock.calls[0][1].headers).get("X-Company-Id")).toBe("co1");
    expect(result.current.queryKey).toEqual(["/api/customers", "c1", "services", "co1", "viewer", "admin", "admin", "default"]);
    rerender({ term: "other" });
    await waitFor(() => expect(fx.fetch.mock.calls.some(([url]) => url === "/api/customers/c1/services?termId=other")).toBe(true));
    expect(result.current.queryKey.at(-1)).toBe("other");
  });
  it("does not reuse old-company data or a pending response after switching context", async () => {
    let resolveOld!: (v: Response) => void;
    fx.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(() => useContractCustomerServices("c1"), { wrapper });
    await waitFor(() => expect(fx.fetch).toHaveBeenCalledTimes(1));
    fx.user = { ...fx.user, activeCompanyId: "co2", id: "new-viewer", activeRole: "office", accessRole: "office" };
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBeDefined());
    resolveOld(new Response(JSON.stringify(customerServicesFixture({ customerId: "old" })), { headers: { "Content-Type": "application/json" } }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data?.customerId).not.toBe("old");
    expect(new Headers(fx.fetch.mock.calls[1][1].headers).get("X-Company-Id")).toBe("co2");
  });
  it("disables absent property/parent requests and shows 403 without retries", async () => {
    const disabled = renderHook(() => useContractCustomerServices(undefined), { wrapper });
    expect(fx.fetch).not.toHaveBeenCalled(); disabled.unmount();
    fx.fetch.mockResolvedValue(new Response("{}", { status: 403, headers: { "Content-Type": "application/json" } }));
    const { result } = renderHook(() => useContractCustomerServices("c1"), { wrapper });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fx.fetch).toHaveBeenCalledTimes(1);
  });
  it("resets explicit season before requesting a new property, company or role", () => {
    const { result, rerender } = renderHook(({ id }) => useServiceSeason(id), { initialProps: { id: "c1" } });
    act(() => result.current.selectTerm("term"));
    expect(result.current.termId).toBe("term");
    rerender({ id: "c2" }); expect(result.current.termId).toBeUndefined();
    act(() => result.current.selectTerm("term2"));
    fx.user = { ...fx.user, activeCompanyId: "co2" }; rerender({ id: "c2" });
    expect(result.current.termId).toBeUndefined();
    act(() => result.current.selectTerm("term3"));
    fx.user = { ...fx.user, activeRole: "office" }; rerender({ id: "c2" });
    expect(result.current.termId).toBeUndefined();
  });
  it("recovers a disappeared explicit season exactly once and keeps the dashboard default independent", async () => {
    const data = customerServicesFixture();
    data.availableTerms.push({ ...data.availableTerms[0], termId: "gone", label: "Disappeared season" });
    fx.fetch.mockImplementation(async (url: string) => url.includes("termId=gone")
      ? new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
    render(<ServicesPage customerId="c1" />, { wrapper });
    await screen.findByTestId("services-page");
    fireEvent.click(screen.getByTestId("select-services-season"));
    fireEvent.click(screen.getByTestId("option-season-gone"));
    await waitFor(() => expect(fx.fetch.mock.calls.filter(([url]) => url.includes("termId=gone"))).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("services-page")).toBeTruthy());
    expect(screen.getByTestId("select-services-season").textContent).toContain("Landscape 2026");
    expect(fx.fetch.mock.calls.filter(([url]) => url.includes("termId=gone"))).toHaveLength(1);
    const { result } = renderHook(() => useContractCustomerServices("c1"), { wrapper });
    await waitFor(() => expect(result.current.data?.selectedTerm?.termId).toBe("term1"));
    expect(result.current.queryKey.at(-1)).toBe("default");
  });
});
