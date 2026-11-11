import { describe, expect, it, vi } from "vitest";
import type { EstimateDetailDto } from "@workspace/db/estimate-contracts";
vi.mock("../db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("./estimateReads", () => ({ estimatePayload: vi.fn() }));
import { buildEstimateDocumentModel, coloradoDate, customerSafeDetail } from "./estimatePdf";
import { computeVersionTotals } from "./estimateMath";

const display: NonNullable<EstimateDetailDto["display"]> = {
  companyName: "High Plains", customerName: "Customer", customerAddress: "123 Main, Denver CO",
  createdByName: "Internal creator", ticket: { id: "private-ticket", shortId: "private", title: "Distinct ticket title", status: null },
};
function fixture(status = "draft", count = 2) {
  const lines = Array.from({ length: count }, (_, i) => ({
    id: `line-${i}`, name: `Plant ${i}`, detail: "Blue Spruce · 5 gallon · SKU: SECRET-12", quantity: "2.50", unit: "ea",
    unitPriceCents: 33, unitCostCents: 9, sectionId: "section-private", umbrellaKey: "plants" as const,
    priceSource: "catalog", needsPrice: false, termId: "private-term", sortOrder: i,
  }));
  return {
    id: "private-estimate", estimateNumber: "EST-2026-0001", title: "Pond upgrade", companyId: "private-company",
    version: { versionNumber: 2, status, sentAt: status === "draft" ? null : "2026-10-30T02:00:00Z",
      acceptedOn: "2026-10-28", poNumber: "PO-123", frozenSubtotalCents: count * 83,
      totals: computeVersionTotals(lines), sections: [{ id: "section-private", name: "Landscaping", sortOrder: 0, lines }],
    },
  };
}
describe("customer estimate document model", () => {
  it("projects version-owned scope and detects captured Plants umbrellas for catalog and custom lines", () => {
    const input = { ...fixture(), version: { ...fixture().version, scopeOfWork: "Version scope" } };
    expect(buildEstimateDocumentModel(input, display, "2026-10-30")).toMatchObject({ scopeOfWork: "Version scope", hasPlants: true });
    const services = { ...input, version: { ...input.version, scopeOfWork: null,
      sections: input.version.sections.map(s => ({ ...s, lines: s.lines.map(l => ({ ...l, lineType: "custom", umbrellaKey: "landscape_labor" })) })) } };
    expect(buildEstimateDocumentModel(services, display, "2026-10-30")).toMatchObject({ scopeOfWork: null, hasPlants: false });
    services.version.sections[0].lines[0].umbrellaKey = "plants";
    expect(buildEstimateDocumentModel(services, display, "2026-10-30").hasPlants).toBe(true);
  });
  it("allowlists fields recursively and uses exact captured prices / authoritative totals", () => {
    const input = fixture();
    const model = buildEstimateDocumentModel(input, display, "2026-10-30");
    expect(model.totalCents).toBe(input.version.totals.subtotalCents);
    expect(model.sections[0].subtotalCents).toBe(166);
    expect(model.sections[0].lines[0].lineTotalCents).toBe(83);
    const serialized = JSON.stringify(model);
    for (const forbidden of ["cost", "margin", "umbrella", "priceSource", "needsPrice", "termId", "companyId", '"id"', "private-", "Internal creator", "SECRET"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(model.sections[0].lines[0].detail).toBe("Blue Spruce · 5 gallon");
    expect(model.linkedTicketTitle).toBe("Distinct ticket title");
    expect(model.terms).toBeNull();
    expect(buildEstimateDocumentModel(input, { ...display, ticket: { ...display.ticket!, title: input.title } }, "2026-10-30").linkedTicketTitle).toBeNull();
  });
  it("uses explicit Colorado today, sent date and accepted calendar date without shifting", () => {
    expect(coloradoDate(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
    expect(buildEstimateDocumentModel(fixture(), display, "2026-10-29").statusLine).toBe("DRAFT — not sent");
    const sent = fixture("sent");
    sent.version.frozenSubtotalCents = 999;
    const model = buildEstimateDocumentModel(sent, display, "2027-01-01");
    expect(model.documentDate).toBe("2026-10-29");
    expect(model.totalCents).toBe(999);
    expect(buildEstimateDocumentModel(fixture("accepted"), display, "2027-01-01").statusLine).toBe("Accepted Oct 28, 2026 · PO PO-123");
    expect(() => buildEstimateDocumentModel(fixture(), display, "2026-02-30")).toThrow("INVALID_DOCUMENT_DATE");
  });
  it("orders sections and lines without mutating inputs; preserves names and size details", () => {
    const input = fixture();
    input.version.sections[0].lines.reverse();
    input.version.sections.push({ id: "early", name: "First", sortOrder: -1, lines: [] });
    input.version.totals.bySection.early = 0;
    const model = buildEstimateDocumentModel(input, display, "2026-10-30");
    expect(model.sections.map(s => s.name)).toEqual(["First", "Landscaping"]);
    expect(model.sections[1].lines.map(l => l.name)).toEqual(["Plant 0", "Plant 1"]);
    expect(input.version.sections[0].lines[0].name).toBe("Plant 1");
    for (const detail of ['5 gallon · 2" caliper', "Hunter MP3000 rotor", "3/4 inch · 12 ft", "Blue Spruce", "5-GAL", "2-IN", "MP-3000"]) expect(customerSafeDetail(detail)).toBe(detail);
    expect(customerSafeDetail("SKU: ABC-123")).toBeNull();
    expect(customerSafeDetail("general · ABC-123", "hardscape")).toBe("general");
    expect(customerSafeDetail("general · ABC-123", "irrigation")).toBe("general");
    expect(customerSafeDetail("Blue Spruce · 5-GAL", "plant")).toBe("Blue Spruce · 5-GAL");
  });
});
