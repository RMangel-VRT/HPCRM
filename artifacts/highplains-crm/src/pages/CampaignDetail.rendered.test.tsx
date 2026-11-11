// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";

const fx = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), invalidate: vi.fn(),
  role: "admin",
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "co1", accessRole: fx.role } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => fx.api(...args),
  queryClient: { invalidateQueries: fx.invalidate },
}));
// Crew-list behavior has its own rendered suite. Keep its inherited mount visible.
vi.mock("@/components/campaigns/GeneratedRoundView", () => ({ default: () => <div data-testid="generated-crew-lists" /> }));
vi.mock("@/components/ExtraBillableCampaignView", () => ({ default: () => null }));
import CampaignDetail from "./CampaignDetail";

const ok = (data: unknown) => Promise.resolve({ json: async () => data });
const fixture = (over: Record<string, unknown> = {}) => ({
  id: "c1", title: "2027 Aeration April", source: "contract", serviceKey: "aeration",
  roundMonth: "2027-04-01", category: "general", status: "active", description: "Before",
  assignedToId: null, assignedToId2: null, notificationTemplateId: null,
  windowStart: "2027-04-01", windowEnd: "2027-04-30", seasonId: "s1", seasonName: "2027",
  items: [{ id: "i1", customerId: "p1", customerName: "First Property", customerCity: "Denver", status: "pending" }],
  totalItems: 1, completedItems: 0, skippedItems: 0,
  ...over,
});
const members = ["u1", "u2"].map(id => ({
  companyUser: { userId: id, role: "chemical_manager" }, user: { name: id === "u1" ? "Alex" : "Blair" },
}));
const clients: QueryClient[] = [];
function mount(over: Record<string, unknown> = {}) {
  const campaign = fixture(over);
  fx.api.mockImplementation((method: string, path: string) => ok(method === "GET" ? campaign : {}));
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false,
    queryFn: async ({ queryKey }) => {
      switch (queryKey[0]) {
        case "/api/seasons": return [{ id: "s1", name: "2027" }];
        case "/api/companies/users": return members;
        case "/api/chemical-notification-templates": return [{ id: "tpl1", name: "Custom chemical notice" }];
        case "/api/customers": return { customers: [{ id: "p2", name: "Second Property", city: "Denver", active: "true" }] };
        default: return [];
      }
    },
  }, mutations: { retry: false } } });
  clients.push(qc);
  const loc = memoryLocation({ path: "/dashboard/campaigns/c1" });
  render(<QueryClientProvider client={qc}><Router hook={loc.hook}><TooltipProvider delayDuration={0}>
    <Route path="/dashboard/campaigns/:id"><CampaignDetail /></Route>
  </TooltipProvider></Router></QueryClientProvider>);
  return qc;
}
async function edit() {
  fireEvent.click(await screen.findByTestId("button-edit-campaign"));
  await screen.findByTestId("input-edit-campaign-description");
}
// Exercise Radix selections with keyboard, not a mocked select component.
async function select(testId: string, label: string) {
  fireEvent.keyDown(screen.getByTestId(testId), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}
function writes() { return fx.api.mock.calls.filter(([method]) => method !== "GET"); }
beforeEach(() => {
  fx.api.mockReset(); fx.toast.mockReset(); fx.invalidate.mockReset(); fx.role = "admin";
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
});
afterEach(() => { cleanup(); clients.splice(0).forEach(qc => qc.clear()); });

describe("Campaign detail generated editing", () => {
  it("shows contract badge and tooltip, read-only season, inherited crew lists and permitted actions", async () => {
    mount();
    const badge = await screen.findByTestId("badge-from-contracts");
    expect(badge.textContent).toBe("From contracts");
    fireEvent.focus(badge);
    expect((await screen.findByRole("tooltip")).textContent).toBe("This round is built from contract scope. Its properties, dates and title follow the contracts.");
    expect(screen.queryByTestId("button-delete-campaign")).toBeNull();
    expect(screen.queryByTestId("button-assign-season")).toBeNull();
    expect(screen.getByTestId("text-campaign-season").textContent).toBe("Season: 2027");
    expect(screen.getByTestId("button-archive-campaign")).toBeTruthy();
    expect(screen.getByTestId("generated-crew-lists")).toBeTruthy();
  });

  it.each(["general", "chemical"])("edits generated %s with exact allowed payload and no membership requests", async category => {
    const qc = mount({ category });
    await edit();
    expect(screen.queryByTestId("input-edit-campaign-title")).toBeNull();
    expect(screen.queryByTestId("button-edit-start-date")).toBeNull();
    expect(screen.queryByTestId("button-edit-end-date")).toBeNull();
    expect(screen.getByTestId("text-edit-campaign-title").textContent).toBe("2027 Aeration April");
    expect(screen.getByTestId("text-edit-start-date").textContent).toBe("2027-04-01");
    expect(screen.getByTestId("text-edit-end-date").textContent).toBe("2027-04-30");
    expect(screen.queryByText("Add Properties")).toBeNull();
    expect(screen.queryByTestId("button-remove-item-i1")).toBeNull();
    expect(screen.getByTestId("text-contract-scope-note").textContent).toBe("Properties follow contract scope. To add or remove one, change its contract in the Contract Center.");
    expect(screen.getByRole("link", { name: "Contract Center" }).getAttribute("href")).toBe("/dashboard/contracts");
    expect(qc.getQueryState(["/api/customers"])?.fetchStatus).not.toBe("fetching");
    fireEvent.change(screen.getByTestId("input-edit-campaign-description"), { target: { value: "  Updated  " } });
    await select("select-edit-assignee", "Alex");
    await select("select-edit-assignee2", "Blair");
    if (category === "chemical") await select("select-edit-notification-template", "Custom chemical notice");
    else expect(screen.queryByTestId("select-edit-notification-template")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-edit-campaign"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith({ title: "Campaign updated successfully" }));
    expect(writes()).toEqual([["PATCH", "/api/campaigns/c1", {
      description: "Updated", assignedToId: "u1", assignedToId2: "u2",
      ...(category === "chemical" ? { notificationTemplateId: "tpl1" } : {}),
    }]]);
    expect(fx.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/campaigns", "c1"] });
  });

  it.each(["general", "chemical"])("sends explicit nulls for cleared generated %s values, skipping manual shape validation", async category => {
    mount({ category, title: "", windowStart: "", windowEnd: "" });
    await edit();
    fireEvent.change(screen.getByTestId("input-edit-campaign-description"), { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("button-save-edit-campaign"));
    await waitFor(() => expect(writes()).toEqual([["PATCH", "/api/campaigns/c1", {
      description: null, assignedToId: null, assignedToId2: null,
      ...(category === "chemical" ? { notificationTemplateId: null } : {}),
    }]]));
  });

  it("retains archive/reactivation status-only requests", async () => {
    mount({ status: "archived" });
    fireEvent.click(await screen.findByTestId("button-reactivate-campaign"));
    await waitFor(() => expect(writes()).toEqual([["PATCH", "/api/campaigns/c1", { status: "active" }]]));
    expect(screen.queryByTestId("button-delete-campaign")).toBeNull();
    expect(screen.queryByTestId("button-assign-season")).toBeNull();
  });

  it("preserves existing role gates", async () => {
    fx.role = "office";
    mount();
    await screen.findByTestId("badge-from-contracts");
    expect(screen.queryByTestId("button-edit-campaign")).toBeNull();
    expect(screen.getByTestId("button-archive-campaign")).toBeTruthy();
  });

  it("keeps manual fields, membership controls, full save payload and add/remove behavior", async () => {
    mount({ source: "manual", category: "chemical" });
    await edit();
    expect(screen.queryByTestId("badge-from-contracts")).toBeNull();
    expect(screen.getByTestId("button-edit-start-date")).toBeTruthy();
    expect(screen.getByTestId("button-edit-end-date")).toBeTruthy();
    expect(screen.getByTestId("button-delete-campaign")).toBeTruthy();
    expect(screen.getByTestId("button-assign-season")).toBeTruthy();
    expect(screen.queryByTestId("text-contract-scope-note")).toBeNull();
    fireEvent.change(screen.getByTestId("input-edit-campaign-title"), { target: { value: "  Manual updated  " } });
    fireEvent.click(screen.getByTestId("button-remove-item-i1"));
    fireEvent.click(await screen.findByTestId("edit-add-customer-p2"));
    fireEvent.click(screen.getByTestId("button-save-edit-campaign"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith({ title: "Campaign updated successfully" }));
    expect(writes()).toEqual([
      ["PATCH", "/api/campaigns/c1", { title: "Manual updated", description: "Before", assignedToId: null, assignedToId2: null, windowStart: "2027-04-01", windowEnd: "2027-04-30", notificationTemplateId: null }],
      ["DELETE", "/api/campaigns/c1/items/i1"],
      ["POST", "/api/campaigns/c1/items", { customerIds: ["p2"] }],
    ]);
  });

  it.each([
    [{ title: "" }, "Title is required"],
    [{ windowStart: "" }, "Start and end dates are required"],
    [{ windowStart: "2027-05-01" }, "Start date must be before or equal to end date"],
  ])("retains manual validation for %j", async (over, message) => {
    mount({ source: "manual", ...over });
    await edit();
    fireEvent.click(screen.getByTestId("button-save-edit-campaign"));
    expect(fx.toast).toHaveBeenCalledWith({ title: message, variant: "destructive" });
    expect(writes()).toEqual([]);
  });

  it.each(["edit", "delete", "season"])("shows server message or safe fallback on %s failure", async action => {
    mount({ source: "manual" });
    await screen.findByTestId("button-edit-campaign");
    let message = "409: {\"message\":\"Server says no\",\"error\":\"INTERNAL_CODE\"}";
    fx.api.mockImplementation((method: string) => method === "GET" ? ok(fixture({ source: "manual" })) : Promise.reject(new Error(message)));
    if (action === "edit") await edit();
    if (action === "delete") fireEvent.click(screen.getByTestId("button-delete-campaign"));
    if (action === "season") fireEvent.click(screen.getByTestId("button-assign-season"));
    const button = action === "edit" ? "button-save-edit-campaign" : action === "delete" ? "button-confirm-delete-campaign" : "button-confirm-assign-season";
    fireEvent.click(screen.getByTestId(button));
    await waitFor(() => expect(fx.toast).toHaveBeenLastCalledWith({ title: "Server says no", variant: "destructive" }));
    for (const invalid of ["500: Internal Server Error", "409: {\"message\":\"   \"}", "409: {\"message\":42}", "Network unavailable"]) {
      message = invalid;
      fireEvent.click(screen.getByTestId(button));
      await waitFor(() => expect(fx.toast).toHaveBeenLastCalledWith({
        title: action === "edit" ? "Failed to save changes" : action === "delete" ? "Failed to delete campaign" : "Failed to update season",
        variant: "destructive",
      }));
      await waitFor(() => expect(screen.getByTestId(button).hasAttribute("disabled")).toBe(false));
      fx.toast.mockClear();
    }
  });
});
