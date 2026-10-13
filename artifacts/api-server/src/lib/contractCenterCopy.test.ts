import { describe, expect, it } from "vitest";
import { planLegacyCopy, assumedEnd, type CopyInput } from "./contractCenterCopy";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";

// Plain input fixtures intentionally omit irrelevant legacy metadata.
export function fixture(overrides: Partial<CopyInput> = {}): CopyInput {
  return {
    companyId: "company", contracts: [contract("c1")], customers: [customer("a")],
    services: [], monthlyAmounts: Array.from({ length: 12 }, (_, i) => amount("c1", i + 1, 100)), documents: [], history: [],
    servicePlans: [], rateSheets: [], managementCompanies: [], legacySources: [],
    rateCard: RATE_CARD_DEFAULTS.map(({ key, ...r }, i) => ({ ...r, id: `rate${i}`, companyId: "company",
      rateKey: key, priceText: r.priceText ?? null, minimum: r.minimum ?? null, active: true, sortOrder: i,
      createdAt: new Date(), updatedAt: new Date() })),
    ...overrides,
  };
}
export function contract(id: string, overrides = {}) {
  return { id, companyId: "company", customerId: "a", serviceType: "Maintenance",
    startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T07:00:00Z"),
    status: "active", billingPattern: "12-of-12", notes: null, po: null,
    hasMobilizationFee: false, mobilizationFeeAmount: 0, ...overrides } as CopyInput["contracts"][number];
}
export function customer(id: string, overrides = {}) {
  return { id, companyId: "company", name: id, street: "1 Main", city: "Denver", state: "CO", zip: "80000",
    propertyManagementCompanyId: null, managementCompany: null, ...overrides } as CopyInput["customers"][number];
}
export function amount(contractId: string, month: number, value: number) {
  return { id: `${contractId}-${month}`, companyId: "company", contractId, month, amount: value } as CopyInput["monthlyAmounts"][number];
}
function service(contractId: string, serviceType: string, count = 2, overrides = {}) {
  return { id: `${contractId}-${serviceType}`, companyId: "company", contractId, serviceType,
    annualCount: count, monthlyDistribution: Array(12).fill(1), serviceParameters: {}, notes: null,
    ...overrides } as CopyInput["services"][number];
}
function plan(year: number, serviceCategory: string, expectedQuantity: number, sourceContractRef: string | null = null, overrides = {}) {
  return { id: `${year}-${serviceCategory}-${sourceContractRef}`, companyId: "company", customerId: "a",
    year, serviceCategory, expectedQuantity, sourceContractRef, notes: null, ...overrides } as CopyInput["servicePlans"][number];
}
const first = (input: CopyInput) => planLegacyCopy(input).customers[0].agreements[0].terms[0];
function document(contractId: string, overrides = {}) {
  return { id: `doc-${contractId}`, companyId: "company", contractId, filename: "signed.pdf",
    storageObjectPath: `/objects/${contractId}`, fileSize: 1000, mimeType: "application/pdf",
    version: 1, uploadedBy: "actor", uploadedAt: new Date("2026-01-01Z"), ...overrides } as CopyInput["documents"][number];
}
const twelve = (id = "c1", value = 100000) => Array.from({ length: 12 }, (_, i) => amount(id, i + 1, value));
describe("copy date safety", () => {
  it.each([
    ["0205-11-01", "2026-10-31"],
    ["2020-01-01", "2025-01-31"],
  ])("skips unsafe billing expansion while preserving annual sum: %s", (start, end) => {
    const term = first(fixture({ contracts: [contract("c1", { startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`) })] }));
    expect(term.billingMonths).toEqual([]);
    expect(term.term.annualPriceCents).toBe(1200);
    expect(term.report.flags).toContain(`Contract dates look wrong (${start} – ${end}); fix them in the old system before copying`);
  });
  it("allows exactly 60 inclusive months", () => {
    const term = first(fixture({ contracts: [contract("c1", { startDate: new Date("2020-01-01Z"), endDate: new Date("2024-12-31Z") })] }));
    expect(term.billingMonths).toHaveLength(60);
    expect(term.term.annualPriceCents).toBe(1200);
  });
});

describe("production-preview copy rules", () => {
  it("repeats a two-year annual payment pattern without inflating annual price", () => {
    const t = first(fixture({ contracts: [contract("c1", { startDate: new Date("2024-04-01Z"), endDate: new Date("2026-03-31Z") })], monthlyAmounts: twelve() }));
    expect(t.billingMonths).toHaveLength(24);
    expect(t.term).toMatchObject({ annualPriceCents: 1200000, billingType: "equal_monthly" });
    expect(t.report.flags).toEqual([]);
  });
  it("bills all twelve months for Apr–Oct seasonal service", () => {
    const t = first(fixture({ contracts: [contract("c1", { startDate: new Date("2026-04-01Z"), endDate: new Date("2026-10-31Z"), billingPattern: "seasonal" })], monthlyAmounts: twelve() }));
    expect(t.billingMonths).toHaveLength(12);
    expect(t.billingMonths[0].month).toBe("2026-04-01");
    expect(t.billingMonths[11].month).toBe("2027-03-01");
    expect(t.term).toMatchObject({ annualPriceCents: 1200000, billingType: "equal_monthly", notes: "Old billing pattern: seasonal" });
    expect(t.report.flags).toEqual([]);
  });
  it("preserves MSI unequal totals instead of trusting the old billing pattern", () => {
    const t = first(fixture({ monthlyAmounts: twelve().map((a, i) => ({ ...a, amount: i < 4 ? 50000 : 100000 })) }));
    expect(t.term).toMatchObject({ billingType: "monthly_variable", annualPriceCents: 1000000 });
    expect(t.billingMonths.map(a => a.amountCents)).toEqual([50000, 50000, 50000, 50000, ...Array(8).fill(100000)]);
  });
  it("bills sixteen inclusive calendar months and flags the duration", () => {
    const t = first(fixture({ contracts: [contract("c1", { startDate: new Date("2024-12-01Z"), endDate: new Date("2026-03-31Z") })], monthlyAmounts: twelve() }));
    expect(t.billingMonths).toHaveLength(16);
    expect(t.term.annualPriceCents).toBe(1200000);
    expect(t.report.flags).toEqual(["Contract runs 16 months (not whole years); check the dates"]);
  });
  it.each(["path", "name-size"])("merges matching dates with shared %s evidence, including scope, rates and snow notes", identity => {
    const input = fixture({
      contracts: [contract("c1"), contract("chemical", { serviceType: "Chemical" }), contract("s1", { serviceType: "Snow" })],
      monthlyAmounts: [...twelve(), amount("s1", 11, 99000)],
      documents: [document("c1"), document("s1", { storageObjectPath: identity === "path" ? "/objects/c1" : "/objects/other", uploadedAt: new Date("2025-12-01Z") })],
      services: [service("c1", "mowing"), service("s1", "snow_removal"), service("s1", "mowing")],
    });
    input.rateCard.push({ ...input.rateCard[0], id: "general", rateKey: "general_custom", line: "general" });
    input.rateCard.push({ ...input.rateCard[0], id: "retired", rateKey: "retired_custom", active: false });
    const result = planLegacyCopy(input);
    const agreement = result.customers[0].agreements[0];
    const t = agreement.terms[0];
    expect(result.report.summary).toMatchObject({ agreements: 1, terms: 1, documents: 1, billingMonths: 12 });
    expect(agreement.agreement.line).toBe("both");
    expect(result.report.customers[0].agreements[0].line).toBe("both");
    expect(t.report.legacyContractIds).toEqual(["c1", "chemical", "s1"]);
    expect(t.term).toMatchObject({ annualPriceCents: 1200000, billingType: "equal_monthly" });
    expect(t.documents[0].createdAt).toEqual(new Date("2025-12-01Z"));
    expect(new Set(t.rates.map(r => r.line))).toEqual(new Set(["landscape", "irrigation", "snow", "general"]));
    expect(t.rates).toHaveLength(44);
    expect(t.rates.some(r => r.rateKey === "retired_custom")).toBe(false);
    expect(t.scope.find(s => s.serviceKey === "mowing")?.quantity).toBe(4);
    expect(t.term.notes).toContain("Old snow monthly amount, Nov: $990.00");
    expect(t.report.flags).toContain("Snow contract had monthly amounts entered, but none of the current snow contracts are flat-rate. Check whether they belong on the landscape contract.");
    expect(t.report.flags.some(f => /signed document|kept separate|merge into/.test(f))).toBe(false);
  });
  it.each(["different", "missing", "one-missing"])("keeps same dates with %s documents separate with two-sided flags", kind => {
    const docs = kind === "missing" ? [] : [document("c1"), ...(kind === "different" ? [document("s1", { filename: "snow.pdf" })] : [])];
    const result = planLegacyCopy(fixture({ contracts: [contract("c1"), contract("s1", { serviceType: "Snow" })], documents: docs }));
    expect(result.customers[0].agreements).toHaveLength(2);
    for (const a of result.customers[0].agreements) expect(a.terms[0].report.flags).toContain(`Same dates as the ${a.agreement.line === "snow" ? "landscape" : "snow"} contract but a different or missing signed document; kept separate.`);
  });
  it.each([true, false])("flags different dates only when documents are shared (%s)", shared => {
    const result = planLegacyCopy(fixture({
      contracts: [contract("c1"), contract("s1", { serviceType: "Snow", startDate: new Date("2025-11-01Z") })],
      documents: [document("c1"), document("s1", { filename: shared ? "signed.pdf" : "snow.pdf" })],
    }));
    expect(result.customers[0].agreements).toHaveLength(2);
    for (const a of result.customers[0].agreements) {
      const warnings = a.terms[0].report.flags.filter(f => f.includes("signed document"));
      expect(warnings).toHaveLength(shared ? 1 : 0);
      if (shared) expect(warnings[0]).toBe(`Shares a signed document with the ${a.agreement.line === "snow" ? "landscape" : "snow"} contract but the dates differ (${a.agreement.line === "snow" ? "2026-01-01" : "2025-11-01"} – 2026-12-31); check the dates.`);
    }
  });
  it("never bills current legacy snow monthly amounts, even zero-valued entries", () => {
    const t = first(fixture({ contracts: [contract("c1", { serviceType: "Snow" })], monthlyAmounts: [amount("c1", 11, 100000), amount("c1", 12, 0)] }));
    expect(t.billingMonths).toEqual([]);
    expect(t.term).toMatchObject({ billingType: "time_and_materials", annualPriceCents: null });
    expect(t.term.notes).toContain("Old snow monthly amount, Nov: $1000.00");
    expect(t.term.notes).toContain("Old snow monthly amount, Dec: $0.00");
    expect(t.report.flags).toEqual(["Snow contract had monthly amounts entered, but none of the current snow contracts are flat-rate. Check whether they belong on the landscape contract."]);
  });
  it("uses distinct operator, ATV and snowblower overrides with unchanged card baselines", () => {
    const result = planLegacyCopy(fixture({ contracts: [contract("c1"), contract("s1", { serviceType: "Snow" })],
      rateSheets: [{ id: "s", companyId: "company", customerId: "a", operatorLabor: 7500, snowBlower: 14000, atv: 13000 } as CopyInput["rateSheets"][number]] }));
    const rates = result.customers[0].agreements.flatMap(a => a.terms[0].rates);
    expect(rates.find(r => r.rateKey === "rate_operator_labor")).toMatchObject({ priceCents: 7500, cardPriceCents: null });
    expect(rates.find(r => r.rateKey === "rate_snowblower")).toMatchObject({ priceCents: 14000, cardPriceCents: 13500 });
    expect(rates.find(r => r.rateKey === "rate_atv")).toMatchObject({ priceCents: 13000, cardPriceCents: 13500 });
  });
  it.each(["landscape", "snow"])("flags a missing applicable %s rate, including inactive rows and zero overrides", line => {
    const input = fixture({ contracts: [contract("c1", { serviceType: line === "snow" ? "Snow" : "Maintenance" })],
      rateSheets: [{ id: "s", companyId: "company", customerId: "a", operatorLabor: 0, snowBlower: 0 } as CopyInput["rateSheets"][number]] });
    const key = line === "snow" ? "rate_snowblower" : "rate_operator_labor";
    input.rateCard = input.rateCard.filter(r => r.rateKey !== key);
    expect(first(input).report.flags).toContain(`Rate sheet value for ${key} skipped; add the missing standard rates in Settings first`);
    expect(first(input).report.flags).not.toContain(`Rate sheet value for ${line === "snow" ? "rate_operator_labor" : "rate_snowblower"} skipped; add the missing standard rates in Settings first`);
    input.rateCard.push({ ...fixture().rateCard.find(r => r.rateKey === key)!, active: false });
    expect(first(input).report.flags).toContain(`Rate sheet value for ${key} skipped; add the missing standard rates in Settings first`);
  });
  it("ignores invalid months, counts entered zeros as present, and reports partial inputs", () => {
    const t = first(fixture({ monthlyAmounts: [amount("c1", 0, 400), amount("c1", 13, 900), amount("c1", 2, 0)] }));
    expect(t.billingMonths).toEqual([]);
    expect(t.term).toMatchObject({ annualPriceCents: 0, billingType: "monthly_variable" });
    expect(t.report.flags).toEqual(["Monthly amount with invalid month number 0", "Monthly amount with invalid month number 13", "Only 1 of 12 monthly amounts entered"]);
    const allZero = first(fixture({ monthlyAmounts: twelve("c1", 0) }));
    expect(allZero.term).toMatchObject({ annualPriceCents: 0, billingType: "equal_monthly" });
    expect(allZero.report.flags).toEqual([]);
    const absent = first(fixture({ monthlyAmounts: [amount("c1", 13, 1)] }));
    expect(absent.term.annualPriceCents).toBeNull();
    expect(absent.report.flags).toContain("No monthly amounts entered");
  });
  it("combines ordered histories and status precedence, then builds Both renewal chains", () => {
    const input = fixture({
      contracts: [contract("c1", { status: "ended" }), contract("s1", { serviceType: "Snow" }),
        contract("c0", { status: "ended", startDate: new Date("2025-01-01Z"), endDate: new Date("2025-12-31Z") }),
        contract("s0", { status: "ended", serviceType: "Snow", startDate: new Date("2025-01-01Z"), endDate: new Date("2025-12-31Z") })],
      documents: [document("c1"), document("s1"), document("c0", { filename: "2025.pdf" }), document("s0", { filename: "2025.pdf" })],
      history: [
        { id: "h2", contractId: "c1", oldStatus: "active", newStatus: "ended", changedBy: "actor", createdAt: new Date("2026-02-01Z") },
        { id: "h1", contractId: "s1", oldStatus: null, newStatus: "active", changedBy: "actor", createdAt: new Date("2026-01-01Z") },
      ],
    });
    const before = JSON.stringify(input);
    const result = planLegacyCopy(input);
    const terms = result.customers[0].agreements[0].terms;
    expect(result.customers[0].agreements[0].agreement.line).toBe("both");
    expect(terms.map(t => t.term.status)).toEqual(["renewed", "active"]);
    expect(terms.map(t => t.renewedFromIndex)).toEqual([null, 0]);
    expect(terms[1].history.map(h => h.createdAt.toISOString())).toEqual(["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"]);
    expect(terms[1].report.flags).not.toContain("Old status was ended; confirm whether it was lost or just expired");
    expect(JSON.stringify(input)).toBe(before);
    input.contracts.reverse(); input.documents.reverse(); input.history.reverse();
    expect(planLegacyCopy(input)).toEqual(result);
  });
});

describe("legacy copy planner", () => {
  it("combines matching Maintenance/Chemical/Irrigation into one term and scope", () => {
    const result = planLegacyCopy(fixture({
      contracts: [contract("c1"), contract("c2", { serviceType: "Chemical" }), contract("c3", { serviceType: "Irrigation" })],
      services: [service("c1", "mowing"), service("c2", "chemical"), service("c3", "irrigation_open")],
    }));
    expect(result.report.summary).toMatchObject({ customers: 1, agreements: 1, terms: 1, scopeLines: 3 });
    expect(result.customers[0].agreements[0].terms[0].report.legacyContractIds).toEqual(["c1", "c2", "c3"]);
  });
  it("keeps landscape/snow separate and flags both", () => {
    const result = planLegacyCopy(fixture({ contracts: [contract("c1"), contract("snow", { serviceType: "Snow" })] }));
    expect(result.report.summary.agreements).toBe(2);
    for (const a of result.customers[0].agreements) expect(a.terms[0].report.flags).toContain(`Same dates as the ${a.agreement.line === "snow" ? "landscape" : "snow"} contract but a different or missing signed document; kept separate.`);
    expect(result.customers[0].agreements[1].terms[0].term).toMatchObject({ billingType: "time_and_materials", notes: "Old billing pattern: 12-of-12" });
  });
  it("links ordered distinct seasons and maps ended to renewed/lost", () => {
    const result = planLegacyCopy(fixture({ contracts: [
      contract("new", { startDate: new Date("2025-11-01Z"), endDate: new Date("2026-10-31Z") }),
      contract("old", { startDate: new Date("2024-11-01Z"), endDate: new Date("2025-10-31Z"), status: "ended" }),
    ] }));
    const terms = result.customers[0].agreements[0].terms;
    expect(terms.map(t => t.term.status)).toEqual(["renewed", "active"]);
    expect(terms.map(t => t.term.seasonLabel)).toEqual(["2024–25", "2025–26"]);
    expect(terms[1].renewedFromIndex).toBe(0);
    const lost = first(fixture({ contracts: [contract("c1", { status: "ended" })] }));
    expect(lost.term.status).toBe("lost");
    expect(lost.report.flags).toContain("Old status was ended; confirm whether it was lost or just expired");
  });
  it.each(["00", "06", "07"])("keeps UTC date at %s hours", hour => {
    expect(first(fixture({ contracts: [contract("c1", { startDate: new Date(`2025-11-01T${hour}:00:00Z`) })] })).term.startDate).toBe("2025-11-01");
  });
  it("assumes twelve calendar months minus one day including leap days", () => {
    const term = first(fixture({ contracts: [contract("c1", { endDate: null })] }));
    expect(term.term.endDate).toBe("2026-12-31");
    expect(term.report.flags).toContain("Had no end date; assumed 12 months");
    expect(assumedEnd("2024-02-29")).toBe("2025-02-27");
    expect(assumedEnd("2023-03-01")).toBe("2024-02-29");
  });
  it("places November through October and derives price from summed cents", () => {
    const term = first(fixture({
      contracts: [contract("c1", { startDate: new Date("2025-11-01Z"), endDate: new Date("2026-10-31Z") })],
      monthlyAmounts: Array.from({ length: 12 }, (_, i) => amount("c1", i + 1, 394500)),
    }));
    expect(term.billingMonths.map(m => m.month)).toEqual(["2025-11-01", "2025-12-01", ...Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}-01`)]);
    expect(term.term.annualPriceCents).toBe(4734000);
  });
  it("maps irrigation_close and flags the assumption", () => {
    const term = first(fixture({ services: [service("c1", "irrigation_close")] }));
    expect(term.scope[0].serviceKey).toBe("irrigation_winterization");
    expect(term.report.flags).toContain("Mapped irrigation_close to irrigation_winterization; check it");
  });
  it("overrides skid loader but preserves card prices, including text and inactive filtering", () => {
    const input = fixture({ contracts: [contract("c1", { serviceType: "Snow" })],
      rateSheets: [{ id: "sheet", companyId: "company", customerId: "a", skidSteer: 22500 } as CopyInput["rateSheets"][number]] });
    input.rateCard[0].active = false;
    const term = first(input);
    expect(term.rates.find(r => r.rateKey === "rate_skid_loader")).toMatchObject({ priceCents: 22500, cardPriceCents: 24500 });
    expect(term.rates.find(r => r.rateKey === "rate_holiday")).toMatchObject({ priceText: "1.5x Normal Rates", cardPriceText: "1.5x Normal Rates" });
    expect(term.rates.some(r => r.rateKey === "rate_general_labor")).toBe(false);
  });
  it("skips already-linked contracts with no duplicate plans", () => {
    const input = fixture({ legacySources: [{ id: "link", companyId: "company", legacyContractId: "c1" } as CopyInput["legacySources"][number]] });
    expect(planLegacyCopy(input).report.summary).toMatchObject({ terms: 0, alreadyCopied: 1 });
    expect(planLegacyCopy(input).customers).toEqual([]);
  });
  it("keeps clean terms free of spurious null-contact flags", () => {
    const term = first(fixture());
    expect(term.term).toMatchObject({ needsReview: false, reviewNote: null, legalName: null, projectContact: null, contactPhone: null, contactEmail: null });
    expect(term.report.flags).toEqual([]);
  });
  it("sums duplicate quantities/spreads, preserves details/notes, flags unknown mappings", () => {
    const term = first(fixture({ contracts: [contract("c1"), contract("c2")], services: [
      service("c1", "pet_station", 10, { serviceParameters: { stationCount: 4, visitsPerWeek: 2 }, notes: "first" }),
      service("c2", "pet_station", 20, { notes: "second" }),
      service("c1", "surprise", 1),
    ] }));
    expect(term.scope.find(s => s.serviceKey === "pet_station")).toMatchObject({
      quantity: 30, monthSpread: Array(12).fill(2), details: { stations: 4, visitsPerWeek: 2 }, notes: "first\nsecond",
    });
    expect(term.report.flags).toEqual(expect.arrayContaining(["Combined two pet_station lines", "Unknown service type surprise"]));
  });
  it("avoids derived-plan duplication, flags mismatches, adds only missing source-less applicable plans and counts ignored years", () => {
    const termInput = fixture({ services: [service("c1", "mowing", 26)], servicePlans: [
      plan(2026, "mowing", 27, "c1"), plan(2026, "mowing", 10),
      plan(2026, "aeration", 1), plan(2026, "snow_removal", 8),
      plan(2026, "chemical", 2, "foreign-contract"), plan(2030, "cleanups", 2),
    ] });
    const result = planLegacyCopy(termInput);
    const term = result.customers[0].agreements[0].terms[0];
    expect(term.report.scope).toEqual([{ serviceKey: "mowing", quantity: 26 }, { serviceKey: "aeration", quantity: 1 }]);
    expect(term.report.flags).toEqual(expect.arrayContaining(["Service plan says 27 mowing, contract says 26", "Added from a service plan, not the contract"]));
    expect(result.report.ignoredServicePlans).toBe(1);
  });
  it("flags paused and multiple active seasons without dropping overlaps", () => {
    const result = planLegacyCopy(fixture({ contracts: [contract("c1", { status: "paused" }),
      contract("c2", { startDate: new Date("2026-02-01Z") })] }));
    const terms = result.customers[0].agreements[0].terms;
    expect(terms).toHaveLength(2);
    expect(terms[0].report.flags).toContain("Was paused in the old system");
    for (const t of terms) {
      expect(t.report.flags).toContain("More than one active season for this customer and line");
      expect(t.term.reviewNote).toBe(t.report.flags.join("; "));
    }
  });
  it("bills beyond short service windows and repeats amounts in longer windows", () => {
    const input = fixture({ contracts: [contract("c1", { endDate: new Date("2026-03-31Z") })],
      monthlyAmounts: [amount("c1", 1, 100), amount("c1", 4, 200)] });
    expect(first(input).term.annualPriceCents).toBe(300);
    expect(first(input).billingMonths).toHaveLength(2);
    input.contracts[0].endDate = new Date("2027-02-01Z");
    expect(first(input).billingMonths).toHaveLength(3);
    expect(first(input).term.annualPriceCents).toBe(300);
  });
  it("repeats partial edge months and sums grouped amounts into the annual pattern", () => {
    const input = fixture({ contracts: [contract("c1", { startDate: new Date("2025-11-15Z"), endDate: new Date("2026-11-14Z") }),
      contract("c2", { startDate: new Date("2025-11-15Z"), endDate: new Date("2026-11-14Z") })],
       monthlyAmounts: [amount("c1", 11, 100), amount("c2", 11, 200), amount("c1", 12, 400)] });
     const term = first(input);
      expect(term.billingMonths).toEqual([{ component: "Contract", month: "2025-11-01", amountCents: 300 }, { component: "Contract", month: "2025-12-01", amountCents: 400 }, { component: "Contract", month: "2026-11-01", amountCents: 300 }]);
      expect(term.term.annualPriceCents).toBe(700);
      expect(term.report.flags).toContain("Contract runs 13 months (not whole years); check the dates");
     expect(term.term).toMatchObject({ needsReview: true, reviewNote: term.report.flags.join("; ") });
      expect(term.term.notes).toContain("Old billing pattern: 12-of-12");
   });
   it("includes a unique partial starting month and does not lose its amount from annual price", () => {
     const input = fixture({ contracts: [contract("c1", { startDate: new Date("2025-11-15Z"), endDate: new Date("2026-10-14Z") })],
       monthlyAmounts: [amount("c1", 11, 100), amount("c1", 12, 200), amount("c1", 10, 300)] });
     const term = first(input);
     expect(term.billingMonths).toEqual([{ component: "Contract", month: "2025-11-01", amountCents: 100 }, { component: "Contract", month: "2025-12-01", amountCents: 200 }, { component: "Contract", month: "2026-10-01", amountCents: 300 }]);
     expect(term.term.annualPriceCents).toBe(600);
      expect(term.report.flags).toEqual(["Only 3 of 12 monthly amounts entered"]);
   });
   it("includes partial months in same-year windows without inventing a later-year charge", () => {
     const term = first(fixture({ contracts: [contract("c1", { startDate: new Date("2026-01-15Z"), endDate: new Date("2026-02-14Z") })],
       monthlyAmounts: [amount("c1", 1, 100), amount("c1", 2, 200)] }));
     expect(term.billingMonths).toEqual([{ component: "Contract", month: "2026-01-01", amountCents: 100 }, { component: "Contract", month: "2026-02-01", amountCents: 200 }]);
     expect(term.term.annualPriceCents).toBe(300);
      expect(term.report.flags).toEqual(["Only 2 of 12 monthly amounts entered"]);
  });
  it("preserves documents, history actors/times and contact snapshots without mutating inputs", () => {
    const uploadedAt = new Date("2025-12-20Z");
    const input = fixture({
      customers: [customer("a", { propertyManagementCompanyId: "pm" })],
      managementCompanies: [{ id: "pm", companyId: "company", name: "Agent" } as CopyInput["managementCompanies"][number]],
      documents: [{ id: "doc", companyId: "company", contractId: "c1", version: 3, filename: "signed.pdf", storageObjectPath: "/objects/old",
        mimeType: "application/pdf", fileSize: 1000, uploadedBy: "actor", uploadedAt } as CopyInput["documents"][number]],
      history: [{ id: "h", contractId: "c1", oldStatus: "paused", newStatus: "active", changedBy: "actor", createdAt: uploadedAt }],
    });
    const before = JSON.stringify(input);
    const term = first(input);
    expect(term.documents[0]).toMatchObject({ version: 3, kind: "other", storageObjectPath: "/objects/old", createdAt: uploadedAt, uploadedBy: "actor" });
    expect(term.history[0]).toMatchObject({ oldStatus: "active", newStatus: "active", changedBy: "actor", createdAt: uploadedAt, note: "Old system: paused → active" });
    expect(term.term).toMatchObject({ managingAgentName: "Agent", projectAddress: "1 Main, Denver, CO 80000" });
    expect(JSON.stringify(input)).toBe(before);
  });
  it("flags unusual UTC hours, differing billing patterns, mobilization and rate conflicts", () => {
    const input = fixture({ contracts: [contract("c1", { startDate: new Date("2026-01-01T15:00:00Z"), hasMobilizationFee: true, mobilizationFeeAmount: 12500 }),
      contract("c2", { billingPattern: "monthly" })],
      rateSheets: [{ id: "s", companyId: "company", customerId: "a", atv: 100, snowBlower: 200, operatorLabor: 0 } as CopyInput["rateSheets"][number]] });
    const term = first(input);
    expect(term.report.flags).toEqual(expect.arrayContaining([
      "Check start date (stored as 2026-01-01T15:00:00.000Z)", "Billing patterns differed: 12-of-12, monthly",
       "Had a mobilization fee; decide where it belongs",
    ]));
    expect(term.term.notes).toContain("Mobilization fee $125.00");
  });
  it("keeps ATV independent when snowblower is zero and ATV is null", () => {
    const input = fixture({ contracts: [contract("c1", { serviceType: "Snow" })],
      rateSheets: [{ id: "s", companyId: "company", customerId: "a", atv: null, snowBlower: 0 } as CopyInput["rateSheets"][number]] });
    expect(first(input).rates.find(r => r.rateKey === "rate_atv")).toMatchObject({ priceCents: 13500, cardPriceCents: 13500 });
    expect(first(input).rates.find(r => r.rateKey === "rate_snowblower")).toMatchObject({ priceCents: 0, cardPriceCents: 13500 });
  });
  it("snapshots all ten customer overrides into every applicable season without changing card baselines", () => {
    const overrides = {
      generalLabor: 101, emergencyGeneralLabor: 102, irrigationLabor: 103, emergencyIrrigationLabor: 104,
      handShovelLabor: 105, plowTruck: 106, skidSteer: 107, atv: 108, iceMeltMaterial: 109, iceMeltApplicationLabor: 110,
    };
    const keys = ["rate_general_labor", "rate_emergency_general_labor", "rate_irrigation_labor", "rate_emergency_irrigation_labor",
      "rate_hand_shovel", "rate_plow_truck", "rate_skid_loader", "rate_atv", "rate_ice_melt", "rate_ice_melt_application"];
    const input = fixture({
      contracts: [contract("l1"), contract("l2", { startDate: new Date("2025-01-01Z"), endDate: new Date("2025-12-31Z"), status: "ended" }),
        contract("s1", { serviceType: "Snow" }), contract("s2", { serviceType: "Snow", startDate: new Date("2025-01-01Z"), endDate: new Date("2025-12-31Z"), status: "ended" })],
      rateSheets: [{ id: "sheet", companyId: "company", customerId: "a", ...overrides } as CopyInput["rateSheets"][number]],
    });
    const before = JSON.stringify(input.rateCard);
    const result = planLegacyCopy(input);
    for (const agreement of result.customers[0].agreements) {
      expect(agreement.terms).toHaveLength(2);
      for (const term of agreement.terms) for (const r of term.rates) {
        const i = keys.indexOf(r.rateKey);
        if (i >= 0) expect(r.priceCents).toBe(101 + i);
        expect(r.cardPriceCents).toBe(input.rateCard.find(card => card.rateKey === r.rateKey)!.priceCents);
      }
    }
    expect(JSON.stringify(input.rateCard)).toBe(before);
  });
  it("isolates company relationships and customer planning errors", () => {
    const input = fixture({ contracts: [contract("c1"), contract("bad", { customerId: "b", startDate: new Date("invalid") }),
      contract("foreign", { companyId: "other" })],
      customers: [customer("a"), customer("b")], services: [service("c1", "mowing", 2, { companyId: "other" })] });
    const result = planLegacyCopy(input);
    expect(result.report.summary.customers).toBe(1);
    expect(result.report.failures).toHaveLength(1);
    expect(result.report.summary.scopeLines).toBe(0);
    expect(result.report.customers.map(c => c.customerId)).toEqual(["a", "b"]);
  });
  it("is deterministic independent of source ordering", () => {
    const input = fixture({ contracts: [contract("c2"), contract("c1")], services: [service("c2", "mowing"), service("c1", "mowing")] });
    const firstPlan = planLegacyCopy(input);
    input.contracts.reverse(); input.services.reverse(); input.rateCard.reverse();
    expect(planLegacyCopy(input)).toEqual(firstPlan);
  });
});
