// @vitest-environment jsdom
import "@/test/qboFetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, Route, Router, Switch } from "wouter";
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
import CustomerEdit, { CustomerSetupRedirect, returnHref } from "@/pages/CustomerEdit";
import i18n from "@/i18n";
import { buildEditPatch, draftFromServer } from "@/components/customerWizard/wizardModel";
import { unsavedGuard } from "@/lib/unsavedGuard";

type Call = { method: string; url: string; body: unknown };
let calls: Call[] = [];
const res = (data: unknown) => Promise.resolve({ text: async () => JSON.stringify(data), json: async () => data });
const fail = (status: number, body: unknown) => Promise.reject(new Error(`${status}: ${JSON.stringify(body)}`));
let over: Record<string, () => Promise<unknown>> = {};

const STAMP = "2026-02-01T10:00:00.000Z";
const record = (c: Record<string, unknown> = {}, contacts: Record<string, unknown>[] = []) => ({
  customer: {
    id: "c7", companyId: "co1", name: "Willow Bend", status: "prospect", street: "12 Elm", city: "Golden", state: "CO", zip: "80401-12",
    billingName: null, billingEmails: [], billToMode: "property", updatedAt: STAMP, gateCode: "1234", ...c,
  },
  contacts, missingFields: [],
});
let current = record();

function routes() {
  fx.api.mockImplementation((method: string, url: string, body: unknown) => {
    calls.push({ method, url, body });
    const key = `${method} ${url.split("?")[0]}`;
    if (over[key]) return over[key]();
    if (key === "GET /api/customers/c7/setup") return res(current);
    if (key === "GET /api/customers") return res({ total: 1, customers: [
      { id: "pm1", name: "Ridge Master Assoc", companyId: "co1", parentCustomerId: null, isParent: "true", branchBillingMode: "master",
        street: "1 Ridge", city: "Denver", state: "CO", zip: "80202", billingName: null, billingEmails: [], billToMode: "property" },
    ] });
    if (key === "GET /api/property-management-companies") return res([]);
    if (key === "GET /api/qbo/terms") return res([{ id: "t30", name: "Net 30" }]);
    if (key === "PATCH /api/customers/c7/setup") return res({ customer: { id: "c7" }, qbo: { state: "not_linked" } });
    return fail(404, { message: "not found" });
  });
}

function mount(path = "/dashboard/customers/c7/edit", client?: QueryClient) {
  const loc = memoryLocation({ path, record: true });
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Router hook={loc.hook}>
    <Link href="/dashboard/tickets" data-testid="link-away">Away</Link>
    <a href="#site" data-testid="link-hash">Site</a>
    <Switch>
      <Route path="/dashboard/customers/:id/edit" component={CustomerEdit} />
      <Route path="/dashboard/customers/:id/setup" component={CustomerSetupRedirect} />
      <Route>{() => <div data-testid="landed" />}</Route>
    </Switch>
  </Router></QueryClientProvider>);
  return loc;
}
const type = (id: string, v: string) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });
const patches = () => calls.filter(c => c.method === "PATCH");
const save = () => fireEvent.click(screen.getByTestId("button-save-bar"));
const settle = (ms = 40) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

