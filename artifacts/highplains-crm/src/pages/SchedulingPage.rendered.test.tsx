// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
const auth = vi.hoisted(() => ({ company: "c1" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeCompanyId: auth.company, activeRole: "admin" } }) }));
const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((e: any) => void),
  onDragStart: null as null | ((e: any) => void),
  onDragCancel: null as null | (() => void),
  props: {} as Record<string, any>,
  overlayProps: {} as Record<string, any>,
  activeId: null as string | null,
}));
vi.mock("@dnd-kit/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ children, ...props }: any) => {
      dnd.onDragEnd = props.onDragEnd;
      dnd.onDragStart = props.onDragStart;
      dnd.onDragCancel = props.onDragCancel;
      dnd.props = props;
      return <>{children}</>;
    },
    DragOverlay: ({ children, ...props }: any) => { dnd.overlayProps = props; return <>{children}</>; },
    useDraggable: (options: any) => ({
      ...actual.useDraggable(options), isDragging: dnd.activeId === options.id,
    }),
  };
});
import SchedulingPage from "./SchedulingPage";
const drop = (activeData: unknown, overData: unknown) => dnd.onDragEnd!({ active: { data: { current: activeData } }, over: { data: { current: overData } } });

const visit = (id: string, order: number, extra: Record<string, unknown> = {}) => ({
  id, crewId: "k1", visitDate: "2025-10-21", sourceType: "ticket", ticketId: `t-${id}`, customerId: "cu", title: null,
  routeOrder: order, startTime: null, estimatedHours: 2, status: "planned", notes: null, serviceKey: "mowing",
  ticket: { id: `t-${id}`, title: `Job ${id}`, typeKey: "task", typeName: "Task", statusKey: "scheduled", statusName: "Scheduled", priority: "normal", scheduleBy: null },
  customer: { id: "cu", name: `Prop ${id}` }, crew: { id: "k1", name: "Crew 1", color: "#16a34a" }, ...extra,
});
const calls: { method: string; url: string; body?: any }[] = [];
type Reply = { status?: number; json: unknown } | undefined;
let respond: (method: string, url: string) => Reply | Promise<Reply>;

