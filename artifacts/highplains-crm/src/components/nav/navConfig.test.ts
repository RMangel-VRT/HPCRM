import { describe, expect, it } from "vitest";
import { getNavForUser, navItemIsActive, type NavRole, type NavUser } from "./navConfig";
import { defaultRedirectPath, loginLandingPath } from "@/lib/landing";

const summer = new Date("2026-07-01T12:00:00Z");
const keys = (user: NavUser, now = summer) => getNavForUser(user, now).flatMap(g => g.items.map(i => i.key));
const roleRows: [NavRole, string[]][] = [
  ["admin", ["dashboard", "inbox", "flags", "tickets", "scheduling", "planner", "campaigns", "equipment", "snow", "customers", "contracts", "maps", "estimates", "bids", "billing", "revenue", "reports", "settings", "team"]],
  ["office", ["dashboard", "inbox", "flags", "tickets", "scheduling", "planner", "campaigns", "equipment", "snow", "customers", "contracts", "maps", "estimates", "bids", "billing", "revenue", "reports", "settings"]],
  ["field_manager", ["dashboard", "tickets", "scheduling", "campaigns", "snow", "customers", "maps"]],
  ["chemical_manager", ["dashboard", "tickets", "campaigns", "customers", "maps"]],
  ["irrigation_manager", ["dashboard", "tickets", "planner", "campaigns", "customers", "maps"]],
  ["shop_manager", ["dashboard", "tickets", "equipment", "maps"]],
  ["landscape_supervisor", ["dashboard", "tickets", "customers", "maps"]],
  ["crew_supervisor", ["tickets"]],
  ["field", ["dashboard", "tickets", "maps"]],
  ["mapping", ["maps"]],
];
const matrixRows = [
  ...roleRows.map(([activeRole, expected]) => ({ name: activeRole, user: { activeRole } as NavUser, expected })),
  { name: "super_admin", user: { activeRole: "admin", isSuperAdminBool: true } as NavUser, expected: ["adminHome", "myTickets", "billing"] },
];

// Deliberately independent of App imports: route permissions are the constraint,
// not a second implementation generated from the same navigation config.
const AO: NavRole[] = ["admin", "office"];
const field: NavRole[] = ["field_manager", "chemical_manager", "field", "irrigation_manager", "shop_manager", "landscape_supervisor"];
const routeRoles: Record<string, NavRole[]> = {
  "/dashboard": [...AO, ...field],
  "/dashboard/estimates": AO,
  "/dashboard/bids": AO,
  "/dashboard/communications": [...AO, ...field, "mapping"],
  "/dashboard/flags": AO,
  "/dashboard/tickets": AO,
  "/dashboard/tickets/my": [...AO, ...field, "crew_supervisor"],
  "/dashboard/my-batches": [...AO, "field", "field_manager", "landscape_supervisor"],
  "/dashboard/scheduling": [...AO, "field_manager"],
  "/dashboard/schedule": [...AO, "irrigation_manager"],
  "/dashboard/campaigns": [...AO, "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"],
  "/dashboard/equipment": [...AO, "shop_manager"],
  "/dashboard/snow": [...AO, "field_manager"],
  "/dashboard/customers": [...AO, "field_manager", "chemical_manager"],
  "/dashboard/field-customers": [...AO, "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"],
  "/dashboard/contracts": AO,
  "/dashboard/maps": [...AO, "mapping", "field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor"],
  "/dashboard/customers/map": ["admin", "field_manager", "landscape_supervisor", "chemical_manager", "irrigation_manager", "shop_manager"],
  "/dashboard/invoicing": AO,
  "/dashboard/revenue": AO,
  "/dashboard/reports": AO,
  "/dashboard/settings": AO,
  "/dashboard/users": ["admin"],
};

