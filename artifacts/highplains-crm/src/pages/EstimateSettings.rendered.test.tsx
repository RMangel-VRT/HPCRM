// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ReactElement } from "react";
import "@/i18n";
import i18n from "@/i18n";
import EquipmentFeesCatalog from "./EquipmentFeesCatalog";
import QuickBooksSetup from "./QuickBooksSetup";
import LaborRatesPreview from "./LaborRatesPreview";
import { estimatesRailSections, isEstimatesHubPage } from "@/components/nav/estimatesRail";
import { defaultQboType, defaultUmbrellaForKind, isCacheStale, moneyOrText, parseConflict } from "@/lib/estimateSettings";

const auth = vi.hoisted(() => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "admin" } as Record<string, string> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock("@/components/CustomerSearchInput", () => ({
  default: (p: { onSelect: (c: { id: string; name: string }) => void }) => (
    <button type="button" data-testid="pick-customer" onClick={() => p.onSelect({ id: "cust1", name: "Prairie Ridge HOA" })}>pick</button>
  ),
}));

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const fetchMock = vi.fn();
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });
let handler: (c: Call) => ReturnType<typeof res> = () => res({});
const calls = (): Call[] => fetchMock.mock.calls.map(([u, init]: [string, RequestInit | undefined]) => ({
  url: String(u), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined,
}));

beforeEach(() => {
  auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "admin" };
  fetchMock.mockImplementation(async (u: string, init?: RequestInit) => handler({
    url: String(u), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});
afterEach(async () => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); await i18n.changeLanguage("en"); });

function renderAt(path: string, el: () => ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path });
  const ui = () => <QueryClientProvider client={client}><Router hook={loc.hook}>{el()}</Router></QueryClientProvider>;
  const r = render(ui());
  return { ...r, rerenderPage: () => r.rerender(ui()) };
}

describe("helpers + rail", () => {
  it("defaults and money", () => {
    expect(defaultUmbrellaForKind("equipment")).toBe("landscape_labor");
    expect(defaultUmbrellaForKind("fee")).toBe("fees_surcharges");
    expect(defaultQboType("irrigation_labor")).toBe("Service");
    expect(defaultQboType("plants")).toBe("NonInventory");
    expect(moneyOrText(8550, null, "en")).toBe("$85.50");
    expect(moneyOrText(null, "Per quote", "en")).toBe("Per quote");
    expect(moneyOrText(null, " ", "en")).toBeNull();
    expect(isCacheStale(null)).toBe(true);
    expect(parseConflict(new Error('409: {"message":"dup","canLink":true,"candidate":{"qboId":"9","name":"Plants","type":"Service","active":true}}'))?.candidate?.qboId).toBe("9");
  });
  it("rail exposes new pages under Catalogs and Settings", () => {
    const s = estimatesRailSections((k) => k);
    expect(s[1].items.map((i) => i.href)).toContain("/dashboard/estimates/catalogs/equipment-fees");
    expect(s[2].items.map((i) => i.href)).toEqual(["/dashboard/estimates/settings/rates", "/dashboard/estimates/settings/quickbooks"]);
    expect(isEstimatesHubPage("/dashboard/estimates/settings/quickbooks")).toBe(true);
  });
});

const qi = (o: Record<string, unknown>) => ({ id: "q1", companyId: "c1", kind: "equipment", label: "Skid Steer", defaultUnit: "hour", defaultRateCents: 8550, umbrellaKey: "landscape_labor", isActive: true, sortOrder: 0, ...o });

