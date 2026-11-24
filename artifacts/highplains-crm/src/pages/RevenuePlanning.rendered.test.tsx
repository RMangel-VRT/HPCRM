// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { RevenuePlanProjection, RevenueContractBilling, RevenueContractsByCustomer } from "@workspace/api-client-react";
import i18n from "@/i18n";
import { revenueIncomeFixture, revenueTargetsFixture } from "@/components/revenue-v2/revenueFixtures";
import { csvCell, csvAmount } from "@/components/revenue-v2/revenueContractViews";
import { spreadTarget } from "@/components/revenue-v2/revenueTargetSpread";
import RevenuePage from "./RevenuePage";

const auth = vi.hoisted(() => ({
  user: { id: "planner", activeCompanyId: "company-a", accessRole: "admin" },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/schedulingStatus", () => ({ companyToday: () => "2026-11-23" }));

const signedTerm = { agreementId: "agreement-1", customerName: "Aspen HOA", seasonLabel: "2026–27",
  startDate: "2026-12-01", endDate: "2027-11-30", annualCents: 15000 };
const riskTerm = { ...signedTerm, agreementId: "agreement-2", customerName: "Birch HOA", seasonLabel: "2026",
  startDate: "2026-01-01", endDate: "2026-12-31" };
const singleLine = { customerId: "customer-1", customerName: signedTerm.customerName, agreementId: signedTerm.agreementId,
  termId: "term-1", seasonLabel: "2026", line: "landscape" as const, form: "ours" as const,
  notRenewing: true, lines: [{ component: "Grounds maintenance", isFee: false, amountCents: 12345 }], amountCents: 12345 };
const anotherLine = { ...singleLine, customerId: "customer-2", customerName: riskTerm.customerName,
  agreementId: riskTerm.agreementId, termId: "term-2", notRenewing: false,
  lines: [{ component: "Maintenance", isFee: false, amountCents: 10000 }, { component: "Fuel", isFee: true, amountCents: 555 }],
  amountCents: 10555 };
const billing: RevenueContractBilling = {
  month: "2026-11-01", customers: [singleLine, anotherLine], snowTmCount: 3, yearToDateCents: 50100, fullYearCents: 63300,
  totals: { amountCents: 22900, contractCents: 22900, snowCents: 0, feeCents: 555, landscapeCents: 22345, flatSnowCents: 0 },
};
const monthly = (november = 0) => Array.from({ length: 12 }, (_, i) => i === 10 ? november : 0);
const matrix: RevenueContractsByCustomer = { year: 2026, customers: [{
  customerId: singleLine.customerId, customerName: singleLine.customerName, agreementId: singleLine.agreementId,
  months: monthly(12900), totalCents: 12900, seasonStarts: [{ month: "2026-11-01", seasonLabel: "2026–27" }],
  breakdown: { contract: monthly(12345), snow: monthly(), fee: monthly(555) },
}], monthTotals: monthly(12900), totalCents: 12900, snowTmCount: 3, hasFlatSnow: false };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const requests = vi.fn<typeof fetch>();
const calls = (path: string, method: string) => requests.mock.calls.filter(([input, init]) =>
  String(input).startsWith(path) && init?.method === method);
const numericInput = (id: string) => screen.getByTestId<HTMLInputElement>(id);
let kept = 90;
let snowYears = 5;
let goalCents: number | null = 110_000_000;
let created = false;
let blockSave = false;

function projection(): RevenuePlanProjection {
  const { streams: base } = revenueIncomeFixture(2026, 2026);
  const { streams: planned } = revenueIncomeFixture(2027, 2026);
  planned.contract.forecastCents = kept * 1_000_000;
  return {
    plan: { year: 2027, saved: true, renewalIncreasePct: 3, keptPct: kept, snowYears, irrigationGrowthPct: 0, projectsGrowthPct: 0, extraGrowthPct: 0, goalCents },
    base, planned, baseQboMissing: false,
    bridge: { startCents: 15700, lost: [], lostCents: 0, carriedCents: 15700, signedCents: 4000, expectedCents: 15000, totalCents: 19000 },
    renewalsPending: [{ ...riskTerm, renewalDraft: { status: "sent", annualCents: 16000 } }], laterRenewalsCount: 4,
    pipeline: { acceptedLast12Cents: 17000, sentOpenCents: 60000, winRatePct: 50 },
    renewals: {
      windowDays: 60, atRisk: [{ ...riskTerm, daysLeft: 38, draftStatus: "sent" }],
      inEffect: [{ ...riskTerm, billingType: "monthly_variable" }],
      signed: [{ ...signedTerm, previousAnnualCents: 10000 }],
      notRenewing: [{ ...riskTerm, lastMonth: "2026-11-01", reason: "price" }],
    },
  };
}

function mount(search: string) {
  const route = memoryLocation({ path: `/dashboard/revenue${search}`, record: true });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}>
    <Router hook={route.hook} searchHook={route.searchHook}><RevenuePage /></Router>
  </QueryClientProvider>);
  return route;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  auth.user.accessRole = "admin";
  kept = 90; snowYears = 5; goalCents = 110_000_000; created = false; blockSave = false;
  vi.stubGlobal("fetch", requests);
  requests.mockImplementation(async (input, init) => {
    const url = new URL(String(input), "https://test.invalid");
    switch (url.pathname) {
      case "/api/revenue/plan/2027/projection": return response(projection());
      case "/api/revenue/plan/2027": {
        const patch = JSON.parse(String(init?.body));
        if (patch.keptPct !== undefined) kept = patch.keptPct;
        if (patch.snowYears !== undefined) snowYears = patch.snowYears;
        if (patch.goalCents !== undefined) goalCents = patch.goalCents;
        return response(projection().plan);
      }
      case "/api/revenue/targets/2027/from-plan":
        created = true; return response(revenueTargetsFixture(2027));
      case "/api/revenue/targets/2027":
      case "/api/revenue/targets/2026": {
        const year = Number(url.pathname.split("/").at(-1));
        const targets = revenueTargetsFixture(year);
        if (!created && year === 2027)
          return response({ ...targets, saved: false, annual: Object.fromEntries(Object.keys(targets.annual).map(key => [key, 0])),
            streams: Object.fromEntries(Object.keys(targets.streams).map(key => [key, monthly()])) });
        if (init?.method !== "PUT") return response(targets);
        if (blockSave) return response({ message: "Unable to save" }, 500);
        return response({ ...targets, streams: { ...targets.streams, ...JSON.parse(String(init.body)).streams } });
      }
      case "/api/revenue/income": {
        const year = Number(url.searchParams.get("year"));
        const fixture = revenueIncomeFixture(year, 2026);
        fixture.streams.contract.months = fixture.streams.contract.months.map((m, i) => ({ ...m,
          earnedCents: i === 0 ? 600 : i === 1 ? 300 : i === 2 ? 100 : 0, signedCents: 0, estimatedCents: 0 }));
        fixture.streams.snow.months = fixture.streams.snow.months.map(m => ({ ...m, earnedCents: 0, signedCents: 0, estimatedCents: 0 }));
        return response(fixture);
      }
      case "/api/revenue/qbo/status": return response({ connected: false, years: [], unmappedCount: 0 });
      case "/api/revenue/contracts/billing": return response(billing);
      case "/api/revenue/contracts/by-customer": {
        const line = url.searchParams.get("line");
        if (line === "snow") return response({ ...matrix, customers: [], monthTotals: monthly(), totalCents: 0 });
        if (line === "fee") return response({ ...matrix, customers: [{
          ...matrix.customers[0], months: monthly(555), totalCents: 555, breakdown: { contract: monthly(), snow: monthly(), fee: monthly(555) },
        }], monthTotals: monthly(555), totalCents: 555 });
        return response(matrix);
      }
      case "/api/contract-center/contracts/agreement-1":
        return response({ terms: [{ id: "term-1", seasonLabel: "2026", startDate: "2026-01-01", endDate: "2026-12-31",
          status: "active", billingMonths: [{ month: "2026-11-01", ...singleLine.lines[0] }] }] });
      default: throw new Error(`Unexpected request: ${url.pathname}`);
    }
  });
});
afterEach(() => { cleanup(); requests.mockReset(); vi.unstubAllGlobals(); });

