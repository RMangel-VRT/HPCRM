// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "@/i18n";
import "@/test/qboFetch";
import i18n from "@/i18n";
const fx = vi.hoisted(() => ({ api: vi.fn(), user: { id: "u1", activeCompanyId: "co1", activeRole: "office" } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => fx.api(...args) }));
import { useCustomerActivation } from "./CustomerActivationDialog";
import { FinishSetupBanner } from "./FinishSetupBanner";
import type { MissingField } from "./wizardModel";

const response = (body: unknown) => ({ text: async () => JSON.stringify(body) });
const failure = (code: string, missingFields?: string[]) => Promise.reject(new Error(`400: ${JSON.stringify({ code, missingFields })}`));
function Harness({ fields = [], prospect = true }: { fields?: MissingField[]; prospect?: boolean }) {
  const activation = useCustomerActivation();
  return <><button onClick={() => activation.offer(prospect ? { customerActivation: { customerId: "cu1", status: "prospect", missingFields: fields } } : {}, "Ridge HOA")}>Win</button>{activation.dialog}</>;
}
function mount(fields: MissingField[] = [], prospect = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["/api/customers?page=1"], {});
  client.setQueryData(["/api/customers", "cu1", "setup", "co1"], {});
  const loc = memoryLocation({ path: "/dashboard/contracts/a" });
  const ui = () => <QueryClientProvider client={client}><Router hook={loc.hook}><Harness fields={fields} prospect={prospect} /></Router></QueryClientProvider>;
  const rendered = render(ui());
  fireEvent.click(screen.getByText("Win"));
  return { client, loc, rerender: () => rendered.rerender(ui()) };
}
beforeEach(() => { fx.api.mockReset(); fx.user = { id: "u1", activeCompanyId: "co1", activeRole: "office" }; });
afterEach(async () => { cleanup(); await i18n.changeLanguage("en"); });
describe("explicit customer activation", () => {
  it("activates once, binds the request to its company, invalidates customer caches and never claims remote success", async () => {
    let resolve!: (v: unknown) => void;
    fx.api.mockReturnValue(new Promise(r => { resolve = r; }));
    const { client } = mount();
    expect(screen.getByRole("dialog").textContent).toContain("Ridge HOA is still a prospect.");
    const activate = screen.getByText("Activate now");
    fireEvent.click(activate); fireEvent.click(activate);
    expect(fx.api).toHaveBeenCalledTimes(1);
    expect(fx.api).toHaveBeenCalledWith("PATCH", "/api/customers/cu1", { status: "active" }, { headers: { "X-Company-Id": "co1" } });
    expect((screen.getByText("Not now") as HTMLButtonElement).disabled).toBe(true);
    resolve(response({ status: "active", qboSyncState: "pending_push" }));
    await screen.findByText("Customer activated");
    expect(screen.getByRole("dialog").textContent).toContain("asynchronous");
    expect(client.getQueryState(["/api/customers?page=1"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["/api/customers", "cu1", "setup", "co1"])?.isInvalidated).toBe(true);
  });
  it("leads incomplete prospects to their existing setup route without activating", () => {
    mount(["billingEmails"]);
    expect(screen.getByTestId("activation-missing")).toHaveTextContent("Billing emails");
    expect(screen.getByRole("link", { name: "Finish setup" }).getAttribute("href")).toBe("/dashboard/customers/cu1/setup");
    expect(screen.queryByText("Activate now")).toBeNull();
    expect(fx.api).not.toHaveBeenCalled();
  });
  it("Not now does not activate, and an already-active win has no prompt", () => {
    mount(); fireEvent.click(screen.getByText("Not now"));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(fx.api).not.toHaveBeenCalled();
    cleanup(); mount([], false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("replaces stale completeness with authoritative missing fields", async () => {
    fx.api.mockImplementation(() => failure("ACTIVATION_INCOMPLETE", ["billingName", "billTo"]));
    mount(); fireEvent.click(screen.getByText("Activate now"));
    expect(await screen.findByTestId("activation-missing")).toHaveTextContent("Complete bill-to address");
    expect(screen.getByRole("link", { name: "Finish setup" })).toBeTruthy();
    expect(screen.queryByText("Activate now")).toBeNull();
  });
  it("keeps failures actionable and retryable without replaying the win", async () => {
    fx.api.mockRejectedValueOnce(new Error("503: unavailable")).mockResolvedValueOnce(response({ status: "active" }));
    mount(); fireEvent.click(screen.getByText("Activate now"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already saved");
    fireEvent.click(screen.getByText("Activate now"));
    await screen.findByText("Customer activated");
    expect(fx.api).toHaveBeenCalledTimes(2);
  });
  it("hides an old-company prompt immediately", async () => {
    const { rerender } = mount();
    fx.user = { ...fx.user, activeCompanyId: "co2" }; rerender();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fx.api).not.toHaveBeenCalled();
  });
  it("localizes new dialog copy in Spanish", async () => {
    await i18n.changeLanguage("es"); mount(["billingEmails"]);
    expect(screen.getByRole("dialog").textContent).toContain("sigue siendo un cliente potencial");
    expect(screen.getByText("Ahora no")).toBeTruthy();
  });
});
describe("Finish setup banner", () => {
  it.each(["active", "prospect"])("shows authoritative missing fields for incomplete %s customers", async status => {
    fx.api.mockResolvedValue(response({ missingFields: ["billingEmails"] }));
    render(<QueryClientProvider client={new QueryClient()}><FinishSetupBanner customerId="cu1" status={status} /></QueryClientProvider>);
    expect(await screen.findByTestId("banner-finish-setup")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/dashboard/customers/cu1/setup");
  });
  it("does not load setup details for a role without setup permission", () => {
    fx.user.activeRole = "field";
    render(<QueryClientProvider client={new QueryClient()}><FinishSetupBanner customerId="cu1" status="active" /></QueryClientProvider>);
    expect(screen.queryByTestId("banner-finish-setup")).toBeNull(); expect(fx.api).not.toHaveBeenCalled();
  });
});
