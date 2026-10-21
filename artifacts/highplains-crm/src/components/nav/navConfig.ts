import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Building2, Settings, Shield, DollarSign, ClipboardList, UserCheck,
  Map, CalendarDays, FileText, FileBarChart, MessagesSquare, Flag, Receipt,
  Users, Snowflake, Megaphone, Wrench, CalendarClock,
} from "lucide-react";
import { showBillingSidebar } from "@/lib/billing";
import { commsTabHref, type CommsTab } from "@/lib/last-comms-tab";
import { localDateString } from "@/shared/scheduleBy";
import { firstMapHref, workViewsFor } from "./workNav";

export type NavRole =
  | "admin" | "office" | "field_manager" | "chemical_manager" | "field"
  | "irrigation_manager" | "shop_manager" | "mapping" | "landscape_supervisor" | "crew_supervisor";

export interface NavUser {
  activeRole: NavRole;
  activeTags?: string[];
  isSuperAdminBool?: boolean;
  lastCommsTab?: CommsTab;
}

export type NavBadge = "billing" | "scheduling" | "flags" | "unsorted";

export interface NavItemDef {
  key: string;
  labelKey: string | ((user: NavUser) => string);
  icon: LucideIcon;
  href: string | ((user: NavUser) => string);
  visible: (user: NavUser) => boolean;
  badge?: NavBadge;
  activeMatch?: string[];
}

export interface NavGroupDef {
  key: string;
  labelKey: string | null;
  items: NavItemDef[];
}

export interface ResolvedNavItem {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  href: string;
  path: string;
  badge?: NavBadge;
  activeMatch: string[];
}

export interface ResolvedNavGroup {
  key: string;
  labelKey: string | null;
  items: ResolvedNavItem[];
}

export function navItemIsActive(item: Pick<ResolvedNavItem, "key" | "activeMatch">, location: string) {
  // Route map belongs to Maps, not the customer-directory/detail family.
  if (item.key === "customers" && /^\/dashboard\/customers\/map(?:\/|$)/.test(location)) return false;
  return item.activeMatch.some(path => path === "/dashboard"
    ? location === path
    : location === path || location.startsWith(path + "/"));
}

const is = (...roles: NavRole[]) => (u: NavUser) => roles.includes(u.activeRole);
const AO: NavRole[] = ["admin", "office"];

