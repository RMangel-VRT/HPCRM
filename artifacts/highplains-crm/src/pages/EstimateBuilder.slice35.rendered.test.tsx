// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import EstimateBuilder from "./EstimateBuilder";
import { openEstimatePicker } from "./estimateBuilderTestInteractions";
import EstimateBuilderList from "./EstimateBuilderList";
import { EstimatesRail, isEstimatesHubPage } from "@/components/nav/estimatesRail";
import { distinctContexts } from "@/lib/estimateBuilder";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "office" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { ...auth.user, accessRole: auth.user.activeRole } }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock("@/components/CustomerSearchInput", () => ({
  default: (p: { onSelect: (c: { id: string; name: string }) => void; expectedCompanyId?: string }) => (
    <button type="button" data-testid="pick-customer" data-company={p.expectedCompanyId} onClick={() => p.onSelect({ id: "cu1", name: "Ridge HOA" })}>pick</button>
  ),
}));

const T0 = "2025-04-01T10:00:00.000Z";
const zeroU = { plants: 0, landscape_materials: 0, irrigation_materials: 0, landscape_labor: 0, irrigation_labor: 0, fees_surcharges: 0 };
function line(id: string, sectionId: string, lineType: string, o: Record<string, unknown> = {}) {
  return {
    id, companyId: "c1", versionId: "v2", sectionId, lineType, priceSource: "catalog", plantCatalogItemId: null, hardscapeCatalogItemId: null,
    irrigationCatalogItemId: null, quickItemId: null, rateKey: null, termId: null, name: `${lineType} item`, detail: `${lineType} detail`,
    unit: "ea", quantity: "1.00", unitPriceCents: 1000, unitCostCents: 400, extendedCents: 1000, umbrellaKey: "landscape_materials",
    includeInPalette: lineType === "plant", paletteTypeLabel: null, sortOrder: 0, needsPrice: false, createdAt: T0, updatedAt: T0, ...o,
  };
}
type Detail = ReturnType<typeof makeDetail>;
function makeDetail(o: { status?: string; sections?: number; subtotal?: number; updatedAt?: string; versionNumber?: number; voidedAt?: string | null } = {}) {
  const types = ["plant", "hardscape", "irrigation", "labor", "equipment", "fee", "custom"];
  const s1Lines = types.map((ty, i) => line(`l-${ty}`, "s1", ty, {
    sortOrder: i, ...(ty === "labor" ? { needsPrice: true, unitPriceCents: 0, extendedCents: 0, priceSource: "rate_card", unit: "hour", unitCostCents: null } : {}),
    ...(ty === "fee" ? { priceSource: "quick_list", unitCostCents: null } : {}), ...(ty === "custom" ? { priceSource: "manual" } : {}),
  }));
  const sections = [{ id: "s1", companyId: "c1", versionId: "v2", name: "Front yard", sortOrder: 0, lines: s1Lines, createdAt: T0, updatedAt: T0 }];
  if ((o.sections ?? 2) > 1) sections.push({ id: "s2", companyId: "c1", versionId: "v2", name: "Back yard", sortOrder: 1, lines: [], createdAt: T0, updatedAt: T0 });
  const status = o.status ?? "draft";
  const vn = o.versionNumber ?? 2;
  return {
    id: "e1", companyId: "c1", customerId: "cu1", ticketId: "t1", estimateNumber: "E-2025-0042", title: "Spring install", currentVersionId: "v2",
    voidedAt: o.voidedAt ?? null, voidReason: null, createdById: null, createdAt: T0, updatedAt: o.updatedAt ?? T0,
    versions: [
      { id: "v2", versionNumber: 2, status, createdAt: T0, updatedAt: T0 },
      { id: "v1", versionNumber: 1, status: "superseded", createdAt: T0, updatedAt: T0 },
    ],
    version: {
      id: vn === 2 ? "v2" : "v1", versionNumber: vn, status: vn === 2 ? status : "superseded", companyId: "c1", estimateId: "e1", createdFromVersionId: null,
      sentAt: null, sentById: null, sentMethod: null, acceptedAt: null, acceptedById: null, acceptanceMethod: null, poNumber: null,
      declinedAt: null, declinedById: null, declineReason: null, supersededAt: null, frozenSubtotalCents: null, frozenCostKnownCents: null,
      frozenCostUnknownLines: null, createdById: null, createdAt: T0, updatedAt: o.updatedAt ?? T0, sections,
      totals: { subtotalCents: o.subtotal ?? 873412, costKnownCents: 211050, costUnknownLines: 3, materialMarginPct: 47.2, materialMarginGrossPct: 47.2,
        byUmbrella: { ...zeroU, plants: 412300, landscape_labor: 98050 }, bySection: { s1: o.subtotal ?? 873412, s2: 0 },
        byUmbrellaNet: { ...zeroU, plants: 412300, landscape_labor: 98050 }, bySectionNet: { s1: o.subtotal ?? 873412, s2: 0 },
        laborBaseCents: 0, laborDiscountCents: 0, totalDiscountCents: 0, totalCents: o.subtotal ?? 873412,
        laborDiscountCapped: false, totalDiscountCapped: false, laborDiscountNoLaborLines: false },
    },
  };
}
const rates = { items: [
  { rateKey: "crew", label: "Crew hour", unit: "hour", priceText: null, cardRateCents: 6500, cardPriceText: null, contractRateCents: 6000, contractPriceText: null, rateCents: 6000, source: "contract", termId: "tm1" },
  { rateKey: "design", label: "Design consult", unit: "hour", priceText: "Varies by scope", cardRateCents: null, cardPriceText: "Varies by scope", contractRateCents: null, contractPriceText: null, rateCents: null, source: "rate_card" },
  { rateKey: "ghost", label: "Ghost rate", unit: null, priceText: null, cardRateCents: null, cardPriceText: null, contractRateCents: null, contractPriceText: null, rateCents: null, source: "unset" },
], governingContexts: [{ line: "landscape", termId: "tm1", seasonLabel: "2025 Season" }] };

