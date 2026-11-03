// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import i18n from "i18next";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";

const fx = vi.hoisted(() => ({ q: {} as Record<string, any>, user: { id: 7, activeCompanyId: "co1" } as any, keys: [] as string[], api: vi.fn(), invalidate: vi.fn(), toast: vi.fn() }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => {
    const k = o.queryKey.join("/"); fx.keys.push(k);
    return { data: undefined, isLoading: false, isError: false, error: null, refetch: () => {}, ...(fx.q[k] ?? fx.q["*"] ?? {}) };
  },
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...a: any[]) => fx.api(...a),
  queryClient: { invalidateQueries: (...a: any[]) => fx.invalidate(...a) },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }), toast: fx.toast }));
vi.mock("@/components/contracts/contractFormat", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/contracts/contractFormat")>(), coloradoToday: () => "2026-11-03",
}));
import ActiveCustomersPage from "@/pages/ActiveCustomersPage";
import ContractCenterPage from "@/pages/ContractCenterPage";
import { buildCsv, csvCell, visibleRows, lineTone } from "@/components/contracts/activeCustomers";
import * as helpers from "@/components/contracts/activeCustomers";

const none = { state: "none", seasonId: null, agreementId: null, seasonLabel: null, startDate: null, endDate: null, note: null };
const ls = (o: any) => ({ ...none, seasonLabel: "2026", ...o });
const row = (id: string, o: any = {}) => ({ customerId: id, customerName: "Cust " + id, customerStatus: "active", managingAgentName: "Pat Ruiz",
  responsible: false, landscape: none, snow: none, flags: [], ...o });
const rows = [
  row("a", { customerName: "Legends", responsible: true, landscape: ls({ state: "in_effect", agreementId: "ag1", seasonId: "s1", endDate: "2028-09-30", note: "renewed" }),
    snow: ls({ state: "in_effect", agreementId: "ag2", seasonId: "s2", endDate: "2028-09-30" }) }),
  row("b", { customerName: "Terrace", landscape: ls({ state: "ended", agreementId: "ag3", seasonId: "s3", endDate: "2026-10-31" }), flags: ["should_fall_off"] }),
  row("c", { customerName: "=Evil", customerStatus: "inactive", responsible: true, snow: ls({ state: "in_effect", agreementId: "ag4", seasonId: "s4", endDate: "2026-11-20" }), flags: ["mismatch", "ending_soon"] }),
  row("d", { customerName: "1st Bank Branch", responsible: true, viaParent: true, parentName: "1st Bank", landscape: ls({ state: "in_effect", agreementId: "pa", seasonId: "ps", endDate: "2027-03-31" }) }),
  row("e", { customerName: "Nobody", noContract: true }),
  row("f", { customerName: "Renewal overdue", snow: ls({ state: "lapsed", endDate: "2026-10-31", note: "renewal_sent" }), flags: ["lapsed"] }),
  row("g", { customerName: "Upcoming snow", snow: ls({ state: "starting", startDate: "2026-11-20" }), flags: ["starting_soon"] }),
  row("h", { customerName: "Prospect", customerStatus: "prospect", landscape: ls({ state: "ended", endDate: "2026-10-31" }) }),
];
const resp = (o: any = {}) => ({ asOf: "2026-11-03", counts: { responsible: 3, landscape: 2, snow: 2, ending_soon: 1, lapsed: 1, should_fall_off: 1, starting_soon: 1, mismatch: 1, noContract: 1 }, rows, ...o });

