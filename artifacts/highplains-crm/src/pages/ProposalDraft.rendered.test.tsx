// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import en from "@/i18n/locales/en";
import es from "@/i18n/locales/es";
const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), advance: vi.fn(),
  user: { id: "u", activeCompanyId: "c", activeRole: "admin", accessRole: "admin" } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/estimates/ProposalEstimateSection", () => ({ ProposalEstimateSection: () => <div data-testid="estimate-section" /> }));
vi.mock("@/lib/advanceLinkedTicket", () => ({ advanceLinkedTicket: mocks.advance, ticketRequest: () => async () => ({ id: "e", ticketId: "t", versions: [] }) }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { apiRequest: mocks.api, queryClient: new QueryClient() };
});
import ProposalDraft from "./ProposalDraft";
import { queryClient } from "@/lib/queryClient";
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
  const client = queryClient;
  client.setDefaultOptions({ queries: { retry: false, queryFn: async () => [] }, mutations: { retry: false } });
  const loc = memoryLocation({ path: "/dashboard/proposals/p" });
  return render(<QueryClientProvider client={client}><TooltipProvider><Router hook={loc.hook}>
    <Route path="/dashboard/proposals/:id"><ProposalDraft /></Route>
  </Router></TooltipProvider></QueryClientProvider>);
}
async function openFinalize() {
  fireEvent.click(await screen.findByTestId("button-finalize-proposal"));
  return screen.findByTestId("button-confirm-finalize");
}
beforeEach(() => { queryClient.clear(); mocks.api.mockReset(); mocks.toast.mockReset(); mocks.advance.mockReset(); mocks.advance.mockResolvedValue({ moved: false, reason: "loadFailed" }); });
afterEach(async () => { cleanup(); queryClient.clear(); await i18n.changeLanguage("en"); });
describe("proposal finalize dialog and legacy uploads", () => {
  it("shows linked cover choices, persists scoped photo selection and keeps unlinked controls absent", async () => {
    const photo = { id: "f", fileType: "image", storageObjectPath: "/test/photo", filename: "Entrance.jpg", caption: "Entrance", displayOrder: 0 };
    const p = { ...base, coverSource: "none", coverPhotoFileId: null, files: [photo] };
    const view = mount(p);
    expect(await screen.findByTestId("proposal-cover-controls")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Visual Scope rendering" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use as cover" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("PATCH", "/api/proposals/p",
      { coverSource: "photo", coverPhotoFileId: "f" }, expect.objectContaining({ headers: { "X-Company-Id": "c" } })));
    expect(screen.getByText("Attachment layout:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Full page" })).toBeTruthy();
    view.unmount(); queryClient.clear();
    mount({ ...base, estimateId: null, estimate: null });
    await screen.findByTestId("banner-legacy-proposal");
    expect(screen.queryByTestId("proposal-cover-controls")).toBeNull();
  });
  it("renders Spanish cover and attachment copy", async () => {
    await i18n.changeLanguage("es");
    mount();
    expect(await screen.findByRole("heading", { name: "Portada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solo logotipo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Página completa" })).toBeTruthy();
  });
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
  it.each(["en", "es"])("legacy unlinked proposals are read-only but still preview, download and delete (%s)", async language => {
    await i18n.changeLanguage(language);
    mount({ ...base, estimateId: null, estimate: null, files: [{ id: "q", fileType: "estimate_pdf", storageObjectPath: "/x.pdf", filename: "qb.pdf", displayOrder: 0, fileSize: 1 }] });
    expect((await screen.findByTestId("banner-legacy-proposal")).textContent).toBe((language === "en" ? en : es).proposalP1.legacyBanner);
    expect(screen.queryByTestId("button-finalize-proposal")).toBeNull();
    expect(screen.queryByTestId("button-generate-crew-worksheet")).toBeNull();
    expect(screen.queryByTestId("button-upload-pdf")).toBeNull();
    expect(screen.queryByTestId("input-estimate-number")).toBeNull();
    expect((screen.getByTestId("fieldset-proposal-content") as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByTestId("button-preview-pdf") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("button-download-pdf")).toBeTruthy();
    const retained = screen.getByTestId("link-retained-estimate-q");
    expect(retained.getAttribute("href")).toBe("/objects/x.pdf");
    expect(retained.getAttribute("download")).toBe("qb.pdf");
    expect(retained.getAttribute("aria-label")).toBe(language === "en" ? "Download retained file qb.pdf" : "Descargar archivo conservado qb.pdf");
    expect(screen.queryByTestId("button-delete-file-q")).toBeNull();
    expect(retained.closest("fieldset")).toBeNull();
    expect((screen.getByTestId("button-delete-proposal") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("button-attach-palette")).toBeNull();
    await i18n.changeLanguage("en");
  });

  it.each(["en", "es"])("shows a legacy palette read-only with no active Remove control in %s", async language => {
    await i18n.changeLanguage(language);
    const copy = (language === "en" ? en : es).paletteRetirement;
    mount({ ...base, estimateId: null, estimate: null, plantPaletteId: "old", plantPalette: { title: "Old", items: [] } });
    expect(await screen.findByText(copy.legacyNote)).toBeTruthy();
    expect(screen.queryByTestId("button-remove-legacy-palette")).toBeNull();
    expect(screen.queryByTestId("button-attach-palette")).toBeNull();
    await i18n.changeLanguage("en");
  });
  it.each(["en", "es"])("P2: linked proposals have no scope editor; legacy shows its own scope read-only (%s)", async language => {
    await i18n.changeLanguage(language);
    const view = mount({ ...base, scopeOfWork: "Proposal copy" });
    await screen.findByTestId("text-proposal-title");
    expect(screen.queryByTestId("input-scope-of-work")).toBeNull();
    expect(screen.queryByTestId("button-insert-page-break")).toBeNull();
    expect(screen.queryByText("Proposal copy")).toBeNull();
    view.unmount(); queryClient.clear();
    mount({ ...base, estimateId: null, estimate: null, scopeOfWork: "Old typed scope" });
    expect((await screen.findByTestId("text-legacy-scope")).textContent).toBe("Old typed scope");
    expect(screen.queryByTestId("input-scope-of-work")).toBeNull();
    await i18n.changeLanguage("en");
  });

  it("never offers the legacy removal or palette editor on a linked proposal", async () => {
    mount({ ...base, plantPaletteId: "stale", plantPalette: { title: "Old", items: [] } });
    await screen.findByTestId("button-finalize-proposal");
    expect(screen.queryByText(en.paletteRetirement.legacyNote)).toBeNull();
    expect(screen.queryByTestId("button-remove-legacy-palette")).toBeNull();
    expect(screen.queryByTestId("button-attach-palette")).toBeNull();
  });
});
