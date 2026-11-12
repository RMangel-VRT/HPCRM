// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import "@/i18n";
import { buildScopeRows, ScopeEditor, scopePayload, billingPriceCents } from "./ScopeEditor";
import { initialScope, applyScopePreset } from "./newContractDraft";
import { STARTING_SERVICE_CALENDAR } from "../../../../../lib/db/src/serviceCalendarContracts";
import { SCOPE_CATALOG } from "@/shared/contractCatalog";
const calendar = STARTING_SERVICE_CALENDAR;
afterEach(cleanup);
describe("calendar package editing", () => {
  it("prompts notes for explicit native counts even though natives are never implicitly in the package", () => {
    const rows = buildScopeRows([{serviceKey: "native_areas", included: true, quantity: 1, details: {}}] as any,
      "landscape", calendar).filter(r => r.serviceKey === "native_areas");
    render(<ScopeEditor line="landscape" rows={rows} calendar={calendar} editing onChange={() => {}} />);
    expect(screen.getByText("Differs from standard")).toBeTruthy();
    expect(screen.getByPlaceholderText("Explain the difference from standard (optional)")).toBeTruthy();
  });
  it("starts and presets with company-defined blank counts, keeps routes/snow and only-if-listed defaults", () => {
    const rows = initialScope("landscape", calendar);
    expect(rows.find(r => r.serviceKey === "chemical")?.included).toBe(false);
    for (const key of ["cleanups", "ornamental_grass", "tree_pruning", "fertilization", "broadleaf"]) {
      expect(rows.find(r => r.serviceKey === key)).toMatchObject({ included: true, quantity: null, monthSpread: null });
    }
    for (const key of ["native_areas", "backflow"]) expect(rows.find(r => r.serviceKey === key)?.included).toBe(false);
    expect(rows.find(r => r.serviceKey === "mowing")).toMatchObject({ included: true, quantity: 26 });
    const custom = calendar.filter(e => e.serviceKey === "cleanups");
    const preset = applyScopePreset(rows.map(r => ({...r, quantity: 2})), "hoa", custom);
    expect(preset.find(r => r.serviceKey === "cleanups")).toMatchObject({ included: true, quantity: null });
    expect(preset.find(r => r.serviceKey === "fertilization")?.included).toBe(false);
    expect(initialScope("snow", []).filter(r => r.included).map(r => r.serviceKey))
      .toEqual(["snow_walks", "snow_drives", "ice_melt", "snow_stakes"]);
    expect(initialScope("landscape", []).filter(r => r.included).map(r => r.serviceKey))
      .toEqual(["mowing", "winter_visits", "irrigation_inspection"]);
  });
  it("projects silent rows without modifying stored inputs and persists an exclusion on explicit save", () => {
    const stored: any[] = [];
    const rows = buildScopeRows(stored, "landscape", calendar);
    expect(stored).toEqual([]);
    const cleanups = rows.find(r => r.serviceKey === "cleanups")!;
    expect(cleanups).toMatchObject({ included: true, quantity: null, implicitDefault: true, existed: false });
    const excluded = rows.map(r => r.serviceKey === "cleanups" ? {...r, included: false} : r);
    expect(scopePayload(excluded)).toContainEqual(expect.objectContaining({ serviceKey: "cleanups", included: false, quantity: null }));
    expect(scopePayload(initialScope("landscape", calendar).map(r => ({...r, included: false}))))
      .toContainEqual(expect.objectContaining({ serviceKey: "cleanups", included: false }));
  });
  it("shows standard N from checked entries, supports explicit count and billing without stripping other details", () => {
    const custom = calendar.map(e => e.serviceKey === "cleanups" && e.position === 2 ? {...e, inStandard: false} : e);
    const source = buildScopeRows([], "landscape", custom).filter(r => r.serviceKey === "cleanups");
    source[0].details = { preserved: "yes" };
    let saved: unknown;
    function Form() {
      const [rows, setRows] = useState(source);
      return <><ScopeEditor line="landscape" rows={rows} calendar={custom} editing onChange={setRows}
        snowTriggers={null} onSnowTriggers={() => {}} />
        <button onClick={() => {saved = scopePayload(rows);}}>Save test</button></>;
    }
    render(<Form />);
    expect(screen.getByTestId("input-qty-cleanups").getAttribute("placeholder")).toBe("Standard (2)");
    expect(screen.getByText("Standard (2) · default")).toBeTruthy();
    expect(saved).toBeUndefined();
    fireEvent.change(screen.getByTestId("input-qty-cleanups"), { target: {value: "1"} });
    expect(screen.getByText("Differs from standard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Standard (2)"}));
    expect((screen.getByTestId("input-qty-cleanups") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Spring and fall clean-ups billing"), {target: {value: "billed_when_done"}});
    fireEvent.change(screen.getByLabelText("Spring and fall clean-ups price"), {target: {value: "$155.25"}});
    fireEvent.click(screen.getByText("Save test"));
    expect(saved).toEqual([expect.objectContaining({priceCents: 15525, details: {
      preserved: "yes", billing: "billed_when_done", billingPrice: "$155.25",
    }})]);
    fireEvent.change(screen.getByLabelText("Spring and fall clean-ups price"), {target: {value: "Included as needed"}});
    fireEvent.click(screen.getByText("Save test"));
    expect(saved).toEqual([expect.objectContaining({priceCents: null, details: expect.objectContaining({billingPrice: "Included as needed"})})]);
    expect(SCOPE_CATALOG.find(c => c.key === "cleanups")?.defaultQuantity).toBe(3);
  });
  it("parses only single dollar amounts and clears obsolete cents on text edits", () => {
    expect(billingPriceCents("$1,250.50")).toBe(125050);
    for (const value of ["", "$10 to $20", "as needed", "-20", "12.123", "999999999999"])
      expect(billingPriceCents(value)).toBeNull();
  });
});
