import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({ user: null as any, reviews: 4, billing: 2, seen: [] as { key: readonly unknown[]; enabled?: boolean; staleTime?: number; refetchInterval?: unknown }[] }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (o: { queryKey: readonly unknown[]; enabled?: boolean; staleTime?: number; refetchInterval?: unknown }) => {
    fx.seen.push({ key: o.queryKey, enabled: o.enabled, staleTime: o.staleTime, refetchInterval: o.refetchInterval });
    const k = o.queryKey[0];
    const data = o.enabled === false ? undefined
      : k === "/api/qbo/customer-reviews/count" ? { open: fx.reviews }
      : k === "/api/scheduling/queue" ? { needsScheduling: [], slipped: [] }
      : k === "/api/pending-invoices" ? Array.from({ length: fx.billing }, (_, i) => ({ id: String(i) }))
      : undefined;
    return { data, isLoading: false, isError: false };
  },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
vi.mock("@assets/LOGO_-_SPREAD-06_1773353516653.png", () => ({ default: "logo.png" }));
import "@/i18n";
import AppSidebar from "./AppSidebar";
import BillingPage from "@/pages/BillingPage";
import QboReviewLink from "@/components/qbo/QboReviewLink";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { showBillingSidebar } from "@/lib/billing";
import { reviewCountEligible } from "@/lib/qboReview";

function sidebar(role: string, tags: string[]) {
  fx.user = { id: "u", activeCompanyId: "c", activeRole: role, activeTags: tags };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}><TooltipProvider><Router ssrPath="/dashboard">
      <SidebarProvider><AppSidebar userRole={role as never} activeTags={tags} isSuperAdmin={false} companyId="c" userId="u" /></SidebarProvider>
    </Router></TooltipProvider></QueryClientProvider>);
}
const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);
const badgeText = (html: string, id: string) => html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))?.[1];
beforeEach(() => { fx.reviews = 4; fx.billing = 2; fx.seen = []; });

describe("QuickBooks review badges", () => {
  it.each([["admin", []], ["admin", ["billing"]], ["office", []]])("%s %j: both Invoicing badges, independent counts", (role, tags) => {
    const html = sidebar(role, tags as string[]);
    expect(has(html, "nav-billing")).toBe(true);
    expect(badgeText(html, "badge-billing-sidebar")).toBe("2");
    expect(badgeText(html, "badge-qbo-review-sidebar")).toBe("4");
    expect(has(html, "badge-qbo-review-mytickets")).toBe(false);
  });

  it.each([["office", ["billing"]], ["field", ["billing"]]])("billing-tagged %s: My Tickets badge, Invoicing unchanged (absent)", (role, tags) => {
    const html = sidebar(role, tags);
    expect(showBillingSidebar({ activeRole: role, activeTags: tags })).toBe(false);
    expect(has(html, "nav-billing")).toBe(false);
    expect(has(html, "badge-qbo-review-sidebar")).toBe(false);
    expect(badgeText(html, "badge-qbo-review-mytickets")).toBe("4");
    expect(html.match(/nav-tickets[\s\S]*?badge-qbo-review-mytickets/)).toBeTruthy();
  });

  it("untagged field and field manager: no badge and query disabled", () => {
    for (const role of ["field", "field_manager"]) {
      fx.seen = [];
      const html = sidebar(role, []);
      expect(has(html, "badge-qbo-review-sidebar") || has(html, "badge-qbo-review-mytickets")).toBe(false);
      expect(fx.seen.find(s => s.key[0] === "/api/qbo/customer-reviews/count")?.enabled).toBe(false);
    }
  });

  it("zero count hides badges", () => {
    fx.reviews = 0;
    expect(has(sidebar("admin", []), "badge-qbo-review-sidebar")).toBe(false);
    expect(has(sidebar("field", ["billing"]), "badge-qbo-review-mytickets")).toBe(false);
  });

  it("count query: 30s stale, 60s refresh, company/viewer-scoped key", () => {
    sidebar("field", ["billing"]);
    const q = fx.seen.find(s => s.key[0] === "/api/qbo/customer-reviews/count")!;
    expect(q).toMatchObject({ enabled: true, staleTime: 30_000, refetchInterval: 60_000 });
    fx.seen = [];
    fx.user = { id: "u", activeCompanyId: "c", activeRole: "field", activeTags: ["billing"] };
    renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><Router ssrPath="/x"><QboReviewLink /></Router></QueryClientProvider>);
    const link = fx.seen.find(s => s.key[0] === "/api/qbo/customer-reviews/count")!;
    expect(link.refetchInterval).toBe(false);
    expect(link.key).toEqual(q.key);
    expect(q.key).toEqual(["/api/qbo/customer-reviews/count", "c", "u", "field", "billing"]);
    expect(reviewCountEligible({ activeRole: "office", activeTags: [] })).toBe(true);
    expect(reviewCountEligible({ activeRole: "chemical_manager", activeTags: [] })).toBe(false);
    // Follows actual destination: a super-admin flag does not remove Invoicing eligibility.
    expect(reviewCountEligible({ activeRole: "admin", activeTags: [], isSuperAdminBool: true })).toBe(true);
  });

  it("Invoicing header link shows only for nonzero count", () => {
    fx.user = { id: "u", activeCompanyId: "c", activeRole: "admin", activeTags: [] };
    const wrap = (n: ReactElement) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><Router ssrPath="/dashboard/invoicing">{n}</Router></QueryClientProvider>);
    expect(wrap(<BillingPage />)).toContain("QuickBooks customer review (4)");
    fx.reviews = 0;
    expect(wrap(<BillingPage />)).not.toContain("QuickBooks customer review");
    fx.reviews = 3;
    fx.user = { id: "u", activeCompanyId: "c", activeRole: "field", activeTags: ["billing"] };
    expect(wrap(<QboReviewLink testId="link-qbo-review-to-invoice" />)).toContain("QuickBooks customer review (3)");
  });

  it("MyTickets renders the To invoice link above content only for the alternate destination", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../pages/MyTickets.tsx", import.meta.url), "utf8");
    const link = src.indexOf("link-qbo-review-to-invoice");
    expect(link).toBeGreaterThan(0);
    expect(src.slice(link - 300, link)).toContain("isBillingPerson(user) && !showBillingSidebar(user)");
    expect(link).toBeLessThan(src.indexOf('scope="mine"'));
  });
});
