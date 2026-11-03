// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installFetch, type Call } from "@/test/qboFetch";

const fx = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
import CustomerByQbo from "./CustomerByQbo";

let calls: Call[] = [];
function mount(status: number, body: unknown, user: Record<string, unknown> = {}) {
  fx.user = { id: "u1", activeCompanyId: "c1", activeRole: "office", activeTags: [], ...user };
  ({ calls } = installFetch(() => ({ status, body })));
  const loc = memoryLocation({ path: "/dashboard/customers/by-qb/123", record: true });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Router hook={loc.hook}><Switch>
      <Route path="/dashboard/customers/by-qb/:qboId" component={CustomerByQbo} />
      <Route path="/dashboard/customers/:id">{(p: { id: string }) => <div data-testid="customer-detail">{p.id}</div>}</Route>
    </Switch></Router></QueryClientProvider>);
  return loc;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("by-QuickBooks-ID resolver", () => {
  it("resolves with company header and replaces history", async () => {
    const loc = mount(200, { id: "cust-77" });
    expect(await screen.findByTestId("customer-detail")).toHaveTextContent("cust-77");
    expect(calls[0]).toMatchObject({ url: "/api/customers/by-qbo/123", headers: { "X-Company-Id": "c1" } });
    expect(loc.history).toEqual(["/dashboard/customers/cust-77"]);
  });
  it("404 shows the exact message and review link for billing viewers", async () => {
    mount(404, { message: "Not found" });
    expect(await screen.findByTestId("text-by-qbo-missing")).toHaveTextContent("No CRM customer is linked to QuickBooks customer 123");
    expect(screen.getByTestId("link-by-qbo-review").getAttribute("href")).toBe("/dashboard/invoicing/quickbooks-review");
  });
  it("404 for a field manager still shows the message and review link (route enforces access)", async () => {
    mount(404, {}, { activeRole: "field_manager" });
    await screen.findByTestId("text-by-qbo-missing");
    expect(screen.getByTestId("link-by-qbo-review")).toBeInTheDocument();
  });
  it("other errors offer retry", async () => {
    mount(500, { message: "down" });
    await waitFor(() => expect(screen.getByTestId("button-retry-by-qbo")).toBeInTheDocument());
  });
  it("App registers by-qb before the generic customer route and review before invoicing", () => {
    const src = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    const byQb = src.indexOf('"/dashboard/customers/by-qb/:qboId"');
    expect(byQb).toBeGreaterThan(0);
    expect(byQb).toBeLessThan(src.indexOf('"/dashboard/customers/:id"'));
    const review = src.indexOf('"/dashboard/invoicing/quickbooks-review"');
    expect(review).toBeGreaterThan(0);
    expect(review).toBeLessThan(src.indexOf('path="/dashboard/invoicing" component'));
  });
});
