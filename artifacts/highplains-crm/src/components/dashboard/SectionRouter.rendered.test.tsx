// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fx = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o && "count" in o ? `${o.count} overdue` : k) }),
}));
import SectionRouter, { SECTION_ORDER, sectionsQueryKey, permittedSectionKeys, type SectionSummary } from "./SectionRouter";

const sec = (key: SectionSummary["key"], total: number, overdue: number, oldest: SectionSummary["oldest"] = null): SectionSummary =>
  ({ key, href: `/dashboard/${key}`, total, overdue, oldest, flow: null });
const all = (o: number) => SECTION_ORDER.map((k, i) => sec(k, i + 3, o,
  { label: "Pavilion Villas spring aeration estimate with a very long name", detail: "11 days in stage", href: `/dashboard/${k}/1` }));
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const respond = (body: unknown, status = 200) => fetchMock.mockResolvedValue({ ok: status < 400, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) });
function mount(user: Record<string, unknown>) {
  fx.user = { id: "u1", activeCompanyId: "c1", activeTags: [], ...user };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><SectionRouter /></QueryClientProvider>);
}
const order = () => Array.from(document.querySelectorAll(".section-router__grid > *")).map(e => e.getAttribute("data-testid"));

describe("SectionRouter", () => {
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
      expect(within(tile).getByTestId(`slot-section-flow-${k}`).textContent).toBe("");
    }
    const camp = screen.getByTestId("tile-section-campaigns");
    expect(camp.tagName).toBe("DIV");
    expect(camp.getAttribute("aria-disabled")).toBe("true");
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
  });

  it("loading shows skeleton, not zero; key is company/user scoped", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    mount({ activeRole: "admin" });
    expect(screen.getByTestId("tile-section-inbox").getAttribute("data-state")).toBe("loading");
    expect(screen.queryByText("0")).toBeNull();
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
