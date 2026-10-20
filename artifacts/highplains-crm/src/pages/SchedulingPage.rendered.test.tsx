// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
const auth = vi.hoisted(() => ({ company: "c1" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeCompanyId: auth.company, activeRole: "admin" } }) }));
const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((e: any) => void) }));
vi.mock("@dnd-kit/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return { ...actual, DndContext: ({ children, onDragEnd }: any) => { dnd.onDragEnd = onDragEnd; return <>{children}</>; } };
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
let respond: (method: string, url: string) => { status?: number; json: unknown } | undefined;

beforeEach(() => {
  auth.company = "c1";
  calls.length = 0;
  toast.mockClear();
  respond = () => undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const o = respond(method, url);
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
