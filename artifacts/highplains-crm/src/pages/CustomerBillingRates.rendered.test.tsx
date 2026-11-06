// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u", activeCompanyId: "co", activeRole: "field_manager" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/components/qbo/QboCustomerCard", () => ({ default: () => null }));
const rate = (rateKey: string, o: Record<string, unknown> = {}) => ({ rateKey, line: "landscape", label: rateKey, unit: "hour", minimum: null, priceCents: 8500, priceText: null, ...o });
vi.mock("@/hooks/useCustomerContractSummary", () => ({
  useCustomerContractSummary: () => ({ isLoading: false, error: null, data: { current: [{
    termId: "t1", agreementId: "a1", label: "2026", line: "landscape", startDate: "2026-01-01", endDate: "2026-12-31", billingMonths: [],
    rates: [rate("irrigation_labor", { line: "irrigation", cardPriceCents: 8000 }), rate("custom_mobilization", { line: "general", minimum: "One visit", priceCents: 3995 }), rate("general_labor", { priceCents: 7500, cardPriceCents: 7500 })],
    standardRates: [rate("skid_loader", { priceCents: 12500 })],
  }], upcoming: [], previous: [] } }),
}));
import BillingPage from "@/components/customer/pages/BillingPage";

afterEach(() => { cleanup(); fx.api.mockReset(); });

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