const fetchMock = vi.fn();
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
function res(body: unknown, status = 200) {
  return { ok: status < 400, status, statusText: "x", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() };
}
let detail: Detail;
let handler: (c: Call) => unknown | undefined;
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
    url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));
}
const mutations = () => calls().filter((c) => c.method !== "GET");

beforeEach(() => {
  auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "office" };
  detail = makeDetail();
  handler = () => undefined;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    const r = handler(c);
    if (r !== undefined) return r;
    if (c.url.startsWith("/api/estimates/rates/preview")) return res(rates);
    if (c.url.startsWith("/api/customers/")) return res({ id: "cu1", name: "Ridge HOA" });
    if (c.url.startsWith("/api/tickets/")) return res({ ticket: { id: "t1", ticketNumber: "T-118", currentStatusId: "ts1" }, statuses: [{ id: "ts1", name: "Estimating" }] });
    if (c.url.startsWith("/api/estimates/e1")) return res(c.url.includes("version=1") ? makeDetail({ versionNumber: 1 }) : detail);
    if (c.url.startsWith("/api/estimates") || c.url.startsWith("/api/plant-library") || c.url.startsWith("/api/quick-items")) return res([]);
    return res({ items: [], categories: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path, record: true });
  const ui = () => (
    <QueryClientProvider client={client}><Router hook={loc.hook} searchHook={loc.searchHook}>
      <Switch>
        <Route path="/dashboard/estimates/builder/:id" component={EstimateBuilder} />
        <Route path="/dashboard/estimates/builder" component={EstimateBuilderList} />
      </Switch>
    </Router></QueryClientProvider>
  );
  const r = render(ui());
  return { ...r, loc, client, rerenderPage: () => r.rerender(ui()) };
}
const ready = () => screen.findByTestId("text-estimate-total");

