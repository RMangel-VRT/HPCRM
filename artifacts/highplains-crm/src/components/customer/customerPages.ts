import type { ComponentType } from "react";
import {
  LayoutDashboard, Users, MessageSquare, Mail, CheckCircle2, Ticket as TicketIcon, Snowflake, Map,
  FileText, FileSignature, DollarSign, Building2, FolderOpen,
} from "lucide-react";

/**
 * CP2: the single list of customer pages. Rail, chips, visible page heading,
 * breadcrumb and document.title all read `labelKey` from here.
 */
export type CustomerPageKey =
  | "dashboard" | "branches" | "contacts" | "notes" | "documents" | "communications"
  | "services" | "tickets" | "snow" | "property"
  | "proposals" | "contracts" | "billing";

export type CustomerPageGroup = "main" | "work" | "money";
/** all = anyone who can open the customer; privileged = admin/office; snow = admin/office/field manager + coverage. */
export type CustomerPageAccess = "all" | "privileged" | "snow";

export interface CustomerPageDef {
  key: CustomerPageKey;
  labelKey: string;
  group: CustomerPageGroup;
  access: CustomerPageAccess;
  icon: ComponentType<{ className?: string }>;
  views?: readonly string[];
}

export const CUSTOMER_PAGES: Record<CustomerPageKey, CustomerPageDef> = {
  dashboard: { key: "dashboard", labelKey: "customerPages.pages.dashboard", group: "main", access: "all", icon: LayoutDashboard },
  branches: { key: "branches", labelKey: "customerPages.pages.branches", group: "main", access: "all", icon: Building2 },
  contacts: { key: "contacts", labelKey: "customerPages.pages.contacts", group: "main", access: "all", icon: Users },
  notes: { key: "notes", labelKey: "customerPages.pages.notes", group: "main", access: "all", icon: MessageSquare },
  documents: { key: "documents", labelKey: "customerPages.pages.documents", group: "main", access: "all", icon: FolderOpen },
  communications: { key: "communications", labelKey: "customerPages.pages.communications", group: "main", access: "privileged", icon: Mail },
  services: { key: "services", labelKey: "customerPages.pages.services", group: "work", access: "all", icon: CheckCircle2 },
  tickets: { key: "tickets", labelKey: "customerPages.pages.tickets", group: "work", access: "all", icon: TicketIcon },
  snow: { key: "snow", labelKey: "customerPages.pages.snow", group: "work", access: "snow", icon: Snowflake },
  property: { key: "property", labelKey: "customerPages.pages.property", group: "work", access: "all", icon: Map },
  proposals: { key: "proposals", labelKey: "customerPages.pages.proposals", group: "money", access: "privileged", icon: FileText, views: ["proposals", "worksheets", "scopes"] },
  contracts: { key: "contracts", labelKey: "customerPages.pages.contracts", group: "money", access: "privileged", icon: FileSignature },
  billing: { key: "billing", labelKey: "customerPages.pages.billing", group: "money", access: "privileged", icon: DollarSign, views: ["rates", "revenue"] },
};

export const GROUP_LABEL_KEYS: Record<CustomerPageGroup, string | null> = {
  main: null,
  work: "customerPages.groups.work",
  money: "customerPages.groups.money",
};

export const REGULAR_PAGE_ORDER: readonly CustomerPageKey[] = [
  "dashboard", "contacts", "notes", "documents", "communications",
  "services", "tickets", "snow", "property",
  "proposals", "contracts", "billing",
];
export const PARENT_PAGE_ORDER: readonly CustomerPageKey[] = [
  "dashboard", "branches", "contacts", "notes", "documents", "communications",
  "tickets",
  "contracts", "billing",
];

export const PRIVILEGED_ROLES = ["admin", "office"] as const;
export const SNOW_ROLES = ["admin", "office", "field_manager"] as const;
export const isPrivilegedRole = (accessRole?: string | null) => !!accessRole && (PRIVILEGED_ROLES as readonly string[]).includes(accessRole);

export interface VisibilityInput {
  kind: "regular" | "parent";
  /** AM1 accessRole (account managers resolve to their underlying access role). */
  accessRole?: string | null;
  snowCovered: boolean;
}

export function visibleCustomerPages({ kind, accessRole, snowCovered }: VisibilityInput): CustomerPageKey[] {
  const order = kind === "parent" ? PARENT_PAGE_ORDER : REGULAR_PAGE_ORDER;
  return order.filter(key => {
    const access = CUSTOMER_PAGES[key].access;
    if (access === "all") return true;
    if (access === "privileged") return isPrivilegedRole(accessRole);
    return snowCovered && !!accessRole && (SNOW_ROLES as readonly string[]).includes(accessRole);
  });
}

/** Old ?tab= values and where they now live. */
export const LEGACY_TAB_ALIASES: Record<string, { tab: CustomerPageKey; view?: string }> = {
  overview: { tab: "dashboard" },
  "service-checklist": { tab: "services" },
  "annual-rollup": { tab: "services" },
  fulfillment: { tab: "services" },
  maps: { tab: "property" },
  settings: { tab: "property" },
  "rate-sheet": { tab: "billing", view: "rates" },
  revenue: { tab: "billing", view: "revenue" },
  "monthly-summary": { tab: "billing", view: "revenue" },
  "visual-scopes": { tab: "proposals", view: "scopes" },
};

/**
 * Returns the canonical search string (without "?") when the current one uses a
 * legacy tab alias, or null when nothing should change. All unrelated params are kept.
 */
export function canonicalCustomerSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tab = params.get("tab");
  if (!tab) return null;
  const alias = LEGACY_TAB_ALIASES[tab];
  if (!alias) return null;
  params.set("tab", alias.tab);
  if (alias.view) params.set("view", alias.view);
  return params.toString();
}

export const customerPageHref = (customerId: string, page: CustomerPageKey, view?: string) =>
  `/dashboard/customers/${customerId}?tab=${page}${view ? `&view=${view}` : ""}`;

export function resolveView(page: CustomerPageKey, view: string | null): string | null {
  const views = CUSTOMER_PAGES[page].views;
  if (!views) return null;
  return view && views.includes(view) ? view : views[0];
}