beforeEach(async () => {
  calls = []; over = {}; current = record(); fx.api.mockReset(); fx.toast.mockReset(); routes();
  window.history.replaceState(null, "", "/");
  Element.prototype.scrollIntoView = () => {};
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("customer editor", () => {
  it("hydrates every section, is clean until edited, and sends only the changed fact", async () => {
    const loc = mount();
    expect(await screen.findByTestId("input-wizard-name")).toHaveValue("Willow Bend");
    for (const s of ["property", "billing", "contacts", "site"]) expect(screen.getByTestId(`edit-section-${s}`)).toBeInTheDocument();
    expect(screen.queryByTestId("bar-unsaved")).toBeNull();
    expect(screen.getByTestId("button-save-edit")).toBeDisabled();
    // Untouched null billing name shows empty with the name as placeholder; legacy ZIP stays as stored.
    expect(screen.getByTestId("input-billing-name")).toHaveValue("");
    expect(screen.getByTestId("input-billing-name").getAttribute("placeholder")).toBe("Willow Bend");
    expect(screen.getByTestId("input-wizard-zip")).toHaveValue("80401-12");
    type("input-site-gate", "9999");
    expect(screen.getByTestId("text-unsaved")).toHaveTextContent("Unsaved changes");
    save();
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7"));
    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toEqual({ customer: {}, contacts: [], siteNotes: { gateCode: "9999" }, deletedContactIds: [], expectedUpdatedAt: STAMP });
  });

  it("reverting an edit is clean again; Discard restores the loaded values", async () => {
    mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    expect(screen.getByTestId("bar-unsaved")).toBeInTheDocument();
    type("input-wizard-city", "Golden");
    expect(screen.queryByTestId("bar-unsaved")).toBeNull();
    type("input-wizard-city", "Arvada");
    fireEvent.click(screen.getByTestId("button-discard"));
    expect(screen.getByTestId("input-wizard-city")).toHaveValue("Golden");
  });

  it("inactive edits stay inactive; inactive -> active with missing facts is blocked with a live list", async () => {
    current = record({ status: "inactive", street: "", billingEmails: [] });
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(screen.getByTestId("button-status-inactive").getAttribute("aria-pressed")).toBe("true");
    type("input-wizard-name", "Willow Bend East");
    save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toMatchObject({ customer: { name: "Willow Bend East" } });
    expect((patches()[0].body as { customer: object }).customer).not.toHaveProperty("status");
  });

  it("blocks any non-active -> active change until required facts exist, marking fields inline", async () => {
    current = record({ status: "inactive", street: "", billingEmails: [] });
    mount();
    await screen.findByTestId("input-wizard-name");
    fireEvent.click(screen.getByTestId("button-status-active"));
    await settle();
    const box = screen.getByTestId("notice-activation-blocked");
    expect(box).toHaveTextContent("To make this customer active");
    expect(screen.getByTestId("missing-street")).toBeInTheDocument();
    expect(screen.getByTestId("missing-billingEmails")).toBeInTheDocument();
    expect(screen.getByTestId("need-street")).toHaveTextContent("Needed to activate");
    save();
    await settle();
    expect(patches()).toHaveLength(0);
    type("input-wizard-street", "12 Elm");
    await settle();
    expect(screen.queryByTestId("missing-street")).toBeNull();
  });

  it("already-active incomplete customers get an advisory, not a block", async () => {
    current = record({ status: "active", billingEmails: [] });
    const loc = mount();
    await screen.findByTestId("input-wizard-name");
    await settle();
    expect(screen.getByTestId("notice-activation-advisory")).toBeInTheDocument();
    type("input-site-gate", "77");
    save();
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7"));
  });

  it("shows a reload path on a 409 conflict and keeps the draft until reloaded", async () => {
    over["PATCH /api/customers/c7/setup"] = () => fail(409, { code: "CUSTOMER_CONFLICT", message: "changed" });
    mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    save();
    expect(await screen.findByTestId("error-conflict")).toHaveTextContent("Someone else changed this customer");
    expect(screen.getByTestId("input-wizard-city")).toHaveValue("Arvada");
    current = record({ city: "Lakewood", updatedAt: "2026-02-02T00:00:00.000Z" });
    fireEvent.click(screen.getByTestId("button-reload"));
    await waitFor(() => expect(screen.getByTestId("input-wizard-city")).toHaveValue("Lakewood"));
    expect(screen.queryByTestId("error-conflict")).toBeNull();
  });

  it("contacts: edits notes, adds and deletes in the same save; unchanged rows are omitted", async () => {
    current = record({}, [
      { id: "k1", name: "Ann Ode", role: "Board", emails: ["ann@wb.co"], phones: [], isPrimary: "true", notes: "Prefers text" },
      { id: "k2", name: "Old Contact", emails: [], phones: [], isPrimary: "false" },
      { id: "k3", name: "Same Person", emails: [], phones: [], isPrimary: "false" },
    ]);
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(await screen.findByTestId("input-contact-notes-0")).toHaveValue("Prefers text");
    type("input-contact-notes-0", "Prefers email");
    fireEvent.click(screen.getByTestId("button-remove-contact-1"));
    fireEvent.click(screen.getByTestId("button-add-contact"));
    type("input-contact-name-2", "New Person");
    save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    const body = patches()[0].body as { contacts: Record<string, unknown>[]; deletedContactIds: string[]; customer: object };
    expect(body.customer).toEqual({});
    expect(body.deletedContactIds).toEqual(["k2"]);
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts[0]).toMatchObject({ id: "k1", notes: "Prefers email", name: "Ann Ode" });
    expect(body.contacts[1]).toMatchObject({ name: "New Person" });
    expect(body.contacts[1]).not.toHaveProperty("id");
  });

  it("warns about QuickBooks only for a linked customer with billing-relevant changes", async () => {
    current = record({ qboCustomerId: "88" });
    mount();
    await screen.findByTestId("input-wizard-name");
    type("input-site-gate", "1");
    expect(screen.queryByTestId("text-qbo-send-note")).toBeNull();
    type("input-billing-phone", "303-555-0148");
    expect(screen.getByTestId("text-qbo-send-note")).toBeInTheDocument();
  });

  it("billing terms failure offers Retry and never a raw term ID input", async () => {
    let ok = false;
    over["GET /api/qbo/terms"] = () => (ok ? res([{ id: "t30", name: "Net 30" }]) : fail(500, { message: "down" }));
    mount();
    expect(await screen.findByTestId("error-terms")).toBeInTheDocument();
    expect(screen.queryByTestId("select-billing-terms")).toBeNull();
    ok = true;
    fireEvent.click(screen.getByTestId("button-retry-terms"));
    expect(await screen.findByTestId("select-billing-terms")).toBeInTheDocument();
  });

  it("live bill-to preview uses the shared resolver and follows unsaved edits", async () => {
    mount();
    await screen.findByTestId("input-wizard-name");
    await waitFor(() => expect(screen.getByTestId("text-billto-preview")).toHaveTextContent("12 Elm"));
    type("input-wizard-street", "40 Aspen Way");
    await waitFor(() => expect(screen.getByTestId("text-billto-preview")).toHaveTextContent("40 Aspen Way"));
  });

  it("keeps a legacy non-code state visible and flagged", async () => {
    current = record({ state: "Colorado" });
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(screen.getByTestId("input-wizard-state")).toHaveValue("Colorado");
    expect(screen.getByTestId("input-wizard-state-check")).toHaveTextContent("Check state");
  });

  it("guards in-app links while dirty; hash anchors never prompt", async () => {
    const loc = mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    fireEvent.click(screen.getByTestId("link-hash"));
    expect(screen.queryByTestId("dialog-confirm-leave")).toBeNull();
    fireEvent.click(screen.getByTestId("link-away"));
    expect(await screen.findByTestId("dialog-confirm-leave")).toBeInTheDocument();
    expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7/edit");
    fireEvent.click(screen.getByTestId("button-stay"));
    await settle();
    fireEvent.click(screen.getByTestId("link-away"));
    fireEvent.click(await screen.findByTestId("button-confirm-leave"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/tickets"));
  });

  it("Cancel with no edits leaves directly; with edits asks first", async () => {
    const loc = mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    fireEvent.click(screen.getByTestId("button-cancel-edit"));
    expect(await screen.findByTestId("dialog-confirm-leave")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-confirm-leave"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7"));
  });

  it("returns to the section's tab after saving from a hash", async () => {
    window.history.replaceState(null, "", "/x#contacts");
    const loc = mount();
    await screen.findByTestId("input-wizard-name");
    type("input-site-gate", "5");
    save();
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7?tab=contacts"));
    expect(returnHref("c7", "#billing")).toBe("/dashboard/customers/c7?tab=billing");
    expect(returnHref("c7", "#site")).toBe("/dashboard/customers/c7?tab=property");
  });

  it("ignores a save that resolves after the company switched", async () => {
    let release: (v: unknown) => void = () => {};
    over["PATCH /api/customers/c7/setup"] = () => new Promise(r => { release = r; }).then(() => ({ text: async () => "{}", json: async () => ({}) }));
    const loc = mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    save();
    await settle();
    cleanup();
    release(null);
    await settle();
    expect(fx.toast).not.toHaveBeenCalled();
    expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7/edit");
  });

  it("legacy /setup links redirect to the editor", async () => {
    const loc = mount("/dashboard/customers/c7/setup");
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/customers/c7/edit"));
  });
});

describe("browser history guard (real wouter browser location)", () => {
  it("Back while dirty re-pushes the editor, asks, then lands exactly on the target; Forward too", async () => {
    window.history.replaceState(null, "", "/dashboard/customers/c7");
    window.history.pushState(null, "", "/dashboard/customers/c7/edit");
    // Represents an ancestor router subscriber installed before the editor mounts.
    // It must see the restored editor pathname, not a leaving pathname that can
    // synchronously unmount the draft before a bubble-phase guard runs.
    const observedPaths: string[] = [];
    const ancestorSubscriber = () => { observedPaths.push(window.location.pathname); };
    window.addEventListener("popstate", ancestorSubscriber);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Router><Switch>
      <Route path="/dashboard/customers/:id/edit" component={CustomerEdit} />
      <Route>{() => <div data-testid="landed" />}</Route>
    </Switch></Router></QueryClientProvider>);
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    await act(async () => {
      window.history.back();
      await new Promise(r => setTimeout(r, 30));
    });
    expect(await screen.findByTestId("dialog-confirm-leave")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard/customers/c7/edit");
    expect(observedPaths[0]).toBe("/dashboard/customers/c7/edit");
    expect(screen.getByTestId("input-wizard-city")).toHaveValue("Arvada");
    fireEvent.click(screen.getByTestId("button-stay"));
    await settle();
    expect(screen.queryByTestId("landed")).toBeNull();
    await act(async () => {
      window.history.back();
      await new Promise(r => setTimeout(r, 30));
    });
    fireEvent.click(await screen.findByTestId("button-confirm-leave"));
    await waitFor(() => expect(window.location.pathname).toBe("/dashboard/customers/c7"));
    expect(await screen.findByTestId("landed")).toBeInTheDocument();
    window.removeEventListener("popstate", ancestorSubscriber);
  });
});

describe("edit patch model", () => {
  it("never fabricates billing name, ZIP or defaults from an untouched legacy record", () => {
    const base = draftFromServer({ name: "A", billingName: null, zip: "8040", status: "inactive", state: "" }, [], { edit: true });
    expect(base.status).toBe("inactive");
    expect(base.state).toBe("");
    expect(buildEditPatch(base, { ...base, name: "B" })).toEqual({ customer: { name: "B" }, contacts: [], siteNotes: {}, deletedContactIds: [] });
    expect(buildEditPatch(base, { ...base, billingName: "Billing Co", billingNameTouched: true }).customer).toEqual({ billingName: "Billing Co" });
  });
});

const PARENTS = [
  { id: "pm1", name: "Ridge Master Assoc", companyId: "co1", parentCustomerId: null, isParent: "true", branchBillingMode: "master",
    street: "1 Ridge", city: "Denver", state: "CO", zip: "80202", billingName: "Ridge Billing", billingEmails: ["ap@ridge.co"], billToMode: "property" },
  { id: "pmx", name: "Hollow Master Assoc", companyId: "co1", parentCustomerId: null, isParent: "true", branchBillingMode: "master",
    street: "", city: "", state: "", zip: "", billingName: null, billingEmails: [], billToMode: "property" },
  { id: "ps1", name: "Split Holdings", companyId: "co1", parentCustomerId: null, isParent: "true", branchBillingMode: "separate",
    street: "5 Split", city: "Boulder", state: "CO", zip: "80301", billingName: "Split", billingEmails: ["s@split.co"], billToMode: "property" },
];
const MGMT = [
  { id: "mc1", name: "Front Range Mgmt", street: "9 Pine", city: "Denver", state: "CO", zip: "80203" },
  { id: "mc2", name: "Half Address Mgmt", street: "", city: "Denver", state: "CO", zip: "" },
];
const card = (customer: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  () => res({ customer: { id: "c7", ...customer }, reviews: [], billsThroughParent: false, ...extra });

describe("customer editor: parents and management billing parity", () => {
  beforeEach(() => {
    over["GET /api/customers"] = () => res({ total: 3, customers: PARENTS });
    over["GET /api/property-management-companies"] = () => res(MGMT);
    over["GET /api/property-managers"] = () => res([{ id: "mg1", name: "Dana Ruiz" }]);
  });

  it.each([null, "pm1"])("management selectors remain editable in Property independently of own/parent billing (%s)", async parentCustomerId => {
    current = record({ parentCustomerId, billToMode: "property", qboCustomerId: "q1" });
    mount();
    await screen.findByTestId("input-wizard-name");
    const company = await screen.findByTestId("select-pm-company");
    expect(company.closest("#property")).not.toBeNull();
    expect(screen.getAllByTestId("select-pm-company")).toHaveLength(1);
    fireEvent.change(company, { target: { value: "mc1" } });
    expect(screen.getByTestId("select-pm-manager")).toBeEnabled();
    await waitFor(() => expect(screen.getByTestId("select-pm-manager").querySelector('option[value="mg1"]')).not.toBeNull());
    fireEvent.change(screen.getByTestId("select-pm-manager"), { target: { value: "mg1" } });
    expect(screen.getByTestId("select-pm-manager")).toHaveValue("mg1");
    // Directory ownership is not a QBO billing change in property/master modes.
    expect(screen.queryByTestId("text-qbo-send-note")).toBeNull();
  });

  it("master-billed branch: billing comes from the parent, preview resolves via parent, no billing inputs", async () => {
    current = record({ parentCustomerId: "pm1", status: "prospect" });
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(await screen.findByTestId("text-master-billing")).toHaveTextContent("Ridge Master Assoc");
    expect(screen.queryByTestId("input-billing-name")).toBeNull();
    expect(screen.getByTestId("link-edit-parent-billing").getAttribute("href")).toBe("/dashboard/customers/pm1/edit#billing");
    await waitFor(() => expect(screen.getByTestId("text-billto-preview")).toHaveTextContent("1 Ridge"));
  });

  it("master-billed branch activation uses the parent's incomplete billing and links to it", async () => {
    current = record({ parentCustomerId: "pmx", status: "prospect" });
    mount();
    await screen.findByTestId("input-wizard-name");
    await waitFor(() => expect(screen.getByTestId("text-billto-preview")).toHaveTextContent("Hollow Master Assoc"));
    fireEvent.click(screen.getByTestId("button-status-active"));
    await settle();
    expect(screen.getByTestId("notice-activation-blocked")).toBeInTheDocument();
    expect(screen.getByTestId("missing-billingName")).toBeInTheDocument();
    expect(screen.getByTestId("missing-billingEmails")).toBeInTheDocument();
    expect(screen.getByTestId("missing-billTo")).toBeInTheDocument();
    expect(screen.getByTestId("link-parent-billing").getAttribute("href")).toBe("/dashboard/customers/pmx/edit#billing");
    save(); await settle();
    expect(patches()).toHaveLength(0);
  });

  it("separate-billing parent: the branch keeps its own billing section and preview", async () => {
    current = record({ parentCustomerId: "ps1" });
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(screen.queryByTestId("text-master-billing")).toBeNull();
    expect(screen.getByTestId("input-billing-name")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("text-billto-preview")).toHaveTextContent("12 Elm"));
    expect(screen.getByTestId("text-billto-preview").textContent).not.toContain("Split");
  });

  it("management company: c/o preview, incomplete company address blocks activation", async () => {
    current = record({ billToMode: "management_company", propertyManagementCompanyId: "mc1", billingName: "WB HOA", billingEmails: ["a@wb.co"] });
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(await screen.findByTestId("text-care-of")).toHaveTextContent("c/o Front Range Mgmt");
    await waitFor(() => expect(screen.getByTestId("text-billto-preview")).toHaveTextContent("Front Range Mgmt"));
    fireEvent.change(screen.getByTestId("select-pm-company"), { target: { value: "mc2" } });
    expect(await screen.findByTestId("text-care-of-incomplete")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("text-billto-preview-incomplete")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("button-status-active"));
    await settle();
    expect(screen.getByTestId("missing-billTo")).toBeInTheDocument();
    expect(screen.getByTestId("need-billTo")).toHaveTextContent("Needed to activate");
  });

  it("clearing the management company also clears the manager", async () => {
    current = record({ billToMode: "custom", billStreet: "1 A", billCity: "B", billState: "CO", billZip: "80000", propertyManagementCompanyId: "mc1", propertyManagerId: "mg1" });
    mount();
    await screen.findByTestId("input-wizard-name");
    fireEvent.click(screen.getByTestId("button-billto-management_company"));
    await screen.findByTestId("select-pm-company");
    fireEvent.change(screen.getByTestId("select-pm-company"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-billto-custom"));
    save();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect((patches()[0].body as { customer: object }).customer).toEqual({ propertyManagementCompanyId: null, propertyManagerId: null });
  });
});

describe("customer editor: chrome, guards and cache", () => {
  it.each([
    ["linked", { qboCustomerId: "88", qboSyncState: "in_sync" }, {}, "In QuickBooks"],
    ["via_parent", { qboSyncState: "via_parent" }, { billsThroughParent: true }, "Billed via parent"],
    ["collision", { qboSyncState: "error" }, { reviews: [{ id: "r1", kind: "name_taken" }] }, "QuickBooks name clash"],
    ["error", { qboSyncState: "error" }, {}, "QuickBooks error"],
    ["waiting", { qboSyncState: "pending_push" }, {}, "Waiting on QuickBooks"],
    ["not_linked", {}, {}, "Not in QuickBooks"],
  ])("header QuickBooks chip: %s", async (state, c, extra, text) => {
    over["GET /api/customers/c7/quickbooks-card"] = card(c, extra);
    mount();
    const chip = await screen.findByTestId("chip-qbo-state");
    expect(chip.getAttribute("data-state")).toBe(state);
    expect(chip).toHaveTextContent(text);
  });

  it("sidebar/topbar leave requests open the confirm while dirty", async () => {
    const loc = mount();
    await screen.findByTestId("input-wizard-name");
    type("input-wizard-city", "Arvada");
    act(() => unsavedGuard.requestLeave("/dashboard/routes"));
    fireEvent.click(await screen.findByTestId("button-confirm-leave"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/routes"));
  });

  it("beforeunload is blocked only while dirty", async () => {
    mount();
    await screen.findByTestId("input-wizard-name");
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    type("input-wizard-city", "Arvada");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("scrolls to the opened hash section after hydrate and section chips/links jump without prompting", async () => {
    const seen: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { seen.push(this.id); };
    window.requestAnimationFrame = ((f: FrameRequestCallback) => { f(0); return 0; }) as typeof requestAnimationFrame;
    window.history.replaceState(null, "", "/x#site");
    mount();
    await screen.findByTestId("input-wizard-name");
    await waitFor(() => expect(seen).toContain("site"));
    expect(screen.getByTestId("link-section-site").getAttribute("aria-current")).toBe("true");
    type("input-wizard-city", "Arvada");
    fireEvent.click(screen.getByTestId("chip-section-billing"));
    expect(seen.at(-1)).toBe("billing");
    expect(window.location.hash).toBe("#billing");
    expect(screen.getByTestId("chip-section-billing").getAttribute("aria-current")).toBe("true");
    expect(screen.queryByTestId("dialog-confirm-leave")).toBeNull();
  });

  it("invalidates customer-scoped queries incl. the detail contacts key and QuickBooks lists after save", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    mount(undefined, qc);
    await screen.findByTestId("input-wizard-name");
    type("input-site-gate", "1");
    save();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // The tested predicate only reads queryKey; these deliberately minimal
    // fixtures do not need a live TanStack Query instance.
    const pred = spy.mock.calls.find(c => typeof c[0]?.predicate === "function")![0]!.predicate! as unknown as (q: { queryKey: unknown[] }) => boolean;
    for (const k of [["/api/customers", "c7"], ["/api/customers", "c7", "contacts"], ["/api/customers/c7/contacts"], ["/api/customers?page=1"], ["/api/customers", "c7", "setup", "co1"]])
      expect(pred({ queryKey: k })).toBe(true);
    expect(pred({ queryKey: ["/api/tickets"] })).toBe(false);
    const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey ?? null));
    expect(keys).toContain(JSON.stringify(["/api/qbo/customer-reviews"]));
    expect(keys).toContain(JSON.stringify(["/api/property-managers"]));
  });

  it("renders Spanish copy", async () => {
    await i18n.changeLanguage("es");
    mount();
    await screen.findByTestId("input-wizard-name");
    expect(screen.getByTestId("button-save-edit")).toHaveTextContent("Guardar cambios");
    type("input-wizard-city", "Arvada");
    expect(screen.getByTestId("text-unsaved")).toHaveTextContent("Cambios sin guardar");
  });
});
