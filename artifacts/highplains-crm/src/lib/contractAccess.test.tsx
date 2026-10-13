import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";

const fx = vi.hoisted(() => ({ role: "office" }));
vi.mock("wouter", async importOriginal => ({
  ...await importOriginal<typeof import("wouter")>(),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { activeRole: fx.role, isSuperAdminBool: false }, isLoading: false }) }));
import { ProtectedRoute } from "./protected-route";

const render = (role: string, path = "/dashboard/contracts") => {
  fx.role = role;
  return renderToStaticMarkup(<Router ssrPath={path}><ProtectedRoute path={path} component={() => <p>board</p>} allowedRoles={["admin", "office"]} /></Router>);
};

describe("contract route access", () => {
  it("sends field roles to Access denied and lets office through", () => {
    expect(render("field_manager")).toContain('data-redirect="/access-denied"');
    expect(render("office")).toContain("board");
  });
  it("permits new contracts only for admin and office", () => {
    for (const role of ["admin", "office"]) expect(render(role, "/dashboard/contracts/new")).toContain("board");
    for (const role of ["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "mapping", "landscape_supervisor", "crew_supervisor"]) {
      expect(render(role, "/dashboard/contracts/new")).toContain('data-redirect="/access-denied"');
    }
  });
  it("registers static pages before :id and gates all four routes to admin/office", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const line = (p: string) => app.split("\n").findIndex(l => l.includes(`path="${p}"`));
    expect(line("/dashboard/contracts/old")).toBeGreaterThan(-1);
    expect(line("/dashboard/contracts/old")).toBeLessThan(line("/dashboard/contracts/:id"));
    expect(line("/dashboard/contracts/new")).toBeGreaterThan(-1);
    expect(line("/dashboard/contracts/new")).toBeLessThan(line("/dashboard/contracts/:id"));
    for (const p of ["/dashboard/contracts/new", "/dashboard/contracts/old", "/dashboard/contracts/:id", "/dashboard/contracts"])
      expect(app.split("\n")[line(p)]).toContain('allowedRoles={["admin", "office"]}');
  });
});
