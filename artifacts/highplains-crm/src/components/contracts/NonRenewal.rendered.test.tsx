// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ContractDetail, DetailTerm } from "./contractTypes";
import { NotRenewingDialog } from "./NotRenewingDialog";
import { ContractView } from "@/pages/ContractPage";
import { ContractBoard } from "@/pages/ContractCenterPage";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "company", activeRole: "office" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => fx.api(...args) }));
// Native select in DOM tests: exercise the form state, not Radix's pointer mechanics.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => <select data-testid="reason-select" value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));
const season = (id: string, overrides: Partial<DetailTerm> = {}): DetailTerm => ({
  id, seasonLabel: id, line: "landscape", form: "ours", startDate: "2026-01-01", endDate: "2026-12-31",
  status: "signed", displayStatus: "active", needsReview: false, annualPriceCents: 120000, snowPricing: null,
  editable: true, allowedMoves: ["cancelled"], scope: [], rates: [], billingMonths: [], documents: [], history: [], ...overrides,
});
const detail = (otherOpenLines = 0): ContractDetail => ({
  id: "agreement", customerId: "customer", customer: { id: "customer", name: "Disposable Customer" },
  line: "landscape", form: "ours", currentTermId: "year1", renewalSourceId: "year3", companyDay: "2026-11-02",
  canRecordNonRenewal: true, canUndoNonRenewal: true, otherOpenLines, renewalDue: true, renewalDraftId: "draft",
  terms: [season("year1", { status: "renewed" }), season("year3", { startDate: "2028-01-01", endDate: "2028-12-31" }),
    season("draft", { status: "sent", displayStatus: "sent", startDate: "2029-01-01", endDate: "2029-12-31", renewedFromTermId: "year3" })],
});
function mount(children: React.ReactNode) {
  const loc = memoryLocation({ path: "/dashboard/contracts/agreement" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(<QueryClientProvider client={qc}><Router hook={loc.hook}>{children}</Router></QueryClientProvider>);
  return { invalidate };
}
beforeEach(() => { fx.api.mockReset(); fx.toast.mockReset(); });
afterEach(() => cleanup());

describe("non-renewal rendered flow", () => {
  it.each([0, 1])("defaults the checkbox from %s other agreement lines, not the three years", async other => {
    fx.api.mockResolvedValue({ json: async () => detail(other) });
    mount(<NotRenewingDialog target={{ id: "agreement", customerName: "Disposable Customer" }} onClose={vi.fn()} />);
    await screen.findByTestId("dialog-not-renewing");
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe(other === 0 ? "true" : "false");
    expect((screen.getByTestId("input-non-renewal-date") as HTMLInputElement).value).toBe("2026-11-02");
    expect(screen.getByText("The draft renewal will be marked lost.")).toBeTruthy();
    expect(!!screen.queryByText("They still have other contracts.")).toBe(other > 0);
  });
  it("requires a reason and posts to the final source with competitor, note and checkbox", async () => {
    const onClose = vi.fn();
    fx.api.mockResolvedValue({ json: async () => detail(0) });
    const { invalidate } = mount(<NotRenewingDialog target={{ id: "agreement", customerName: "Disposable Customer" }} onClose={onClose} />);
    await screen.findByRole("checkbox");
    fireEvent.click(screen.getByTestId("button-confirm-not-renewing"));
    expect(fx.api.mock.calls.filter(c => c[0] === "POST")).toHaveLength(0);
    fireEvent.change(screen.getByTestId("reason-select"), { target: { value: "competitor" } });
    fireEvent.change(screen.getByTestId("input-non-renewal-competitor"), { target: { value: "Surfaces" } });
    fireEvent.change(screen.getByTestId("input-non-renewal-note"), { target: { value: "Board decision" } });
    fireEvent.click(screen.getByTestId("button-confirm-not-renewing"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fx.api).toHaveBeenCalledWith("POST", "/api/contract-center/terms/year3/non-renewal", {
      decidedOn: "2026-11-02", reason: "competitor", competitor: "Surfaces", note: "Board decision", deactivateCustomer: true,
    }, { headers: { "X-Company-Id": "company" } });
    expect(invalidate).toHaveBeenCalled();
  });
  it("shows the source chip and actor strip while year one remains editable, hides Renew and undoes the source", async () => {
    const d = detail(); d.notRenewing = true; d.canRecordNonRenewal = false;
    d.terms[1] = { ...d.terms[1], nonRenewalOn: "2026-11-01", nonRenewalReason: "board", nonRenewalByName: "Office Actor" };
    fx.api.mockResolvedValue({ json: async () => ({ customerStillInactive: true }) });
    mount(<ContractView detail={d} initialHash="#term-year1" />);
    expect(screen.getAllByTestId("chip-not-renewing").length).toBeGreaterThan(0);
    expect(screen.getByTestId("text-not-renewing").textContent).toContain("Board decision, decided Nov 1, 2026 by Office Actor");
    expect(screen.queryByTestId("button-renew-contract")).toBeNull();
    expect(screen.getByTestId("button-edit-details")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-undo-not-renewing"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("DELETE", "/api/contract-center/terms/year3/non-renewal"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("still inactive") })));
    fireEvent.click(screen.getByTestId("button-status-menu"));
    expect(within(screen.getByTestId("menu-status")).queryByText("Mark lost")).toBeNull();
    expect(within(screen.getByTestId("menu-status")).getByText("Cancel contract")).toBeTruthy();
  });
  it("does not expose Undo when the server denies the role capability", () => {
    const d = detail(); d.notRenewing = true; d.canUndoNonRenewal = false;
    d.terms[1].nonRenewalOn = "2026-11-01";
    mount(<ContractView detail={d} initialHash="#term-year1" />);
    expect(screen.queryByTestId("button-undo-not-renewing")).toBeNull();
  });
  it("board exposes the action and shows decided non-renewals separately in the denominator", () => {
    const onNotRenewing = vi.fn();
    mount(<ContractBoard board="landscape" q="" today="2026-11-02" defaultOpen onNotRenewing={onNotRenewing} items={[
      { id: "open", customerId: "customer", customerName: "Fixture Open", line: "landscape", form: "ours",
        canRecordNonRenewal: true, state: "renewal_due", allowedActions: ["open", "renew", "not_renewing"],
        current: season("open-source"), renewalDraft: null, renewalDue: true, renewalProgress: { due: true, signed: false } },
      { id: "marked", customerId: "customer2", customerName: "Fixture Marked", line: "landscape", form: "ours",
        current: season("marked-source"), renewalDraft: null, renewalDue: false, notRenewing: true, state: "serving_not_renewing",
        renewalProgress: { due: true, signed: false, notRenewing: true } },
    ]} />);
    expect(screen.queryByTestId("card-renewal-marked")).toBeNull();
    expect(screen.getByTestId("text-renewal-progress").textContent).toContain("0 of 2");
    expect(screen.getByTestId("text-non-renewal-progress").textContent).toBe("0 renewed · 1 not renewing");
    fireEvent.click(screen.getByTestId("button-not-renewing-open"));
    expect(onNotRenewing).toHaveBeenCalledOnce();
  });
});
