// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
import EstimateBuilder from "./EstimateBuilder";
import EstimateBuilderList from "./EstimateBuilderList";
import { conflictOf, denverToday, formatCalendarDate, isCalendarDate, listUrl } from "@/lib/estimateBuilder";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "office" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock("@/components/CustomerSearchInput", () => ({ default: () => null }));

const T0 = "2025-04-01T10:00:00.000Z";
const LATER = "2025-04-02T10:00:00.000Z";
const zeroU = { plants: 0, landscape_materials: 0, irrigation_materials: 0, landscape_labor: 0, irrigation_labor: 0, fees_surcharges: 0 };
const life = {
  createdFromVersionId: null, sentAt: null, sentById: null, sentMethod: null, acceptedAt: null, acceptedOn: null, acceptedById: null,
  acceptanceMethod: null, poNumber: null, declinedAt: null, declinedById: null, declineReason: null, supersededAt: null,
  frozenSubtotalCents: null, frozenCostKnownCents: null, frozenCostUnknownLines: null,
};
type V = { id: string; n: number; status: string; o?: Record<string, unknown> };
function line(id: string, o: Record<string, unknown> = {}) {
  return { id, companyId: "c1", versionId: "x", sectionId: "s1", lineType: "custom", priceSource: "manual", plantCatalogItemId: null, hardscapeCatalogItemId: null,
    irrigationCatalogItemId: null, quickItemId: null, rateKey: null, termId: null, name: `Line ${id}`, detail: null, unit: "ea", quantity: "1", unitPriceCents: 1000,
    unitCostCents: null, extendedCents: 1000, umbrellaKey: "landscape_materials", includeInPalette: false, paletteTypeLabel: null, sortOrder: 0, needsPrice: false,
    createdAt: T0, updatedAt: T0, ...o };
}
function detailOf(versions: V[], viewId?: string, o: Record<string, unknown> = {}) {
  const cur = versions[versions.length - 1];
  const view = versions.find((v) => v.id === (viewId ?? cur.id))!;
  return {
    id: "e1", companyId: "c1", customerId: "cu1", ticketId: null, estimateNumber: "E-2025-0042", title: "Spring install", currentVersionId: cur.id,
    voidedAt: null, voidReason: null, createdById: null, createdAt: T0, updatedAt: T0, ...o,
    versions: versions.map((v) => ({ id: v.id, versionNumber: v.n, status: v.status, createdAt: T0, updatedAt: T0, ...life, ...v.o })),
    version: { id: view.id, versionNumber: view.n, status: view.status, companyId: "c1", estimateId: "e1", createdById: null, createdAt: T0, updatedAt: (o.updatedAt as string) ?? T0,
      ...life, ...view.o,
      sections: [{ id: "s1", companyId: "c1", versionId: view.id, name: "Front", sortOrder: 0, createdAt: T0, updatedAt: T0,
        lines: [line("la"), line("lb", { needsPrice: true, unitPriceCents: 0, extendedCents: 0 }), line("lc", { needsPrice: true })] }],
      totals: { subtotalCents: 2000, costKnownCents: 0, costUnknownLines: 3, materialMarginPct: null, byUmbrella: zeroU, bySection: { s1: 2000 } } },
  };
}

const fetchMock = vi.fn();
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });
let detail: unknown;
let handler: (c: Call) => unknown | undefined;
const calls = (): Call[] => fetchMock.mock.calls.map(([url, init]: [string, RequestInit | undefined]) => ({
  url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined }));
const mutations = () => calls().filter((c) => c.method !== "GET");