it("saves only the edited plan field with a company guard and displays the refetched total", async () => {
  mount("?tab=plan");
  const planTotal = await screen.findByTestId("text-revenue-plan-total");
  const initial = planTotal.textContent;
  const input = numericInput("input-revenue-plan-keptPct");
  fireEvent.change(input, { target: { value: "80" } });
  fireEvent.blur(input);
  await waitFor(() => expect(planTotal.textContent).not.toBe(initial));
  const save = calls("/api/revenue/plan/2027", "PUT");
  expect(save).toHaveLength(1);
  expect(JSON.parse(String(save[0][1]?.body))).toEqual({ keptPct: 80 });
  expect(new Headers(save[0][1]?.headers).get("X-Company-Id")).toBe("company-a");
  expect((screen.getByTestId("select-revenue-plan-snow-years") as HTMLSelectElement).value).toBe("5");
  fireEvent.change(numericInput("input-revenue-plan-goal"), { target: { value: "1111111" } });
  fireEvent.click(screen.getByTestId("button-revenue-save-goal"));
  await waitFor(() => expect(calls("/api/revenue/plan/2027", "PUT")).toHaveLength(2));
  expect(JSON.parse(String(calls("/api/revenue/plan/2027", "PUT")[1][1]?.body))).toEqual({ goalCents: 111_111_100 });
});

