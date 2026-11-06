import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

/* CQ7: the customer page is read-only for customer facts; every edit goes to /edit. */
const fx = vi.hoisted(() => ({ user: { activeRole: "admin", activeCompanyId: "co1", isSuperAdminBool: false } as any, data: {} as Record<string, unknown> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { ...fx.user, accessRole: fx.user.activeRole === "account_manager" ? "admin" : fx.user.activeRole } }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (s: string) => s, i18n: { language: "en" } }) }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => ({ data: fx.data[o.queryKey.join("|")] ?? fx.data[o.queryKey.slice(0, 3).join("|")] ??
    (o.queryKey[2] === fx.user.activeCompanyId ? fx.data[o.queryKey.slice(0, 2).join("|")] : undefined), isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/components/LayerMapViewer", () => ({ default: () => null }));
vi.mock("@/components/CustomerLocationEditor", () => ({ default: () => null }));
vi.mock("@/components/customer/dashboard/CustomerDashboard", () => ({ default: () => <div data-testid="dashboard-stub" /> }));
vi.mock("@/pages/ParentCustomerDashboard", () => ({ default: () => null }));
vi.mock("@/components/qbo/QboCustomerCard", () => ({ default: () => null, cardState: () => "not_linked" }));
vi.mock("@/components/customerWizard/FinishSetupBanner", () => ({ FinishSetupBanner: () => null, MissingFieldsNotice: () => null }));
import CustomerDetail from "./CustomerDetail";
import SiteDetailsCard from "@/components/customer/SiteDetailsCard";

const customer = { id: "c7", companyId: "co1", name: "Willow Bend", status: "active", street: "12 Elm", city: "Golden", state: "CO", zip: "80401",
  gateCode: "4471", accessNotes: null, watchOutNotes: "Dog in yard", petStationCount: 3, petStationLocations: "", irrigationControllerLocations: null, includeInRoute: true, tags: [] };
const contacts = [{ id: "k1", name: "Ann Ode", role: "Board", emails: ["ann@wb.co"], phones: [], isPrimary: "true", notes: "Prefers text" }];
const tag = (html: string, id: string) => html.match(new RegExp(`<a[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
const page = (tab: string) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
  <Router ssrPath="/dashboard/customers/c7" ssrSearch={`tab=${tab}`}><CustomerDetail /></Router></QueryClientProvider>);

beforeEach(() => {
  fx.user = { activeRole: "admin", activeCompanyId: "co1", isSuperAdminBool: false };
  fx.data = { "/api/customers|c7": customer, "/api/customers|c7|contacts": contacts };
});

describe("customer page after CQ7", () => {
  it("header Edit customer links to the editor; no edit dialogs remain", () => {
    const html = page("overview");
    expect(tag(html, "button-edit-customer")).toContain('href="/dashboard/customers/c7/edit"');
    expect(html).not.toContain("button-save-customer");
    expect(html).not.toContain("button-save-contact");
  });

  it("overview shows read-only site details with dashes and an Edit link to #site", () => {
    const html = page("overview");
    expect(html).toContain('data-testid="card-site-details"');
    expect(html).toMatch(/data-testid="text-site-gate"[^>]*>4471</);
    expect(html).toMatch(/data-testid="text-site-access"[^>]*>\u2014</);
    expect(html).toMatch(/data-testid="text-site-pet-count"[^>]*>3</);
    expect(html).toMatch(/data-testid="text-site-pet-locations"[^>]*>\u2014</);
    expect(html).toMatch(/data-testid="text-site-route"[^>]*>common.yes</);
    expect(html).toContain('href="/dashboard/customers/c7/edit#site"');
    expect(html).not.toMatch(/<input[^>]*input-site-gate/);
  });

  it("contacts tab is read-only with Edit contacts -> #contacts and no row edit/delete", () => {
    const html = page("contacts");
    expect(html).toContain("Ann Ode");
    expect(html).toContain("Prefers text");
    expect(tag(html, "button-edit-contacts")).toContain('href="/dashboard/customers/c7/edit#contacts"');
    expect(html).not.toContain("button-edit-contact-k1");
    expect(html).not.toContain("button-delete-contact-k1");
    expect(html).not.toContain("button-add-contact");
  });

  it.each(["field_manager", "chemical_manager"])("%s sees no edit links", role => {
    fx.user = { ...fx.user, activeRole: role };
    expect(page("overview")).not.toContain("/edit");
    expect(page("contacts")).not.toContain("/edit#contacts");
  });

  it("SiteDetailsCard hides Edit when not allowed", () => {
    const html = renderToStaticMarkup(<Router ssrPath="/"><SiteDetailsCard customer={{ id: "c7" }} canEdit={false} /></Router>);
    expect(html).not.toContain("button-edit-site");
    for (const k of ["gate", "access", "watch", "pet-count", "pet-locations", "controllers"]) expect(html).toMatch(new RegExp(`data-testid="text-site-${k}"[^>]*>\u2014<`));
  });
});

describe("route table", () => {
  const app = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
  it("registers /edit and the /setup redirect before /:id, admin/office only", () => {
    const at = (p: string) => app.indexOf(`path="${p}"`);
    expect(at("/dashboard/customers/:id/edit")).toBeGreaterThan(-1);
    expect(at("/dashboard/customers/:id/edit")).toBeLessThan(at("/dashboard/customers/:id"));
    expect(at("/dashboard/customers/:id/setup")).toBeLessThan(at("/dashboard/customers/:id"));
    expect(app).toMatch(/path="\/dashboard\/customers\/:id\/edit" component=\{CustomerEdit\} allowedRoles=\{\["admin", "office"\]\}/);
    expect(app).toMatch(/path="\/dashboard\/customers\/:id\/setup" component=\{CustomerSetupRedirect\} allowedRoles=\{\["admin", "office"\]\}/);
    expect(app).toContain("(setup|edit)(\\/|$)");
  });
});
