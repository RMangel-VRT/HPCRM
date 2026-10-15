// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fx = vi.hoisted(() => ({
  user: { id: "u1", activeCompanyId: "co1" } as { id: string; activeCompanyId: string },
  api: vi.fn(), toast: vi.fn(), upload: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
vi.mock("@/lib/contractUpload", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/contractUpload")>()), uploadContractFile: (...a: unknown[]) => fx.upload(...a) }));
import NewContractPage from "@/pages/NewContractPage";
import { applyPreset, blankLine } from "@/components/contracts/paymentDraft";
import { newDraft, sessionKey } from "@/components/contracts/newContractDraft";

const customer = (o: object = {}) => ({ id: "c1", companyId: "co1", name: "Elm Court HOA", isParent: "false", street: "12 Elm St", city: "Denver", state: "CO", zip: "80202", ...o });
const ok = (data: unknown) => Promise.resolve({ json: async () => data });
let posts = 0;
function routes(over: Record<string, unknown> = {}) {
  fx.api.mockImplementation((method: string, url: string) => {
    if (method === "POST" && url === "/api/contract-center/contracts") { posts++; return ok({ id: "a1", terms: [{ id: "t1" }] }); }
    const path = url.split("?")[0];
    if (path in over) return ok(over[path]);
    if (path === "/api/customers/c1") return ok(customer());
    if (path === "/api/customers/c1/contacts") return ok([{ name: "Pat Lee", phones: ["303-555-0100"], emails: ["pat@elm.test"], isPrimary: "true" }]);
    if (path === "/api/contract-center/rate-card") return ok([]);
    if (path === "/api/property-management-companies") return ok([]);
    if (path === "/api/customers") return ok({ customers: [customer(), customer({ id: "p1", name: "Parent Co", isParent: "true" }), customer({ id: "x1", name: "Foreign", companyId: "co2" })] });
    return Promise.reject(new Error("404: not found"));
  });
}
function mount() {
  const loc = memoryLocation({ path: "/dashboard/contracts/new", record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => <QueryClientProvider client={qc}><Router hook={loc.hook}><NewContractPage /></Router></QueryClientProvider>;
  const r = render(ui());
  return { loc, rerender: () => r.rerender(ui()), unmount: r.unmount };
}
const draft = (o: object = {}) => {
  const pay = applyPreset(blankLine("Grounds maintenance", { total: "12000" }), "equal12", 11);
  return { ...newDraft("2026-10-12"), step: 6, customerId: "c1", customerName: "Elm Court HOA", line: "landscape", form: "theirs", payments: [pay], ...o };
};
const store = (u = "u1", co = "co1", d: object = draft()) => window.sessionStorage.setItem(sessionKey(co, u), JSON.stringify(d));
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 40)); });