beforeEach(() => {
  auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "office" };
  detail = detailOf([{ id: "v1", n: 1, status: "draft" }]);
  handler = () => undefined;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    const r = handler(c);
    if (r !== undefined) return r;
    if (c.url.startsWith("/api/estimates/rates")) return res({ items: [] });
    if (c.url.startsWith("/api/customers/")) return res({ name: "Ridge HOA" });
    if (c.url.startsWith("/api/estimates/e1")) return res(detail);
    if (c.url.startsWith("/api/estimates")) return res([]);
    return res({});
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

describe("lib helpers", () => {
  it("parses structured conflicts, Denver today, calendar dates and list urls", () => {
    expect(conflictOf(new Error('409: {"error":"DRAFT_EXISTS","versionId":"v3"}'))).toMatchObject({ status: 409, error: "DRAFT_EXISTS", versionId: "v3" });
    expect(conflictOf(new Error('409: {"error":"LINES_NEED_PRICE","lineIds":["a",1]}'))?.lineIds).toEqual(["a"]);
    expect(conflictOf(new Error("500: nope"))).toBeNull();
    expect(denverToday(new Date("2025-07-01T05:30:00.000Z"))).toBe("2025-06-30");
    expect(isCalendarDate("2025-02-30")).toBe(false);
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("0001-01-01")).toBe(true);
    expect(isCalendarDate("0000-01-01")).toBe(false);
    expect(formatCalendarDate("2025-04-01", "en")).toBe("Apr 1, 2025");
    expect(listUrl("", false, "void")).toBe("/api/estimates?status=void");
    expect(listUrl("x", true, "open")).toBe("/api/estimates?search=x&includeVoid=true&status=open");
  });
});

