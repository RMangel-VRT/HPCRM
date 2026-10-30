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
import EstimateBuilderList from "./EstimateBuilderList";
import { EstimatesRail, isEstimatesHubPage } from "@/components/nav/estimatesRail";
import { distinctContexts } from "@/lib/estimateBuilder";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "office" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
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
      totals: { subtotalCents: o.subtotal ?? 873412, costKnownCents: 211050, costUnknownLines: 3, materialMarginPct: 47.2,
        byUmbrella: { ...zeroU, plants: 412300, landscape_labor: 98050 }, bySection: { s1: o.subtotal ?? 873412, s2: 0 } },
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
    if (c.url.startsWith("/api/estimates")) return res([]);
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
    expect(within(bar).getByTestId("button-mark-sent")).toBeTruthy();
    expect(within(card).getByTestId("strip-versions")).toBeTruthy();
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

describe("add-line buttons", () => {
  it("are real buttons in type order, focusable, hidden when read-only", async () => {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const group = screen.getByTestId("group-add-s1");
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual(
      ["plant", "hardscape", "irrigation", "labor", "equipment", "fee", "custom"].map((ty) => `button-add-${ty}-s1`));
    for (const b of buttons) { expect(b.tagName).toBe("BUTTON"); expect(b.className).toContain("focus-visible:ring-2"); expect(b.className).toContain("h-8"); }
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
    cleanup();
    detail = makeDetail({ status: "sent" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.queryByTestId("group-add-s1")).toBeNull();
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
    expect(screen.getByTestId("group-add-s1").className).toContain("estimate-add-buttons");
    expect(screen.getByTestId("row-line-l-plant").className).toContain("estimate-line-row");
  });
  it("defines 984px split threshold and narrow controls using container queries, not viewport breakpoints", async () => {
    const css = readFileSync("src/components/estimates/estimateBuilder.css", "utf8");
    expect(css).toContain("@container estimate-builder (min-width: 984px)");
    expect(css).toContain("grid-template-columns: minmax(640px, 1fr) 320px");
    expect(css).toContain("@container estimate-sections (min-width: 560px)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("@container estimate-sections (min-width: 640px)");
    expect(css).not.toContain("@media");
  });
});

describe("pdf preview", () => {
  let created: string[]; let revoked: string[];
  beforeEach(() => {
    created = []; revoked = [];
    let n = 0;
    URL.createObjectURL = vi.fn(() => { const u = `blob:pdf-${++n}`; created.push(u); return u; });
    URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u); });
  });
  const pdfRes = () => ({ ...res({}), blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }) });

  it("fetches the viewed version with the company header, shows the iframe, download/open, revokes on close", async () => {
    handler = (c) => c.url.endsWith("/pdf") ? pdfRes() : undefined;
    const openSpy = vi.fn(); vi.stubGlobal("open", openSpy);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-preview-pdf"));
    expect(screen.getByTestId("text-pdf-hint").textContent).toContain("DRAFT");
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
    fireEvent.click(screen.getByTestId(`button-add-${type}-s1`));
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
    fireEvent.click(screen.getByTestId(`button-add-${type}-s1`));
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
    fireEvent.click(screen.getByTestId(`button-add-${type}-s1`));
    const row = await screen.findByTestId(opt);
    fireEvent.click(row); fireEvent.click(row); fireEvent.doubleClick(row);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0].body as Record<string, unknown>).quantity).toBe("1");
  });
  it("Add line button adds the selected row", async () => {
    handler = (c) => c.method === "POST" ? ok() : pickers[0][1](c);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-add-hardscape-s1"));
    fireEvent.click(await screen.findByTestId("option-h1"));
    fireEvent.click(screen.getByTestId("button-picker-add"));
    await waitFor(() => expect(posts()).toHaveLength(1));
  });
});
