// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ContractDetail, DetailTerm, TermRateRow } from "@/components/contracts/contractTypes";
import { unsavedGuard } from "@/lib/unsavedGuard";
import { coverageContext, daysUntil, paymentPattern, resolveTermHash, signedInfo } from "@/components/contracts/ContractWidgets";
import { equal12, msi } from "@/components/contracts/paymentPresets";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
import { ContractView } from "./ContractPage";

afterEach(() => {
  cleanup(); fx.api.mockReset(); fx.toast.mockReset(); unsavedGuard.setDirty(false); vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

const rate = (rateKey: string, priceCents = 1000, cardPriceCents: number | null = 1000): TermRateRow => ({
  rateKey, line: "landscape", category: "Labor", label: rateKey, unit: "hour", minimum: null,
  priceCents, cardPriceCents, priceText: null, cardPriceText: null,
});
const season = (id = "current", overrides: Partial<DetailTerm> = {}): DetailTerm => ({
  id, seasonLabel: "2026–27", startDate: "2026-03-01", endDate: "2027-02-28", status: "active", displayStatus: "active",
  editable: true, allowedMoves: ["lost"], line: "both", form: "ours", needsReview: false,
  annualPriceCents: 120000, billingType: "equal_monthly", snowPricing: "time_and_materials", signedAt: "2026-02-01T18:00:00Z",
  po: "Original PO", snowTriggers: "Two inches", scope: Array.from({ length: 10 }, (_, i) => ({
    serviceKey: `other:service${i}`, line: "landscape", included: true, quantity: 1, unit: "visit",
    monthSpread: [1, ...Array(11).fill(0)], details: { label: `Service ${i}` }, priceCents: null, notes: null,
  })),
  rates: [rate("same"), rate("different", 1200), rate("custom_service", 1500, null)],
  billingMonths: Array.from({ length: 12 }, (_, i) => ({ component: "Grounds", month: `${i < 10 ? 2026 : 2027}-${String((i + 2) % 12 + 1).padStart(2, "0")}-01`, amountCents: 10000 })),
  documents: [], coveredBy: [], history: Array.from({ length: 7 }, (_, i) => ({
    id: `h${i}`, oldStatus: i ? "active" : "sent", newStatus: i ? "active" : "signed",
    changedByName: "Office signer", createdAt: `2026-02-${String(i + 1).padStart(2, "0")}T18:00:00Z`, note: `Change ${i}`,
  })), ...overrides,
});
const agreement = (terms: DetailTerm[] = [season()]): ContractDetail => ({
  id: "agreement", customerId: "customer", customer: { id: "customer", name: "Summerfield fixture" },
  line: "both", form: "ours", currentTermId: terms[0]?.id, renewalDue: true, terms,
});
function mount(detail = agreement(), hash = "#term-current") {
  fx.api.mockResolvedValue({ json: async () => ({}) });
  const loc = memoryLocation({ path: "/dashboard/contracts/agreement" });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Router hook={loc.hook}><ContractView detail={detail} initialHash={hash} /></Router>
  </QueryClientProvider>);
  return loc;
}
const edit = async (panel: string) => userEvent.setup().click(screen.getByTestId(`button-edit-${panel}`));
async function changePO(value = "New PO") {
  const user = userEvent.setup();
  await user.clear(screen.getByTestId("input-field-po"));
  await user.type(screen.getByTestId("input-field-po"), value);
}

describe("contract widget presentation", () => {
  it("renders all six panels in fixed order, five populated tiles, and no tabs/global editor", () => {
    mount();
    expect(within(screen.getByTestId("grid-panels")).getAllByRole("region").map(e => e.getAttribute("data-testid")))
      .toEqual(["panel-billing", "panel-documents", "panel-details", "panel-scope", "panel-rates", "panel-history"]);
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(5);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByTestId("button-edit-contract")).toBeNull();
    expect(screen.getByTestId("text-term-status-words-current").textContent).toBe("In effect");
    expect(screen.getByTestId("text-detail-contactEmail").textContent).toBe("—");
    expect(screen.getByTestId("text-detail-snowTriggers").textContent).toBe("Two inches");
    expect(screen.getByTestId("text-tile-signed-sub").textContent).toBe("Office signer");
  });
  it("omits empty tiles and Snow for landscape rather than showing price placeholders", () => {
    mount(agreement([season("current", { line: "landscape", annualPriceCents: null, billingMonths: [], signedAt: null })]));
    expect(screen.queryByTestId("tile-snow")).toBeNull();
    expect(screen.queryByTestId("tile-annual-price")).toBeNull();
    expect(screen.queryByTestId("tile-monthly")).toBeNull();
    expect(screen.queryByTestId("tile-signed")).toBeNull();
    expect(screen.getByTestId("tile-season-ends")).toBeTruthy();
  });
  it("shows a zero-priced season's next price without an infinite percentage", () => {
    mount(agreement([season("next", { startDate: "2027-03-01", annualPriceCents: 50000 }),
      season("current", { annualPriceCents: 0, billingMonths: [] })]));
    const sub = screen.getByTestId("text-tile-annual-price-sub").textContent;
    expect(sub).toContain("$500");
    expect(sub).not.toMatch(/Infinity|NaN|%/);
  });
  it("renders snow-only T&M per event without a billing month strip", () => {
    mount(agreement([season("current", { line: "snow", annualPriceCents: null, billingMonths: [] })]));
    expect(screen.getByTestId("text-tile-snow").textContent).toBe("T&M");
    expect(screen.getByTestId("text-snow-billing").textContent).toBe("Billed per event (time and materials)");
    expect(screen.queryByTestId("strip-billing-months")).toBeNull();
  });
  it("orders billing Mar–Feb, scope Jan–Dec, and expands scope/history in place", async () => {
    const user = userEvent.setup();
    mount();
    const bars = screen.getByTestId("strip-billing-months");
    expect(bars.firstElementChild?.textContent).toBe("Mar");
    expect(bars.lastElementChild?.textContent).toBe("Feb");
    const scope = within(screen.getByTestId("panel-scope"));
    expect(scope.getAllByRole("rowgroup")[0].textContent).toContain("JFMAMJJASOND");
    expect(scope.getAllByTestId(/^scope-row-/)).toHaveLength(8);
    await user.click(scope.getByText("Show all 10 services"));
    expect(scope.getAllByTestId(/^scope-row-/)).toHaveLength(10);
    expect(screen.getAllByTestId(/^history-h/)).toHaveLength(5);
    expect(screen.getByTestId("list-history").firstElementChild?.getAttribute("data-testid")).toBe("history-h6");
    await user.click(screen.getByTestId("button-history-see-all"));
    expect(screen.getAllByTestId(/^history-h/)).toHaveLength(7);
  });
  it("shows only different/custom rates with strike-through only for card differences", async () => {
    mount();
    expect(screen.queryByTestId("rate-diff-same")).toBeNull();
    expect(screen.getByTestId("text-rate-card-different").tagName).toBe("S");
    expect(screen.queryByTestId("text-rate-card-custom_service")).toBeNull();
    expect(screen.getByTestId("text-panel-meta-rates").textContent).toContain("2 differ");
    await userEvent.setup().click(screen.getByTestId("button-rates-show-all"));
    expect(within(screen.getByTestId("panel-rates")).getByText("same")).toBeTruthy();
  });
  it("switches every panel, resets expansions and normalizes legacy hash suffixes", async () => {
    const user = userEvent.setup();
    mount(agreement([season(), season("next-season", {
      seasonLabel: "2027–28", startDate: "2027-03-01", endDate: "2028-02-29", displayStatus: "signed",
      annualPriceCents: 132000, po: "Next PO", billingMonths: [], rates: [], scope: [], history: [],
      documents: [{ id: "next-doc", kind: "other", filename: "next.pdf", storageObjectPath: "/objects/next",
        mimeType: "application/pdf", fileSize: null, version: 1, createdAt: "2026-02-01" }],
    })]), "#term-current-rates");
    expect(window.location.hash).toBe("#term-current");
    expect(screen.getByTestId("text-tile-annual-price-sub").textContent).toContain("10.0%");
    expect(screen.getByTestId("text-term-status-words-next-season").textContent).toContain("Signed, starts");
    await user.click(screen.getByTestId("button-history-see-all"));
    await user.click(screen.getByTestId("button-scope-show-all"));
    await user.click(screen.getByTestId("chip-term-next-season"));
    expect(window.location.hash).toBe("#term-next-season");
    expect(screen.getByTestId("chip-term-next-season").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("text-detail-po").textContent).toBe("Next PO");
    expect(screen.getByTestId("row-document-next-doc")).toBeTruthy();
    for (const id of ["empty-billing", "empty-scope", "empty-rates-diff", "empty-history"]) expect(screen.getByTestId(id)).toBeTruthy();
    await user.click(screen.getByTestId("chip-term-current"));
    expect(screen.getAllByTestId(/^scope-row-/)).toHaveLength(8);
    expect(screen.getAllByTestId(/^history-h/)).toHaveLength(5);
  });
  it("preserves own/covered documents, coverage choices, View and Download in their panel", async () => {
    const user = userEvent.setup();
    const doc = { id: "signed", kind: "signed", filename: "signed.pdf", storageObjectPath: "/objects/signed",
      mimeType: "application/pdf", fileSize: 123, version: 1, createdAt: "2026-02-01", coversThroughTermId: "next" };
    mount(agreement([season("current", { documents: [doc] }), season("next", {
      startDate: "2027-03-01", coveredBy: [{ ...doc, fromTermId: "current", fromSeasonLabel: "2026–27" }],
    })]));
    const own = within(screen.getByTestId("panel-documents"));
    expect(own.getByTestId("select-coverage-signed")).toBeTruthy();
    await user.selectOptions(own.getByTestId("select-coverage-signed"), "");
    expect(fx.api).toHaveBeenCalledWith("PATCH", "/api/contract-center/documents/signed/coverage", { coversThroughTermId: null });
    await user.click(screen.getByTestId("chip-term-next"));
    expect(screen.getByTestId("link-source-season-signed").textContent).toContain("2026–27");
    const download = screen.getByTestId("link-download-signed");
    expect(download.getAttribute("href")).toBe("/objects/signed");
    expect(download.getAttribute("download")).toBe("signed.pdf");
    await user.click(screen.getByTestId("button-view-signed"));
    expect(screen.getByTestId("dialog-document-view").querySelector("iframe")?.getAttribute("src")).toBe("/objects/signed");
  });
  it("retains server-only editability and places notices below the tiles", () => {
    mount(agreement([season("current", { editable: false, needsReview: true, reviewNote: "Check contact" })]));
    for (const panel of ["billing", "details", "scope", "rates"]) expect(screen.queryByTestId(`button-edit-${panel}`)).toBeNull();
    expect(screen.queryByTestId("button-mark-reviewed")).toBeNull();
    const tiles = screen.getByTestId("tiles-at-a-glance"), note = screen.getByTestId("note-past-season");
    expect(tiles.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(screen.getByTestId("banner-needs-review")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("panel-local contract saving and guards", () => {
  it("saves rates only, even with an inconsistent unrelated flat snow amount", async () => {
    mount(agreement([season("current", { snowPricing: "flat_rate", snowFlatPriceCents: 999999 })]));
    await edit("rates");
    const input = within(screen.getByTestId("panel-rates")).getByTestId("input-rate-different");
    fireEvent.change(input, { target: { value: "22" } });
    await userEvent.setup().click(screen.getByTestId("button-save-rates"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledTimes(1));
    expect(fx.api.mock.calls[0].slice(0, 2)).toEqual(["PUT", "/api/contract-center/terms/current/rates"]);
    expect(fx.api.mock.calls[0][2].find((r: TermRateRow) => r.rateKey === "different").priceCents).toBe(2200);
    expect(screen.queryByTestId("button-save-rates")).toBeNull();
  });
  it("details writes fields only and scope writes scope only, with triggers exclusively in details", async () => {
    const user = userEvent.setup();
    mount();
    await edit("details"); await changePO();
    fireEvent.change(screen.getByTestId("input-field-snowTriggers"), { target: { value: "Three inches" } });
    await user.click(screen.getByTestId("button-save-details"));
    expect(fx.api.mock.calls).toEqual([["PATCH", "/api/contract-center/terms/current", { po: "New PO", snowTriggers: "Three inches" }]]);
    fx.api.mockClear();
    await edit("scope");
    expect(screen.queryByTestId("input-snow-triggers")).toBeNull();
    fireEvent.change(screen.getByTestId("input-qty-other:service0"), { target: { value: "2" } });
    // Make the explicit spread agree with its quantity.
    fireEvent.change(screen.getByLabelText("Service 0 month 1"), { target: { value: "2" } });
    await user.click(screen.getByTestId("button-save-scope"));
    expect(fx.api.mock.calls[0].slice(0, 2)).toEqual(["PUT", "/api/contract-center/terms/current/scope"]);
    expect(fx.api).toHaveBeenCalledTimes(1);
  });
  it("Cancel and explicit discard drop drafts before reopening an editor", async () => {
    const user = userEvent.setup();
    mount(); await edit("details"); await changePO("Discard me");
    await user.click(screen.getByTestId("button-cancel-details"));
    await user.click(screen.getByTestId("button-discard"));
    await edit("details");
    expect((screen.getByTestId("input-field-po") as HTMLInputElement).value).toBe("Original PO");
    expect(fx.api).not.toHaveBeenCalled();
    expect(unsavedGuard.isDirty()).toBe(false);
  });
  it("prompts on panel switches, keep editing stays put, discard opens only the target", async () => {
    const user = userEvent.setup();
    mount(); await edit("details"); await changePO();
    await edit("rates");
    expect(screen.queryByTestId("button-save-rates")).toBeNull();
    await user.click(screen.getByTestId("button-keep-editing"));
    expect((screen.getByTestId("input-field-po") as HTMLInputElement).value).toBe("New PO");
    await edit("rates");
    await user.click(screen.getByTestId("button-discard"));
    expect(screen.getByTestId("button-save-rates")).toBeTruthy();
    expect(screen.queryByTestId("form-term-fields")).toBeNull();
    expect(unsavedGuard.isDirty()).toBe(false);
  });
  it("failed validation and failed save cannot open the next panel; success can", async () => {
    const user = userEvent.setup();
    mount(); await edit("details");
    await user.clear(screen.getByTestId("input-field-seasonLabel"));
    await edit("rates");
    await user.click(screen.getByTestId("button-save-and-continue"));
    expect(screen.getByTestId("error-panel-details").textContent).toContain("required");
    expect(fx.api).not.toHaveBeenCalled();
    expect(screen.queryByTestId("button-save-rates")).toBeNull();
    fireEvent.change(screen.getByTestId("input-field-seasonLabel"), { target: { value: "New season" } });
    fx.api.mockRejectedValueOnce(new Error("500: Save failed"));
    await user.click(screen.getByTestId("button-save-and-continue"));
    expect(screen.getByTestId("error-panel-details").textContent).toContain("Save failed");
    expect(screen.queryByTestId("button-save-rates")).toBeNull();
    await user.click(screen.getByTestId("button-save-and-continue"));
    expect(screen.getByTestId("button-save-rates")).toBeTruthy();
    expect(screen.queryByTestId("bar-discard")).toBeNull();
  });
  it("guards selected-season changes, hash changes, sidebar leave and browser unload", async () => {
    const user = userEvent.setup();
    mount(agreement([season(), season("next", { seasonLabel: "Next season" })]));
    await edit("details"); await changePO();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await user.click(screen.getByTestId("chip-term-next"));
    expect(window.location.hash).toBe("#term-current");
    await user.click(screen.getByTestId("button-keep-editing"));
    window.history.replaceState(null, "", "#term-next-rates");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(window.location.hash).toBe("#term-current");
    expect(screen.getByTestId("bar-discard")).toBeTruthy();
    await user.click(screen.getByTestId("button-keep-editing"));
    await user.click(screen.getByTestId("link-customer"));
    expect(unsavedGuard.getPending()).toBe("/dashboard/customers/customer");
    await user.click(screen.getByTestId("button-keep-editing"));
    await user.click(screen.getByTestId("chip-term-next"));
    await user.click(screen.getByTestId("button-discard"));
    expect(window.location.hash).toBe("#term-next");
    await edit("details");
    expect((screen.getByTestId("input-field-po") as HTMLInputElement).value).toBe("Original PO");
  });
  it("guards Renew so a created season cannot discard an open dirty panel", async () => {
    const user = userEvent.setup();
    mount(); await edit("details"); await changePO();
    await user.click(screen.getByTestId("button-renew-contract"));
    expect(screen.getByTestId("bar-discard")).toBeTruthy();
    await user.click(screen.getByTestId("button-keep-editing"));
    expect((screen.getByTestId("input-field-po") as HTMLInputElement).value).toBe("New PO");
    expect(fx.api).not.toHaveBeenCalled();
  });
});

describe("widget date/hash/coverage facts", () => {
  it("resolves longest known season ID with legacy suffixes only", () => {
    for (const suffix of ["", "-billing", ":rates", "&tab=documents", "/scope"]) {
      expect(resolveTermHash(`#term-year-one${suffix}`, ["year", "year-one"])).toBe("year-one");
    }
    expect(resolveTermHash("#term-yearly", ["year"])).toBeNull();
  });
  it("counts Colorado calendar days across DST and UTC evening boundaries", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T00:30:00Z"));
    expect(daysUntil("2026-11-02")).toBe(1);
    vi.setSystemTime(new Date("2026-03-08T08:30:00Z"));
    expect(daysUntil("2026-03-09")).toBe(1);
  });
  it("does not infer signed coverage from unrelated seasons and prefers the renewal set", () => {
    const first = season(), second = season("next", { startDate: "2027-03-01", endDate: "2028-02-29" });
    expect(coverageContext(first, [first, second])).toBeNull();
    first.documents = [{ id: "d", kind: "signed", filename: "d", storageObjectPath: "/objects/d", mimeType: "application/pdf",
      fileSize: null, version: 1, createdAt: "2026-01-01", coversThroughTermId: second.id }];
    expect(coverageContext(first, [first, second])).toContain("24-month contract · year 1 of 2");
    first.renewalSet = { firstTermId: first.id, firstSeason: "2026", lastSeason: "2028", year: 1, length: 3 };
    expect(coverageContext(first, [first, second])).toContain("36-month contract · year 1 of 3");
  });
  it("omits signer without supporting history", () => {
    expect(signedInfo(season("current", { history: [] }))?.by).toBeNull();
    const t = season();
    t.history.push({ id: "edit", oldStatus: "signed", newStatus: "signed", changedByName: "Rate editor", note: "Rates changed", createdAt: "2026-10-29T18:00:00Z" });
    expect(signedInfo(t)?.by).toBe("Office signer");
  });
  it("recognizes equal and variable payment patterns", () => {
    expect(paymentPattern(season())).toBe("12 equal payments");
    const t = season(); t.billingMonths[0].amountCents = 5000;
    expect(paymentPattern(t)).toBe("Variable");
    for (const [pattern, label] of [[msi, "MSI 10% / 5%"], [equal12, "12 equal payments"]] as const) {
      const amounts = pattern(1000001, 3).amounts;
      const rounded = season();
      rounded.billingType = "monthly_variable";
      rounded.billingMonths.forEach(b => { b.amountCents = amounts[Number(b.month.slice(5, 7)) - 1]; });
      expect(paymentPattern(rounded)).toBe(label);
    }
  });
});