describe("header actions per state", () => {
  it("draft v1: Mark as Sent, no discard (v1 voids instead), overflow void", async () => {
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-mark-sent")).toBeTruthy();
    expect(screen.queryByTestId("button-discard-draft")).toBeNull();
    expect(screen.queryByTestId("button-record-accept")).toBeNull();
    expect(screen.getByTestId("button-overflow")).toBeTruthy();
    expect(screen.getByTestId("text-next-step").textContent).toContain("mark as sent");
  });
  it("sent: accept/decline/edit, amber immutable banner, no edit inputs", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent", o: { sentAt: T0, sentMethod: "email" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-record-accept")).toBeTruthy();
    expect(screen.getByTestId("button-record-decline")).toBeTruthy();
    expect(screen.getByTestId("button-revise").textContent).toBe("Edit (creates v2)");
    expect(screen.getByTestId("banner-read-only").textContent).toContain("Sent versions are locked");
    expect(screen.queryByTestId("button-mark-sent")).toBeNull();
    expect(screen.queryByTestId("input-estimate-title")).toBeNull();
  });
  it("accepted: change order + Locked, green banner with Colorado date, method and PO", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "accepted", o: { acceptedOn: "2025-03-31", acceptedAt: "2025-04-01T03:00:00.000Z", acceptanceMethod: "signed_pdf", poNumber: "PO-77" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-revise").textContent).toBe("Start change order (v2)");
    expect(screen.getByTestId("indicator-locked").textContent).toBe("Locked");
    const b = screen.getByTestId("text-accepted-meta").textContent!;
    expect(b).toContain("Mar 31, 2025"); expect(b).toContain("Signed PDF"); expect(b).toContain("PO PO-77"); expect(b).toContain("Prices frozen");
  });
  it("declined: Revise and reason", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "declined", o: { declineReason: "Timing" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-revise").textContent).toBe("Revise (v2)");
    expect(screen.getByTestId("text-decline-reason").textContent).toContain("Timing");
  });
  it("change-order draft keeps accepted history visible and offers discard", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "accepted" }, { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1" } }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("banner-contract").textContent).toContain("v1 is still the accepted contract");
    expect(screen.getByTestId("chip-version-2").textContent).toContain("(change order)");
    expect(screen.getByTestId("chip-version-1").textContent).toContain("Accepted");
    expect(screen.getByTestId("button-discard-draft")).toBeTruthy();
  });
  it("void estimate shows reason and no actions", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "void" }], undefined, { voidedAt: T0, voidReason: "Duplicate" });
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("text-void-reason").textContent).toContain("Duplicate");
    expect(screen.queryByTestId("button-overflow")).toBeNull();
    expect(screen.queryByTestId("button-mark-sent")).toBeNull();
  });
  it("superseded versions retain their sent/accepted labels and frozen acceptance details", async () => {
    const vs: V[] = [
      { id: "v1", n: 1, status: "superseded", o: { sentAt: T0, sentMethod: "email", acceptedAt: T0, acceptedOn: "2025-03-29", acceptanceMethod: "phone", poNumber: "OLD-PO" } },
      { id: "v2", n: 2, status: "accepted", o: { acceptedAt: LATER, acceptedOn: "2025-04-02" } },
    ];
    handler = c => c.url === "/api/estimates/e1?version=1" ? res(detailOf(vs, "v1")) : undefined;
    renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    expect(screen.getByTestId("chip-version-1").textContent).toContain("Accepted · Superseded");
    expect(screen.getByTestId("banner-read-only").textContent).toContain("OLD-PO");
    expect(screen.getByTestId("banner-read-only").textContent).toContain("Prices frozen");
    expect(screen.queryByTestId("button-revise")).toBeNull();
  });
  it.each(["sent", "accepted", "declined", "superseded", "void"])("historical %s view: back to current and no mutation path", async (status) => {
    const vs: V[] = [{ id: "v1", n: 1, status }, { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1" } }];
    detail = detailOf(vs);
    handler = (c) => c.url === "/api/estimates/e1?version=1" ? res(detailOf(vs, "v1")) : undefined;
    const { loc } = renderAt("/dashboard/estimates/builder/e1?version=1");
    await ready();
    expect(screen.getByTestId("bar-not-current").textContent).toContain("Viewing version 1");
    expect(screen.queryByTestId("button-overflow")).toBeNull();
    expect(screen.queryByTestId("button-revise")).toBeNull();
    expect(screen.queryByTestId("button-record-accept")).toBeNull();
    expect(screen.queryByTestId("button-record-decline")).toBeNull();
    expect(screen.queryByTestId("button-discard-draft")).toBeNull();
    expect(screen.queryByTestId("button-mark-sent")).toBeNull();
    fireEvent.click(screen.getByTestId("button-view-current"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e1"));
  });
});

describe("dialogs", () => {
  it("send: method, LINES_NEED_PRICE lists server ids only, Send anyway confirms and installs response", async () => {
    let n = 0;
    handler = (c) => {
      if (c.method !== "POST") return undefined;
      n++;
      return n === 1 ? res({ error: "LINES_NEED_PRICE", lineIds: ["lb", "ghost"] }, 409)
        : res(detailOf([{ id: "v1", n: 1, status: "sent", o: { sentAt: T0, sentMethod: "portal" } }], undefined, { updatedAt: LATER }));
    };
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    await screen.findByTestId("dialog-send");
    fireEvent.click(screen.getByTestId("radio-send-method-portal"));
    fireEvent.click(screen.getByTestId("button-submit-send"));
    await screen.findByTestId("panel-need-price");
    expect(screen.getByTestId("need-price-lb").textContent).toBe("Line lb");
    expect(screen.getByTestId("need-price-ghost").textContent).toBe("Line ghost");
    expect(screen.queryByTestId("need-price-lc")).toBeNull();
    fireEvent.click(screen.getByTestId("button-send-anyway"));
    await waitFor(() => expect(screen.queryByTestId("dialog-send")).toBeNull());
    expect(mutations().map((m) => m.body)).toEqual([{ method: "portal" }, { method: "portal", confirmZeroPriced: true }]);
    expect(mutations()[0]).toMatchObject({ url: "/api/estimates/e1/versions/v1/send", headers: { "X-Company-Id": "c1" } });
    await screen.findByTestId("button-record-accept");
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Marked as sent" }));
  });
  it("send prevents duplicate submissions", async () => {
    let release!: () => void;
    handler = (c) => c.method === "POST" ? new Promise((r) => { release = () => r(res(detailOf([{ id: "v1", n: 1, status: "sent" }], undefined, { updatedAt: LATER }))); }) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    const btn = await screen.findByTestId("button-submit-send");
    fireEvent.click(btn); fireEvent.click(btn);
    fireEvent.submit(btn.closest("form")!);
    await waitFor(() => expect(mutations()).toHaveLength(1));
    await act(async () => { release(); });
    await screen.findByTestId("button-record-accept");
    expect(mutations()).toHaveLength(1);
  });
  it("accept: method, PO, exact Denver default date, then exact edited date", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    handler = (c) => c.method === "POST" ? res(detailOf([{ id: "v1", n: 1, status: "accepted" }], undefined, { updatedAt: LATER })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-record-accept"));
    const dlg = await screen.findByTestId("dialog-accept");
    expect(dlg.textContent).toContain("Locks this version and freezes its prices.");
    const date = screen.getByTestId("input-accept-date") as HTMLInputElement;
    expect(date.type).toBe("date");
    expect(date.value).toBe(denverToday());
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-submit-accept"));
    expect(screen.getByTestId("error-accept-date")).toBeTruthy();
    expect(mutations()).toHaveLength(0);
    fireEvent.change(date, { target: { value: "2025-03-31" } });
    fireEvent.click(screen.getByTestId("radio-accept-method-phone"));
    fireEvent.change(screen.getByTestId("input-accept-po"), { target: { value: "  PO-9 " } });
    fireEvent.click(screen.getByTestId("button-submit-accept"));
    await waitFor(() => expect(mutations()[0]).toMatchObject({ url: "/api/estimates/e1/versions/v1/accept", body: { method: "phone", poNumber: "PO-9", acceptedOn: "2025-03-31" } }));
    await screen.findByTestId("indicator-locked");
  });
  it("decline: reason required, quick chips fill it", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    handler = (c) => c.method === "POST" ? res(detailOf([{ id: "v1", n: 1, status: "declined", o: { declineReason: "Went with competitor" } }], undefined, { updatedAt: LATER })) : undefined;
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-record-decline"));
    await screen.findByTestId("dialog-decline");
    fireEvent.click(screen.getByTestId("button-submit-decline"));
    expect(screen.getByTestId("error-decline-reason")).toBeTruthy();
    fireEvent.click(screen.getByTestId("chip-decline-competitor"));
    fireEvent.click(screen.getByTestId("button-submit-decline"));
    await waitFor(() => expect(mutations()[0]?.body).toEqual({ reason: "Went with competitor" }));
    await screen.findByTestId("text-decline-reason");
  });
  it("discard draft and void (reason required, HAS_ACCEPTED_VERSION translated)", async () => {
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }, { id: "v2", n: 2, status: "draft", o: { createdFromVersionId: "v1" } }]);
    handler = (c) => {
      if (c.method === "DELETE") return res(detailOf([{ id: "v1", n: 1, status: "sent" }], undefined, { updatedAt: LATER }));
      if (c.url.endsWith("/void")) return res({ error: "HAS_ACCEPTED_VERSION" }, 409);
      return undefined;
    };
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-discard-draft"));
    fireEvent.click(await screen.findByTestId("button-submit-discard"));
    await waitFor(() => expect(mutations()[0]).toMatchObject({ method: "DELETE", url: "/api/estimates/e1/versions/v2" }));
    await screen.findByTestId("button-record-accept");
    fireEvent.keyDown(screen.getByTestId("button-overflow"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("menu-void"));
    await screen.findByTestId("dialog-void");
    fireEvent.click(screen.getByTestId("button-submit-void"));
    expect(screen.getByTestId("error-void-reason")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-void-reason"), { target: { value: " Duplicate " } });
    fireEvent.click(screen.getByTestId("button-submit-void"));
    expect((await screen.findByTestId("error-lifecycle")).textContent).toContain("cannot be voided");
    expect(mutations()[1]).toMatchObject({ url: "/api/estimates/e1/void", body: { reason: "Duplicate" } });
  });
  it("revise DRAFT_EXISTS navigates to the existing draft instead of creating one", async () => {
    const vs: V[] = [{ id: "v1", n: 1, status: "sent" }, { id: "v2", n: 2, status: "sent" }];
    detail = detailOf(vs);
    handler = (c) => c.method === "POST" ? res({ error: "DRAFT_EXISTS", versionId: "v3" }, 409) : undefined;
    const { loc } = renderAt("/dashboard/estimates/builder/e1?version=2");
    await ready();
    fireEvent.click(screen.getByTestId("button-revise"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/e1"));
    expect(mutations()).toHaveLength(1);
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "A draft already exists. Opening it." }));
  });
});

