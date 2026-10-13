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

const render = (role: string) => {
  fx.role = role;
  return renderToStaticMarkup(<Router ssrPath="/dashboard/contracts"><ProtectedRoute path="/dashboard/contracts" component={() => <p>board</p>} allowedRoles={["admin", "office"]} /></Router>);
};

describe("contract route access", () => {
  it("sends field roles to Access denied and lets office through", () => {
    expect(render("field_manager")).toContain('data-redirect="/access-denied"');
    expect(render("office")).toContain("board");
  });
  it("registers old page before :id and gates all three routes to admin/office", () => {
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const line = (p: string) => app.split("\n").findIndex(l => l.includes(`path="${p}"`));
    expect(line("/dashboard/contracts/old")).toBeGreaterThan(-1);
    expect(line("/dashboard/contracts/old")).toBeLessThan(line("/dashboard/contracts/:id"));
    for (const p of ["/dashboard/contracts/old", "/dashboard/contracts/:id", "/dashboard/contracts"])
      expect(app.split("\n")[line(p)]).toContain('allowedRoles={["admin", "office"]}');
  });
});
