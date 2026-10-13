import { describe, expect, it } from "vitest";
import { planLegacyCopy, assumedEnd, type CopyInput } from "./contractCenterCopy";
import { RATE_CARD_DEFAULTS } from "../shared/contractCatalog";

// Plain input fixtures intentionally omit irrelevant legacy metadata.
export function fixture(overrides: Partial<CopyInput> = {}): CopyInput {
  return {
    companyId: "company", contracts: [contract("c1")], customers: [customer("a")],
    services: [], monthlyAmounts: [amount("c1", 1, 100)], documents: [], history: [],
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
    for (const a of result.customers[0].agreements) expect(a.terms[0].report.flags).toContain("Has separate landscape and snow agreements; merge into one Both contract if they're signed as one");
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
  it("skips out-of-window amounts and unsupported long windows without adding to annual price", () => {
    const input = fixture({ contracts: [contract("c1", { endDate: new Date("2026-03-31Z") })],
      monthlyAmounts: [amount("c1", 1, 100), amount("c1", 4, 200)] });
    expect(first(input).term.annualPriceCents).toBe(100);
    expect(first(input).report.flags).toContain("Monthly amount for Apr doesn't fit the term dates");
    input.contracts[0].endDate = new Date("2027-02-01Z");
    expect(first(input).billingMonths).toEqual([]);
    expect(first(input).term.annualPriceCents).toBeNull();
  });
  it("flags ambiguous edge-year amounts instead of silently assigning them to the following year", () => {
    const input = fixture({ contracts: [contract("c1", { startDate: new Date("2025-11-15Z"), endDate: new Date("2026-11-14Z") }),
      contract("c2", { startDate: new Date("2025-11-15Z"), endDate: new Date("2026-11-14Z") })],
       monthlyAmounts: [amount("c1", 11, 100), amount("c2", 11, 200), amount("c1", 12, 400)] });
     const term = first(input);
     expect(term.billingMonths).toEqual([{ month: "2025-12-01", amountCents: 400 }]);
     expect(term.term.annualPriceCents).toBe(400);
     expect(term.report.flags).toContain("Monthly amount for Nov has an ambiguous year (2025 or 2026); check it");
     expect(term.term).toMatchObject({ needsReview: true, reviewNote: term.report.flags.join("; ") });
     expect(term.term.notes).toContain("Unplaced monthly amount for Nov: $3.00 (possible billing months: 2025-11-01, 2026-11-01)");
   });
   it("includes a unique partial starting month and does not lose its amount from annual price", () => {
     const input = fixture({ contracts: [contract("c1", { startDate: new Date("2025-11-15Z"), endDate: new Date("2026-10-14Z") })],
       monthlyAmounts: [amount("c1", 11, 100), amount("c1", 12, 200), amount("c1", 10, 300)] });
     const term = first(input);
     expect(term.billingMonths).toEqual([{ month: "2025-11-01", amountCents: 100 }, { month: "2025-12-01", amountCents: 200 }, { month: "2026-10-01", amountCents: 300 }]);
     expect(term.term.annualPriceCents).toBe(600);
     expect(term.report.flags).toEqual([]);
   });
   it("includes partial months in same-year windows without inventing a later-year charge", () => {
     const term = first(fixture({ contracts: [contract("c1", { startDate: new Date("2026-01-15Z"), endDate: new Date("2026-02-14Z") })],
       monthlyAmounts: [amount("c1", 1, 100), amount("c1", 2, 200)] }));
     expect(term.billingMonths).toEqual([{ month: "2026-01-01", amountCents: 100 }, { month: "2026-02-01", amountCents: 200 }]);
     expect(term.term.annualPriceCents).toBe(300);
     expect(term.report.flags).toEqual([]);
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
      "Had a mobilization fee; decide where it belongs", "Rate sheet has separate ATV and snowblower rates; the new card has one",
      "Rate sheet has an operator labor rate with no place on the new card",
    ]));
    expect(term.term.notes).toContain("Mobilization fee $125.00");
  });
  it("falls back to snowblower when ATV is null, treating zero as a real override", () => {
    const input = fixture({ contracts: [contract("c1", { serviceType: "Snow" })],
      rateSheets: [{ id: "s", companyId: "company", customerId: "a", atv: null, snowBlower: 0 } as CopyInput["rateSheets"][number]] });
    expect(first(input).rates.find(r => r.rateKey === "rate_atv")).toMatchObject({ priceCents: 0, cardPriceCents: 13500 });
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
