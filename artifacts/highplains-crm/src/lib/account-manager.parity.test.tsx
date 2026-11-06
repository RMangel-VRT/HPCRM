import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { accessRole, ROLE_VALUES, type Role } from "../../../../lib/db/src/accessRole";
import { NAV_GROUPS, getNavForUser } from "@/components/nav/navConfig";
import { workViewsFor, WORK_VIEWS, type WorkFamily } from "@/components/nav/workNav";
import { canUseRoutes } from "@/hooks/use-routes";
import { canViewBilling, showBillingSidebar } from "@/lib/billing";
const fx = vi.hoisted(() => ({ role: "admin", superAdmin: false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: fx.role, accessRole: fx.role === "account_manager" ? "admin" : fx.role, isSuperAdminBool: fx.superAdmin } }) }));
vi.mock("wouter", async original => ({ ...await original<typeof import("wouter")>(), Redirect: () => <b>denied</b> }));
import { ProtectedRoute } from "./protected-route";
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const definitions = [...app.matchAll(/<ProtectedRoute\s+path="([^"]+)"([\s\S]*?)\/>/g)].map(m => ({
  path: m[1], roles: m[2].match(/allowedRoles=\{\[([^\]]+)\]\}/)?.[1].match(/"([^"]+)"/g)?.map(r => r.slice(1, -1)) as Role[] | undefined,
  superOnly: /superAdminOnly/.test(m[2]), billing: /access=\{canViewBilling\}/.test(m[2]),
}));
function route(def: typeof definitions[number], role: Role, superAdmin = false) {
  fx.role = role; fx.superAdmin = superAdmin;
  return renderToStaticMarkup(<Router ssrPath={def.path}><ProtectedRoute path={def.path} component={() => <b>allowed</b>}
    allowedRoles={def.roles} superAdminOnly={def.superOnly} access={def.billing ? canViewBilling : undefined} /></Router>);
}
describe("production-definition-driven account-manager parity", () => {
  it("projects only account_manager and keeps every other real role", () => {
    for (const role of ROLE_VALUES) expect(accessRole(role)).toBe(role === "account_manager" ? "admin" : role);
  });
  it("covers every protected route, preserves all other role gates, and keeps platform privilege separate", () => {
    expect(definitions.length).toBeGreaterThan(60);
    for (const def of definitions) {
      expect(route(def, "account_manager"), def.path).toBe(route(def, "admin"));
      for (const role of ROLE_VALUES.filter(r => r !== "account_manager")) {
        const allowed = !def.superOnly && (!def.roles || def.roles.includes(role)) && (!def.billing || canViewBilling({ activeRole: role }));
        expect(route(def, role).includes("allowed"), `${def.path}/${role}`).toBe(allowed);
      }
    }
  });
  it("covers every navigation definition and work/settings/routes/billing helper, including all other roles", () => {
    for (const group of NAV_GROUPS) for (const item of group.items) for (const tags of [[], ["billing"]]) {
      expect(item.visible({ activeRole: "account_manager", activeTags: tags }), item.key)
        .toBe(item.visible({ activeRole: "admin", activeTags: tags }));
    }
    for (const tags of [[], ["billing"]]) {
      expect(getNavForUser({ activeRole: "account_manager", activeTags: tags })).toEqual(getNavForUser({ activeRole: "admin", activeTags: tags }));
    }
    for (const family of Object.keys(WORK_VIEWS) as WorkFamily[]) expect(workViewsFor(family, "account_manager")).toEqual(workViewsFor(family, "admin"));
    expect(canUseRoutes("account_manager")).toBe(canUseRoutes("admin"));
    expect(showBillingSidebar({ activeRole: "account_manager" })).toBe(showBillingSidebar({ activeRole: "admin" }));
    for (const role of ROLE_VALUES) expect(canUseRoutes(role)).toBe(["admin", "office", "field_manager", "irrigation_manager"].includes(accessRole(role)));
  });
});