beforeEach(() => { posts = 0; fx.api.mockReset(); fx.toast.mockReset(); fx.upload.mockReset(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/"); fx.user = { id: "u1", activeCompanyId: "co1" }; routes(); });
afterEach(cleanup);

describe("New contract flow", () => {
  it("shows inline validation on Next", async () => {
    mount();
    await userEvent.click(screen.getByTestId("button-next"));
    expect(screen.getByTestId("errors-step").textContent).toContain("Choose a customer");
    expect(screen.getByTestId("step-body-1")).toBeTruthy();
  });
  it("rejects foreign prefilled customers", async () => {
    for (const [id, body] of [["x9", customer({ id: "x9", companyId: "co2" })]] as const) {
      window.history.replaceState(null, "", `/dashboard/contracts/new?customerId=${id}`);
      routes({ [`/api/customers/${id}`]: body });
      const m = mount();
      await settle();
      expect(screen.queryByTestId("selected-customer")).toBeNull();
      expect(screen.getByTestId("errors-step")).toBeTruthy();
      m.unmount(); window.sessionStorage.clear();
    }
  });
  it("accepts a parent from URL preselection and verifies a saved parent draft before creating", async () => {
    const parent = customer({ id: "p1", name: "Parent Co", isParent: "true" });
    routes({ "/api/customers/p1": parent, "/api/customers/p1/contacts": [] });
    window.history.replaceState(null, "", "/dashboard/contracts/new?customerId=p1");
    const first = mount(); await settle();
    expect(screen.getByTestId("text-selected-customer").textContent).toBe("Parent Co");
    first.unmount(); window.sessionStorage.clear();
    store("u1", "co1", draft({ customerId: "p1", customerName: "Stale saved name" }));
    window.history.replaceState(null, "", "/dashboard/contracts/new");
    mount(); await settle();
    await userEvent.click(screen.getByTestId("button-create-contract"));
    await settle();
    expect(posts).toBe(1);
    expect(fx.api).toHaveBeenCalledWith("GET", "/api/customers/p1");
    expect(fx.api).toHaveBeenCalledWith("POST", "/api/contract-center/contracts", expect.objectContaining({ customerId: "p1" }));
  });
  it("makes parents selectable in search without exposing foreign customers", async () => {
    routes({ "/api/customers/p1": customer({ id: "p1", name: "Parent Co", isParent: "true" }), "/api/customers/p1/contacts": [] });
    mount(); await settle();
    const search = screen.getByPlaceholderText(/Search customers/i);
    await userEvent.type(search, "Parent"); await settle();
    const option = await screen.findByText("Parent Co");
    expect((option.closest("button") as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(option); await settle();
    expect(screen.getByTestId("text-selected-customer").textContent).toBe("Parent Co");
    expect(screen.queryByText("Foreign")).toBeNull();
  });
  it("prefills a valid customer with street and primary contact", async () => {
    window.history.replaceState(null, "", "/dashboard/contracts/new?customerId=c1");
    mount(); await settle();
    expect(screen.getByTestId("text-selected-customer").textContent).toBe("Elm Court HOA");
    await userEvent.click(screen.getByTestId("card-type-landscape")); await userEvent.click(screen.getByTestId("card-form-ours"));
    await userEvent.click(screen.getByTestId("button-next"));
    expect((screen.getByTestId("input-project-address") as HTMLInputElement).value).toContain("12 Elm St");
    expect((screen.getByTestId("input-project-contact") as HTMLInputElement).value).toBe("Pat Lee");
    expect((screen.getByTestId("input-contact-email") as HTMLInputElement).value).toBe("pat@elm.test");
  });
  it("keeps drafts separate per login and company", async () => {
    store("u1", "co1", { ...draft(), step: 1 });
    const m = mount(); await settle();
    expect(screen.getByTestId("text-selected-customer").textContent).toBe("Elm Court HOA");
    fx.user = { id: "u2", activeCompanyId: "co1" }; m.rerender(); await settle();
    expect(screen.queryByTestId("selected-customer")).toBeNull();
    fx.user = { id: "u1", activeCompanyId: "co2" }; m.rerender(); await settle();
    expect(screen.queryByTestId("selected-customer")).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(sessionKey("co1", "u1"))!).customerId).toBe("c1");
    expect(window.sessionStorage.getItem(sessionKey("co2", "u1"))).not.toContain("c1");
  });
  it("blocks create when the stored customer is not verified", async () => {
    store("u1", "co1", draft({ customerId: "x1" }));
    routes({ "/api/customers/x1": customer({ id: "x1", companyId: "co2" }) });
    mount(); await settle();
    await userEvent.click(screen.getByTestId("button-create-contract")); await settle();
    expect(posts).toBe(0);
    expect(screen.getByTestId("errors-step").textContent).toMatch(/customer/i);
  });
  it("creates once, recovers a failed upload and never posts again after reload", async () => {
    store();
    fx.upload.mockRejectedValueOnce(new Error("Upload failed"));
    const m = mount(); await settle();
    const file = new File(["x"], "form.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByTestId("input-their-form"), file);
    await userEvent.click(screen.getByTestId("button-create-contract")); await settle();
    expect(posts).toBe(1);
    expect(screen.getByTestId("upload-recovery").textContent).toContain("did not upload");
    expect(screen.queryByTestId("button-create-contract")).toBeNull();
    m.unmount();
    mount(); await settle();
    expect(screen.getByTestId("upload-recovery").textContent).toContain("already created");
    expect(screen.queryByTestId("button-create-contract")).toBeNull();
    expect((screen.getByTestId("button-retry-upload") as HTMLButtonElement).disabled).toBe(true);
    await userEvent.upload(screen.getByTestId("input-their-form"), file);
    fx.upload.mockResolvedValueOnce({});
    await userEvent.click(screen.getByTestId("button-retry-upload")); await settle();
    expect(posts).toBe(1);
    expect(fx.upload).toHaveBeenCalledTimes(2);
    expect(fx.toast).toHaveBeenCalledWith({ title: "Draft created" });
    expect(window.sessionStorage.getItem(sessionKey("co1", "u1"))).toBeNull();
  });
  it("ignores a double click on Create", async () => {
    store(); store("u1", "co1", draft({ form: "ours" }));
    mount(); await settle();
    const b = screen.getByTestId("button-create-contract");
    fireEvent.click(b); fireEvent.click(b); await settle();
    expect(posts).toBe(1);
  });
  it("uses an inline confirmation before discarding an unuploaded selected file", async () => {
    store(); mount(); await settle();
    await userEvent.upload(screen.getByTestId("input-their-form"), new File(["x"], "form.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByTestId("button-start-over"));
    expect(screen.getByTestId("confirm-file-leave").textContent).toContain("has not been uploaded");
    expect(screen.getByTestId("step-body-6")).toBeTruthy();
    await userEvent.click(screen.getByTestId("button-confirm-file-leave"));
    expect(screen.queryByTestId("confirm-file-leave")).toBeNull();
    expect(screen.getByTestId("step-body-1")).toBeTruthy();
    expect(posts).toBe(0);
  });
  it("renders both current edited and custom rates in the review", async () => {
    const base = { line: "landscape", category: "Extras", priceText: null, unit: "per visit", minimum: null, cardPriceText: null };
    store("u1", "co1", draft({ rates: [
      { ...base, rateKey: "rate_additional_mowing", label: "Additional mowing", priceCents: 60000, cardPriceCents: 60000, input: "610" },
      { ...base, rateKey: "custom_mulch", label: "Seasonal mulch", priceCents: 25000, cardPriceCents: null, input: "250" },
    ] }));
    mount(); await settle();
    expect(screen.getByTestId("review-rates").textContent).toContain("Additional mowing $610");
    expect(screen.getByTestId("review-rates").textContent).toContain("Seasonal mulch (custom) $250");
  });
});
