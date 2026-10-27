// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PulseRail, { type PulseResponse } from "./PulseRail";
afterEach(cleanup);
const pulse = (renewals: PulseResponse["renewals"]): PulseResponse => ({
  stats: { customersCount: 0, activeContractsCount: 0, monthlyRevenue: 0, ytdRevenue: 0 },
  revenue: { year: 2026, months: [], priorYear: 2025, priorMonths: [] },
  unbilledTicketCount: 0, avgDaysCloseToInvoice: null, activeSeason: null, nextSeason: null,
  snowBook: { activeSnowContracts: 0, expiringBeforeSeasonStart: 0 }, renewals, crewsToday: [],
});
const row = (line: "snow" | "both" | "landscape", daysLeft: number) => ({
  agreementId: `agreement-${line}`, customerId: "not-the-destination", customerName: `${line} customer`,
  line, termId: `term-${line}`, seasonLabel: "2026", endDate: "2026-11-01", daysLeft, renewalDraftStatus: null,
});
describe("pulse agreement renewals", () => {
  it("renders season line, date, agreement links and IDs, urgency, and visible keyboard focus", () => {
    render(<Router hook={memoryLocation().hook}><PulseRail pulse={pulse([row("snow", -10), row("both", 30), row("landscape", 45)])} /></Router>);
    for (const [line, label] of [["snow", "Snow"], ["both", "Both"], ["landscape", "Landscape"]]) {
      const link = screen.getByTestId(`link-pulse-renewal-agreement-${line}`);
      expect(link.getAttribute("href")).toBe(`/dashboard/contracts/agreement-${line}`);
      expect(link.textContent).toContain(`${label} · Nov 1`);
      expect(link.className).toContain("focus-visible:ring-2");
      link.focus(); expect(document.activeElement).toBe(link);
    }
    expect(screen.getByText("-10d").className).toContain("text-destructive");
    expect(screen.getByText("30d").className).toContain("text-destructive");
    expect(screen.getByText("45d").className).toContain("text-muted-foreground");
  });
  it("preserves the three-row limit and safe empty state", () => {
    const { unmount } = render(<Router hook={memoryLocation().hook}><PulseRail pulse={pulse(Array.from({ length: 8 }, (_, n) => ({ ...row("snow", n), agreementId: `a-${n}` })))} /></Router>);
    expect(screen.getAllByTestId(/^link-pulse-renewal-/)).toHaveLength(3);
    unmount();
    render(<PulseRail pulse={pulse([])} />);
    expect(screen.queryByTestId("pulse-renewals")).toBeNull();
  });
});
