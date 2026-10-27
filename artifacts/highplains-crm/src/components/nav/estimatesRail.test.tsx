// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Route, Router, Switch, useLocation, useParams } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ProtectedRoute } from "@/lib/protected-route";
import { WorkPageLayout } from "./WorkPageLayout";
import { EstimatesRail, PLANT_LIBRARY_PATH, plantRailKey, isEstimatesHubPage } from "./estimatesRail";
import { workPage } from "./workNav";
import "@/i18n";

let role = "admin";
let narrow = false;
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: role } }) }));
beforeEach(() => {
  role = "admin";
  narrow = false;
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: narrow, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const app = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
const plantRoutes = [...app.matchAll(/<ProtectedRoute path="(\/dashboard\/estimates\/catalogs\/plants[^"]*)" component=\{(\w+)\} allowedRoles=\{(\[[^\]]+\])\} \/>/g)]
  .map(([, path, name, roles]) => ({
    path, roles: JSON.parse(roles) as ["admin", "office"],
    Page: () => <p data-testid="plant-route-content">{name}:{useParams().id ?? "list"}</p>,
  }));
function RoutedPlants() {
  const [path] = useLocation();
  return <WorkPageLayout path={path}><Switch>
    {plantRoutes.map(({ path, roles, Page }) => <ProtectedRoute key={path} path={path} component={Page} allowedRoles={roles} />)}
    <Route path="/access-denied"><p>Access denied</p></Route>
    <Route><p>Wrong fallback</p></Route>
  </Switch></WorkPageLayout>;
}

describe("plants inside the Estimates rail", () => {
  it.each(["admin", "office", "field", "field_manager", "chemical_manager", "irrigation_manager",
    "shop_manager", "landscape_supervisor", "crew_supervisor", "mapping"])("canonical routing and authorization remain intact for %s", viewer => {
    role = viewer;
    expect(plantRoutes).toHaveLength(4);
    for (const [suffix, page] of [["", "PlantLibrary:list"], ["/matches", "PlantMatches:list"],
      ["/palettes", "PlantPalettes:list"], ["/palettes/palette-42", "PlantPaletteDraft:palette-42"]]) {
      const loc = memoryLocation({ path: `${PLANT_LIBRARY_PATH}${suffix}` });
      render(<Router hook={loc.hook}><RoutedPlants /></Router>);
      if (["admin", "office"].includes(viewer)) {
        expect(screen.getByTestId("plant-route-content").textContent).toBe(page);
        expect(screen.getAllByRole("navigation")).toHaveLength(1);
      } else {
        expect(screen.getByText("Access denied")).toBeTruthy();
        expect(screen.queryByTestId("plant-route-content")).toBeNull();
        expect(screen.queryByRole("navigation")).toBeNull();
      }
      cleanup();
    }
  });
  it.each([false, true])("all plant destinations remain reachable; narrow=%s", isNarrow => {
    narrow = isNarrow;
    const loc = memoryLocation({ path: PLANT_LIBRARY_PATH, record: true });
    render(<Router hook={loc.hook}><EstimatesRail activeKey="library" /></Router>);
    expect(screen.getByTestId("rail-plant_library").getAttribute("href")).toBe(PLANT_LIBRARY_PATH);
    for (const [key, suffix] of [["library", ""], ["matches", "/matches"], ["palettes", "/palettes"]]) {
      const link = screen.getByTestId(`rail-${key}`);
      expect(link.getAttribute("href")).toBe(`${PLANT_LIBRARY_PATH}${suffix}`);
      expect(link.className.includes("pl-6")).toBe(!isNarrow);
      fireEvent.click(link);
      expect(loc.history.at(-1)).toBe(`${PLANT_LIBRARY_PATH}${suffix}`);
    }
    expect(screen.getAllByRole("link").filter(l => l.hasAttribute("aria-current"))).toEqual([screen.getByTestId("rail-library")]);
    expect(screen.getByTestId("rail-plant_library").hasAttribute("aria-current")).toBe(false);
    expect(screen.getByTestId("rail-labor_rates").getAttribute("href")).toBe("/dashboard/estimates/settings/rates");
    expect(screen.getByTestId("rail-quickbooks").getAttribute("href")).toBe("/dashboard/estimates/settings/quickbooks");
    if (isNarrow) expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    else expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    if (isNarrow) expect(screen.getByTestId("section-rail-pills").firstElementChild?.className).toContain("overflow-x-auto");
    else expect(screen.getByRole("heading", { name: "Catalogs" }).className).toContain("text-rail-heading");
  });

  it.each(["admin", "office"])("%s gets exactly one Estimates context on every plant page", viewer => {
    role = viewer;
    for (const isNarrow of [false, true]) {
      narrow = isNarrow;
      for (const [suffix, active] of [["", "library"], ["/matches", "matches"], ["/palettes", "palettes"], ["/palettes/palette-42", "palettes"]]) {
        const path = `${PLANT_LIBRARY_PATH}${suffix}`;
        render(<Router><WorkPageLayout path={path}><p>Unchanged content</p></WorkPageLayout></Router>);
        expect(isEstimatesHubPage(path)).toBe(true);
        expect(workPage(path)).toBeUndefined();
        expect(screen.getAllByRole("navigation")).toHaveLength(1);
        expect(screen.getByRole("navigation", { name: "Estimates navigation" })).toBeTruthy();
        expect(screen.getAllByText("Unchanged content")).toHaveLength(1);
        expect(screen.getAllByRole("link").filter(l => l.hasAttribute("aria-current"))).toEqual([screen.getByTestId(`rail-${active}`)]);
        for (const key of ["all", "hardscape", "plant_library"]) {
          expect(screen.getByTestId(`rail-${key}`).hasAttribute("aria-current")).toBe(false);
        }
        cleanup();
      }
    }
  });

  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor", "crew_supervisor", "mapping"])("%s gains no plant rail", viewer => {
    role = viewer;
    render(<Router><WorkPageLayout path={PLANT_LIBRARY_PATH}>Denied route content</WorkPageLayout></Router>);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it.each(["/dashboard/estimates", "/dashboard/estimates/catalogs/hardscape", "/dashboard/estimates/settings/rates",
    "/dashboard/tools/plant-library", "/dashboard/tools/plant-palette/id", `${PLANT_LIBRARY_PATH}/unknown`,
    `${PLANT_LIBRARY_PATH}/palettes/id/unknown`])("does not take layout ownership of %s", path => {
    expect(plantRailKey(path)).toBeUndefined();
    render(<WorkPageLayout path={path}>Own layout</WorkPageLayout>);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