describe("Equipment & Fees", () => {
  it("renders rows with optional rate and company header", async () => {
    handler = () => res([qi({}), qi({ id: "q2", kind: "fee", label: "Disposal Fee", defaultUnit: "flat", defaultRateCents: null, umbrellaKey: "fees_surcharges" })]);
    renderAt("/dashboard/estimates/catalogs/equipment-fees", () => <EquipmentFeesCatalog />);
    expect((await screen.findByTestId("text-label-q1")).textContent).toContain("Skid Steer");
    expect(screen.getByTestId("text-rate-q1").textContent).toContain("$85.50");
    expect(screen.getByTestId("text-rate-q2").textContent).toContain("—");
    expect(screen.getByTestId("text-umbrella-q2").textContent).toContain("Fees & Surcharges");
    expect(calls()[0].headers["X-Company-Id"]).toBe("c1");
  });
  it("empty and error with retry", async () => {
    handler = () => res([]);
    renderAt("/x", () => <EquipmentFeesCatalog />);
    expect(await screen.findByTestId("quick-items-empty")).toBeTruthy();
    cleanup();
    handler = () => res({ message: "boom" }, 500);
    renderAt("/x", () => <EquipmentFeesCatalog />);
    expect(await screen.findByTestId("quick-items-error")).toBeTruthy();
    handler = () => res([qi({})]);
    fireEvent.click(screen.getByTestId("button-retry"));
    expect(await screen.findByTestId("text-label-q1")).toBeTruthy();
  });
  it("create validates, defaults umbrella by kind, posts null rate", async () => {
    handler = (c) => c.method === "POST" ? res(qi({ id: "q9" })) : res([]);
    renderAt("/x", () => <EquipmentFeesCatalog />);
    fireEvent.click(await screen.findByTestId("button-add-item"));
    fireEvent.change(screen.getByTestId("input-rate"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    expect(screen.getByTestId("error-label")).toBeTruthy();
    expect(screen.getByTestId("error-rate")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-label"), { target: { value: "Disposal Fee" } });
    fireEvent.change(screen.getByTestId("input-rate"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("radio-kind-fee"));
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().some((c) => c.method === "POST")).toBe(true));
    const post = calls().find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ kind: "fee", label: "Disposal Fee", defaultRateCents: null, umbrellaKey: "fees_surcharges" });
    expect(post.headers["X-Company-Id"]).toBe("c1");
  });
  it("edit sends only changed fields; deactivate soft-deletes", async () => {
    handler = (c) => c.method === "GET" ? res([qi({})]) : res({ ok: true });
    renderAt("/x", () => <EquipmentFeesCatalog />);
    fireEvent.click(await screen.findByTestId("button-edit-q1"));
    fireEvent.change(screen.getByTestId("input-rate"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-save-item"));
    await waitFor(() => expect(calls().find((c) => c.method === "PATCH")?.body).toEqual({ defaultRateCents: null }));
    fireEvent.click(await screen.findByTestId("button-deactivate-q1"));
    fireEvent.click(await screen.findByTestId("button-confirm-deactivate"));
    await waitFor(() => expect(calls().some((c) => c.method === "DELETE" && c.url === "/api/quick-items/q1")).toBe(true));
  });
  it("remounts dialog on company switch", async () => {
    handler = () => res([qi({})]);
    const r = renderAt("/x", () => <EquipmentFeesCatalog />);
    fireEvent.click(await screen.findByTestId("button-edit-q1"));
    expect(screen.getByTestId("dialog-quick-item")).toBeTruthy();
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "admin" };
    r.rerenderPage();
    await waitFor(() => expect(screen.queryByTestId("dialog-quick-item")).toBeNull());
    await waitFor(() => expect(calls().some((c) => c.headers["X-Company-Id"] === "c2")).toBe(true));
  });
});

const umb = (key: string, o: Record<string, unknown> = {}) => ({ id: key, key, label: key, description: `posts ${key}`, qboItemId: null, qboItemName: null, qboItemType: null, qboSyncedAt: null, sortOrder: 0, bindingStatus: "unlinked", ...o });

describe("QuickBooks Setup", () => {
  const umbrellas = (write: boolean) => ({ items: [umb("plants"), umb("landscape_labor", { qboItemId: "7", qboItemName: "Labor", qboItemType: "Service", bindingStatus: "inactive", sortOrder: 3 })], qboWriteEnabled: write });
  it("renders rows, write-gated create with admin settings link, teaser disabled", async () => {
    handler = () => res(umbrellas(false));
    renderAt("/x", () => <QuickBooksSetup />);
    expect((await screen.findByTestId("row-umbrella-plants")).textContent).toContain("Not in QuickBooks yet");
    expect(screen.getByTestId("status-umbrella-landscape_labor").textContent).toContain("inactive in QuickBooks");
    expect(screen.getByTestId("button-create-plants")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("link-qbo-settings")).toBeTruthy();
    expect(screen.getByTestId("button-cleanup")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("text-umbrella-desc-plants").textContent).toBe("Trees, shrubs, perennials and other plant material.");
    expect(screen.queryByText("posts plants")).toBeNull();
  });
  it("office gets guidance not settings link", async () => {
    auth.user = { id: "u2", activeCompanyId: "c1", activeRole: "office" };
    handler = () => res(umbrellas(false));
    renderAt("/x", () => <QuickBooksSetup />);
    expect((await screen.findByTestId("banner-write-disabled")).textContent).toContain("Ask an admin");
    expect(screen.queryByTestId("link-qbo-settings")).toBeNull();
    cleanup();
    await i18n.changeLanguage("es");
    renderAt("/x", () => <QuickBooksSetup />);
    expect((await screen.findByTestId("text-umbrella-desc-plants")).textContent).toContain("Árboles");
  });
  it("create 409 offers link instead, pulling first when not cached", async () => {
    handler = (c) => {
      if (c.url.includes("income-accounts")) return res([{ id: "a1", name: "Landscaping Income" }]);
      if (c.url.endsWith("/create-in-qbo")) return res({ message: "Duplicate name", canLink: true, candidate: { qboId: "55", name: "Plants", type: "NonInventory", active: true } }, 409);
      if (c.url.startsWith("/api/qbo/items/cache")) return res({ items: [], lastPulledAt: null });
      if (c.url.endsWith("/pull") || c.url.endsWith("/link")) return res({ ok: true });
      return res(umbrellas(true));
    };
    renderAt("/x", () => <QuickBooksSetup />);
    fireEvent.click(await screen.findByTestId("button-create-plants"));
    fireEvent.click(screen.getByTestId("button-confirm-create"));
    expect(await screen.findByTestId("error-income-account")).toBeTruthy();
    expect(calls().some((c) => c.url.endsWith("/create-in-qbo"))).toBe(false);
    // Pick income account through the Radix select.
    const trigger = await screen.findByTestId("select-income-account");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Landscaping Income" }));
    fireEvent.click(screen.getByTestId("button-confirm-create"));
    expect((await screen.findByTestId("panel-duplicate")).textContent).toContain("Duplicate name");
    const create = calls().find((c) => c.url.endsWith("/create-in-qbo"))!;
    expect(create.body).toEqual({ key: "plants", name: "plants", type: "NonInventory", incomeAccountId: "a1" });
    fireEvent.click(screen.getByTestId("button-link-instead"));
    await waitFor(() => expect(calls().some((c) => c.url.endsWith("/umbrellas/link"))).toBe(true));
    const order = calls().map((c) => c.url);
    expect(order.indexOf("/api/qbo/items/pull")).toBeLessThan(order.indexOf("/api/qbo/umbrellas/link"));
    expect(calls().find((c) => c.url.endsWith("/umbrellas/link"))!.body).toEqual({ key: "plants", qboItemId: "55" });
    expect(calls().every((c) => c.headers["X-Company-Id"] === "c1")).toBe(true);
  });
  it("link picker: empty cache shows pull, then links picked item", async () => {
    let cached = false;
    handler = (c) => {
      if (c.url.startsWith("/api/qbo/items/cache")) return res(cached ? { items: [{ qboId: "3", name: "Plants", type: "NonInventory", incomeAccountName: "Sales", active: true, fetchedAt: "" }], lastPulledAt: new Date().toISOString() } : { items: [], lastPulledAt: null });
      if (c.url.endsWith("/pull")) { cached = true; return res({ inserted: 1, missingUmbrellas: [], inactiveUmbrellas: [] }); }
      if (c.url.endsWith("/link")) return res({ ok: true });
      return res(umbrellas(true));
    };
    renderAt("/x", () => <QuickBooksSetup />);
    fireEvent.click(await screen.findByTestId("button-link-plants"));
    expect(await screen.findByTestId("text-cache-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-pull-items"));
    fireEvent.click(await screen.findByTestId("option-item-3"));
    fireEvent.click(screen.getByTestId("button-confirm-link"));
    await waitFor(() => expect(calls().find((c) => c.url.endsWith("/umbrellas/link"))?.body).toEqual({ key: "plants", qboItemId: "3" }));
  });
  it("error state with retry", async () => {
    handler = () => res({}, 500);
    renderAt("/x", () => <QuickBooksSetup />);
    expect(await screen.findByTestId("umbrellas-error")).toBeTruthy();
  });
});

describe("Labor & Rates", () => {
  it("prompts for customer, then shows source badges and dashes", async () => {
    handler = () => res({ items: [
      { rateKey: "crew_hr", label: "Crew hour", unit: "hr", priceText: null, cardRateCents: 6500, cardPriceText: null, contractRateCents: 5900, contractPriceText: null, rateCents: 5900, source: "contract", termId: "t1" },
      { rateKey: "skid", label: "Skid steer", unit: "hr", priceText: null, cardRateCents: 9500, cardPriceText: null, contractRateCents: null, contractPriceText: null, rateCents: 9500, source: "rate_card" },
      { rateKey: "haul", label: "Hauling", unit: "load", priceText: "Per quote", cardRateCents: null, cardPriceText: "Per quote", contractRateCents: null, contractPriceText: null, rateCents: null, source: "unset" },
    ] });
    renderAt("/x", () => <LaborRatesPreview />);
    expect(screen.getByTestId("rates-pick-customer")).toBeTruthy();
    expect(screen.getByTestId("link-rate-card")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pick-customer"));
    expect((await screen.findByTestId("badge-source-crew_hr")).textContent).toContain("Contract");
    expect(screen.getByTestId("text-uses-crew_hr").textContent).toContain("$59.00");
    expect(screen.getByTestId("text-contract-skid").textContent).toContain("—");
    expect(screen.getByTestId("text-card-haul").textContent).toContain("Per quote");
    expect(screen.getByTestId("badge-source-haul").textContent).toContain("Price manually");
    expect(calls()[0].url).toBe("/api/estimates/rates/preview?customerId=cust1");
    expect(calls()[0].headers["X-Company-Id"]).toBe("c1");
  });
  it("office sees guidance; spanish renders", async () => {
    auth.user = { id: "u2", activeCompanyId: "c1", activeRole: "office" };
    await i18n.changeLanguage("es");
    renderAt("/x", () => <LaborRatesPreview />);
    expect(screen.getByTestId("text-rate-card-guidance")).toBeTruthy();
    expect(screen.queryByTestId("link-rate-card")).toBeNull();
    expect(screen.getByTestId("text-page-title").textContent).toContain("Mano de obra y tarifas");
    expect(within(screen.getByTestId("page-labor-rates")).getByTestId("rates-pick-customer")).toBeTruthy();
  });
});

describe("scope switching resets transient state", () => {
  it("QuickBooks: user and role switches close open dialogs and refetch with new scope", async () => {
    handler = (c) => c.url.startsWith("/api/qbo/items/cache") ? res({ items: [], lastPulledAt: null })
      : res({ items: [umb("plants")], qboWriteEnabled: true });
    const r = renderAt("/x", () => <QuickBooksSetup />);
    fireEvent.click(await screen.findByTestId("button-link-plants"));
    expect(await screen.findByTestId("dialog-link-item")).toBeTruthy();
    auth.user = { id: "u9", activeCompanyId: "c1", activeRole: "admin" };
    r.rerenderPage();
    await waitFor(() => expect(screen.queryByTestId("dialog-link-item")).toBeNull());
    fireEvent.click(await screen.findByTestId("button-link-plants"));
    expect(await screen.findByTestId("dialog-link-item")).toBeTruthy();
    auth.user = { id: "u9", activeCompanyId: "c1", activeRole: "office" };
    r.rerenderPage();
    await waitFor(() => expect(screen.queryByTestId("dialog-link-item")).toBeNull());
    const umbrellaGets = calls().filter((c) => c.url === "/api/qbo/umbrellas");
    expect(umbrellaGets.length).toBeGreaterThanOrEqual(3);
  });
  it("QuickBooks: company switch drops create dialog and uses new X-Company-Id", async () => {
    handler = (c) => c.url.includes("income-accounts") ? res([]) : res({ items: [umb("plants")], qboWriteEnabled: true });
    const r = renderAt("/x", () => <QuickBooksSetup />);
    fireEvent.click(await screen.findByTestId("button-create-plants"));
    expect(await screen.findByTestId("dialog-create-item")).toBeTruthy();
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "admin" };
    r.rerenderPage();
    await waitFor(() => expect(screen.queryByTestId("dialog-create-item")).toBeNull());
    await waitFor(() => expect(calls().some((c) => c.url === "/api/qbo/umbrellas" && c.headers["X-Company-Id"] === "c2")).toBe(true));
  });
  it("Labor & Rates: company switch clears selected customer; role switch swaps link for guidance", async () => {
    handler = () => res({ items: [] });
    const r = renderAt("/x", () => <LaborRatesPreview />);
    fireEvent.click(screen.getByTestId("pick-customer"));
    expect(await screen.findByTestId("rates-empty")).toBeTruthy();
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "admin" };
    r.rerenderPage();
    expect(await screen.findByTestId("rates-pick-customer")).toBeTruthy();
    auth.user = { id: "u1", activeCompanyId: "c2", activeRole: "office" };
    r.rerenderPage();
    expect(screen.queryByTestId("link-rate-card")).toBeNull();
    expect(screen.getByTestId("text-rate-card-guidance")).toBeTruthy();
  });
  it("Equipment & Fees: role switch clears kind filter and confirm dialog", async () => {
    handler = () => res([qi({})]);
    const r = renderAt("/x", () => <EquipmentFeesCatalog />);
    fireEvent.click(await screen.findByTestId("chip-kind-fee"));
    fireEvent.click(await screen.findByTestId("chip-kind-all"));
    fireEvent.click(screen.getByTestId("chip-kind-fee"));
    auth.user = { id: "u1", activeCompanyId: "c1", activeRole: "office" };
    r.rerenderPage();
    await waitFor(() => expect(screen.getByTestId("chip-kind-all").getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(await screen.findByTestId("button-deactivate-q1"));
    expect(await screen.findByTestId("dialog-confirm-deactivate")).toBeTruthy();
    auth.user = { id: "u1", activeCompanyId: "c3", activeRole: "office" };
    r.rerenderPage();
    await waitFor(() => expect(screen.queryByTestId("dialog-confirm-deactivate")).toBeNull());
  });
});
