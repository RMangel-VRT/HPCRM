import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fixtures = vi.hoisted(() => ({ user: null as any }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (options: { queryKey: readonly unknown[] }) => ({
    data: options.queryKey[0] === "/api/scheduling/queue"
      ? { needsScheduling: [], slipped: [] }
      : [{ id: "a" }, { id: "b" }, { id: "c" }],
    isLoading: false, isError: false,
  }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fixtures.user, isLoading: false }) }));
vi.mock("@assets/LOGO_-_SPREAD-06_1773353516653.png", () => ({ default: "logo.png" }));
import "@/i18n";
import AppSidebar from "./AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/lib/protected-route";
import { BILLING_LANDING, canViewBilling, isBillingPerson, showBillingSidebar } from "@/lib/billing";

function sidebar(role: any, tags: string[], isSuperAdmin = false) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider><Router ssrPath="/dashboard">
        <SidebarProvider><AppSidebar userRole={role} activeTags={tags} isSuperAdmin={isSuperAdmin} companyId="c" userId="u" /></SidebarProvider>
      </Router></TooltipProvider>
    </QueryClientProvider>,
  );
}
function route(role: any, tags: string[]) {
  fixtures.user = { id: "u", activeRole: role, activeTags: tags, isSuperAdminBool: false };
  const Page = () => <div data-testid="billing-page-marker" />;
  return renderToStaticMarkup(
    <Router ssrPath="/dashboard/invoicing">
      <ProtectedRoute path="/dashboard/invoicing" component={Page} access={canViewBilling} />
    </Router>,
  ).includes("billing-page-marker");
}

describe("billing sidebar and access", () => {
  it("office + billing-tagged: no entry or badge, lands on To invoice, keeps direct URL", () => {
    const html = sidebar("office", ["billing"]);
    expect(html).not.toContain('data-testid="nav-billing"');
    expect(html).not.toContain("badge-billing-sidebar");
    expect(isBillingPerson({ activeRole: "office", activeTags: ["billing"] })).toBe(true);
    expect(BILLING_LANDING).toBe("/dashboard/tickets/my?tab=invoice");
    expect(route("office", ["billing"])).toBe(true);
  });
  it("untagged office and admins (tagged or not) keep entry and badge", () => {
    for (const [role, tags] of [["office", []], ["admin", []], ["admin", ["billing"]]] as const) {
      const html = sidebar(role, [...tags]);
      expect(html).toContain('data-testid="nav-billing"');
      expect(html).toContain('data-testid="badge-billing-sidebar"');
    }
  });
  it("active admins keep Billing in the platform-admin layout too", () => {
    const html = sidebar("admin", ["billing"], true);
    expect(html).toContain('data-testid="nav-billing"');
    expect(html).toContain('data-testid="badge-billing-sidebar"');
  });
  it("field users: untagged denied, tagged allowed route but no sidebar rule", () => {
    expect(route("field_manager", [])).toBe(false);
    expect(route("field_manager", ["billing"])).toBe(true);
    expect(showBillingSidebar({ activeRole: "field_manager", activeTags: ["billing"] })).toBe(false);
    expect(sidebar("field_manager", ["billing"])).not.toContain("nav-billing");
  });
});
