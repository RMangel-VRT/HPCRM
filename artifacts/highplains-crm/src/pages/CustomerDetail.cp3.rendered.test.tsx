import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

/* CP3: shared Banner header, redesigned dashboards, role gating and honest loading/error states. */
const fx = vi.hoisted(() => ({
  role: "admin", data: {} as Record<string, unknown>, errors: [] as string[], loading: [] as string[],
  services: { services: [] as unknown[], isLoading: false, error: null as unknown, overdueCount: 0 },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeRole: fx.role, accessRole: fx.role, activeCompanyId: "co1" } }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (s: string, o?: Record<string, unknown>) => o && Object.keys(o).filter(k => k !== "defaultValue").length
    ? `${s}${JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== "defaultValue")))}` : s,
  i18n: { language: "en" } }) }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => {
    const k = (o.queryKey as unknown[]).filter(x => typeof x === "string" && x !== "" && !["co1", "u1", fx.role].includes(x)).join("|");
    const off = o.enabled === false;
    const err = !off && fx.errors.some(p => k.startsWith(p));
    const loading = !off && fx.loading.some(p => k.startsWith(p));
    return { data: off || err || loading ? undefined : fx.data[k], isLoading: loading, isError: err, error: err ? new Error("x") : null, refetch: vi.fn() };
  },
}));
vi.mock("@/hooks/useCustomerServices", async o => ({ ...await o<object>(), useCustomerServices: () => fx.services }));
vi.mock("@/components/LayerMapViewer", () => ({ default: () => <div data-testid="map-stub" /> }));
vi.mock("@/components/CustomerLocationEditor", () => ({ default: () => null }));
vi.mock("@/components/CustomerSchedulingSection", () => ({ default: () => null }));
vi.mock("@/components/TicketListView", () => ({ default: () => null }));
vi.mock("@/components/CommunicationListTab", () => ({ default: () => null }));
vi.mock("@/components/contracts/CustomerContracts", () => ({ CustomerContracts: () => null }));
vi.mock("@/components/qbo/QboCustomerCard", () => ({ default: () => null, cardState: (c: any) => (c?.reviews ? "linked" : "error") }));
import CustomerDetail from "./CustomerDetail";

const regular = { id: "c1", companyId: "co1", name: "Willow Bend Commons", status: "active", isParent: "false", tags: ["gate code"],
  customerType: "hoa", ranking: "preferred", includeInRoute: true, street: "12 Elm", city: "Golden", state: "CO",
  billingName: "WB Secret Billing LLC", propertyManagementCompanyId: "pm", propertyManagerId: "m", locationLat: "39.7", locationLng: "-105.2" };
const parent = { id: "p1", companyId: "co1", name: "Front Range HOA", isParent: "true", status: "active", tags: ["vip group"],
  billingName: "FR Secret Billing Inc", childCustomers: [{ id: "b1", name: "North Lot", city: "Golden" }] };
const term = (o: Record<string, unknown>) => ({ termId: "t1", agreementId: "a1", label: "2026", line: "landscape", startDate: "2026-01-01",
  endDate: "2026-12-31", annualCents: 120000, snowTriggers: "", billingMonths: [], rates: [], ...o });
const qbo = { reviews: [], billTo: { name: "WB Billing", lines: ["PO Box 4"] }, effectiveCustomer: { billingName: "QBO Billing Name",
  billingEmails: ["ap@wb.test"], qboTermId: null } };

const page = (id: string, search = "tab=dashboard") => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
  <Router ssrPath={`/dashboard/customers/${id}`} ssrSearch={search}><CustomerDetail /></Router></QueryClientProvider>);
const svc = (id: string, state: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: `Svc ${id}`, start: "2026-05-01", end: "2026-05-30", state, inContract: true, ...extra });

