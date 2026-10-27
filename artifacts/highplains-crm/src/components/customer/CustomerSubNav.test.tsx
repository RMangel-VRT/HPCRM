// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { SidebarContext } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomerSubNav } from "./CustomerSubNav";

vi.mock("@/hooks/use-reduced-motion", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("./CustomersViewSwitcher", () => ({ CustomersViewSwitcher: () => <div data-testid="view-switcher" /> }));
afterEach(cleanup);

function fixture(role = "admin", collapsed = false, snowEnabled = true) {
  const onTabChange = vi.fn();
  render(<Router><SidebarContext.Provider value={{
    state: collapsed ? "collapsed" : "expanded", open: !collapsed, setOpen: vi.fn(),
    openMobile: false, setOpenMobile: vi.fn(), isMobile: false, toggleSidebar: vi.fn(),
  }}><TooltipProvider><CustomerSubNav customerId="property" customerName="Test property" customers={[]}
    activeTab="contracts" onTabChange={onTabChange} userRole={role} snowEnabled={snowEnabled}
    badgeCounts={{ tickets: 3 }} /></TooltipProvider></SidebarContext.Provider></Router>);
  return { onTabChange, nav: screen.getByRole("navigation", { name: "Customer sections" }) };
}

describe("customer rail heading presentation", () => {
  it("keeps accessible group labels, item geometry, active states, badges and actions", () => {
    const { nav, onTabChange } = fixture();
    const groups = within(nav).getAllByRole("group");
    expect(groups.map(g => g.getAttribute("aria-label"))).toEqual(["Overview", "Operations", "Financial", "Settings"]);
    groups.forEach((group, i) => {
      expect(group.className).toBe(i === 0 ? "pb-1.5 pt-0.5" : "pb-1.5 pt-3.5 border-t border-rail-border");
      expect(group.firstElementChild?.className).toBe("px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-rail-heading");
      expect(group.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    });
    expect(screen.getByTestId("nav-item-billing").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("nav-item-tickets").className).toContain("h-8 px-3 text-sm");
    expect(screen.getByTestId("badge-count-tickets").textContent).toBe("3");
    fireEvent.click(screen.getByTestId("nav-item-tickets"));
    expect(onTabChange).toHaveBeenCalledWith("tickets");
    const contacts = screen.getByTestId("nav-item-contacts");
    contacts.focus();
    fireEvent.keyDown(contacts, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("nav-item-notes"));
    expect(onTabChange).toHaveBeenLastCalledWith("notes");
    expect(screen.getByTestId("view-switcher")).toBeTruthy();
  });
  it.each(["office", "field_manager", "field", "mapping"])("filters %s groups before applying expanded separators", role => {
    const { nav } = fixture(role, false, false);
    const groups = within(nav).getAllByRole("group");
    expect(groups).toHaveLength(role === "office" ? 4 : 2);
    expect(groups[0].className).not.toContain("border-t");
    expect(groups.slice(1).every(g => g.className.includes("border-t border-rail-border"))).toBe(true);
    expect(screen.queryByTestId("nav-item-snow")).toBeNull();
    if (role !== "office") {
      expect(screen.queryByRole("group", { name: "Financial" })).toBeNull();
      expect(screen.queryByTestId("nav-item-billing")).toBeNull();
    }
  });
  it.each(["admin", "field_manager", "field"])("adds only between-group lines to the %s icon-only rail", role => {
    const { nav, onTabChange } = fixture(role, true);
    const row = nav.firstElementChild!;
    expect(screen.getAllByTestId("customer-group-divider")).toHaveLength(role === "admin" ? 3 : 1);
    expect(row.firstElementChild?.tagName).toBe("BUTTON");
    expect(row.lastElementChild?.tagName).toBe("BUTTON");
    expect(within(nav).queryAllByRole("group")).toHaveLength(0);
    expect(within(nav).queryAllByRole("heading")).toHaveLength(0);
    expect(screen.queryByTestId("view-switcher")).toBeNull();
    expect(screen.getByTestId("nav-item-tickets").getAttribute("aria-label")).toBe("Tickets");
    expect(screen.getByTestId("badge-count-tickets").textContent).toBe("3");
    fireEvent.click(screen.getByTestId("nav-item-tickets"));
    expect(onTabChange).toHaveBeenCalledWith("tickets");
    if (role === "field") expect(screen.queryByTestId("nav-item-snow")).toBeNull();
    else expect(screen.getByTestId("nav-item-snow")).toBeTruthy();
  });
});
