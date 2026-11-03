// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerSyncControls } from "./CustomerSyncControls";

const fx = vi.hoisted(() => ({ user: { id: "actor", activeCompanyId: "a", activeRole: "admin", isSuperAdminBool: false }, api: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: fx.api, queryClient: { invalidateQueries: fx.invalidate } }));
const status = (baselineAt: string | null = null) => ({ baselineAt, cursor: baselineAt, fullPullAt: baselineAt,
  lastSyncAt: baselineAt, nextSyncAt: baselineAt, openReviews: 3 });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<CustomerSyncControls connected />, { wrapper });
}
beforeEach(() => {
  fx.api.mockReset(); fx.invalidate.mockReset();
  fx.user = { id: "actor", activeCompanyId: "a", activeRole: "admin", isSuperAdminBool: false };
});
afterEach(cleanup);
describe("QuickBooks customer sync integration controls", () => {
  it("requires confirmation, sends scoped initial request, shows counts and branch exceptions and invalidates consumers", async () => {
    fx.api.mockImplementation(async (method: string) => ({ json: async () => method === "GET" ? status() : {
      linkedUpdated: 4, reviewsRaised: 2, unboundCrmCustomers: 1, qboCustomersNotInCrm: 5,
      branchesLinkedUnderMasterParent: [{ customerId: "branch", name: "Branch exception", qboId: "q1" }],
    } }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Run initial QuickBooks sync" }));
    expect(screen.getByRole("dialog").textContent).toContain("preserves differing non-empty values for review");
    expect(fx.api.mock.calls.filter(c => c[0] === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm initial sync" }));
    await screen.findByText(/4 linked customers reconciled/);
    expect(screen.getByText("Branch exception — QuickBooks q1")).toBeDefined();
    expect(fx.api).toHaveBeenCalledWith("POST", "/api/qbo/customers/initial-sync", {}, { headers: { "X-Company-Id": "a" } });
    expect(fx.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/qbo/customers/sync-status"] });
    expect(fx.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/customers"] });
  });
  it("office cannot initialize but can sync after baseline", async () => {
    fx.user.activeRole = "office";
    fx.api.mockResolvedValue({ json: async () => status() });
    const view = mount();
    await screen.findByText("An administrator must run the initial QuickBooks sync.");
    expect(screen.queryByRole("button", { name: "Run initial QuickBooks sync" })).toBeNull();
    view.unmount();
    fx.api.mockResolvedValue({ json: async () => status("2026-01-01T00:00:00Z") });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    await screen.findByText("Customer sync completed.");
    expect(fx.api).toHaveBeenCalledWith("POST", "/api/qbo/customers/sync-now", {}, { headers: { "X-Company-Id": "a" } });
  });
  it("keeps confirmation loading and reports errors without claiming success", async () => {
    let fail!: (e: Error) => void;
    fx.api.mockImplementation(async (method: string) => {
      if (method === "GET") return { json: async () => status() };
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Run initial QuickBooks sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm initial sync" }));
    const button = await screen.findByRole("button", { name: "Reconciling…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fail(new Error("QuickBooks unavailable"));
    await waitFor(() => expect(screen.getAllByRole("alert").some(e => e.textContent === "QuickBooks unavailable")).toBe(true));
    expect(screen.queryByText(/linked customers reconciled/)).toBeNull();
  });
  it("company switches reset confirmation and summaries and use a new status cache", async () => {
    fx.api.mockResolvedValue({ json: async () => status() });
    const view = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Run initial QuickBooks sync" }));
    expect(screen.getByRole("dialog")).toBeDefined();
    fx.user = { ...fx.user, activeCompanyId: "b" };
    view.rerender(<CustomerSyncControls connected />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fx.api).toHaveBeenCalledWith("GET", "/api/qbo/customers/sync-status", undefined, { headers: { "X-Company-Id": "b" } });
  });
});
