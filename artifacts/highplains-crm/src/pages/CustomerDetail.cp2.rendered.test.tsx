import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

/* CP2: one page name per customer page; role gating; parent pages; billing split by rate line. */
const fx = vi.hoisted(() => ({ role: "admin", data: {} as Record<string, unknown> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeRole: fx.role, accessRole: fx.role, activeCompanyId: "co1" } }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (s: string) => s, i18n: { language: "en" } }) }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => {
    const k = (o.queryKey as unknown[]).filter(x => typeof x === "string" && x !== "" && !["co1", "u1", fx.role].includes(x)).join("|");
    return { data: o.enabled === false ? undefined : fx.data[k], isLoading: false, error: null, refetch: vi.fn() };
  },
}));
vi.mock("@/components/LayerMapViewer", () => ({ default: () => null }));
vi.mock("@/components/CustomerLocationEditor", () => ({ default: () => null }));
vi.mock("@/components/CustomerSchedulingSection", () => ({ default: () => null }));
vi.mock("@/components/TicketListView", () => ({ default: () => <div data-testid="ticket-list-stub" /> }));
vi.mock("@/components/CommunicationListTab", () => ({ default: () => <div data-testid="comms-stub" /> }));
vi.mock("@/components/contracts/CustomerContracts", () => ({ CustomerContracts: () => <div data-testid="contracts-stub" /> }));
vi.mock("@/components/customer/dashboard/CustomerDashboard", () => ({ default: (p: any) => <div data-testid="dashboard-stub" data-pm={p.pmCompanies.length} data-mgr={p.pmManagers.length} /> }));
vi.mock("@/components/qbo/QboCustomerCard", () => ({ default: () => <div data-testid="qbo-stub" />, cardState: (c: any) => (c?.reviews ? "linked" : "error") }));
vi.mock("@/components/customerWizard/FinishSetupBanner", () => ({ FinishSetupBanner: () => null }));
import CustomerDetail from "./CustomerDetail";

const regular = { id: "c1", companyId: "co1", name: "Willow Bend", status: "active", isParent: "false", tags: [] };
const parent = { id: "p1", companyId: "co1", name: "Front Range HOA", isParent: "true", tags: [],
  childCustomers: [{ id: "b1", name: "North Lot", city: "Golden" }] };
const summary = { asOf: "2026-01-01", coverage: { landscape: true, snow: true }, snowTriggerFlags: [{ termId: "t1", status: "new" }],
  current: [{ termId: "t1", agreementId: "a1", label: "2026", line: "both", startDate: "2026-01-01", endDate: "2026-12-31", annualCents: 120000,
    snowTriggers: "", billingMonths: [{ month: "2026-01", component: null, amountCents: 10000 }],
    rates: [{ rateKey: "mow", line: "landscape", label: "Mowing", unit: "visit", minimum: null, priceCents: 4500, priceText: null },
      { rateKey: "plow", line: "snow", label: "Mowing-looking snow rate", unit: "push", minimum: null, priceCents: 9000, priceText: null }] }] };

const page = (id: string, search: string) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
  <Router ssrPath={`/dashboard/customers/${id}`} ssrSearch={search}><CustomerDetail /></Router></QueryClientProvider>);

beforeEach(() => {
  fx.role = "admin";
  fx.data = {
    "/api/customers|c1": regular, "/api/customers|p1": parent,
    "/api/customers|c1|contract-summary": summary, "/api/customers|c1|quickbooks-card": {},
    "/api/customers|p1|parent-rollup": { parent, children: [{ id: "b1", name: "North Lot", activeContracts: 1, openTickets: 2, annualRevenue: null, lastCommunication: null }],
      totals: { activeContracts: 1, openTickets: 2, annualRevenue: null, recentCommunications: 0, completedWorkOrdersYtd: 0 }, recentActivity: [] },
  };
});

