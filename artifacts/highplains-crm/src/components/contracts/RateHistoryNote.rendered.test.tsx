// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { RateHistoryNote } from "./RateHistoryNote";

afterEach(async () => { cleanup(); await i18n.changeLanguage("en"); });
describe("exact rate history presentation", () => {
  const note = `Rates updated: ${JSON.stringify([
    { rateKey: "labor", label: "General labor", reason: "changed", fields: [
      { field: "priceCents", old: 7500, new: 8500 }, { field: "minimum", old: null, new: "1 hour" },
    ] },
    { rateKey: "custom", label: "Mobilization", reason: "removed", fields: [{ field: "priceCents", old: 3995, new: null }] },
  ])}`;
  it("renders one readable update with field changes, not raw JSON", () => {
    render(<RateHistoryNote note={note} />);
    const text = screen.getByTestId("rates-updated-history").textContent!;
    expect(text).toContain("Rates updated");
    expect(text).toContain("Changed: General labor");
    expect(text).toContain("$75 → $85");
    expect(text).toContain("Minimum: — → 1 hour");
    expect(text).toContain("Removed: Mobilization");
    expect(text).not.toContain('"reason"');
  });
  it("translates the update title and change labels into Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<RateHistoryNote note={note} />);
    const text = screen.getByTestId("rates-updated-history").textContent!;
    expect(text).toContain("Tarifas actualizadas");
    expect(text).toContain("Cambiada");
    expect(text).toContain("Mínimo");
  });
  it("preserves legacy notes and an empty exact replacement still has an update title", () => {
    const { rerender } = render(<RateHistoryNote note="Edited after signing: notes" />);
    expect(screen.getByText("Edited after signing: notes")).toBeTruthy();
    rerender(<RateHistoryNote note="Rates updated: []" />);
    expect(screen.getByTestId("rates-updated-history").textContent).toBe("Rates updated");
  });
});