describe("approved ordered sidebar matrix", () => {
  it.each(matrixRows)("$name has exactly the approved ordered keys and permitted destinations", ({ user, expected }) => {
    expect(keys(user)).toEqual(expected);
    for (const item of getNavForUser(user, summer).flatMap(g => g.items)) {
      if (user.isSuperAdminBool && item.path === "/admin") continue;
      const route = Object.keys(routeRoles).sort((a, b) => b.length - a.length)
        .find(path => item.path === path || item.path.startsWith(path + "/"))!;
      expect(routeRoles[route], item.key).toContain(user.activeRole);
    }
  });
  it.each([
    ["admin", [], true], ["admin", ["billing"], true],
    ["office", [], true], ["office", ["billing"], false],
    ["field_manager", ["billing"], false],
  ] as [NavRole, string[], boolean][])("billing sidebar %s tags=%j visible=%s", (activeRole, activeTags, visible) => {
    expect(keys({ activeRole, activeTags }).includes("billing")).toBe(visible);
  });
  it("super admin retains only Platform Admin, My Tickets and Billing", () => {
    expect(keys({ activeRole: "admin", isSuperAdminBool: true })).toEqual(["adminHome", "myTickets", "billing"]);
    expect(keys({ activeRole: "office", activeTags: ["billing"], isSuperAdminBool: true })).toEqual(["adminHome"]);
  });
  it.each([
    // Denver is still UTC-6 until 08:00Z on this date. The supplied
    // 06:30Z=Oct31 example was off by one hour; use real Colorado dates.
    ["2026-11-01T05:30:00Z", "last"],
    ["2026-11-01T06:30:00Z", "first"],
    ["2026-11-01T07:30:00Z", "first"],
  ])("Colorado winter boundary %s puts Snow %s regardless of process TZ", (instant, position) => {
    const work = getNavForUser({ activeRole: "admin" }, new Date(instant)).find(g => g.key === "work")!.items;
    expect(position === "first" ? work[0].key : work.at(-1)!.key).toBe("snow");
  });
  it("keeps last communications tab, badges, and role-specific labels", () => {
    const items = getNavForUser({ activeRole: "admin", lastCommsTab: "sent" }).flatMap(g => g.items);
    expect(items.find(i => i.key === "inbox")).toMatchObject({ href: "/dashboard/communications/sent", badge: "unsorted" });
    expect(items.filter(i => i.badge).map(i => i.badge).sort()).toEqual(["billing", "flags", "scheduling", "unsorted"]);
    expect(getNavForUser({ activeRole: "landscape_supervisor" }).flatMap(g => g.items).find(i => i.key === "tickets")?.labelKey).toBe("nav.myWork");
    expect(getNavForUser({ activeRole: "mapping" })[0].items[0].labelKey).toBe("nav.customerMaps");
  });
  it.each(roleRows)("login and default landing for %s are permitted", (activeRole) => {
    expect(routeRoles[defaultRedirectPath({ activeRole })]).toContain(activeRole);
    expect(routeRoles[loginLandingPath({ activeRole })]).toContain(activeRole);
  });
  it("crew supervisor has a working My Tickets landing", () => {
    expect(defaultRedirectPath({ activeRole: "crew_supervisor" })).toBe("/dashboard/tickets/my");
  });
  it("billing-tagged mapping can reach Mine without broadening ordinary mapping access", () => {
    expect(keys({ activeRole: "mapping", activeTags: ["billing"] })).toEqual(["tickets", "maps"]);
    expect(keys({ activeRole: "mapping" })).toEqual(["maps"]);
  });
  it.each([
    ["/dashboard/invoicing", "billing"], ["/dashboard/estimates", "estimates"], ["/dashboard/bids", "bids"],
    ["/dashboard/tickets/my", "tickets"], ["/dashboard/my-batches", "tickets"],
    ["/dashboard/tickets", "tickets"], ["/dashboard/tickets/ticket-id", "tickets"],
    ["/dashboard/maps", "maps"], ["/dashboard/customers/map", "maps"],
    ["/dashboard/customers/customer-id", "customers"],
  ])("%s activates only %s", (path, key) => {
    const active = getNavForUser({ activeRole: "admin" }, summer).flatMap(group => group.items)
      .filter(item => navItemIsActive(item, path)).map(item => item.key);
    expect(active).toEqual([key]);
  });
  it.each(roleRows)("Tickets and Maps have role-safe destinations and shared active matches for %s", activeRole => {
    const items = getNavForUser({ activeRole }, summer).flatMap(group => group.items);
    const tickets = items.find(item => item.key === "tickets");
    if (tickets) {
      expect(tickets.href).toBe("/dashboard/tickets/my");
      expect(tickets.activeMatch).toEqual(["/dashboard/tickets", "/dashboard/my-batches"]);
    }
    const maps = items.find(item => item.key === "maps");
    if (maps) {
      expect(maps.href).toBe(activeRole === "shop_manager" ? "/dashboard/customers/map" : "/dashboard/maps");
      expect(maps.activeMatch).toEqual(["/dashboard/maps", "/dashboard/customers/map"]);
    }
  });
});
