// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({ api: vi.fn(), term: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u", activeCompanyId: "co", activeRole: "field_manager" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/components/qbo/QboCustomerCard", () => ({ default: () => null }));
const rate = (rateKey: string, o: Record<string, unknown> = {}) => ({ rateKey, line: "landscape", label: rateKey, unit: "hour", minimum: null, priceCents: 8500, priceText: null, ...o });
vi.mock("@/hooks/useCustomerContractSummary", () => ({
  useCustomerContractSummary: () => ({ isLoading: false, error: null, data: { current: [{
    termId: "t1", agreementId: "a1", label: "2026", line: "landscape", startDate: "2026-01-01", endDate: "2026-12-31", billingMonths: [],
    rates: [rate("irrigation_labor", { line: "irrigation", cardPriceCents: 8000 }), rate("custom_mobilization", { line: "general", minimum: "One visit", priceCents: 3995 }), rate("general_labor", { priceCents: 7500, cardPriceCents: 7500 })],
    standardRates: [rate("skid_loader", { priceCents: 12500 })],
    ...fx.term,
  }], upcoming: [], previous: [] } }),
}));
import BillingPage from "@/components/customer/pages/BillingPage";

afterEach(() => { cleanup(); fx.api.mockReset(); fx.term = null; });

describe("Customer Billing Revenue fee separation", () => {
  it("shows fees independently of a null T&M contract value", () => {
    fx.term = { annualCents: null, snowPricing: "time_and_materials", feesAnnualCents: 47940,
      billingMonths: [{ month: "2026-01-01", component: "Mobilization", amountCents: 3995, isFee: true }] };
    render(<QueryClientProvider client={new QueryClient()}><BillingPage customerId="c1" isParent={false} view="revenue" onViewChange={() => undefined} canEditCustomer={false} /></QueryClientProvider>);
    expect(screen.getByTestId("kpi-contract-term").textContent).not.toContain("$0");
    expect(screen.getByTestId("kpi-fees").textContent).toContain("$479.40");
    expect(screen.getByTestId("kpi-fee-names").textContent).toBe("Mobilization");
  });
  it("uses the explicit annual fee window and shows full-term contract total separately", () => {
    fx.term = { paymentSchedule: "explicit", annualCents: 4151500, feesAnnualCents: 7990,
      startDate: "2026-04-01", endDate: "2027-09-30", durationMonths: 18, contractTotalCents: 7103000,
      billingMonths: [
        { month: "2026-03-01", component: "Mobilization", amountCents: 10000, isFee: true },
        { month: "2026-04-01", component: "Mobilization", amountCents: 7990, isFee: true },
        { month: "2027-05-01", component: "Mobilization", amountCents: 10000, isFee: true },
      ] };
    render(<QueryClientProvider client={new QueryClient()}><BillingPage customerId="c1" isParent={false} view="revenue" onViewChange={() => undefined} canEditCustomer={false} /></QueryClientProvider>);
    expect(screen.getByTestId("kpi-contract-term").textContent).toContain("$41,515");
    expect(screen.getByTestId("kpi-contract-total").textContent).toContain("$71,030");
    expect(screen.getByTestId("kpi-contract-total").textContent).toContain("18 months");
    expect(screen.getByTestId("kpi-fees").textContent).toContain("$79.90");
  });
});

describe("Customer Billing rates (CC2-17)", () => {
  it("shows the stated rows with card notes and a collapsed standard section from the summary, without fetching the rate card", () => {
    render(<QueryClientProvider client={new QueryClient()}><BillingPage customerId="c1" isParent={false} view="rates" onViewChange={() => undefined} canEditCustomer={false} /></QueryClientProvider>);
    expect(screen.getAllByTestId(/^row-rate-/).map(e => e.getAttribute("data-testid"))).toEqual(["row-rate-irrigation_labor", "row-rate-custom_mobilization", "row-rate-general_labor"]);
    expect(screen.getByTestId("text-billing-card-irrigation_labor").textContent).toContain("80");
    expect(screen.queryByTestId("text-billing-card-general_labor")).toBeNull();
    expect(screen.queryByTestId("text-billing-card-custom_mobilization")).toBeNull();
    expect(screen.getByTestId("row-rate-custom_mobilization").textContent).toContain("One visit");
    expect(screen.queryByTestId("rate-standard-skid_loader")).toBeNull();
    fireEvent.click(screen.getByTestId("button-standard-rates"));
    expect(screen.getByTestId("rate-standard-skid_loader")).toBeTruthy();
    expect(fx.api.mock.calls.some(c => String(c[1]).includes("rate-card"))).toBe(false);
  });
});
