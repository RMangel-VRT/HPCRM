// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import EstimateBuilder from "./EstimateBuilder";
import EstimateBuilderList from "./EstimateBuilderList";
import { idPart } from "@/lib/pickerSources";

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


// ---- Slice 4.7: section search across catalogs, category-led custom lines ----
const ok = () => res(makeDetail({ updatedAt: "2025-04-01T11:00:00.000Z" }), 201);
const posts = () => mutations().filter((c) => c.method === "POST");
const qi = (id: string, kind: string, label: string, o: Record<string, unknown> = {}) => ({
  id, kind, label, defaultUnit: "ea", defaultRateCents: 4500, umbrellaKey: "landscape_labor", isActive: true, sortOrder: 0, companyId: "c1",
  serviceCategoryId: null, serviceCategoryName: null, serviceCategoryIsActive: null, ...o,
});
const cats = [
  { id: "sc1", companyId: "c1", name: "Mowing", defaultUmbrellaKey: "landscape_labor", defaultUnit: "visit", sortOrder: 0, isActive: true },
  { id: "sc2", companyId: "c1", name: "Aeration", defaultUmbrellaKey: "irrigation_labor", defaultUnit: "ea", sortOrder: 1, isActive: true },
  { id: "sc3", companyId: "c1", name: "Retired", defaultUmbrellaKey: "plants", defaultUnit: "ea", sortOrder: 2, isActive: false },
];
function catalogs(over: Record<string, () => unknown> = {}) {
  return (c: Call) => {
    if (c.method === "POST") return over.post ? over.post() : ok();
    for (const [k, fn] of Object.entries(over)) if (k !== "post" && c.url.startsWith(k)) { const r = fn(); if (r !== undefined) return r; }
    if (c.url.startsWith("/api/plant-library/items")) return res([{ varietyKey: "pa.v", commonName: "Pampas grass", botanicalName: "Cortaderia", category: "grass", sizes: [
      { id: "ps1", isActive: true, productCode: "P1", sizeCode: "1", sizeLabel: "#1", onHand: 4, salePrice: "18", wholesaleCost: "7" }] }]);
    if (c.url.startsWith("/api/hardscape-catalog")) return res({ categories: [], items: Array.from({ length: 7 }, (_, i) => (
      { id: `h${i}`, name: `Paver ${i}`, sku: null, description: null, unit: "sq ft", category: "general", retailPriceCents: 800 + i, wholesaleCostCents: null, isActive: true })) });
    if (c.url.startsWith("/api/irrigation-catalog")) return res({ categories: [], brands: [], items: [] });
    if (c.url.startsWith("/api/quick-items?kind=service")) return res([
      qi("sv1", "service", "Pa mow", { serviceCategoryId: "sc1", serviceCategoryName: "Mowing", serviceCategoryIsActive: true }),
      qi("sv2", "service", "Pa aerate", { serviceCategoryId: "sc2", serviceCategoryName: "Aeration", serviceCategoryIsActive: true }),
      qi("sv3", "service", "Pa hidden", { serviceCategoryId: "sc3", serviceCategoryName: "Retired", serviceCategoryIsActive: false })]);
    if (c.url.startsWith("/api/quick-items?kind=equipment")) return res([qi("eq1", "equipment", "Pallet jack", { defaultUnit: "day" })]);
    if (c.url.startsWith("/api/quick-items?kind=fee")) return res([qi("fe1", "fee", "Disposal")]);
    if (c.url.startsWith("/api/estimates/service-categories")) return res(cats);
    return undefined;
  };
}
async function openBuilder() { renderAt("/dashboard/estimates/builder/e1"); await ready(); }
const box = () => screen.getByTestId("input-section-search-s2");
async function type(q: string) {
  fireEvent.change(box(), { target: { value: q } });
  await screen.findByTestId("search-create-custom", {}, { timeout: 2000 });
}

