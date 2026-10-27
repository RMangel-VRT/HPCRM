// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { WorkPageLayout } from "./WorkPageLayout";
import { WORK_VIEWS, workPage, workViewsFor, type WorkFamily } from "./workNav";
import en from "@/i18n/locales/en";
import es from "@/i18n/locales/es";

let role = "admin";
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: role } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const rows: [string, string[], string[], string[]][] = [
  ["admin", ["mine", "batches", "all"], ["property-maps", "route-map"], ["campaigns", "checklists"]],
  ["office", ["mine", "batches", "all"], ["property-maps"], ["campaigns", "checklists"]],
  ["field_manager", ["mine", "batches"], ["property-maps", "route-map"], ["campaigns", "checklists"]],
  ["chemical_manager", ["mine"], ["property-maps", "route-map"], ["campaigns", "checklists"]],
  ["irrigation_manager", ["mine"], ["property-maps", "route-map"], ["campaigns"]],
  ["shop_manager", ["mine"], ["route-map"], []],
  ["landscape_supervisor", ["mine", "batches"], ["property-maps", "route-map"], ["campaigns"]],
  ["crew_supervisor", ["mine"], [], []],
  ["field", ["mine", "batches"], ["property-maps"], ["campaigns"]],
  ["mapping", [], ["property-maps"], []],
];

describe("work-page rails", () => {
  it.each(rows)("%s gets exactly its permitted views and hides single-view rails", (viewer, tickets, maps, campaigns) => {
    role = viewer;
    for (const [family, keys] of [["tickets", tickets], ["maps", maps], ["campaigns", campaigns]] as [WorkFamily, string[]][]) {
      expect(workViewsFor(family, viewer).map(item => item.key)).toEqual(keys);
      render(<Router><WorkPageLayout path={WORK_VIEWS[family][0].href}>Content</WorkPageLayout></Router>);
      expect(screen.queryAllByRole("navigation")).toHaveLength(keys.length > 1 ? 1 : 0);
      expect(screen.getAllByText("Content")).toHaveLength(1);
      cleanup();
    }
  });
  it.each(Object.values(WORK_VIEWS).flat().map(item => [item.href, item.key]))("active item at %s is %s", (path, active) => {
    role = "admin";
    render(<Router><WorkPageLayout path={path}>Content</WorkPageLayout></Router>);
    expect(screen.getByTestId(`rail-${active}`).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link").filter(link => link.getAttribute("aria-current"))).toHaveLength(1);
  });
  it("palette detail keeps Palettes active", () => {
    role = "admin";
    render(<Router><WorkPageLayout path="/dashboard/estimates/catalogs/plants/palettes/palette-id">Draft</WorkPageLayout></Router>);
    expect(screen.getByTestId("rail-palettes").getAttribute("aria-current")).toBe("page");
  });
  it.each(["/dashboard/campaigns/c", "/dashboard/campaigns/c/items/i", "/dashboard/tickets/t",
    "/dashboard/flags/f", "/dashboard/scheduling"])("%s remains rail-free", path => {
    expect(workPage(path)).toBeUndefined();
    render(<Router><WorkPageLayout path={path}>Detail</WorkPageLayout></Router>);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
  it("full-height maps keep content constrained and independently scrollable", () => {
    role = "admin";
    render(<Router><WorkPageLayout path="/dashboard/customers/map">Map</WorkPageLayout></Router>);
    const content = screen.getByTestId("rail-full-height-content");
    expect(content.className).toContain("relative min-h-0 overflow-y-auto");
    expect(content.parentElement?.className).toContain("h-full min-h-0 overflow-hidden");
    expect(screen.getByRole("navigation").className).toContain("overflow-y-auto");
  });
  it("contains the exact supplied translations", () => {
    expect(es.workRail).toEqual({ mine: "Míos", batches: "Lotes", all: "Todos", library: "Biblioteca", matches: "Coincidencias", palettes: "Paletas" });
    expect(es.comms).toEqual({ inbox: "Bandeja de entrada", unsorted: "Sin clasificar", sent: "Enviados", all: "Todas las comunicaciones" });
    expect(Object.values(es.flags.status)).toEqual(["Nuevas", "Reconocidas", "En curso", "Resueltas", "Descartadas", "Todas"]);
    expect(Object.keys(en.workRail)).toEqual(Object.keys(es.workRail));
  });
});
