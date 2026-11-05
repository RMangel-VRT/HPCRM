// @vitest-environment jsdom
import "@/test/qboFetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ProtectedRoute } from "@/lib/protected-route";

const auth = vi.hoisted(() => ({ role: "office" }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "viewer", activeCompanyId: "company", activeRole: auth.role, isSuperAdminBool: false }, isLoading: false }),
}));
afterEach(cleanup);

describe("customer editor route authorization", () => {
  it.each(["admin", "office"])("allows %s to reach the editor before the detail route", async role => {
    auth.role = role;
    const location = memoryLocation({ path: "/dashboard/customers/c7/edit" });
    render(<Router hook={location.hook}><Switch>
      <ProtectedRoute path="/dashboard/customers/:id/edit" component={() => <div>Editor content</div>} allowedRoles={["admin", "office"]} />
      <Route path="/dashboard/customers/:id">{() => <div>Detail content</div>}</Route>
      <Route>{() => <div>Denied</div>}</Route>
    </Switch></Router>);
    expect(await screen.findByText("Editor content")).toBeInTheDocument();
    expect(screen.queryByText("Detail content")).toBeNull();
  });
  it.each(["field", "field_manager", "chemical_manager", "irrigation_manager", "landscape_supervisor", "shop_manager", "mapping", "crew_supervisor"])("blocks %s before mounting editable customer data", async role => {
    auth.role = role;
    const mounted = vi.fn();
    const location = memoryLocation({ path: "/dashboard/customers/c7/edit" });
    render(<Router hook={location.hook}><Switch>
      <ProtectedRoute path="/dashboard/customers/:id/edit" component={() => { mounted(); return <div>Editor content</div>; }} allowedRoles={["admin", "office"]} />
      <Route path="/access-denied">{() => <div>Denied</div>}</Route>
    </Switch></Router>);
    expect(await screen.findByText("Denied")).toBeInTheDocument();
    expect(mounted).not.toHaveBeenCalled();
  });
});
