// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import i18n from "@/i18n";
import { CustomerCard } from "@/components/customer/page";
import ProposalsPage from "@/components/customer/pages/ProposalsPage";
import ServicesPage from "@/components/customer/pages/ServicesPage";
import SnowPage from "@/components/customer/pages/SnowPage";
import { TermPicker } from "@/components/customer/pages/BillingPage";

const fx = vi.hoisted(() => ({ api: vi.fn(), navigate: vi.fn(), services: [] as unknown[] }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "co", activeRole: "admin", accessRole: "admin" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useCustomerServices", () => ({ useCustomerServices: () => ({ services: fx.services, items: [], isLoading: false, error: null, overdueCount: 0 }) }));
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/", fx.navigate] };
});
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }), apiRequest: (...a: unknown[]) => fx.api(...a) };
});
const ok = (v: unknown) => ({ json: async () => v, ok: true });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
beforeEach(async () => { queryClient.clear(); fx.api.mockReset(); fx.navigate.mockReset(); await i18n.changeLanguage("en"); });
afterEach(async () => { cleanup(); await i18n.changeLanguage("en"); });

describe("CP4 acceptance corrections", () => {
  it("proposals tab has no duplicate New proposal action (header Add owns it); worksheets keep theirs", async () => {
    fx.api.mockResolvedValue(ok([]));
    wrap(<ProposalsPage customerId="c1" view="proposals" onViewChange={() => {}} />);
    await screen.findByTestId("page-empty-state-message");
    expect(screen.queryByTestId("button-new-proposal-customer")).toBeNull();
    cleanup();
    wrap(<ProposalsPage customerId="c1" view="worksheets" onViewChange={() => {}} />);
    expect(screen.getByTestId("button-new-crew-worksheet-customer")).toBeTruthy();
  });

  it("services: localized dates (en/es) and keyboard row ignores nested controls", async () => {
    fx.services = [{ id: "s1", title: "Spring cleanup", start: "2026-04-14", end: "2026-04-20", state: "upcoming", inContract: true, source: "campaign" }];
    wrap(<ServicesPage customerId="c1" />);
    expect(screen.getByTestId("text-service-window-s1").textContent).toBe("Apr 14, 2026 – Apr 20, 2026");
    const row = screen.getByTestId("row-service-s1");
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(await screen.findByText(new RegExp(i18n.t("customerPages.services.window")))).toBeTruthy();
    cleanup();
    await act(() => i18n.changeLanguage("es"));
    wrap(<ServicesPage customerId="c1" />);
    expect(screen.getByTestId("text-service-window-s1").textContent).toMatch(/abr/i);
  });

  it("snow: localized term dates, translated statuses/types/hours, keyboard cards", async () => {
    fx.api.mockResolvedValue(ok([{ id: "i1", serviceTypes: ["Plow"], billingStatus: "weird", laborHours: "2.5", siteNotes: null,
      snowEvent: { id: "e1", eventName: "Feb storm", eventStartDateTime: "2026-02-03T12:00:00Z", eventEndDateTime: null, snowRange: "2-4", status: "draft" } }]));
    const summary = { current: [{ termId: "t1", label: "Snow 25-26", line: "snow", startDate: "2025-11-01", endDate: "2026-04-15", snowTriggers: "2in" }], snowTriggerFlags: [] };
    wrap(<SnowPage customerId="c1" summary={summary as never} canOpenContract={false} />);
    expect(screen.getByTestId("text-snow-term-dates-t1").textContent).toBe("Nov 1, 2025 – Apr 15, 2026");
    const card = await screen.findByTestId("card-snow-impact-i1");
    expect(screen.getByTestId("badge-status-i1").textContent).toBe(i18n.t("statuses.draft"));
    expect(screen.getByTestId("badge-billing-i1").textContent).toBe(i18n.t("cp4.status.pending"));
    expect(screen.getByTestId("badge-snow-count").textContent).toBe(i18n.t("cp4.snow.storms", { count: 1 }));
    expect(screen.getByTestId("text-labor-hours-i1").textContent).toBe(i18n.t("cp4.snow.hours", { count: 2.5, hours: "2.5" }));
    expect(card.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(fx.navigate).toHaveBeenCalledWith("/dashboard/snow/e1");
  });

  it("billing term picker shows localized dates, not ISO", () => {
    render(<TermPicker rows={[{ period: "current", term: { termId: "t1", label: "Landscape 2026", line: "landscape", startDate: "2026-03-01", endDate: "2026-11-30" } as never }]} value="t1" onChange={() => {}} />);
    const text = screen.getByTestId("select-billing-term").textContent!;
    expect(text).toContain("Mar 1, 2026 – Nov 30, 2026");
    expect(text).not.toContain("2026-03-01");
  });

  it("shared CustomerCard renders icon + title + optional link", () => {
    render(<CustomerCard icon={FileText} title="Rate cards" link={{ href: "/x", label: "All", testId: "lnk" }} testId="cc"><p>body</p></CustomerCard>);
    const card = screen.getByTestId("cc");
    expect(within(card).getByTestId("customer-card-icon")).toBeTruthy();
    expect(within(card).getByText("Rate cards")).toBeTruthy();
    expect(within(card).getByTestId("lnk").getAttribute("href")).toBe("/x");
  });
});
