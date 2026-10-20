// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SectionRail, SectionRailLayout, type RailSection } from "./SectionRail";

let narrow = false;
let resize: (() => void) | undefined;
const sections: RailSection[] = [
  { label: "Empty section", items: [] },
  { label: "Company", items: [
    { key: "company", label: "Company profile", href: "/dashboard/settings/company" },
    { key: "seasons", label: "Seasons", href: "/dashboard/settings/seasons", badge: 0 },
    { key: "benchmarks", label: "Benchmarks", href: "/dashboard/settings/benchmarks", badge: 3, testId: "custom-test" },
  ] },
];
function Fixture() {
  const [path] = useLocation();
  return <SectionRailLayout rail={<SectionRail title="Settings" ariaLabel="Settings sections"
    sections={sections} activeKey={path.split("/").at(-1)!} />}><p>Content: {path}</p></SectionRailLayout>;
}
beforeEach(() => {
  narrow = false;
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: narrow, addEventListener: (_event: string, cb: () => void) => { resize = cb; },
    removeEventListener: vi.fn(),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("shared accessible rail", () => {
  it("uses real anchors, active aria-current, badges and stable/override test IDs; drops empty sections", () => {
    const loc = memoryLocation({ path: "/dashboard/settings/company" });
    render(<Router hook={loc.hook}><Fixture /></Router>);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0].getAttribute("href")).toBe("/dashboard/settings/company");
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(links[1].hasAttribute("aria-current")).toBe(false);
    expect(screen.getByTestId("rail-seasons").textContent).toBe("Seasons0");
    expect(screen.getByTestId("custom-test").textContent).toBe("Benchmarks3");
    expect(screen.queryByText("Empty section")).toBeNull();
    expect(nav.className).toContain("w-[236px]");
    expect(links[0].className).toContain("h-[34px]");
  });
  it("clicking pushes a history entry and updates aria-current", () => {
    const loc = memoryLocation({ path: "/dashboard/settings/company", record: true });
    render(<Router hook={loc.hook}><Fixture /></Router>);
    fireEvent.click(screen.getByTestId("rail-seasons"));
    expect(loc.history).toEqual(["/dashboard/settings/company", "/dashboard/settings/seasons"]);
    expect(screen.getByTestId("rail-seasons").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Content: /dashboard/settings/seasons")).toBeTruthy();
  });
  it("switches to a horizontally scrolling pill row at 390px and back to desktop on resize", () => {
    narrow = true;
    render(<Router><Fixture /></Router>);
    const nav = screen.getByTestId("section-rail-pills");
    expect(nav.firstElementChild?.className).toContain("overflow-x-auto");
    expect(screen.queryByText("Company", { exact: true })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByTestId("rail-company").className).toContain("rounded-full");
    act(() => { narrow = false; resize?.(); });
    expect(screen.queryByTestId("section-rail-pills")).toBeNull();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("navigation").parentElement?.className).toContain("md:flex-row");
    expect(screen.getByRole("navigation").nextElementSibling?.className).toContain("min-w-0 flex-1 p-6 md:p-8");
  });
});