let el: HTMLDivElement; let root: Root;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); fx.keys = []; fx.user = { id: 7, activeCompanyId: "co1" }; fx.api.mockReset().mockResolvedValue({ json: async () => ({}) }); fx.invalidate.mockClear(); fx.toast.mockClear(); });
afterEach(() => { act(() => root.unmount()); el.remove(); i18n.changeLanguage("en"); vi.restoreAllMocks(); });
const render = (node: any) => act(() => root.render(<QueryClientProvider client={new QueryClient()}><Router ssrPath="/dashboard/contracts/customers">{node}</Router></QueryClientProvider>));
const $ = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const click = (id: string) => act(() => $(id).click());
const ids = () => Array.from(document.querySelectorAll('[data-testid^="row-active-"]')).map(e => e.getAttribute("data-testid")!.slice(11));
const type = (id: string, value: string) => act(() => {
  const input = $(id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

describe("active customers page", () => {
  it("shows loading and error states with retry", () => {
    fx.q = { "*": { isLoading: true } }; render(<ActiveCustomersPage />);
    expect($("loading-active-customers")).toBeTruthy();
    const refetch = vi.fn(); fx.q = { "*": { isError: true, refetch } }; render(<ActiveCustomersPage />);
    click("button-retry-active-customers"); expect(refetch).toHaveBeenCalled();
  });
  it("defaults to In effect, filters by cards, line and search", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    expect(ids()).toEqual(["a", "c", "d"]);
    expect($("card-responsible").textContent).toContain("Landscape 2 · Snow 2");
    click("card-should-fall-off"); expect(ids()).toEqual(["b"]);
    click("card-should-fall-off"); expect(ids()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    click("card-mismatch"); expect(ids()).toEqual(["c"]);
    click("card-no-contract"); expect(ids()).toEqual(["e"]);
    click("card-responsible"); click("toggle-active-line-snow"); expect(ids()).toEqual(["a", "c"]);
    click("toggle-active-line-all"); type("input-search-active-customers", "bank"); expect(ids()).toEqual(["d"]);
    type("input-search-active-customers", "zzz"); expect($("empty-active-customers").textContent).toBe("No customers match.");
  });
  it("filters Ending, Lapsed and Starting cards and retains prospect badges in All", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("card-ending-soon"); expect(ids()).toEqual(["c"]);
    click("card-lapsed"); expect(ids()).toEqual(["f"]);
    expect($("table-active-customers").textContent).toContain("Ended Oct 31, 2026 · renewal sent");
    click("card-starting-soon"); expect(ids()).toEqual(["g"]);
    expect($("table-active-customers").textContent).toContain("Starts Nov 20, 2026");
    click("card-starting-soon");
    expect($("badge-status-h").textContent).toBe("Prospect");
    expect($("button-set-inactive-h")).toBeNull();
  });
  it("hides mismatch and no-contract cards when zero", () => {
    fx.q = { "*": { data: resp({ counts: { ...resp().counts, mismatch: 0, noContract: 0 } }) } }; render(<ActiveCustomersPage />);
    expect($("card-mismatch")).toBeNull(); expect($("card-no-contract")).toBeNull();
  });
  it("re-queries with the As of date and offers Today", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    expect(fx.keys.at(-1)).toBe("/api/contract-center/active-customers/co1/7/2026-11-03");
    expect($("button-as-of-today")).toBeNull();
    type("input-as-of", "2027-01-02");
    expect(fx.keys.at(-1)).toBe("/api/contract-center/active-customers/co1/7/2027-01-02");
    click("button-as-of-today"); expect(fx.keys.at(-1)).toContain("co1/7/2026-11-03");
  });
  it("links seasons, parents and customers", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    expect($("link-season-s1").getAttribute("href")).toBe("/dashboard/contracts/ag1#term-s1");
    expect($("link-season-s1").textContent).toBe("In effect to Sep 30, 2028 · renewed");
    expect($("link-season-ps").textContent).toContain("Through 1st Bank");
    expect($("link-season-ps").getAttribute("href")).toBe("/dashboard/contracts/pa#term-ps");
    expect($("link-customer-a").getAttribute("href")).toBe("/dashboard/customers/a");
    expect($("badge-status-c").textContent).toBe("Inactive");
    expect($("link-contracts-view").getAttribute("href")).toBe("/dashboard/contracts");
  });
  it("confirms Set inactive, PATCHes status only, and refetches", async () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("card-should-fall-off"); click("button-set-inactive-b");
    expect(document.body.textContent).toContain("Set Terrace inactive?");
    expect(document.body.textContent).toContain("Their last contract ended Oct 31, 2026.");
    await act(async () => { $("button-confirm-status").click(); });
    expect(fx.api).toHaveBeenCalledWith("PATCH", "/api/customers/b", { status: "inactive" }, { headers: { "X-Company-Id": "co1" } });
    expect(fx.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/contract-center/active-customers", "co1"] });
    expect(fx.toast).toHaveBeenCalled();
  });
  it("offers Set active only for a mismatch", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    expect($("button-set-active-c")).toBeTruthy(); expect($("button-set-active-a")).toBeNull(); expect($("button-set-inactive-a")).toBeNull();
  });
  it("Set active PATCHes only active status and invalidates customer lists/detail", async () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("button-set-active-c");
    expect(document.body.textContent).toContain("Set =Evil active?");
    await act(async () => { $("button-confirm-status").click(); });
    expect(fx.api).toHaveBeenCalledWith("PATCH", "/api/customers/c", { status: "active" }, { headers: { "X-Company-Id": "co1" } });
    expect(fx.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/customers"] });
    expect(fx.invalidate).toHaveBeenCalledWith({ queryKey: ["/api/customers", "c"] });
  });
  it("disables confirmation while pending and prevents duplicate PATCHes", async () => {
    let finish!: (v: any) => void;
    fx.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("card-should-fall-off"); click("button-set-inactive-b");
    await act(async () => { $("button-confirm-status").click(); });
    await waitFor(() => expect(($("button-confirm-status") as HTMLButtonElement).disabled).toBe(true));
    click("button-confirm-status");
    expect(fx.api).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ json: async () => ({ status: "inactive" }) }); });
    expect($("button-confirm-status")).toBeNull();
  });
  it("keeps failed confirmation retryable and reports an error without invalidation", async () => {
    fx.api.mockRejectedValueOnce(new Error("request failed"));
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("card-should-fall-off"); click("button-set-inactive-b");
    await act(async () => { $("button-confirm-status").click(); });
    expect($("button-confirm-status")).toBeTruthy();
    expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(fx.invalidate).not.toHaveBeenCalled();
    await act(async () => { $("button-confirm-status").click(); });
    expect($("button-confirm-status")).toBeNull();
    expect(fx.api).toHaveBeenCalledTimes(2);
  });
  it("drops pending confirmation and isolates cache after a company switch", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("card-should-fall-off"); click("button-set-inactive-b");
    fx.user = { ...fx.user, activeCompanyId: "co2" };
    render(<ActiveCustomersPage />);
    expect($("button-confirm-status")).toBeNull();
    expect(fx.api).not.toHaveBeenCalled();
    expect(fx.keys.at(-1)).toContain("/co2/7/");
  });
  it("exports precisely displayed rows with the projection date filename", () => {
    const download = vi.spyOn(helpers, "downloadCsv").mockImplementation(() => {});
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    click("card-mismatch"); click("button-export-active-customers");
    expect(download).toHaveBeenCalledWith("active-customers-2026-11-03.csv", expect.stringContaining("'=Evil"));
    expect(download.mock.calls[0][1]).not.toContain("Legends");
  });
  it("retains date correction controls on a query error", () => {
    fx.q = { "*": { isError: true } }; render(<ActiveCustomersPage />);
    type("input-as-of", "2027-01-02");
    expect($("button-as-of-today")).toBeTruthy();
    click("button-as-of-today");
    expect(($("input-as-of") as HTMLInputElement).value).toBe("2026-11-03");
  });
  it("contains table scrolling and stacks cards", () => {
    fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    expect($("scroll-active-customers").className).toContain("overflow-x-auto");
    expect($("card-responsible").parentElement!.className).toContain("grid-cols-1");
  });
  it("localizes to Spanish", () => {
    i18n.changeLanguage("es"); fx.q = { "*": { data: resp() } }; render(<ActiveCustomersPage />);
    expect($("link-season-s1").textContent).toBe("Vigente hasta 30 sep 2028 · renovado");
  });
  it("Contract Center shows the view switch", () => {
    fx.q = { "*": { data: [] } }; render(<ContractCenterPage />);
    expect($("link-active-customers-view").getAttribute("href")).toBe("/dashboard/contracts/customers");
  });
});

