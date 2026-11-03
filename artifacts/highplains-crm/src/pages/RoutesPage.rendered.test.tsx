// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "field_manager" } }) }));
const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((e: any) => void) }));
vi.mock("@dnd-kit/core", async importOriginal => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return { ...actual, DndContext: ({ children, ...p }: any) => { dnd.onDragEnd = p.onDragEnd; return <>{children}</>; }, DragOverlay: ({ children }: any) => <>{children}</> };
});
import RoutesPage from "./RoutesPage";

const stop = (id: string, o: Record<string, unknown> = {}) => ({
  id, customerId: `cu-${id}`, serviceKey: "mowing", crewId: "k1", weekday: 2, everyWeeks: 1, anchorDate: "2027-04-06", sortOrder: 0, minutes: 60,
  seasonStart: null, seasonEnd: null, pausedUntil: null, isActive: true, notes: null, updatedAt: `ts-${id}`,
  property: { id: `cu-${id}`, name: `Prop ${id}` }, crew: { id: "k1", name: "Crew 1", color: "#336699", isActive: true },
  season: { start: "2027-04-05", end: "2027-10-29", contractStatus: "covered" }, contractStatus: "covered", reportYear: 2027,
  contract: { agreementId: "ag1", termId: "t1", seasonLabel: "2027 Mowing", sourceDescription: "Renewal", quantity: 26, monthSpread: [0, 0, 0, 3, 5, 4, 4, 4, 4, 2, 0, 0], startDate: "2027-01-01", endDate: "2027-12-31", window: null },
  ...o,
});
const stops = [stop("a", { sortOrder: 0 }), stop("b", { sortOrder: 1, everyWeeks: 2 }), stop("pet", { serviceKey: "pet_station", minutes: 90 })];
const need = { customerId: "n1", name: "New HOA", serviceKey: "mowing", season: 2027, reason: "Needs a route", minutes: null,
  contract: { agreementId: "ag2", termId: "t2", seasonLabel: "2027", sourceDescription: "New 2027 contract · 26 visits · Apr–Oct", quantity: 26, monthSpread: null, startDate: "2027-01-01", endDate: "2027-12-31" } };
const calls: { method: string; url: string; body?: any; headers?: any }[] = [];

beforeEach(() => {
  calls.length = 0; toast.mockClear();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init?.headers });
    const json = (() => {
      if (url.startsWith("/api/routes/status")) return { imported: true, plannerReadOnly: true, latestVisitDate: "2027-11-20", season: { year: 2027, start: "2027-04-05", end: "2027-10-29" }, plannerMessage: "" };
      if (url === "/api/routes/stops" && method === "GET") return stops;
      if (url.startsWith("/api/routes/needs")) return [need];
      if (url.startsWith("/api/routes/decisions")) return [{ id: "d1", customerId: "cu-a", propertyName: "Dup Prop", crewId: "k1", crewName: "Crew 1", weekday: 3, serviceKey: "mowing", minutes: 45, reason: "Duplicate property" }];
      if (url.startsWith("/api/crews/board")) return [{ id: "k1", name: "Crew 1", color: "#336699", defaultHoursPerDay: 8, supervisorName: "Sam" }, { id: "k2", name: "Crew 2", color: "#993366", defaultHoursPerDay: 8 }];
      if (url.startsWith("/api/routes/progress")) return { customerId: "cu-a", serviceKey: "mowing", season: 2027, quantity: 26, contractStatus: "covered", termId: "t1", done: 25, planned: 1, skipped: 3, inProgress: 0, cancelled: 1 };
      if (url === "/api/routes/fill") return { created: 14, through: "2027-11-20" };
      if (url.endsWith("/apply-calendar")) return { moved: 2, cancelled: 1, unchanged: 4 };
      if (method === "PATCH") return { ...stops[0], updatedAt: "ts-new" };
      return { ok: true };
    })();
    return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(cleanup);

