import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
const fx = vi.hoisted(() => ({ user: { id: "viewer", activeRole: "admin", activeCompanyId: "company" } as any,
  queries: [] as any[], result: {} as any, api: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (s: string) => s, i18n: { language: "en" } }) }));
vi.mock("@/lib/queryClient", async original => ({ ...await original<any>(), apiRequest: fx.api }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => { fx.queries.push(o); return { isLoading: false, ...fx.result }; },
}));
import { CustomerContracts } from "@/components/contracts/CustomerContracts";
const current = { agreementId: "a", termId: "term", label: "2026–27", line: "both", startDate: "2026-10-01", endDate: "2027-09-30",
  annualCents: 1353600, snowPricing: "flat_rate", snowTriggers: "" };
const render = () => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
  <Router ssrPath="/dashboard/customers/customer"><CustomerContracts customerId="customer"><p>Legacy forbidden</p></CustomerContracts></Router>
</QueryClientProvider>);
beforeEach(() => {
  fx.user = { id: "viewer", activeRole: "admin", activeCompanyId: "company" }; fx.queries = [];
  fx.result = { data: { current: [current], previous: [], upcoming: [], coverage: { landscape: true, snow: true } } };
  fx.api.mockReset().mockResolvedValue({ json: async () => ({}) });
});
describe("customer Contract Center-only cards", () => {
  it.each(["admin", "office", "account_manager"])("shows current agreement data for %s and never mounts legacy children", role => {
    fx.user.activeRole = role;
    const html = render();
    expect(html).toContain("2026–27"); expect(html).toContain("13,536.00");
    expect(html).toContain("/dashboard/contracts/a#term-term");
    expect(html).not.toContain("Legacy forbidden"); expect(html).not.toContain("old-system-contracts");
    expect(html).toContain("cp1.notStated");
  });
  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "crew_supervisor"])("does not mount commercial cards for %s", role => {
    fx.user.activeRole = role; expect(render()).toBe("");
  });
  it("keys by company and viewer identity and sends a bound request", async () => {
    render(); const q = fx.queries[0];
    expect(q.queryKey).toEqual(["/api/customers", "customer", "contract-summary", "company", "viewer", "admin"]);
    await q.queryFn({});
    expect(fx.api).toHaveBeenCalledWith("GET", "/api/customers/customer/contract-summary", undefined,
      { headers: { "X-Company-Id": "company" }, signal: undefined });
    fx.user.activeCompanyId = "other"; fx.queries = []; render();
    expect(fx.queries[0].queryKey).toContain("other");
  });
  it("keeps current empty instead of substituting historical or upcoming agreements", () => {
    fx.result.data = { ...fx.result.data, current: [], previous: [current], upcoming: [{ ...current, termId: "future" }] };
    const html = render();
    expect(html).toContain("cp1.noContract"); expect(html).toContain("cp1.previous"); expect(html).toContain("cp1.upcoming");
  });
  it("shows errors without fabricated empty-contract success", () => {
    fx.result = { error: new Error("failed") };
    expect(render()).toContain("cp1.loadFailed");
    expect(render()).not.toContain("cp1.noContract");
  });
});
