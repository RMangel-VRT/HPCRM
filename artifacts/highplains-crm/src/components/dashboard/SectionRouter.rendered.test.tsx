// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { navigationIcon } from "@/components/nav/navConfig";
import { createInstance } from "i18next";
import en from "@/i18n/locales/en";
import es from "@/i18n/locales/es";
import { messageParams } from "@/lib/estimateActionList";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const fx = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, translate: null as null | ((k: string, o?: Record<string, unknown>) => string), language: "en" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: fx.language }, t: (k: string, o?: Record<string, unknown>) =>
    fx.translate ? fx.translate(k, o) : (o && "count" in o ? `${o.count} overdue` : k) }),
}));
import SectionRouter, { SECTION_ORDER, sectionsQueryKey, permittedSectionKeys, type SectionSummary } from "./SectionRouter";

const sec = (key: SectionSummary["key"], total: number, overdue: number, oldest: SectionSummary["oldest"] = null): SectionSummary =>
  ({ key, href: `/dashboard/${key}`, total, overdue, oldest, flow: null });
const all = (o: number) => SECTION_ORDER.map((k, i) => sec(k, i + 3, o,
  { label: "Pavilion Villas spring aeration estimate with a very long name", detail: "11 days in stage", href: `/dashboard/${k}/1` }));
const fetchMock = vi.fn();
beforeEach(() => { fx.translate = null; fx.language = "en"; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const respond = (body: unknown, status = 200) => fetchMock.mockResolvedValue({ ok: status < 400, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) });
function mount(user: Record<string, unknown>, location = memoryLocation({ path: "/dashboard" })) {
  fx.user = { id: "u1", activeCompanyId: "c1", activeTags: [], ...user };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Router hook={location.hook}><SectionRouter /></Router></QueryClientProvider>);
}
const order = () => Array.from(document.querySelectorAll(".section-router__grid > *")).map(e => e.getAttribute("data-testid"));

