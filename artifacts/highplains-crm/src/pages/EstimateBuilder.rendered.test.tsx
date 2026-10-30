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

describe("builder rendering", () => {
  it("renders header, every line type, server totals, margin box, hidden zero buckets and lit draft flow", async () => {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("text-estimate-number").textContent).toBe("E-2025-0042");
    expect(screen.getByTestId("pill-status-draft").textContent).toBe("v2 · Draft");
    await waitFor(() => expect(screen.getByTestId("link-customer").textContent).toBe("Ridge HOA"));
    await waitFor(() => expect(screen.getByTestId("text-ticket-status").textContent).toBe("Estimating"));
    expect(calls().some(c => c.url === "/api/tickets/t1/details" && c.headers["X-Company-Id"] === "c1")).toBe(true);
    expect(screen.getByTestId("link-ticket").getAttribute("href")).toBe("/dashboard/tickets/t1");
    await waitFor(() => expect(screen.getByTestId("chip-rates").textContent).toBe("Rates: Contract 2025 Season"));
    for (const ty of ["plant", "hardscape", "irrigation", "labor", "equipment", "fee", "custom"]) {
      expect(screen.getByTestId(`row-line-l-${ty}`).getAttribute("data-line-type")).toBe(ty);
      expect(screen.getByTestId(`button-add-${ty}-s1`)).toBeTruthy();
    }
    const tints = new Set(["plant", "hardscape", "irrigation", "labor", "equipment", "fee", "custom"].map((ty) => screen.getByTestId(`chip-type-l-${ty}`).style.color));
    expect(tints.size).toBe(7);
    expect(screen.getByTestId("badge-source-l-labor").textContent).toBe("rate card");
    expect(screen.getByTestId("badge-source-l-fee").textContent).toBe("quick list");
    expect(screen.getByTestId("marker-needs-price-l-labor")).toBeTruthy();
    expect(screen.queryByTestId("marker-needs-price-l-plant")).toBeNull();
    expect(screen.getByTestId("toggle-palette-l-plant").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("toggle-palette-l-hardscape")).toBeNull();
    expect(screen.getByTestId("select-unit-l-equipment")).toBeTruthy();
    expect(screen.queryByTestId("select-unit-l-hardscape")).toBeNull();
    expect(screen.getByTestId("text-estimate-total").textContent).toBe("$8,734.12");
    expect(screen.getByTestId("text-section-subtotal-s1").textContent).toBe("$8,734.12");
    expect(screen.getByTestId("text-section-count-s1").textContent).toBe("7 lines");
    expect(screen.getByTestId("text-known-cost").textContent).toBe("$2,110.50");
    expect(screen.getByTestId("text-margin").textContent).toBe("47.2%");
    expect(screen.getByTestId("text-unknown-cost").textContent).toBe("3 lines without cost (labor, equipment, fees) not included");
    expect(screen.getByTestId("row-umbrella-plants")).toBeTruthy();
    expect(screen.getByTestId("row-umbrella-landscape_labor")).toBeTruthy();
    expect(screen.queryByTestId("row-umbrella-irrigation_materials")).toBeNull();
    expect(screen.getByTestId("flow-draft").getAttribute("data-lit")).toBe("true");
    expect(screen.getByTestId("button-mark-sent")).toBeTruthy();
    expect(screen.queryByTestId("button-record-accept")).toBeNull();
    expect(screen.queryByTestId("button-revise")).toBeNull();
    expect(screen.getByTestId("chip-version-2").getAttribute("data-current")).toBe("true");
    for (const c of calls()) expect(c.headers["X-Company-Id"]).toBe("c1");
  });

  it("renders every distinct governing context without choosing one", () => {
    expect(distinctContexts([
      { line: "landscape", termId: "a", seasonLabel: "2025" }, { line: "irrigation", termId: null, seasonLabel: null }, { line: "general", termId: "a", seasonLabel: "2025" },
    ])).toEqual([{ termId: "a", seasonLabel: "2025", lines: ["landscape", "general"] }, { termId: null, seasonLabel: null, lines: ["irrigation"] }]);
  });
  it("shows Rate Card when every context is the card, and both chips when they differ", async () => {
    handler = (c) => c.url.startsWith("/api/estimates/rates") ? res({ items: [], governingContexts: [{ line: "landscape", termId: null, seasonLabel: null }] }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await waitFor(() => expect(screen.getByTestId("chip-rates").textContent).toBe("Rates: Rate Card"));
    cleanup();
    handler = (c) => c.url.startsWith("/api/estimates/rates") ? res({ items: [], governingContexts: [
      { line: "landscape", termId: "tm1", seasonLabel: "2025" }, { line: "irrigation", termId: null, seasonLabel: null }] }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await waitFor(() => expect(screen.getByTestId("chip-rates-tm1").textContent).toContain("Rates: Contract 2025 (landscape)"));
    expect(screen.getByTestId("chip-rates-card").textContent).toContain("Rates: Rate Card (irrigation)");
  });
});

describe("inline edits", () => {
  it("Enter then blur commits quantity exactly once and shows server totals", async () => {
    handler = (c) => c.method === "PATCH" ? res({ ...makeDetail({ subtotal: 900000, updatedAt: "2025-04-01T11:00:00.000Z" }) }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const q = screen.getByTestId("input-quantity-l-hardscape") as HTMLInputElement;
    q.focus();
    fireEvent.change(q, { target: { value: "2.5" } });
    fireEvent.keyDown(q, { key: "Enter" });
    fireEvent.blur(q);
    await waitFor(() => expect(screen.getByTestId("text-estimate-total").textContent).toBe("$9,000.00"));
    const p = mutations();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ method: "PATCH", url: "/api/estimates/e1/versions/v2/lines/l-hardscape", body: { quantity: "2.5" } });
    expect(p[0].headers["X-Company-Id"]).toBe("c1");
  });

  it("rate converts dollars to cents; invalid input never calls the API", async () => {
    handler = (c) => c.method === "PATCH" ? res(makeDetail({ updatedAt: "2025-04-01T11:00:00.000Z" })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const r = screen.getByTestId("input-rate-l-labor") as HTMLInputElement;
    fireEvent.change(r, { target: { value: "1.234" } });
    fireEvent.blur(r);
    expect(mutations()).toHaveLength(0);
    expect(r.value).toBe("0.00");
    fireEvent.change(r, { target: { value: "$1,212.50" } });
    fireEvent.blur(r);
    await waitFor(() => expect(mutations()[0]?.body).toEqual({ unitPriceCents: 121250 }));
  });

  it("failed save restores the authoritative value and shows translated feedback", async () => {
    handler = (c) => c.method === "PATCH" ? res({ error: "boom internal" }, 500) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const q = screen.getByTestId("input-quantity-l-plant") as HTMLInputElement;
    fireEvent.change(q, { target: { value: "9" } });
    fireEvent.blur(q);
    await waitFor(() => expect(q.value).toBe("1.00"));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Save failed", description: "Something went wrong. Your change was not saved." }));
  });

  it("title edits, palette toggle, unit select, removal, reorder and move send exact payloads", async () => {
    handler = (c) => c.method !== "GET" ? res(makeDetail({ updatedAt: "2025-04-01T11:00:00.000Z" })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const title = screen.getByTestId("input-estimate-title");
    fireEvent.change(title, { target: { value: " Spring install II " } }); fireEvent.blur(title);
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]).toMatchObject({ method: "PATCH", url: "/api/estimates/e1", body: { title: "Spring install II" } });
    fireEvent.click(screen.getByTestId("toggle-palette-l-plant"));
    fireEvent.change(screen.getByTestId("select-unit-l-equipment"), { target: { value: "day" } });
    fireEvent.click(screen.getByTestId("button-remove-line-l-fee"));
    fireEvent.change(screen.getByTestId("select-move-l-custom"), { target: { value: "s2" } });
    await waitFor(() => expect(mutations()).toHaveLength(5));
    const m = mutations();
    expect(m[1].body).toEqual({ includeInPalette: false });
    expect(m[2].body).toEqual({ unit: "day" });
    expect(m[3]).toMatchObject({ method: "DELETE", url: "/api/estimates/e1/versions/v2/lines/l-fee" });
    expect(m[4].body).toEqual({ sectionId: "s2", sortOrder: 0 });
    fireEvent.click(screen.getByTestId("button-move-down-l-plant"));
    await waitFor(() => expect(mutations().length).toBeGreaterThanOrEqual(7));
    expect(mutations().slice(5, 7).map((c) => [c.url.split("/").pop(), c.body])).toEqual([["l-hardscape", { sortOrder: 0 }], ["l-plant", { sortOrder: 1 }]]);
    expect((screen.getByTestId("button-move-up-l-plant") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("sections", () => {
  it("never offers removal of the last section", async () => {
    detail = makeDetail({ sections: 1 });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.queryByTestId("button-remove-section-s1")).toBeNull();
  });
  it("confirms removal, adds sections and renames", async () => {
    handler = (c) => c.method !== "GET" ? res(makeDetail({ sections: 1, updatedAt: "2025-04-01T11:00:00.000Z" })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-remove-section-s2"));
    fireEvent.click(await screen.findByTestId("button-confirm-remove-section"));
    await waitFor(() => expect(mutations()[0]).toMatchObject({ method: "DELETE", url: "/api/estimates/e1/versions/v2/sections/s2" }));
    await waitFor(() => expect(screen.queryByTestId("card-section-s2")).toBeNull());
    expect(screen.queryByTestId("button-remove-section-s1")).toBeNull();
    fireEvent.click(screen.getByTestId("button-add-section"));
    await waitFor(() => expect(mutations()[1]).toMatchObject({ method: "POST", url: "/api/estimates/e1/versions/v2/sections", body: { name: "New section" } }));
    const name = screen.getByTestId("input-section-name-s1");
    fireEvent.change(name, { target: { value: "Patio" } }); fireEvent.keyDown(name, { key: "Enter" }); fireEvent.blur(name);
    await waitFor(() => expect(mutations()).toHaveLength(3));
    expect(mutations()[2].body).toEqual({ name: "Patio" });
  });
});

describe("read-only and lock", () => {
  it("non-draft current version is read-only with no mutation paths", async () => {
    detail = makeDetail({ status: "sent" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("banner-read-only").textContent).toContain("Sent");
    expect(screen.queryByTestId("input-estimate-title")).toBeNull();
    expect(screen.queryByTestId("button-add-section")).toBeNull();
    expect(screen.queryByTestId("bar-add-s1")).toBeNull();
    expect(screen.queryByTestId("button-remove-line-l-plant")).toBeNull();
    const q = screen.getByTestId("input-quantity-l-plant") as HTMLInputElement;
    expect(q.disabled).toBe(true);
    fireEvent.change(q, { target: { value: "5" } }); fireEvent.keyDown(q, { key: "Enter" }); fireEvent.blur(q);
    fireEvent.click(screen.getByTestId("toggle-palette-l-plant"));
    expect(mutations()).toHaveLength(0);
    expect(screen.getByTestId("flow-sent").getAttribute("data-lit")).toBe("true");
    expect(screen.getByTestId("flow-draft").getAttribute("data-lit")).toBe("false");
  });
  it("historical ?version=N loads that version read-only with the current version indicated", async () => {
    const { loc } = renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    expect(calls().some((c) => c.url === "/api/estimates/e1?version=1")).toBe(true);
    expect(screen.getByTestId("bar-not-current").textContent).toContain("version 1");
    expect(screen.getByTestId("banner-read-only").getAttribute("data-tone")).toBe("superseded");
    expect(screen.getByTestId("chip-version-1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("chip-version-2").getAttribute("data-current")).toBe("true");
    expect(screen.queryByTestId("input-estimate-title")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-version-2"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e1"));
  });
  it("void estimate is read-only", async () => {
    detail = makeDetail({ voidedAt: T0 });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("banner-read-only").textContent).toContain("void");
    expect(screen.queryByTestId("button-add-section")).toBeNull();
  });
  it("VERSION_LOCKED refetches, shows the banner and removes editing", async () => {
    handler = (c) => c.method === "PATCH" ? res({ error: "VERSION_LOCKED" }, 409) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const gets = () => calls().filter((c) => c.method === "GET" && c.url === "/api/estimates/e1").length;
    const before = gets();
    detail = makeDetail({ status: "sent" });
    const q = screen.getByTestId("input-quantity-l-plant");
    fireEvent.change(q, { target: { value: "3" } }); fireEvent.blur(q);
    expect(await screen.findByTestId("banner-locked")).toBeTruthy();
    await waitFor(() => expect(gets()).toBeGreaterThan(before));
    expect((screen.getByTestId("input-quantity-l-plant") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("button-add-section")).toBeNull();
  });
  it("missing estimate shows a clear not-found state", async () => {
    handler = (c) => c.url === "/api/estimates/e1" ? res({ error: "not found" }, 404) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    expect((await screen.findByTestId("builder-error")).textContent).toContain("does not exist");
  });
});

describe("races", () => {
  it("drops a mutation response that arrives after a version switch", async () => {
    let release!: () => void;
    handler = (c) => c.method === "PATCH" ? new Promise((r) => { release = () => r(res(makeDetail({ subtotal: 111, updatedAt: "2025-05-01T00:00:00.000Z" }))); }) : undefined;
    const { loc } = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const q = screen.getByTestId("input-quantity-l-plant");
    fireEvent.change(q, { target: { value: "4" } }); fireEvent.blur(q);
    await waitFor(() => expect(mutations()).toHaveLength(1));
    act(() => loc.navigate("/dashboard/estimates/builder/e1?version=1"));
    await screen.findByTestId("banner-read-only");
    await act(async () => { release(); });
    expect(screen.getByTestId("text-estimate-total").textContent).toBe("$8,734.12");
    expect(toastSpy).not.toHaveBeenCalled();
  });
  it("a late older server payload never overwrites a newer one", async () => {
    const pending: Array<(v: unknown) => void> = [];
    handler = (c) => c.method === "PATCH" ? new Promise((r) => pending.push(r)) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    const a = screen.getByTestId("input-quantity-l-plant"), b = screen.getByTestId("input-quantity-l-hardscape");
    fireEvent.change(a, { target: { value: "2" } }); fireEvent.blur(a);
    fireEvent.change(b, { target: { value: "3" } }); fireEvent.blur(b);
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[0](res(makeDetail({ subtotal: 222222, updatedAt: "2025-04-01T12:00:00.000Z" }))); });
    await waitFor(() => expect(screen.getByTestId("text-estimate-total").textContent).toBe("$2,222.22"));
    await act(async () => { pending[1](res(makeDetail({ subtotal: 111111, updatedAt: "2025-04-01T11:00:00.000Z" }))); });
    expect(screen.getByTestId("text-estimate-total").textContent).toBe("$2,222.22");
  });
  it("tenant switch remounts and never shows prior-company values", async () => {
    const { rerenderPage } = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    handler = (c) => c.url === "/api/estimates/e1" ? new Promise(() => {}) : undefined;
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "office" };
    rerenderPage();
    expect(screen.queryByTestId("text-estimate-total")).toBeNull();
    expect(screen.getByTestId("builder-loading")).toBeTruthy();
    expect(calls().filter((c) => c.url === "/api/estimates/e1").at(-1)?.headers["X-Company-Id"]).toBe("c2");
  });
});

describe("pickers", () => {
  const ok = () => res(makeDetail({ updatedAt: "2025-04-01T11:00:00.000Z" }), 201);
  async function open(type: string) {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId(`button-add-${type}-s1`));
    return screen.findByTestId("dialog-add-line");
  }
  const posted = () => mutations().find((c) => c.method === "POST")?.body;

  it("hardscape: search autofocus, category chips, inactive hidden, Enter adds reference + quantity only", async () => {
    handler = (c) => {
      if (c.method === "POST") return ok();
      if (c.url.startsWith("/api/hardscape-catalog")) return res({ categories: ["pavers"], items: [
        { id: "h1", name: "Holland paver", sku: "PV", description: "60mm", unit: "sqft", category: "pavers", retailPriceCents: 875, wholesaleCostCents: 412, isActive: true },
        { id: "h2", name: "Old paver", sku: null, description: null, unit: "sqft", category: "pavers", retailPriceCents: 1, wholesaleCostCents: 1, isActive: false },
      ] });
      return undefined;
    };
    await open("hardscape");
    const search = screen.getByTestId("input-picker-search");
    expect(document.activeElement).toBe(search);
    await screen.findByTestId("option-h1");
    expect(screen.queryByTestId("option-h2")).toBeNull();
    expect(screen.getByTestId("option-h1").textContent).toContain("cost $4.12");
    fireEvent.click(screen.getByTestId("chip-picker-category-pavers"));
    await waitFor(() => expect(calls().some((c) => c.url.includes("category=pavers"))).toBe(true));
    fireEvent.change(screen.getByTestId("input-picker-quantity"), { target: { value: "120" } });
    await screen.findByTestId("option-h1");
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(screen.queryByTestId("dialog-add-line")).toBeNull());
    expect(posted()).toEqual({ lineType: "hardscape", sectionId: "s1", quantity: "120", hardscapeCatalogItemId: "h1" });
  });

  it("irrigation: brand filter and reference-only payload", async () => {
    handler = (c) => {
      if (c.method === "POST") return ok();
      if (c.url.startsWith("/api/irrigation-catalog")) return res({ categories: ["valves"], brands: ["Rain Bird"], items: [
        { id: "i1", name: "1in valve", sku: "RB", description: null, unit: "ea", category: "valves", retailPriceCents: 3400, wholesaleCostCents: 2100, isActive: true }] });
      return undefined;
    };
    await open("irrigation");
    fireEvent.click(await screen.findByTestId("chip-picker-brand-Rain Bird"));
    await waitFor(() => expect(calls().some((c) => c.url.includes("brand=Rain"))).toBe(true));
    fireEvent.click(await screen.findByTestId("option-i1"));
    await waitFor(() => expect(posted()).toEqual({ lineType: "irrigation", sectionId: "s1", quantity: "1", irrigationCatalogItemId: "i1" }));
  });

  it("plant: sends the size-row id (not the variety) and disables sizes without a reference", async () => {
    handler = (c) => {
      if (c.method === "POST") return ok();
      if (c.url.startsWith("/api/plant-library/items")) return res([{ varietyKey: "acer-rubrum", commonName: "Red maple", botanicalName: "Acer rubrum", category: "tree", sizes: [
        { id: "row-15", isActive: true, productCode: "AR15", sizeCode: "15", sizeLabel: "#15", onHand: 0, salePrice: "189.00", wholesaleCost: "92.5" },
        { productCode: "AR5", sizeCode: "5", sizeLabel: "#5", onHand: 3, salePrice: null, wholesaleCost: null },
        { id: "row-x", isActive: false, productCode: "ARX", sizeCode: "x", sizeLabel: "#x", onHand: 9, salePrice: null, wholesaleCost: null }] }]);
      return undefined;
    };
    await open("plant");
    const row = await screen.findByTestId("option-acer-rubrum-AR15");
    expect(calls().some((c) => c.url.includes("inStockOnly=false") && c.url.includes("activeOnly=true"))).toBe(true);
    expect(row.textContent).toContain("0 on hand");
    expect(row.textContent).toContain("cost $92.50");
    expect(screen.queryByTestId("option-acer-rubrum-ARX")).toBeNull();
    fireEvent.click(screen.getByTestId("option-acer-rubrum-AR5"));
    expect(screen.getByTestId("option-acer-rubrum-AR5").textContent).toContain("Size reference unavailable");
    expect(posted()).toBeUndefined();
    fireEvent.click(row);
    await waitFor(() => expect(posted()).toEqual({ lineType: "plant", sectionId: "s1", quantity: "1", plantCatalogItemId: "row-15" }));
  });

  it("labor: resolved rows with source badges, text-only warning, unset disabled, rateKey only", async () => {
    handler = (c) => c.method === "POST" ? ok() : undefined;
    await open("labor");
    expect((await screen.findByTestId("warn-design")).textContent).toContain("you'll set the price");
    expect(screen.getByTestId("option-ghost").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("option-ghost"));
    expect(posted()).toBeUndefined();
    expect(screen.getByTestId("option-crew").textContent).toContain("contract");
    fireEvent.keyDown(screen.getByTestId("input-picker-search"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("input-picker-search"), { key: "Enter" });
    await waitFor(() => expect(posted()).toEqual({ lineType: "labor", sectionId: "s1", quantity: "1", rateKey: "design" }));
  });

  it.each([["equipment", "landscape_labor"], ["fee", "fees_surcharges"]])("%s quick list hides inactive and Free-type defaults umbrella to %s", async (kind, umbrella) => {
    handler = (c) => {
      if (c.method === "POST") return ok();
      if (c.url.startsWith("/api/quick-items")) return res([
        { id: "q1", kind, label: "Skid steer", defaultUnit: "day", defaultRateCents: null, umbrellaKey: umbrella, isActive: true, sortOrder: 0, companyId: "c1" },
        { id: "q2", kind, label: "Retired", defaultUnit: "day", defaultRateCents: 100, umbrellaKey: umbrella, isActive: false, sortOrder: 1, companyId: "c1" }]);
      return undefined;
    };
    await open(kind);
    expect((await screen.findByTestId("option-q1")).textContent).toContain("no default — you set the price");
    expect(screen.queryByTestId("option-q2")).toBeNull();
    fireEvent.click(screen.getByTestId("option-__free"));
    expect((screen.getByTestId("select-free-umbrella") as HTMLSelectElement).value).toBe(umbrella);
    fireEvent.change(screen.getByTestId("input-free-name"), { target: { value: "Dump run" } });
    fireEvent.change(screen.getByTestId("select-free-unit"), { target: { value: "flat" } });
    fireEvent.change(screen.getByTestId("input-free-rate"), { target: { value: "85" } });
    fireEvent.change(screen.getByTestId("input-free-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(posted()).toEqual({ lineType: kind, sectionId: "s1", quantity: "2", name: "Dump run", unit: "flat", unitPriceCents: 8500, umbrellaKey: umbrella }));
  });

  it("quick-list reference sends quickItemId only", async () => {
    handler = (c) => {
      if (c.method === "POST") return ok();
      if (c.url.startsWith("/api/quick-items")) return res([{ id: "q1", kind: "fee", label: "Disposal", defaultUnit: "ea", defaultRateCents: 4500, umbrellaKey: "fees_surcharges", isActive: true, sortOrder: 0, companyId: "c1" }]);
      return undefined;
    };
    await open("fee");
    fireEvent.click(await screen.findByTestId("option-q1"));
    await waitFor(() => expect(posted()).toEqual({ lineType: "fee", sectionId: "s1", quantity: "1", quickItemId: "q1" }));
  });

  it("custom form defaults to Landscape Materials and validates rate", async () => {
    handler = (c) => c.method === "POST" ? ok() : undefined;
    await open("custom");
    expect((screen.getByTestId("select-free-umbrella") as HTMLSelectElement).value).toBe("landscape_materials");
    fireEvent.change(screen.getByTestId("input-free-name"), { target: { value: "Boulder set" } });
    fireEvent.change(screen.getByTestId("input-free-rate"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("button-free-add"));
    expect(posted()).toBeUndefined();
    fireEvent.change(screen.getByTestId("input-free-rate"), { target: { value: "450" } });
    fireEvent.click(screen.getByTestId("button-free-add"));
    await waitFor(() => expect(posted()).toEqual({ lineType: "custom", sectionId: "s1", quantity: "1", name: "Boulder set", unit: "ea", unitPriceCents: 45000, umbrellaKey: "landscape_materials" }));
    await waitFor(() => expect(screen.queryByTestId("dialog-add-line")).toBeNull());
  });
});

describe("list page", () => {
  const row = { id: "e1", companyId: "c1", customerId: "cu1", ticketId: "t1", estimateNumber: "E-2025-0042", title: "Spring install", currentVersionId: "v2",
    voidedAt: null, voidReason: null, createdById: null, createdAt: T0, updatedAt: T0, customerName: "Ridge HOA", currentVersionNumber: 2, currentVersionStatus: "draft", subtotalCents: 873412 };
  it("renders rows, searches, toggles void and creates", async () => {
    handler = (c) => {
      if (c.method === "POST" && c.url === "/api/estimates") return res(makeDetail(), 201);
      if (c.url.startsWith("/api/estimates?") || c.url === "/api/estimates") return res([row]);
      return undefined;
    };
    const { loc } = renderAt("/dashboard/estimates/builder");
    const r = await screen.findByTestId("row-estimate-e1");
    expect(within(r).getByTestId("text-subtotal-e1").textContent).toBe("$8,734.12");
    expect(within(r).getByTestId("text-version-e1").textContent).toBe("v2 · Draft");
    expect(within(r).getByTestId("link-ticket-e1").getAttribute("href")).toBe("/dashboard/tickets/t1");
    expect(within(r).getByTestId("link-estimate-e1").getAttribute("href")).toBe("/dashboard/estimates/builder/e1");
    fireEvent.change(screen.getByTestId("input-search"), { target: { value: "ridge" } });
    await waitFor(() => expect(calls().some((c) => c.url === "/api/estimates?search=ridge")).toBe(true));
    fireEvent.click(screen.getByTestId("switch-show-void"));
    await waitFor(() => expect(calls().some((c) => c.url === "/api/estimates?search=ridge&includeVoid=true")).toBe(true));
    fireEvent.click(screen.getByTestId("button-new-estimate"));
    fireEvent.click(await screen.findByTestId("button-create-estimate"));
    expect(screen.getByTestId("error-customer")).toBeTruthy();
    expect(screen.getByTestId("pick-customer").getAttribute("data-company")).toBe("c1");
    fireEvent.click(screen.getByTestId("pick-customer"));
    fireEvent.change(screen.getByTestId("input-estimate-title"), { target: { value: "Fall cleanup" } });
    fireEvent.click(screen.getByTestId("button-create-estimate"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e1"));
    expect(mutations()[0]).toMatchObject({ body: { customerId: "cu1", title: "Fall cleanup" }, headers: { "X-Company-Id": "c1" } });
  });
  it("shows error with retry and empty state", async () => {
    handler = (c) => c.url.startsWith("/api/estimates") ? res({ error: "x" }, 500) : undefined;
    renderAt("/dashboard/estimates/builder");
    expect(await screen.findByTestId("estimates-error")).toBeTruthy();
    cleanup();
    handler = () => undefined;
    renderAt("/dashboard/estimates/builder");
    expect(await screen.findByTestId("estimates-empty")).toBeTruthy();
  });
});

describe("navigation and Spanish copy", () => {
  it("builder rail entry is active and board/catalog entries are unchanged", () => {
    expect(isEstimatesHubPage("/dashboard/estimates/builder")).toBe(true);
    expect(isEstimatesHubPage("/dashboard/estimates/builder/e1")).toBe(true);
    expect(isEstimatesHubPage("/dashboard/estimates")).toBe(false);
    const loc = memoryLocation({ path: "/dashboard/estimates/builder" });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<Router hook={loc.hook}><EstimatesRail activeKey="builder" /></Router>);
    const link = screen.getAllByRole("link", { name: "Estimate builder" })[0];
    expect(link.getAttribute("href")).toBe("/dashboard/estimates/builder");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link", { name: "All estimates" })[0].getAttribute("href")).toBe("/dashboard/estimates");
    expect(screen.getAllByRole("link", { name: i18n.t("estimates.hardscapeCatalog") })[0].getAttribute("href")).toBe("/dashboard/estimates/catalogs/hardscape");
  });
  it("renders the builder in Spanish", async () => {
    await i18n.changeLanguage("es");
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("pill-status-draft").textContent).toBe("v2 · Borrador");
    expect(screen.getByTestId("card-internal-margin").textContent).toContain("INTERNO");
    expect(screen.getByTestId("text-unknown-cost").textContent).toContain("3 líneas sin costo");
    expect(screen.getByTestId("button-add-section").textContent).toContain("Agregar sección");
  });
});
