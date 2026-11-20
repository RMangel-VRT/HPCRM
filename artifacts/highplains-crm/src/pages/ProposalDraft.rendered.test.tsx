// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import ProposalDraft from "./ProposalDraft";
import ProposalMaker from "./ProposalMaker";
import ProposalVersion from "./ProposalVersion";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u", accessRole: "office", activeRole: "office", activeCompanyId: "c" } }) }));
const path = "/dashboard/tools/proposals", api = "/api/proposals";
const base = { id: "historical", title: "Old garden project", proposalNumber: "P-0001", customerName: "Synthetic customer",
  customerId: "cust", proposalDate: "2026-11-03", status: "draft", estimateId: null, ticketId: null,
  files: [], versions: [], scopeOfWork: "Scope preserved" };
const version = { id: "saved", title: base.title, versionNumber: 2, proposalDate: base.proposalDate, finalizedAt: "2026-11-04T12:00:00Z" };
let fetchSpy: ReturnType<typeof vi.fn>;
function mount(route: string, data: object) {
  fetchSpy = vi.fn(async () => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchSpy);
  const loc = memoryLocation({ path: route, record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Router hook={loc.hook}><Switch>
    <Route path={`${path}/:id/versions/:versionId`} component={ProposalVersion} />
    <Route path={`${path}/:id`} component={ProposalDraft} />
    <Route path={path} component={ProposalMaker} />
  </Switch></Router></QueryClientProvider>);
  return loc;
}
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

describe("read-only proposal history", () => {
  it("lists both kinds of records under the old URL without any authoring links", async () => {
    mount(`${path}?ticketId=t1&ticketTitle=Historic`, [base, { ...base, id: "linked", estimateId: "e1", title: "Linked draft" }]);
    expect((await screen.findByTestId("text-proposal-title-historical")).getAttribute("href")).toBe(`${path}/historical`);
    expect(screen.getByTestId("text-proposal-title-linked").getAttribute("href")).toBe(`${path}/linked`);
    expect(screen.getByRole("heading", { name: "Old proposals" })).toBeTruthy();
    expect(screen.getByTestId("button-back-to-ticket").getAttribute("href")).toBe("/dashboard/tickets/t1");
    expect(screen.getByTestId("button-go-to-estimates").getAttribute("href")).toBe("/dashboard/estimates/builder");
    expect(screen.queryByText(/make proposal|create proposal|link existing/i)).toBeNull();
    expect(fetchSpy.mock.calls.map(call => call[0])).toEqual([api]);
  });

  it("keeps linked drafts previewable without any edit, link or finalize controls", async () => {
    mount(`${path}/${base.id}`, { ...base, estimateId: "e1", ticketId: "t1", versions: [version] });
    const preview = await screen.findByTestId("button-preview-pdf");
    expect(preview.getAttribute("href")).toBe(`${api}/${base.id}/pdf?inline=1`);
    expect(screen.getByTestId("link-back-to-ticket").getAttribute("href")).toBe("/dashboard/tickets/t1");
    expect(screen.getByTestId("button-download-version-saved").getAttribute("href")).toBe(`${api}/${base.id}/versions/saved/download`);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /finalize|generate|link estimate|upload/i })).toBeNull();
    expect(screen.getByTestId("banner-proposals-retired").textContent).toContain("Photos and plant pictures now go on the estimate.");
  });

  it("uses the newest stored PDF for finalized rows, and preserves the version deep link and original attachments", async () => {
    const finalized = { ...base, status: "finalized", versions: [version, { ...version, id: "older", versionNumber: 1 }],
      files: [{ id: "f", filename: "retained.pdf", fileType: "estimate_pdf", storageObjectPath: "/objects/original-a" }] };
    mount(`${path}/${base.id}`, finalized);
    const download = await screen.findByTestId("button-download-pdf");
    expect(download.getAttribute("href")).toBe(`${api}/${base.id}/versions/saved/download`);
    expect(screen.getByTestId("link-retained-estimate-f").getAttribute("href")).toBe("/objects/original-a");
    await userEvent.click(screen.getByTestId("button-view-version-older"));
    expect(await screen.findByTestId("text-version-title")).toBeTruthy();
    expect(screen.queryByTestId("button-create-new-version")).toBeNull();
  });

  it("localizes the retirement banner and explains when no original PDF survives", async () => {
    await i18n.changeLanguage("es");
    mount(`${path}/${base.id}`, base);
    expect((await screen.findByTestId("banner-proposals-retired")).textContent).toContain("Las propuestas ya no se crean.");
    expect(screen.getByTestId("text-proposal-preview-kind").textContent).toBe("No hay un PDF disponible para esta propuesta.");
    expect(screen.queryByTestId("button-download-pdf")).toBeNull();
  });

  it("sends no deletion on cancel and binds the confirmed delete to the active company", async () => {
    const loc = mount(`${path}/${base.id}`, base);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("button-delete-proposal"));
    await user.click(screen.getByTestId("button-cancel-delete-proposal"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("button-delete-proposal"));
    fetchSpy.mockResolvedValueOnce(new Response('{"success":true}')).mockResolvedValueOnce(new Response("[]"));
    await user.click(screen.getByTestId("button-confirm-delete-proposal"));
    await waitFor(() => expect(loc.history.at(-1)).toBe(path));
    const call = fetchSpy.mock.calls.find(call => call[1]?.method === "DELETE");
    expect(call?.[0]).toBe(`${api}/${base.id}`);
    expect(new Headers(call?.[1].headers).get("X-Company-Id")).toBe("c");
  });
});
