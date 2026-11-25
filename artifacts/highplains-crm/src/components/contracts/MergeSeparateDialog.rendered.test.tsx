// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import i18n from "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ContractDetail, MergeCandidate } from "./contractTypes";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), company: "fixture-company" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeCompanyId: fx.company, accessRole: "office" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => fx.api(...args) }));
import { MergeSeparateDialog } from "./MergeSeparateDialog";

const term = { id: "old-season", seasonLabel: "2026", startDate: "2026-04-01", endDate: "2026-10-31", status: "signed",
  displayStatus: "expired", line: "landscape", annualPriceCents: 100000, snowPricing: null, needsReview: false,
  scope: [], rates: [], billingMonths: [], documents: [], history: [] } as const;
const target = { id: "keep", customerId: "customer", customer: { id: "customer", name: "Disposable Customer" },
  line: "landscape", form: "ours", renewalSourceId: "old-season", terms: [term] } as unknown as ContractDetail;
const candidate: MergeCandidate = { agreementId: "remove", firstSeasonLabel: "2026–27", firstStartDate: "2026-11-01", blockedReason: null,
  propertyManagementCompanyId: "new-management", targetPropertyManagementCompanyId: "old-management",
  managementCompanyName: "New Management", targetManagementCompanyName: "Old Management",
  seasons: [{ id: "new-season", seasonLabel: "2026–27", startDate: "2026-11-01", endDate: "2027-10-31", status: "signed", line: "both", annualPriceCents: 2007600 }] };
let rows: MergeCandidate[];
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidations = vi.spyOn(qc, "invalidateQueries");
  const loc = memoryLocation({ path: "/dashboard/contracts/keep", record: true }), onClose = vi.fn();
  const tree = () => <QueryClientProvider client={qc}><Router hook={loc.hook}><MergeSeparateDialog target={target} onClose={onClose} /></Router></QueryClientProvider>;
  const rendered = render(tree());
  return { qc, invalidations, loc, onClose, rerender: () => rendered.rerender(tree()) };
}
beforeEach(async () => {
  await i18n.changeLanguage("en");
  fx.api.mockReset(); fx.toast.mockReset(); fx.company = "fixture-company"; rows = [candidate];
  fx.api.mockImplementation(async (method: string) => ({ json: async () => method === "GET" ? rows : target }));
});
afterEach(cleanup);

describe("merge separate renewal confirmation", () => {
  it("disables blocked rows, includes all season facts and shows reason", async () => {
    rows = [{ ...candidate, agreementId: "blocked", firstSeasonLabel: "Blocked season", blockedReason: "2027 overlaps 2026." }, candidate];
    mount();
    expect((await screen.findByRole("radio", { name: "Blocked season" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("2027 overlaps 2026.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Merge" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/Landscape \+ Snow/).length).toBe(2);
    expect(screen.getAllByText(/\$20,076/).length).toBe(2);
    expect(screen.getAllByText("Signed")).toHaveLength(2);
  });
  it("shows before/after, line and management changes and removal warning", async () => {
    mount(); fireEvent.click(await screen.findByRole("radio", { name: "2026–27" }));
    const text = screen.getByTestId("merge-preview").textContent;
    expect(text).toContain("Before"); expect(text).toContain("After");
    expect(text).toContain("2026"); expect(text).toContain("renewed by 2026–27");
    expect(text).toContain("Line changes from Landscape to Landscape + Snow");
    expect(text).toContain("Old Management to New Management. New Management will be kept.");
    expect(screen.getByText("The separate contract will be removed. Its seasons, payments, scope, rates, documents and history move here.")).toBeTruthy();
  });
  it("keeps a 409 sentence inline without closing or success toast", async () => {
    const { onClose } = mount(); fireEvent.click(await screen.findByRole("radio", { name: "2026–27" }));
    fx.api.mockRejectedValueOnce(new Error('409: {"message":"Undo Not renewing on 2026 first."}'));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Undo Not renewing on 2026 first.");
    expect(onClose).not.toHaveBeenCalled(); expect(fx.toast).not.toHaveBeenCalled();
    expect(screen.getByTestId("dialog-merge-separate")).toBeTruthy();
  });
  it("merges with bound company and source id, invalidates all affected queries and toasts on the kept URL", async () => {
    const { qc, invalidations, onClose, loc } = mount();
    qc.setQueryData(["/api/revenue/income", 2027], {});
    fireEvent.click(await screen.findByRole("radio", { name: "2026–27" }));
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(fx.api).toHaveBeenCalledWith("POST", "/api/contract-center/contracts/keep/merge", { sourceAgreementId: "remove" },
      { headers: { "X-Company-Id": "fixture-company" } });
    for (const key of [["/api/contract-center/contracts"], ["/api/contract-center/contracts", "keep"],
      ["/api/contract-center/contracts", "remove"], ["/api/bids/board"]]) expect(invalidations).toHaveBeenCalledWith({ queryKey: key });
    expect(qc.getQueryState(["/api/revenue/income", 2027])?.isInvalidated).toBe(true);
    expect(fx.toast).toHaveBeenCalledWith({ title: "Merged. 2026–27 is now the renewal of 2026" });
    expect(loc.history.at(-1)).toBe("/dashboard/contracts/keep");
  });
  it("never silently retargets an open dialog after a company switch", async () => {
    const view = mount(); fireEvent.click(await screen.findByRole("radio", { name: "2026–27" }));
    fx.company = "different-company"; view.rerender();
    expect((screen.getByRole("button", { name: "Merge" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Active company changed");
    expect(fx.api.mock.calls.every(c => c[0] === "GET")).toBe(true);
  });
  it("localizes the complete dialog and draft preview in Spanish", async () => {
    await i18n.changeLanguage("es");
    rows = [{ ...candidate, seasons: candidate.seasons.map(s => ({ ...s, status: "draft" })) }];
    mount(); fireEvent.click(await screen.findByRole("radio", { name: "2026–27" }));
    expect(screen.getByRole("heading", { name: "Fusionar la renovación con este contrato" })).toBeTruthy();
    expect(screen.getByTestId("merge-preview").textContent).toContain("renovación pendiente");
    expect(screen.getByRole("button", { name: "Fusionar" })).toBeTruthy();
  });
});
