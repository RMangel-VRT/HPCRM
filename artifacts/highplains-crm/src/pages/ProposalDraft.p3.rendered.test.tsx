// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(),
  user: { id: "u", activeCompanyId: "c", activeRole: "admin", accessRole: "admin" } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/estimates/ProposalEstimateSection", () => ({ ProposalEstimateSection: (p: { hideHeading?: boolean }) => <div data-testid="estimate-section" data-hide-heading={String(!!p.hideHeading)} /> }));
vi.mock("@/lib/advanceLinkedTicket", () => ({ advanceLinkedTicket: vi.fn(), ticketRequest: () => async () => ({}) }));
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { apiRequest: mocks.api, queryClient: new QueryClient() };
});
import ProposalDraft from "./ProposalDraft";
import { queryClient } from "@/lib/queryClient";

const photo = (id: string, order: number) => ({ id, fileType: "image", storageObjectPath: `/t/${id}`, filename: `${id}.jpg`, caption: id, displayOrder: order, fileSize: 1000 });
const base = {
  id: "p", companyId: "c", customerId: "cust", customerName: "Delgado Residence", title: "Front beds", proposalNumber: "PR-0042",
  proposalDate: "2026-11-03", status: "draft", scopeOfWork: "", files: [], versions: [], plantItems: [], photoLayout: "large",
  estimateId: "e", estimateNumber: "EST-1", estimate: { id: "e", number: "EST-1", title: "Beds",
    currentVersion: { id: "v", versionNumber: 1, status: "draft" }, subtotalCents: 487250 },
};
const ok = (value: unknown) => ({ ok: true, json: async () => value, text: async () => "" });
let exhibits: unknown;
let estimateDetail: unknown;
const detail = (scopeOfWork: string | null) => ({ id: "e", estimateNumber: "EST-1", title: "Beds", version: { id: "v", versionNumber: 1, status: "draft", scopeOfWork, totals: { subtotalCents: 487250 }, frozenSubtotalCents: null } });
function mount(proposal: Record<string, unknown> = base) {
  mocks.api.mockImplementation(async (method: string, url: string) => {
    if (method === "GET" && url === "/api/proposals/p") return ok(proposal);
    if (method === "GET" && url === "/api/proposals/p/exhibits") return ok(exhibits);
    if (method === "GET" && url === "/api/estimates/e") return ok(estimateDetail);
    if (method === "GET" && url === "/api/tickets/t") return ok({ id: "t", title: "Spring install" });
    if (method === "POST" && url === "/api/proposals/p/files/upload-url") return ok({ uploadUrl: "https://up/1", storagePath: "/s/1" });
    if (method === "POST" && url === "/api/proposals/p/files") return ok({ id: "new" });
    return ok([]);
  });
  queryClient.setDefaultOptions({ queries: { retry: false, queryFn: async () => [] }, mutations: { retry: false } });
  const loc = memoryLocation({ path: "/dashboard/proposals/p" });
  return render(<QueryClientProvider client={queryClient}><TooltipProvider><Router hook={loc.hook}>
    <Route path="/dashboard/proposals/:id"><ProposalDraft /></Route>
  </Router></TooltipProvider></QueryClientProvider>);
}
const fileList = (files: File[]) => ({ files, types: ["Files"], dropEffect: "none", items: [] });
function drop(target: Element, files: File[]) {
  fireEvent.dragOver(target, { dataTransfer: fileList(files) });
  fireEvent.drop(target, { dataTransfer: fileList(files) });
}
const calls = (method: string, url: string) => mocks.api.mock.calls.filter(c => c[0] === method && c[1] === url);

