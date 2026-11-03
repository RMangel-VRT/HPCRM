// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import "@/i18n";
import "@/test/qboFetch";
import { installFetch } from "@/test/qboFetch";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { ProtectedRoute } from "@/lib/protected-route";
import { LoginRequiredRedirect } from "@/lib/landing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import LoginPage from "./LoginPage";
import CustomerByQbo from "./CustomerByQbo";
vi.mock("@assets/TRUCK_DECAL-06_1766432157419.png", () => ({ default: "logo.png" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

const user = (activeRole = "office") => ({ id: "u1", activeCompanyId: "co1", activeRole, activeTags: [], isSuperAdminBool: false });
function mount(path: string, activeRole = "office", signedIn = false, topLevelGuard = false) {
  window.history.replaceState(null, "", path);
  const { calls } = installFetch(url => {
    if (url === "/api/auth/me") return signedIn ? { body: user(activeRole) } : { status: 401 };
    if (url === "/api/auth/login") return { body: user(activeRole) };
    if (url === "/api/customers/by-qbo/123") return { body: { id: "cu123" } };
    return { status: 404 };
  });
  function Routes() {
    const auth = useAuth();
    if (topLevelGuard && !auth.user) return <Switch><Route path="/login" component={LoginPage} /><Route><LoginRequiredRedirect /></Route></Switch>;
    return <Switch>
    <Route path="/login" component={LoginPage} />
    <ProtectedRoute path="/dashboard/customers/by-qb/:qboId" component={CustomerByQbo} allowedRoles={["office", "admin"]} />
    <Route path="/dashboard/customers/:id">{p => <div data-testid="resolved-customer">{p.id}</div>}</Route>
    <Route path="/access-denied"><div data-testid="access-denied">Denied</div></Route>
    <Route path="/dashboard"><div data-testid="normal-landing">Dashboard</div></Route>
    </Switch>;
  }
  render(<QueryClientProvider client={queryClient}><AuthProvider><Router><Routes /></Router></AuthProvider></QueryClientProvider>);
  return calls;
}
async function signIn() {
  fireEvent.change(await screen.findByTestId("input-username"), { target: { value: "synthetic" } });
  fireEvent.change(screen.getByTestId("input-password"), { target: { value: "synthetic" } });
  fireEvent.click(screen.getByTestId("button-login"));
}
beforeEach(() => queryClient.clear());
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
describe("login return journey", () => {
  it("preserves the deep link through the real app's top-level signed-out fallback", async () => {
    const path = "/dashboard/customers/by-qb/123?from=irrigo&tab=details";
    mount(path, "office", false, true);
    await screen.findByTestId("input-username");
    expect(window.location.pathname + window.location.search).toBe(`/login?next=${encodeURIComponent(path)}`);
    await signIn(); await screen.findByTestId("resolved-customer");
    const source = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(source.match(/<LoginRequiredRedirect \/>/g)).toHaveLength(2);
    expect(source).not.toContain('<Redirect to="/login"');
    const authenticatedSwitch = source.slice(source.indexOf("function renderRouteSwitch()"), source.indexOf("function renderAuthenticatedApp()"));
    expect(authenticatedSwitch).toContain('<Route path="/login" component={LoginPage} />');
  });
  it("preserves path plus query while signed out, signs in once and resolves the linked customer", async () => {
    const path = "/dashboard/customers/by-qb/123?from=irrigo&tab=details";
    const calls = mount(path);
    await screen.findByTestId("input-username");
    expect(window.location.pathname + window.location.search).toBe(`/login?next=${encodeURIComponent(path)}`);
    await signIn();
    expect(await screen.findByTestId("resolved-customer")).toHaveTextContent("cu123");
    expect(calls.filter(c => c.url === "/api/auth/login")).toHaveLength(1);
    expect(calls.find(c => c.url === "/api/customers/by-qbo/123")?.headers).toMatchObject({ "X-Company-Id": "co1" });
  });
  it("retains normal access denial after returning to the requested route", async () => {
    const calls = mount("/dashboard/customers/by-qb/123?from=irrigo", "mapping");
    await signIn(); await screen.findByTestId("access-denied");
    expect(calls.some(c => c.url === "/api/customers/by-qbo/123")).toBe(false);
  });
  it("keeps ordinary credential login unchanged without next", async () => {
    mount("/login"); await signIn(); await screen.findByTestId("normal-landing");
  });
  it("uses the same safe destination for already-authenticated login visits", async () => {
    mount(`/login?next=${encodeURIComponent("/dashboard/customers/by-qb/123?source=already")}`, "office", true);
    await screen.findByTestId("resolved-customer");
  });
  it.each(["//evil.example", "https://evil.example", "/dashboard/%252e%252e/login", "/dashboard/\\evil.example"])("falls back after login for hostile next %s", async next => {
    mount(`/login?next=${encodeURIComponent(next)}`); await signIn();
    await waitFor(() => expect(screen.getByTestId("normal-landing")).toBeTruthy());
    expect(window.location.pathname).toBe("/dashboard");
  });
});