describe("SectionRouter", () => {
  it.each([
    ["en", "Expired on Oct 20, 2026", "Follow-up 2 days overdue"],
    ["es", "Venció el 20 oct 2026", "Seguimiento con 2 días de atraso"],
  ])("renders Action Center reasons and unchanged Bids detail in %s", async (language, expired, overdue) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { en: { translation: en }, es: { translation: es } }, interpolation: { escapeValue: false } });
    fx.language = language;
    fx.translate = (key, options) => String(i18n.t(key, options));
    const reason = { key: "estimateActions.reason.expired", params: { date: "2026-10-20" } };
    const location = memoryLocation({ path: "/dashboard", record: true });
    respond({ sections: [
      sec("estimates", 2, 1, { label: "Customer", detail: "", reason, href: "/dashboard/tickets/ticket" }),
      sec("bids", 9, 3, { label: "RFP", detail: "Renamed stage · 21d", href: "/dashboard/tickets/rfp" }),
    ] });
    const view = mount({ activeRole: "admin" }, location);
    const detail = await screen.findByTestId("text-section-oldest-estimates");
    expect(detail.textContent).toContain(expired);
    expect(detail.textContent).toContain(String(i18n.t(reason.key, messageParams(reason, language))));
    expect(screen.getByTestId("text-section-oldest-bids").textContent).toContain("Renamed stage · 21d");
    expect(screen.getByTestId("tile-section-estimates").getAttribute("href")).toBe("/dashboard/estimates");
    fireEvent.click(screen.getByTestId("tile-section-estimates"));
    expect(location.history?.at(-1)).toBe("/dashboard/estimates");
    view.unmount();
    respond({ sections: [sec("estimates", 1, 1, { label: "Title", detail: "", href: "/dashboard/tickets/t",
      reason: { key: "estimateActions.reason.overdue", params: { count: 2 } } })] });
    mount({ activeRole: "admin" });
    expect((await screen.findByTestId("text-section-oldest-estimates")).textContent).toContain(overdue);
  });

  it("keeps the empty actionable tile linked to Estimates with no oldest reason", async () => {
    respond({ sections: [sec("estimates", 0, 0)] });
    mount({ activeRole: "admin" });
    expect((await screen.findByTestId("text-section-oldest-estimates")).textContent).toBe("sectionRouter.nothingWaiting");
    expect(screen.getByTestId("tile-section-estimates").getAttribute("href")).toBe("/dashboard/estimates");
  });
  it("matches separate super-admin navigation without widening section access", () => {
    expect([...permittedSectionKeys({ activeRole: "admin", isSuperAdminBool: true })]).toEqual(["invoicing", "mine"]);
  });
  it("renders eight live tiles in fixed order plus ninth reserved Campaigns cell for admin", async () => {
    respond({ sections: [...all(2)].reverse() });
    mount({ activeRole: "admin" });
    await screen.findByTestId("text-section-total-mine");
    expect(order()).toEqual([...SECTION_ORDER.map(k => `tile-section-${k}`), "tile-section-campaigns"]);
    expect(SECTION_ORDER.slice(0, 2)).toEqual(["estimates", "bids"]);
    expect(order()).toHaveLength(9);
    for (const k of SECTION_ORDER) {
      const tile = screen.getByTestId(`tile-section-${k}`);
      expect(tile.tagName).toBe("A");
      expect(tile.querySelectorAll("a,button")).toHaveLength(0);
      const navKey = k === "mine" ? "myTickets" : k === "invoicing" ? "billing" : k;
      const Icon = navigationIcon(navKey);
      const expectedIcon = document.createElement("div");
      expectedIcon.innerHTML = renderToStaticMarkup(<Icon />);
      expect(tile.querySelector("svg")?.innerHTML).toBe(expectedIcon.querySelector("svg")?.innerHTML);
      expect(tile.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(within(tile).getByTestId(`slot-section-flow-${k}`).textContent).toBe("");
    }
    const camp = screen.getByTestId("tile-section-campaigns");
    expect(camp.tagName).toBe("DIV");
    expect(camp.getAttribute("aria-disabled")).toBe("true");
    expect(camp.querySelector("svg")?.classList.contains("lucide-megaphone")).toBe(true);
    expect(screen.getByTestId("slot-estimates-value").textContent).toBe("");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/sections", { credentials: "include" });
  });

  it("overdue to zero keeps order and classes swap without moving slots", async () => {
    respond({ sections: all(3) });
    const { unmount } = mount({ activeRole: "admin" });
    await screen.findByTestId("text-section-total-mine");
    const before = order();
    expect(screen.getByTestId("tile-section-flags").className).toContain("sr-tile--overdue");
    unmount();
    respond({ sections: SECTION_ORDER.map(k => sec(k, 0, 0)) });
    mount({ activeRole: "admin" });
    await screen.findByTestId("text-section-total-mine");
    expect(order()).toEqual(before);
    const flags = screen.getByTestId("tile-section-flags");
    expect(flags.className).toContain("sr-tile--empty");
    expect(flags.className).not.toContain("sr-tile--overdue");
    expect(screen.getByTestId("text-section-overdue-flags").textContent).toBe("sectionRouter.noneOverdue");
    expect(screen.getByTestId("text-section-oldest-flags").textContent).toBe("sectionRouter.nothingWaiting");
  });

  it("field manager: role-hidden slots held, no data leaked even if API returns it", async () => {
    respond({ sections: all(1) });
    mount({ activeRole: "field_manager" });
    await screen.findByTestId("text-section-total-scheduling");
    expect(screen.getByTestId("slot-hidden-invoicing").textContent).toBe("");
    expect(screen.getByTestId("slot-hidden-estimates").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("slot-hidden-bids").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("text-section-total-bids")).toBeNull();
    expect(screen.queryByTestId("text-section-total-invoicing")).toBeNull();
    expect(order()).toHaveLength(9);
  });

  it("billing-tagged office follows sidebar billing visibility", async () => {
    respond({ sections: all(0) });
    mount({ activeRole: "office", activeTags: ["billing"] });
    await screen.findByTestId("text-section-total-estimates");
    expect(screen.getByTestId("slot-hidden-invoicing")).toBeTruthy();
  });

  it("error is not shown as zeros", async () => {
    respond({ message: "boom" }, 500);
    mount({ activeRole: "admin" });
    await screen.findByTestId("status-sections-error");
    await waitFor(() => expect(screen.getByTestId("tile-section-estimates").getAttribute("data-state")).toBe("error"));
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByTestId("text-section-total-estimates")).toBeNull();
    expect(screen.getByTestId("tile-section-estimates").querySelector("svg")).not.toBeNull();
  });

  it("loading shows skeleton, not zero; key is company/user scoped", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    mount({ activeRole: "admin" });
    expect(screen.getByTestId("tile-section-inbox").getAttribute("data-state")).toBe("loading");
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByTestId("tile-section-inbox").querySelector("svg")).not.toBeNull();
    expect(sectionsQueryKey("c1", "u1")).toEqual(["/api/dashboard/sections", "c1", "u1"]);
  });

  it("grid CSS: 4 / 2 at 1040 / 1 at 560, fixed tile height", () => {
    const css = readFileSync(resolve(__dirname, "SectionRouter.css"), "utf8");
    expect(css).toMatch(/repeat\(4, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/max-width: 1040px\) \{ \.section-router__grid \{ grid-template-columns: repeat\(2/);
    expect(css).toMatch(/max-width: 560px\) \{ \.section-router__grid \{ grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/height: 12\.5rem; overflow: hidden/);
  });
});
