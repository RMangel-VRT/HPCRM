// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import i18n from "@/i18n";
const mocks = vi.hoisted(() => ({ user: { id: "u", activeCompanyId: "c", activeRole: "admin", accessRole: "admin" }, api: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
import { EstimateProposalButton, useEstimateProposals } from "./EstimateProposalAction";

function Harness({ voided = false }: { voided?: boolean }) {
  const s = useEstimateProposals("e1", voided);
  return <><EstimateProposalButton estimateId="e1" state={s} /><ul>{s.older.map(o => <li key={o.id} data-testid={`older-${o.id}`} />)}</ul></>;
}
function renderIt(voided = false) {
  const loc = memoryLocation({ path: "/dashboard/estimates/builder/e1", record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Router hook={loc.hook}><Harness voided={voided} /></Router></QueryClientProvider>);
  return loc;
}
const ok = (b: unknown) => ({ json: async () => b });
beforeEach(() => { mocks.api.mockReset(); mocks.user.accessRole = "admin"; void i18n.changeLanguage("en"); });
afterEach(() => cleanup());

describe("estimate builder proposal action", () => {
  it("makes a proposal from the estimate and opens it", async () => {
    mocks.api.mockImplementation(async (m: string) => m === "GET" ? ok([]) : ok({ id: "p9" }));
    const loc = renderIt();
    fireEvent.click(await screen.findByTestId("button-make-proposal"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/tools/proposals/p9"));
    expect(mocks.api).toHaveBeenCalledWith("GET", "/api/proposals?estimateId=e1", undefined, expect.objectContaining({ headers: { "X-Company-Id": "c" } }));
    expect(mocks.api).toHaveBeenCalledWith("POST", "/api/proposals", { estimateId: "e1" }, expect.objectContaining({ headers: { "X-Company-Id": "c" } }));
  });
  it("opens the newest proposal and exposes older ones, hiding void", async () => {
    mocks.api.mockResolvedValue(ok([
      { id: "p3", proposalNumber: "PR-3", status: "draft", title: "A", createdAt: "3" },
      { id: "p2", proposalNumber: "PR-2", status: "void", title: "B", createdAt: "2" },
      { id: "p1", proposalNumber: "PR-1", status: "finalized", title: "C", createdAt: "1" },
    ]));
    const loc = renderIt();
    fireEvent.click(await screen.findByText("Open proposal PR-3"));
    expect(loc.history?.at(-1)).toBe("/dashboard/tools/proposals/p3");
    expect(screen.getByTestId("older-p1")).toBeTruthy();
    expect(screen.queryByTestId("older-p2")).toBeNull();
  });
  it("is hidden for voided estimates and roles without proposal access", () => {
    renderIt(true);
    expect(screen.queryByTestId("button-make-proposal")).toBeNull();
    cleanup(); mocks.user.accessRole = "field";
    renderIt();
    expect(screen.queryByTestId("button-make-proposal")).toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("translates labels to Spanish", async () => {
    await i18n.changeLanguage("es");
    mocks.api.mockResolvedValue(ok([]));
    renderIt();
    expect((await screen.findByTestId("button-make-proposal")).textContent).toContain("Crear propuesta");
  });
});