describe("section search", () => {
  it("sits above the unchanged type buttons, fans out to all seven catalogs in parallel with existing filters", async () => {
    handler = catalogs();
    await openBuilder();
    expect(screen.getByTestId("text-browse-s2").textContent).toBe("or browse a catalog");
    expect(box().getAttribute("placeholder")).toBe("Search plants, hardscape, irrigation, labor, services, equipment and fees");
    expect(screen.getByTestId("button-add-service-s2")).toBeTruthy();
    fireEvent.change(box(), { target: { value: "p" } });
    await new Promise((r) => setTimeout(r, 300));
    expect(calls().some((c) => c.url.startsWith("/api/plant-library"))).toBe(false);
    await type("pa");
    const urls = calls().map((c) => c.url);
    expect(urls.some((u) => u.includes("/api/plant-library/items?") && u.includes("inStockOnly=false") && u.includes("activeOnly=true") && u.includes("search=pa"))).toBe(true);
    expect(urls.some((u) => u.startsWith("/api/hardscape-catalog") && u.includes("search=pa"))).toBe(true);
    expect(urls.some((u) => u.startsWith("/api/irrigation-catalog") && u.includes("search=pa"))).toBe(true);
    expect(urls.some((u) => u === "/api/estimates/rates/preview?customerId=cu1")).toBe(true);
    for (const k of ["service", "equipment", "fee"]) expect(urls.some((u) => u === `/api/quick-items?kind=${k}`)).toBe(true);
    expect(calls().filter((c) => c.url.startsWith("/api/quick-items")).every((c) => c.headers["X-Company-Id"] === "c1")).toBe(true);
    // Grouped by catalog and service category; max 5 per group; inactive categories hidden.
    await screen.findByTestId("search-group-hardscape");
    expect(within(screen.getByTestId("search-group-hardscape")).getAllByRole("option")).toHaveLength(5);
    expect(screen.getByTestId("search-group-service-sc1").textContent).toContain("Mowing");
    expect(screen.getByTestId("search-group-service-sc2").textContent).toContain("Aeration");
    expect(screen.queryByTestId("search-option-service-sv3")).toBeNull();
    expect(screen.getByTestId("search-option-plant-pa.v-P1").textContent).toContain("4 on hand");
    expect(screen.getByTestId("search-option-hardscape-h0").textContent).toContain("$8.00");
    expect(screen.getByTestId("text-search-keyboard-hint").textContent).toContain("Esc to close");
    expect(posts()).toHaveLength(0);
  });

  it("See all opens that catalog's picker with the query prefilled", async () => {
    handler = catalogs();
    await openBuilder();
    await type("pa");
    fireEvent.click(await screen.findByTestId("search-see-all-hardscape"));
    await screen.findByTestId("dialog-add-line");
    expect((screen.getByTestId("input-picker-search") as HTMLInputElement).value).toBe("pa");
    expect(screen.getByText("Add hardscape")).toBeTruthy();
    expect(await screen.findAllByTestId(/^option-h\d$/)).toHaveLength(7);
  });

  it("one failing catalog stays inside its own group with retry", async () => {
    let fail = true;
    handler = catalogs({ "/api/hardscape-catalog": () => fail ? res({ message: "down" }, 500) : undefined });
    await openBuilder();
    await type("pa");
    const err = await screen.findByTestId("search-error-hardscape");
    expect(err.textContent).toContain("Couldn't load Hardscape");
    expect(screen.getByTestId("search-option-equipment-eq1")).toBeTruthy();
    expect(screen.getByTestId("search-option-plant-pa.v-P1")).toBeTruthy();
    fail = false;
    fireEvent.click(err);
    await screen.findByTestId("search-group-hardscape");
  });

  it("click opens the typed picker with the row selected and Quantity focused; never adds; Enter there adds", async () => {
    handler = catalogs();
    await openBuilder();
    await type("pa");
    fireEvent.click(await screen.findByTestId("search-option-service-sv2"));
    await screen.findByTestId("dialog-add-line");
    expect((screen.getByTestId("input-picker-search") as HTMLInputElement).value).toBe("pa");
    await waitFor(() => expect(screen.getByTestId("option-sv2").getAttribute("aria-selected")).toBe("true"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("input-picker-quantity")));
    expect(posts()).toHaveLength(0);
    fireEvent.change(screen.getByTestId("input-picker-quantity"), { target: { value: "3" } });
    fireEvent.keyDown(screen.getByTestId("input-picker-quantity"), { key: "Enter" });
    await waitFor(() => expect(posts()[0]?.body).toEqual({ lineType: "service", sectionId: "s2", quantity: "3", quickItemId: "sv2" }));
  });

  it("keyboard: arrows move aria-activedescendant over unique ids, Enter hands off, disabled rows cannot be chosen, Esc clears", async () => {
    handler = catalogs();
    await openBuilder();
    await type("gh");
    const ghost = await screen.findByTestId("search-option-labor-ghost");
    expect(screen.getByTestId("search-disabled-labor-ghost").textContent).toContain("No rate set");
    expect(box().getAttribute("role")).toBe("combobox");
    expect(box().getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    fireEvent.click(ghost);
    const at = within(screen.getByRole("listbox")).getAllByRole("option").indexOf(ghost);
    for (let i = 0; i <= at; i++) fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(box().getAttribute("aria-activedescendant")).toBe(ghost.id);
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(screen.queryByTestId("dialog-add-line")).toBeNull();
    const ids = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    fireEvent.keyDown(box(), { key: "Escape" });
    expect((box() as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("panel-section-search-s2")).toBeNull();
    await type("pal");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });
    await screen.findByTestId("dialog-add-line");
    expect(screen.getByText("Add plant")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });

  it("never shows or hands off rows from a previous query while the new text is debouncing", async () => {
    handler = catalogs();
    await openBuilder();
    await type("pa");
    fireEvent.change(box(), { target: { value: "pal" } });
    expect(screen.getByTestId("search-pending")).toBeTruthy();
    expect(screen.queryByTestId("search-option-hardscape-h0")).toBeNull();
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(screen.queryByTestId("dialog-add-line")).toBeNull();
  });

  it("Create custom item prefills Name", async () => {
    handler = catalogs();
    await openBuilder();
    await type("Flagstone cap");
    expect(screen.getByTestId("search-create-custom").textContent).toContain("Create custom item \u201cFlagstone cap\u201d");
    fireEvent.click(screen.getByTestId("search-create-custom"));
    expect((await screen.findByTestId("input-free-name") as HTMLInputElement).value).toBe("Flagstone cap");
  });

  it("drops delayed search results and input after an identity/company switch", async () => {
    let resolvePlant!: (value: unknown) => void;
    const delayed = new Promise(resolve => { resolvePlant = resolve; });
    handler = catalogs({ "/api/plant-library/items": () => delayed });
    const view = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    await type("pa");
    await waitFor(() => expect(calls().some(c => c.url.startsWith("/api/plant-library/items"))).toBe(true));
    auth.user = { id: "u2", activeCompanyId: "c2", activeRole: "admin" };
    view.rerenderPage();
    await ready();
    expect((box() as HTMLInputElement).value).toBe("");
    await act(async () => { resolvePlant(res([{ varietyKey: "old", commonName: "Old company plant", sizes: [
      { id: "oldplant", productCode: "old", isActive: true, sizeLabel: "old", onHand: 1 },
    ] }])); });
    expect(screen.queryByText("Old company plant")).toBeNull();
    expect(screen.queryByTestId("panel-section-search-s2")).toBeNull();
  });

  it("idPart is injective", () => {
    expect(idPart("a.b")).not.toBe(idPart("a_b"));
    expect(idPart("a b")).not.toBe(idPart("a_20_b".replace(/_20_/, " ") + "x"));
    expect(idPart("a_2e_b")).not.toBe(idPart("a.b"));
    expect(idPart("ok-1")).toBe("ok-1");
  });

  it("Spanish search copy", async () => {
    await i18n.changeLanguage("es");
    handler = catalogs({ "/api/hardscape-catalog": () => res({}, 500) });
    await openBuilder();
    expect(screen.getByTestId("text-browse-s2").textContent).toBe("o explore un catálogo");
    await type("pa");
    expect(screen.getByTestId("text-search-keyboard-hint").textContent).toContain("Esc para cerrar");
    expect((await screen.findByTestId("search-error-hardscape")).textContent).toContain("No se pudo cargar");
  });
});

describe("custom line dialog", () => {
  async function openCustom() {
    await openBuilder();
    fireEvent.click(screen.getByTestId("button-add-custom-s1"));
    await screen.findByTestId("dialog-add-line");
    await screen.findByTestId("chip-custom-category-service-sc1");
  }
  function fill(name: string, rate = "45", qty = "2") {
    fireEvent.change(screen.getByTestId("input-free-name"), { target: { value: name } });
    fireEvent.change(screen.getByTestId("input-free-rate"), { target: { value: rate } });
    fireEvent.change(screen.getByTestId("input-free-quantity"), { target: { value: qty } });
  }

  it("requires a category, marks required fields, derives Posts to, has exact units and no Posts-to select", async () => {
    handler = catalogs();
    await openCustom();
    expect(screen.getByTestId("text-custom-header").textContent).toBe("Fields marked * are required. The category decides where the line posts in QuickBooks.");
    expect(screen.getAllByTestId("mark-required")).toHaveLength(5);
    expect(screen.queryByTestId("select-free-umbrella")).toBeNull();
    expect(screen.queryByTestId("chip-custom-category-service-sc3")).toBeNull();
    expect([...(screen.getByTestId("select-free-unit") as HTMLSelectElement).options].map((o) => o.value))
      .toEqual(["SF", "LF", "1,000 SF", "HR", "DAY", "WEEK", "EA", "FLAT", "GAL", "CU. YD", "LB", "BAG", "TON", "IN. DBH"]);
    expect((screen.getByTestId("button-free-add") as HTMLButtonElement).disabled).toBe(true);
    for (const [chip, label] of [["plants", "Plants"], ["hardscape", "Landscape Materials"], ["irrigation_parts", "Irrigation Materials"], ["fees", "Fees & Surcharges"], ["service-sc2", "Irrigation Labor"]]) {
      fireEvent.click(screen.getByTestId(`chip-custom-category-${chip}`));
      expect(screen.getByTestId("text-custom-posts-to").textContent).toContain(label);
    }
    fireEvent.click(screen.getByTestId("chip-custom-category-landscape_labor"));
    fill("Boulder set", "450", "1");
    fireEvent.change(screen.getByTestId("select-free-unit"), { target: { value: "TON" } });
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ lineType: "custom", sectionId: "s1", quantity: "1", name: "Boulder set", unit: "TON", unitPriceCents: 45000, umbrellaKey: "landscape_labor" }));
    await waitFor(() => expect(screen.queryByTestId("dialog-add-line")).toBeNull());
  });

  it("save checkbox: disabled reasons per category; equipment and hardscape accept the shared units", async () => {
    handler = catalogs();
    await openCustom();
    const cb = () => screen.getByTestId("checkbox-save-catalog") as HTMLInputElement;
    expect(cb().disabled).toBe(true);
    for (const [chip, reason] of [["plants", "Plants come from the Plant Library"], ["irrigation_parts", "Irrigation parts come from IrrigoPro"], ["landscape_labor", "Labor rates live in Labor & Rates"], ["irrigation_labor", "Labor rates live in Labor & Rates"]]) {
      fireEvent.click(screen.getByTestId(`chip-custom-category-${chip}`));
      expect(cb().disabled).toBe(true);
      expect(screen.getByTestId("text-save-reason").textContent).toBe(reason);
    }
    fireEvent.click(screen.getByTestId("chip-custom-category-equipment"));
    fireEvent.change(screen.getByTestId("select-free-unit"), { target: { value: "CU. YD" } });
    expect(cb().disabled).toBe(false);
    fireEvent.click(screen.getByTestId("chip-custom-category-hardscape"));
    expect(cb().disabled).toBe(false);
    expect(screen.getByTestId("card-save-catalog").textContent).toContain("Also save to the Hardscape catalog");
    fireEvent.click(cb());
    expect(screen.getByTestId("button-free-add").textContent).toBe("Add line and save new item");
    fill("Rip rap", "60", "3");
    fireEvent.change(screen.getByTestId("input-free-detail"), { target: { value: "6in" } });
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ lineType: "custom", sectionId: "s1", quantity: "3", name: "Rip rap", detail: "6in", unit: "CU. YD",
      unitPriceCents: 6000, umbrellaKey: "landscape_materials", saveToCatalog: { catalog: "hardscape" } }));
  });

  it("similar-item matches (3+ chars, debounced) and Use this instead adds the reference with entered quantity", async () => {
    handler = catalogs({ "/api/estimates/catalog-matches": () => res([{ id: "sv1", name: "Pa mow", unit: "visit", priceCents: 4500, categoryName: "Mowing" }]) });
    await openCustom();
    fireEvent.click(screen.getByTestId("chip-custom-category-service-sc1"));
    fireEvent.change(screen.getByTestId("select-free-unit"), { target: { value: "FLAT" } });
    fireEvent.click(screen.getByTestId("checkbox-save-catalog"));
    fill("Pa", "40", "6");
    await new Promise((r) => setTimeout(r, 300));
    expect(calls().some((c) => c.url.startsWith("/api/estimates/catalog-matches"))).toBe(false);
    fireEvent.change(screen.getByTestId("input-free-name"), { target: { value: "Pa m" } });
    const panel = await screen.findByTestId("panel-catalog-matches", {}, { timeout: 2000 });
    expect(calls().some((c) => c.url === "/api/estimates/catalog-matches?catalog=service&serviceCategoryId=sc1&name=Pa+m")).toBe(true);
    expect(panel.textContent).toContain("1 similar item is already in the catalog");
    expect(panel.textContent).toContain("Mowing");
    fireEvent.click(screen.getByTestId("button-use-match-sv1"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ lineType: "service", quickItemId: "sv1", sectionId: "s1", quantity: "6" }));
    await waitFor(() => expect(screen.queryByTestId("dialog-add-line")).toBeNull());
  });

  it("matches load error is recoverable with retry", async () => {
    let fail = true;
    handler = catalogs({ "/api/estimates/catalog-matches": () => fail ? res({}, 500) : res([{ id: "q9", name: "Dump fee", unit: "ea", priceCents: null, categoryName: null }]) });
    await openCustom();
    fireEvent.click(screen.getByTestId("chip-custom-category-fees"));
    fireEvent.click(screen.getByTestId("checkbox-save-catalog"));
    fill("Dump");
    await screen.findByTestId("error-catalog-matches", {}, { timeout: 2000 });
    fail = false;
    fireEvent.click(screen.getByTestId("button-matches-retry"));
    await screen.findByTestId("row-match-q9");
  });

  it("409 CATALOG_ITEM_EXISTS shows inline, keeps fields and reuses the real kind; inactive existing cannot be reused", async () => {
    let existing: Record<string, unknown> = { id: "sv9", name: "Edging", kind: "service", isActive: true, serviceCategoryIsActive: true };
    let n = 0;
    handler = catalogs({
      "/api/estimates/catalog-matches": () => res([]),
      post: () => (++n === 1 || n === 3) ? res({ error: "CATALOG_ITEM_EXISTS", existing }, 409) : ok(),
    });
    await openCustom();
    fireEvent.click(screen.getByTestId("chip-custom-category-equipment"));
    fireEvent.click(screen.getByTestId("checkbox-save-catalog"));
    fill("Edging", "12", "4");
    fireEvent.click(screen.getByTestId("button-free-add"));
    const alert = await screen.findByTestId("alert-catalog-exists");
    expect(alert.textContent).toContain("Services catalog");
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect((screen.getByTestId("input-free-name") as HTMLInputElement).value).toBe("Edging");
    expect(posts()[0].body).toMatchObject({ saveToCatalog: { catalog: "equipment" }, umbrellaKey: "landscape_labor" });
    fireEvent.click(screen.getByTestId("button-use-existing"));
    await waitFor(() => expect(posts()[1]?.body).toEqual({ lineType: "service", quickItemId: "sv9", sectionId: "s1", quantity: "4" }));
    await waitFor(() => expect(screen.queryByTestId("dialog-add-line")).toBeNull());
    // Inactive / hidden category: no reuse offered.
    existing = { id: "sv8", name: "Old edge", kind: "service", isActive: true, serviceCategoryIsActive: false };
    fireEvent.click(screen.getByTestId("button-add-custom-s1"));
    fireEvent.click(await screen.findByTestId("chip-custom-category-equipment"));
    fireEvent.click(screen.getByTestId("checkbox-save-catalog"));
    fill("Old edge");
    fireEvent.click(screen.getByTestId("button-free-add"));
    expect((await screen.findByTestId("text-existing-inactive")).textContent).toContain("inactive");
    expect(screen.queryByTestId("button-use-existing")).toBeNull();
  });

  it("UMBRELLA_MISMATCH stays inline and refreshes categories", async () => {
    handler = catalogs({ "/api/estimates/catalog-matches": () => res([]), post: () => res({ error: "UMBRELLA_MISMATCH" }, 422) });
    await openCustom();
    fireEvent.click(screen.getByTestId("chip-custom-category-service-sc2"));
    fireEvent.click(screen.getByTestId("checkbox-save-catalog"));
    fill("Core plugs");
    const before = calls().filter((c) => c.url.startsWith("/api/estimates/service-categories")).length;
    fireEvent.click(screen.getByTestId("button-free-add"));
    expect((await screen.findByTestId("error-custom-save")).textContent).toContain("posts somewhere else");
    expect(posts()[0].body).toMatchObject({ umbrellaKey: "irrigation_labor", saveToCatalog: { catalog: "service", serviceCategoryId: "sc2" } });
    await waitFor(() => expect(calls().filter((c) => c.url.startsWith("/api/estimates/service-categories")).length).toBeGreaterThan(before));
    expect(screen.getByTestId("dialog-add-line")).toBeTruthy();
  });

  it("a successful catalog save refreshes catalog owners and matching/search projections", async () => {
    handler = catalogs({ "/api/estimates/catalog-matches": () => res([]) });
    const view = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const prefixes = ["estimate-picker", "estimate-catalog-matches", "/api/hardscape-catalog", "/api/quick-items", "/api/estimates/service-categories"];
    for (const prefix of prefixes) view.client.setQueryData([prefix, "inactive-cache"], []);
    fireEvent.click(screen.getByTestId("button-add-custom-s1"));
    fireEvent.click(await screen.findByTestId("chip-custom-category-equipment"));
    fireEvent.click(screen.getByTestId("checkbox-save-catalog"));
    fill("Saved rental", "12", "2");
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(screen.queryByTestId("dialog-add-line")).toBeNull());
    for (const prefix of prefixes) expect(view.client.getQueryState([prefix, "inactive-cache"])?.isInvalidated).toBe(true);
  });

  it("a delayed custom save cannot close a new company's dialog or discard its fields", async () => {
    let resolveSave!: (value: unknown) => void;
    const delayed = new Promise(resolve => { resolveSave = resolve; });
    handler = catalogs({ post: () => delayed, "/api/estimates/catalog-matches": () => res([]) });
    const view = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-add-custom-s1"));
    fireEvent.click(await screen.findByTestId("chip-custom-category-equipment"));
    fill("Previous company rental");
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    auth.user = { id: "u2", activeCompanyId: "c2", activeRole: "admin" };
    view.rerenderPage();
    await ready();
    fireEvent.click(screen.getByTestId("button-add-custom-s1"));
    await screen.findByTestId("input-free-name");
    fireEvent.change(screen.getByTestId("input-free-name"), { target: { value: "New unsaved item" } });
    await act(async () => { resolveSave(ok()); });
    expect(screen.getByTestId("dialog-add-line")).toBeTruthy();
    expect((screen.getByTestId("input-free-name") as HTMLInputElement).value).toBe("New unsaved item");
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Line added" }));
  });

  it("Spanish custom copy", async () => {
    await i18n.changeLanguage("es");
    handler = catalogs();
    await openCustom();
    expect(screen.getByTestId("text-custom-header").textContent).toContain("Los campos marcados con * son obligatorios");
    fireEvent.click(screen.getByTestId("chip-custom-category-plants"));
    expect(screen.getByTestId("text-save-reason").textContent).toBe("Las plantas vienen de la Biblioteca de plantas");
    expect(screen.getByTestId("text-custom-posts-to").textContent).toContain("Se registra en QuickBooks como");
  });
});
