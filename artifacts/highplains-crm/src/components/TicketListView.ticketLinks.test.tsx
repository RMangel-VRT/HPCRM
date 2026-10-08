import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import type { TicketLinkSummary } from "@shared/ticketLinks";

const fixtures = vi.hoisted(() => ({ tickets: [] as any[], queries: [] as string[] }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey.join("/");
    fixtures.queries.push(key);
    let data: unknown = [];
    if (key === "/api/customers/customer-ui/tickets") data = fixtures.tickets;
    if (key === "/api/ticket-types") data = [
      { id: "task", name: "Renamed Task", typeKey: "task" },
      { id: "project", name: "Renamed Project", typeKey: "project" },
      { id: "invoice", name: "Renamed Invoice", typeKey: "invoice" },
    ];
    if (key === "/api/ticket-type-statuses-all") data = [
      { id: "task-sched", ticketTypeId: "task", name: "Needs scheduling", statusKey: "ready_to_schedule", displayOrder: 0, isFinal: "false" },
      { id: "project-sched", ticketTypeId: "project", name: "Needs scheduling", statusKey: "ready_to_schedule", displayOrder: 0, isFinal: "false" },
      { id: "pending", ticketTypeId: "invoice", name: "Renamed pending", statusKey: "pending_invoice", displayOrder: 0, isFinal: "false" },
      { id: "done", ticketTypeId: "invoice", name: "Renamed final", statusKey: "invoiced", displayOrder: 1, isFinal: "true" },
    ];
    if (key === "/api/scheduling-status") data = { schedulingStatusIds: ["task-sched", "project-sched"] };
    return { data, isLoading: false };
  },
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: "office" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import TicketListView from "./TicketListView";
import { TooltipProvider } from "./ui/tooltip";

const invoice = (id: string, statusKey = "pending_invoice", isFinal = false) => ({
  id, title: id, statusKey, statusName: "Renamed status", isFinal,
});
const row = (id: string, type = "task", status = "task-sched", linkSummary: TicketLinkSummary = { invoices: [], parent: null }) => ({
  id, title: `Title ${id}`, ticketTypeId: type, currentStatusId: status,
  priority: "normal", customerId: "customer-ui", completedAt: null,
  billingBehavior: "invoice_required", linkSummary,
});
const render = () => renderToStaticMarkup(
  <Router ssrPath="/dashboard/customers/customer-ui">
  <TooltipProvider>
    <TicketListView customerId="customer-ui" showHeader={false} showCustomerColumn={false}
      showNewTicketButton={false} showBatchActions={false} showQuickAdd={false} />
  </TooltipProvider>
  </Router>,
);

beforeEach(() => { fixtures.queries = []; fixtures.tickets = []; });
describe("customer TicketListView relationship rendering", () => {
  it("retains API summaries through enrichment and each card's own link", () => {
    fixtures.tickets = [
      row("job", "task", "task-sched", { invoices: [invoice("bill"), invoice("bill2", "invoiced", true)], parent: null }),
      row("bill", "invoice", "pending", { invoices: [], parent: { id: "job", title: "Title job", typeKey: "task", typeName: "Renamed Task" } }),
      row("bill2", "invoice", "done", { invoices: [], parent: { id: "job", title: "Title job", typeKey: "task", typeName: "Renamed Task" } }),
      row("standalone", "invoice", "pending"),
    ];
    const html = render();
    expect(fixtures.queries).toContain("/api/customers/customer-ui/tickets");
    expect(html).toContain("2 invoices · 1 pending");
    expect(html.match(/For: Title job/g)).toHaveLength(2);
    expect(html).toContain("var(--tt-extra)");
    expect(html.match(/<a\b/g)).toHaveLength(4);
    for (const id of ["job", "bill", "bill2", "standalone"]) {
      expect(html).toContain(`href="/dashboard/tickets/${id}"`);
    }
    expect(html.match(/data-testid="invoice-parent-line"/g)).toHaveLength(2);
  });

  it.each([
    ["pending_invoice", false, "Pending", "--ts-open"],
    ["invoiced", true, "Invoiced", "--ts-done"],
  ] as const)("renders the single invoice label/color for %s", (key, final, label, color) => {
    fixtures.tickets = [row("job", "task", "task-sched", { invoices: [invoice("bill", key, final)], parent: null })];
    const html = render();
    expect(html).toContain(`Invoice · ${label}`);
    expect(html).toContain(`var(${color})`);
  });

  it("preserves plural scheduling status handling for both Task and Project", () => {
    fixtures.tickets = [row("job"), row("project", "project", "project-sched")];
    const html = render();
    expect(html.match(/data-testid="badge-needs-scheduling-/g)).toHaveLength(2);
    expect(html.match(/ring-pink-500/g)).toHaveLength(2);
  });
});
