// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";
import i18n from "@/i18n";
const mocks = vi.hoisted(() => ({ user: { id: "u", activeCompanyId: "c", activeRole: "admin" }, api: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
import { TicketEstimatePanel } from "./TicketEstimatePanel";
const ticket = { id: "t", title: "Working title", customerId: "customer", currentStatusId: "lost" };
const statuses = [{ id: "lost", statusKey: "closed_lost" }];
const type = { name: "Renamed", typeKey: "estimate_request" };
const draft = { id: "e", ticketId: null, voidedAt: null, estimateNumber: "EST-1", updatedAt: "now",
  subtotalCents: 12345,
  version: { id: "v3", versionNumber: 3, status: "draft", totals: { subtotalCents: 12345 } },
  versions: [{ id: "v3", versionNumber: 3, status: "draft" }] };
function renderPanel(role = "admin", props: Record<string, unknown> = {}) {
  mocks.user.activeRole = role;
  const loc = memoryLocation({ path: "/dashboard/tickets/t", record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><Router hook={loc.hook}>
    <TooltipProvider><TicketEstimatePanel ticket={ticket} ticketType={type} statuses={statuses} {...props} /></TooltipProvider>
  </Router></QueryClientProvider>);
  return { ...result, loc, client };
}
beforeEach(() => {
  mocks.user = { id: "u", activeCompanyId: "c", activeRole: "admin" };
  mocks.api.mockReset(); mocks.toast.mockReset();
  mocks.api.mockResolvedValue({ json: async () => null });
});
afterEach(async () => { cleanup(); await i18n.changeLanguage("en"); });

describe("ticket estimate panel", () => {
  it.each(["field", "field_manager", "crew_supervisor", "mapping", "chemical_manager", "shop_manager", "landscape_supervisor"])("never fetches for %s", role => {
    renderPanel(role);
    expect(screen.queryByTestId("ticket-estimate-panel")).toBeNull(); expect(mocks.api).not.toHaveBeenCalled();
  });
  it("uses stable identity, not the matching display name of a different type", () => {
    renderPanel("admin", { ticketType: { typeKey: "project", name: "Estimate Request" } });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it.each(["admin", "office"])("creates with ticket/customer/title then opens builder for %s", async role => {
    mocks.api.mockImplementation(async (method: string) => ({ json: async () => method === "POST" ? { id: "new" } : null }));
    const { loc } = renderPanel(role);
    fireEvent.click(await screen.findByRole("button", { name: "+ Create estimate" }));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/new"));
    expect(mocks.api).toHaveBeenCalledWith("POST", "/api/estimates", { ticketId: "t", customerId: "customer", title: "Working title" }, { headers: { "X-Company-Id": "c" }, signal: undefined });
  });
  it("opens existing estimate after the documented 409", async () => {
    mocks.api.mockImplementation(async (method: string) => {
      if (method === "POST") throw new Error('409: {"error":"ESTIMATE_EXISTS","existingEstimateId":"existing"}');
      return { json: async () => null };
    });
    const { loc } = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "+ Create estimate" }));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/existing"));
  });
  it("disables creation without a customer and explains why via keyboard tooltip", async () => {
    renderPanel("admin", { ticket: { ...ticket, customerId: null } });
    const button = await screen.findByRole("button", { name: "+ Create estimate" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.focus(button.parentElement!);
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("Add a customer");
  });
  it.each(["en", "es"])("shows frozen/live totals, older acceptance, date/method/PO and current builder link in %s", async lang => {
    await i18n.changeLanguage(lang);
    mocks.api.mockResolvedValue({ json: async () => ({ ...draft, versions: [...draft.versions,
      { id: "v2", versionNumber: 2, status: "accepted", acceptedOn: "2026-10-29", acceptanceMethod: "phone", poNumber: "PO-2" }] }) });
    renderPanel();
    expect(await screen.findByText("EST-1")).toBeTruthy();
    expect(screen.getByText("$123.45")).toBeTruthy();
    expect(screen.getByText(lang === "en" ? "v2 accepted · v3 change order in draft" : "v2 aceptada · v3 orden de cambio en borrador")).toBeTruthy();
    expect(screen.getByText(/PO-2/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Void estimate" })).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/dashboard/estimates/builder/e");
  });
  it("voids an open estimate on a closed-lost ticket with the exact lifecycle reason", async () => {
    mocks.api.mockResolvedValue({ json: async () => draft });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Void estimate" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("POST", "/api/estimates/e/void", { reason: "Ticket closed lost" }, { headers: { "X-Company-Id": "c" }, signal: undefined }));
  });
  it("does not navigate a late create response into a new company", async () => {
    let resolve!: (value: unknown) => void;
    mocks.api.mockImplementation(async (method: string) => method === "POST" ? new Promise(r => { resolve = r; }) : { json: async () => null });
    const view = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "+ Create estimate" }));
    view.unmount();
    mocks.user.activeCompanyId = "new-company";
    resolve({ json: async () => ({ id: "old-company-estimate" }) });
    await waitFor(() => expect(view.loc.history?.at(-1)).toBe("/dashboard/tickets/t"));
  });
});
