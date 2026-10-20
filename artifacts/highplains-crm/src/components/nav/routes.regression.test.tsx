import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { canViewBilling } from "@/lib/billing";

vi.mock("wouter", async original => ({
  ...await original<typeof import("wouter")>(),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
}));
import { OperationsRedirect, QueryPreservingRedirect, SeasonsRedirect } from "./QueryPreservingRedirect";

const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const getRoute = (path: string) => app.match(new RegExp(`<ProtectedRoute\\s+path="${path}"[\\s\\S]*?\\/>`))?.[0] ?? "";

describe("shell routes and permission boundaries", () => {
  it("crew supervisor ticket breadcrumbs return to the permitted My Tickets route", () => {
    const detail = readFileSync(new URL("../../pages/TicketDetail.tsx", import.meta.url), "utf8");
    expect(detail).toContain('isFieldRole || currentUser?.activeRole === "crew_supervisor" ? "/dashboard/tickets/my"');
    expect(detail.match(/const rolesWithoutCustomerAccess = \[([^\]]+)\]/)?.[1]).toContain('"crew_supervisor"');
  });
  it("unifies the shell without broadening allFieldRoles", () => {
    expect(app).not.toContain("FieldAppLayout");
    const field = /const allFieldRoles = (\[[^\]]+\])/.exec(app)![1];
    expect(field).not.toContain("crew_supervisor");
    for (const path of ["/dashboard/tickets/my", "/dashboard/tickets/:id"]) {
      const predicate = /access=\{\(viewer\) => (.*?)\}/.exec(getRoute(path))![1];
      const access = new Function("viewer", "canViewBilling", "allFieldRoles", `return ${predicate.replace(/ as typeof allFieldRoles\[number\]/g, "")}`);
      expect(access({ activeRole: "crew_supervisor" }, canViewBilling, [])).toBe(true);
      expect(access({ activeRole: "mapping" }, canViewBilling, [])).toBe(false);
      expect(access({ activeRole: "mapping", activeTags: ["billing"] }, canViewBilling, [])).toBe(true);
    }
    expect(getRoute("/dashboard")).not.toContain("crew_supervisor");
    expect(getRoute("/dashboard/notifications")).not.toContain("crew_supervisor");
  });
  it("checklists is registered before the campaign id route with the old tab's roles", () => {
    expect(app.indexOf('path="/dashboard/campaigns/checklists"')).toBeLessThan(app.indexOf('path="/dashboard/campaigns/:id"'));
    expect(getRoute("/dashboard/campaigns/checklists")).toContain('allowedRoles={["admin", "office", "field_manager", "chemical_manager"]}');
    expect(getRoute("/dashboard/operations")).toContain('allowedRoles={["admin", "office", "field_manager", "chemical_manager"]}');
  });
  it.each(["", "customerId=abc&tab=services&filter=a%20b", "q=a%26b%3Dc%23d"])("Operations preserves its query string %s", search => {
    const html = renderToStaticMarkup(<Router ssrSearch={search}><OperationsRedirect /></Router>);
    expect(html).toContain(`data-redirect="/dashboard/campaigns${search ? `?${search.replace(/&/g, "&amp;")}` : ""}"`);
  });
  it("existing mailbox alias preserves email deep-link parameters", () => {
    const html = renderToStaticMarkup(<Router ssrSearch="mailboxId=one"><QueryPreservingRedirect to="/dashboard/settings/shared-mailboxes" /></Router>);
    expect(html).toContain("/dashboard/settings/shared-mailboxes?mailboxId=one");
  });
  it.each(["", "year=2026&filter=a%26b%3Dc%23d"])("old Seasons list redirects with intact query %s", search => {
    const html = renderToStaticMarkup(<Router ssrSearch={search}><SeasonsRedirect /></Router>);
    expect(html).toContain(`data-redirect="/dashboard/settings/seasons${search ? `?${search.replace(/&/g, "&amp;")}` : ""}"`);
    expect(getRoute("/dashboard/seasons")).toContain("component={SeasonsRedirect}");
    expect(getRoute("/dashboard/seasons")).toContain('allowedRoles={["admin", "office"]}');
    expect(getRoute("/dashboard/seasons/:id")).toContain("component={SeasonDetail}");
    const detail = readFileSync(new URL("../../pages/SeasonDetail.tsx", import.meta.url), "utf8");
    expect(detail).toContain('href: "/dashboard/settings/seasons"');
    expect(detail).toContain('navigate("/dashboard/settings/seasons")');
  });
  it("extracts checklists logic without behavioral changes", () => {
    const page = readFileSync(new URL("../../pages/ServiceChecklistsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('queryKey: ["/api/operations/customer-service-summaries"]');
    expect(page).toContain('queryKey: ["/api/customers", customerId, "annual-service-rollup"]');
    expect(page).toContain('data-testid="select-filter-checklist-status"');
  });
});