beforeEach(() => {
  fx.role = "admin"; fx.errors = []; fx.loading = [];
  fx.services = { services: [], isLoading: false, error: null, overdueCount: 0 };
  fx.data = {
    "/api/customers|c1": regular, "/api/customers|p1": parent,
    "/api/customers|c1|contract-summary": { asOf: "2026-06-01", coverage: { landscape: true, snow: false }, snowTriggerFlags: [], current: [term({})] },
    "/api/customers|c1|quickbooks-card": qbo, "/api/customers|p1|quickbooks-card": qbo,
    "/api/property-management-companies": [{ id: "pm", name: "Peak Property Group" }],
    "/api/property-managers": [{ id: "m", name: "Dana Ruiz", email: "dana@peak.test", phone: "303-555-0144" }],
    "/api/customers|c1|dashboard-activity|all-permitted": { communications: [{ id: "k1", title: "Spring walk", at: "2026-05-02T15:00:00Z", person: "Dana", channel: "email", direction: "in" }], ticketChanges: [] },
    "/api/customers|c1|notes": [{ id: "n1", body: "Gate opens at 7", createdAt: "2026-05-01T00:00:00Z" }],
    "/api/customers|p1|parent-rollup": { parent, children: [{ id: "b1", name: "North Lot", activeContracts: 1, openTickets: 2, annualRevenue: 50000, lastCommunication: null }],
      totals: { activeContracts: 1, openTickets: 2, annualRevenue: 50000, recentCommunications: 0, completedWorkOrdersYtd: 3 }, recentActivity: [],
      currentTerms: [term({ annualCents: 50000 })], uncoveredBranches: 0 },
    "/api/customers?page=1&limit=200": { customers: [{ id: "c1", name: "Willow Bend Commons", active: "true" }], total: 1 },
  };
});

describe("CP3 header", () => {
  it("regular admin: banner header, switcher, chips, actions, no old select", () => {
    const html = page("c1");
    expect(html).toContain('data-testid="customer-header" data-kind="regular"');
    expect(html).toContain('data-testid="select-customer-switcher"');
    expect(html).toContain('data-testid="chip-contract"');
    expect(html).toContain('data-testid="chip-quickbooks"');
    expect(html).toMatch(/data-testid="chip-managed-by-value"[\s\S]*?Peak Property Group · Dana Ruiz/);
    expect(html).toContain('href="/dashboard/customers/c1/edit"');
    expect(html).toContain('data-testid="button-header-add"');
    expect(html).toContain("cp3.type.hoa");
    expect(html).not.toContain('role="combobox"');
  });

  it("header renders on every page, not only the dashboard", () => {
    for (const tab of ["contacts", "notes", "property", "billing"]) expect(page("c1", `tab=${tab}`)).toContain('data-testid="customer-header"');
  });

  it("field roles see no commercial chips, KPIs, billing card, or billing names", () => {
    fx.role = "field";
    const html = page("c1");
    for (const id of ["chip-contract", "chip-quickbooks", "kpi-this-season", "kpi-last-contact", "card-dashboard-billing", "button-edit-customer"])
      expect(html).not.toContain(`data-testid="${id}"`);
    expect(html).not.toContain("WB Secret Billing LLC");
    expect(html).not.toContain("QBO Billing Name");
    // CP4: field role has no allowed Add actions (server rejects field note writes), so no Add menu.
    expect(html).not.toContain('data-testid="button-header-add"');
  });

  it("parent field: quiet line never reveals the billed-as name", () => {
    fx.role = "field";
    const html = page("p1");
    expect(html).toContain('data-kind="parent"');
    expect(html).not.toContain('data-testid="quiet-billed-as"');
    expect(html).not.toContain("FR Secret Billing Inc");
    expect(html).not.toContain("QBO Billing Name");
    expect(html).not.toContain('data-testid="chip-quickbooks"');
  });

  it("parent admin: billed-as from QuickBooks, branch chip, no Edit customer", () => {
    const html = page("p1");
    expect(html).toContain("QBO Billing Name");
    expect(html).toContain('data-testid="chip-branches"');
    expect(html).toContain('data-testid="chip-this-season"');
    expect(html).not.toContain('data-testid="button-edit-customer"');
  });

  it("failed or loading management reads are never shown as Self-managed", () => {
    fx.errors = ["/api/property-managers"];
    let html = page("c1");
    expect(html).toMatch(/data-testid="chip-managed-by-value"[\s\S]*?cp3.unavailable/);
    expect(html).not.toContain("cp3.chips.selfManaged");
    fx.errors = []; fx.loading = ["/api/property-management-companies"];
    html = page("c1");
    expect(html).not.toContain("cp3.chips.selfManaged");
  });

  it("partial priced contract marks parent-priced portion instead of presenting a whole amount", () => {
    fx.data["/api/customers|c1|contract-summary"] = { asOf: "2026-06-01", coverage: { landscape: true, snow: false }, snowTriggerFlags: [],
      current: [term({}), term({ termId: "t2", parentCustomerId: "p1", annualCents: 90000 })] };
    expect(page("c1")).toContain("cp3.chips.plusParent");
  });
});

