// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarContext } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomerSubNav, CustomerPageChips } from "./CustomerSubNav";
import { canonicalCustomerSearch, visibleCustomerPages } from "./customerPages";

vi.mock("@/hooks/use-reduced-motion", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("react-i18next", async () => {
  const { default: en } = await import("@/i18n/locales/en");
  const get = (k: string) => k.split(".").reduce<any>((o, p) => o?.[p], en) ?? k;
  return { useTranslation: () => ({ t: get, i18n: { language: "en" } }) };
});
afterEach(cleanup);

function fixture({ role = "admin", collapsed = false, snow = true, kind = "regular" as "regular" | "parent" } = {}) {
  const onTabChange = vi.fn();
  const pages = visibleCustomerPages({ kind, accessRole: role, snowCovered: snow });
  render(<SidebarContext.Provider value={{
    state: collapsed ? "collapsed" : "expanded", open: !collapsed, setOpen: vi.fn(),
    openMobile: false, setOpenMobile: vi.fn(), isMobile: false, toggleSidebar: vi.fn(),
  }}><TooltipProvider>
    <CustomerSubNav pages={pages} activeTab="billing" onTabChange={onTabChange}
      badges={{ tickets: { count: 3 }, services: { count: 2, warning: true } }} />
    <CustomerPageChips pages={pages} activeTab="billing" onTabChange={onTabChange} />
  </TooltipProvider></SidebarContext.Provider>);
  return { onTabChange, pages, nav: screen.getByTestId("customer-sub-nav").querySelector("nav")! };
}

describe("CP2 customer rail", () => {
  it("admin regular customer: 11 pages, one name each, Work and Money headings, no name block", () => {
    const { nav, onTabChange, pages } = fixture();
    expect(pages).toEqual(["dashboard", "contacts", "notes", "documents", "communications", "services", "tickets", "snow", "property", "proposals", "contracts", "billing"]);
    const groups = within(nav).getAllByRole("group");
    expect(groups.map(g => g.getAttribute("aria-label"))).toEqual(["Customer", "Work", "Money"]);
    expect(within(nav).getByTestId("nav-item-dashboard").textContent).toBe("Dashboard");
    expect(within(nav).getByTestId("nav-item-property").textContent).toBe("Property");
    expect(within(nav).getByTestId("nav-item-billing").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("badge-count-tickets").textContent).toBe("3");
    expect(screen.getByTestId("badge-count-services").getAttribute("data-warning")).toBe("true");
    expect(nav.textContent).not.toContain("Test property");
    fireEvent.click(within(nav).getByTestId("nav-item-tickets"));
    expect(onTabChange).toHaveBeenCalledWith("tickets");
    const contacts = within(nav).getByTestId("nav-item-contacts");
    contacts.focus();
    fireEvent.keyDown(contacts, { key: "ArrowDown" });
    expect(onTabChange).toHaveBeenLastCalledWith("notes");
  });

  it.each(["field_manager", "field", "mapping"])("%s never sees privileged pages", role => {
    const { pages } = fixture({ role, snow: true });
    for (const k of ["communications", "proposals", "contracts", "billing"]) expect(pages).not.toContain(k);
    expect(pages.includes("snow")).toBe(role === "field_manager");
    expect(screen.queryByTestId("nav-item-billing")).toBeNull();
  });

  it("snow hidden without coverage; parent order has Branches and no Services/Property/Snow/Proposals", () => {
    expect(visibleCustomerPages({ kind: "regular", accessRole: "admin", snowCovered: false })).not.toContain("snow");
    expect(visibleCustomerPages({ kind: "parent", accessRole: "admin", snowCovered: true }))
      .toEqual(["dashboard", "branches", "contacts", "notes", "documents", "communications", "tickets", "contracts", "billing"]);
  });

  it("collapsed rail is icon-only with labelled buttons and dividers between groups", () => {
    const { nav } = fixture({ collapsed: true });
    expect(within(nav).queryAllByRole("group")).toHaveLength(0);
    expect(screen.getAllByTestId("customer-group-divider")).toHaveLength(2);
    expect(within(nav).getByTestId("nav-item-tickets").getAttribute("aria-label")).toBe("Tickets");
  });

  it("chips mirror the same permitted pages", () => {
    const { pages } = fixture({ role: "field" });
    const chips = screen.getByTestId("customer-page-chips");
    expect(within(chips).getAllByRole("button").map(b => b.getAttribute("data-testid"))).toEqual(pages.map(p => `chip-${p}`));
  });

  it("legacy tab aliases canonicalize while preserving other params", () => {
    expect(canonicalCustomerSearch("?tab=revenue&x=1")).toBe("tab=billing&x=1&view=revenue");
    expect(canonicalCustomerSearch("tab=maps")).toBe("tab=property");
    expect(canonicalCustomerSearch("tab=overview&id=9")).toBe("tab=dashboard&id=9");
    expect(canonicalCustomerSearch("tab=visual-scopes")).toBe("tab=proposals&view=scopes");
    expect(canonicalCustomerSearch("tab=billing")).toBeNull();
  });
});
