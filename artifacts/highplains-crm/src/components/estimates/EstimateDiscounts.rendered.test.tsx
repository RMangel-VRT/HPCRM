// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import "@/i18n";
import i18n from "@/i18n";
import { computeVersionTotals, versionDiscounts } from "../../../../../lib/db/src/estimateMath";
import type { EstimateDetailDto } from "@/lib/estimateBuilder";

const exec = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/estimatePhotoUpload", () => ({ executeEstimateEdit: exec.fn }));
import { EstimateReviewRail } from "./EstimateReviewRail";
import { EstimateEditQueue } from "@/lib/estimateEditQueue";

const T0 = "2026-11-20T10:00:00.000Z";
type Discounts = Partial<Record<"laborDiscountKind" | "laborDiscountValue" | "laborDiscountLabel" | "totalDiscountKind" | "totalDiscountValue" | "totalDiscountLabel", unknown>>;
function line(id: string, lineType: string, cents: number, umbrellaKey: string, sortOrder: number, unitCostCents: number | null = null) {
  return { id, companyId: "c1", versionId: "v1", sectionId: "s1", lineType, priceSource: "manual", plantCatalogItemId: null, hardscapeCatalogItemId: null,
    irrigationCatalogItemId: null, quickItemId: null, rateKey: null, termId: null, name: `${lineType} ${id}`, detail: null, unit: "EA",
    quantity: "1.00", unitPriceCents: cents, unitCostCents, extendedCents: cents, umbrellaKey, includeInPalette: false, paletteTypeLabel: null,
    sortOrder, needsPrice: false, createdAt: T0, updatedAt: T0 };
}
function detail(discounts: Discounts = {}, status = "draft", lines = [line("l1", "labor", 100000, "landscape_labor", 0),
  line("l2", "plant", 200000, "plants", 1, 100000)]): EstimateDetailDto {
  const version = { id: "v1", versionNumber: 1, status, companyId: "c1", estimateId: "e1", createdFromVersionId: null, sentAt: null,
    frozenSubtotalCents: null, frozenTotalCents: null, includePlantTable: true, photos: [], scopeOfWork: null, createdAt: T0, updatedAt: T0,
    laborDiscountKind: null, laborDiscountValue: null, laborDiscountLabel: null, totalDiscountKind: null, totalDiscountValue: null, totalDiscountLabel: null,
    ...discounts, sections: [{ id: "s1", companyId: "c1", versionId: "v1", name: "Front", sortOrder: 0, lines, createdAt: T0, updatedAt: T0 }] };
  const totals = computeVersionTotals(lines as never, versionDiscounts(version as never));
  return { id: "e1", companyId: "c1", customerId: "cu", ticketId: null, estimateNumber: "EST-1", title: "T", currentVersionId: "v1",
    voidedAt: null, createdAt: T0, updatedAt: T0, versions: [{ id: "v1", versionNumber: 1, status, createdAt: T0, updatedAt: T0 }],
    version: { ...version, totals } } as unknown as EstimateDetailDto;
}
function rail(d: EstimateDetailDto, editable = true, onDiscountChange = vi.fn(async () => true)) {
  render(<EstimateReviewRail data={d} lang={i18n.language} onViewVersion={() => {}} onVersionPdf={() => {}} canEditPlants={editable}
    onPlantsChange={() => {}} canEditDiscounts={editable} onDiscountChange={onDiscountChange} />);
  return onDiscountChange;
}
afterEach(async () => { cleanup(); exec.fn.mockReset(); await i18n.changeLanguage("en"); });

