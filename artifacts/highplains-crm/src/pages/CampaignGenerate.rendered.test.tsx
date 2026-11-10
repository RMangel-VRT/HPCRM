// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import CampaignGeneratePage, { yearChoices } from "@/pages/CampaignGeneratePage";

const ok = (d: unknown) => Promise.resolve({ json: async () => d });
const ref = { serviceKey: "aeration", roundMonth: "2026-04", roundSeq: 1, title: "Aeration April 2026", windowStart: "2026-04-01", windowEnd: "2026-04-30", campaignId: null };
const report = (over: Record<string, unknown> = {}) => ({
  year: 2026, today: "2025-10-14", enabledAt: null,
  rounds: [{ ...ref, newRound: true, added: 1, removed: 0, members: [{ propertyId: "p1", propertyName: "Aspen Ridge HOA", termId: "t1", agreementId: "a1", seasonLabel: "2026", termStatus: "up_for_renewal", timing: "contract", count: "standard" }] }],
  created: [ref], deleted: [], added: [{ ...ref, propertyId: "p1", propertyName: "Aspen Ridge HOA", itemId: null }], removed: [], keptNotOwed: [],
  missed: [], addedToClosedRound: [],
  gaps: [{ propertyId: "p2", propertyName: "Pine Bluff", termId: "t2", agreementId: "a2", seasonLabel: "2026", serviceKey: "aeration", kind: "duplicate_lines" }],
  waitingOnSignature: 3, manualCampaigns: [{ id: "m1", title: "Spring aeration (manual)", category: "general", windowStart: "2026-04-01", windowEnd: "2026-04-20" }],
  ...over,
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path: "/dashboard/campaigns/generate" });
  const ui = () => <QueryClientProvider client={qc}><Router hook={loc.hook}><CampaignGeneratePage /></Router></QueryClientProvider>;
  const r = render(ui());
  return { ...r, qc, rerender: () => r.rerender(ui()) };
}
const yr = yearChoices().defaultYear;

beforeEach(() => {
  fx.api.mockReset(); fx.toast.mockReset();
  fx.user = { ...fx.user, activeCompanyId: "co1", accessRole: "admin", activeRole: "admin" };
  fx.api.mockImplementation((m: string, path: string) => ok(path.endsWith("/status")
    ? { enabledAt: null, checkedAt: null, succeededAt: null, error: null, changes: 0, keptNotOwed: 0, missed: 0 }
    : m === "POST" ? report({ enabledAt: "2025-10-14T10:00:00Z" }) : report()));
});
afterEach(() => cleanup());

