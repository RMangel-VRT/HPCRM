// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installFetch, type Call } from "@/test/qboFetch";

const fx = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
import QboCustomerReview from "./QboCustomerReview";
import { KIND_LABELS } from "@/lib/qboReview";

const base = { companyId: "c1", status: "open", updatedAt: "2025-11-01T00:00:00.000Z", fields: null, qboSnapshot: null, message: null, customerName: "Juniper Court HOA", qboName: "Juniper Court" };
const rv = (id: string, kind: string, extra: Record<string, unknown> = {}) =>
  ({ ...base, id, kind, customerId: "cust-1", qboId: "q-" + id, createdAt: "2025-11-0" + (id.length % 9 + 1) + "T00:00:00.000Z", ...extra });
const options = {
  customers: [{ id: "p1", name: "Ridgeview Parent", parentCustomerId: null, qboCustomerId: "qp" },
    { id: "b1", name: "Ridgeview East", parentCustomerId: "p1", qboCustomerId: null },
    { id: "x1", name: "Aspen Loop", parentCustomerId: null, qboCustomerId: null }],
  quickbooks: [{ qboId: "q-removed", displayName: "Old Name", parentQboId: null, active: false },
    { qboId: "q-survivor", displayName: "Survivor LLC", parentQboId: null, active: true }],
};

