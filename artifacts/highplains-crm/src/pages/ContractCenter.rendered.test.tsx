import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({ q: {} as Record<string, any> }));
vi.mock("wouter", async importOriginal => ({
  ...await importOriginal<typeof import("wouter")>(),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
}));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => {
    const r = fx.q[o.queryKey.join("/")] ?? {};
    return { data: undefined, isLoading: false, isError: false, error: null, refetch: () => {}, ...r };
  },
}));
import { ContractBoard, ContractTable } from "@/pages/ContractCenterPage";
import ContractPage from "@/pages/ContractPage";
import { money } from "@/components/contracts/contractFormat";
import { placements, tableRows } from "@/components/contracts/boardLogic";

const term = (o: any = {}) => ({ id: "t", seasonLabel: "2026–27", startDate: "2026-04-01", endDate: "2027-03-31", status: "active", displayStatus: "active",
  annualPriceCents: 150000, snowPricing: null, needsReview: false, ...o });
const item = (id: string, line: string, o: any = {}) => ({ id, customerId: "c" + id, customerName: "Cust " + id, line, form: "ours",
  current: term(), renewalDraft: null, renewalDue: false, companyDay: "2026-10-12", ...o });
const board = (items: any[], b: "landscape" | "snow") =>
  renderToStaticMarkup(<Router ssrPath="/"><ContractBoard items={items} board={b} q="" today="2026-10-12" defaultOpen onComingSoon={() => {}} /></Router>);

describe("board placement", () => {
  it("keeps parent agreements under their actual customer with locations on board and list", () => {
    const parent = item("parent", "landscape", { customerName: "Bank", locationCount: 2, renewalDue: true });
    const child = item("child", "landscape", { customerName: "Branch", renewalDue: true });
    const html = board([parent, child], "landscape");
    expect(html).toContain("Bank · 2 locations"); expect(html).toContain("Branch");
    expect(html.match(/>Bank · 2 locations</g)).toHaveLength(1);
    expect(html).toContain('title="Bank · 2 locations"');
    const list = renderToStaticMarkup(<Router><ContractTable items={[parent, child]} board="landscape" q="" /></Router>);
    expect(list).toContain("Bank · 2 locations");
    expect(list.match(/Bank · 2 locations/g)).toHaveLength(1);
  });
  it("shows a Both contract on both boards", () => {
    const items = [item("1", "both", { renewalDue: true })];
    expect(board(items, "landscape")).toContain("card-renewal-1");
    expect(board(items, "snow")).toContain("card-renewal-1");
    expect(board([item("2", "snow")], "landscape")).not.toContain("card-renewal-2");
  });
  it("puts expired contracts without renewal under Up for renewal", () => {
    const html = board([item("3", "landscape", { current: term({ displayStatus: "expired" }) })], "landscape");
    expect(html).toContain("card-renewal-3");
  });
  it("moves a contract with a renewal draft to the drafted column", () => {
    const html = board([item("4", "landscape", { renewalDue: true, renewalDraft: term({ id: "d", status: "sent", displayStatus: "sent" }) })], "landscape");
    expect(html).toContain("card-drafted-4");
    expect(html).not.toContain("card-renewal-4");
    expect(html).toContain("#term-d");
  });
  it("lists recently signed terms and progress", () => {
    const html = board([item("5", "landscape", { recentSigned: term({ id: "s", signedAt: "2026-09-20T15:00:00Z" }), renewalProgress: { due: true, signed: true } })], "landscape");
    expect(html).toContain("card-signed-5");
    expect(html).toContain("1 of 1 renewals signed");
  });
  it("excludes future signed dates and future lost end dates from lookback columns", () => {
    const future = item("future", "landscape", {
      recentSigned: term({ signedAt: "2026-10-14T12:00:00Z" }),
      latest: term({ status: "lost", endDate: "2027-03-31" }),
    });
    expect(placements(future as any, "2026-10-12")).toEqual([]);
    const recentLost = item("lost", "landscape", { latest: term({ status: "lost", endDate: "2026-10-12" }) });
    expect(placements(recentLost as any, "2026-10-12").map(c => c.column)).toEqual(["lost"]);
  });
  it("sorts Snow prices by the figure displayed, including Both agreements", () => {
    const items = [
      item("high", "both", { current: term({ snowPricing: "flat_rate", snowFlatPriceCents: 80000, annualPriceCents: 1000 }) }),
      item("low", "snow", { current: term({ snowPricing: "flat_rate", snowFlatPriceCents: 20000, annualPriceCents: 900000 }) }),
    ];
    expect(tableRows(items as any, "snow", "", [], "price", "asc").map(i => i.id)).toEqual(["low", "high"]);
  });
});

