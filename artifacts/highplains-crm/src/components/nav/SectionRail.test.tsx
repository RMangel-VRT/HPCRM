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
  it.each([false, true])("opt-in child indentation preserves badges, overrides and current semantics; narrow=%s", isNarrow => {
    narrow = isNarrow;
    render(<SectionRail title="Example" ariaLabel="Example sections" activeKey="child" sections={[{ items: [
      { key: "parent", label: "Parent", href: "/parent" },
      { key: "child", label: "Child", href: "/child", indented: true, badge: 0, testId: "nested-link" },
    ] }]} />);
    const parent = screen.getByTestId("rail-parent");
    const child = screen.getByTestId("nested-link");
    expect(child.textContent).toBe("Child0");
    expect(child.getAttribute("aria-current")).toBe("page");
    expect(parent.hasAttribute("aria-current")).toBe(false);
    expect(parent.className).not.toContain("pl-6");
    expect(child.className.includes("pl-6")).toBe(!isNarrow);
  });
  it("associates h3 headings with their lists using instance-unique, stable IDs", () => {
    const grouped = [...sections, { label: "System", items: [{ key: "database", label: "Database", href: "/database" }] }];
    const rails = <><SectionRail title="Settings" ariaLabel="First" sections={grouped} activeKey="company" />
      <SectionRail title="Settings" ariaLabel="Second" sections={grouped} activeKey="company" /></>;
    const view = render(rails);
    const headings = screen.getAllByRole("heading", { level: 3 });
    const ids = headings.map(h => h.id);
    expect(new Set(ids).size).toBe(4);
    for (const nav of screen.getAllByRole("navigation")) {
      const lists = within(nav).getAllByRole("list");
      const labels = within(nav).getAllByRole("heading", { level: 3 });
      lists.forEach((list, i) => {
        expect(list.getAttribute("aria-labelledby")).toBe(labels[i].id);
        expect(labels[i].className).toContain("pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-rail-heading");
      });
      expect(labels[0].parentElement?.className).toBe("pb-1.5 pt-0.5");
      expect(labels[1].parentElement?.className).toBe("pb-1.5 pt-3.5 border-t border-rail-border");
    }
    view.rerender(rails);
    expect(screen.getAllByRole("heading", { level: 3 }).map(h => h.id)).toEqual(ids);
  });
  it("leaves unlabelled groups without headings, associations or new separators", () => {
    render(<SectionRail title="Inbox" ariaLabel="Inbox sections" activeKey="company"
      sections={[{ items: sections[1].items }, { items: [sections[1].items[0]] }]} />);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    const lists = screen.getAllByRole("list");
    lists.forEach(list => {
      expect(list.hasAttribute("aria-labelledby")).toBe(false);
      expect(list.parentElement?.className ?? "").not.toContain("border-t");
      expect(list.parentElement?.className ?? "").not.toContain("pt-");
    });
    expect(lists[1].parentElement?.className).toBe("mt-4");
  });
  it.each([0, 1, 3])("puts dividers only between the %i visible pill groups, including unlabelled groups", count => {
    narrow = true;
    const grouped = Array.from({ length: count }, (_, i) => ({
      label: i === 1 ? undefined : `Group ${i}`,
      items: [{ key: `item-${i}`, label: `Item ${i}`, href: `/item/${i}` }],
    }));
    render(<SectionRail title="Settings" ariaLabel="Settings sections" activeKey="item-0"
      sections={[{ label: "Hidden first", items: [] }, ...grouped, { label: "Hidden last", items: [] }]} />);
    const row = screen.getByTestId("section-rail-pills").firstElementChild!;
    expect(screen.queryAllByTestId("rail-group-divider")).toHaveLength(Math.max(count - 1, 0));
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    if (count > 0) {
      expect(row.firstElementChild?.tagName).toBe("A");
      expect(row.lastElementChild?.tagName).toBe("A");
    }
    screen.queryAllByTestId("rail-group-divider").forEach(divider => {
      expect(divider.getAttribute("aria-hidden")).toBe("true");
      expect(divider.className).toContain("w-px shrink-0 self-stretch bg-rail-border mx-1");
    });
  });
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
