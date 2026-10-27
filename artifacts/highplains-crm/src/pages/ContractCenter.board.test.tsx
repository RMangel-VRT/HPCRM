// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { addDays } from "@/components/contracts/contractFormat";
import { placements, tableRows } from "@/components/contracts/boardLogic";
import type { ContractListItem, TermSummary } from "@/components/contracts/contractTypes";

const fx = vi.hoisted(() => ({ items: [] as ContractListItem[] }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: fx.items, isLoading: false, isError: false }),
}));
vi.mock("@/components/contracts/RenewDialog", () => ({ RenewDialog: () => null }));
import ContractCenterPage, { ContractBoard, ContractTable } from "./ContractCenterPage";

const today = "2026-10-12";
const storageKey = "hp-contract-center-board-open";
const term = (o: Partial<TermSummary> = {}): TermSummary => ({
  id: "term", seasonLabel: "2026–27", startDate: "2026-04-01", endDate: "2027-03-31",
  status: "active", displayStatus: "active", annualPriceCents: 150000, snowPricing: null, needsReview: false, line: "landscape", form: "ours", ...o,
});
const item = (id: string, o: Partial<ContractListItem> = {}): ContractListItem => ({
  id, customerId: `customer-${id}`, customerName: `Wellman ${id}`, line: "landscape", form: "ours",
  current: term(), renewalDraft: null, renewalDue: false, companyDay: today, ...o,
});
const lost = (id: string, days: number, o: Partial<ContractListItem> = {}) => item(id, {
  current: null, latest: term({ status: "lost", displayStatus: "lost", endDate: addDays(today, -days) }), ...o,
});
const fixtures = () => [
  ...["a", "b", "c"].map(id => item(id, { renewalDue: true })),
  item("draft", { renewalDraft: term({ id: "draft-term", status: "sent", displayStatus: "sent", needsReview: true }) }),
  ...["s1", "s2"].map(id => item(id, { recentSigned: term({ signedAt: "2026-09-20T15:00:00Z" }) })),
];
const mountBoard = (props: Partial<Parameters<typeof ContractBoard>[0]> = {}) =>
  render(<Router><ContractBoard items={fixtures()} board="landscape" q="" today={today} {...props} /></Router>);

beforeEach(() => { localStorage.clear(); fx.items = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("collapsible renewal header", () => {
  it("toggles the body, retains summary/progress and persists both states across remounts", () => {
    const { unmount } = mountBoard();
    const toggle = screen.getByTestId("button-toggle-board");
    expect(toggle.getAttribute("aria-controls")).toBe("renewals-board-body");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("renewals-board")).toBeNull();
    expect(document.getElementById("renewals-board-body")?.hidden).toBe(true);
    expect(screen.getByTestId("renewal-progress")).toBeTruthy();
    expect(localStorage.getItem(storageKey)).toBe("0");
    unmount();
    mountBoard();
    expect(screen.queryByTestId("renewals-board")).toBeNull();
    fireEvent.click(screen.getByTestId("button-toggle-board"));
    expect(screen.getByTestId("renewals-board")).toBeTruthy();
    expect(localStorage.getItem(storageKey)).toBe("1");
  });

  it("reads storage lazily and allows defaultOpen to override it", () => {
    localStorage.setItem(storageKey, "0");
    const read = vi.spyOn(Storage.prototype, "getItem");
    const { rerender } = mountBoard();
    expect(read).toHaveBeenCalledTimes(1);
    rerender(<Router><ContractBoard items={fixtures()} board="landscape" q="Wellman" today={today} /></Router>);
    expect(read).toHaveBeenCalledTimes(1);
    cleanup();
    read.mockClear();
    mountBoard({ defaultOpen: true });
    expect(screen.getByTestId("renewals-board")).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    cleanup();
    localStorage.setItem(storageKey, "1");
    mountBoard({ defaultOpen: false });
    expect(screen.queryByTestId("renewals-board")).toBeNull();
  });

  it("defaults open and remains interactive when storage reads and writes throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mountBoard();
    expect(screen.getByTestId("renewals-board")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-toggle-board"));
    expect(screen.queryByTestId("renewals-board")).toBeNull();
    fireEvent.click(screen.getByTestId("button-toggle-board"));
    expect(screen.getByTestId("renewals-board")).toBeTruthy();
  });

  it("uses column counts, mutes zeroes, and leaves progress calculation unchanged", () => {
    mountBoard({ items: fixtures().map((i, n) => ({ ...i, renewalProgress: { due: true, signed: n < 2 } })) });
    const summary = screen.getByTestId("text-board-summary");
    expect(summary.textContent).toBe("3 up for renewal · 1 sent · 2 signed · 0 lost");
    expect(within(summary).getByText("0 lost").className).toContain("text-muted-foreground");
    expect(screen.getByTestId("text-renewal-progress").textContent).toBe("2 of 6 renewals signed");
    expect(screen.getByTestId("renewal-progress").parentElement?.className).toContain("xl:flex-row");
  });

  it("filters the collapsed summary and offers Show without automatically opening", () => {
    const { rerender } = mountBoard({ defaultOpen: false });
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();
    const search = (q: string) => rerender(<Router><ContractBoard items={fixtures()} board="landscape" q={q} today={today} defaultOpen={false} /></Router>);
    search("Wellman draft");
    expect(screen.queryByTestId("renewals-board")).toBeNull();
    expect(screen.getByTestId("text-board-summary").textContent).toBe("0 up for renewal · 1 sent · 0 signed · 0 lost");
    search("missing");
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();
    search("Wellman draft");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByTestId("card-drafted-draft")).toBeTruthy();
    expect(localStorage.getItem(storageKey)).toBe("1");
  });
});

