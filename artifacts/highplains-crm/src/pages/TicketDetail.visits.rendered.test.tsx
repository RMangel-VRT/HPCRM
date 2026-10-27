// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const toast = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => undefined }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: auth.role, isSuperAdminBool: false, activeTags: [] } }),
}));
import TicketDetail from "./TicketDetail";

const status = (id: string, key: string | null, name: string, order: number) => ({
  id, name, statusKey: key, displayOrder: order, description: null, color: null, isFinal: "false", actionType: "needs_action", waitingCategory: null, fields: [],
});
const visit = (id: string, st: string) => ({
  id, crewId: "k1", visitDate: "2025-10-21", sourceType: "ticket", ticketId: "t1", customerId: null, title: null, routeOrder: 1, startTime: null,
  estimatedHours: null, status: st, notes: null, serviceKey: null, ticket: null, customer: null, crew: { id: "k1", name: "Crew 1", color: "#16a34a" },
});
const detailsFor = (scheduled: boolean, typeName = "Task") => ({
  ticket: { id: "t1", companyId: "c1", customerId: null, title: "Aerate lawn", description: "", priority: "normal", currentStatusId: "s1", dueDate: "2025-10-24T12:00:00", crewId: "k1", routeOrder: null, createdById: "u1", createdAt: "2025-10-01T12:00:00Z", workCompletedDate: null, invoiceCategory: null },
  ticketType: { id: "tt", name: typeName, color: null, typeKey: typeName.toLowerCase() },
  statuses: scheduled ? [status("s0", "ready_to_schedule", "Needs scheduling", 0), status("s1", "scheduled", "Renamed Display", 1)] : [status("s1", null, "Open", 1)],
  fieldValues: [], statusHistory: [], comments: [], customer: null, linkedTickets: [], contractServices: [],
});

let details: any;
let patchResult: { status?: number; json: unknown } | null = null;
let qcRef: QueryClient;
let gate: Promise<void> | null = null;
const holdHistory = async () => { if (gate) await gate; };
let history: () => { status?: number; json: unknown };
const calls: { method: string; url: string; body?: any }[] = [];

beforeEach(() => {
  calls.length = 0;
  auth.role = "admin";
  patchResult = null;
  toast.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    let r: { status?: number; json: unknown } = { json: [] };
    if (url === "/api/tickets/t1/details") r = { json: details };
    else if (url === "/api/tickets/t1/visits") r = history();
    else if (url === "/api/crews") r = { json: [{ id: "k1", name: "Crew 1", isActive: true }, { id: "k2", name: "Crew 2", isActive: true }] };
    else if (url === "/api/crews/board") r = { json: [{ id: "k1", name: "Crew 1", color: "#15803d", defaultHoursPerDay: 8 }, { id: "k2", name: "Crew 2", color: "#0369a1", defaultHoursPerDay: 8 }] };
    else if (method === "PATCH") r = patchResult ?? { json: { id: "t1" } };
    if (url === "/api/tickets/t1/visits") await holdHistory();
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
  Element.prototype.scrollIntoView = vi.fn();
  gate = null;
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); document.documentElement.className = ""; });

function mount() {
  const { hook } = memoryLocation({ path: "/dashboard/tickets/t1" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } } });
  qcRef = qc;
  return render(<QueryClientProvider client={qc}><Router hook={hook}><TicketDetail /></Router></QueryClientProvider>);
}
const patchBody = () => calls.filter(c => c.method === "PATCH" && c.url === "/api/tickets/t1").at(-1)?.body;

async function openEdit() {
  fireEvent.click(await screen.findByTestId("button-edit-ticket"));
  await screen.findByTestId("input-edit-title");
}

