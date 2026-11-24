import { describe, expect, it } from "vitest";
import { companyToday } from "./companyDay";
import { incomeForecast, type IncomeInputs } from "./incomeStreams";
import { planDefaults } from "./revenuePlanning";
import { revenueEstimatePipeline, revenuePipelineWindow, type PipelineVersion } from "./revenueEstimatePipeline";

const today = companyToday(new Date("2026-12-01T06:59:59Z")); // Still November in Colorado.
const fetchedAt = new Date("2026-11-22T19:00:00Z");
const emptyPipeline = { acceptedLast12Cents: 0, sentOpenCents: 0, winRatePct: null };
const data = (input: Partial<IncomeInputs> = {}): IncomeInputs => ({
  today, bills: [], histories: [], earned: [], fetchedYears: [], mappings: [], plans: [], targets: [], ...input,
});
type Season = IncomeInputs["histories"][number]["terms"][number];
function season(id: string, fields: Partial<Season> = {}): Season {
  return { id, status: "signed", startDate: "2026-01-01", endDate: "2026-11-30", line: "landscape",
    annualPriceCents: 12000, seasonLabel: id, nonRenewalOn: null, nonRenewalReason: null, renewedFromTermId: null, ...fields };
}
function agreement(id: string, ...terms: Season[]) {
  return { id, customerId: id, customerName: id, terms };
}
function bill(termId: string, month: string, amountCents: number, fields: Partial<IncomeInputs["bills"][number]> = {}) {
  return { agreementId: termId, customerId: termId, customerName: termId, termId, stream: "contract" as const,
    form: "ours" as const, isFee: false, month, amountCents, ...fields };
}