it("saves the next-year plan as target and opens Targets for that year", async () => {
  mount("?tab=plan&year=2026");
  const button = await screen.findByTestId<HTMLButtonElement>("button-revenue-save-as-target");
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  await screen.findByTestId("revenue-targets");
  expect(calls("/api/revenue/targets/2027/from-plan", "POST")).toHaveLength(1);
  expect(screen.getByTestId("button-revenue-target-year-2027").getAttribute("aria-pressed")).toBe("true");
});

it("spreads by the supplied pattern or evenly and keeps exact cents in untouched cells", async () => {
  mount("?tab=targets");
  const annual = await screen.findByTestId<HTMLInputElement>("input-revenue-target-contract-annual");
  fireEvent.change(annual, { target: { value: "101" } });
  const spread = screen.getByTestId<HTMLButtonElement>("button-revenue-spread-contract");
  await waitFor(() => expect(spread.disabled).toBe(false));
  fireEvent.click(spread);
  expect([1, 2, 3, 4].map(i => numericInput(`input-revenue-target-contract-${i}`).value)).toEqual(["61", "30", "10", "0"]);
  expect(annual.value).toBe("101");
  fireEvent.change(numericInput("input-revenue-target-snow-annual"), { target: { value: "13" } });
  fireEvent.click(screen.getByTestId("button-revenue-spread-snow"));
  expect([1, 2, 12].map(i => numericInput(`input-revenue-target-snow-${i}`).value)).toEqual(["2", "1", "1"]);
  fireEvent.change(numericInput("input-revenue-target-extra-2"), { target: { value: "411" } });
  blockSave = true;
  fireEvent.click(screen.getByTestId("button-revenue-save-targets"));
  await waitFor(() => expect(calls("/api/revenue/targets/2026", "PUT")).toHaveLength(1));
  expect(numericInput("input-revenue-target-extra-2").value).toBe("411");
  const { streams } = JSON.parse(String(calls("/api/revenue/targets/2026", "PUT")[0][1]?.body));
  expect(Object.keys(streams)).toEqual(["contract", "snow", "extra"]);
  expect(streams.contract.reduce((a: number, b: number) => a + b, 0)).toBe(10100);
  expect(streams.snow.reduce((a: number, b: number) => a + b, 0)).toBe(1300);
  expect(streams.extra).toEqual(revenueTargetsFixture(2026).streams.extra.map((n, i) => i === 1 ? 41100 : n));
  await waitFor(() => expect(screen.getByTestId<HTMLButtonElement>("button-revenue-save-targets").disabled).toBe(false));
  blockSave = false;
  fireEvent.click(screen.getByTestId("button-revenue-save-targets"));
  await waitFor(() => expect(calls("/api/revenue/targets/2026", "PUT")).toHaveLength(2));
});

