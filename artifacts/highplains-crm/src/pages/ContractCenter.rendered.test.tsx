import { describe, expect, it, vi } from "vitest";
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
import { ContractBoard } from "@/pages/ContractCenterPage";
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
