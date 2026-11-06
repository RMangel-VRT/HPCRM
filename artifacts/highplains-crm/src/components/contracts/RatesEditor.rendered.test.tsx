// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeCompanyId: "co", activeRole: "office" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { RatesEditor, ratesPayload, toRateRows } from "./RatesEditor";
import type { RateRow } from "./RatesEditor";
import type { RateCardItem } from "./rateCardUtils";

const card: RateCardItem[] = [
  { id: "1", rateKey: "general_labor", line: "general", category: "Labor", label: "General labor", priceCents: 7500, priceText: null, unit: "hour", minimum: "1 hour", sortOrder: 1, active: true },
  { id: "2", rateKey: "irrigation_labor", line: "irrigation", category: "Labor", label: "Irrigation labor", priceCents: 8500, priceText: null, unit: "hour", minimum: null, sortOrder: 2, active: true },
  { id: "3", rateKey: "skid_loader", line: "landscape", category: "Equipment", label: "Skid loader", priceCents: 12500, priceText: null, unit: "hour", minimum: null, sortOrder: 3, active: false },
  { id: "4", rateKey: "plow", line: "snow", category: "Snow", label: "Plow", priceCents: 9000, priceText: null, unit: "hour", minimum: null, sortOrder: 4, active: true },
];
let latest: RateRow[] = [];
function Harness({ initial = [] as RateRow[] }) {
  const [rows, setRows] = useState(initial);
  latest = rows;
  return <QueryClientProvider client={new QueryClient()}><RatesEditor line="landscape" rows={rows} editing card={card} onChange={setRows} /></QueryClientProvider>;
}
afterEach(() => { cleanup(); latest = []; });

describe("RatesEditor (CC2-17)", () => {
  it("starts empty and never adds card rates on its own", () => {
    render(<Harness />);
    expect(screen.getByTestId("empty-rates").textContent).toBe("No rates in this contract. Add the rates the contract states.");
    expect(latest).toEqual([]);
  });
  it("picker lists only active applicable card rates, filters by search and pre-fills editable fields", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("button-add-rate"));
    expect(screen.queryByTestId("option-card-rate-skid_loader")).toBeNull();
    expect(screen.queryByTestId("option-card-rate-plow")).toBeNull();
    fireEvent.change(screen.getByTestId("input-rate-search"), { target: { value: "irrig" } });
    expect(screen.queryByTestId("option-card-rate-general_labor")).toBeNull();
    fireEvent.click(screen.getByTestId("option-card-rate-irrigation_labor"));
    expect((screen.getByTestId("input-rate-irrigation_labor") as HTMLInputElement).value).toBe("85.00");
    fireEvent.change(screen.getByTestId("input-rate-irrigation_labor"), { target: { value: "90" } });
    fireEvent.change(screen.getByTestId("input-rate-label-irrigation_labor"), { target: { value: "Irrigation tech" } });
    fireEvent.change(screen.getByTestId("input-rate-minimum-irrigation_labor"), { target: { value: "2 hours" } });
    expect(ratesPayload(latest)).toEqual([{ rateKey: "irrigation_labor", priceCents: 9000, priceText: null, minimum: "2 hours",
      label: "Irrigation tech", unit: "hour", category: "Labor", line: "irrigation" }]);
    expect(screen.getByTestId("text-rate-card-irrigation_labor").textContent).toBe("Card $85");
  });
  it("adds custom rates with price or price text, reorders and removes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("button-add-custom-rate"));
    fireEvent.change(screen.getByTestId("input-custom-rate-label"), { target: { value: "Mobilization" } });
    fireEvent.change(screen.getByTestId("input-custom-rate-unit"), { target: { value: "visit" } });
    fireEvent.change(screen.getByTestId("input-custom-rate-price"), { target: { value: "39.95" } });
    fireEvent.click(screen.getByTestId("button-save-custom-rate"));
    fireEvent.click(screen.getByTestId("button-add-custom-rate"));
    fireEvent.change(screen.getByTestId("input-custom-rate-label"), { target: { value: "Ice Slicer" } });
    fireEvent.change(screen.getByTestId("input-custom-rate-unit"), { target: { value: "ton" } });
    fireEvent.change(screen.getByTestId("input-custom-rate-text"), { target: { value: "Market price" } });
    fireEvent.click(screen.getByTestId("button-save-custom-rate"));
    expect(ratesPayload(latest).map(r => [r.rateKey, r.priceCents, r.priceText])).toEqual([
      ["custom_mobilization", 3995, null], ["custom_ice_slicer", null, "Market price"]]);
    fireEvent.click(screen.getByTestId("button-rate-up-custom_ice_slicer"));
    expect(latest.map(r => r.rateKey)).toEqual(["custom_ice_slicer", "custom_mobilization"]);
    fireEvent.click(screen.getByTestId("button-rate-remove-custom_ice_slicer"));
    expect(latest.map(r => r.rateKey)).toEqual(["custom_mobilization"]);
  });
  it("Start from the card fills applicable active rows only when clicked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("button-start-from-card"));
    expect(latest.map(r => r.rateKey)).toEqual(["irrigation_labor", "general_labor"]);
  });
  it("edits price text alongside a numeric price and distinguishes a cleared field from untouched null", () => {
    render(<Harness initial={toRateRows([
      { ...card[0], priceText: "  labor only  ", minimum: null, cardPriceCents: 7500, cardPriceText: null },
      { ...card[1], priceText: null, cardPriceCents: 8500, cardPriceText: null },
    ])} />);
    const text = screen.getByTestId("input-rate-text-general_labor") as HTMLInputElement;
    expect(text.disabled).toBe(false);
    fireEvent.change(text, { target: { value: "  excludes materials  " } });
    fireEvent.change(screen.getByTestId("input-rate-minimum-general_labor"), { target: { value: "  one hour  " } });
    expect(ratesPayload(latest)[0]).toMatchObject({ priceCents: 7500, priceText: "  excludes materials  ", minimum: "  one hour  " });
    fireEvent.change(text, { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-rate-minimum-general_labor"), { target: { value: "" } });
    expect(ratesPayload(latest)[0]).toMatchObject({ priceCents: 7500, priceText: "", minimum: "" });
    expect(ratesPayload(latest)[1]).toMatchObject({ priceText: null, minimum: null });
  });
});