export const NAV_GROUPS: NavGroupDef[] = [
  {
    key: "top",
    labelKey: null,
    items: [
      { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, href: "/dashboard",
        visible: is("admin", "office", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor", "field") },
      { key: "inbox", labelKey: "nav.inbox", icon: MessagesSquare,
        href: (u) => commsTabHref(u.lastCommsTab ?? "inbox"),
        activeMatch: ["/dashboard/communications"], badge: "unsorted", visible: is(...AO) },
      { key: "flags", labelKey: "nav.flags", icon: Flag, href: "/dashboard/flags", badge: "flags", visible: is(...AO) },
    ],
  },
  {
    key: "work",
    labelKey: "nav.work",
    items: [
      { key: "tickets",
        labelKey: (u) => (u.activeRole === "landscape_supervisor" ? "nav.myWork" : "nav.tickets"),
        icon: ClipboardList, href: "/dashboard/tickets/my",
        activeMatch: ["/dashboard/tickets", "/dashboard/my-batches"],
        visible: (u) => workViewsFor("tickets", u.activeRole).some(item => item.key === "mine") || !!u.activeTags?.includes("billing") },
      { key: "scheduling", labelKey: "nav.scheduling", icon: CalendarDays, href: "/dashboard/scheduling",
        badge: "scheduling", visible: is("admin", "office", "field_manager") },
      { key: "planner", labelKey: "nav.planner", icon: CalendarClock, href: "/dashboard/schedule",
        visible: is("admin", "office", "irrigation_manager") },
      { key: "campaigns", labelKey: "nav.campaigns", icon: Megaphone, href: "/dashboard/campaigns",
        visible: is("admin", "office", "field_manager", "chemical_manager", "irrigation_manager") },
      { key: "equipment", labelKey: "nav.equipment", icon: Wrench, href: "/dashboard/equipment",
        visible: is("admin", "office", "shop_manager") },
      { key: "snow", labelKey: "nav.snow", icon: Snowflake, href: "/dashboard/snow",
        visible: is("admin", "office", "field_manager") },
    ],
  },
  {
    key: "customers",
    labelKey: "nav.customersGroup",
    items: [
      { key: "customers", labelKey: "nav.customers", icon: Building2,
        href: (u) => (is("admin", "office", "field_manager")(u) ? "/dashboard/customers" : "/dashboard/field-customers"),
        visible: is("admin", "office", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor") },
      { key: "contracts", labelKey: "nav.contracts", icon: FileText, href: "/dashboard/contracts", visible: is(...AO) },
      { key: "maps",
        labelKey: (u) => (u.activeRole === "mapping" ? "nav.customerMaps" : "nav.maps"),
        icon: Map, href: (u) => firstMapHref(u.activeRole)!,
        activeMatch: ["/dashboard/maps", "/dashboard/customers/map"],
        visible: (u) => !!firstMapHref(u.activeRole) },
    ],
  },
  {
    key: "business",
    labelKey: "nav.business",
    items: [
      { key: "billing", labelKey: "nav.invoicing", icon: Receipt, href: "/dashboard/invoicing", badge: "billing",
        visible: (u) => showBillingSidebar(u) },
      { key: "revenue", labelKey: "nav.revenue", icon: DollarSign, href: "/dashboard/revenue", visible: is(...AO) },
      { key: "reports", labelKey: "nav.reports", icon: FileBarChart, href: "/dashboard/reports", visible: is(...AO) },
    ],
  },
  {
    key: "footer",
    labelKey: null,
    items: [
      { key: "settings", labelKey: "nav.settings", icon: Settings, href: "/dashboard/settings", visible: is(...AO) },
      { key: "team", labelKey: "nav.team", icon: Users, href: "/dashboard/users", visible: is("admin") },
    ],
  },
];

const SUPER_ADMIN_GROUPS: NavGroupDef[] = [
  {
    key: "platform",
    labelKey: "nav.platformAdmin",
    items: [{ key: "adminHome", labelKey: "nav.adminHome", icon: Shield, href: "/admin", visible: () => true }],
  },
  {
    key: "superTop",
    labelKey: "nav.dashboard",
    items: [
      { key: "myTickets", labelKey: "nav.myTickets", icon: UserCheck, href: "/dashboard/tickets/my", visible: (u) => showBillingSidebar(u) },
      { key: "billing", labelKey: "nav.invoicing", icon: Receipt, href: "/dashboard/invoicing", badge: "billing", visible: (u) => showBillingSidebar(u) },
    ],
  },
];

function isWinterSeason(now: Date): boolean {
  const month = Number(localDateString(now).slice(5, 7));
  return month >= 11 || month <= 4;
}

function resolve(def: NavItemDef, user: NavUser): ResolvedNavItem {
  const href = typeof def.href === "function" ? def.href(user) : def.href;
  const activeMatch = def.activeMatch ?? [href];
  return {
    key: def.key,
    labelKey: typeof def.labelKey === "function" ? def.labelKey(user) : def.labelKey,
    icon: def.icon,
    href,
    path: href.split("?")[0],
    badge: def.badge,
    activeMatch,
  };
}

export function getNavForUser(user: NavUser, now: Date = new Date()): ResolvedNavGroup[] {
  const groups = user.isSuperAdminBool ? SUPER_ADMIN_GROUPS : NAV_GROUPS;
  const winter = isWinterSeason(now);
  return groups
    .map((g) => {
      let defs = g.items.filter((i) => i.visible(user));
      if (g.key === "work") {
        const snow = defs.find((i) => i.key === "snow");
        if (snow) {
          const rest = defs.filter((i) => i !== snow);
          defs = winter ? [snow, ...rest] : [...rest, snow];
        }
      }
      return { key: g.key, labelKey: g.labelKey, items: defs.map((d) => resolve(d, user)) };
    })
    .filter((g) => g.items.length > 0);
}

