// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({
  user: { id: "u1", activeCompanyId: "co1", activeRole: "admin", accessRole: "admin", isSuperAdminBool: false, activeTags: [] as string[] },
  api: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/components/nav/SettingsRailLayout", () => ({ SettingsRailLayout: ({ children }: { children: unknown }) => children }));
import ServiceTimingPage from "@/pages/ServiceTimingPage";
import { unsavedGuard } from "@/lib/unsavedGuard";
import "@/i18n";

const ok = (d: unknown) => Promise.resolve({ json: async () => d });
const zero = Array(12).fill(0);
const data = () => ({
  rows: [
    { id: "p3", serviceKey: "tree_pruning", rounds: 3, monthSpread: [0,0,0,1,1,1,0,0,0,0,0,0], isStandard: true, updatedAt: "x" },
    { id: "p5", serviceKey: "tree_pruning", rounds: 5, monthSpread: [0,0,0,1,1,1,1,1,0,0,0,0], isStandard: false, updatedAt: "x" },
  ],
  countsInUse: [{
    serviceKey: "tree_pruning", seasons: 40, counts: [{ rounds: 2, seasons: 29, withoutMonths: 29 }],
    noCount: 33, noCountWithoutMonths: 30, zero: 1, invalid: 0, duplicate: 1,
    problems: [{ termId: "t9", agreementId: "a9", customerId: "c9", customerName: "Aspen Ridge HOA", reason: "zero" }],
  }],
});
let getData = data();

function mount() {
  fx.api.mockImplementation((method: string, url: string) => {
    if (method === "GET") return ok(getData);
    if (method === "PUT") return ok({ id: "new", serviceKey: "tree_pruning", rounds: 2, monthSpread: zero, isStandard: true, updatedAt: "y" });
    return ok({});
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path: "/dashboard/settings/service-timing" });
  const ui = () => <QueryClientProvider client={qc}><Router hook={loc.hook}><ServiceTimingPage /></Router></QueryClientProvider>;
  const r = render(ui());
  return { ...r, rerender: () => r.rerender(ui()) };
}

beforeEach(() => { fx.api.mockReset(); fx.toast.mockReset(); getData = data(); fx.user = { ...fx.user, activeCompanyId: "co1", activeRole: "admin", accessRole: "admin" }; });
afterEach(() => { cleanup(); unsavedGuard.setDirty(false); });

