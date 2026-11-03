// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installFetch, type Call } from "@/test/qboFetch";

const fx = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
import QboCustomerCard, { POLL_LIMIT_MS, POLL_MS } from "./QboCustomerCard";

const customer = (o: Record<string, unknown> = {}) => ({ id: "k1", name: "Cottonwood Flats", status: "prospect", billingName: "Cottonwood Flats HOA",
  billingEmails: ["ap@cottonwood.org"], billingPhone: "303-555-0144", billToMode: "property", branchBillingMode: "master", qboTermId: "3",
  qboSyncState: "not_linked", qboCustomerId: null, parentCustomerId: null, propertyManagementCompanyId: null, ...o });
const card = (o: Record<string, unknown> = {}, c: Record<string, unknown> = {}) => {
  const cu = customer(c);
  return { customer: cu, effectiveCustomer: cu, parent: null, billsThroughParent: false, billToModeLabel: "Property",
    billTo: { name: "Cottonwood Flats HOA", lines: ["410 Larkspur Dr", "Longmont, CO 80501"], street: "410 Larkspur Dr", street2: null, city: "Longmont", state: "CO", zip: "80501" },
    managementCompanyName: null, linkedName: null, baselineAt: null, writeEnabled: true, reviews: [], ...o };
};

let calls: Call[] = [];
let current: unknown;
function mount(data: unknown, user: Record<string, unknown> = {}, extra?: (url: string, init: RequestInit) => { status?: number; body?: unknown } | undefined) {
  current = data;
  fx.user = { id: "u1", activeCompanyId: "c1", activeRole: "office", activeTags: [], ...user };
  ({ calls } = installFetch((url, init) => extra?.(url, init) ?? (
    url === "/api/customers/k1/quickbooks-card" ? { body: current }
    : url === "/api/qbo/terms" ? { body: [{ id: "3", name: "Net 30" }] }
    : url.endsWith("/send-now") ? { status: 202, body: { ok: true, state: "pending_push", message: "Waiting to send" } }
    : { body: [] })));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><QboCustomerCard customerId="k1" /></QueryClientProvider>);
}
const state = () => screen.getByTestId("text-qbo-state");
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("QuickBooks customer card", () => {
  it("shows the assigned term projection without granting nonbilling viewers the full terms lookup", async () => {
    mount(card({ termLabel: "Net 30" }), { activeRole: "field_manager" });
    expect(await screen.findByTestId("text-qbo-terms")).toHaveTextContent("Net 30");
    expect(calls.some(c => c.url === "/api/qbo/terms")).toBe(false);
  });
  it("retains bill-to and explicit assigned-term error when the live terms lookup fails", async () => {
    mount(card({ termLookupError: "Unable to look up billing term. Refresh to try again." }));
    expect(await screen.findByTestId("error-qbo-assigned-term")).toHaveTextContent("Refresh");
    expect(screen.getByTestId("text-qbo-bill-to")).toHaveTextContent("410 Larkspur Dr");
  });
  it("not linked prospect: summary, term label, send button for office, scoped header", async () => {
    mount(card());
    await screen.findByTestId("text-qbo-state");
    expect(state()).toHaveTextContent("Not in QuickBooks yet");
    expect(screen.getByTestId("text-qbo-bill-to")).toHaveTextContent("410 Larkspur Dr");
    expect(screen.getByTestId("text-qbo-bill-to")).toHaveTextContent("Property");
    await waitFor(() => expect(screen.getByTestId("text-qbo-terms")).toHaveTextContent("Net 30"));
    expect(screen.getByTestId("button-send-to-qbo")).toHaveTextContent("Send to QuickBooks now");
    expect(calls.every(c => c.headers["X-Company-Id"] === "c1")).toBe(true);
  });

  it.each([
    ["linked", card({ linkedName: "Cottonwood Flats HOA" }, { qboSyncState: "in_sync", qboCustomerId: "88", qboPushedAt: "2025-10-30T12:00:00Z" }), "Linked to Cottonwood Flats HOA"],
    ["waiting", card({ writeEnabled: false }, { qboSyncState: "pending_push" }), "Waiting to send (write access off)"],
    ["via_parent", card({ billsThroughParent: true, parent: { id: "p1", name: "Ridgeview Holdings" } }, { qboSyncState: "via_parent", parentCustomerId: "p1" }), "Bills through Ridgeview Holdings"],
    ["error", card({}, { qboSyncState: "error", qboLastError: "Duplicate Name Exists" }), "Couldn't update QuickBooks"],
    ["collision", card({ reviews: [{ id: "r9", kind: "name_taken" }] }, { qboSyncState: "error" }), "Name already used in QuickBooks"],
  ])("state %s", async (k, data, text) => {
    mount(data);
    await screen.findByTestId("text-qbo-state");
    expect(state()).toHaveTextContent(text);
    // Hidden when linked, billed via parent or blocked by a name collision; disabled with a reason while waiting.
    if (["linked", "via_parent", "collision"].includes(k)) expect(screen.queryByTestId("button-send-to-qbo")).toBeNull();
    if (k === "waiting") {
      expect(screen.getByTestId("button-send-to-qbo")).toBeDisabled();
      expect(screen.getByTestId("text-qbo-send-hint")).toHaveTextContent("write access is off");
    }
  });

  it("review link only for billing-authorized viewers; field manager sees state, term ID fallback, no terms query, no actions", async () => {
    mount(card({ reviews: [{ id: "r1", kind: "changed_in_qbo" }] }), { activeRole: "field_manager" });
    await screen.findByTestId("text-qbo-state");
    expect(screen.getByTestId("link-qbo-card-review").tagName).toBe("SPAN");
    expect(screen.getByTestId("text-qbo-terms")).toHaveTextContent("Term 3");
    expect(calls.some(c => c.url === "/api/qbo/terms")).toBe(false);
    expect(screen.queryByTestId("button-edit-billing")).toBeNull();
    cleanup();
    mount(card({ reviews: [{ id: "r1", kind: "changed_in_qbo" }] }), { activeRole: "field", activeTags: ["billing"] });
    expect((await screen.findByTestId("link-qbo-card-review")).getAttribute("href")).toContain("review=r1");
    expect(screen.queryByTestId("button-send-to-qbo")).toBeNull();
  });

  it("send-now polls every 5s, stops at a terminal state", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(card());
    const btn = await screen.findByTestId("button-send-to-qbo");
    current = card({}, { qboSyncState: "pending_push" });
    fireEvent.click(btn);
    const send = () => calls.find(c => c.url.endsWith("/send-now"));
    await waitFor(() => expect(send()).toBeTruthy());
    expect(send()!.body).toEqual({});
    expect(send()!.headers["X-Company-Id"]).toBe("c1");
    await waitFor(() => expect(state()).toHaveTextContent("Waiting to send"));
    const before = calls.filter(c => c.url.endsWith("quickbooks-card")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10); });
    expect(calls.filter(c => c.url.endsWith("quickbooks-card")).length).toBeGreaterThan(before);
    current = card({ linkedName: "Cottonwood Flats HOA" }, { qboSyncState: "in_sync", qboCustomerId: "90" });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10); });
    await waitFor(() => expect(state()).toHaveTextContent("Linked"));
    const settled = calls.filter(c => c.url.endsWith("quickbooks-card")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(calls.filter(c => c.url.endsWith("quickbooks-card")).length).toBe(settled);
  });

  it("after 60s without change leaves Waiting with Refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(card());
    const btn = await screen.findByTestId("button-send-to-qbo");
    current = card({}, { qboSyncState: "pending_push" });
    fireEvent.click(btn);
    await waitFor(() => expect(state()).toHaveTextContent("Waiting to send"));
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_LIMIT_MS + 100); });
    expect(state()).toHaveTextContent("Waiting to send");
    expect(await screen.findByTestId("button-qbo-refresh")).toBeInTheDocument();
    const n = calls.filter(c => c.url.endsWith("quickbooks-card")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2); });
    expect(calls.filter(c => c.url.endsWith("quickbooks-card")).length).toBe(n);
  });

  it("billing edit validates custom address and email client-side, PATCHes owner fields only", async () => {
    mount(card(), {}, (url, init) => url === "/api/customers/k1" && init.method === "PATCH" ? { body: {} } : undefined);
    fireEvent.click(await screen.findByTestId("button-edit-billing"));
    fireEvent.change(screen.getByTestId("input-billingEmails"), { target: { value: "ap@cottonwood.org, nope" } });
    fireEvent.click(screen.getByTestId("button-save-billing"));
    expect(await screen.findByText("Enter valid email addresses, separated by commas")).toBeInTheDocument();
    expect(calls.some(c => c.method === "PATCH")).toBe(false);
    fireEvent.change(screen.getByTestId("input-billingEmails"), { target: { value: "ap@cottonwood.org; mgr@cottonwood.org" } });
    fireEvent.click(screen.getByTestId("button-save-billing"));
    await waitFor(() => expect(calls.some(c => c.method === "PATCH")).toBe(true));
    const patch = calls.find(c => c.method === "PATCH")!;
    expect(patch.headers["X-Company-Id"]).toBe("c1");
    expect(patch.body).toMatchObject({ billingEmails: ["ap@cottonwood.org", "mgr@cottonwood.org"], billToMode: "property", qboTermId: "3" });
    expect(Object.keys(patch.body as object).some(k => /^qbo(Sync|Baseline|Customer|Display|Last|Pushed)/.test(k))).toBe(false);
  });

  it("server validation error stays in the dialog", async () => {
    mount(card(), {}, (url, init) => init.method === "PATCH" ? { status: 400, body: { message: "Billing address is incomplete" } } : undefined);
    fireEvent.click(await screen.findByTestId("button-edit-billing"));
    fireEvent.click(screen.getByTestId("button-save-billing"));
    expect(await screen.findByTestId("error-billing-save")).toHaveTextContent("Billing address is incomplete");
  });

  it("load failure offers retry", async () => {
    mount(card(), {}, url => url.endsWith("quickbooks-card") ? { status: 500, body: { message: "down" } } : undefined);
    expect(await screen.findByTestId("button-retry-qbo-card")).toBeInTheDocument();
  });

  it("re-keys per company so another company's card data is never shown", async () => {
    const { rerender } = mount(card());
    await screen.findByTestId("text-qbo-state");
    fx.user = { ...fx.user, activeCompanyId: "c2" };
    current = card({}, { qboSyncState: "error" });
    rerender(<QueryClientProvider client={new QueryClient()}><QboCustomerCard customerId="k1" /></QueryClientProvider>);
    await waitFor(() => expect(state()).toHaveTextContent("Couldn't update"));
    expect(calls.at(-1)?.headers["X-Company-Id"]).toBe("c2");
  });

  it("shows Waiting immediately after 202 while the next GET is deferred", async () => {
    let release: (() => void) | null = null;
    let deferNext = false;
    mount(card(), {}, url => {
      if (url.endsWith("/send-now")) { deferNext = true; return undefined; }
      return undefined;
    });
    const btn = await screen.findByTestId("button-send-to-qbo");
    const orig = (globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>);
    vi.stubGlobal("fetch", (u: string, i?: RequestInit) => {
      const p = orig(u, i);
      if (deferNext && u.endsWith("quickbooks-card")) return new Promise<Response>(r => { release = () => r(p as never); });
      return p;
    });
    fireEvent.click(btn);
    await waitFor(() => expect(state()).toHaveTextContent("Waiting to send"));
    expect(screen.getByTestId("button-send-to-qbo")).toBeDisabled();
    current = card({}, { qboSyncState: "pending_push" });
    await waitFor(() => expect(release).not.toBeNull());
    release!();
    await waitFor(() => expect(state()).toHaveTextContent("Waiting to send"));
  });

  it("stale prior error does not stop new polling; terminal only from a fresh read", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(card({}, { qboSyncState: "error", qboLastError: "old failure" }));
    await waitFor(() => expect(state()).toHaveTextContent("Couldn't update"));
    fireEvent.click(screen.getByTestId("button-send-to-qbo"));
    await waitFor(() => expect(calls.some(c => c.url.endsWith("/send-now"))).toBe(true));
    // Server still reports the old error on the first fresh read: that is its real state, shown as-is.
    await waitFor(() => expect(state()).toHaveTextContent("Couldn't update"));
    cleanup();
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(card({}, { qboSyncState: "error" }));
    await waitFor(() => expect(state()).toHaveTextContent("Couldn't update"));
    current = card({}, { qboSyncState: "pending_push" });
    fireEvent.click(screen.getByTestId("button-send-to-qbo"));
    await waitFor(() => expect(state()).toHaveTextContent("Waiting to send"));
    const n = calls.filter(c => c.url.endsWith("quickbooks-card")).length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10); });
    expect(calls.filter(c => c.url.endsWith("quickbooks-card")).length).toBeGreaterThan(n);
  });

  it("collision hides resend in favor of the review", async () => {
    mount(card({ reviews: [{ id: "r9", kind: "name_taken" }] }));
    await screen.findByTestId("link-qbo-collision-review");
    expect(screen.queryByTestId("button-send-to-qbo")).toBeNull();
  });
});
