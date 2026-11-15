// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ api: vi.fn(), fetch: vi.fn(), user: { id: "u", accessRole: "admin", activeCompanyId: "c" } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
import { ContractedServicesPdfButton } from "./ContractedServicesPdfButton";
import "@/i18n";
let tab: { opener: unknown; close: ReturnType<typeof vi.fn>; location: { replace: ReturnType<typeof vi.fn> } };
const mount = (termId = "chosen") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ContractedServicesPdfButton customerId="p" termId={termId} agreementId="a" /></QueryClientProvider>);
};
beforeEach(() => {
  mocks.api.mockResolvedValue({ json: async () => ({ parent: false, targets: [{ customerId: "p", customerName: "Property", agreementId: "a" }] }) });
  mocks.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["PDF"]) });
  vi.stubGlobal("fetch", mocks.fetch);
  tab = { opener: null, close: vi.fn(), location: { replace: vi.fn() } };
  vi.spyOn(window, "open").mockReturnValue(tab as any);
  URL.createObjectURL = vi.fn(() => "blob:pdf"); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("season PDF button", () => {
  it("reserves a tab then requests the exact selected season and initiating company", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("button-contracted-services-pdf").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByTestId("button-contracted-services-pdf"));
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith("blob:pdf"));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/customers/p/contracted-services.pdf?termId=chosen", expect.objectContaining({ headers: { "X-Company-Id": "c" } }));
  });
  it("closes failed tabs and exposes safe scope errors with the viewed contract-season link", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "SCOPE_NEEDS_REVIEW", services: ["Clean-ups"] }) });
    mount("older");
    await waitFor(() => expect(screen.getByTestId("button-contracted-services-pdf").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByTestId("button-contracted-services-pdf"));
    expect((await screen.findByText("Fix the scope first: Clean-ups")).getAttribute("href")).toBe("/dashboard/contracts/a#term-older-scope");
    expect(tab.close).toHaveBeenCalled();
  });
  it("uses a covered child menu and hides unavailable snow-only output", async () => {
    mocks.api.mockResolvedValue({ json: async () => ({ parent: true, targets: [{ customerId: "child", customerName: "Covered child", agreementId: "a" }] }) });
    mount();
    await waitFor(() => expect(screen.getByTestId("button-contracted-services-pdf").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByTestId("button-contracted-services-pdf"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Covered child" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/customers/child/contracted-services.pdf?termId=chosen", expect.any(Object)));
    cleanup(); mocks.api.mockResolvedValue({ json: async () => ({ parent: false, targets: [] }) });
    mount("snow");
    await waitFor(() => expect(screen.queryByTestId("button-contracted-services-pdf")).toBeNull());
  });
});