describe("stale scope and version", () => {
  it("drops a lifecycle response after a version switch and releases busy state", async () => {
    const vs: V[] = [{ id: "v1", n: 1, status: "superseded" }, { id: "v2", n: 2, status: "draft" }];
    detail = detailOf(vs);
    let release!: () => void;
    handler = (c) => {
      if (c.method === "POST") return new Promise((r) => { release = () => r(res(detailOf([...vs.slice(0, 1), { id: "v2", n: 2, status: "sent" }], undefined, { updatedAt: LATER }))); });
      if (c.url === "/api/estimates/e1?version=1") return res(detailOf(vs, "v1"));
      return undefined;
    };
    const { loc } = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    fireEvent.click(await screen.findByTestId("button-submit-send"));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    act(() => loc.navigate("/dashboard/estimates/builder/e1?version=1"));
    await screen.findByTestId("bar-not-current");
    expect(screen.queryByTestId("dialog-send")).toBeNull();
    await act(async () => { release(); });
    expect(screen.getByTestId("bar-not-current")).toBeTruthy();
    expect(toastSpy).not.toHaveBeenCalled();
    act(() => loc.navigate("/dashboard/estimates/builder/e1"));
    expect(await screen.findByTestId("button-mark-sent").catch(() => screen.findByTestId("button-record-accept"))).toBeTruthy();
    expect((screen.queryByTestId("button-mark-sent") ?? screen.getByTestId("button-record-accept")).hasAttribute("disabled")).toBe(false);
  });
  it("tenant switch drops an in-flight lifecycle result", async () => {
    let release!: () => void;
    handler = (c) => c.method === "POST" ? new Promise((r) => { release = () => r(res(detailOf([{ id: "v1", n: 1, status: "sent" }], undefined, { updatedAt: LATER }))); }) : undefined;
    const { rerenderPage } = renderAt("/dashboard/estimates/builder/e1");
    await ready();
    fireEvent.click(screen.getByTestId("button-mark-sent"));
    fireEvent.click(await screen.findByTestId("button-submit-send"));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "office" };
    rerenderPage();
    await act(async () => { release(); });
    await ready();
    expect(screen.getByTestId("button-mark-sent")).toBeTruthy();
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe("list filters and Spanish", () => {
  it("status filter intersects Show void; explicit void forces void inclusion", async () => {
    renderAt("/dashboard/estimates/builder");
    await screen.findByTestId("estimates-empty");
    fireEvent.click(screen.getByTestId("filter-status-open"));
    await waitFor(() => expect(calls().some((c) => c.url === "/api/estimates?status=open")).toBe(true));
    fireEvent.click(screen.getByTestId("switch-show-void"));
    await waitFor(() => expect(calls().some((c) => c.url === "/api/estimates?includeVoid=true&status=open")).toBe(true));
    fireEvent.click(screen.getByTestId("filter-status-void"));
    await waitFor(() => expect(calls().some((c) => c.url.endsWith("status=void"))).toBe(true));
    expect((screen.getByTestId("switch-show-void") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-clear-search"));
    await waitFor(() => expect(screen.getByTestId("filter-status-all").getAttribute("aria-checked")).toBe("true"));
  });
  it("renders lifecycle copy in Spanish", async () => {
    await i18n.changeLanguage("es");
    detail = detailOf([{ id: "v1", n: 1, status: "sent" }]);
    renderAt("/dashboard/estimates/builder/e1");
    await ready();
    expect(screen.getByTestId("button-record-accept").textContent).toBe("Registrar aceptación");
    expect(screen.getByTestId("button-revise").textContent).toBe("Editar (crea v2)");
    expect(screen.getByTestId("banner-read-only").textContent).toContain("Las versiones enviadas están bloqueadas");
    fireEvent.click(screen.getByTestId("button-record-accept"));
    expect((await screen.findByTestId("dialog-accept")).textContent).toContain("Bloquea esta versión y congela sus precios.");
  });
  it("en and es lifecycle key sets match", async () => {
    const keys = (o: unknown, p = ""): string[] => typeof o === "object" && o ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
    const en = i18n.getResourceBundle("en", "translation").estimateBuilder;
    const es = i18n.getResourceBundle("es", "translation").estimateBuilder;
    expect(keys(es.life).sort()).toEqual(keys(en.life).sort());
    expect(keys(es.filter).sort()).toEqual(keys(en.filter).sort());
  });
});