beforeEach(() => {
  auth.company = "c1";
  dnd.activeId = null;
  calls.length = 0;
  toast.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  respond = () => undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const o = await respond(method, url);
    const def = (() => {
      if (url.startsWith("/api/scheduling/queue")) return { json: { needsScheduling: [{ id: "t9", title: "Spring cleanup", typeKey: "task", typeName: "Task", priority: "high", scheduleBy: "2000-01-01", serviceType: "cleanups", customer: { id: "cu", name: "Elm Park", city: "Denver" }, followUpDate: null, createdAt: "2025-01-01" }], slipped: [{ id: "t8", title: "Slipped job", typeKey: "task", typeName: "Task", priority: "normal", scheduleBy: null, serviceType: null, customer: { id: "cu", name: "Oak HOA", city: null }, followUpDate: null, createdAt: "2025-01-01", visit: { id: "vs", visitDate: "2025-10-14", crewId: "k1", crewName: "Crew 1" } }] } };
      if (url.startsWith("/api/crews/board")) return { json: [{ id: "k1", name: "Crew 1", color: "#16a34a", defaultHoursPerDay: 8, supervisorName: "Sam" }] };
      if (url.startsWith("/api/visits/summary")) return { json: [{ crewId: "k1", date: "2025-10-21", visitCount: 2, plannedHours: 7.2, capacityHours: 8 }] };
      if (url.startsWith("/api/visits?")) return { json: [visit("a", 1), visit("b", 2)] };
      return { json: { ok: true, ticketSync: { statusChanged: true, newStatusKey: "scheduled" } } };
    })();
    const r: { status?: number; json: unknown } = o ?? def;
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(cleanup);

function mount() {
  const { hook, searchHook } = memoryLocation({ path: "/dashboard/scheduling?week=2025-10-20" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Router hook={hook} searchHook={searchHook}><SchedulingPage /></Router></QueryClientProvider>);
}

describe("SchedulingPage", () => {
  it("uses independent panes, crew-owned lanes and real display-type rails", async () => {
    mount();
    const card = await screen.findByTestId("card-queue-t9");
    expect(screen.getByTestId("page-scheduling").className).not.toContain("max-w");
    expect(screen.getByTestId("panel-queue")).not.toBe(screen.getByTestId("board-scroll"));
    expect(screen.getByTestId("lane-k1").getAttribute("data-crew-color")).toBe("#16a34a");
    expect(screen.getByTestId("row-crew-k1").getAttribute("style")).toContain("--crew");
    expect(screen.getByTestId("text-crew-week-k1").textContent).toContain("7.2");
    expect(screen.getByTestId("capacity-bar-k1-2025-10-21").getAttribute("data-tone")).toBe("amber");
    expect(screen.getByTestId("rail-queue-t9").getAttribute("data-hue")).toContain("--tt-extra");
    expect(within(card).getByTestId("badge-queue-type-t9").innerHTML).toContain("--tt-extra");
    expect(screen.getByTestId("rail-visit-a").getAttribute("data-hue")).toContain("--tt-extra");
    expect(screen.getByTestId("empty-cell-k1-2025-10-22").textContent).toBe("Drop a job here");
    expect(screen.getByTestId("scheduling-header").contains(screen.getByTestId("button-today"))).toBe(true);
    expect(dnd.props.autoScroll.layoutShiftCompensation).toBe(false);
    expect(dnd.props.autoScroll.enabled).toBe(false); // A dedicated bounded pane loop owns scrolling.
    expect(dnd.props.sensors.map((s: any) => s.sensor.name)).toEqual(["PointerSensor", "KeyboardSensor"]);
    expect(dnd.props.sensors[0].options.activationConstraint.distance).toBe(6);
    expect(dnd.props.sensors[1].options.coordinateGetter).toBeTypeOf("function");
  });

  it("renders group counts, server order, late-day labels, and keeps undated jobs in Later", async () => {
    const today = (await import("../lib/schedulingStatus")).companyToday();
    const { addDaysYmd } = await import("../lib/schedulingStatus");
    respond = (_m, url) => url.startsWith("/api/scheduling/queue") ? { json: {
      needsScheduling: [
        { id: "late-z", title: "Z first", typeKey: "task", typeName: "Task", scheduleBy: addDaysYmd(today, -1) },
        { id: "none", title: "No date", typeKey: "task", typeName: "Task", scheduleBy: null },
        { id: "late-a", title: "A second", typeKey: "task", typeName: "Task", scheduleBy: addDaysYmd(today, -4) },
        { id: "today", title: "Today", typeKey: "task", typeName: "Task", scheduleBy: today },
      ], slipped: [],
    } } : undefined;
    mount();
    await screen.findByTestId("card-queue-late-z");
    expect(screen.getByTestId("queue-group-count-past").textContent).toBe("2");
    expect(screen.getByTestId("queue-group-count-week").textContent).toBe("1");
    expect(screen.getByTestId("queue-group-count-later").textContent).toBe("1");
    const cards = [...screen.getByTestId("list-queue").querySelectorAll("[data-testid^='card-queue-']")];
    expect(cards.map(c => c.getAttribute("data-testid"))).toEqual([
      "card-queue-late-z", "card-queue-late-a", "card-queue-today", "card-queue-none",
    ]);
    expect(screen.getByTestId("text-queue-scheduleby-late-a").textContent).toContain("4 days late");
    expect(screen.getByTestId("text-queue-scheduleby-late-z").getAttribute("data-urgency")).toBe("late");
    expect(screen.getByTestId("text-queue-scheduleby-today").getAttribute("data-urgency")).toBe("soon");
  });

  it("portals a presentation-only overlay while the source remains stationary, then clears on cancel", async () => {
    mount();
    const source = await screen.findByTestId("card-queue-t9");
    const item = { id: "t9", title: "Spring cleanup", typeKey: "task", typeName: "Task", scheduleBy: null };
    act(() => {
      dnd.activeId = "queue:t9";
      dnd.onDragStart!({ active: { data: { current: { kind: "queue", item } } } });
    });
    const overlay = screen.getByTestId("drag-overlay");
    expect(screen.getByTestId("page-scheduling").contains(overlay)).toBe(false);
    expect(document.body.contains(overlay)).toBe(true);
    expect(screen.getByTestId("list-queue").contains(source)).toBe(true);
    expect(source.getAttribute("data-source")).toBe("true");
    expect(source.style.transform).toBe("");
    expect(overlay.getAttribute("data-lifted")).toBe("true");
    expect(overlay.querySelector("a, button, [tabindex]")).toBeNull();
    act(() => { dnd.activeId = null; dnd.onDragCancel!(); });
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    expect(calls.some(c => c.method !== "GET")).toBe(false);
  });

  it("suppresses overlay drop animation for reduced motion", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    try {
      mount();
      await screen.findByTestId("card-queue-t9");
      expect(dnd.overlayProps.dropAnimation).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it("shows a noninteractive pending copy only at the target and clears it after a failed drop", async () => {
    let release!: (r: Reply) => void;
    const response = new Promise<Reply>(resolve => { release = resolve; });
    respond = (m, u) => m === "PATCH" && u === "/api/visits/a" ? response : undefined;
    mount();
    const source = await screen.findByTestId("card-visit-a");
    act(() => drop({ kind: "visit", visit: visit("a", 1) }, { kind: "cell", crewId: "k1", date: "2025-10-24" }));
    const pending = await screen.findByTestId("pending-drop-a");
    expect(screen.getByTestId("cell-k1-2025-10-24").contains(pending)).toBe(true);
    expect(pending.getAttribute("aria-hidden")).toBe("true");
    expect(pending.querySelector("a, button, [tabindex]")).toBeNull();
    expect(screen.getByTestId("cell-k1-2025-10-21").contains(source)).toBe(true);
    expect(screen.getAllByTestId("card-visit-a")).toHaveLength(1);
    await act(async () => release({ status: 409, json: { error: "VISIT_CLOSED", message: "Visit is closed" } }));
    await waitFor(() => expect(screen.queryByTestId("pending-drop-a")).toBeNull());
    expect(screen.getByTestId("cell-k1-2025-10-21").contains(source)).toBe(true);
    expect(toast.mock.calls.some(([a]) => a.description === "Visit is closed")).toBe(true);
  });

  it("shows a presentation-only pending reorder without changing authoritative stop order", async () => {
    let release!: (r: Reply) => void;
    const response = new Promise<Reply>(resolve => { release = resolve; });
    respond = (m, u) => m === "POST" && u === "/api/visits/reorder" ? response : undefined;
    mount();
    await screen.findByTestId("card-visit-b");
    act(() => drop({ kind: "visit", visit: visit("b", 2) }, { kind: "visit", visit: visit("a", 1) }));
    await screen.findByTestId("pending-drop-b");
    const ids = () => [...screen.getByTestId("cell-k1-2025-10-21").querySelectorAll("[data-testid^='card-visit-']")].map(x => x.getAttribute("data-testid"));
    expect(ids()).toEqual(["card-visit-a", "card-visit-b"]);
    await act(async () => release({ json: { ok: true } }));
    await waitFor(() => expect(screen.queryByTestId("pending-drop-b")).toBeNull());
    expect(ids()).toEqual(["card-visit-a", "card-visit-b"]);
  });

  it("clears a successful pending placement without fabricating a visit or changing queue membership", async () => {
    let release!: (r: Reply) => void;
    const response = new Promise<Reply>(resolve => { release = resolve; });
    respond = (m, u) => m === "POST" && u === "/api/visits" ? response : undefined;
    mount();
    const source = await screen.findByTestId("card-queue-t9");
    act(() => drop({ kind: "queue", item: { id: "t9", title: "Spring cleanup" } }, { kind: "cell", crewId: "k1", date: "2025-10-24" }));
    await screen.findByTestId("pending-drop-t9");
    expect(screen.getByTestId("list-queue").contains(source)).toBe(true);
    await act(async () => release({ json: { ok: true } }));
    await waitFor(() => expect(screen.queryByTestId("pending-drop-t9")).toBeNull());
    expect(screen.getAllByTestId("card-queue-t9")).toHaveLength(1);
    expect(screen.getByTestId("cell-k1-2025-10-24").querySelector("[data-testid^='card-visit-']")).toBeNull();
  });

  it("leaves off-board drops unchanged and resets active and pending copies on company switch", async () => {
    let release!: (r: Reply) => void;
    const response = new Promise<Reply>(resolve => { release = resolve; });
    respond = (m, u) => m === "POST" && u === "/api/visits" ? response : undefined;
    const view = mount();
    await screen.findByTestId("card-queue-t9");
    const item = { id: "t9", title: "Spring cleanup", scheduleBy: null };
    act(() => drop({ kind: "queue", item }, undefined));
    expect(calls.some(c => c.method !== "GET")).toBe(false);
    act(() => drop({ kind: "queue", item }, { kind: "cell", crewId: "k1", date: "2025-10-24" }));
    await screen.findByTestId("pending-drop-t9");
    act(() => dnd.onDragStart!({ active: { data: { current: { kind: "queue", item } } } }));
    expect(screen.getByTestId("drag-overlay")).toBeTruthy();
    auth.company = "c2";
    const { hook, searchHook } = memoryLocation({ path: "/dashboard/scheduling?week=2025-10-20" });
    view.rerender(<QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}><SchedulingPage /></Router></QueryClientProvider>);
    expect(screen.queryByTestId("pending-drop-t9")).toBeNull();
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    await act(async () => release({ json: { ok: true } }));
    expect(screen.queryByTestId("pending-drop-t9")).toBeNull();
  });

  it("keeps completed and skipped cards muted without drag handles and supports a collapsible queue", async () => {
    respond = (_m, u) => u.startsWith("/api/visits?") ? { json: [
      visit("done", 1, { status: "done" }), visit("skipped", 2, { status: "skipped" }),
    ] } : undefined;
    mount();
    expect((await screen.findByTestId("card-visit-done")).getAttribute("data-closed")).toBe("true");
    expect(screen.getByTestId("card-visit-skipped").getAttribute("data-closed")).toBe("true");
    expect(screen.queryByTestId("handle-visit-done")).toBeNull();
    expect(screen.queryByTestId("handle-visit-skipped")).toBeNull();
    fireEvent.click(screen.getByTestId("button-toggle-queue"));
    expect(screen.getByTestId("button-toggle-queue").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByTestId("button-toggle-queue"));
    expect(screen.getByTestId("button-toggle-queue").getAttribute("aria-expanded")).toBe("true");
  });

  it.each(["light", "dark"])("uses display metadata for queue/visit identities but raw keys for filters in %s", async theme => {
    document.documentElement.className = theme === "dark" ? "dark" : "";
    respond = (_method, url) => {
      if (url.startsWith("/api/scheduling/queue")) return { json: { needsScheduling: [{
        id: "approved", title: "Approved work", typeKey: "estimate_request", typeName: "Renamed estimate",
        displayTypeKey: "project", displayTypeName: "Project", priority: "normal", scheduleBy: null,
        serviceType: null, customer: null, followUpDate: null, createdAt: "2025-01-01",
      }], slipped: [] } };
      if (url.startsWith("/api/visits?")) return { json: [visit("approved", 1, { ticket: {
        id: "approved", title: "Work", typeKey: "estimate_request", typeName: "Renamed estimate",
        displayTypeKey: "project", displayTypeName: "Project", statusKey: "scheduled", statusName: "Scheduled",
        priority: "normal", scheduleBy: null,
      } })] };
    };
    mount();
    const card = await screen.findByTestId("card-queue-approved");
    expect(card.textContent).toContain("Project");
    expect(card.innerHTML).toContain("--tt-project");
    const visitCard = await screen.findByTestId("card-visit-approved");
    expect(visitCard.textContent).toContain("Project");
    const rawOption = screen.getByRole("option", { name: "Renamed estimate" }) as HTMLOptionElement;
    expect(rawOption.value).toBe("estimate_request");
    document.documentElement.className = "";
  });
  it.each(["light", "dark"])("retains empty queue/visit states in %s", async theme => {
    document.documentElement.className = theme === "dark" ? "dark" : "";
    respond = (_method, url) => {
      if (url.startsWith("/api/scheduling/queue")) return { json: { needsScheduling: [], slipped: [] } };
      if (url.startsWith("/api/visits?") || url.startsWith("/api/visits/summary")) return { json: [] };
    };
    mount();
    await waitFor(() => expect(calls.some(c => c.url.startsWith("/api/scheduling/queue"))).toBe(true));
    expect(screen.queryByTestId("card-queue-t9")).toBeNull();
    expect(screen.queryByTestId("card-visit-a")).toBeNull();
    document.documentElement.className = "";
  });
  it("week navigation survives reload and Back without relying on component state", async () => {
    const location = memoryLocation({ path: "/dashboard/scheduling?week=2025-10-20", record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderPage = () => <QueryClientProvider client={qc}><Router hook={location.hook} searchHook={location.searchHook}><SchedulingPage /></Router></QueryClientProvider>;
    const view = render(renderPage());
    await screen.findByTestId("header-day-2025-10-20");
    fireEvent.click(screen.getByTestId("button-next-week"));
    await screen.findByTestId("header-day-2025-10-27");
    expect(location.history?.at(-1)).toContain("week=2025-10-27");
    view.unmount();
    render(renderPage());
    await screen.findByTestId("header-day-2025-10-27");
    // The browser Back location restores the old URL; no local week state remains.
    location.navigate("/dashboard/scheduling?week=2025-10-20", { replace: true });
    await screen.findByTestId("header-day-2025-10-20");
    expect(calls.some(c => c.url.includes("from=2025-10-20&to=2025-10-25"))).toBe(true);
  });
  it("renders queue, board visits, capacity tone and no nested interactive controls", async () => {
    mount();
    expect(await screen.findByTestId("card-visit-a")).toBeTruthy();
    expect(screen.getByTestId("header-cell-k1-2025-10-21").getAttribute("data-tone")).toBe("amber");
    expect(screen.getByTestId("tab-queue-needs").textContent).toContain("(1)");
    expect(screen.getByTestId("text-queue-property-t9").textContent).toBe("Elm Park");
    expect(screen.getByTestId("badge-queue-priority-t9")).toBeTruthy();
    for (const el of document.querySelectorAll("a button, button button, a a, button a")) throw new Error(`nested interactive ${el.outerHTML}`);
  });

  it("Schedule dialog POSTs crew, date and ticket", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-queue-schedule-t9"));
    expect(document.querySelector("button [role='button']")).toBeNull();
    fireEvent.change(await screen.findByTestId("select-visit-crew"), { target: { value: "k1" } });
    fireEvent.change(screen.getByTestId("input-visit-hours"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByTestId("button-visit-submit"));
    await waitFor(() => expect(calls.some(c => c.method === "POST" && c.url === "/api/visits")).toBe(true));
    const post = calls.find(c => c.method === "POST")!;
    expect(post.body).toMatchObject({ ticketId: "t9", crewId: "k1", estimatedHours: 2.5 });
    expect(post.body.visitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls.some(([a]) => String(a.title).includes("→ Scheduled"))).toBe(true);
  });

  it("slipped card PATCHes the existing visit and never POSTs", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("tab-queue-slipped"));
    fireEvent.click(await screen.findByTestId("button-queue-schedule-t8"));
    expect(await screen.findByTestId("text-queue-slipped-t8")).toBeTruthy();
    fireEvent.change(await screen.findByTestId("select-visit-crew"), { target: { value: "k1" } });
    fireEvent.click(screen.getByTestId("button-visit-submit"));
    await waitFor(() => expect(calls.some(c => c.method === "PATCH")).toBe(true));
    expect(calls.find(c => c.method === "PATCH")!.url).toBe("/api/visits/vs");
    expect(calls.some(c => c.method === "POST")).toBe(false);
  });

  it("shows the server message on error", async () => {
    respond = (m, u) => (m === "POST" && u === "/api/visits" ? { status: 409, json: { error: "NOT_SCHEDULABLE", message: "Ticket cannot be scheduled" } } : undefined);
    mount();
    fireEvent.click(await screen.findByTestId("button-queue-schedule-t9"));
    fireEvent.change(await screen.findByTestId("select-visit-crew"), { target: { value: "k1" } });
    fireEvent.click(screen.getByTestId("button-visit-submit"));
    await waitFor(() => expect(toast.mock.calls.some(([a]) => a.description === "Ticket cannot be scheduled" && a.variant === "destructive")).toBe(true));
  });

  it("reorders the full open set when a service filter hides visits", async () => {
    respond = (m, u) => {
      if (m === "GET" && u.startsWith("/api/visits?") && !u.includes("service=")) return { json: [visit("a", 1), visit("h", 2), visit("b", 3), visit("d", 4, { status: "done" })] };
      return undefined;
    };
    mount();
    fireEvent.change(await screen.findByTestId("select-service-filter"), { target: { value: "mowing" } });
    fireEvent.click(await screen.findByTestId("header-cell-k1-2025-10-21"));
    // filtered board returns a,b only (default fixture)
    fireEvent.click(await screen.findByTestId("button-stop-down-a"));
    await waitFor(() => expect(calls.some(c => c.url === "/api/visits/reorder")).toBe(true));
    expect(calls.find(c => c.url === "/api/visits/reorder")!.body).toEqual({ crewId: "k1", visitDate: "2025-10-21", visitIds: ["b", "h", "a"] });
  });

  it("menu hides ticket-only actions on internal visits and Remove on non-planned", async () => {
    respond = (m, u) => (m === "GET" && u.startsWith("/api/visits?")
      ? { json: [visit("i", 1, { sourceType: "internal", ticketId: null, ticket: null, title: "Shop run" }), visit("p", 2, { status: "in_progress" })] } : undefined);
    mount();
    await userEvent.click(await screen.findByTestId("button-visit-menu-i"));
    expect(await screen.findByTestId("menu-edit-i")).toBeTruthy();
    expect(screen.queryByTestId("menu-open-job-i")).toBeNull();
    expect(screen.queryByTestId("menu-add-i")).toBeNull();
    expect(screen.queryByTestId("handle-visit-i")).toBeTruthy();
  });

  it("drop of a queue card on a cell POSTs crew, date and ticket", async () => {
    mount();
    await screen.findByTestId("card-visit-a");
    drop({ kind: "queue", item: { id: "t9", title: "Spring cleanup" } }, { kind: "cell", crewId: "k1", date: "2025-10-22" });
    await waitFor(() => expect(calls.some(c => c.method === "POST")).toBe(true));
    expect(calls.find(c => c.method === "POST")).toMatchObject({ url: "/api/visits", body: { ticketId: "t9", crewId: "k1", visitDate: "2025-10-22" } });
  });

  it("drop of a slipped card PATCHes its existing visit", async () => {
    mount();
    await screen.findByTestId("card-visit-a");
    drop({ kind: "queue", item: { id: "t8", title: "Slipped", visit: { id: "vs" } } }, { kind: "cell", crewId: "k1", date: "2025-10-23" });
    await waitFor(() => expect(calls.some(c => c.method === "PATCH")).toBe(true));
    expect(calls.find(c => c.method === "PATCH")).toMatchObject({ url: "/api/visits/vs", body: { crewId: "k1", visitDate: "2025-10-23" } });
    expect(calls.some(c => c.method === "POST")).toBe(false);
  });

  it("dragging a visit to another cell PATCHes crew and date", async () => {
    mount();
    await screen.findByTestId("card-visit-a");
    drop({ kind: "visit", visit: visit("a", 1) }, { kind: "cell", crewId: "k1", date: "2025-10-24" });
    await waitFor(() => expect(calls.some(c => c.method === "PATCH")).toBe(true));
    expect(calls.find(c => c.method === "PATCH")).toMatchObject({ url: "/api/visits/a", body: { crewId: "k1", visitDate: "2025-10-24" } });
  });

  it("dragging a visit over a sibling reorders with the full ID list", async () => {
    respond = (m, u) => (m === "GET" && u.startsWith("/api/visits?") ? { json: [visit("a", 1), visit("b", 2), visit("c", 3), visit("d", 4, { status: "done" })] } : undefined);
    mount();
    await screen.findByTestId("card-visit-c");
    drop({ kind: "visit", visit: visit("c", 3) }, { kind: "visit", visit: visit("a", 1) });
    await waitFor(() => expect(calls.some(c => c.url === "/api/visits/reorder")).toBe(true));
    expect(calls.find(c => c.url === "/api/visits/reorder")!.body).toEqual({ crewId: "k1", visitDate: "2025-10-21", visitIds: ["c", "a", "b"] });
  });

  it.each([[89, "ok"], [90, "amber"], [101, "red"]])("renders %s%% capacity as %s", async (hours, tone) => {
    respond = (m, u) => (u.startsWith("/api/visits/summary") ? { json: [{ crewId: "k1", date: "2025-10-21", visitCount: 3, plannedHours: hours, capacityHours: 100 }] } : undefined);
    mount();
    const h = await screen.findByTestId("header-cell-k1-2025-10-21");
    await waitFor(() => expect(h.getAttribute("data-tone")).toBe(tone));
    expect(h.textContent).toContain(`${hours} / 100 h`);
  });

  it("falls back to 8 h capacity when the crew default is null", async () => {
    respond = (m, u) => (u.startsWith("/api/crews/board") ? { json: [{ id: "k1", name: "Crew 1", color: "#16a34a", defaultHoursPerDay: null, supervisorName: null }] }
      : u.startsWith("/api/visits/summary") ? { json: [] } : undefined);
    mount();
    expect((await screen.findByTestId("header-cell-k1-2025-10-22")).textContent).toContain("0 / 8 h");
  });

  it("reconciles after a failed write: server message, refetch, no optimistic change", async () => {
    respond = (m, u) => (m === "PATCH" ? { status: 409, json: { error: "VISIT_CLOSED", message: "Visit is closed" } } : undefined);
    mount();
    await screen.findByTestId("card-visit-a");
    const before = calls.filter(c => c.url.startsWith("/api/visits?")).length;
    drop({ kind: "visit", visit: visit("a", 1) }, { kind: "cell", crewId: "k1", date: "2025-10-24" });
    await waitFor(() => expect(toast.mock.calls.some(([a]) => a.description === "Visit is closed")).toBe(true));
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/visits?")).length).toBeGreaterThan(before));
    expect(calls.some(c => c.url.startsWith("/api/scheduling/queue") && calls.indexOf(c) > 0)).toBe(true);
    expect(screen.getByTestId("cell-k1-2025-10-21").contains(screen.getByTestId("card-visit-a"))).toBe(true);
    expect(screen.queryByTestId("cell-k1-2025-10-24")?.querySelector("[data-testid='card-visit-a']")).toBeNull();
  });

  it("company switch resets sheet/dialog state and refetches under the new company", async () => {
    const view = mount();
    fireEvent.click(await screen.findByTestId("header-cell-k1-2025-10-21"));
    expect(await screen.findByTestId("sheet-crew-day")).toBeTruthy();
    auth.company = "c2";
    const { hook, searchHook } = memoryLocation({ path: "/dashboard/scheduling?week=2025-10-20" });
    view.rerender(<QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}><SchedulingPage /></Router></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByTestId("sheet-crew-day")).toBeNull());
  });

  it("has Spanish labels for every scheduling key", async () => {
    const [en, es] = await Promise.all([import("../i18n/locales/en"), import("../i18n/locales/es")]);
    const keys = (o: any, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, p + k + ".") : [p + k]));
    const e = (en as any).default?.scheduling ?? (en as any).en?.scheduling ?? Object.values(en as any).map((x: any) => x?.scheduling).find(Boolean);
    const sp = (es as any).default?.scheduling ?? (es as any).es?.scheduling ?? Object.values(es as any).map((x: any) => x?.scheduling).find(Boolean);
    expect(keys(sp).sort()).toEqual(keys(e).sort());
    expect(sp.services.aeration).toBe("Aireación");
  });
  it("print isolation preserves the portaled sheet itself and hides surrounding app content", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("header-cell-k1-2025-10-21"));
    const sheet = await screen.findByTestId("sheet-crew-day");
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    fireEvent.click(screen.getByTestId("button-print-crew-day"));
    expect(print).toHaveBeenCalledOnce();
    expect(document.body.classList.contains("print-crew-day")).toBe(true);
    const hidden = "body.print-crew-day > *:not([data-crew-day-print]):not(:has([data-crew-day-print]))";
    expect(sheet.matches(hidden)).toBe(false);
    expect(document.querySelector("[data-testid='page-scheduling']")?.closest("body > *")?.matches(hidden)).toBe(true);
    expect(sheet.textContent).toContain("Prop a");
    expect(sheet.textContent).not.toContain("Elm Park");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.body.classList.contains("print-crew-day")).toBe(false);
    print.mockRestore();
  });
});