describe("Service timing settings", () => {
  it("renders the exact explanation, usage buckets and contract links, scoped to the active company", async () => {
    mount();
    await screen.findByTestId("card-service-tree_pruning");
    expect(screen.getByTestId("text-explanation").textContent).toBe("Used only where a contract is silent. A contract's own count and months always win. Changing timing here never changes a contract.");
    expect(fx.api).toHaveBeenCalledWith("GET", "/api/service-programs", undefined, { headers: { "X-Company-Id": "co1" } });
    expect(screen.getByTestId("chip-no-timing-tree_pruning-2").textContent).toContain("29 seasons can't be scheduled");
    expect(screen.getByTestId("text-nocount-tree_pruning").textContent).toContain("Used by 33 seasons (30 without stated months)");
    expect(screen.getByTestId("chip-zero-tree_pruning")).toBeTruthy();
    expect(screen.getByTestId("chip-duplicate-tree_pruning")).toBeTruthy();
    expect(screen.getByTestId("link-problem-t9-zero").getAttribute("href")).toContain("/dashboard/contracts/a9#term-t9");
  });

  it("renders the standard count once, sharing one editor; choosing a count moves it, never duplicates cells", async () => {
    mount();
    await screen.findByTestId("card-service-tree_pruning");
    expect(screen.getAllByTestId("editor-tree_pruning-3")).toHaveLength(1);
    expect(screen.getByTestId("text-delete-blocked-tree_pruning-3")).toBeTruthy();
    expect(screen.getByTestId("button-delete-tree_pruning-5")).toBeTruthy();
    fireEvent.change(screen.getByTestId("select-standard-tree_pruning"), { target: { value: "2" } });
    expect(screen.getAllByTestId("editor-tree_pruning-2")).toHaveLength(1);
    expect(screen.getAllByTestId("editor-tree_pruning-3")).toHaveLength(1);
    const save = screen.getByTestId("button-save-tree_pruning-2") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-2-3"), { target: { value: "5" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-2-3"), { target: { value: "1" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-2-9"), { target: { value: "1" } });
    expect(save.disabled).toBe(false);
    expect(unsavedGuard.isDirty()).toBe(true);
    fireEvent.click(save);
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("PUT", "/api/service-programs/tree_pruning/2",
      { monthSpread: [0,0,0,1,0,0,0,0,0,1,0,0], isStandard: true }, { headers: { "X-Company-Id": "co1" } }));
  });

  it("retains the saved standard while a different count is only an unsaved choice", async () => {
    mount();
    await screen.findByTestId("card-service-tree_pruning");
    fireEvent.change(screen.getByTestId("select-standard-tree_pruning"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-3-3"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-3-9"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("button-save-tree_pruning-3"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("PUT", "/api/service-programs/tree_pruning/3",
      { monthSpread: [0,0,0,0,1,1,0,0,0,1,0,0], isStandard: true }, { headers: { "X-Company-Id": "co1" } }));
  });

  it("keeps drafts across refetch and shows save errors inline", async () => {
    const r = mount();
    await screen.findByTestId("card-service-tree_pruning");
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-5-3"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-5-9"), { target: { value: "1" } });
    r.rerender();
    expect((screen.getByTestId("input-cell-tree_pruning-5-9") as HTMLInputElement).value).toBe("1");
    fx.api.mockImplementation((m: string) => m === "PUT" ? Promise.reject(new Error('409: {"message":"Timing changed"}')) : ok(getData));
    fireEvent.click(screen.getByTestId("button-save-tree_pruning-5"));
    expect((await screen.findByTestId("error-tree_pruning-5")).textContent).toBe("Timing changed");
  });

  it("clears the standard explicitly without deleting timing", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-clear-standard-tree_pruning"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("DELETE", "/api/service-programs/tree_pruning/standard", undefined, { headers: { "X-Company-Id": "co1" } }));
  });

  it("office sees every control read-only", async () => {
    fx.user = { ...fx.user, activeRole: "office", accessRole: "office" };
    mount();
    await screen.findByTestId("card-service-tree_pruning");
    expect(screen.getByTestId("badge-read-only")).toBeTruthy();
    expect((screen.getByTestId("select-standard-tree_pruning") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId("input-cell-tree_pruning-5-0") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("button-save-tree_pruning-5")).toBeNull();
    expect(screen.queryByTestId("button-delete-tree_pruning-5")).toBeNull();
    expect(screen.queryByTestId("button-clear-standard-tree_pruning")).toBeNull();
  });

  it("shows a retryable load error", async () => {
    fx.api.mockImplementation(() => Promise.reject(new Error("500: boom")));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ServiceTimingPage /></QueryClientProvider>);
    await screen.findByTestId("state-error");
    fx.api.mockImplementation(() => ok(getData));
    fireEvent.click(screen.getByTestId("button-retry"));
    await screen.findByTestId("card-service-tree_pruning");
  });

  it("company switch discards drafts with a warning and reads the new company", async () => {
    const r = mount();
    await screen.findByTestId("card-service-tree_pruning");
    fireEvent.change(screen.getByTestId("input-cell-tree_pruning-5-9"), { target: { value: "2" } });
    fx.user = { ...fx.user, activeCompanyId: "co2" };
    await act(async () => { r.rerender(); });
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("GET", "/api/service-programs", undefined, { headers: { "X-Company-Id": "co2" } }));
    expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Unsaved timing discarded" }));
    await screen.findByTestId("card-service-tree_pruning");
    expect((screen.getByTestId("input-cell-tree_pruning-5-9") as HTMLInputElement).value).toBe("");
    expect(fx.api.mock.calls.some(c => c[0] === "PUT")).toBe(false);
  });
});
