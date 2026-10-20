import i18n from "@/i18n";
import type { RailSection } from "./SectionRail";

type SettingsViewer = { activeRole?: string; isSuperAdminBool?: boolean } | null | undefined;
type SettingsSection = {
  labelKey: string;
  items: { key: string; labelKey: string; href: string; roles: readonly string[] }[];
};
const admin = ["admin"] as const;
const item = (key: string, roles: readonly string[] = admin) => ({
  key, labelKey: `settings.rail.items.${key}`, href: `/dashboard/settings/${key}`, roles,
});

/** Ordered source of truth for every Settings destination, including standalone pages. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { labelKey: "settings.rail.sections.company", items: [
    item("company"), item("seasons"), item("benchmarks"), item("crews"),
    item("property-management", ["admin", "office"]),
  ] },
  { labelKey: "settings.rail.sections.services", items: [
    item("service-plans"), item("work-item-templates"), item("chemical-products"), item("contracts"),
  ] },
  { labelKey: "settings.rail.sections.communication", items: [
    item("email-templates"), item("notification-templates"), item("shared-mailboxes"),
  ] },
  { labelKey: "settings.rail.sections.integrations", items: [item("billing"), item("qbo-customers")] },
  { labelKey: "settings.rail.sections.system", items: [item("features"), item("database")] },
];

export function settingsRailFor(user: SettingsViewer): RailSection[] {
  if (!user) return [];
  return SETTINGS_SECTIONS.map(section => ({
    label: i18n.t(section.labelKey),
    items: section.items
      .filter(item => user.isSuperAdminBool || item.roles.includes(user.activeRole ?? ""))
      .map(({ key, labelKey, href }) => ({ key, label: i18n.t(labelKey), href })),
  })).filter(section => section.items.length > 0);
}

/** Standalone destinations are routed before SettingsPage, never rendered as stub tabs. */
const standaloneKeys = new Set(["notification-templates", "shared-mailboxes", "qbo-customers"]);
export function settingsSectionFor(location: string, user: SettingsViewer): string {
  const requested = location.split("?")[0].split("/").filter(Boolean).at(-1);
  const validTabs = settingsRailFor(user).flatMap(section => section.items)
    .filter(item => !standaloneKeys.has(item.key)).map(item => item.key);
  return requested && validTabs.includes(requested)
    ? requested
    : user?.activeRole === "admin" || user?.isSuperAdminBool ? "company" : "property-management";
}

export function isSettingsRailPage(location: string): boolean {
  return /^\/dashboard\/settings(?:\/|$)/.test(location)
    && !/^\/dashboard\/settings\/my-mailbox(?:\/|$)/.test(location);
}