let calls: Call[] = [];
function mount(reviews: unknown[], opts: { resolve?: { status: number; body: unknown }; promote?: { status: number; body: unknown }; user?: Record<string, unknown> } = {}) {
  fx.user = { id: "u1", activeCompanyId: "c1", activeRole: "office", activeTags: [], ...opts.user };
  ({ calls } = installFetch((url, init) => {
    if (url === "/api/qbo/customer-reviews?status=open") return { body: reviews };
    if (url === "/api/qbo/customer-review-options") return { body: options };
    if (url.endsWith("/resolve")) return opts.resolve ?? { body: { ok: true } };
    if (url === "/api/qbo/customers/promote") return opts.promote ?? { body: { id: "new" } };
    if (url.startsWith("/api/customers/") && init.method === "PATCH") return { body: {} };
    return { body: { open: 0 } };
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><QboCustomerReview /></QueryClientProvider>);
}
const posts = () => calls.filter(c => c.method !== "GET");
async function open(id: string) { fireEvent.click(await screen.findByTestId(`row-review-${id}`)); return screen.getByTestId("panel-review"); }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("QuickBooks review page", () => {
  it("shows the exact empty state", async () => {
    mount([]);
    expect(await screen.findByTestId("empty-reviews")).toHaveTextContent("Nothing to review. QuickBooks and the CRM agree.");
    expect(calls[0].headers["X-Company-Id"]).toBe("c1");
  });

  it("lists newest first with plain kind labels for all seven kinds", async () => {
    const kinds = Object.keys(KIND_LABELS);
    mount(kinds.map((k, i) => rv(k, k, { createdAt: `2025-10-1${i}T00:00:00.000Z` })));
    await screen.findByTestId("row-review-push_failed");
    const ids = Array.from(document.querySelectorAll("[data-testid^=row-review-]")).map(e => e.getAttribute("data-testid"));
    expect(ids).toEqual([...kinds].reverse().map(k => `row-review-${k}`));
    for (const k of kinds) expect(screen.getByTestId(`kind-${k}`)).toHaveTextContent(KIND_LABELS[k as keyof typeof KIND_LABELS]);
  });

  it("changed_in_qbo: defaults one-sided rows, warns on both-changed, requires all choices, bulk shortcuts, posts choices", async () => {
    mount([rv("ch", "changed_in_qbo", { fields: {
      phone: { crm: "303", qbo: "720", baseline: "303", bothChanged: false },
      emails: { crm: ["a@x.co"], qbo: ["b@x.co"], baseline: ["c@x.co"], bothChanged: true } } })]);
    const p = await open("ch");
    expect(within(p).getByTestId("choice-phone-qbo")).toHaveAttribute("aria-checked", "true");
    expect(within(p).getByTestId("choice-emails-qbo")).toHaveAttribute("aria-checked", "false");
    expect(within(p).getByTestId("choice-emails-crm")).toHaveAttribute("aria-checked", "false");
    expect(within(p).getByTestId("chip-both-changed-emails")).toHaveTextContent("Changed on both sides");
    expect(within(p).queryByTestId("chip-both-changed-phone")).toBeNull();
    expect(within(p).getByTestId("button-apply-choices")).toBeDisabled();
    fireEvent.click(within(p).getByTestId("button-keep-crm-all"));
    expect(within(p).getByTestId("choice-phone-crm")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(p).getByTestId("button-use-qbo-all"));
    fireEvent.click(within(p).getByTestId("choice-emails-crm"));
    fireEvent.click(within(p).getByTestId("button-apply-choices"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ url: "/api/qbo/customer-reviews/ch/resolve", method: "POST", body: { choices: { phone: "qbo", emails: "crm" } } });
    expect(posts()[0].headers["X-Company-Id"]).toBe("c1");
  });

  it("changed_in_qbo stale failure stays actionable", async () => {
    mount([rv("ch", "changed_in_qbo", { fields: { phone: { crm: "1", qbo: "2", baseline: "1", bothChanged: false } } })],
      { resolve: { status: 409, body: { stale: true, message: "QuickBooks values changed; reload the review" } } });
    const p = await open("ch");
    fireEvent.click(within(p).getByTestId("button-apply-choices"));
    expect(await within(p).findByTestId("error-resolve")).toHaveTextContent("QuickBooks values changed");
    expect(within(p).getByTestId("button-apply-choices")).toBeEnabled();
  });

  it("new_in_qbo: promote through legacy route with overrides, link with customerId, ignore", async () => {
    mount([rv("nw", "new_in_qbo", { customerId: null, qboSnapshot: { displayName: "Pine Hollow", shipAddr: { street: "1 Elm", city: "Boulder", state: "CO", zip: "80302" } } })]);
    const p = await open("nw");
    fireEvent.click(within(p).getByTestId("button-create-crm-customer"));
    fireEvent.click(within(p).getByTestId("button-confirm-promote"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ url: "/api/qbo/customers/promote", body: { qboId: "q-nw", overrides: { name: "Pine Hollow", street: "1 Elm", city: "Boulder", state: "CO", zip: "80302" } } });
    expect(posts()[0].headers["X-Company-Id"]).toBe("c1");
    fireEvent.click(await within(p).findByTestId("option-customer-x1"));
    fireEvent.click(within(p).getByTestId("button-link-customer"));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1].body).toEqual({ action: "link", customerId: "x1" });
    fireEvent.click(within(p).getByTestId("button-ignore"));
    await waitFor(() => expect(posts()[2]?.body).toEqual({ action: "ignore" }));
  });

  it("promotion failure surfaces missing fields and keeps the form for retry", async () => {
    mount([rv("nw", "new_in_qbo", { qboSnapshot: { displayName: "Pine Hollow" } })],
      { promote: { status: 400, body: { message: "Missing required fields", missingFields: ["street", "zip"] } } });
    const p = await open("nw");
    fireEvent.click(within(p).getByTestId("button-create-crm-customer"));
    fireEvent.click(within(p).getByTestId("button-confirm-promote"));
    expect(await within(p).findByTestId("text-missing-fields")).toHaveTextContent("street, zip");
    expect(within(p).getByTestId("input-promote-street")).toHaveAttribute("aria-invalid", "true");
    expect(within(p).getByTestId("button-confirm-promote")).toBeEnabled();
  });

  it("billing-tagged field users may link but not promote or rename", async () => {
    mount([rv("nw", "new_in_qbo"), rv("nt", "name_taken")], { user: { activeRole: "field", activeTags: ["billing"] } });
    let p = await open("nw");
    expect(within(p).queryByTestId("button-create-crm-customer")).toBeNull();
    expect(within(p).getByTestId("text-promote-restricted")).toBeInTheDocument();
    p = await open("nt");
    expect(within(p).queryByTestId("button-rename")).toBeNull();
    expect(within(p).getByTestId("button-link-existing")).toBeInTheDocument();
  });

  it("sub_customer: no creation, matching branch first, confirmSeparate only after checkbox", async () => {
    mount([rv("sb", "sub_customer", { qboSnapshot: { displayName: "Ridgeview East", parentQboId: "qp" } })],
      { resolve: { status: 409, body: { message: "Confirm separate branch billing before linking" } } });
    const p = await open("sb");
    expect(within(p).queryByTestId("button-create-crm-customer")).toBeNull();
    expect(within(p).getByTestId("text-sub-customer-note")).toHaveTextContent("Link this record to the CRM branch");
    await within(p).findByTestId("option-customer-b1");
    const first = within(p).getByTestId("list-link-customers").querySelector("button");
    expect(first).toHaveAttribute("data-testid", "option-customer-b1");
    fireEvent.click(first!);
    fireEvent.click(within(p).getByTestId("button-link-customer"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ action: "link", customerId: "b1" }));
    expect(await within(p).findByTestId("error-resolve")).toHaveTextContent("Confirm separate branch billing");
    fireEvent.click(within(p).getByTestId("checkbox-confirm-separate"));
    fireEvent.click(within(p).getByTestId("button-link-customer"));
    await waitFor(() => expect(posts()[1]?.body).toEqual({ action: "link", customerId: "b1", confirmSeparate: true }));
  });

  it("qbo_inactive: set inactive / ignore", async () => {
    mount([rv("in", "qbo_inactive")]);
    const p = await open("in");
    fireEvent.click(within(p).getByTestId("button-set-inactive"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ action: "set_crm_inactive" }));
    fireEvent.click(within(p).getByTestId("button-ignore"));
    await waitFor(() => expect(posts()[1]?.body).toEqual({ action: "ignore" }));
  });

  it("qbo_removed: QuickBooks picker link, unlink and dismiss exact payloads; error preserved", async () => {
    mount([rv("removed", "qbo_removed", { message: "Merged into another customer" })],
      { resolve: { status: 409, body: { message: "Review binding changed" } } });
    const p = await open("removed");
    expect(within(p).getByTestId("text-review-message")).toHaveTextContent("Merged into another customer");
    expect(within(p).queryByTestId("option-qbo-q-removed")).toBeNull();
    fireEvent.click(await within(p).findByTestId("option-qbo-q-survivor"));
    fireEvent.click(within(p).getByTestId("button-link-qbo"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ action: "link", qboId: "q-survivor" }));
    expect(await within(p).findByTestId("error-resolve")).toHaveTextContent("Review binding changed");
    fireEvent.click(within(p).getByTestId("button-unlink"));
    await waitFor(() => expect(posts()[1]?.body).toEqual({ action: "unlink" }));
    fireEvent.click(within(p).getByTestId("button-dismiss"));
    await waitFor(() => expect(posts()[2]?.body).toEqual({ action: "dismiss" }));
  });

  it("name_taken: link, or rename via PATCH then renamed", async () => {
    mount([rv("nt", "name_taken", { qboSnapshot: { displayName: "Juniper Court" } })]);
    const p = await open("nt");
    fireEvent.click(within(p).getByTestId("button-link-existing"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ action: "link" }));
    fireEvent.click(within(p).getByTestId("button-rename"));
    fireEvent.change(within(p).getByTestId("input-rename-billing"), { target: { value: "Juniper Court HOA (Boulder)" } });
    fireEvent.click(within(p).getByTestId("button-rename-retry"));
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect(posts()[1]).toMatchObject({ url: "/api/customers/cust-1", method: "PATCH", body: { billingName: "Juniper Court HOA (Boulder)" } });
    expect(posts()[1].headers["X-Company-Id"]).toBe("c1");
    expect(posts()[2].body).toEqual({ action: "renamed" });
  });

  it("push_failed: shows error text, retry / dismiss", async () => {
    mount([rv("pf", "push_failed", { message: "Stale object error" })]);
    const p = await open("pf");
    expect(within(p).getByTestId("text-review-message")).toHaveTextContent("Stale object error");
    fireEvent.click(within(p).getByTestId("button-retry"));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ action: "retry" }));
    fireEvent.click(within(p).getByTestId("button-dismiss"));
    await waitFor(() => expect(posts()[1]?.body).toEqual({ action: "dismiss" }));
  });

  it("rows open from the keyboard", async () => {
    mount([rv("pf", "push_failed", { message: "Stale object error" })]);
    const row = await screen.findByTestId("row-review-pf");
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(within(screen.getByTestId("panel-review")).getByTestId("button-retry")).toBeInTheDocument();
  });

  it("list failure offers retry", async () => {
    fx.user = { id: "u1", activeCompanyId: "c1", activeRole: "admin", activeTags: [] };
    installFetch(() => ({ status: 500, body: { message: "boom" } }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><QboCustomerReview /></QueryClientProvider>);
    expect(await screen.findByTestId("button-retry-reviews")).toBeInTheDocument();
  });
});
