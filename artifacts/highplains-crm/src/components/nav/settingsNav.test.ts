import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { SETTINGS_SECTIONS, isSettingsRailPage, settingsRailFor, settingsSectionFor } from "./settingsNav";

const expected = [
  ["Company", ["company", "seasons", "benchmarks", "crews", "property-management"]],
  ["Services & catalog", ["service-plans", "work-item-templates", "chemical-products", "contracts"]],
  ["Communication", ["email-templates", "notification-templates", "shared-mailboxes"]],
  ["Integrations", ["billing", "qbo-customers"]],
  ["System", ["features", "database"]],
] as const;
const labels = [
  "Company profile", "Seasons", "Benchmarks", "Crews", "Property managers",
  "Service plans", "Work item templates", "Chemical products", "Contract defaults",
  "Email templates", "Notification templates", "Shared mailboxes",
  "QuickBooks invoicing", "QuickBooks customer mapping", "Feature flags", "Database",
];
const spanish = [
  "Perfil de la empresa", "Temporadas", "Referencias", "Cuadrillas", "Administradores de propiedades",
  "Planes de servicio", "Plantillas de trabajo", "Productos químicos", "Valores de contrato",
  "Plantillas de correo", "Plantillas de notificación", "Buzones compartidos",
  "Facturación de QuickBooks", "Vinculación de clientes de QuickBooks", "Funciones", "Base de datos",
];
const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

describe("Settings navigation source of truth", () => {
  it("contains the exact ordered admin section, item and href table", async () => {
    await i18n.changeLanguage("en");
    const rail = settingsRailFor({ activeRole: "admin" });
    expect(rail.map(s => [s.label, s.items.map(i => i.key)])).toEqual(expected);
    expect(rail.flatMap(s => s.items).map(i => i.label)).toEqual(labels);
    expect(rail.flatMap(s => s.items).map(i => i.href)).toEqual(
      expected.flatMap(([, keys]) => keys.map(k => `/dashboard/settings/${k}`)),
    );
    expect(SETTINGS_SECTIONS).toHaveLength(5);
  });
  it("shows office only Company > Property managers and drops all empty groups", () => {
    expect(settingsRailFor({ activeRole: "office" })).toEqual([{
      label: "Company", items: [{ key: "property-management", label: "Property managers", href: "/dashboard/settings/property-management" }],
    }]);
  });
  it("keeps Platform Admin visibility, with no Settings items for other roles", () => {
    expect(settingsRailFor({ activeRole: "field", isSuperAdminBool: true }).flatMap(s => s.items)).toHaveLength(16);
    for (const activeRole of ["field", "field_manager", "chemical_manager", "irrigation_manager",
      "shop_manager", "landscape_supervisor", "crew_supervisor", "mapping"]) {
      expect(settingsRailFor({ activeRole })).toEqual([]);
    }
    expect(settingsRailFor(null)).toEqual([]);
  });
  it("every visible href resolves to the first registered route and permits its viewer", () => {
    const routes = Array.from(app.matchAll(/<ProtectedRoute\s+path="([^"]+)"[\s\S]*?allowedRoles=\{(\[[^\]]+\])\}[\s\S]*?\/>/g));
    for (const activeRole of ["admin", "office"]) {
      for (const item of settingsRailFor({ activeRole }).flatMap(s => s.items)) {
        const match = routes.find(([, path]) =>
          new RegExp(`^${path.replace(/:[^/]+/g, "[^/]+")}$`).test(item.href));
        expect(match, item.href).toBeDefined();
        expect(JSON.parse(match![2]), item.href).toContain(activeRole);
      }
    }
    expect(app).toContain('path="/dashboard/settings/notification-templates" component={ChemicalNotificationTemplates} allowedRoles={["admin"]}');
    expect(app).toContain('path="/dashboard/settings/shared-mailboxes" component={SharedMailboxesAndOversightPage} allowedRoles={["admin", "office"]}');
    expect(app).toContain('path="/dashboard/settings/qbo-customers" component={QboCustomerMapping} allowedRoles={["admin", "office"]}');
  });
  it("uses the exact supplied Spanish table without changing stable keys or URLs", async () => {
    await i18n.changeLanguage("es");
    const rail = settingsRailFor({ activeRole: "admin" });
    expect(rail.map(s => s.label)).toEqual(["Empresa", "Servicios y catálogo", "Comunicación", "Integraciones", "Sistema"]);
    expect(rail.flatMap(s => s.items).map(i => i.label)).toEqual(spanish);
    expect(rail.flatMap(s => s.items).map(i => i.href)).toEqual(
      expected.flatMap(([, keys]) => keys.map(k => `/dashboard/settings/${k}`)),
    );
    await i18n.changeLanguage("en");
  });
  it("resolves direct/default URLs and enforces the office contracts fallback", () => {
    expect(settingsSectionFor("/dashboard/settings/benchmarks?x=1", { activeRole: "admin" })).toBe("benchmarks");
    expect(settingsSectionFor("/dashboard/settings", { activeRole: "admin" })).toBe("company");
    expect(settingsSectionFor("/dashboard/settings/unknown", { activeRole: "admin" })).toBe("company");
    for (const path of ["settings", "settings/contracts", "settings/company", "settings/seasons"]) {
      expect(settingsSectionFor(`/dashboard/${path}`, { activeRole: "office" })).toBe("property-management");
    }
  });
  it("excludes My Mailbox from the Settings rail and shell padding exception", () => {
    expect(isSettingsRailPage("/dashboard/settings/my-mailbox")).toBe(false);
    expect(isSettingsRailPage("/dashboard/settings/my-mailbox/")).toBe(false);
    expect(isSettingsRailPage("/dashboard/settings/qbo-customers")).toBe(true);
    expect(isSettingsRailPage("/dashboard/settings")).toBe(true);
    expect(settingsRailFor({ activeRole: "admin" }).flatMap(s => s.items).some(i => i.key === "my-mailbox")).toBe(false);
  });
});
