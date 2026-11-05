// @vitest-environment jsdom
import "@/test/qboFetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

expect.extend({
  toHaveValue(r: unknown, v: string) { const a = (r as HTMLInputElement | null)?.value; return { pass: a === v, message: () => `expected value ${v}, got ${a}` }; },
});
declare module "vitest" { interface Assertion<T = any> { toHaveValue(v: string): void } } // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
const fx = vi.hoisted(() => ({
  user: { id: "u1", activeCompanyId: "co1", activeRole: "admin", activeTags: [] as string[] },
  api: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => {} }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...a: unknown[]) => fx.api(...a) }));
import CustomerSetupWizard from "@/pages/CustomerSetupWizard";
import i18n from "@/i18n";
import { chipProblem, emailsRemaining } from "@/components/customerWizard/wizardModel";

type Call = { method: string; url: string; body: unknown; headers: Record<string, string> };
let calls: Call[] = [];
const res = (data: unknown) => Promise.resolve({ text: async () => JSON.stringify(data), json: async () => data });
const fail = (status: number, body: unknown) => Promise.reject(new Error(`${status}: ${JSON.stringify(body)}`));
let over: Record<string, () => Promise<unknown>> = {};
let dupCandidates: unknown[] = [];

function routes() {
  fx.api.mockImplementation((method: string, url: string, body: unknown, opts?: { headers?: Record<string, string> }) => {
    calls.push({ method, url, body, headers: opts?.headers ?? {} });
    const key = `${method} ${url.split("?")[0]}`;
    if (over[key]) return over[key]();
    if (key === "GET /api/customers/wizard/options") return res({ writeEnabled: false, baselineAt: null, mostUsedTermId: null });
    if (key === "GET /api/customers") return res({ total: 2, customers: [
      { id: "pm1", name: "Ridge Master Assoc", parentCustomerId: null, isParent: "true", branchBillingMode: "master", companyId: "co1" },
      { id: "ps1", name: "Split Holdings", parentCustomerId: null, isParent: "true", branchBillingMode: "separate", companyId: "co1" },
    ] });
    if (key === "GET /api/property-management-companies") return res([{ id: "mc1", name: "Front Range Mgmt", street: "9 Pine", city: "Denver", state: "CO", zip: "80203" }]);
    if (key === "GET /api/property-managers") return res([{ id: "mg1", name: "Dana Ruiz" }]);
    if (key === "GET /api/qbo/terms") return res([{ id: "t30", name: "Net 30" }]);
    if (key === "POST /api/qbo/customers/duplicate-check") return res({ candidates: dupCandidates });
    if (key === "POST /api/customers/wizard") return res({ customer: { id: "new1" }, qbo: { state: "not_linked" } });
    return fail(404, { message: "not found" });
  });
}

function mount(path = "/dashboard/customers/new", client?: QueryClient) {
  const loc = memoryLocation({ path, record: true });
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Router hook={loc.hook}><Switch>
    <Route path="/dashboard/customers/new" component={CustomerSetupWizard} />
    <Route>{() => <div data-testid="landed" />}</Route>
  </Switch></Router></QueryClientProvider>);
  return loc;
}
const type = (id: string, v: string) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });
const next = () => fireEvent.click(screen.getByTestId("button-wizard-next"));
const settle = (ms = 40) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const posted = (url: string) => calls.filter(c => c.url === url && c.method !== "GET");