describe("Campaign generation", () => {
  it("defaults year by Colorado month", () => {
    expect(yearChoices(new Date("2025-10-02T12:00:00Z")).defaultYear).toBe(2026);
    expect(yearChoices(new Date("2025-06-02T12:00:00Z")).defaultYear).toBe(2025);
    expect(yearChoices(new Date("2026-01-01T03:00:00Z")).years).toEqual([2025, 2026]);
  });

  it("previews with company header, shows gaps, members, manual links", async () => {
    mount();
    await screen.findByTestId("card-service-aeration");
    expect(fx.api).toHaveBeenCalledWith("GET", `/api/campaign-generation/${yr}/preview`, undefined, { headers: { "X-Company-Id": "co1", "Cache-Control": "no-store" } });
    expect(screen.getByTestId("link-gap-t2-aeration-duplicate_lines").getAttribute("href")).toContain("/dashboard/contracts/a2#term-t2");
    expect(screen.getByTestId("link-manual-m1").getAttribute("href")).toContain("/dashboard/campaigns/m1");
    fireEvent.click(screen.getByTestId("button-toggle-aeration|2026-04|1"));
    expect(screen.getByTestId("link-member-aeration|2026-04|1-t1").textContent).toBe("Aspen Ridge HOA");
    expect(screen.queryByTestId("chip-waiting-aeration|2026-04|1-t1")).toBeNull();
    expect(screen.getByTestId("text-totals").textContent).toContain("3 included memberships waiting on signature");
    expect(document.body.textContent).not.toMatch(/not included|left out because|excluded/i);
    expect(screen.getByTestId("text-status").textContent).toContain("not been generated");
  });

  it("office cannot generate", async () => {
    fx.user = { ...fx.user, accessRole: "office", activeRole: "office" };
    mount();
    await screen.findByTestId("card-service-aeration");
    expect(screen.queryByTestId("button-generate")).toBeNull();
    expect(screen.getByTestId("text-admin-only")).toBeTruthy();
  });

  it("admin confirms with totals, posts strict body, shows result and invalidates campaigns", async () => {
    const { qc } = mount();
    const inv = vi.spyOn(qc, "invalidateQueries");
    fireEvent.click(await screen.findByTestId("button-generate"));
    expect(screen.getByTestId("text-confirm-totals").textContent).toContain("1 rounds created");
    fireEvent.click(screen.getByTestId("button-confirm-generate"));
    await screen.findByTestId("panel-result");
    expect(fx.api).toHaveBeenCalledWith("POST", `/api/campaign-generation/${yr}`, { confirm: true }, { headers: { "X-Company-Id": "co1", "Cache-Control": "no-store" } });
    expect(inv).toHaveBeenCalledWith({ queryKey: ["/api/campaigns"] });
    expect(screen.getByTestId("panel-result").textContent).toContain("Generated");
  });

  it("year and company changes clear results and refetch scoped", async () => {
    const v = mount();
    fireEvent.click(await screen.findByTestId("button-generate"));
    fireEvent.click(screen.getByTestId("button-confirm-generate"));
    await screen.findByTestId("panel-result");
    fx.user = { ...fx.user, activeCompanyId: "co2" };
    v.rerender();
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("GET", `/api/campaign-generation/${yr}/preview`, undefined, { headers: { "X-Company-Id": "co2", "Cache-Control": "no-store" } }));
    expect(screen.queryByTestId("panel-result")).toBeNull();
    const other = yearChoices().years.find(y => y !== yr)!;
    fireEvent.click(screen.getByTestId(`button-year-${other}`));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("GET", `/api/campaign-generation/${other}/preview`, undefined, expect.anything()));
  });

  it("error state retries; empty state renders", async () => {
    fx.api.mockImplementationOnce(() => Promise.reject(new Error("500: {\"message\":\"boom\"}")));
    mount();
    expect((await screen.findByTestId("state-error")).textContent).toContain("boom");
    fx.api.mockImplementation(() => ok(report({ rounds: [], created: [], added: [], gaps: [], manualCampaigns: [] })));
    fireEvent.click(screen.getByTestId("button-retry"));
    await screen.findByTestId("state-empty");
  });

  it("shows enabled-time fallback after restart and live kept/missed decision links", async () => {
    const item = { ...ref, campaignId: "round1", itemId: "item1", propertyId: "p1", propertyName: "Retained property" };
    fx.api.mockImplementation((_m: string, path: string) => ok(path.endsWith("/status")
      ? { enabledAt: "2025-10-14T10:00:00Z", checkedAt: null, succeededAt: null, error: null, changes: 0, keptNotOwed: 0, missed: 0 }
      : report({ enabledAt: "2025-10-14T10:00:00Z", keptNotOwed: [item], missed: [{ ...item, itemId: null }] })));
    mount();
    expect((await screen.findByTestId("membership-last-check")).textContent).toContain("since server restart");
    expect(screen.getByTestId("text-status").textContent).toContain("automatically");
    expect(screen.getByTestId("panel-kept").textContent).toContain("Retained property");
    expect(screen.getByText("Review item / skip").getAttribute("href")).toBe("/dashboard/campaigns/round1/items/item1");
    expect(screen.getByTestId("panel-missed")).toBeTruthy();
  });

  it("shows failed check, last success, and hourly retry without claiming changes were saved", async () => {
    fx.api.mockImplementation((_m: string, path: string) => ok(path.endsWith("/status")
      ? { enabledAt: "2025-10-14T10:00:00Z", checkedAt: "2025-10-15T12:00:00Z", succeededAt: "2025-10-14T12:00:00Z",
        error: "Membership check failed. The hourly sweep will retry.", changes: 0, keptNotOwed: 0, missed: 0 }
      : report({ enabledAt: "2025-10-14T10:00:00Z" })));
    mount();
    await waitFor(() => expect(screen.getByTestId("membership-last-check").textContent).toContain("hourly sweep will retry"));
    expect(screen.getByTestId("membership-last-check").textContent).toContain("Last successful check");
    expect(screen.queryByTestId("panel-result")).toBeNull();
  });
});