describe("Lost history and table handoff", () => {
  it("includes day 90 and today, excludes day 91/120 and future, and leaves Signed at 60 days", () => {
    for (const days of [0, 80, 90, 91, 120, -1]) {
      expect(placements(lost("lost", days), today).some(c => c.column === "lost")).toBe(days >= 0 && days <= 90);
    }
    for (const days of [0, 60, 61, -1]) {
      const signed = item("signed", { recentSigned: term({ signedAt: `${addDays(today, -days)}T18:00:00Z` }) });
      expect(placements(signed, today).some(c => c.column === "signed")).toBe(days >= 0 && days <= 60);
    }
    const items = [lost("80", 80), lost("120", 120), lost("snow", 120, { line: "snow", latest: term({ line: "snow", status: "lost", displayStatus: "lost", endDate: addDays(today, -120) }) }), item("active")];
    expect(tableRows(items, "landscape", "", ["lost"], "ends", "asc").map(i => i.id)).toEqual(["120", "80"]);
    expect(tableRows(items, "landscape", "120", ["lost"], "ends", "asc").map(i => i.id)).toEqual(["120"]);
  });

  it("renders the 80-day Lost card, excludes the 120-day card and uses the new empty text", () => {
    mountBoard({ items: [lost("80", 80), lost("120", 120)] });
    expect(screen.getByTestId("card-lost-80")).toBeTruthy();
    expect(screen.queryByTestId("card-lost-120")).toBeNull();
    cleanup();
    mountBoard({ items: [] });
    expect(screen.getByText("No contracts lost in the last 90 days.")).toBeTruthy();
  });

  it("supports standalone chip state and keeps Lost after Expired", () => {
    render(<ContractTable items={[lost("old", 120), item("active")]} board="landscape" q="" />);
    const chips = screen.getAllByTestId(/^chip-filter-/);
    expect(chips.map(c => c.textContent)).toEqual(["Needs review", "Up for renewal", "Expired", "Lost"]);
    fireEvent.click(screen.getByTestId("chip-filter-lost"));
    expect(screen.getByTestId("row-contract-old")).toBeTruthy();
    expect(screen.queryByTestId("row-contract-active")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-filter-lost"));
    expect(screen.getByTestId("row-contract-active")).toBeTruthy();
  });

  it("uses controlled chips and emits changes without secretly changing the controlled value", () => {
    const onChipsChange = vi.fn();
    const { rerender } = render(<ContractTable items={[]} board="landscape" q="" chips={["review"]} onChipsChange={onChipsChange} />);
    fireEvent.click(screen.getByTestId("chip-filter-lost"));
    expect(onChipsChange).toHaveBeenCalledWith(["review", "lost"]);
    expect(screen.getByTestId("chip-filter-lost").getAttribute("aria-pressed")).toBe("false");
    rerender(<ContractTable items={[]} board="landscape" q="" chips={["lost"]} onChipsChange={onChipsChange} />);
    expect(screen.getByTestId("chip-filter-lost").getAttribute("aria-pressed")).toBe("true");
  });

  it("View all lost replaces page chips and smoothly scrolls without changing search or board", () => {
    fx.items = [lost("old", 120), lost("recent", 80), lost("snow", 120, { line: "snow", latest: term({ line: "snow", status: "lost", displayStatus: "lost", endDate: addDays(today, -120) }) }), item("active")];
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    const loc = memoryLocation({ path: "/dashboard/contracts" });
    render(<Router hook={loc.hook}><ContractCenterPage /></Router>);
    fireEvent.click(screen.getByTestId("chip-filter-review"));
    fireEvent.change(screen.getByTestId("input-search-contracts"), { target: { value: "Wellman old" } });
    fireEvent.click(screen.getByTestId("link-view-all-lost"));
    expect(screen.getByTestId("chip-filter-lost").getAttribute("aria-pressed")).toBe("true");
    for (const chip of ["review", "renewal", "expired"]) {
      expect(screen.getByTestId(`chip-filter-${chip}`).getAttribute("aria-pressed")).toBe("false");
    }
    expect(screen.getByTestId("row-contract-old")).toBeTruthy();
    expect(screen.queryByTestId("row-contract-recent")).toBeNull();
    expect(screen.queryByTestId("row-contract-snow")).toBeNull();
    expect((screen.getByTestId("input-search-contracts") as HTMLInputElement).value).toBe("Wellman old");
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});

describe("compact cards and independent scrolling", () => {
  it("keeps name, price and action in row one and all metadata in row two; only actions navigate", () => {
    const renew = vi.fn();
    mountBoard({ onRenew: renew });
    const card = screen.getByTestId("card-renewal-a");
    expect(card.children).toHaveLength(2);
    const name = screen.getByTestId("text-card-customer-renewal-a");
    expect(name.title).toBe("Wellman a");
    expect(name.className).toContain("truncate");
    expect(within(card.children[0] as HTMLElement).getByText("$1,500")).toBeTruthy();
    const action = within(card.children[0] as HTMLElement).getByTestId("button-renew-a");
    expect(action.className).toContain("h-7");
    expect(card.children[1].textContent).toContain("2026–27 · ends Mar 31, 2027");
    fireEvent.click(card);
    expect(renew).not.toHaveBeenCalled();
    fireEvent.click(action);
    expect(renew).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    const drafted = screen.getByTestId("card-drafted-draft");
    expect(within(drafted.children[0] as HTMLElement).getByRole("link").getAttribute("href")).toBe("/dashboard/contracts/draft#term-draft-term");
    expect(drafted.children[1].textContent).toContain("Renewal sent");
    expect(drafted.children[1].textContent).toContain("Needs review");
    expect(card.className).toContain("bg-background dark:bg-card shadow-sm dark:shadow-none");
  });

  it("retains Both/snow flat and time-and-material pricing in the first row", () => {
    mountBoard({ board: "snow", items: [
      item("flat", { line: "both", renewalDue: true, current: term({ line: "both", snowPricing: "flat_rate", snowFlatPriceCents: 80000 }) }),
      item("tm", { line: "snow", renewalDue: true, current: term({ line: "snow" }) }),
    ] });
    expect(screen.getByTestId("card-renewal-flat").children[0].textContent).toContain("Flat snow $800");
    expect(screen.getByTestId("card-renewal-tm").children[0].textContent).toContain("T&M");
  });

  it("caps lists, fixes headings outside them, and updates fades on scroll, content and resize", () => {
    let resize: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: () => void) { resize = cb; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const { rerender, unmount } = mountBoard();
    const list = screen.getByTestId("list-lost");
    let height = 600;
    Object.defineProperties(list, {
      scrollHeight: { get: () => height }, clientHeight: { value: 416 }, scrollTop: { value: 0, writable: true },
    });
    act(() => { resize?.(); });
    expect(screen.getByTestId("fade-lost").className).toContain("pointer-events-none");
    expect(list.className).toContain("max-h-[26rem] overflow-y-auto pr-1");
    expect(list.contains(within(screen.getByTestId("column-lost")).getByRole("heading"))).toBe(false);
    expect(screen.getByTestId("column-lost").className).toContain("bg-muted/80 dark:bg-muted/40");
    expect(screen.getByTestId("renewals-board").className).toContain("overflow-x-auto");
    list.scrollTop = 184;
    fireEvent.scroll(list);
    expect(screen.queryByTestId("fade-lost")).toBeNull();
    list.scrollTop = 0;
    fireEvent.scroll(list);
    expect(screen.getByTestId("fade-lost")).toBeTruthy();
    height = 200;
    rerender(<Router><ContractBoard items={[]} board="landscape" q="" today={today} /></Router>);
    expect(screen.queryByTestId("fade-lost")).toBeNull();
    height = 600;
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("fade-lost")).toBeTruthy();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
