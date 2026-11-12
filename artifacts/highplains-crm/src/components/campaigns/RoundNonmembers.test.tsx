// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import i18n from "@/i18n";
import { RoundNonmembers, RenewalPendingChip } from "./RoundNonmembers";
afterEach(cleanup);
describe("round omission explanations", () => {
  it("starts collapsed and renders exactly one explanation per nonmember, including season/date", async () => {
    await i18n.changeLanguage("en");
    render(<RoundNonmembers rows={[
      {propertyId: "p", propertyName: "Excluded property", termId: "t", seasonLabel: "2026–27", reason: "excluded_by_contract"},
      {propertyId: "q", propertyName: "Leaving property", termId: "u", seasonLabel: "2026–27", reason: "not_renewing", nonRenewalOn: "2027-09-30"},
    ]} />);
    const details = screen.getByTestId("round-nonmembers") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Not on this round (2)"));
    expect(details.open).toBe(true);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(details.textContent).toContain("Excluded by contract · 2026–27");
    expect(details.textContent).toContain("Not renewing · 2027-09-30");
  });
  it("localizes renewal status", async () => {
    await i18n.changeLanguage("es"); render(<RenewalPendingChip />);
    expect(screen.getByText("Renovación no ingresada")).toBeTruthy();
    await i18n.changeLanguage("en");
  });
});
