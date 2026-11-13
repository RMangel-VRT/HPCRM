// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { boardColumns, placements, tableRows } from "@/components/contracts/boardLogic";
import { CONTRACT_STATES, emptyContractCounts, stateReasonText } from "@/components/contracts/contractAttention";
import type { ContractState } from "@/components/contracts/contractAttention";
import type { ContractListItem, TermSummary } from "@/components/contracts/contractTypes";

const fx = vi.hoisted(() => ({ items: [] as unknown[], attention: undefined as unknown, posted: [] as unknown[] }));
vi.mock("@tanstack/react-query", async orig => ({
  ...await orig<typeof import("@tanstack/react-query")>(),
  useQuery: (o: { queryKey: string[] }) => ({
    data: o.queryKey[0] === "/api/contract-center/attention" ? fx.attention : fx.items, isLoading: false, isError: false, refetch: () => {},
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}), removeQueries: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeCompanyId: "co" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn(async (...a: unknown[]) => { fx.posted.push(a); return { json: async () => ({}) }; }) }));
vi.mock("@/components/contracts/RenewDialog", () => ({ RenewDialog: () => null }));
vi.mock("@/components/contracts/NotRenewingDialog", () => ({ NotRenewingDialog: () => null }));
import ContractCenterPage, { ContractBoard, ContractTable } from "./ContractCenterPage";

const today = "2026-11-12";
const term = (o: Partial<TermSummary> = {}): TermSummary => ({
  id: "term", seasonLabel: "2026–27", startDate: "2026-04-01", endDate: "2027-03-31",
  status: "active", displayStatus: "active", annualPriceCents: 150000, snowPricing: null, needsReview: false, line: "landscape", form: "ours", ...o,
});
const item = (id: string, state: ContractState, o: Partial<ContractListItem> = {}): ContractListItem => ({
  id, customerId: `c-${id}`, customerName: `Wellman ${id}`, line: "landscape", form: "ours", applicableLines: ["landscape"],
  current: term({ id: `t-${id}` }), renewalDraft: null, renewalDue: false, companyDay: today,
  state, stateSince: "2026-09-30", stateReason: state, stateTermId: `t-${id}`, flags: [], allowedActions: ["open"], actionTermId: `t-${id}`, ...o,
});
const fixtures = () => CONTRACT_STATES.map(s => item(s, s));
const mountBoard = (props: Partial<Parameters<typeof ContractBoard>[0]> = {}) =>
  render(<Router><ContractBoard items={fixtures()} board="landscape" q="" today={today} defaultOpen {...props} /></Router>);