describe("estimate discount rail", () => {
  it("an undiscounted read-only version shows no discount rows and the gross total", () => {
    rail(detail(), false);
    expect(screen.queryByTestId("group-discounts")).toBeNull();
    expect(screen.getByTestId("text-estimate-total").textContent).toBe("$3,000.00");
    expect(screen.queryByTestId("text-margin-gross")).toBeNull();
  });

  it("adds a labor percent discount with a label through the PATCH callback", async () => {
    const save = rail(detail());
    expect(screen.getByTestId("text-estimate-subtotal").textContent).toBe("$3,000.00");
    fireEvent.click(screen.getByTestId("button-add-discount-labor"));
    const form = within(screen.getByTestId("form-discount-labor"));
    expect(form.getByRole("button", { name: "%" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(form.getByLabelText("Discount percent"), { target: { value: "15" } });
    fireEvent.change(form.getByLabelText("Name on the estimate (optional)"), { target: { value: "  Winter labor discount " } });
    fireEvent.click(form.getByTestId("button-discount-labor-save"));
    await waitFor(() => expect(save).toHaveBeenCalledWith("laborDiscount", { kind: "percent", value: "15", label: "Winter labor discount" }));
    await waitFor(() => expect(screen.queryByTestId("form-discount-labor")).toBeNull());
  });

  it("validates inline without saving: out-of-range percent and zero amount", async () => {
    const save = rail(detail());
    fireEvent.click(screen.getByTestId("button-add-discount-total"));
    const form = within(screen.getByTestId("form-discount-total"));
    fireEvent.change(form.getByLabelText("Discount percent"), { target: { value: "120" } });
    fireEvent.click(form.getByTestId("button-discount-total-save"));
    expect(form.getByRole("alert").textContent).toBe("Enter a percent from 0.01 to 100.");
    expect(form.getByLabelText("Discount percent").getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(form.getByTestId("toggle-discount-total-amount"));
    fireEvent.change(form.getByLabelText("Discount amount in dollars"), { target: { value: "0" } });
    fireEvent.click(form.getByTestId("button-discount-total-save"));
    expect(form.getByRole("alert").textContent).toBe("Enter a dollar amount greater than 0.");
    fireEvent.change(form.getByLabelText("Discount amount in dollars"), { target: { value: "$250.00" } });
    fireEvent.click(form.getByTestId("button-discount-total-save"));
    await waitFor(() => expect(save).toHaveBeenCalledWith("totalDiscount", { kind: "amount", value: "250.00", label: null }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("shows both discounts in order, the net QuickBooks buckets, gross margin, and Remove sends null", async () => {
    const d = detail({ laborDiscountKind: "percent", laborDiscountValue: 1500, laborDiscountLabel: "Winter labor discount",
      totalDiscountKind: "amount", totalDiscountValue: 50000 });
    const save = rail(d);
    const group = screen.getByTestId("group-discounts");
    expect(group.textContent!.indexOf("Subtotal")).toBeLessThan(group.textContent!.indexOf("Winter labor discount (15%)"));
    expect(screen.getByTestId("text-discount-labor-label").textContent).toBe("Winter labor discount (15%)");
    expect(screen.getByTestId("text-discount-labor-amount").textContent).toBe("−$150.00");
    expect(screen.getByTestId("text-discount-total-label").textContent).toBe("Discount");
    expect(screen.getByTestId("text-discount-total-amount").textContent).toBe("−$500.00");
    expect(screen.getByTestId("text-estimate-total").textContent).toBe("$2,350.00");
    // Net buckets sum to the total.
    const labor = Number(screen.getByTestId("text-umbrella-net-landscape_labor").textContent!.replace(/[$,]/g, ""));
    const plants = Number(screen.getByTestId("text-umbrella-net-plants").textContent!.replace(/[$,]/g, ""));
    expect(labor + plants).toBe(2350);
    expect(screen.getByTestId("list-qbo-discounts").textContent).toContain("Winter labor discount (15%) (−$150.00), taken from labor");
    expect(screen.getByTestId("text-margin").textContent).not.toBe(screen.getByTestId("text-margin-gross").textContent);
    expect(screen.getByTestId("text-margin-gross").textContent).toBe("50%");
    fireEvent.click(screen.getByRole("button", { name: "Remove Discount" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("totalDiscount", null));
  });

  it("edit reopens with the stored values and warns about caps and no labor lines", () => {
    rail(detail({ laborDiscountKind: "amount", laborDiscountValue: 12345, totalDiscountKind: "amount", totalDiscountValue: 99999999 },
      "draft", [line("p", "plant", 100000, "plants", 0)]));
    expect(screen.getByTestId("text-discount-labor-warning").textContent).toBe("No labor lines yet, so this discount is $0.");
    expect(screen.getByTestId("text-discount-total-warning").textContent).toBe("Capped at the remaining total.");
    expect(screen.getByTestId("text-estimate-total").textContent).toBe("$0.00");
    fireEvent.click(screen.getByTestId("button-edit-discount-labor"));
    expect((screen.getByTestId("input-discount-labor-value") as HTMLInputElement).value).toBe("123.45");
    expect(screen.getByTestId("toggle-discount-labor-amount").getAttribute("aria-pressed")).toBe("true");
  });

  it("read-only versions show saved discounts without controls or warnings, in Spanish too", async () => {
    await i18n.changeLanguage("es");
    rail(detail({ totalDiscountKind: "percent", totalDiscountValue: 1000 }, "sent"), false);
    expect(screen.getByTestId("text-discount-total-label").textContent).toBe("Discount (10%)");
    expect(screen.queryByTestId("button-edit-discount-total")).toBeNull();
    expect(screen.queryByTestId("button-add-discount-labor")).toBeNull();
    expect(screen.getByTestId("card-totals").textContent).toContain("Subtotal");
  });
});

describe("optimistic discount projection", () => {
  it("recomputes totals immediately from the queued PATCH and keeps the server response", async () => {
    const qc = new QueryClient();
    const key = ["estimate", "e1", "current"];
    const base = detail();
    qc.setQueryData(key, base);
    let resolve!: (v: unknown) => void;
    exec.fn.mockReturnValue(new Promise(r => { resolve = r; }));
    const queue = new EstimateEditQueue(qc, key, "c1", "e1");
    const done = queue.enqueue(base, { method: "PATCH", url: "/api/estimates/e1/versions/v1", body: { laborDiscount: { kind: "percent", value: "50", label: " Crew " } } }, () => true);
    const projected = qc.getQueryData<EstimateDetailDto>(key)!;
    expect(projected.version.laborDiscountKind).toBe("percent");
    expect(projected.version.laborDiscountValue).toBe(5000);
    expect(projected.version.laborDiscountLabel).toBe("Crew");
    expect(projected.version.totals.laborDiscountCents).toBe(50000);
    expect(projected.version.totals.totalCents).toBe(250000);
    expect(projected.version.totals.bySectionNet.s1).toBe(250000);
    await waitFor(() => expect(exec.fn).toHaveBeenCalledTimes(1));
    const server = detail({ laborDiscountKind: "percent", laborDiscountValue: 5000, laborDiscountLabel: "Crew" });
    resolve({ detail: { ...server, updatedAt: "2026-11-21T00:00:00.000Z" }, failedPhotos: 0 });
    await done;
    expect(qc.getQueryData<EstimateDetailDto>(key)!.version.totals.totalCents).toBe(250000);
  });
  it("a malformed discount body never projects", () => {
    const qc = new QueryClient();
    const key = ["estimate", "e1", "bad"];
    const base = detail();
    qc.setQueryData(key, base);
    exec.fn.mockReturnValue(new Promise(() => {}));
    void new EstimateEditQueue(qc, key, "c1", "e1-bad").enqueue(base,
      { method: "PATCH", url: "/api/estimates/e1/versions/v1", body: { totalDiscount: { kind: "percent", value: "0" } } }, () => true);
    const projected = qc.getQueryData<EstimateDetailDto>(key)!;
    expect(projected.version.totals.totalCents).toBe(300000);
    expect(projected.version.totalDiscountKind).toBeNull();
  });
});