describe("CP2 customer pages", () => {
  it("visible heading uses the same label key as the rail", () => {
    const html = page("c1", "tab=property");
    expect(html).toMatch(/data-testid="text-customer-page-heading"[^>]*>customerPages.pages.property</);
    expect(html).toContain('data-testid="property-page"');
  });

  it("snow badge counts open flags and is a warning; billing shows QBO attention", () => {
    const html = page("c1", "tab=dashboard");
    expect(html).toMatch(/data-testid="badge-count-snow" data-warning="true"[^>]*>1</);
    expect(html).toMatch(/data-testid="badge-count-billing" data-warning="true"[^>]*>1</);
  });

  it("billing rates split by the authoritative rate line, not labels", () => {
    const html = page("c1", "tab=billing&view=rates");
    const landscape = html.slice(html.indexOf('data-testid="rates-landscape"'), html.indexOf('data-testid="rates-snow"'));
    expect(landscape).toContain("Mowing");
    expect(landscape).not.toContain("snow rate");
    expect(html.indexOf('data-testid="billing-qbo"')).toBeLessThan(html.indexOf('data-testid="billing-rates"'));
  });

  it("revenue view shows contract by month and marks invoiced/remaining unavailable", () => {
    const html = page("c1", "tab=billing&view=revenue");
    expect(html).toContain('data-testid="table-billing-months"');
    expect(html).toMatch(/data-testid="kpi-invoiced"[^>]*>customerPages.billing.unavailable</);
  });

  it.each(["field_manager", "field"])("%s gets a not-available page for billing and no privileged rail items", role => {
    fx.role = role;
    const html = page("c1", "tab=billing");
    expect(html).toContain('data-testid="customer-page-not-available"');
    expect(html).not.toContain('data-testid="nav-item-billing"');
    expect(html).not.toContain('data-testid="nav-item-communications"');
  });

  it("missing snow triggers render 'not stated' independent of flag status", () => {
    const html = page("c1", "tab=snow");
    expect(html).toContain("cp1.notStated");
    expect(html).toContain('data-testid="snow-flag-status-t1"');
  });

  it("parent: branches show current term labels and active contracts when the rollup supplies them", () => {
    const r = fx.data["/api/customers|p1|parent-rollup"] as any;
    r.children[0].currentTerms = [{ label: "2026 Landscape", line: "landscape", startDate: "2026-01-01", endDate: "2026-12-31" }];
    const html = page("p1", "tab=branches");
    expect(html).toMatch(/data-testid="text-child-season-b1"[^>]*>2026 Landscape</);
    expect(html).toMatch(/data-testid="text-child-contracts-b1"[^>]*>1</);
    expect(html).not.toContain('data-testid="text-season-unavailable"');
  });

  it("dashboard keeps site details; contracts has collapsed previous contracts with a note and no fetch until opened", () => {
    expect(page("c1", "tab=dashboard")).toContain('data-testid="card-site-details"');
    fx.data["/api/customers|c1|contracts"] = [{ id: "old1", serviceType: "Maintenance", startDate: "2019-01-01", endDate: null, status: "ended" }];
    const html = page("c1", "tab=contracts");
    expect(html).toContain('data-testid="button-previous-contracts"');
    expect(html).toContain("customerPages.contracts.previous");
    expect(html).toContain('data-testid="text-previous-contracts-note"');
    expect(html).not.toContain("card-previous-contract-old1");
  });

  it("legacy alias view wins over a stale view param", () => {
    expect(page("c1", "tab=revenue&view=rates")).toContain('data-testid="billing-revenue"');
  });

  it("parent: branches table with unavailable season, unknown value, Add branch link", () => {
    const html = page("p1", "tab=branches");
    expect(html).toContain('href="/dashboard/customers/new?parentId=p1"');
    expect(html).toMatch(/data-testid="text-child-city-b1"[^>]*>Golden</);
    expect(html).toMatch(/data-testid="text-child-season-b1"[^>]*>customerPages.parent.notAvailable</);
    expect(html).toMatch(/data-testid="text-child-revenue-b1"[^>]*>customerPages.parent.unknown</);
    expect(html).not.toContain('data-testid="nav-item-property"');
  });

  it("parent tickets shows the unsupported-aggregate notice with per-branch links", () => {
    const html = page("p1", "tab=tickets");
    expect(html).toContain('data-testid="parent-tickets-notice"');
    expect(html).toContain('href="/dashboard/customers/b1?tab=tickets"');
  });

  it("billing badge flags a non-name review even when the card state is fine; finalized proposals and final tickets don't count", () => {
    fx.data["/api/customers|c1|quickbooks-card"] = { reviews: [{ id: "r1", kind: "address_changed" }], billTo: { name: "W", lines: [] } };
    fx.data["/api/customers|c1|proposals"] = [{ id: "p", status: "finalized" }, { id: "q", status: "sent" }];
    fx.data["/api/customers|c1|tickets"] = [{ id: "t1", currentStatusId: "s-done" }, { id: "t2", currentStatusId: "s-open" }];
    fx.data["/api/ticket-type-statuses"] = [{ id: "s-done", isFinal: "true" }, { id: "s-open", isFinal: "false" }];
    const html = page("c1", "tab=dashboard");
    expect(html).toMatch(/data-testid="badge-count-billing" data-warning="true"[^>]*>1</);
    expect(html).toMatch(/data-testid="badge-count-proposals"[^>]*>1</);
    expect(html).toMatch(/data-testid="badge-count-tickets"[^>]*>1</);
  });

  it("parent tickets badge uses rollup totals.openTickets", () => {
    expect(page("p1", "tab=dashboard")).toMatch(/data-testid="badge-count-tickets"[^>]*>2</);
  });

  it("dashboard loads management company and manager data", () => {
    fx.data["/api/property-management-companies"] = [{ id: "pm" }]; fx.data["/api/property-managers"] = [{ id: "m" }];
    expect(page("c1", "tab=dashboard")).toContain('data-testid="dashboard-stub" data-pm="1" data-mgr="1"');
  });

  it("legacy alias renders its new page", () => {
    expect(page("c1", "tab=maps")).toContain('data-testid="property-page"');
    expect(page("c1", "tab=revenue")).toContain('data-testid="billing-revenue"');
  });
});