describe("CP3 dashboards", () => {
  it("Ute Creek acceptance fixture shows $13,536 / 2026–27, 10 of 13 observed services, and two open tickets", () => {
    fx.data["/api/customers|c1"] = { ...regular, name: "18 at Ute Creek" };
    fx.data["/api/customers|c1|contract-summary"] = {
      asOf: "2026-11-05", coverage: { landscape: true, snow: true }, current: [
        term({ label: "2026–27", line: "both", annualCents: 1353600 }),
      ],
    };
    fx.data["/api/customers|c1|tickets"] = [
      { id: "ticket-1", title: "Irrigation follow-up", createdAt: "2026-10-15", completedAt: null },
      { id: "ticket-2", title: "Site review", createdAt: "2026-11-01", completedAt: null },
    ];
    fx.services = { services: [
      ...Array.from({ length: 10 }, (_, n) => svc(`done-${n}`, "done", { completedAt: `2026-10-${String(n + 1).padStart(2, "0")}` })),
      svc("late-1", "overdue"), svc("late-2", "overdue"), svc("next", "upcoming"),
    ], isLoading: false, error: null, overdueCount: 2 };
    const html = page("c1");
    expect(html).toMatch(/data-testid="kpi-this-season-value"[^>]*>\$13,536</);
    expect(html).toContain("2026–27");
    expect(html).toMatch(/cp3\.kpi\.doneOf\{&quot;done&quot;:10,&quot;total&quot;:13\}/);
    expect(html).toMatch(/data-testid="kpi-open-tickets-value"[^>]*>2</);
    expect(html).toContain('href="/dashboard/customers/c1?tab=contracts"');
  });
  it("regular dashboard: KPIs, latest note, people with tags, mini map, billing", () => {
    const html = page("c1");
    expect(html).not.toContain('data-testid="strip-attention"');
    for (const id of ["kpi-this-season", "kpi-services", "kpi-open-tickets", "kpi-last-contact", "card-latest-note", "card-people",
      "card-dashboard-billing", "card-site-details", "map-stub"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain("Gate opens at 7");
    expect(html).toContain('data-testid="text-people-tags"');
    expect(html).toContain("dana@peak.test");
    // CP4: KPI shows an absolute date; relative "ago" is reserved for the activity feed.
    expect(html).toMatch(/data-testid="text-kpi-last-contact-date"[^>]*>May 2, 2026</);
  });

  it("services KPI counts skipped in the denominator but not as done; overdue drives attention", () => {
    fx.services = { services: [svc("a", "done", { completedAt: "2026-05-03" }), svc("b", "skipped"), svc("c", "overdue"), svc("d", "upcoming")],
      isLoading: false, error: null, overdueCount: 1 };
    const html = page("c1");
    expect(html).toMatch(/cp3\.kpi\.doneOf\{&quot;done&quot;:1,&quot;total&quot;:4\}/);
    expect(html).toContain('data-testid="chip-attention-overdue"');
    expect(html).toContain('href="/dashboard/customers/c1?tab=services"');
  });

  it("a failed setup read is surfaced, not treated as nothing missing", () => {
    fx.errors = ["/api/customers|c1|setup"];
    expect(page("c1")).toContain('data-testid="chip-attention-setupUnknown"');
  });

  it("activity failure shows a retry state rather than an empty feed", () => {
    fx.errors = ["/api/customers|c1|dashboard-activity"];
    const html = page("c1");
    expect(html).toContain('data-testid="error-recent-activity"');
    expect(html).not.toContain('data-testid="empty-recent-activity"');
  });

  it("parent dashboard: compact branches table without management, tags preserved", () => {
    const html = page("p1");
    expect(html).toContain('data-testid="table-branches-compact"');
    expect(html).not.toContain("button-unlink-child");
    expect(html).not.toContain('data-testid="text-child-city-b1"');
    expect(html).toContain('data-testid="text-child-revenue-b1"');
    expect(html).toContain('data-testid="chip-attention-branchTickets"');
    expect(html).toContain('data-testid="text-people-tags"');
  });

  it("parent dashboard for field hides revenue and billing", () => {
    fx.role = "field";
    const html = page("p1");
    expect(html).not.toContain('data-testid="text-child-revenue-b1"');
    expect(html).not.toContain('data-testid="card-dashboard-billing"');
    expect(html).not.toContain('data-testid="text-people-billing-emails"');
  });

  it("branches page keeps the full management table", () => {
    const html = page("p1", "tab=branches");
    expect(html).toContain('data-testid="table-branches"');
    expect(html).toContain('data-testid="button-unlink-child-b1"');
  });
});