it("shows the four renewal categories and their agreement links without office edit controls", async () => {
  auth.user.accessRole = "office";
  mount("?tab=plan");
  await screen.findByTestId("revenue-plan");
  expect(screen.queryByTestId("input-revenue-plan-goal")).toBeNull();
  expect(screen.queryByTestId("button-revenue-save-as-target")).toBeNull();
  expect(screen.queryByTestId("select-revenue-plan-snow-years")).toBeNull();
  expect(screen.queryByTestId("rail-accounts")).toBeNull();
  expect(screen.getByTestId("rail-renewals").textContent).toBe("Renewals1");
  fireEvent.click(screen.getByTestId("rail-renewals"));
  await screen.findByTestId("revenue-renewals");
  expect(screen.getByText(/Within 60 days/)).toBeTruthy();
  expect(screen.getByText("38 days left")).toBeTruthy();
  for (const [kind, id] of [["signed", "agreement-1"], ["notRenewing", "agreement-2"], ["inEffect", "agreement-2"]]) {
    fireEvent.click(screen.getByTestId(`button-revenue-renewals-${kind}`));
    expect(screen.getByTestId(`link-revenue-contract-${id}`).getAttribute("href")).toBe(`/dashboard/contracts/${id}`);
    if (kind === "signed") {
      expect(screen.getByTestId("button-revenue-renewals-signed").textContent).toContain("$150");
      expect(screen.getByTestId("row-revenue-renewal-agreement-1").textContent).toContain("Dec 1, 2026");
    }
  }
  fireEvent.click(screen.getByTestId("rail-targets"));
  const grid = await screen.findByTestId("revenue-targets");
  expect(within(grid).queryAllByRole("spinbutton")).toEqual([]);
  expect(screen.queryByTestId("button-revenue-save-targets")).toBeNull();
  fireEvent.click(screen.getByTestId("button-revenue-target-year-2027"));
  await screen.findByText("No 2027 target yet.");
  expect(screen.queryByTestId("button-revenue-create-target")).toBeNull();
  expect(requests.mock.calls.every(([, init]) => !["PUT", "POST"].includes(init?.method ?? ""))).toBe(true);
});

it("renders exact billing lines, fee and invoice status, and opens the schedule via the agreement", async () => {
  auth.user.accessRole = "office";
  mount("?tab=billing");
  await screen.findByTestId("table-billing");
  expect(screen.getByTestId("text-billing-lines-term-1").textContent).toBe("Grounds maintenance");
  expect(screen.getByTestId("text-billing-amount-term-1").textContent).toBe("$123.45");
  expect(screen.getByTestId("text-billing-invoiced-term-1").textContent).toBe("—");
  expect(screen.getByTestId("text-billing-lines-term-2").textContent).toContain("FuelFee$5.55");
  expect(screen.getByTestId("text-billing-fees").textContent).toBe("$5.55");
  expect(screen.getByTestId("text-billing-ytd").textContent).toBe("$501.00");
  fireEvent.change(screen.getByTestId("input-billing-search"), { target: { value: "Aspen" } });
  expect(screen.getByTestId("text-billing-shown-total").textContent).toBe("$123.45");
  expect(screen.getByTestId("link-billing-contract-term-1").getAttribute("href")).toBe("/dashboard/contracts/agreement-1");
  fireEvent.click(screen.getByTestId("row-billing-term-1"));
  const season = await screen.findByTestId("section-panel-season-term-1");
  expect(season.textContent).toContain("$123.45");
  expect(screen.getByTestId("link-panel-contract-center").getAttribute("href")).toBe("/dashboard/contracts/agreement-1");
  expect(screen.getByTestId("link-panel-customer-billing").getAttribute("href")).toBe("/dashboard/customers/customer-1?tab=billing&view=revenue");
});

it("keeps year navigation, season markers, fee totals and the no-flat-snow case", async () => {
  mount("?year=2026");
  fireEvent.click(await screen.findByTestId("link-revenue-glance-by-customer"));
  await screen.findByTestId("table-customers");
  const cell = screen.getByTestId("cell-customers-agreement-1-11");
  expect(cell.getAttribute("data-season-start")).toBe("true");
  expect(cell.getAttribute("title")).toBe("2026–27 season starts");
  expect(cell.classList.contains("rv-now")).toBe(true);
  fireEvent.click(screen.getByTestId("button-customers-line-fee"));
  await waitFor(() => expect(screen.getByTestId("text-customers-grand-total").textContent).toBe("$6"));
  fireEvent.click(screen.getByTestId("button-customers-line-snow"));
  expect((await screen.findByTestId("status-customers-empty")).textContent).toMatch(/All 3 snow contracts are time & materials/);
  expect((screen.getByTestId("select-customers-year") as HTMLSelectElement).value).toBe("2026");
});

it("spreads without floating-point drift and escapes text separately from numeric CSV cells", () => {
  expect(spreadTarget(101, [6, 3, 1, -5])).toEqual([61, 30, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(spreadTarget(13, [])).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  expect(csvCell('=name,"text"')).toBe(`"'=name,""text"""`);
  expect(csvCell(csvAmount(-12345))).toBe("-123.45");
});
