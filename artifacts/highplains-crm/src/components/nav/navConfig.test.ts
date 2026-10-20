import { describe, expect, it } from "vitest";
import { getNavForUser, type NavRole, type NavUser } from "./navConfig";
import { defaultRedirectPath, loginLandingPath } from "@/lib/landing";

const summer = new Date("2026-07-01T12:00:00Z");
const keys = (user: NavUser, now = summer) => getNavForUser(user, now).flatMap(g => g.items.map(i => i.key));
const roleRows: [NavRole, string[]][] = [
  ["admin", ["dashboard", "inbox", "flags", "tickets", "myTickets", "scheduling", "planner", "campaigns", "equipment", "snow", "customers", "contracts", "propertyMaps", "routeMap", "billing", "revenue", "reports", "settings", "team"]],
  ["office", ["dashboard", "inbox", "flags", "tickets", "myTickets", "scheduling", "planner", "campaigns", "equipment", "snow", "customers", "contracts", "propertyMaps", "billing", "revenue", "reports", "settings"]],
  ["field_manager", ["dashboard", "myTickets", "myBatches", "scheduling", "campaigns", "snow", "customers", "propertyMaps", "routeMap"]],
  ["chemical_manager", ["dashboard", "myTickets", "campaigns", "customers", "propertyMaps", "routeMap"]],
  ["irrigation_manager", ["dashboard", "myTickets", "planner", "campaigns", "customers", "propertyMaps", "routeMap"]],
  ["shop_manager", ["dashboard", "myTickets", "equipment", "routeMap"]],
  ["landscape_supervisor", ["dashboard", "myTickets", "myBatches", "customers", "propertyMaps", "routeMap"]],
  ["crew_supervisor", ["myTickets"]],
  ["field", ["dashboard", "myTickets", "myBatches", "propertyMaps"]],
  ["mapping", ["propertyMaps"]],
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
  "/dashboard/billing": AO,
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
      expect(routeRoles[item.path], item.key).toContain(user.activeRole);
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
    expect(getNavForUser({ activeRole: "landscape_supervisor" }).flatMap(g => g.items).find(i => i.key === "myTickets")?.labelKey).toBe("nav.myWork");
    expect(getNavForUser({ activeRole: "mapping" })[0].items[0].labelKey).toBe("nav.customerMaps");
  });
  it.each(roleRows)("login and default landing for %s are permitted", (activeRole) => {
    expect(routeRoles[defaultRedirectPath({ activeRole })]).toContain(activeRole);
    expect(routeRoles[loginLandingPath({ activeRole })]).toContain(activeRole);
  });
  it("crew supervisor has a working My Tickets landing", () => {
    expect(defaultRedirectPath({ activeRole: "crew_supervisor" })).toBe("/dashboard/tickets/my");
  });
});