beforeEach(() => { localStorage.clear(); fx.items = []; fx.attention = undefined; fx.posted = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("pipeline placement from server state", () => {
  it("places each action agreement exactly once in the three columns", () => {
    const cols = boardColumns(fixtures(), "landscape", "");
    expect(cols.decision.map(c => c.item.id).sort()).toEqual(["ended_no_decision", "unclassified", "working_unsigned"]);
    expect(cols.renewal.map(c => c.item.id)).toEqual(["renewal_due"]);
    expect(cols.drafted.map(c => c.item.id).sort()).toEqual(["new_draft", "renewal_in_progress"]);
    for (const i of fixtures()) expect(placements(i).length).toBeLessThanOrEqual(1);
    expect(Object.keys(cols)).toEqual(["decision", "renewal", "drafted"]);
  });
  it("uses applicableLines for membership, and missing state is unclassified", () => {
    const both = item("both", "renewal_due", { applicableLines: ["landscape", "snow"] });
    const odd = item("odd", undefined as unknown as ContractState, { state: undefined, current: null, applicableLines: ["landscape", "snow"] });
    expect(boardColumns([both, odd], "snow", "").renewal).toHaveLength(1);
    expect(boardColumns([both, odd], "snow", "").decision.map(c => c.item.id)).toEqual(["odd"]);
  });
  it("renders a malformed new draft without a representative season and lets it open", () => {
    mountBoard({ items: [item("nd", "new_draft", { current: null, stateTermId: null })] });
    const card = screen.getByTestId("card-drafted-nd");
    expect(within(card).getByTestId("link-open-drafted-nd").getAttribute("href")).toBe("/dashboard/contracts/nd");
  });
});

describe("card actions", () => {
  it("shows Mark signed only when the server allows it and confirms the status move", async () => {
    fx.items = [item("u", "working_unsigned", { allowedActions: ["open", "mark_signed"], actionTermId: "year1" }), item("d", "new_draft")];
    render(<Router hook={memoryLocation({ path: "/dashboard/contracts" }).hook}><ContractCenterPage /></Router>);
    expect(screen.queryByTestId("button-mark-signed-d")).toBeNull();
    expect(screen.getByTestId("link-open-drafted-d")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-mark-signed-u"));
    fireEvent.click(await screen.findByTestId("button-confirm-mark-signed"));
    await vi.waitFor(() => expect(fx.posted[0]).toEqual(["POST", "/api/contract-center/terms/year1/status", { to: "signed" }, { headers: { "X-Company-Id": "co" } }]));
  });
  it("Renew and Not renewing follow allowedActions", () => {
    const renew = vi.fn();
    mountBoard({ items: [item("e", "ended_no_decision", { allowedActions: ["open", "renew", "not_renewing"] })], onRenew: renew });
    fireEvent.click(screen.getByTestId("button-renew-e"));
    expect(renew).toHaveBeenCalledWith(expect.objectContaining({ id: "e" }));
    expect(screen.getByTestId("button-not-renewing-e")).toBeTruthy();
    expect(screen.getByTestId("text-card-reason-e").textContent).toContain("no renewal or loss recorded");
  });
});

describe("collapse persistence", () => {
  it("toggles and persists", () => {
    render(<Router><ContractBoard items={fixtures()} board="landscape" q="" today={today} /></Router>);
    fireEvent.click(screen.getByTestId("button-toggle-board"));
    expect(screen.queryByTestId("renewals-board")).toBeNull();
    expect(localStorage.getItem("hp-contract-center-board-open")).toBe("0");
    expect(screen.getByTestId("text-board-summary").textContent).toBe("3 need a decision · 1 up for renewal · 2 drafted / sent");
  });
});

describe("accounting bar, segments and table", () => {
  const attention = () => {
    const counts = emptyContractCounts();
    for (const s of CONTRACT_STATES) counts[s] = 1;
    return { total: 10, counts, flagged: { missing_document: 1, active_no_contract: 6 },
      lines: { landscape: { total: 10, counts, actionNeeded: 6 }, snow: { total: 0, counts: emptyContractCounts(), actionNeeded: 0 } }, items: {} };
  };
  it("reconciles, shows badges, dims columns and filters the table by segment", () => {
    fx.items = [...fixtures(), item("pdf", "good", { flags: ["missing_document"] })];
    fx.attention = attention();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    render(<Router hook={memoryLocation({ path: "/dashboard/contracts" }).hook}><ContractCenterPage /></Router>);
    expect(screen.getByTestId("text-accounted").textContent).toContain("10 of 10 accounted for");
    expect(screen.getByTestId("badge-action-landscape").textContent).toBe("6");
    expect(screen.getByTestId("badge-no-contract").textContent).toBe("6 no contract");
    fireEvent.click(screen.getByTestId("legend-decision"));
    expect(screen.getByTestId("column-renewal").getAttribute("data-dimmed")).toBe("true");
    expect(screen.getByTestId("column-decision").getAttribute("data-dimmed")).toBeNull();
    expect(screen.getByTestId("row-contract-unclassified")).toBeTruthy();
    expect(screen.queryByTestId("row-contract-good")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-showing-segment"));
    expect(screen.getByTestId("row-contract-good")).toBeTruthy();
    fireEvent.click(screen.getByTestId("link-view-all-lost"));
    expect(screen.getByTestId("chip-showing-segment").textContent).toContain("Closed");
    expect(screen.getByTestId("row-contract-closed_recently")).toBeTruthy();
  });
  it("shows the unaccounted warning when segments do not sum", () => {
    fx.items = fixtures();
    const a = attention(); a.lines.landscape.total = 12; fx.attention = a;
    render(<Router hook={memoryLocation({ path: "/dashboard/contracts" }).hook}><ContractCenterPage /></Router>);
    expect(screen.getByTestId("text-unaccounted").textContent).toContain("2 unaccounted for");
  });
  it("shows an accounting error with retry instead of list-derived totals when attention fails", () => {
    fx.items = fixtures(); fx.attention = undefined;
    render(<Router hook={memoryLocation({ path: "/dashboard/contracts" }).hook}><ContractCenterPage /></Router>);
    expect(screen.getByTestId("error-accounting")).toBeTruthy();
    expect(screen.getByTestId("button-retry-accounting")).toBeTruthy();
    expect(screen.queryByTestId("text-accounted")).toBeNull();
    expect(screen.queryByTestId("badge-action-landscape")).toBeNull();
    expect(screen.getByTestId("card-renewal-renewal_due")).toBeTruthy();
  });
  it("keeps the server cause for unclassified and uses the source end date for not renewing", () => {
    const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ""}`;
    expect(stateReasonText(t, "unclassified", null, null, today, "Customer record missing")).toContain("Customer record missing");
    expect(stateReasonText(t, "serving_not_renewing", term({ endDate: "2026-11-14" }), "2026-06-01", today)).toContain("Nov 14, 2026");
  });
  it("new chips: Signed in last 60 days and No contract PDF, OR semantics", () => {
    const items = [
      item("sig", "good", { recentSigned: term({ signedAt: "2026-10-01T15:00:00Z" }) }),
      item("old", "good", { recentSigned: term({ signedAt: "2026-08-01T15:00:00Z" }) }),
      item("pdf", "good", { flags: ["missing_document"] }),
    ];
    expect(tableRows(items, "landscape", "", ["signed"], "customer", "asc", { today }).map(i => i.id)).toEqual(["sig"]);
    expect(tableRows(items, "landscape", "", ["signed", "nodoc"], "customer", "asc", { today }).map(i => i.id)).toEqual(["pdf", "sig"]);
    render(<ContractTable items={items} board="landscape" q="" today={today} />);
    expect(screen.getAllByTestId(/^chip-filter-/).map(c => c.textContent)).toEqual(
      ["Needs review", "Up for renewal", "Expired", "Lost", "Signed in last 60 days", "No contract PDF"]);
    expect(within(screen.getByTestId("row-contract-pdf")).getByTestId("chip-missing-document")).toBeTruthy();
  });
});
