// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/i18n";

const fx = vi.hoisted(() => ({ types: [] as any[], statuses: [] as any[], tickets: [] as any[] }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({
  user: { id: "u", activeCompanyId: "c", activeRole: "landscape_supervisor", activeTags: [] },
}) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: ({ queryKey: [key] }: any) => ({
    data: key === "/api/tickets" || key === "/api/tickets/my" ? fx.tickets
      : key === "/api/ticket-types" ? fx.types
      : key === "/api/ticket-type-statuses" || key === "/api/ticket-type-statuses-all" ? fx.statuses
      : undefined,
    isLoading: false, isFetching: false, refetch: vi.fn(),
  }),
}));
import TicketsList from "./TicketsList";
import MyTickets from "./MyTickets";

const projected = ["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"];
const early = ["new", "proposal_sent", "closed_lost", "custom", null, undefined];
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  fx.types = [
    { id: "est", name: "Renamed estimates", typeKey: "estimate_request" },
    { id: "proj", name: "Renamed projects", typeKey: "project" },
    { id: "custom", name: "Project", typeKey: "custom_project" },
    { id: "legacy", name: "Project", typeKey: null },
    { id: "legacy-est", name: "Estimate Request", typeKey: null },
  ];
  fx.tickets = [];
  fx.statuses = [];
  const add = (id: string, type: string, statusKey: string | null | undefined) => {
    fx.statuses.push({ id: `s-${id}`, ticketTypeId: type, statusKey, name: "Scheduled", displayOrder: 1 });
    fx.tickets.push({ id, ticketTypeId: type, currentStatusId: `s-${id}`, title: `Work ${id}`,
      priority: "normal", assignedToId: "u", workType: "extra_work", completedAt: null });
  };
  projected.forEach((key, n) => add(`approved-${n}`, "est", key));
  early.forEach((key, n) => add(`early-${n}`, "est", key));
  add("real", "proj", "new");
  add("custom", "custom", "scheduled");
  add("legacy", "legacy", "scheduled");
  add("legacy-est", "legacy-est", "scheduled");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(mine: boolean, search = "") {
  const location = memoryLocation({ path: `/dashboard/tickets${mine ? "/my" : ""}${search}` });
  const view = render(<QueryClientProvider client={new QueryClient()}>
    <TooltipProvider><Router hook={location.hook} searchHook={location.searchHook}>
      {mine ? <MyTickets /> : <TicketsList />}
    </Router></TooltipProvider>
  </QueryClientProvider>);
  // Billing visibility is an independent existing filter, not type membership.
  if (!mine) fireEvent.click(screen.getByTestId("checkbox-show-billing-items"));
  return view;
}
const has = (id: string) => expect(screen.queryAllByText(`Work ${id}`).length).toBeGreaterThan(0);
const lacks = (id: string) => expect(screen.queryByText(`Work ${id}`)).toBeNull();

describe.each([false, true])("actual display-type pills, My Tickets=%s", mine => {
  const pill = (id: string) => screen.getByTestId(`pill-type-${mine ? "my-" : ""}${id}`);
  it("selects all five approved stages with real Projects, not estimates or name lookalikes; toggles multi-select and clears", () => {
    mount(mine);
    fireEvent.click(pill("proj"));
    projected.forEach((_, n) => has(`approved-${n}`)); has("real");
    early.forEach((_, n) => lacks(`early-${n}`));
    ["custom", "legacy", "legacy-est"].forEach(lacks);
    fireEvent.click(pill("est"));
    early.forEach((_, n) => has(`early-${n}`));
    fireEvent.click(pill("proj"));
    projected.forEach((_, n) => lacks(`approved-${n}`)); lacks("real");
    early.forEach((_, n) => has(`early-${n}`));
    fireEvent.click(pill("est"));
    ["real", "custom", "legacy", "legacy-est"].forEach(has);
    // Same display labels never merge keyed custom and unkeyed catalog rows.
    for (const id of ["custom", "legacy", "legacy-est"]) {
      fireEvent.click(pill(id)); has(id);
      ["real", "custom", "legacy", "legacy-est"].filter(other => other !== id).forEach(lacks);
      lacks("approved-0"); lacks("early-0");
      fireEvent.click(pill(id));
    }
    expect(fx.tickets.find(t => t.id === "approved-0").ticketTypeId).toBe("est");
    expect(fx.types[0].typeKey).toBe("estimate_request");
  });
  it("combines display selection with search and restores both independently", () => {
    mount(mine);
    fireEvent.click(pill("proj"));
    const input = screen.getByTestId(mine ? "input-search-my-tickets" : "input-search");
    fireEvent.change(input, { target: { value: "approved-0" } });
    has("approved-0"); lacks("approved-1"); lacks("real"); lacks("early-0");
    fireEvent.click(pill("est")); lacks("early-0");
    fireEvent.change(input, { target: { value: "" } });
    has("early-0"); has("real");
    fireEvent.click(pill("proj")); fireEvent.click(pill("est"));
    has("custom"); has("legacy");
  });
  it("keeps the approved card's workflow choices sourced from its raw estimate type after filtering", () => {
    mount(mine);
    fireEvent.click(pill("proj"));
    const card = screen.getByTestId("card-ticket-approved-0");
    expect(within(card).getByTestId("bubble-status-s-early-0")).toBeTruthy();
    expect(within(card).getByTestId("bubble-status-s-approved-1")).toBeTruthy();
    expect(within(card).queryByTestId("bubble-status-s-real")).toBeNull();
    expect(within(card).queryByTestId("bubble-status-s-custom")).toBeNull();
  });
  it("keeps projected estimates in raw Estimate board columns with raw workflow steps", () => {
    mount(mine, "?view=kanban-type");
    const column = screen.getByTestId(mine ? "kanban-col-my-type-est" : "kanban-col-type-est");
    expect(within(column).getByText("Work approved-0")).toBeTruthy();
    expect(within(column).getByText("Work early-0")).toBeTruthy();
    const project = screen.getByTestId(mine ? "kanban-col-my-type-proj" : "kanban-col-type-proj");
    expect(within(project).queryByText("Work approved-0")).toBeNull();
    fireEvent.click(pill("proj"));
    expect(within(column).queryByText("Work early-0")).toBeNull();
    expect(within(column).getByText("Work approved-0")).toBeTruthy();
    expect(fx.statuses.find(s => s.id === "s-approved-0").ticketTypeId).toBe("est");
  });
});
