// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ContractDetail } from "@/components/contracts/contractTypes";

const fx = vi.hoisted(() => ({api: vi.fn(), toast: vi.fn()}));
vi.mock("@/hooks/use-auth", () => ({useAuth: () => ({user: {id: "u1", activeCompanyId: "company", activeRole: "office"}})}));
vi.mock("@/lib/queryClient", () => ({apiRequest: (...a: unknown[]) => fx.api(...a)}));
vi.mock("@/hooks/use-toast", () => ({useToast: () => ({toast: fx.toast})}));
import { ContractView } from "./ContractPage";
import { STARTING_SERVICE_CALENDAR } from "../../../../lib/db/src/serviceCalendarContracts";

afterEach(() => {cleanup(); fx.api.mockReset(); fx.toast.mockReset();});
const spread = [0,0,1,0,0,0,0,0,0,0,2,0];
function mount(serviceKey = "cleanups", implicit = false) {
  fx.api.mockImplementation((_method, url) => Promise.resolve({json: async () =>
    url === "/api/service-calendar" ? {entries: implicit ? STARTING_SERVICE_CALENDAR : [], usage: []} : {}}));
  const detail = {
    id: "agreement", customerId: "customer", customer: {id: "customer", name: "Calendar property"},
    line: "landscape", form: "ours", currentTermId: "current", renewalDue: false, renewalDraftId: null,
    terms: [{
      id: "current", line: "landscape", form: "ours", seasonLabel: "2027", startDate: "2027-01-01", endDate: "2027-12-31",
      status: "draft", displayStatus: "draft", editable: true, allowedMoves: [],
      snowPricing: null, annualPriceCents: null, billingType: "seasonal",
      scope: implicit ? [] : [{serviceKey, line: "landscape", included: true, quantity: 3, unit: "visits", monthSpread: spread,
        details: {}, priceCents: null, notes: null}],
      rates: [], billingMonths: [], documents: [], history: [],
    }],
  } as unknown as ContractDetail;
  const loc = memoryLocation({path: "/dashboard/contracts/agreement"});
  render(<QueryClientProvider client={new QueryClient()}><Router hook={loc.hook}>
    <ContractView detail={detail} initialHash="#term-current" />
  </Router></QueryClientProvider>);
}
describe("calendar count scope saves", () => {
  it("displays implicit defaults without writes and explicitly saves a previously absent exclusion plus billing", async () => {
    mount("cleanups", true);
    await screen.findByText("Standard (3) visits");
    expect(fx.api.mock.calls.some(c => c[0] === "PUT")).toBe(false);
    await userEvent.click(screen.getByTestId("button-edit-scope"));
    expect(screen.getByTestId("switch-scope-cleanups").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("switch-scope-cleanups"));
    fireEvent.change(screen.getByLabelText("Spring and fall clean-ups billing"), {target: {value: "billed_when_done"}});
    fireEvent.change(screen.getByLabelText("Spring and fall clean-ups price"), {target: {value: "$155"}});
    await userEvent.click(screen.getByTestId("button-save-scope"));
    expect(fx.api).toHaveBeenCalledWith("PUT", "/api/contract-center/terms/current/scope",
      expect.arrayContaining([expect.objectContaining({serviceKey: "cleanups", included: false, quantity: null, priceCents: 15500,
        details: {billing: "billed_when_done", billingPrice: "$155"}})]), {headers: {"X-Company-Id": "company"}});
  });
  it("saves a smaller campaign count and preserves conflicting stored months", async () => {
    mount();
    await userEvent.click(screen.getByTestId("button-edit-scope"));
    fireEvent.change(screen.getByTestId("input-qty-cleanups"), {target: {value: "2"}});
    expect(screen.queryByTestId("warn-spread-cleanups")).toBeNull();
    await userEvent.click(screen.getByTestId("button-save-scope"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("PUT", "/api/contract-center/terms/current/scope",
      [expect.objectContaining({serviceKey: "cleanups", quantity: 2, monthSpread: spread})],
      {headers: {"X-Company-Id": "company"}}));
    expect(fx.toast).toHaveBeenCalledWith({title: "Scope saved"});
  });
  it("still blocks route counts that conflict with stated month totals", async () => {
    mount("mowing");
    await userEvent.click(screen.getByTestId("button-edit-scope"));
    fireEvent.change(screen.getByTestId("input-qty-mowing"), {target: {value: "2"}});
    expect(screen.getByTestId("warn-spread-mowing").textContent).toContain("Months add up to 3, quantity is 2");
    await userEvent.click(screen.getByTestId("button-save-scope"));
    expect(fx.api).not.toHaveBeenCalledWith("PUT", expect.anything(), expect.anything(), expect.anything());
  });
});
