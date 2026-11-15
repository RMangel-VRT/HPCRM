// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import en from "@/i18n/locales/en";
import es from "@/i18n/locales/es";
const mocks = vi.hoisted(() => ({ user: { id: "u", activeCompanyId: "c", activeRole: "admin", accessRole: "admin" }, api: vi.fn(), toast: vi.fn() }));
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

  it("has no unlink control and offers switching a draft proposal to another eligible estimate", async () => {
    mocks.api.mockImplementation(async (_m: string, url: string) => url.startsWith("/api/estimates?")
      ? ok([{ id: "e2", estimateNumber: "EST-8", title: "Alt", subtotalCents: 5, voidedAt: null }, { id: "v", estimateNumber: "EST-9", title: "V", voidedAt: "x" }])
      : ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x", version: { id: "v", versionNumber: 2, status: "sent", frozenSubtotalCents: 1 } }));
    renderIt({ ...base, estimateId: "e", status: "draft", estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: null } } as never);
    expect(await screen.findByTestId("row-proposal-estimate-switch")).toBeTruthy();
    expect(screen.queryByTestId("button-proposal-estimate-unlink")).toBeNull();
    expect((screen.getByTestId("button-proposal-estimate-switch") as HTMLButtonElement).disabled).toBe(true);
  });
  it("hides switching for finalized proposals", async () => {
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x", version: { id: "v", versionNumber: 2, status: "sent", frozenSubtotalCents: 1 } }));
    renderIt({ ...base, estimateId: "e", status: "finalized", estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: null } } as never);
    expect(await screen.findByTestId("card-proposal-estimate")).toBeTruthy();
    expect(screen.queryByTestId("row-proposal-estimate-switch")).toBeNull();
  });
  it("renders nothing for legacy unlinked proposals (no create or link)", () => {
    const { container } = renderIt();
    expect(container.textContent).toBe("");
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("previews the authoritative current version and uses frozen totals for sent estimates", async () => {
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x",
      version: { id: "sent-v2", versionNumber: 2, status: "sent", frozenSubtotalCents: 9876, totals: { subtotalCents: 1 } } }));
    renderIt({ ...base, estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: { id: "v", versionNumber: 1, status: "draft" } } });
    await waitFor(() => expect(screen.getByTestId("text-proposal-estimate-total").textContent).toContain("98.76"));
    fireEvent.click(screen.getByTestId("button-proposal-estimate-preview"));
    expect(screen.getByTestId("preview-stub").textContent).toBe("sent-v2:false");
  });
  it.each(["en", "es"])("P2: shows the current estimate version scope read-only with Edit in estimate (%s)", async language => {
    await i18n.changeLanguage(language);
    const copy = (language === "en" ? en : es).proposalP2;
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x",
      version: { id: "v2", versionNumber: 2, status: "draft", scopeOfWork: "Edge beds\n[PAGE BREAK]\nMulch", totals: { subtotalCents: 1 } } }));
    const { loc } = renderIt({ ...base, estimateId: "e", scopeOfWork: "stale proposal copy", estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: { id: "v2", versionNumber: 2, status: "draft" } } } as never);
    expect((await screen.findByTestId("text-proposal-estimate-scope")).textContent).toContain("Edge beds");
    expect(screen.queryByText(/stale proposal copy/)).toBeNull();
    expect(screen.getByTestId("text-scope-source").textContent).toBe(copy.scopeSource);
    fireEvent.click(screen.getByText(copy.editInEstimate));
    expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e");
    await i18n.changeLanguage("en");
  });
  it.each(["en", "es"])("P2: empty estimate scope shows the prescribed empty state, never proposal text (%s)", async language => {
    await i18n.changeLanguage(language);
    mocks.api.mockResolvedValue(ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x",
      version: { id: "v", versionNumber: 1, status: "draft", scopeOfWork: "", totals: { subtotalCents: 1 } } }));
    renderIt({ ...base, estimateId: "e", scopeOfWork: "proposal copy", estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: null } } as never);
    expect((await screen.findByTestId("text-proposal-estimate-scope-empty")).textContent).toBe((language === "en" ? en : es).proposalP2.scopeEmpty);
    expect(screen.queryByText("proposal copy")).toBeNull();
    await i18n.changeLanguage("en");
  });
  it("hides estimate switching once the proposal has finalized versions", async () => {
    mocks.api.mockImplementation(async (_m: string, url: string) => url.startsWith("/api/estimates?")
      ? ok([{ id: "e2", estimateNumber: "EST-8", title: "Alt", subtotalCents: 5, voidedAt: null }])
      : ok({ id: "e", estimateNumber: "EST-7", title: "Beds", voidedAt: null, updatedAt: "x", version: { id: "v", versionNumber: 1, status: "sent", frozenSubtotalCents: 1 } }));
    renderIt({ ...base, estimateId: "e", status: "draft", versions: [{ id: "pv1", versionNumber: 1 }], estimate: { id: "e", number: "EST-7", title: "Beds", subtotalCents: 1, currentVersion: null } } as never);
    expect(await screen.findByTestId("card-proposal-estimate")).toBeTruthy();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByTestId("row-proposal-estimate-switch")).toBeNull();
    expect(mocks.api.mock.calls.some(c => String(c[1]).startsWith("/api/estimates?"))).toBe(false);
  });
});
