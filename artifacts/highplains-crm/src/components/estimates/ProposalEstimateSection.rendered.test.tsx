// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
const mocks = vi.hoisted(() => ({ user: { id: "u", activeCompanyId: "c", activeRole: "admin" }, api: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
vi.mock("./TicketAdvanceNotice", () => ({ TicketAdvanceNotice: () => <div data-testid="notice-stub" /> }));
vi.mock("./PdfPreviewDialog", () => ({ PdfPreviewDialog: (p: { versionId: string; draft: boolean }) => <div data-testid="preview-stub">{p.versionId}:{String(p.draft)}</div> }));
import { ProposalEstimateSection } from "./ProposalEstimateSection";

const base = { id: "p", title: "Front beds", customerId: "cust", ticketId: null as string | null, estimate: null as unknown };
function renderIt(proposal = base, onLinked = vi.fn()) {
  const loc = memoryLocation({ path: "/dashboard/proposals/p", record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><Router hook={loc.hook}>
    <ProposalEstimateSection proposal={proposal as never} companyId="c" active={() => true} onLinked={onLinked} />
  </Router></QueryClientProvider>);
  return { loc, onLinked, ...rendered };
}
const ok = (body: unknown) => ({ json: async () => body });
beforeEach(() => { mocks.api.mockReset(); mocks.toast.mockReset(); });
afterEach(() => cleanup());

describe("proposal estimate section", () => {
  it("renders linked summary with authoritative total and mounts recovery notice", async () => {
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x", version: { id: "v", versionNumber: 2, status: "draft", totals: { subtotalCents: 123456 } } }));
    renderIt({ ...base, estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 123456, currentVersion: { id: "v", versionNumber: 2, status: "draft" } } });
    expect(screen.getByTestId("badge-proposal-estimate-number").textContent).toContain("EST-7");
    expect(screen.getByTestId("text-proposal-estimate-total").textContent).toContain("1,234.56");
    await waitFor(() => expect(screen.getByTestId("notice-stub")).toBeTruthy());
    expect(mocks.api.mock.calls[0][1]).toBe("/api/estimates/e");
  });

  it("unlinks with estimateId null", async () => {
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x", version: { id: "v", versionNumber: 2, status: "sent", frozenSubtotalCents: 1 } }));
    const { onLinked } = renderIt({ ...base, estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: null } });
    fireEvent.click(screen.getByTestId("button-proposal-estimate-unlink"));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/proposals/p", { estimateId: null }, expect.anything());
  });

  it("creates, links and opens builder when no candidates", async () => {
    mocks.api.mockImplementation(async (method: string, url: string) => {
      if (method === "GET") return ok([]);
      if (method === "POST") return ok({ id: "new" });
      return ok({});
    });
    const { loc } = renderIt();
    fireEvent.click(await screen.findByTestId("button-proposal-estimate-create"));
    await waitFor(() => expect(loc.history?.at(-1)).toContain("/dashboard/estimates/builder/new"));
    expect(mocks.api).toHaveBeenCalledWith("POST", "/api/estimates", { customerId: "cust", title: "Front beds" }, expect.anything());
    expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/proposals/p", { estimateId: "new" }, expect.anything());
  });

  it("suggests the ticket estimate", async () => {
    mocks.api.mockResolvedValue(ok({ id: "s", estimateNumber: "EST-9", title: "T" }));
    renderIt({ ...base, ticketId: "t" });
    expect((await screen.findByTestId("badge-proposal-estimate-suggestion")).textContent).toContain("EST-9");
    expect(mocks.api.mock.calls[0][1]).toBe("/api/estimates/by-ticket/t");
    fireEvent.click(screen.getByTestId("button-proposal-estimate-link"));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/proposals/p", { estimateId: "s" }, expect.objectContaining({ headers: { "X-Company-Id": "c" } })));
  });

  it("shows retryable error", async () => {
    mocks.api.mockRejectedValueOnce(new Error("500: x")).mockResolvedValue(ok([]));
    renderIt();
    fireEvent.click(await screen.findByTestId("button-proposal-estimate-retry"));
    expect(await screen.findByTestId("button-proposal-estimate-create")).toBeTruthy();
  });
  it("offers customer non-void estimates in the picker", async () => {
    mocks.api.mockResolvedValue(ok([{ id: "eligible", estimateNumber: "EST-3", title: "Beds", subtotalCents: 1000, voidedAt: null }]));
    renderIt();
    expect(await screen.findByTestId("select-proposal-estimate")).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith("GET", "/api/estimates?customerId=cust", undefined, expect.objectContaining({ headers: { "X-Company-Id": "c" } }));
  });
  it("previews the authoritative current version and uses frozen totals for sent estimates", async () => {
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x",
      version: { id: "sent-v2", versionNumber: 2, status: "sent", frozenSubtotalCents: 9876, totals: { subtotalCents: 1 } } }));
    renderIt({ ...base, estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: { id: "v", versionNumber: 1, status: "draft" } } });
    await waitFor(() => expect(screen.getByTestId("text-proposal-estimate-total").textContent).toContain("98.76"));
    fireEvent.click(screen.getByTestId("button-proposal-estimate-preview"));
    expect(screen.getByTestId("preview-stub").textContent).toBe("sent-v2:false");
  });
  it("does not link or navigate after an old-scope create resolves following unmount", async () => {
    let resolve!: (value: unknown) => void;
    mocks.api.mockImplementation(async (method: string) => method === "POST" ? new Promise(r => { resolve = r; }) : ok([]));
    const { unmount, onLinked, loc } = renderIt();
    fireEvent.click(await screen.findByTestId("button-proposal-estimate-create"));
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    unmount(); resolve(ok({ id: "old-company-estimate" }));
    await new Promise(r => setTimeout(r, 0));
    expect(mocks.api.mock.calls.some(c => c[0] === "PATCH")).toBe(false);
    expect(onLinked).not.toHaveBeenCalled();
    expect(loc.history?.at(-1)).not.toContain("/builder/");
  });
});