function mount(path = "/dashboard/routes") {
  const loc = memoryLocation({ path, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Router hook={loc.hook} searchHook={loc.searchHook}><RoutesPage /></Router></QueryClientProvider>);
  return loc;
}

describe("RoutesPage", () => {
  it("shows chips, lanes, all-service capacity, Every 2 wks tag and calendar deep link", async () => {
    mount();
    expect((await screen.findByTestId("chip-season")).textContent).toBe("2027 season Apr 5 – Oct 29");
    expect(screen.getByTestId("chip-filled").textContent).toBe("Calendar filled through Nov 20");
    await screen.findByTestId("row-stop-a");
    expect(screen.queryByTestId("row-stop-pet")).toBeNull();
    // 60 + 60 + 90 (pet) minutes on Tuesday = 3.5 h across services
    expect(screen.getByTestId("capacity-k1-2").textContent).toContain("3.5 / 8.0 h");
    expect(screen.getByTestId("tag-every2-b").textContent).toBe("Every 2 wks");
    expect(screen.getByTestId("text-crew-week-k1").textContent).toBe("3 stops · 3.0 h a week");
    expect(screen.getByTestId("link-on-calendar").getAttribute("href")).toBe("/dashboard/scheduling?service=mowing");
    expect(screen.getByTestId("text-need-source-n1").textContent).toContain("New 2027 contract");
  });

  it("service switch changes the displayed service and needs query", async () => {
    const loc = mount();
    await screen.findByTestId("row-stop-a");
    fireEvent.click(screen.getByTestId("tab-service-pet_station"));
    await screen.findByTestId("row-stop-pet");
    expect(screen.queryByTestId("row-stop-a")).toBeNull();
    expect(loc.history!.at(-1)).toBe("/dashboard/routes?service=pet_station");
    await waitFor(() => expect(calls.some(c => c.url === "/api/routes/needs?service=pet_station")).toBe(true));
  });

  it("dropping a needs card opens the dialog (60 min weekly) and only then creates", async () => {
    mount();
    await screen.findByTestId("row-stop-a");
    dnd.onDragEnd!({ active: { data: { current: { kind: "need", need } } }, over: { data: { current: { kind: "cell", crewId: "k2", weekday: 4 } } } });
    expect((await screen.findByTestId("input-new-minutes") as HTMLInputElement).value).toBe("60");
    expect(screen.getByTestId("button-new-cadence-1").getAttribute("aria-pressed")).toBe("true");
    expect(calls.some(c => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByTestId("button-new-cadence-2"));
    fireEvent.click(screen.getByTestId("button-new-confirm"));
    await waitFor(() => expect(calls.some(c => c.method === "POST" && c.url === "/api/routes/stops")).toBe(true));
    const post = calls.find(c => c.method === "POST" && c.url === "/api/routes/stops")!;
    expect(post.body).toMatchObject({ customerId: "n1", serviceKey: "mowing", crewId: "k2", weekday: 4, everyWeeks: 2, minutes: 60 });
    expect(post.headers["X-Company-Id"]).toBe("c1");
  });

  it("cancelling the dialog creates nothing", async () => {
    mount();
    await screen.findByTestId("row-stop-a");
    dnd.onDragEnd!({ active: { data: { current: { kind: "need", need } } }, over: { data: { current: { kind: "cell", crewId: "k2", weekday: 4 } } } });
    fireEvent.click(await screen.findByTestId("button-new-cancel"));
    expect(calls.some(c => c.method === "POST")).toBe(false);
  });

  it("moves PATCH crew/weekday and reorders send the full ID list", async () => {
    mount();
    await screen.findByTestId("row-stop-a");
    dnd.onDragEnd!({ active: { data: { current: { kind: "stop", stop: stops[0] } } }, over: { data: { current: { kind: "cell", crewId: "k2", weekday: 3 } } } });
    await waitFor(() => expect(calls.find(c => c.method === "PATCH")).toMatchObject({ url: "/api/routes/stops/a", body: { crewId: "k2", weekday: 3 } }));
    dnd.onDragEnd!({ active: { data: { current: { kind: "stop", stop: stops[1] } } }, over: { data: { current: { kind: "stop", stop: stops[0] } } } });
    await waitFor(() => expect(calls.find(c => c.url === "/api/routes/stops/reorder")?.body).toEqual({ crewId: "k1", weekday: 2, serviceKey: "mowing", stopIds: ["b", "a"] }));
  });

  it("Fill shows the returned counts", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-fill"));
    await waitFor(() => expect(toast.mock.calls.some(([a]) => String(a.description).startsWith("14 route visits added"))).toBe(true));
  });

  it("decisions resolve with Keep or Remove", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-keep-d1"));
    await waitFor(() => expect(calls.find(c => c.url === "/api/routes/decisions/d1/resolve")?.body).toEqual({ resolution: "keep" }));
  });

  it("drawer progress comes from the API; calendar update is explicit and confirmed", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("row-stop-a"));
    const drawer = await screen.findByTestId("drawer-route-stop");
    expect((await within(drawer).findByTestId("text-progress-done")).textContent).toBe("25 of 26 visits done");
    expect(within(drawer).getByTestId("text-progress-detail").textContent).toBe("1 planned · 3 skipped");
    expect(within(drawer).getByTestId("month-5").textContent).toContain("5");
    expect(within(drawer).getByTestId("text-effect-note").textContent).toBe("Applies to visits not yet on the calendar.");
    fireEvent.click(within(drawer).getByTestId("button-cadence-2"));
    expect((within(drawer).getByTestId("button-apply-calendar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(drawer).getByTestId("button-save-stop"));
    await waitFor(() => expect(calls.find(c => c.method === "PATCH")?.body).toEqual({ everyWeeks: 2 }));
    expect(calls.some(c => c.url.endsWith("/apply-calendar"))).toBe(false);
    await waitFor(() => expect((screen.getByTestId("button-apply-calendar") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-apply-calendar"));
    fireEvent.click(await screen.findByTestId("button-confirm-apply"));
    await waitFor(() => expect(calls.find(c => c.url === "/api/routes/stops/a/apply-calendar")?.body).toEqual({ expectedUpdatedAt: "ts-new" }));
  });
});