describe("income forecast", () => {
  it("uses one Colorado cutoff for every stream and distinguishes missing pulls from empty pulls", () => {
    const inputs = data({
      bills: [bill("a", "2026-10-01", 100), bill("a", "2026-11-01", 200), bill("a", "2025-12-01", 300),
        bill("s", "2025-12-01", 400, { stream: "snow", isFee: true })],
      fetchedYears: [{ year: 2026, fetchedAt }],
      mappings: [{ qboAccountId: "maintenance", stream: "contract" }, { qboAccountId: "out", stream: "exclude" },
        { qboAccountId: "unassigned", stream: null }],
      earned: [
        { qboAccountId: "maintenance", month: "2026-10-01", amountCents: 500 },
        { qboAccountId: "maintenance", month: "2026-11-01", amountCents: 9000 },
        { qboAccountId: "out", month: "2026-10-01", amountCents: 99999 },
        { qboAccountId: "unassigned", month: "2026-10-01", amountCents: 120 },
        { qboAccountId: "unassigned", month: "2026-09-01", amountCents: -20 },
        { qboAccountId: "no-record", month: "2026-10-01", amountCents: 30 },
        { qboAccountId: "maintenance", month: "2025-12-01", amountCents: 9000 },
      ],
      targets: [{ stream: "contract", month: "2026-01-01", amountCents: 0 },
        { stream: "snow", month: "2026-11-01", amountCents: 92 }],
    });
    const forecast = incomeForecast(inputs), result = forecast.income(2026);
    expect(today).toBe("2026-11-30");
    expect(result).toMatchObject({ closedThrough: "2026-10-01", qboMissing: false, qbo: { loaded: true, fetchedAt, unmappedCount: 2 } });
    expect(result.streams.contract.months.slice(9, 11)).toEqual([
      { month: "2026-10-01", earnedCents: 500, signedCents: 0, estimatedCents: 0 },
      { month: "2026-11-01", earnedCents: null, signedCents: 200, estimatedCents: 0 },
    ]);
    expect(result.streams.projects.months[9].earnedCents).toBe(0);
    expect(result.streams.projects.targetCents).toBeNull();
    expect(result.streams.contract.targetCents).toBe(0);
    expect(result.streams.other).toMatchObject({ forecastCents: 130, targetCents: null });
    expect(result.totals).toEqual({ earnedCents: 630, signedCents: 200, estimatedCents: 0, forecastCents: 830, targetCents: 92, lastYearCents: 700 });
    expect(result.targetMonths).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 92, 0]);
    expect(forecast.income(2025)).toMatchObject({
      closedThrough: "2025-12-01", qboMissing: true, qbo: { loaded: false, fetchedAt: null, unmappedCount: 0 }, targetMonths: null,
      streams: { contract: { signedCents: 300, earnedCents: null }, snow: { signedCents: 400 }, projects: { signedCents: 0, earnedCents: null } },
    });
    expect(forecast.income(2025)).not.toHaveProperty("concentration");
    expect(forecast.income(2027)).toMatchObject({ closedThrough: null, qboMissing: false });
    const nextDay = incomeForecast({ ...inputs, today: companyToday(new Date("2026-12-01T07:00:00Z")) }).income(2026);
    expect(nextDay.closedThrough).toBe("2026-11-01");
    expect(nextDay.streams.contract.months[10]).toMatchObject({ earnedCents: 9000, signedCents: 0 });
  });

  it("uses the last counted end, includes actual fees but not projected fees, and suppresses recorded losses", () => {
    const forecast = incomeForecast(data({
      histories: [
        agreement("earlier", season("earlier", { startDate: "2024-03-15", endDate: "2026-10-01", annualPriceCents: null })),
        agreement("ending", season("ending"), season("next-unworked", { status: "sent", startDate: "2026-12-01", endDate: "2027-11-30" })),
        agreement("future", season("future"), season("successor", { status: "active", startDate: "2027-01-01", endDate: "2027-08-31" })),
        agreement("real-zero", season("real-zero", { annualPriceCents: 0 })),
        agreement("not-renewing", season("not-renewing", { nonRenewalOn: "2026-10-12" })),
        agreement("lost-linked", season("lost-linked"), season("linked", { status: "lost", renewedFromTermId: "lost-linked",
          startDate: "2026-12-01", endDate: "2027-11-30" })),
        agreement("lost-unlinked", season("lost-unlinked"), season("unlinked", { status: "lost",
          startDate: "2026-12-01", endDate: "2027-11-30" })),
        agreement("open-legacy", season("open-legacy", { status: "up_for_renewal" })),
      ],
      bills: [
        bill("earlier", "2024-02-01", 999999), bill("earlier", "2024-03-01", 6000),
        bill("earlier", "2025-02-01", 6000), bill("earlier", "2025-03-01", 999999),
        bill("earlier", "2024-03-01", 999999, { isFee: true }), bill("real-zero", "2026-10-01", 12000),
        bill("not-renewing", "2026-11-01", 500), bill("ending", "2026-11-01", 250, { isFee: true }),
        bill("successor", "2027-01-01", 1250),
      ],
      plans: [{ ...planDefaults(2026), renewalIncreasePct: 2.5, keptPct: 80, saved: true }],
    }));
    expect(forecast.income(2026).streams.contract.months.slice(10)).toEqual([
      { month: "2026-11-01", earnedCents: null, signedCents: 750, estimatedCents: 820 },
      { month: "2026-12-01", earnedCents: null, signedCents: 0, estimatedCents: 1640 },
    ]);
    expect(forecast.income(2027).streams.contract.months[0]).toMatchObject({ signedCents: 1250, estimatedCents: 1854 });
    expect(forecast.income(2027).streams.contract.months[8].estimatedCents).toBe(2781);
  });

  it("averages only known historical snow and grows an open prior month under its own plan", () => {
    const forecast = incomeForecast(data({
      fetchedYears: [2023, 2025, 2026].map(year => ({ year, fetchedAt })),
      mappings: [{ qboAccountId: "snow", stream: "snow" }, { qboAccountId: "projects", stream: "projects" }],
      earned: [
        ...[100, 10000, 300, 40000].map((amountCents, i) => ({ qboAccountId: "snow", month: `${2023 + i}-12-01`, amountCents })),
        { qboAccountId: "projects", month: "2025-12-01", amountCents: 10000 },
      ],
      plans: [
        { ...planDefaults(2026), projectsGrowthPct: 10, saved: true },
        { ...planDefaults(2027), projectsGrowthPct: 20, saved: true },
      ],
      histories: [agreement("flat", season("flat", { line: "snow", endDate: "2026-11-30" }))],
    }));
    expect(forecast.income(2026).streams.snow.months[11].estimatedCents).toBe(927 + 200);
    expect(forecast.income(2026).streams.snow.months[0].estimatedCents).toBe(0);
    expect(forecast.income(2027).streams.snow.months[11].estimatedCents).toBe(927 + 300);
    expect(forecast.income(2027).streams.projects.months[11].estimatedCents).toBe(13200);
    expect(forecast.income(2028).streams.projects.lastYearCents).toBe(13200);
  });

  it("ties trends and seasonality to the same cents and attributes concentration to agreement owners", () => {
    const forecast = incomeForecast(data({
      bills: [bill("a", "2026-09-01", 50, { customerId: "parent", form: "theirs", isFee: true }),
        bill("b", "2026-11-01", 25, { customerId: "parent" }), bill("c", "2026-11-01", 25, { customerId: "branch" }),
        bill("s", "2026-10-01", 100, { stream: "snow" })],
      fetchedYears: [2025, 2026].map(year => ({ year, fetchedAt })),
      mappings: [{ qboAccountId: "s", stream: "snow" }],
      earned: [
        { qboAccountId: "s", month: "2025-01-01", amountCents: 20 },
        { qboAccountId: "s", month: "2026-10-01", amountCents: 50 },
        { qboAccountId: "s", month: "2026-11-01", amountCents: 70 },
        { qboAccountId: "o", month: "2026-09-01", amountCents: 70 },
        { qboAccountId: "o", month: "2026-10-01", amountCents: -70 },
      ],
    }));
    const current = forecast.income(2026), trends = forecast.trends(2025, 2026);
    expect(current.concentration).toEqual({
      top5: [{ customerId: "parent", customerName: "a", cents: 75, shareOfContractPct: 75 },
        { customerId: "branch", customerName: "c", cents: 25, shareOfContractPct: 25 }],
      theirFormSharePct: 25, snowSharePct: 50, snowRange: { minCents: 20, maxCents: 50, years: [2025, 2026] },
    });
    expect(trends.years[1]).toMatchObject({
      year: 2026, totals: { forecastCents: current.totals.forecastCents, lastYearCents: 20 }, recurringSharePct: 50,
      streams: { other: { forecastCents: 0, lastYearCents: 0 } },
    });
    expect(trends.monthsByStream.other?.[1].months.slice(8, 10)).toEqual([70, -70]);
    expect(trends.monthsByStream.all[1].months.reduce((sum, n) => sum + n, 0)).toBe(current.totals.forecastCents);
    expect(incomeForecast(data()).income(2026).concentration?.snowRange).toEqual({ years: [], minCents: null, maxCents: null });
  });

  it("computes the bridge, keeps draft amounts informational, and rounds exactly five target streams", () => {
    const forecast = incomeForecast(data({
      histories: [
        agreement("lost", season("lost", { startDate: "2024-01-01", endDate: "2027-02-28",
          nonRenewalOn: "2026-10-01", nonRenewalReason: "price" })),
        agreement("pending", season("pending", { endDate: "2026-12-31" })),
        agreement("later", season("later", { endDate: "2027-07-31" })),
      ],
      bills: [bill("lost", "2026-01-01", 180), bill("lost", "2027-02-01", 250), bill("later", "2027-01-01", 199)],
    }));
    const draft = { agreementId: "pending", customerId: "pending", customerName: "pending", line: "landscape" as const,
      termId: "draft", seasonLabel: "2027", endDate: "2027-12-31", daysLeft: 360, renewalDraftStatus: "sent" as const,
      state: "renewal_in_progress" as const, stateReason: "pending",
      renewalDraft: { sourceTermId: "pending", status: "sent" as const, annualCents: 40000 } };
    const plan = forecast.planProjection(2027, [draft], emptyPipeline);
    expect(plan.bridge).toEqual({
      startCents: 180, lost: [{ agreementId: "lost", customerName: "lost", seasonLabel: "lost", reason: "price", lastMonth: "2027-02-01", cents: 180 }],
      lostCents: 180, carriedCents: 0, signedCents: 449, expectedCents: 17 * 927, totalCents: 449 + 17 * 927,
    });
    expect(plan.laterRenewalsCount).toBe(1);
    expect(plan.renewalsPending).toMatchObject([{ agreementId: "pending", annualCents: 12000, renewalDraft: { status: "sent", annualCents: 40000 } }]);
    expect(forecast.planProjection(2027, [{ ...draft, renewalDraft: { ...draft.renewalDraft, sourceTermId: "obsolete" } }], emptyPipeline)
      .renewalsPending[0].renewalDraft).toBeNull();
    const targets = forecast.targetAmountsFromPlan(2027);
    expect(Object.keys(targets)).toEqual(["contract", "snow", "irrigation", "projects", "extra"]);
    expect(targets.contract.slice(0, 3)).toEqual([1100, 1200, 900]);
  });
});