beforeEach(() => {
  queryClient.clear(); mocks.api.mockReset(); mocks.toast.mockReset(); localStorage.clear();
  estimateDetail = detail("Regrade front beds, install drip, plant 14 shrubs.");
  exhibits = { schedule: [{ quantity: 3, name: "Blue grama" }], palette: { introText: "", groups: [] }, provenance: { estimateId: "e", estimateNumber: "EST-1", versionId: "v", versionNumber: 1 } };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [], blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("no canvas in jsdom"); }));
});
afterEach(async () => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

describe("P3 proposal layout", () => {
  it("puts header actions incl. red Delete on one row, ticket bar above title/date, and two responsive columns", async () => {
    mount({ ...base, ticketId: "t" });
    const header = await screen.findByTestId("proposal-header");
    const actions = within(header).getByTestId("bar-proposal-header-actions");
    expect(within(actions).getByTestId("button-preview-pdf")).toBeTruthy();
    expect(within(actions).getByTestId("button-download-pdf")).toBeTruthy();
    const del = within(actions).getByTestId("button-delete-proposal");
    expect(del.className).toContain("text-destructive");
    expect(within(header).getByTestId("text-proposal-number").textContent).toBe("PR-0042");
    expect(within(header).getByTestId("badge-draft-status")).toBeTruthy();
    expect(within(header).getByTestId("link-customer-name").textContent).toBe("Delgado Residence");
    fireEvent.click(del);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    const ticket = await screen.findByTestId("div-linked-ticket-banner");
    const row = screen.getByTestId("row-title-date");
    expect(ticket.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(ticket).getByTestId("button-view-linked-ticket")).toBeTruthy();
    expect(within(ticket).getByTestId("button-unlink-ticket")).toBeTruthy();
    expect(screen.queryByTestId("card-proposal-details")).toBeNull();

    expect(screen.getByTestId("page-proposal-draft").className).toContain("max-w-[1480px]");
    const cols = screen.getByTestId("layout-proposal-columns");
    expect(cols.className).toContain("grid-cols-1");
    expect(cols.className).toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
    const aside = screen.getByTestId("column-what-goes-out");
    expect(aside.className).toContain("order-first");
    expect(aside.className).toContain("lg:order-none");
    expect(aside.className).toContain("lg:sticky");
    expect(screen.getByTestId("row-cover-visual").className).toContain("xl:grid-cols-2");
  });

  it("renders five numbered sections in print order and collapses/expands with persisted state", async () => {
    mount();
    await screen.findByTestId("section-doc-cover");
    const keys = ["cover", "visual", "estimate", "plants", "photos"];
    const nodes = keys.map(k => screen.getByTestId(`section-doc-${k}`));
    nodes.reduce((a, b) => { expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); return b; });
    for (const k of ["Cover", "Visual Scope", "Estimate & scope", "Plants", "Photo appendix"]) expect(screen.getByRole("heading", { name: k })).toBeTruthy();
    expect(screen.getByTestId("estimate-section").getAttribute("data-hide-heading")).toBe("true");
    const toggle = screen.getByTestId("button-toggle-section-plants");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect((document.getElementById("proposal-section-plants") as HTMLElement).hidden).toBe(true);
    const stored = Object.keys(localStorage).filter(k => k.startsWith("hp.proposal.sections.v1:"));
    expect(stored).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(stored[0])!)).toEqual({ plants: true });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((document.getElementById("proposal-section-plants") as HTMLElement).hidden).toBe(false);
  });

  it("shows checklist states and Finalize in the right column", async () => {
    mount({ ...base, coverSource: "photo", visualScopeSheetId: null, files: [photo("a", 0), photo("b", 1)], photoLayout: "grid", includePlantPalette: false });
    const list = await screen.findByTestId("proposal-ready-checklist");
    const value = (k: string) => within(list).getByTestId(`text-check-${k}`).textContent;
    const okOf = (k: string) => within(list).getByTestId(`check-${k}`).getAttribute("data-ok");
    expect(value("estimate")).toBe("EST-1");
    expect(value("total")).toMatch(/4,872\.50/);
    await waitFor(() => expect(value("scope")).toBe("From the estimate"));
    expect(okOf("scope")).toBe("true");
    expect(value("cover")).toBe("Photo"); expect(okOf("cover")).toBe("true");
    await waitFor(() => expect(value("plants")).toBe("schedule"));
    expect(okOf("plants")).toBe("true");
    expect(value("visual")).toBe("None"); expect(okOf("visual")).toBe("false");
    expect(value("photos")).toBe("2 · grid"); expect(okOf("photos")).toBe("true");
    const aside = screen.getByTestId("column-what-goes-out");
    expect(within(aside).getByTestId("button-finalize-proposal").className).toContain("w-full");
    expect(within(aside).getByTestId("button-generate-crew-worksheet")).toBeTruthy();
    expect(within(aside).getByTestId("text-next-version-hint").textContent).toContain("v1");
    fireEvent.click(within(aside).getByTestId("button-finalize-proposal"));
    expect(await screen.findByTestId("button-confirm-finalize")).toBeTruthy();
  });

  it("marks an empty estimate scope as not set", async () => {
    estimateDetail = detail("   ");
    mount();
    const list = await screen.findByTestId("proposal-ready-checklist");
    await waitFor(() => expect(within(list).getByTestId("text-check-scope").textContent).toBe("Not written yet"));
    expect(within(list).getByTestId("check-scope").getAttribute("data-ok")).toBe("false");
    expect(calls("GET", "/api/estimates/e")).toHaveLength(1);
  });

  it("shows logo-only cover and Not included plants as unset", async () => {
    mount({ ...base, coverSource: "none", includePlantSchedule: false, includePlantPalette: false });
    const list = await screen.findByTestId("proposal-ready-checklist");
    expect(within(list).getByTestId("text-check-cover").textContent).toBe("Logo only");
    expect(within(list).getByTestId("check-cover").getAttribute("data-ok")).toBe("false");
    expect(within(list).getByTestId("text-check-plants").textContent).toBe("Not included");
    expect(within(list).getByTestId("check-photos").getAttribute("data-ok")).toBe("false");
  });

  it("drop zone replaces Add Photos, opens the picker, uploads dropped images through the shared path and highlights", async () => {
    mount();
    const zone = await screen.findByTestId("button-drop-photos");
    expect(zone.tagName).toBe("BUTTON");
    expect(zone.textContent).toContain("Drag photos here, or click to browse");
    expect(screen.queryByTestId("button-upload-images")).toBeNull();
    const input = screen.getByTestId("input-image-files") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toMatch(/heic/i);
    const click = vi.spyOn(input, "click");
    fireEvent.click(zone);
    expect(click).toHaveBeenCalled();
    fireEvent.dragOver(zone, { dataTransfer: fileList([]) });
    expect(zone.getAttribute("data-drag-over")).toBe("true");
    drop(zone, [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "IMG_1.HEIC", { type: "" })]);
    await waitFor(() => expect(calls("POST", "/api/proposals/p/files")).toHaveLength(2));
    expect(zone.getAttribute("data-drag-over")).toBe("false");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "2 photos uploaded" })));
    expect(calls("POST", "/api/proposals/p/files/reorder")).toHaveLength(0);
  });

  it("refuses non-image files with a toast and uploads nothing for them", async () => {
    mount();
    const zone = await screen.findByTestId("button-drop-photos");
    drop(zone, [new File(["%PDF"], "plan.pdf", { type: "application/pdf" })]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Only photos can go in the appendix", variant: "destructive" })));
    expect(calls("POST", "/api/proposals/p/files/upload-url")).toHaveLength(0);
  });
  it("uses registered object URLs without duplicating their objects prefix", async () => {
    mount({ ...base, files: [{ ...photo("one", 0), storageObjectPath: "/objects/uploads/one" }], coverSource: "photo", coverPhotoFileId: "one" });
    await screen.findByTestId("div-image-one");
    const images = document.querySelectorAll('img[src="/objects/uploads/one"]');
    expect(images.length).toBe(2);
    expect(document.querySelector('img[src^="/objects/objects/"]')).toBeNull();
  });

  it("ignores non-file drags (photo reorders) and keeps the sortable list intact", async () => {
    mount({ ...base, files: [photo("a", 0), photo("b", 1)] });
    const zone = await screen.findByTestId("button-drop-photos");
    const ev = createEvent.drop(zone, { dataTransfer: { types: ["text/plain"], files: [] } });
    fireEvent(zone, ev);
    fireEvent.dragOver(zone, { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(zone.getAttribute("data-drag-over")).toBe("false");
    expect(ev.defaultPrevented).toBe(false);
    expect(calls("POST", "/api/proposals/p/files/upload-url")).toHaveLength(0);
    expect(screen.getAllByLabelText("Drag to reorder").length).toBe(2);
  });

  it("legacy proposals use the same layout with controls disabled but delete still works", async () => {
    mount({ ...base, estimateId: null, estimate: null, estimateNumber: null });
    const zone = await screen.findByTestId("button-drop-photos");
    expect((zone as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("fieldset-proposal-content-2") as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByTestId("fieldset-proposal-title-row") as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.queryByTestId("button-finalize-proposal")).toBeNull();
    expect((screen.getByTestId("button-delete-proposal") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("button-toggle-section-photos") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("text-check-estimate").textContent).toBe("None");
  });

  it("renders Spanish with no English fallbacks", async () => {
    await i18n.changeLanguage("es");
    mount({ ...base, files: [photo("a", 0)] });
    expect(await screen.findByText("Lo que se envía")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Apéndice de fotos" })).toBeTruthy();
    expect(screen.getByTestId("button-drop-photos").textContent).toContain("Arrastre fotos aquí");
    await waitFor(() => expect(screen.getByTestId("text-check-scope").textContent).toBe("De la estimación"));
    expect(screen.getAllByText("Contraer").length).toBe(5);
    const text = document.body.textContent ?? "";
    for (const english of ["What goes out", "Drag photos here", "From the estimate", "Collapse", "Photo appendix", "Logo only", "Drag to reorder"]) expect(text).not.toContain(english);
    expect(document.body.innerHTML).not.toMatch(/proposalP3\./);
  });
});
