// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";
const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), advance: vi.fn(),
  user: { id: "u", activeCompanyId: "c", activeRole: "admin" } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/estimates/ProposalEstimateSection", () => ({ ProposalEstimateSection: () => <div data-testid="estimate-section" /> }));
vi.mock("@/lib/advanceLinkedTicket", () => ({ advanceLinkedTicket: mocks.advance, ticketRequest: () => async () => ({ id: "e", ticketId: "t", versions: [] }) }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { apiRequest: mocks.api, queryClient: new QueryClient() };
});
import ProposalDraft from "./ProposalDraft";
const base = {
  id: "p", companyId: "c", customerId: "cust", title: "Front beds", proposalDate: "2026-11-03",
  status: "draft", scopeOfWork: "", files: [], versions: [], plantItems: [], photoLayout: "large",
  estimateId: "e", estimateNumber: "EST-1", estimate: { id: "e", number: "EST-1", title: "Beds",
    currentVersion: { id: "v", versionNumber: 1, status: "draft" }, subtotalCents: 1200 },
};
const ok = (value: unknown) => ({ ok: true, json: async () => value });
function mount(proposal: Record<string, unknown> = base) {
  mocks.api.mockImplementation(async (method: string, url: string) => {
    if (method === "GET" && url === "/api/proposals/p") return ok(proposal);
    if (method === "GET" && url === "/api/proposals/p/exhibits") return ok({
      schedule: [], palette: { introText: "", groups: [] },
      provenance: { estimateId: "e", estimateNumber: "EST-1", versionId: "v", versionNumber: 1 },
    });
    if (method === "GET" && url === "/api/estimates/e") return ok({ version: { id: "v", sections: [{ lines: [{ id: "l", name: "Unpriced tree" }] }] } });
    return ok([]);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [] } } });
  const loc = memoryLocation({ path: "/dashboard/proposals/p" });
  return render(<QueryClientProvider client={client}><TooltipProvider><Router hook={loc.hook}>
    <Route path="/dashboard/proposals/:id"><ProposalDraft /></Route>
  </Router></TooltipProvider></QueryClientProvider>);
}
async function openFinalize() {
  fireEvent.click(await screen.findByTestId("button-finalize-proposal"));
  return screen.findByTestId("button-confirm-finalize");
}
beforeEach(() => { mocks.api.mockReset(); mocks.toast.mockReset(); mocks.advance.mockReset(); mocks.advance.mockResolvedValue({ moved: false, reason: "loadFailed" }); });
afterEach(() => cleanup());
describe("proposal finalize dialog and legacy uploads", () => {
  it("linked proposals need no upload, hide the upload control and require a method before locking", async () => {
    mount();
    const submit = await openFinalize() as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/Finalizing marks EST-1 v1 as Sent/)).toBeTruthy();
    expect(screen.queryByTestId("button-upload-pdf")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Portal" }));
    expect(submit.disabled).toBe(false);
  });
  it("confirms unpriced lines, retries with confirmation and advances the ticket without undoing finalized success", async () => {
    mount();
    const submit = await openFinalize();
    fireEvent.click(screen.getByRole("radio", { name: "Email" }));
    const original = mocks.api.getMockImplementation()!;
    let attempts = 0;
    mocks.api.mockImplementation(async (method: string, url: string, body: unknown, opts: unknown) => {
      if (url.endsWith("/finalize")) {
        if (++attempts === 1) throw new Error('409: {"error":"LINES_NEED_PRICE","lineIds":["l"]}');
        return ok({ versionNumber: 1, estimateTransition: { sent: true, estimateId: "e", versionId: "v" } });
      }
      return original(method, url, body, opts);
    });
    fireEvent.click(submit);
    expect(await screen.findByText("Unpriced tree")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-confirm-finalize"));
    await waitFor(() => expect(mocks.advance).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenCalledWith("POST", "/api/proposals/p/finalize",
      { estimateSendMethod: "email", confirmZeroPriced: true, expectedEstimateVersionId: "v" },
      expect.objectContaining({ headers: { "X-Company-Id": "c" } }));
    expect(screen.queryByTestId("button-confirm-finalize")).toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("1") }));
  });
  it("leaves partial-success failure visible for retry and explains that send remains committed", async () => {
    mount();
    const submit = await openFinalize();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (method: string, url: string, body: unknown, opts: unknown) =>
      url.endsWith("/finalize") ? Promise.reject(new Error('500: {"error":"PROPOSAL_FINALIZE_FAILED"}')) : original(method, url, body, opts));
    fireEvent.click(submit);
    expect(await screen.findByText(/already sent and remains locked/)).toBeTruthy();
    expect(screen.getByTestId("button-confirm-finalize")).toBeTruthy();
    expect(mocks.advance).not.toHaveBeenCalled();
  });
  it("sent/accepted versions require no method and do not advance a new send event", async () => {
    mount({ ...base, estimate: { ...base.estimate, currentVersion: { ...base.estimate.currentVersion, status: "accepted" } } });
    const submit = await openFinalize() as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(screen.queryByRole("radio")).toBeNull();
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (method: string, url: string, body: unknown, opts: unknown) =>
      url.endsWith("/finalize") ? ok({ versionNumber: 2, estimateTransition: { sent: false } }) : original(method, url, body, opts));
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByTestId("button-confirm-finalize")).toBeNull());
    expect(mocks.advance).not.toHaveBeenCalled();
  });
  it("unlinked legacy proposals retain uploads and cannot finalize without one", async () => {
    mount({ ...base, estimateId: null, estimate: null });
    const finalize = await screen.findByTestId("button-finalize-proposal") as HTMLButtonElement;
    expect(finalize.disabled).toBe(true);
    expect(screen.getByTestId("button-upload-pdf")).toBeTruthy();
  });
});