// ---- Slice 3.5: identity header, add buttons, PDF preview, container layout, picker selection ----
type Over = Record<string, unknown>;
function withVersion(d: Detail, o: Over): Detail { return { ...d, version: { ...d.version, ...o } } as Detail; }
const display = {
  companyName: "High Plains Landscaping", customerName: "Joe Woods", customerAddress: "4120 Mesa Rd, Longmont CO", createdByName: "Randy K",
  ticket: { id: "t1", title: "Pond-water rotor upgrade", shortId: "T-118", status: { name: "Estimating", statusKey: "estimating", actionType: "needs_action", isFinal: "false" } },
};

describe("identity header", () => {
  it("mirrors the ticket header: hue card, badge, state pill, metadata cells from display, actions", async () => {
    detail = { ...makeDetail(), display } as Detail;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const card = screen.getByTestId("header-estimate-identity");
    expect(card.className).toContain("border-t-4");
    expect(card.className).toContain("rounded-xl");
    expect(card.style.borderTopColor).toContain("--tt-");
    expect(screen.getByTestId("badge-estimate").textContent).toBe("Estimate E-2025-0042");
    expect(screen.getByTestId("pill-status-draft").getAttribute("data-state")).toBe("action");
    expect(screen.getByTestId("link-customer").textContent).toBe("Joe Woods");
    expect(screen.getByTestId("text-customer-address").textContent).toContain("Longmont");
    expect(screen.getByTestId("link-ticket").textContent).toContain("#T-118");
    expect(screen.getByTestId("text-ticket-title").textContent).toBe("Pond-water rotor upgrade");
    expect(screen.getByTestId("text-ticket-status").textContent).toBe("Estimating");
    expect(screen.getByTestId("text-header-total").textContent).toBe("$8,734.12");
    expect(screen.queryByTestId("text-total-frozen")).toBeNull();
    expect(screen.getByTestId("cell-created").textContent).toMatch(/2025.*by Randy K/);
    expect(screen.queryByTestId("cell-sent")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("chip-rates").textContent).toBe("Contract · 2025 Season"));
    // display present: no fallback reads for customer or ticket
    expect(calls().some((c) => c.url.startsWith("/api/customers/"))).toBe(false);
    expect(calls().some((c) => c.url.startsWith("/api/tickets/"))).toBe(false);
    const bar = screen.getByTestId("bar-lifecycle");
    expect(within(bar).getByTestId("button-preview-pdf")).toBeTruthy();
    expect(within(bar).getByTestId("button-download-pdf").textContent).toBe("Download PDF");
    expect(within(bar).getByTestId("button-send-estimate")).toBeTruthy();
    expect(screen.getByTestId("link-back-list").getAttribute("href")).toBe("/dashboard/estimates/builder");
    expect(screen.queryByRole("navigation", { name: "Estimates navigation" })).toBeNull();
    expect(within(card).queryByTestId("card-versions")).toBeNull();
    expect(within(screen.getByTestId("rail-totals")).getByTestId("card-versions")).toBeTruthy();
  });

  it("unlinked ticket, rate card, frozen total with sent and accepted cells", async () => {
    detail = withVersion({ ...makeDetail({ status: "accepted" }), ticketId: null, display: { ...display, ticket: null } } as unknown as Detail, {
      sentAt: "2025-04-02T15:00:00.000Z", sentMethod: "email", acceptedAt: "2025-04-05T15:00:00.000Z", acceptedOn: "2025-04-05",
      acceptanceMethod: "signed_pdf", poNumber: "PO-77", frozenSubtotalCents: 500012,
    });
    handler = (c) => c.url.startsWith("/api/estimates/rates/preview") ? res({ ...rates, governingContexts: [{ line: "landscape", termId: null, seasonLabel: null }] }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("text-ticket-unlinked").textContent).toBe("Not linked");
    expect(screen.getByTestId("pill-status-accepted").getAttribute("data-state")).toBe("done");
    expect(screen.getByTestId("text-header-total").textContent).toBe("$5,000.12");
    expect(screen.getByTestId("text-total-frozen").textContent).toBe("(frozen)");
    expect(screen.getByTestId("cell-sent").textContent).toMatch(/2025.*Email/);
    expect(screen.getByTestId("cell-accepted").textContent).toMatch(/2025/);
    expect(screen.getByTestId("cell-accepted").textContent).toContain("PO PO-77");
    await waitFor(() => expect(screen.getByTestId("chip-rates").textContent).toBe("Rate Card"));
  });

  it("sent pill is dashed waiting; falls back to scoped reads without display", async () => {
    detail = makeDetail({ status: "sent" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const pill = screen.getByTestId("pill-status-sent");
    expect(pill.getAttribute("data-state")).toBe("waiting");
    expect(pill.className).toContain("border-dashed");
    await waitFor(() => expect(screen.getByTestId("link-customer").textContent).toBe("Ridge HOA"));
    await waitFor(() => expect(screen.getByTestId("text-ticket-status").textContent).toBe("Estimating"));
  });

  it("shows the change-order chip on a draft created from an accepted version", async () => {
    const d = makeDetail();
    detail = withVersion({ ...d, versions: [{ ...d.versions[0] }, { ...d.versions[1], status: "accepted" }] } as Detail, { createdFromVersionId: "v1" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("chip-change-order").textContent).toBe("Change order");
  });
});

describe("header contexts", () => {
  it("mixed rate contexts render one chip per distinct context", async () => {
    handler = (c) => c.url.startsWith("/api/estimates/rates/preview") ? res({ ...rates, governingContexts: [
      { line: "landscape", termId: "tm1", seasonLabel: "2025" }, { line: "irrigation", termId: null, seasonLabel: null }] }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    await waitFor(() => expect(within(screen.getByTestId("cell-rates")).getByTestId("chip-rates-tm1").textContent).toContain("Contract · 2025 (landscape)"));
    expect(screen.getByTestId("chip-rates-card").textContent).toContain("Rate Card (irrigation)");
  });
  it("historical version: read-only title, superseded muted pill, still previewable", async () => {
    renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    expect(screen.getByTestId("pill-status-superseded").getAttribute("data-state")).toBe("muted");
    expect(screen.getByTestId("text-estimate-title")).toBeTruthy();
    expect(screen.queryByTestId("input-estimate-title")).toBeNull();
    expect(screen.getByTestId("button-preview-pdf")).toBeTruthy();
    expect(screen.queryByTestId("group-add-s1")).toBeNull();
  });
});

describe("inline add", () => {
  it("offers one focusable catalog search per section, hidden when read-only", async () => {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const group = screen.getByTestId("bar-add-s1");
    expect(within(group).getAllByRole("combobox")).toHaveLength(1);
    const search = within(group).getByRole("combobox");
    search.focus();
    expect(document.activeElement).toBe(search);
    cleanup();
    detail = makeDetail({ status: "accepted" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.queryByTestId("bar-add-s1")).toBeNull();
  });
});

describe("container layout", () => {
  it("uses a native width container with a shrinkable sections grid even with seven populated line types", async () => {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("page-estimate-builder").className).toContain("estimate-builder-container");
    const grid = screen.getByTestId("layout-builder");
    expect(grid.className).toContain("estimate-builder-grid");
    expect(grid.style.gridTemplateColumns).toBe("");
    expect(screen.getByTestId("input-section-search-s1")).toBeTruthy();
    expect(screen.getByTestId("row-line-l-plant").className).toContain("estimate-line-row");
  });
  it("defines the 860px split, 288px sticky rail and narrow controls using container queries", () => {
    const css = readFileSync("src/components/estimates/estimateBuilder.css", "utf8");
    expect(css).toContain("max-width: 1400px");
    expect(css).toContain("@container estimate-builder (min-width: 860px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 288px");
    expect(css).toContain("position: sticky");
    expect(css).toContain("@container estimate-sections (max-width: 400px)");
    expect(css).toContain("@container estimate-sections (min-width: 570px)");
    expect(css).toContain('grid-template-areas: "handle icon item qty unit rate amount menu"');
    expect(css).not.toContain("@media");
  });
});

describe("one-page review", () => {
  it("shows draft-only pricing gaps, what prints, and the collapsed internal QuickBooks breakdown", async () => {
    detail.version.sections[0].lines[0].umbrellaKey = "plants";
    detail = withVersion(detail, { scopeOfWork: "Install the new bed." });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const rail = within(screen.getByTestId("rail-totals"));
    expect(rail.getByTestId("text-rail-section-s1").textContent).toBe("$8,734.12");
    expect(rail.getByTestId("text-lines-need-price").textContent).toBe("1 line still needs a price");
    const checklist = rail.getByTestId("card-on-pdf");
    expect(checklist.textContent).toContain("Included: Scope of work");
    expect(checklist.textContent).toContain("7 lines in 2 sections");
    expect(checklist.textContent).toContain("Terms + plant warranty");
    expect(checklist.textContent).toContain("Signature box");
    expect(checklist.textContent).toMatch(/About \d+ pages/);
    expect(within(checklist).getByRole("switch", { name: "Plant table with pictures" }).getAttribute("aria-checked")).toBe("true");
    const internal = within(rail.getByTestId("card-internal-margin"));
    expect(internal.getByTestId("text-margin").textContent).toBe("47.2%");
    const qbo = internal.getByTestId("card-qbo") as HTMLDetailsElement;
    expect(qbo.open).toBe(false);
    fireEvent.click(internal.getByTestId("button-toggle-qbo"));
    expect(qbo.open).toBe(true);
  });

  it("marks empty scope, omits plant warranty without plants, and shows singular/plural Spanish copy", async () => {
    await i18n.changeLanguage("es");
    detail.versions = [detail.versions[0]];
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const checklist = screen.getByTestId("card-on-pdf");
    expect(checklist.textContent).toContain("No incluido: Alcance del trabajo");
    expect(checklist.textContent).toContain("7 líneas en 2 secciones");
    expect(checklist.textContent).not.toContain("garantía de plantas");
    expect(screen.getByTestId("card-versions").textContent).toContain("Borrador (en edición)");
    expect(screen.getByTestId("text-single-version-pdf").textContent).toContain("solo aparece en el PDF");
  });
});

describe("pdf preview", () => {
  let created: string[]; let revoked: string[];
  beforeEach(() => {
    const createdThisTest: string[] = [];
    const revokedThisTest: string[] = [];
    created = createdThisTest; revoked = revokedThisTest;
    let n = 0;
    URL.createObjectURL = vi.fn(() => { const u = `blob:pdf-${++n}`; createdThisTest.push(u); return u; });
    URL.revokeObjectURL = vi.fn((u: string) => { revokedThisTest.push(u); });
  });
  const pdfRes = () => ({ ...res({}), blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }) });

  it("fetches the viewed version with the company header, shows the iframe, download/open, revokes on close", async () => {
    handler = (c) => c.url.endsWith("/pdf") ? pdfRes() : undefined;
    const openSpy = vi.fn(); vi.stubGlobal("open", openSpy);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    expect(screen.getByTestId("text-pdf-hint").textContent).toBe("This is the PDF you'll download or send.");
    const frame = await screen.findByTestId("frame-pdf");
    expect(frame.getAttribute("src")).toBe("blob:pdf-1");
    const call = calls().find((c) => c.url.endsWith("/pdf"))!;
    expect(call.url).toBe("/api/estimates/e1/versions/v2/pdf");
    expect(call.headers["X-Company-Id"]).toBe("c1");
    fireEvent.click(screen.getByTestId("button-pdf-open"));
    expect(openSpy).toHaveBeenCalledWith("blob:pdf-1", "_blank", "noopener");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByTestId("button-pdf-download"));
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("button-pdf-close"));
    await waitFor(() => expect(revoked).toEqual(["blob:pdf-1"]));
  });

  it("previews a historical version", async () => {
    handler = (c) => c.url.endsWith("/pdf") ? pdfRes() : undefined;
    renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    expect(calls().some((c) => c.url === "/api/estimates/e1/versions/v1/pdf")).toBe(true);
  });

  it("opens each version's own scoped PDF from the rail without changing the editor's version", async () => {
    Object.assign(detail.versions[1], { sentAt: T0, sentMethod: "hard_copy", frozenSubtotalCents: 425086 });
    handler = (c) => c.url.endsWith("/pdf") ? pdfRes() : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("text-version-sent-1").textContent).toMatch(/2025 · Hard copy · \$4,250.86/);
    expect(screen.getByTestId("row-estimate-version-1").textContent).toContain("Regenerated PDF");
    expect(screen.getByTestId("row-estimate-version-2").textContent).toContain("Version 2 · Draft (editing)");
    fireEvent.click(screen.getByTestId("button-version-pdf-1"));
    await screen.findByTestId("frame-pdf");
    expect(screen.getByTestId("text-pdf-hint").textContent).toContain("not the original sent file");
    fireEvent.click(screen.getByTestId("button-pdf-close"));
    fireEvent.click(screen.getByTestId("button-version-pdf-2"));
    await screen.findByTestId("frame-pdf");
    expect(screen.getByTestId("text-pdf-hint").textContent).not.toContain("regenerated");
    expect(calls().filter(c => c.url.endsWith("/pdf"))).toMatchObject([
      { method: "GET", url: "/api/estimates/e1/versions/v1/pdf", headers: { "X-Company-Id": "c1" } },
      { method: "GET", url: "/api/estimates/e1/versions/v2/pdf", headers: { "X-Company-Id": "c1" } },
    ]);
    expect(screen.getByTestId("chip-version-2").getAttribute("aria-pressed")).toBe("true");
    expect(mutations()).toEqual([]);
  });

  it("downloads the viewed draft directly without a lifecycle write", async () => {
    handler = (c) => c.url.endsWith("/pdf?download=1") ? {
      ...pdfRes(), headers: new Headers({ "Content-Disposition": 'attachment; filename="EST-2025-0042-v2.pdf"' }),
    } : undefined;
    const files: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      files.push(this.download);
    });
    try {
      renderAt("/dashboard/estimates/builder/e1");
      await ready();
      fireEvent.click(screen.getByTestId("button-download-pdf"));
      await waitFor(() => expect(files).toEqual(["EST-2025-0042-v2.pdf"]));
      expect(calls().find(c => c.url.includes("?download=1"))).toMatchObject({
        url: "/api/estimates/e1/versions/v2/pdf?download=1", method: "GET", headers: { "X-Company-Id": "c1" },
      });
      expect(mutations()).toEqual([]);
      expect(screen.getByTestId("button-send-estimate")).toBeTruthy();
      expect(screen.getByTestId("pill-status-draft").textContent).toContain("Draft");
    } finally { click.mockRestore(); }
  });

  it.each(["ticket", "estimate"])("edits %s-owned work location in the header and fetches a fresh PDF", async owner => {
    const location = {
      workLocation: "4120 Mesa Rd\nLongmont CO", workLocationSource: "property",
      workLocationInput: { label: null, details: null }, propertyAddressLines: "4120 Mesa Rd\nLongmont CO",
    };
    const ticketId = owner === "ticket" ? "t1" : null;
    detail = { ...detail, ticketId, display: { ...display, ticket: ticketId ? display.ticket : null, ...location } } as typeof detail;
    handler = c => {
      if (c.method === "PUT" && c.url === "/api/estimates/e1/work-location") {
        Object.assign(detail, { display: { ...display, ...location,
          workLocation: "West Service Gate\nUse the west drive", workLocationSource: owner,
          workLocationInput: { label: "West Service Gate", details: "Use the west drive" },
        } });
        return new Response(JSON.stringify({ text: "West Service Gate\nUse the west drive", source: owner }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (c.url.endsWith("/pdf")) return pdfRes();
      return undefined;
    };
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const cell = within(screen.getByTestId("cell-work-location"));
    expect(cell.getByTestId("text-work-location-fallback").textContent).toBe("Property address");
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    fireEvent.click(screen.getByTestId("button-pdf-close"));
    fireEvent.click(cell.getByTestId("button-edit-work-location"));
    const popover = within(await screen.findByTestId("popover-work-location"));
    expect(screen.getByTestId("popover-work-location").textContent).toMatch(new RegExp(`Saved to (the |this )?${owner}`, "i"));
    fireEvent.click(popover.getByTestId("button-use-work-property-address"));
    expect((popover.getByTestId("input-work-location-details") as HTMLTextAreaElement).value).toContain("Mesa Rd");
    fireEvent.change(popover.getByTestId("input-work-location-label"), { target: { value: "West Service Gate" } });
    fireEvent.change(popover.getByTestId("input-work-location-details"), { target: { value: "Use the west drive" } });
    fireEvent.click(popover.getByTestId("button-save-work-location"));
    await waitFor(() => expect(cell.getByTestId("text-work-location").textContent).toBe("West Service Gate\nUse the west drive"));
    expect(cell.queryByTestId("text-work-location-fallback")).toBeNull();
    expect(mutations()).toMatchObject([{ method: "PUT", url: "/api/estimates/e1/work-location", body: { label: "West Service Gate", details: "Use the west drive" } }]);
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    expect(calls().filter(c => c.url.endsWith("/v2/pdf"))).toHaveLength(2);
  });

  it("shows a translated error with retry", async () => {
    let fail = true;
    handler = (c) => c.url.endsWith("/pdf") ? (fail ? res({ error: "x" }, 500) : pdfRes()) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    expect((await screen.findByTestId("pdf-error")).textContent).toContain("could not be loaded");
    expect(created).toEqual([]);
    fail = false;
    fireEvent.click(screen.getByTestId("button-pdf-retry"));
    await screen.findByTestId("frame-pdf");
  });

  it("drops a response that arrives after close and never leaks its URL", async () => {
    let release: (v: unknown) => void = () => {};
    handler = (c) => c.url.endsWith("/pdf") ? new Promise((r) => { release = r; }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("pdf-loading");
    fireEvent.click(screen.getByTestId("button-pdf-close"));
    await act(async () => { release(pdfRes()); await Promise.resolve(); });
    expect(created).toEqual([]);
  });

  it.each([
    ["company", () => { auth.user = { ...auth.user, activeCompanyId: "c2" }; }],
    ["user", () => { auth.user = { ...auth.user, id: "u2" }; }],
    ["role", () => { auth.user = { ...auth.user, activeRole: "admin" }; }],
  ])("%s switch revokes the shown URL and drops an in-flight preview", async (_k, swap) => {
    let release: (v: unknown) => void = () => {};
    let pending = false;
    handler = (c) => c.url.endsWith("/pdf") ? (pending ? new Promise((r) => { release = r; }) : pdfRes()) : undefined;
    const r = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    pending = true;
    fireEvent.click(screen.getByTestId("button-pdf-close"));
    await waitFor(() => expect(revoked).toEqual(["blob:pdf-1"]));
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("pdf-loading");
    act(() => { swap(); r.rerenderPage(); });
    await act(async () => { release(pdfRes()); await Promise.resolve(); await Promise.resolve(); });
    expect(created).toEqual(["blob:pdf-1"]);
    expect(screen.queryByTestId("dialog-pdf-preview")).toBeNull();
  });

  it("version switch revokes the previous version URL and previews the new one", async () => {
    handler = (c) => c.url.endsWith("/pdf") ? pdfRes() : undefined;
    const r = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    act(() => { r.loc.navigate("/dashboard/estimates/builder/e1?version=1"); });
    await waitFor(() => expect(revoked).toEqual(["blob:pdf-1"]));
    await screen.findByTestId("chip-version-1");
    await waitFor(() => expect(screen.queryByTestId("dialog-pdf-preview")).toBeNull());
    fireEvent.click(await screen.findByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    expect(calls().filter((c) => c.url.endsWith("/pdf")).map((c) => c.url)).toEqual(["/api/estimates/e1/versions/v2/pdf", "/api/estimates/e1/versions/v1/pdf"]);
  });

  it("unmount revokes the URL", async () => {
    handler = (c) => c.url.endsWith("/pdf") ? pdfRes() : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    await screen.findByTestId("frame-pdf");
    cleanup();
    expect(revoked).toEqual(["blob:pdf-1"]);
  });
});

describe("picker selection", () => {
  const ok = () => res(makeDetail({ updatedAt: "2025-04-01T11:00:00.000Z" }), 201);
  const posts = () => mutations().filter((c) => c.method === "POST");
  const terms: Record<string, string> = { hardscape: "flagstone", irrigation: "rotor", plant: "maple", labor: "crew", fee: "disposal", equipment: "loader" };
  const pickers: [string, (c: Call) => unknown, string][] = [
    ["hardscape", (c) => c.url.startsWith("/api/hardscape") ? res({ categories: [], items: [{ id: "h1", name: "Flagstone", sku: null, description: null, unit: "ton", category: "stone", retailPriceCents: 100, wholesaleCostCents: 50, isActive: true }] }) : undefined, "option-h1"],
    ["irrigation", (c) => c.url.startsWith("/api/irrigation-catalog") ? res({ categories: [], brands: [], items: [{ id: "i1", name: "Rotor", sku: null, description: null, unit: "ea", category: "rotors", retailPriceCents: 100, wholesaleCostCents: 50, isActive: true }] }) : undefined, "option-i1"],
    ["plant", (c) => c.url.startsWith("/api/plant-library/items") ? res([{ varietyKey: "ac", commonName: "Maple", botanicalName: null, category: "tree", sizes: [{ id: "r1", isActive: true, productCode: "A1", sizeCode: "1", sizeLabel: "#1", onHand: 1, salePrice: "10", wholesaleCost: "5" }] }]) : undefined, "option-ac-A1"],
    ["labor", () => undefined, "option-crew"],
    ["fee", (c) => c.url.startsWith("/api/quick-items") ? res([{ id: "q1", kind: "fee", label: "Disposal", defaultUnit: "ea", defaultRateCents: 4500, umbrellaKey: "fees_surcharges", isActive: true, sortOrder: 0, companyId: "c1" }]) : undefined, "option-q1"],
    ["equipment", (c) => c.url.startsWith("/api/quick-items") ? res([{ id: "q1", kind: "equipment", label: "Loader", defaultUnit: "hour", defaultRateCents: 4500, umbrellaKey: "landscape_labor", isActive: true, sortOrder: 0, companyId: "c1" }]) : undefined, "option-q1"],
  ];
  it.each(pickers)("%s: arrow selection focuses quantity without adding", async (type, h, opt) => {
    handler = h;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    await openEstimatePicker(type, terms[type]);
    await screen.findByTestId(opt);
    fireEvent.keyDown(screen.getByTestId("input-picker-search"), { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("input-picker-quantity")));
    expect(screen.getByTestId(opt).getAttribute("aria-selected")).toBe("true");
    expect(posts()).toHaveLength(0);
  });
  it.each(pickers)("%s: click selects + focuses quantity (no add); Add adds at quantity", async (type, h, opt) => {
    handler = (c) => c.method === "POST" ? ok() : h(c);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    await openEstimatePicker(type, terms[type]);
    fireEvent.click(await screen.findByTestId(opt));
    expect(screen.getByTestId(opt).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("input-picker-quantity")));
    expect(posts()).toHaveLength(0);
    fireEvent.change(screen.getByTestId("input-picker-quantity"), { target: { value: "3" } });
    fireEvent.keyDown(screen.getByTestId("input-picker-quantity"), { key: "Enter" });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0].body as Record<string, unknown>).quantity).toBe("3");
  });
  it.each(pickers)("%s: double-click adds exactly once at the current quantity", async (type, h, opt) => {
    handler = (c) => c.method === "POST" ? ok() : h(c);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    await openEstimatePicker(type, terms[type]);
    const row = await screen.findByTestId(opt);
    fireEvent.click(row); fireEvent.click(row); fireEvent.doubleClick(row);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0].body as Record<string, unknown>).quantity).toBe("1");
  });
  it("Add line button adds the selected row", async () => {
    handler = (c) => c.method === "POST" ? ok() : pickers[0][1](c);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    await openEstimatePicker("hardscape", "flagstone");
    fireEvent.click(await screen.findByTestId("option-h1"));
    fireEvent.click(screen.getByTestId("button-picker-add"));
    await waitFor(() => expect(posts()).toHaveLength(1));
  });
});