describe("TicketDetail edit form with visits", () => {
  it.each(["ready_to_schedule", "scheduled", "work_completed", "ready_for_billing", "invoicing"].flatMap(
    statusKey => ["light", "dark"].map(theme => [statusKey, theme]),
  ))(
    "renders the approved estimate header and linked identity as teal at %s in %s", async (statusKey, theme) => {
      document.documentElement.className = theme === "dark" ? "dark" : "";
      details = detailsFor(true);
      details.ticketType = { id: "tt", name: "Renamed estimate", typeKey: "estimate_request", color: null };
      details.statuses[1].statusKey = statusKey;
      details.linkedTickets = [{
        link: { id: "link", linkType: "invoice_for" }, relationship: "target",
        ticket: { id: "linked", title: "Original work" },
        ticketType: { id: "tt", name: "Renamed estimate", typeKey: "estimate_request", color: null },
        currentStatus: { id: "linked-stage", name: "Renamed stage", statusKey, color: null },
      }];
      history = () => ({ json: [] });
      mount();
      await screen.findByTestId("button-edit-ticket");
      expect(screen.getByText("Project")).toBeTruthy();
      const header = screen.getByTestId("header-ticket-identity");
      expect(header.getAttribute("style")).toContain("--tt-project");
      expect(header.innerHTML).toContain("background: var(--tt-project)");
      expect(screen.getByTestId("link-ticket-linked").innerHTML).toContain("--tt-project");
      expect(document.body.innerHTML).toContain("--tt-project");
      expect(details.ticketType.typeKey).toBe("estimate_request");
    },
  );
  it.each([
    ["estimate_request", "ready_for_billing", "Ready to invoice", "false", false],
    ["project", "ready_for_billing", "Custom invoice label", "false", false],
    ["task", "ready_for_billing", "Ready to invoice", "false", false],
    ["estimate_request", null, "Ready for Billing", "false", false],
    ["estimate_request", null, "Ready to invoice", "false", false],
    ["estimate_request", "work_completed", "Ready to invoice", "false", true],
    ["estimate_request", "ready_for_billing", "Ready to invoice", "true", true],
  ])("pending-invoice advance guard: type=%s key=%s label=%s final=%s", async (typeKey, key, name, final, canAdvance) => {
    details = detailsFor(false, "Estimate Request");
    details.ticketType.typeKey = typeKey;
    details.statuses = [status("s1", key, name, 1), status("s2", "invoicing", "Invoicing", 2)];
    details.linkedTickets = [{
      link: { id: "link", linkType: "invoice_for", sourceTicketId: "t1", targetTicketId: "inv1" },
      relationship: "target",
      ticket: { id: "inv1", title: "Linked invoice", ticketTypeId: "inv", currentStatusId: "pending" },
      ticketType: { id: "inv", name: "Invoice", typeKey: "invoice" },
      currentStatus: { name: "Pending invoice", isFinal: final },
    }];
    history = () => ({ json: [] });
    mount();
    await screen.findByTestId("button-edit-ticket");
    expect(!!screen.queryByTestId("button-advance-status")).toBe(canAdvance);
  });
  it.each(["planned", "in_progress"])("open %s visit: Crew/Due readonly, hint scrolls to Visits, keys omitted on save", async st => {
    details = detailsFor(true);
    history = () => ({ json: [visit("v1", st), visit("v2", "done")] });
    mount();
    await screen.findByTestId("card-ticket-visits");
    await openEdit();
    const hint = await screen.findByTestId("link-edit-visits-hint");
    expect(hint.textContent).toBe("Change in Visits below");
    expect(screen.getByTestId("text-edit-dueDate-readonly").textContent).toContain("Oct 24, 2025");
    expect(await screen.findByTestId("text-edit-crew-readonly")).toBeTruthy();
    expect(screen.queryByTestId("input-edit-dueDate")).toBeNull();
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Aerate lawn 2" } });
    expect((screen.getByTestId("input-edit-route-order") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect(patchBody().title).toBe("Aerate lawn 2");
    expect("crewId" in patchBody()).toBe(false);
    expect("dueDate" in patchBody()).toBe(false);
    expect("routeOrder" in patchBody()).toBe(false);
  });

  it("hint closes the dialog and scrolls to the Visits card", async () => {
    details = detailsFor(true);
    history = () => ({ json: [visit("v1", "planned")] });
    mount();
    await screen.findByTestId("card-ticket-visits");
    await openEdit();
    fireEvent.click(await screen.findByTestId("link-edit-visits-hint"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("zero open visits (closed history only): fields stay editable and are sent", async () => {
    details = detailsFor(true);
    history = () => ({ json: [visit("v1", "done"), visit("v2", "cancelled")] });
    mount();
    await screen.findByTestId("card-ticket-visits");
    await waitFor(() => expect(calls.some(c => c.url === "/api/tickets/t1/visits")).toBe(true));
    await openEdit();
    await waitFor(() => expect(screen.queryByTestId("text-edit-visits-checking")).toBeNull());
    expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect(patchBody().crewId).toBe("k1");
    expect(patchBody().dueDate).toBeTruthy();
  });

  it("failed history is not treated as empty and does not submit the keys", async () => {
    details = detailsFor(true);
    history = () => ({ status: 500, json: { message: "boom" } });
    mount();
    await screen.findByTestId("button-retry-visits");
    await openEdit();
    expect(await screen.findByTestId("button-edit-visits-retry")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect("crewId" in patchBody()).toBe(false);
    expect("dueDate" in patchBody()).toBe(false);
    expect("routeOrder" in patchBody()).toBe(false);
  });

  it("save rechecks fresh history: a visit added after the form opened still omits the keys", async () => {
    details = detailsFor(true);
    let list: any[] = [];
    history = () => ({ json: list });
    mount();
    await screen.findByTestId("card-ticket-visits");
    await openEdit();
    await waitFor(() => expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy());
    list = [visit("v9", "planned")];
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect("crewId" in patchBody()).toBe(false);
    expect("dueDate" in patchBody()).toBe(false);
    expect("routeOrder" in patchBody()).toBe(false);
  });

  it("deadline-only type (no scheduled status): unchanged editable fields, no Visits card, no history fetch", async () => {
    details = detailsFor(false, "Invoice");
    history = () => ({ json: [visit("v1", "planned")] });
    mount();
    await openEdit();
    expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy();
    expect(screen.queryByTestId("card-ticket-visits")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect(patchBody().crewId).toBe("k1");
    expect(calls.some(c => c.url === "/api/tickets/t1/visits")).toBe(false);
  });
  it("does not infer scheduled capability from an unkeyed display name", async () => {
    details = detailsFor(false, "Invoice");
    details.statuses.push(status("custom", null, "Scheduled", 2));
    history = () => ({ json: [] });
    mount();
    await openEdit();
    expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy();
    expect(screen.queryByTestId("card-ticket-visits")).toBeNull();
    expect(calls.some(c => c.url === "/api/tickets/t1/visits")).toBe(false);
  });

  it("Visits card Add and Move submit through the shared dialog and Remove DELETEs planned visit", async () => {
    details = detailsFor(true);
    history = () => ({ json: [visit("v1", "planned")] });
    mount();
    fireEvent.click(await screen.findByTestId("button-add-visit"));
    expect(await screen.findByTestId("dialog-visit")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("select-visit-crew").textContent).toContain("Crew 1"));
    fireEvent.change(screen.getByTestId("select-visit-crew"), { target: { value: "k1" } });
    fireEvent.click(screen.getByTestId("button-visit-submit"));
    await waitFor(() => expect(calls.some(c => c.method === "POST" && c.url === "/api/visits" && c.body.ticketId === "t1" && c.body.crewId === "k1")).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("dialog-visit")).toBeNull());
    fireEvent.click(await screen.findByTestId("button-move-visit-v1"));
    fireEvent.change(await screen.findByTestId("select-visit-crew"), { target: { value: "k2" } });
    fireEvent.click(screen.getByTestId("button-visit-submit"));
    await waitFor(() => expect(calls.some(c => c.method === "PATCH" && c.url === "/api/visits/v1" && c.body.crewId === "k2" && c.body.visitDate === "2025-10-21")).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("dialog-visit")).toBeNull());
    fireEvent.click(await screen.findByTestId("button-remove-visit-v1"));
    fireEvent.click(await screen.findByTestId("button-confirm-remove-visit"));
    await waitFor(() => expect(calls.some(c => c.method === "DELETE" && c.url === "/api/visits/v1")).toBe(true));
  });

  it("zero open visits: changing crew AND date sends the new values and routeOrder", async () => {
    details = detailsFor(true);
    history = () => ({ json: [] });
    mount();
    await screen.findByTestId("card-ticket-visits");
    await openEdit();
    await waitFor(() => expect(screen.queryByTestId("text-edit-visits-checking")).toBeNull());
    await userEvent.click(screen.getByTestId("select-edit-crew"));
    await userEvent.click(await screen.findByRole("option", { name: /Crew 2/ }));
    await userEvent.click(screen.getByTestId("input-edit-dueDate"));
    await userEvent.click(await screen.findByTestId("input-edit-dueDate-today"));
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    const b = patchBody();
    expect(b.crewId).toBe("k2");
    const d = new Date(b.dueDate);
    const now = new Date();
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([now.getFullYear(), now.getMonth(), now.getDate()]);
    expect("routeOrder" in b).toBe(true);
  });

  it("pending history locks the fields; invalidation after a visit mutation re-locks until refetched", async () => {
    details = detailsFor(true);
    let list: any[] = [];
    history = () => ({ json: list });
    let release!: () => void;
    gate = new Promise<void>(r => { release = r; });
    mount();
    await openEdit();
    expect(await screen.findByTestId("text-edit-visits-checking")).toBeTruthy();
    expect(screen.getByTestId("text-edit-dueDate-readonly")).toBeTruthy();
    gate = null; release();
    await waitFor(() => expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy());
    // a visit is added elsewhere; history invalidated while refetch is pending
    list = [visit("v7", "planned")];
    let release2!: () => void;
    gate = new Promise<void>(r => { release2 = r; });
    void qcRef.invalidateQueries({ queryKey: ["/api/tickets", "t1", "visits"] });
    await waitFor(() => expect(screen.getByTestId("text-edit-dueDate-readonly")).toBeTruthy());
    gate = null; release2();
    expect((await screen.findByTestId("link-edit-visits-hint")).textContent).toBe("Change in Visits below");
  });

  it("forbidden roles never query visits or see the Visits card, and schedule fields are locked", async () => {
    auth.role = "field";
    details = detailsFor(true);
    history = () => ({ status: 403, json: { message: "Forbidden" } });
    mount();
    await screen.findByTestId("text-ticket-title");
    expect(screen.queryByTestId("card-ticket-visits")).toBeNull();
    expect(screen.queryByTestId("button-add-visit")).toBeNull();
    expect(calls.some(c => c.url === "/api/tickets/t1/visits")).toBe(false);
  });

  it("MULTIPLE_VISITS on save closes the dialog, scrolls to Visits and shows a linked toast", async () => {
    details = detailsFor(true);
    history = () => ({ json: [] });
    patchResult = { status: 409, json: { error: "MULTIPLE_VISITS", message: "This job has several visits. Change them in Visits below." } };
    mount();
    await screen.findByTestId("card-ticket-visits");
    await openEdit();
    await waitFor(() => expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const call = toast.mock.calls.map(([a]) => a).find(a => a.title === "This job has several visits");
    expect(call?.action).toBeTruthy();
    expect(call.description).toContain("Visits below");
  });
});
