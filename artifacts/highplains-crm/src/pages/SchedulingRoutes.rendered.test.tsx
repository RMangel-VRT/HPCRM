// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: "office" } }) }));
import SchedulingPage from "./SchedulingPage";

const rv = (id: string, order: number, extra: Record<string, unknown> = {}) => ({
  id, crewId: "k1", visitDate: "2025-10-21", routeOccurrenceDate: "2025-10-21", sourceType: "route", ticketId: null, customerId: `cu-${id}`, title: null,
  routeOrder: order, startTime: null, estimatedHours: 1.5, status: "planned", notes: null, serviceKey: "mowing", ticket: null,
  customer: { id: `cu-${id}`, name: `Prop ${id}` }, crew: { id: "k1", name: "Crew 1", color: "#16a34a" }, ...extra,
});
const ticket = { ...rv("t", 3), sourceType: "ticket", ticketId: "tk", routeOccurrenceDate: null, serviceKey: null,
  ticket: { id: "tk", title: "Fix valve", typeKey: "task", typeName: "Task", statusKey: "scheduled", statusName: "Scheduled", priority: "normal", scheduleBy: null } };
const calls: { method: string; url: string; body?: any }[] = [];

beforeEach(() => {
  calls.length = 0; toast.mockClear(); localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (() => {
      if (url.startsWith("/api/scheduling/queue")) return { needsScheduling: [], slipped: [] };
      if (url.startsWith("/api/crews/board")) return [{ id: "k1", name: "Crew 1", color: "#16a34a", defaultHoursPerDay: 8 }];
      if (url.startsWith("/api/visits/summary")) return [{ crewId: "k1", date: "2025-10-21", visitCount: 4, plannedHours: 6, capacityHours: 8 }];
      if (url.startsWith("/api/visits?")) {
        const all = [rv("b", 2), rv("a", 1), rv("p", 1, { serviceKey: "pet_station" }), rv("s", 4, { visitDate: "2025-10-22", routeOccurrenceDate: "2025-10-21" }), ticket];
        const svc = new URL(url, "http://x").searchParams.get("service");
        return svc ? all.filter(v => v.serviceKey === svc) : all;
      }
      if (url === "/api/routes/slide") return { moved: 7 };
      return { ok: true };
    })();
    return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(cleanup);

function mount(path = "/dashboard/scheduling?week=2025-10-20") {
  const { hook, searchHook } = memoryLocation({ path });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Router hook={hook} searchHook={searchHook}><SchedulingPage /></Router></QueryClientProvider>);
}

describe("Scheduling route blocks", () => {
  it("groups route visits per crew/day/service, keeps ticket cards and unfiltered capacity", async () => {
    mount();
    const block = await screen.findByTestId("route-block-k1-2025-10-21-mowing");
    expect(block.textContent).toContain("Mowing route · 2 stops · 3 h");
    expect(screen.getByTestId("route-block-k1-2025-10-21-pet_station")).toBeTruthy();
    expect(screen.queryByTestId("card-visit-a")).toBeNull();
    expect(screen.getByTestId("card-visit-t")).toBeTruthy();
    expect(screen.getByTestId("header-cell-k1-2025-10-21").textContent).toContain("6 / 8 h");
    expect(block.getAttribute("data-slid")).toBe("false");
    expect(screen.getByTestId("route-block-k1-2025-10-22-mowing").getAttribute("data-slid")).toBe("true");
    expect(screen.getByTestId("text-route-slid-k1-2025-10-22-mowing")).toBeTruthy();
    expect(block.querySelector("[aria-roledescription]")).toBeNull();
  });

  it("expands stops in route order; Skip cancels one visit", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-route-block-k1-2025-10-21-mowing"));
    const list = screen.getByTestId("list-route-k1-2025-10-21-mowing");
    expect(within(list).getAllByTestId(/^route-stop-/).map(e => e.dataset.testid)).toEqual(["route-stop-a", "route-stop-b"]);
    await userEvent.click(screen.getByTestId("button-route-stop-menu-a"));
    await userEvent.click(await screen.findByTestId("menu-route-skip-a"));
    fireEvent.click(await screen.findByTestId("button-confirm-remove"));
    await waitFor(() => expect(calls.filter(c => c.method === "DELETE").map(c => c.url)).toEqual(["/api/visits/a"]));
  });

  it("Hide routes collapses to a summary line and persists per viewer", async () => {
    const r = mount();
    await screen.findByTestId("route-block-k1-2025-10-21-mowing");
    fireEvent.click(screen.getByTestId("toggle-hide-routes"));
    expect(screen.getByTestId("routes-line-k1-2025-10-21").textContent).toBe("Routes: 3 stops");
    expect(screen.getByTestId("header-cell-k1-2025-10-21").textContent).toContain("6 / 8 h");
    expect(localStorage.getItem("hp.scheduling.hideRoutes.u1.c1")).toBe("1");
    r.unmount();
    mount();
    expect(await screen.findByTestId("routes-line-k1-2025-10-21")).toBeTruthy();
  });

  it("honors the service deep link; capacity stays unfiltered", async () => {
    mount("/dashboard/scheduling?week=2025-10-20&service=mowing");
    await screen.findByTestId("route-block-k1-2025-10-21-mowing");
    expect(screen.queryByTestId("route-block-k1-2025-10-21-pet_station")).toBeNull();
    expect((screen.getByTestId("select-service-filter") as HTMLSelectElement).value).toBe("mowing");
    expect(calls.some(c => c.url.startsWith("/api/visits/summary") && c.url.includes("service="))).toBe(false);
  });

  it("Rain day sends the slide body for each mode and crew choice and refreshes", async () => {
    mount();
    await screen.findByTestId("route-block-k1-2025-10-21-mowing");
    expect(screen.queryByTestId("button-rain-day-2025-10-26")).toBeNull();
    fireEvent.click(screen.getByTestId("button-rain-day-2025-10-21"));
    expect((await screen.findByTestId("dialog-rain-day")).textContent).toContain("Only route stops move");
    fireEvent.click(screen.getByTestId("button-rain-confirm"));
    await waitFor(() => expect(calls.find(c => c.url === "/api/routes/slide")?.body).toEqual({ date: "2025-10-21", crewIds: "all", mode: "week" }));
    await waitFor(() => expect(toast.mock.calls.some(([a]) => a.description === "7 route visits moved.")).toBe(true));
    await waitFor(() => expect(calls.filter(c => c.url.startsWith("/api/visits?")).length).toBeGreaterThan(1));
    expect(calls.filter(c => c.method === "PATCH")).toEqual([]);
    fireEvent.click(screen.getByTestId("button-rain-day-2025-10-21"));
    fireEvent.change(await screen.findByTestId("select-rain-crew"), { target: { value: "k1" } });
    fireEvent.click(screen.getByTestId("radio-rain-day"));
    fireEvent.click(screen.getByTestId("button-rain-confirm"));
    await waitFor(() => expect(calls.filter(c => c.url === "/api/routes/slide")[1]?.body).toEqual({ date: "2025-10-21", crewIds: ["k1"], mode: "day" }));
  });
});
