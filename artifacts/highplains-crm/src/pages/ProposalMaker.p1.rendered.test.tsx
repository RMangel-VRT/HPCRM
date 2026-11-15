// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u", activeCompanyId: "c", activeRole: "admin", accessRole: "admin" } }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
import ProposalMaker from "./ProposalMaker";

function mount(path: string, byTicket: unknown) {
  mocks.api.mockResolvedValue({ json: async () => byTicket });
  const loc = memoryLocation({ path, record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [] } } });
  render(<QueryClientProvider client={client}><Router hook={loc.hook}><ProposalMaker /></Router></QueryClientProvider>);
}
afterEach(() => { cleanup(); mocks.api.mockReset(); });

describe("proposal maker P1", () => {
  it("has no new-proposal dialog and directs to Estimates", async () => {
    mount("/dashboard/tools/proposals", null);
    expect(await screen.findByTestId("button-empty-go-to-estimates")).toBeTruthy();
    expect(screen.getByTestId("button-go-to-estimates")).toBeTruthy();
    expect(screen.queryByTestId("button-new-proposal")).toBeNull();
    expect(screen.queryByTestId("button-link-existing-proposal")).toBeNull();
  });
  it("ticket context opens the ticket's estimate", async () => {
    mount("/dashboard/tools/proposals?ticketId=t1&ticketTitle=Beds", { id: "e1", estimateNumber: "EST-4" });
    expect((await screen.findByTestId("button-open-ticket-estimate")).textContent).toContain("EST-4");
    expect(mocks.api).toHaveBeenCalledWith("GET", "/api/estimates/by-ticket/t1", undefined, expect.objectContaining({ headers: { "X-Company-Id": "c" } }));
  });
  it("ticket context explains an estimate is needed", async () => {
    mount("/dashboard/tools/proposals?ticketId=t1&ticketTitle=Beds", null);
    expect(await screen.findByTestId("ticket-estimate-missing")).toBeTruthy();
  });
});