beforeEach(async () => {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  calls = []; over = {}; dupCandidates = []; fx.api.mockReset(); fx.toast.mockReset(); routes();
  window.history.replaceState(null, "", "/");
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("customer wizard", () => {
  it("defaults a new customer's state to CO and offers creation statuses only", async () => {
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(screen.getByTestId("input-wizard-state")).toHaveValue("CO");
    expect(screen.queryByTestId("button-status-inactive")).toBeNull();
    expect(screen.getByTestId("button-status-prospect")).toBeInTheDocument();
  });
  it("invalidates an infinitely fresh empty paginated list after a successful save", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const key = ["/api/customers?page=1&limit=200"];
    qc.setQueryData(key, { customers: [], total: 0 });
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
    const location = mount("/dashboard/customers/new", qc);
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-name", "New visible prospect");
    next(); await screen.findByTestId("wizard-body-2"); next(); next(); next();
    fireEvent.click(await screen.findByTestId("button-wizard-submit"));
    await waitFor(() => expect(location.history?.at(-1)).toBe("/dashboard/customers/new1"));
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });
  it("prospect needs only a name; active requires the service address", async () => {
    mount();
    await screen.findByTestId("wizard-body-1");
    next();
    expect(screen.getByTestId("errors-step")).toHaveTextContent("Property name is required");
    type("input-wizard-name", "Cedar Point HOA");
    fireEvent.click(screen.getByTestId("button-status-active"));
    next();
    expect(screen.getByTestId("errors-step")).toHaveTextContent("Street is required for an active customer");
    fireEvent.click(screen.getByTestId("button-status-prospect"));
    next();
    expect(await screen.findByTestId("wizard-body-2")).toBeInTheDocument();
  });

  it("active billing requires name, email and complete bill-to; prospects may skip", async () => {
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Cedar Point");
    for (const [k, v] of [["street", "1 Oak"], ["city", "Golden"], ["state", "CO"], ["zip", "80401"]]) type(`input-wizard-${k}`, v);
    fireEvent.click(screen.getByTestId("button-status-active"));
    next();
    await screen.findByTestId("wizard-body-2");
    expect(screen.getByTestId("input-billing-name")).toHaveValue("Cedar Point");
    next();
    expect(screen.getByTestId("errors-step")).toHaveTextContent("Billing emails is required");
    type("input-billing-name", "Cedar: Point");
    next();
    expect(screen.getByTestId("errors-step")).toHaveTextContent("can't contain a colon");
  });

  it("counts the 100-character joined email limit and rejects overflow", async () => {
    expect(emailsRemaining(["a@b.co"])).toBe(94);
    expect(chipProblem(["x".repeat(90) + "@b.co"], "zz@b.co")).toBe("tooLong");
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Elm"); next();
    await screen.findByTestId("wizard-body-2");
    const input = screen.getByTestId("input-billing-email");
    fireEvent.change(input, { target: { value: "ap@elm.co" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("chip-email-ap@elm.co")).toBeInTheDocument();
    expect(screen.getByTestId("text-email-remaining")).toHaveTextContent("91 of 100");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("error-email-chip")).toHaveTextContent("isn't a valid email");
  });

  it("skips billing for a master-billed branch and says no QuickBooks customer", async () => {
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Ridge North");
    await waitFor(() => expect(screen.getByTestId("select-wizard-parent").querySelectorAll("option").length).toBe(3));
    type("select-wizard-parent", "pm1");
    next();
    expect(await screen.findByTestId("wizard-body-3")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step-2")).toBeDisabled();
    next(); next();
    expect(await screen.findByTestId("qbo-master")).toHaveTextContent("Bills through Ridge Master Assoc. No QuickBooks customer.");
    fireEvent.click(screen.getByTestId("button-wizard-submit"));
    await waitFor(() => expect(posted("/api/customers/wizard")).toHaveLength(1));
    const body = posted("/api/customers/wizard")[0].body as { customer: Record<string, unknown> };
    expect(body.customer.billingName).toBeUndefined();
    expect(body.customer.street).toBeUndefined();
    expect(body.customer.parentCustomerId).toBe("pm1");
  });

  it("does not promise a separate QuickBooks link for a master-billed branch", async () => {
    window.history.replaceState(null, "", "/dashboard/customers/new?fromQbo=q55");
    over["GET /api/customers/wizard/prefill/q55"] = () => res({
      customer: { name: "Remote branch", parentCustomerId: "pm1" }, qbo: { linkQboId: "q55" },
    });
    mount();
    await screen.findByTestId("banner-prefill");
    await waitFor(() => expect(screen.getByTestId("select-wizard-parent")).toHaveValue("pm1"));
    next();
    expect(screen.getByTestId("errors-step")).toHaveTextContent("A master-billed branch cannot have its own QuickBooks link");
    expect(posted("/api/customers/wizard")).toHaveLength(0);
  });
  it("offers Link for a duplicate billing name and ignores stale responses", async () => {
    dupCandidates = [{ qboId: "q9", displayName: "Aspen Ridge", matchType: "exact_display_name", city: "Lakewood" }];
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Aspen Ridge");
    fireEvent.click(screen.getByTestId("button-status-active"));
    for (const [k, v] of [["street", "1 Oak"], ["city", "Golden"], ["state", "CO"], ["zip", "80401"]]) type(`input-wizard-${k}`, v);
    next();
    await screen.findByTestId("wizard-body-2");
    await settle(600);
    expect(await screen.findByTestId("dup-matches")).toHaveTextContent("QuickBooks already has Aspen Ridge");
    const dupCall = posted("/api/qbo/customers/duplicate-check").at(-1)!;
    expect(dupCall.body).toMatchObject({ billingName: "Aspen Ridge", city: "Golden", zip: "80401" });
    expect(dupCall.headers["X-Company-Id"]).toBe("co1");
    next();
    expect(screen.getByTestId("errors-step")).toHaveTextContent("QuickBooks already has this billing name");
    fireEvent.click(screen.getByTestId("button-link-q9"));
    expect(screen.getByTestId("text-linked-qbo")).toHaveTextContent("Aspen Ridge");
    // A stale slow response for an old name must never replace the current state.
    let release!: () => void;
    over["POST /api/qbo/customers/duplicate-check"] = () => new Promise(r => { release = () => r({ text: async () => JSON.stringify({ candidates: dupCandidates }) }); });
    type("input-billing-name", "Aspen Ridge East");
    await settle(500);
    over["POST /api/qbo/customers/duplicate-check"] = () => res({ candidates: [] });
    type("input-billing-name", "Aspen Ridge West");
    await settle(500);
    await act(async () => { release(); });
    expect(await screen.findByTestId("text-dup-none")).toBeInTheDocument();
    expect(screen.queryByTestId("dup-matches")).toBeNull();
  });

  it("shows the empty terms fallback and the write-off gate on review", async () => {
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Birch"); next();
    expect(await screen.findByTestId("text-terms-no-default")).toBeInTheDocument();
    expect(screen.getByTestId("select-billing-terms")).toHaveValue("");
    next(); next(); next();
    expect(await screen.findByTestId("qbo-prospect")).toBeInTheDocument();
    expect(screen.queryByTestId("qbo-gate")).toBeNull();
    fireEvent.click(screen.getByTestId("checkbox-send-now"));
    expect(screen.getByTestId("qbo-gate")).toHaveTextContent("write access is turned on");
  });

  it("applies scoped most-used terms once without overwriting a user choice", async () => {
    over["GET /api/customers/wizard/options"] = () => res({ writeEnabled: true, baselineAt: "2026-01-01T00:00:00Z", mostUsedTermId: "t30" });
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Birch"); next();
    await waitFor(() => expect(screen.getByTestId("select-billing-terms")).toHaveValue("t30"));
    expect(screen.getByTestId("text-terms-default")).toBeInTheDocument();
  });

  it("previews the selected manager once and submits no duplicate manual contact", async () => {
    mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-name", "Managed prospect"); next();
    await screen.findByTestId("wizard-body-2");
    fireEvent.click(screen.getByTestId("button-billto-management_company"));
    await waitFor(() => expect(screen.getByTestId("select-pm-company").querySelectorAll("option").length).toBeGreaterThan(1));
    type("select-pm-company", "mc1");
    await waitFor(() => expect(screen.getByTestId("select-pm-manager").querySelectorAll("option").length).toBeGreaterThan(1));
    type("select-pm-manager", "mg1"); next();
    expect(await screen.findByTestId("wizard-body-3")).toHaveTextContent("Dana Ruiz");
    expect(screen.queryByTestId("input-contact-name-0")).not.toBeInTheDocument();
    next(); next(); fireEvent.click(await screen.findByTestId("button-wizard-submit"));
    await waitFor(() => expect(posted("/api/customers/wizard")).toHaveLength(1));
    expect(posted("/api/customers/wizard")[0].body).toMatchObject({
      customer: { propertyManagerId: "mg1", propertyManagementCompanyId: "mc1" }, contacts: [],
    });
  });
  it("Same as AP copies a one-time snapshot and Edit links return with retained state", async () => {
    mount();
    await screen.findByTestId("wizard-body-1");
    type("input-wizard-name", "Juniper"); next();
    await screen.findByTestId("wizard-body-2");
    type("input-billing-contact", "Lee Park");
    type("input-billing-phone", "303-555-0142");
    next();
    fireEvent.click(await screen.findByTestId("button-same-as-ap"));
    expect(screen.getByTestId("input-contact-name-0")).toHaveValue("Lee Park");
    expect(screen.getByTestId("badge-ap-0")).toBeInTheDocument();
    next(); next();
    fireEvent.click(await screen.findByTestId("button-review-edit-1"));
    expect(screen.getByTestId("input-wizard-name")).toHaveValue("Juniper");
    fireEvent.click(screen.getByTestId("wizard-step-5"));
    fireEvent.click(screen.getByTestId("button-wizard-submit"));
    await waitFor(() => expect(posted("/api/customers/wizard")).toHaveLength(1));
    const b = posted("/api/customers/wizard")[0].body as { contacts: Record<string, unknown>[] };
    expect(b.contacts[0]).toMatchObject({ name: "Lee Park", phones: ["303-555-0142"], isPrimary: "true" });
  });

  it("QuickBooks prefill links on create and reports name_taken with a review link", async () => {
    window.history.replaceState(null, "", "/dashboard/customers/new?fromQbo=q55");
    over["GET /api/customers/wizard/prefill/q55"] = () => res({ customer: { name: "Pine Hollow", billingName: "Pine Hollow LLC", street: "1 Elm", city: "Boulder", state: "CO", zip: "80302" }, qbo: { linkQboId: "q55" } });
    over["POST /api/customers/wizard"] = () => res({ customer: { id: "n5" }, qbo: { state: "error", review: { id: "rv1", kind: "name_taken" } } });
    const loc = mount();
    expect(await screen.findByTestId("banner-prefill")).toHaveTextContent("Pine Hollow LLC");
    next(); await screen.findByTestId("wizard-body-2"); next(); next(); next();
    expect(await screen.findByTestId("qbo-link")).toHaveTextContent("Pine Hollow LLC");
    fireEvent.click(screen.getByTestId("button-wizard-submit"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/customers/n5"));
    expect((posted("/api/customers/wizard")[0].body as { qbo: unknown }).qbo).toEqual({ sendNow: false, linkQboId: "q55" });
    expect(fx.toast.mock.calls[0][0].title).toBe("Customer created");
  });

  it("renders Spanish copy", async () => {
    await i18n.changeLanguage("es");
    mount();
    expect(await screen.findByTestId("text-wizard-title")).toHaveTextContent("Nuevo cliente");
    expect(screen.getByTestId("text-status-help")).toHaveTextContent("Los prospectos permanecen en el CRM");
  });
});
