// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "reader", activeCompanyId: "company", activeRole: auth.role } }) }));
import CustomerSchedulingSection from "../CustomerSchedulingSection";
import SchedulePreview from "../SchedulePreview";
let stops: unknown[], failed: boolean, calls: string[];
beforeEach(() => {
  auth.role = "admin"; stops = []; failed = false; calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(failed ? { error: "Unavailable" } : { stops }), { status: failed ? 503 : 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount(preview = false) {
  const loc = memoryLocation({ path: "/dashboard/customers/property" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Router hook={loc.hook}><>{preview ? <SchedulePreview /> : <CustomerSchedulingSection customerId="property" />}</></Router></QueryClientProvider>);
}
describe("route-only read surfaces", () => {
  it.each(["admin", "office", "field_manager", "irrigation_manager"])("%s sees the management link and exact empty state", async role => {
    auth.role = role; mount();
    await screen.findByText("Not on a route yet");
    expect(screen.getByText("Manage Routes").getAttribute("href")).toBe("/dashboard/routes");
    expect(calls).toEqual(["/api/customers/property/route-summary"]);
  });
  it.each(["field", "chemical_manager", "crew_supervisor", "landscape_supervisor", "shop_manager", "mapping"])("%s gets the summary without management controls", async role => {
    auth.role = role; mount();
    await screen.findByText("Not on a route yet");
    expect(screen.queryByText("Manage Routes")).toBeNull();
    expect(document.querySelector("input,select,textarea")).toBeNull();
  });
  it("displays only summary-owned service, crew, weekday, cadence and minutes", async () => {
    stops = [{ id: "stop", serviceKey: "mowing", crew: { id: "crew", name: "North" }, weekday: 2, everyWeeks: 2, minutes: 45 }];
    mount();
    await screen.findByText("North");
    for (const text of ["Mowing", "Tuesday", "Every 2 weeks", "45 min"]) expect(screen.getByText(text)).toBeTruthy();
    expect(calls).toEqual(["/api/customers/property/route-summary"]);
  });
  it("shows an explicit read error, never a fallback editor", async () => {
    failed = true; mount();
    await screen.findByRole("alert");
    expect(document.querySelector("input,select,textarea")).toBeNull();
    expect(calls).toEqual(["/api/customers/property/route-summary"]);
  });
  it("retains the existing route-backed preview with no marker dependency", async () => {
    stops = [{ id: "s", customerId: "property", name: "Property", serviceKey: "mowing", crew: { name: "North" }, weekday: 3, everyWeeks: 1, minutes: 30 }];
    mount(true);
    expect((await screen.findByText("Property")).getAttribute("href")).toBe("/dashboard/customers/property");
    await waitFor(() => expect(calls).toEqual(["/api/routes/preview"]));
    expect(screen.getByText("Every week")).toBeTruthy();
  });
});