describe("estimate pipeline", () => {
  it("counts trailing Colorado decisions and only the current accepted or sent status", () => {
    const date = "2026-11-23", { from, to } = revenuePipelineWindow(date);
    expect({ from, to }).toEqual({ from: "2025-11-24", to: "2026-11-24" });
    const row = (status: PipelineVersion["status"], acceptedOn: string | null, declinedAt: string | null, frozenSubtotalCents = 120) =>
      ({ status, acceptedOn, declinedAt: declinedAt ? new Date(declinedAt) : null, frozenSubtotalCents });
    const pipeline = revenueEstimatePipeline([
      row("accepted", "2025-11-24", null), row("accepted", "2026-11-23", null),
      row("accepted", "2025-11-23", null), row("accepted", "2026-11-24", null),
      row("declined", null, "2025-11-24T06:59:59Z"), row("declined", null, "2025-11-24T07:00:00Z"),
      row("declined", null, "2026-11-24T06:59:59Z"), row("declined", null, "2026-11-24T07:00:00Z"),
      row("superseded", date, null), row("sent", null, null, 900),
      row("void", date, null), row("draft", date, null),
    ], date);
    expect(pipeline).toEqual({ acceptedLast12Cents: 240, sentOpenCents: 900, winRatePct: 50 });
    expect(revenueEstimatePipeline([], date)).toEqual(emptyPipeline);
    expect(revenueEstimatePipeline([row("declined", null, "2026-11-24T06:00:00Z")], date).winRatePct).toBe(0);
  });
});