const detail = (o: any = {}) => ({ id: "a1", customerId: "c", line: "landscape", form: "ours", customer: { id: "c", name: "Pavilion Villas" },
  currentTermId: "t2", renewalDue: false, renewalDraftId: null,
  terms: [
    { ...term({ id: "t1", seasonLabel: "2025–26", status: "renewed", displayStatus: "renewed" }), editable: false, allowedMoves: [], scope: [], rates: [], billingMonths: [], documents: [], history: [] },
    { ...term({ id: "t2", status: "signed", displayStatus: "signed", billingType: "equal_monthly" }), editable: true, allowedMoves: ["lost"], scope: [], rates: [], billingMonths: [], documents: [], history: [] },
  ], ...o });
const page = (hash: string) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><Router ssrPath="/dashboard/contracts/a1"><Route path="/dashboard/contracts/:id"><ContractPage initialHash={hash} /></Route></Router></QueryClientProvider>);

describe("contract page", () => {
  it.each([
    ["renewed", true, "2026-04-01", "2027-03-31", null],
    ["signed", true, "2030-04-01", "2031-03-31", null],
    ["renewed", false, "2024-04-01", "2025-03-31", "Past season, read only"],
    ["lost", false, "2030-04-01", "2031-03-31", "Closed season, read only"],
    ["cancelled", false, "2030-04-01", "2031-03-31", "Closed season, read only"],
    ["draft", false, "2030-04-01", "2031-03-31", "Past season, read only"],
  ])("uses only the server editable flag for %s", (status, editable, startDate, endDate, note) => {
    fx.q = { "/api/contract-center/contracts/a1": { data: detail({ terms: [
      { ...detail().terms[1], status, editable, startDate, endDate },
    ] }) } };
    const html = page("#term-t2");
    expect(html.includes('data-testid="button-edit-contract"')).toBe(editable);
    if (note) expect(html).toContain(note);
    else expect(html).not.toContain('data-testid="note-past-season"');
  });
  it("shows a final-season renewal draft on the board, keeps it editable, and disables another Renew while year 1 is current", () => {
    const seasons = Array.from({ length: 5 }, (_, i) => ({
      ...detail().terms[0], ...term({ id: `y${i + 1}`, seasonLabel: String(2026 + i),
        startDate: `${2026 + i}-01-01`, endDate: `${2026 + i}-12-31`,
        status: i === 4 ? "signed" : "renewed", displayStatus: i === 0 ? "active" : i === 4 ? "signed" : "renewed" }),
      editable: false, allowedMoves: [],
    }));
    const draft = { ...detail().terms[1], ...term({ id: "y6", seasonLabel: "2031", startDate: "2031-01-01", endDate: "2031-12-31",
      status: "draft", displayStatus: "draft", renewedFromTermId: "y5" }), editable: true, allowedMoves: ["sent", "cancelled", "lost"] };
    const html = board([item("a1", "landscape", { current: seasons[0], renewalDraft: draft })], "landscape");
    expect(html).toContain("card-drafted-a1");
    expect(html).toContain("#term-y6");
    expect(html).not.toContain("card-renewal-a1");
    fx.q = { "/api/contract-center/contracts/a1": { data: detail({
      currentTermId: "y1", renewalDraftId: "y6", terms: [...seasons, draft],
    }) } };
    const current = page("");
    expect(current.match(/<button\b[^>]*data-testid="button-renew-contract"[^>]*>/)?.[0]).toContain("disabled");
    expect(current).not.toContain("button-edit-contract");
    const pending = page("#term-y6");
    expect(pending).toContain("button-edit-contract");
    expect(pending).toContain("button-status-menu");
  });
  it("shows no Edit button on a past term", () => {
    fx.q = { "/api/contract-center/contracts/a1": { data: detail() } };
    const past = page("#term-t1");
    expect(past).toContain("Past season, read only");
    expect(past).not.toContain("button-edit-contract");
    expect(page("#term-t2")).toContain("button-edit-contract");
  });
  it("redirects legacy ids to the agreement", () => {
    fx.q = { "/api/contract-center/contracts/a1": { isError: true, error: new Error("404: {}") },
      "/api/contract-center/contracts/by-legacy/a1": { data: { agreementId: "new-id" } } };
    expect(page("")).toContain('data-redirect="/dashboard/contracts/new-id"');
  });
  it("distinguishes uncopied from network errors", () => {
    fx.q = { "/api/contract-center/contracts/a1": { isError: true, error: new Error("404: {}") },
      "/api/contract-center/contracts/by-legacy/a1": { isError: true, error: new Error("404: {}") } };
    expect(page("")).toContain("hasn&#x27;t been copied");
    fx.q = { "/api/contract-center/contracts/a1": { isError: true, error: new Error("500: boom") } };
    const html = page("");
    expect(html).toContain("error-contract");
    expect(html).not.toContain("copied");
  });
});

describe("money", () => {
  it("formats whole dollars and cents", () => {
    expect(money(150000)).toBe("$1,500");
    expect(money(117500)).toBe("$1,175");
    expect(money(123456)).toBe("$1,234.56");
  });
});
