import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const fx = vi.hoisted(() => ({ user: null as any }));
vi.mock("wouter", async importOriginal => ({
  ...await importOriginal<typeof import("wouter")>(),
  Redirect: ({ to }: { to: string }) => <div data-redirect={to} />,
  useLocation: () => ["/login", () => {}],
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: fx.user, loginMutation: { mutate: () => {}, isPending: false } }),
}));
vi.mock("@assets/TRUCK_DECAL-06_1766432157419.png", () => ({ default: "x.png" }));
import "@/i18n";
import LoginPage from "@/pages/LoginPage";
import { DefaultRedirect } from "./landing";

const target = (html: string) => /data-redirect="([^"]*)"/.exec(html)?.[1].replace(/&amp;/g, "&");
const u = (activeRole: string, activeTags: string[] = [], extra = {}) => ({ id: "u", activeRole, activeTags, isSuperAdminBool: false, ...extra });

describe("login and default landing (rendered redirect components)", () => {
  it("office + billing-tagged lands on To invoice from login and from /", () => {
    fx.user = u("office", ["billing"]);
    expect(target(renderToStaticMarkup(<LoginPage />))).toBe("/dashboard/tickets/my?tab=invoice");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={fx.user} />))).toBe("/dashboard/tickets/my?tab=invoice");
  });
  it("other landings are preserved", () => {
    fx.user = u("office");
    expect(target(renderToStaticMarkup(<LoginPage />))).toBe("/dashboard");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={u("admin")} />))).toBe("/dashboard");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={u("mapping")} />))).toBe("/dashboard/maps");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={u("admin", [], { isSuperAdminBool: true })} />))).toBe("/admin");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={null} />))).toBe("/login");
  });
  it("billing tags take precedence over non-billing default role landings", () => {
    expect(target(renderToStaticMarkup(<DefaultRedirect user={u("mapping", ["billing"])} />))).toBe("/dashboard/tickets/my?tab=invoice");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={u("admin", ["billing"], { isSuperAdminBool: true })} />))).toBe("/dashboard/tickets/my?tab=invoice");
  });
  it("crew supervisors land on My Tickets at login and at the default route", () => {
    fx.user = u("crew_supervisor");
    expect(target(renderToStaticMarkup(<LoginPage />))).toBe("/dashboard/tickets/my");
    expect(target(renderToStaticMarkup(<DefaultRedirect user={fx.user} />))).toBe("/dashboard/tickets/my");
    fx.user = u("crew_supervisor", ["billing"]);
    expect(target(renderToStaticMarkup(<LoginPage />))).toBe("/dashboard/tickets/my?tab=invoice");
  });
  it("signed-out login page renders the form, not a redirect", () => {
    fx.user = null;
    expect(renderToStaticMarkup(<LoginPage />)).not.toContain("data-redirect");
  });
});
