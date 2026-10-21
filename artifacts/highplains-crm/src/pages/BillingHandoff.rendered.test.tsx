import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({ user: null as any, mine: [] as any[] }));
vi.mock("wouter", async importOriginal => ({
  ...await importOriginal<typeof import("wouter")>(),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
}));
const types = [
  { id: "tt-task", name: "Task", typeKey: "task" },
  { id: "tt-inv", name: "Invoice", typeKey: "invoice" },
];
const statuses = [
  { id: "s-prog", ticketTypeId: "tt-task", name: "In progress", statusKey: "in_progress", displayOrder: 1 },
  { id: "s-rfb", ticketTypeId: "tt-task", name: "Ready to invoice", statusKey: "ready_for_billing", displayOrder: 2 },
  { id: "s-pend", ticketTypeId: "tt-inv", name: "Pending invoice", statusKey: "pending_invoice", displayOrder: 1 },
];
const tk = (id: string, ticketTypeId: string, currentStatusId: string) => ({
  id, title: `Title ${id}`, ticketTypeId, currentStatusId, assignedToId: "u", priority: "normal", completedAt: null,
});
const tickets = [tk("work1", "tt-task", "s-prog"), tk("rfb1", "tt-task", "s-rfb"), tk("inv1", "tt-inv", "s-pend")];

vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: (o: any) => {
    const k = o.queryKey[0];
    const data = k === "/api/tickets/my" || k === "/api/tickets" ? tickets
      : k === "/api/ticket-types" ? types
      : k === "/api/ticket-type-statuses" || k === "/api/ticket-type-statuses-all" ? statuses
      : k === "/api/pending-invoices" ? fx.mine
      : undefined;
    return { data, isLoading: false, isError: false, isFetching: false, refetch: () => {} };
  },
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";
import MyTickets from "./MyTickets";
import TicketsList from "./TicketsList";
import { WorkPageLayout } from "@/components/nav/WorkPageLayout";

const render = (el: any, path: string, search = "") =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider><Router ssrPath={path} ssrSearch={search}>{el}</Router></TooltipProvider>
    </QueryClientProvider>,
  );
const as = (role: string, tags: string[] = []) => {
  fx.user = { id: "u", activeCompanyId: "c", activeRole: role, activeTags: tags, isSuperAdminBool: false };
};
const my = (search = "") => render(<MyTickets />, "/dashboard/tickets/my", search);

describe("MyTickets billing handoff", () => {
  it("the rail shell preserves the explicit My Tickets invoice landing and internal tabs", () => {
    as("office", ["billing"]); fx.mine = [{ id: "a" }, { id: "b" }];
    const html = render(
      <WorkPageLayout path="/dashboard/tickets/my"><MyTickets /></WorkPageLayout>,
      "/dashboard/tickets/my", "tab=invoice",
    );
    expect(html).toContain('data-testid="rail-mine"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("To invoice (2)");
    expect(html).toContain("Other tickets (1)");
    expect(html).toContain('data-testid="billing-view"');
    expect(html).not.toContain("Title work1");
  });
  it("billing person defaults to To invoice with the mine-query count", () => {
    as("office", ["billing"]); fx.mine = [{ id: "a" }, { id: "b" }];
    const html = my();
    expect(html).toContain("To invoice (2)");
    expect(html).toContain("Other tickets (1)");
    expect(html).toContain('data-testid="billing-view"');
    expect(html).toContain("2 charges waiting");
    expect(html).not.toContain("Title rfb1");
  });
  it("?tab=other shows ordinary tickets minus billing items", () => {
    as("office", ["billing"]); fx.mine = [{ id: "a" }];
    const html = my("tab=other");
    expect(html).toContain("Title work1");
    expect(html).not.toContain("Title rfb1");
    expect(html).not.toContain("Title inv1");
    expect(html).not.toContain('data-testid="billing-view"');
  });
  it("untagged user with a non-empty mine list gets tabs defaulting to Other", () => {
    as("office"); fx.mine = [{ id: "a" }];
    const html = my();
    expect(html).toContain("To invoice (1)");
    expect(html).toContain("Title work1");
  });
  it("tab-less user: no tabs, muted removed-jobs line, billing items gone", () => {
    as("field_manager"); fx.mine = [];
    const html = my();
    expect(html).not.toContain("tabs-my-billing");
    expect(html).toContain("2 of your jobs are with billing");
    expect(html).toContain("Title work1");
    expect(html).not.toContain("Title rfb1");
  });
  it("landscape supervisor My Work is unchanged", () => {
    as("landscape_supervisor"); fx.mine = [{ id: "a" }];
    const html = my();
    expect(html).not.toContain("tabs-my-billing");
    expect(html).not.toContain("with billing");
    expect(html).toContain("Title rfb1");
  });
});

describe("TicketsList billing filtering", () => {
  it("legacy billing URLs redirect before mounting URL-normalizing operational content", () => {
    as("office", ["billing"]);
    const html = render(<TicketsList />, "/dashboard/tickets", "view=billing");
    expect(html).toContain('data-redirect="/dashboard/invoicing"');
    expect(html).not.toContain("checkbox-show-billing-items");
  });
  it("hides billing items by default and omits the Invoice board column", () => {
    as("admin");
    const list = render(<TicketsList />, "/dashboard/tickets");
    expect(list).toContain("Title work1");
    expect(list).not.toContain("Title rfb1");
    expect(list).not.toContain("Title inv1");
    expect(list).not.toContain("section-with-billing");
    expect(list).toContain("checkbox-show-billing-items");
    expect(list).not.toContain("button-view-billing");
    const byType = render(<TicketsList />, "/dashboard/tickets", "view=kanban-type");
    expect(byType).toContain("Title work1");
    expect(byType).not.toContain("Title inv1");
    const byUser = render(<TicketsList />, "/dashboard/tickets", "view=kanban-user");
    expect(byUser).not.toContain("Title rfb1");
  });
});
