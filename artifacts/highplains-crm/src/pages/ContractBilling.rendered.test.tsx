// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ContractDetail } from "@/components/contracts/contractTypes";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
import { ContractView } from "./ContractPage";
import { blankLine, lineProblems } from "@/components/contracts/paymentDraft";

afterEach(() => { cleanup(); fx.api.mockReset(); fx.toast.mockReset(); });

function mount(line: "snow" | "both") {
  fx.api.mockResolvedValue({ json: async () => ({}) });
  const snow = [12, 1, 2, 3, 4].map(month => ({
    component: "Snow", month: `${month === 12 ? 2026 : 2027}-${String(month).padStart(2, "0")}-01`, amountCents: 100000,
  }));
  const detail = {
    id: "agreement", customerId: "customer", customer: { id: "customer", name: "Snow property" },
    line, form: "ours", currentTermId: "current", renewalDue: false, renewalDraftId: null,
    terms: [{
      id: "current", seasonLabel: "2026–27", startDate: "2026-10-01", endDate: "2027-09-30",
      status: "draft", displayStatus: "draft", editable: true, allowedMoves: [],
      snowPricing: "flat_rate", snowFlatPriceCents: 500000, annualPriceCents: 500000,
      billingType: "custom", scope: [], rates: [], billingMonths: snow, documents: [], history: [],
    }],
  } as unknown as ContractDetail;
  const loc = memoryLocation({ path: "/dashboard/contracts/agreement" });
  render(<QueryClientProvider client={new QueryClient()}><Router hook={loc.hook}>
    <ContractView detail={detail} initialHash="#term-current" />
  </Router></QueryClientProvider>);
}

describe("flat-rate Billing payment safety", () => {
  for (const line of ["snow", "both"] as const) {
    for (const change of ["remove", "rename"] as const) {
      for (const save of ["button-save-payments", "button-done"] as const) {
        it(`blocks ${save} after ${change} of the Snow line on ${line}`, async () => {
          const user = userEvent.setup();
          mount(line);
          await user.click(screen.getByTestId("button-edit-contract"));
          await user.click(screen.getByTestId("tab-billing"));
          if (change === "remove") await user.click(screen.getByTestId("button-remove-line-0"));
          else {
            await user.clear(screen.getByTestId("input-line-name-0"));
            await user.type(screen.getByTestId("input-line-name-0"), "Winter service");
          }
          await user.click(screen.getByTestId(save));
          expect(screen.getByTestId("error-flat-snow-line").textContent).toContain('named "Snow"');
          expect(screen.getByTestId("button-done")).toBeTruthy();
          expect(fx.api).not.toHaveBeenCalled();
        });
      }
    }
  }
  it("requires a positive amount, not merely a reserved Snow name", () => {
    expect(lineProblems([blankLine("Snow")], true).join()).toContain("above $0");
    expect(lineProblems([], false)).toEqual([]);
  });
  it("saves a valid edited Snow amount and derives the flat price for the same save", async () => {
    const user = userEvent.setup();
    mount("snow");
    await user.click(screen.getByTestId("button-edit-contract"));
    await user.click(screen.getByTestId("tab-billing"));
    await user.clear(screen.getByTestId("input-month-0-12"));
    await user.type(screen.getByTestId("input-month-0-12"), "1200");
    await user.click(screen.getByTestId("button-save-payments"));
    expect(fx.api).toHaveBeenCalledWith("PATCH", "/api/contract-center/terms/current", { snowFlatPriceCents: 520000 });
    expect(fx.api).toHaveBeenCalledWith("PUT", "/api/contract-center/terms/current/payments", [{
      component: "Snow", months: [
        { month: 1, amountCents: 100000 }, { month: 2, amountCents: 100000 },
        { month: 3, amountCents: 100000 }, { month: 4, amountCents: 100000 },
        { month: 12, amountCents: 120000 },
      ],
    }]);
  });
});
