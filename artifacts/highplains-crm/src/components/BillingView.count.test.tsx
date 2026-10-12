import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fixtures = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock("@tanstack/react-query", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQuery: () => ({ data: fixtures.rows, isLoading: false, isError: false }),
}));
import BillingView from "./BillingView";

describe("rendered Billing header", () => {
  it.each([
    [0, "0 charges waiting"],
    [1, "1 charge waiting"],
    [2, "2 charges waiting"],
  ])("uses the correct wording for %i charges", (count, label) => {
    fixtures.rows = Array.from({ length: count }, (_, i) => ({
      id: `charge-${i}`, title: `Charge ${i}`, customer: null, sourceTicket: null,
    }));
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Router ssrPath="/dashboard/billing">
          <BillingView role="office" companyId="company" userId="viewer" users={new Map()} />
        </Router>
      </QueryClientProvider>,
    );
    expect(html).toContain(`data-testid="text-billing-count">${label}</h2>`);
    expect(html.includes('data-testid="billing-empty"')).toBe(count === 0);
  });
});