describe("csv", () => {
  it("exports visible rows and guards formulas", () => {
    const t = i18n.getFixedT("en");
    const csv = buildCsv(visibleRows(rows as any, "mismatch", "all", ""), t as any);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('"Customer","Status","Agent","Landscape","Snow","Flags"');
    expect(lines[1]).toContain(`"'=Evil","Inactive","Pat Ruiz"`);
    expect(lines[1]).toContain("Inactive but in effect; Ending soon");
    expect(csvCell('+1 "x"')).toBe(`"'+1 ""x"""`);
    expect(csvCell("@a")).toBe(`"'@a"`);
    expect(csvCell(" \t=SUM(A1)")).toBe(`"' \t=SUM(A1)"`);
    expect(csvCell('a,b\n"c"')).toBe('"a,b\n""c"""');
    expect(csvCell("\n=1")).toBe(`"'\n=1"`);
  });
  it("colors only the ending line amber rather than every in-effect line on a flagged row", () => {
    expect(lineTone(ls({ state: "in_effect", endDate: "2026-11-20" }), ["ending_soon"], "2026-11-03")).toBe("amber");
    expect(lineTone(ls({ state: "in_effect", endDate: "2028-09-30" }), ["ending_soon"], "2026-11-03")).toBe("green");
    expect(lineTone(ls({ state: "in_effect", endDate: "2026-11-20", note: "renewed" }), ["ending_soon"], "2026-11-03")).toBe("green");
  });
  it("line filters exclude customers without a season on that line, including no-contract rows", () => {
    expect(visibleRows(rows as any, null, "landscape", "").map(r => r.customerId)).toEqual(["a", "b", "d", "h"]);
    expect(visibleRows(rows as any, "noContract", "snow", "")).toEqual([]);
  });
});
