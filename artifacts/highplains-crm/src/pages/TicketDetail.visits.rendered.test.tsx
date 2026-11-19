// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";

const toast = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
vi.mock("@/hooks/use-breadcrumbs", () => ({ useSetBreadcrumbs: () => undefined }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1", activeCompanyId: "c1", activeRole: auth.role, accessRole: auth.role, isSuperAdminBool: false, activeTags: [] } }),
}));
import TicketDetail from "./TicketDetail";
import i18n from "@/i18n";

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
let conversionFailure: { status: number; json: unknown } | null;
const editChoices = [
  { id: "tt", name: "Estimate Request", typeKey: "estimate_request", isActive: "true" },
  { id: "task", name: "Task", typeKey: "task", isActive: "true" },
  { id: "project", name: "Project", typeKey: "project", isActive: "true" },
  { id: "invoice", name: "Invoice", typeKey: "invoice", isActive: "true" },
  { id: "custom", name: "Custom", typeKey: null, isActive: "true" },
];
const newProperty = { id: "property2", name: "New property", locationLat: 38, locationLng: -104 };
let qcRef: QueryClient;
let gate: Promise<void> | null = null;
const holdHistory = async () => { if (gate) await gate; };
let history: () => { status?: number; json: unknown };
const calls: { method: string; url: string; body?: any; headers: Headers }[] = [];
let nextStop: { date: string; crew: { id: string; name: string }; routeOrder: number; label: string } | null;
let nextConflict: boolean;

beforeEach(() => {
  calls.length = 0;
  auth.role = "admin";
  patchResult = null;
  conversionFailure = null;
  nextStop = null;
  nextConflict = false;
  toast.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
    let r: { status?: number; json: unknown } = { json: [] };
    if (url === "/api/tickets/t1/details") r = { json: details };
    else if (url === "/api/estimates/by-ticket/t1") r = { json: null };
    else if (url === "/api/ticket-types") r = { json: editChoices };
    else if (url.startsWith("/api/customers?ticketPicker=")) r = {
      json: { customers: [newProperty, { id: "parent", name: "Parent property", isParent: "true" }], total: 2 },
    };
    else if (url === "/api/companies/users") r = { json: [{ companyUser: { role: "office" },
      user: { id: "u2", name: "Second user", email: "second@example.test" } }] };
    else if (method === "POST" && url === "/api/tickets/t1/change-type") {
      if (conversionFailure) r = conversionFailure;
      else {
        const payload = JSON.parse(String(init?.body));
        const converted = { id: "t1", ticketTypeId: payload.ticketTypeId, currentStatusId: "new-type-status",
          workType: payload.workType ?? "estimate_request", billingBehavior: payload.workType === "extra_work" ? "invoice_required" : "internal" };
        Object.assign(details.ticket, converted);
        details.ticketType = editChoices.find(type => type.id === payload.ticketTypeId);
        details.statuses = [status("new-type-status", "new", "New", 0)];
        r = { json: converted };
      }
    }
    else if (url === "/api/tickets/t1/visits") r = history();
    else if (url === "/api/tickets/t1/next-stop") r = { json: nextStop };
    else if (method === "POST" && url === "/api/tickets/t1/schedule-next-stop") {
      if (nextConflict) {
        nextStop = null;
        r = { status: 409, json: { error: "STALE_NEXT_STOP", message: "That stop is no longer on the schedule" } };
      } else {
        details.ticket.currentStatusId = "s1";
        history = () => ({ json: [visit("inserted", "planned")] });
        r = { json: { ...visit("inserted", "planned"), ticketSync: { statusChanged: true, newStatusKey: "scheduled" } } };
      }
    }
    else if (method === "POST" && url === "/api/tickets/t1/skip-scheduling") {
      details.ticket.currentStatusId = "s2";
      r = { json: { currentStatusId: "s2" } };
    }
    else if (url === "/api/crews") r = { json: [{ id: "k1", name: "Crew 1", isActive: true }, { id: "k2", name: "Crew 2", isActive: true }] };
    else if (url === "/api/crews/board") r = { json: [{ id: "k1", name: "Crew 1", color: "#15803d", defaultHoursPerDay: 8 }, { id: "k2", name: "Crew 2", color: "#0369a1", defaultHoursPerDay: 8 }] };
    else if (method === "PATCH") {
      if (!patchResult && url === "/api/tickets/t1") Object.assign(details.ticket, JSON.parse(String(init?.body)));
      r = patchResult ?? { json: { id: "t1" } };
    }
    if (url === "/api/tickets/t1/visits") await holdHistory();
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: {
      "Content-Type": "application/json",
      ...(url.endsWith("/next-stop") && nextStop ? { "X-Next-Stop-Snapshot": '"offered"' } : {}),
    } });
  }));
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  gate = null;
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(async () => { cleanup(); document.documentElement.className = ""; await i18n.changeLanguage("en"); });

function mount() {
  const { hook } = memoryLocation({ path: "/dashboard/tickets/t1" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (await fetch(String(queryKey[0]))).json() } } });
  qcRef = qc;
  return render(<QueryClientProvider client={qc}><TooltipProvider><Router hook={hook}><TicketDetail /></Router></TooltipProvider></QueryClientProvider>);
}
const patchBody = () => calls.filter(c => c.method === "PATCH" && c.url === "/api/tickets/t1").at(-1)?.body;

describe("TicketDetail conversation locations", () => {
  it.each(["estimate_request", "task", "project", "invoice"])("shows the empty Photos section and upload control for %s", async typeKey => {
    details = detailsFor(false);
    details.ticketType.typeKey = typeKey;
    history = () => ({ json: [] });
    mount();
    expect(await screen.findByTestId("card-photos")).toBeTruthy();
    expect(screen.getByTestId("text-no-ticket-photos")).toBeTruthy();
    expect(screen.getByTestId("button-add-ticket-photos")).toBeTruthy();
  });
  it("keeps RFP creation's photo exclusion and hides uploads from field viewers", async () => {
    details = detailsFor(false);
    details.ticketType.typeKey = "rfp_request";
    history = () => ({ json: [] });
    mount();
    await screen.findByTestId("header-ticket-identity");
    expect(screen.queryByTestId("card-photos")).toBeNull();
    cleanup();
    details.ticketType.typeKey = "task";
    auth.role = "field";
    mount();
    expect(await screen.findByTestId("card-photos")).toBeTruthy();
    expect(screen.queryByTestId("button-add-ticket-photos")).toBeNull();
  });
  it("retains the ticket identity header construction while estimate styles are mirrored", async () => {
    details = detailsFor(false, "Estimate Request");
    details.ticketType.typeKey = "estimate_request";
    history = () => ({ json: [] });
    mount();
    const header = await screen.findByTestId("header-ticket-identity");
    expect(header.className).toContain("rounded-xl");
    expect(header.className).toContain("border-t-4");
    expect(header.querySelector(".px-3.py-3")).toBeTruthy();
    expect(header.querySelector('[data-testid="badge-ticket-type"]')).toBeTruthy();
    expect(header.textContent).toContain("Aerate lawn");
    expect(header.style.borderTopColor).toContain("var(");
  });
  it("shows the empty Overview Conversation with no view-all and opens the focused conversation through its tab", async () => {
    details = detailsFor(false);
    history = () => ({ json: [] });
    mount();
    const card = await screen.findByTestId("card-recent-comments");
    expect(card.textContent).toContain("Conversation");
    expect(card.querySelector('[data-testid="input-comment"]')).toBeTruthy();
    expect(screen.getByTestId("tab-comments").textContent).toContain("Conversation (0)");
    expect(screen.queryByTestId("button-view-all-comments")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-comments"));
    expect(screen.queryByTestId("card-recent-comments")).toBeNull();
    expect(screen.getByTestId("ticket-conversation").className).toContain("min-h-[60vh]");
    expect(screen.getByTestId("input-comment")).toBeTruthy();
  });
  it("uses the same count and threads on Overview and the focused Conversation tab", async () => {
    details = detailsFor(false);
    history = () => ({ json: [] });
    details.comments = ["a", "b", "c", "d"].map((id, i) => ({
      id, parentCommentId: null, body: `Complete ${id}`, authorName: `Author ${id}`, createdAt: `2026-10-0${i + 1}T12:00:00Z`,
    }));
    details.comments.push({ id: "reply", parentCommentId: "b", body: "Reply body", authorName: "Reply author", createdAt: "2026-10-05T12:00:00Z" });
    mount();
    await screen.findByTestId("card-recent-comments");
    expect(screen.queryByTestId("comment-a")).toBeNull();
    expect(screen.getByTestId("comment-reply")).toBeTruthy();
    expect(screen.getByTestId("button-view-all-comments").textContent).toBe("View all 5");
    expect(screen.getByTestId("tab-comments").textContent).toContain("Conversation (5)");
    fireEvent.click(screen.getByTestId("button-view-all-comments"));
    expect(screen.getByTestId("comment-a")).toBeTruthy();
    expect(screen.getAllByTestId(/^comment-/)).toHaveLength(5);
    expect(screen.getByTestId("comment-reply").closest("[id^=replies-]")?.id).toBe("replies-b");
  });
});

async function openEdit() {
  fireEvent.click(await screen.findByTestId("button-edit-ticket"));
  await screen.findByTestId("input-edit-title");
}

describe("TicketDetail guarded edit controls", () => {
  beforeEach(() => {
    history = () => ({ json: [] });
    details = detailsFor(false, "Estimate Request");
    details.ticketType = editChoices[0];
    details.editAvailability = { customer: null, type: null };
    Object.assign(details.ticket, { ticketTypeId: "tt", priority: "urgent", workType: "estimate_request",
      billingBehavior: "internal", customerId: "property1", locationLat: 40, locationLng: -105, delegatedById: "u1" });
    details.customer = { id: "property1", name: "Old property", locationLat: 40, locationLng: -105 };
  });

  async function selectTask() {
    await userEvent.click(await screen.findByTestId("select-edit-type"));
    expect(screen.queryByRole("option", { name: "Custom" })).toBeNull();
    expect(screen.getByRole("option", { name: /Invoice/ }).getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(screen.getByRole("option", { name: "Task" }));
    await userEvent.click(screen.getByTestId("select-edit-work-type"));
    await userEvent.click(screen.getByRole("option", { name: "Billable" }));
  }

  it("lets office staff change type and customer, keeps the pin and submits POST before PATCH", async () => {
    auth.role = "office";
    mount();
    await openEdit();
    expect(screen.queryByTestId("select-edit-assignee")).toBeNull();
    await userEvent.click(screen.getByTestId("select-edit-customer"));
    fireEvent.change(screen.getByTestId("input-customer-search"), { target: { value: "New property" } });
    const option = await screen.findByTestId("customer-option-property2");
    expect(screen.queryByTestId("customer-option-parent")).toBeNull();
    await userEvent.click(option);
    expect(screen.getByText(/pin still matches the previous customer/)).toBeTruthy();
    const search = calls.find(c => c.url.includes("search=New+property"));
    expect(search?.headers.get("X-Company-Id")).toBe("c1");
    await selectTask();
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Updated" } });
    await userEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    const writes = calls.filter(c => c.url.startsWith("/api/tickets/t1") && c.method !== "GET");
    expect(writes.map(c => [c.method, c.body])).toEqual([
      ["POST", { ticketTypeId: "task", workType: "extra_work" }],
      ["PATCH", { customerId: "property2", title: "Updated" }],
    ]);
    expect(writes.every(c => c.headers.get("X-Company-Id") === "c1")).toBe(true);
    expect(writes[1].headers.get("X-Ticket-Type-Id")).toBe("task");
    expect(details.ticket).toMatchObject({ locationLat: 40, locationLng: -105, priority: "urgent" });
  });

  it("does not PATCH or report success when the type change is blocked at Save", async () => {
    conversionFailure = { status: 409, json: { error: "TICKET_EDIT_ESTIMATE", message: "Server reason" } };
    mount();
    await openEdit();
    await selectTask();
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Must not save" } });
    await userEvent.click(screen.getByTestId("button-save-edit"));
    expect((await screen.findByRole("alert")).textContent).toContain("This ticket has a non-voided estimate.");
    expect(patchBody()).toBeUndefined();
    expect(toast).not.toHaveBeenCalledWith({ title: "Ticket updated" });
  });

  it("reports a partial save and retries only PATCH after the conversion committed", async () => {
    patchResult = { status: 409, json: { error: "TICKET_EDIT_TYPE_CHANGED", message: "Conflict" } };
    mount();
    await openEdit();
    await selectTask();
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Retry me" } });
    await userEvent.click(screen.getByTestId("button-save-edit"));
    expect((await screen.findByRole("alert")).textContent).toContain("The ticket type changed, but the other edits were not saved.");
    expect((screen.getByTestId("input-edit-title") as HTMLInputElement).value).toBe("Retry me");
    patchResult = null;
    await userEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    expect(calls.filter(c => c.url.endsWith("/change-type"))).toHaveLength(1);
    expect(patchBody()).toEqual({ title: "Retry me" });
  });

  it("uses the existing Task PATCH without adding defaults, and matches inline reassignment", async () => {
    details.ticketType = editChoices[1];
    Object.assign(details.ticket, { ticketTypeId: "task", workType: "contract", billingBehavior: "no_invoice" });
    mount();
    await userEvent.click(await screen.findByTestId("select-reassign-ticket"));
    await userEvent.click(await screen.findByRole("option", { name: "Second user (office)" }));
    await waitFor(() => expect(patchBody()).toEqual({ assignedToId: "u2" }));
    await qcRef.invalidateQueries({ queryKey: ["/api/tickets", "t1", "details"] });
    await waitFor(() => expect(screen.getByTestId("select-reassign-ticket").textContent).toContain("Second user"));
    await openEdit();
    await userEvent.click(screen.getByTestId("select-edit-assignee"));
    await userEvent.click(screen.getByRole("option", { name: "Unassigned" }));
    await userEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    expect(patchBody()).toEqual({ assignedToId: null });
    expect(details.ticket.delegatedById).toBe("u1");

    await openEdit();
    await userEvent.click(screen.getByTestId("select-edit-work-type"));
    await userEvent.click(screen.getByRole("option", { name: "Billable" }));
    await userEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    expect(patchBody()).toEqual({ workType: "extra_work" });
    expect(calls.some(c => c.url.endsWith("/change-type"))).toBe(false);
    await openEdit();
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Only title" } });
    await userEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toEqual({ title: "Only title" }));
  });

  it("shows the server's lock reasons in Spanish and gives field users only read access", async () => {
    await i18n.changeLanguage("es");
    details.editAvailability = { customer: "TICKET_EDIT_ESTIMATE", type: "TICKET_EDIT_STARTED" };
    mount();
    await openEdit();
    expect(screen.getByText("Este ticket tiene un estimado que no se ha anulado.")).toBeTruthy();
    expect(screen.getByText("El tipo solo se puede cambiar mientras el ticket está en su estado inicial.")).toBeTruthy();
    expect(screen.queryByTestId("select-edit-customer")).toBeNull();
    expect(screen.queryByTestId("select-edit-type")).toBeNull();
    cleanup();

    await i18n.changeLanguage("en");
    auth.role = "field";
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "View ticket fields" }));
    expect(screen.getByRole("dialog").textContent).toContain("Only admins and office staff can change the customer or ticket type.");
    expect(screen.getByRole("dialog").textContent).not.toContain("Old property");
    expect(screen.queryByTestId("select-edit-assignee")).toBeNull();
    expect(screen.queryByTestId("button-save-edit")).toBeNull();
  });
});

describe("TicketDetail edit form with visits", () => {
  it("saves and clears text independently of any pin or scheduling change", async () => {
    details = detailsFor(true);
    details.customer = { name: "Example Property", street: "10 Main St", city: "Boulder", state: "CO", zip: "80000" };
    history = () => ({ json: [visit("v1", "planned")] });
    mount();
    await openEdit();
    fireEvent.click(screen.getByTestId("button-use-work-property-address"));
    expect((screen.getByTestId("input-work-location-details") as HTMLTextAreaElement).value).toBe("10 Main St\nBoulder CO 80000");
    fireEvent.change(screen.getByTestId("input-work-location-label"), { target: { value: "  West gate  " } });
    fireEvent.change(screen.getByTestId("input-work-location-details"), { target: { value: "Phone at arrival" } });
    fireEvent.click(screen.getByTestId("button-save-edit"));
    expect((await screen.findByTestId("text-ticket-location-label")).textContent).toBe("West gate");
    expect(screen.getByTestId("text-ticket-location-details").textContent).toBe("Phone at arrival");
    expect(screen.queryByTestId("button-navigate")).toBeNull();
    expect(patchBody()).toEqual({ locationLabel: "West gate", locationDescription: "Phone at arrival" });
    await openEdit();
    fireEvent.change(screen.getByTestId("input-work-location-label"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("input-work-location-details"), { target: { value: " " } });
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("card-location")).toBeNull());
    expect(patchBody()).toEqual({ locationLabel: null, locationDescription: null });
  });

  it("uses customer coordinates, moves a pin, then removes it without clearing the text", async () => {
    details = detailsFor(false);
    details.ticket.locationLabel = "Existing";
    details.customer = { name: "Example Property", locationLat: 0, locationLng: -105 };
    history = () => ({ json: [] });
    mount();
    await openEdit();
    await userEvent.click(screen.getByTestId("toggle-work-location-pin"));
    fireEvent.click(await screen.findByTestId("button-work-pin-customer"));
    expect(screen.getByTestId("toggle-work-location-pin").textContent).toContain("0.0000, -105.0000");
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await screen.findByTestId("button-navigate");
    expect(patchBody()).toEqual({ locationLat: 0, locationLng: -105 });
    await openEdit();
    await userEvent.click(screen.getByTestId("toggle-work-location-pin"));
    const map = (await screen.findByTestId("map-work-location")).querySelector(".leaflet-container")!;
    fireEvent.click(map, { clientX: 50, clientY: 40 });
    await waitFor(() => expect(screen.getByTestId("toggle-work-location-pin").textContent).not.toContain("0.0000, -105.0000"));
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody().locationLat).not.toBe(0));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    await openEdit();
    await userEvent.click(screen.getByTestId("toggle-work-location-pin"));
    fireEvent.click(await screen.findByTestId("button-remove-work-pin"));
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("button-navigate")).toBeNull());
    expect(patchBody()).toEqual({ locationLat: null, locationLng: null });
    expect(screen.getByTestId("text-ticket-location-label").textContent).toBe("Existing");
  });
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
    expect(hint.textContent).toBe("Change under On the schedule below");
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
    await userEvent.click(screen.getByTestId("select-edit-crew"));
    await userEvent.click(await screen.findByRole("option", { name: "Crew 2" }));
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect(patchBody()).toEqual({ crewId: "k2" });
  });

  it("failed history is not treated as empty and does not submit the keys", async () => {
    details = detailsFor(true);
    history = () => ({ status: 500, json: { message: "boom" } });
    mount();
    await screen.findByTestId("button-retry-visits");
    await openEdit();
    expect(await screen.findByTestId("button-edit-visits-retry")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Updated title" } });
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
    await userEvent.click(screen.getByTestId("select-edit-crew"));
    await userEvent.click(await screen.findByRole("option", { name: "Crew 2" }));
    fireEvent.change(screen.getByTestId("input-edit-title"), { target: { value: "Updated title" } });
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
    await userEvent.click(screen.getByTestId("select-edit-crew"));
    await userEvent.click(await screen.findByRole("option", { name: "Crew 2" }));
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(patchBody()).toBeTruthy());
    expect(patchBody()).toEqual({ crewId: "k2" });
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

  it("zero open visits: changing crew and date does not send unchanged route order", async () => {
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
    expect("routeOrder" in b).toBe(false);
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
    expect((await screen.findByTestId("link-edit-visits-hint")).textContent).toBe("Change under On the schedule below");
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
    patchResult = { status: 409, json: { error: "MULTIPLE_VISITS", message: "This job is on the schedule more than once. Change it under On the schedule below." } };
    mount();
    await screen.findByTestId("card-ticket-visits");
    await openEdit();
    await waitFor(() => expect(screen.getByTestId("input-edit-dueDate")).toBeTruthy());
    await userEvent.click(screen.getByTestId("select-edit-crew"));
    await userEvent.click(await screen.findByRole("option", { name: "Crew 2" }));
    fireEvent.click(screen.getByTestId("button-save-edit"));
    await waitFor(() => expect(screen.queryByTestId("input-edit-title")).toBeNull());
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const call = toast.mock.calls.map(([a]) => a).find(a => a.description?.includes("on the schedule more than once"));
    expect(call?.action).toBeTruthy();
    expect(call.description).toBe("This job is on the schedule more than once. Change it under On the schedule below.");
  });
});

describe("S1 ticket scheduling controls", () => {
  function atGate() {
    details = detailsFor(true);
    details.ticket.currentStatusId = "s0";
    details.statuses.push(status("s2", "in_progress", "In Progress", 2));
    details.customer = { id: "prop", name: "Hyland Village" };
    history = () => ({ json: [] });
  }

  it.each([false, true])("shows the offered stop, places without a status PATCH, or refreshes a stale offer (%s)", async stale => {
    atGate();
    nextStop = { date: "2025-10-21", crew: { id: "k1", name: "Crew 1" }, routeOrder: 3, label: "Tue Oct 21 · Crew 1" };
    nextConflict = stale;
    mount();
    const footer = within(await screen.findByTestId("ticket-scheduling-footer"));
    const place = await footer.findByRole("button", { name: "Add to next stop here (Tue Oct 21 · Crew 1)" });
    expect(footer.getByRole("button", { name: "Pick a crew and day" })).toBeTruthy();
    expect(await footer.findByRole("button", { name: "Skip scheduling…" })).toBeTruthy();
    expect(screen.queryByTestId("button-advance-status")).toBeNull();
    fireEvent.click(place);
    await waitFor(() => {
      const sent = calls.find(c => c.method === "POST" && c.url.endsWith("/schedule-next-stop"));
      expect(sent?.headers.get("if-match")).toBe('"offered"');
      expect(sent?.headers.get("x-company-id")).toBe("c1");
    });
    if (stale) {
      expect(await footer.findByText("No upcoming stop at Hyland Village")).toBeTruthy();
      expect(toast.mock.calls.some(([a]) => a.description === "That stop is no longer on the schedule")).toBe(true);
      expect(screen.queryByTestId("row-ticket-visit-inserted")).toBeNull();
    } else {
      expect((await screen.findByTestId("row-ticket-visit-inserted")).textContent).toContain("Tue Oct 21 · Crew 1 · stop 1");
      expect(toast.mock.calls.some(([a]) => a.title === "Added to Crew 1’s stop at Hyland Village, Tue Oct 21.")).toBe(true);
    }
    expect(patchBody()).toBeUndefined();
  });

  it("requires a meaningful reason and shows the actual destination", async () => {
    atGate();
    mount();
    fireEvent.click(await screen.findByTestId("button-skip-scheduling"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("This moves the job to In Progress.")).toBeTruthy();
    const submit = dialog.getByRole("button", { name: "Skip scheduling" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText("Reason (required)"), { target: { value: "other" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText("Reason (required)"), { target: { value: "regular" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(calls.find(c => c.method === "POST" && c.url.endsWith("/skip-scheduling"))?.body).toEqual({
      reason: "Done during a regular stop",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(patchBody()).toBeUndefined();
  });

  it("keeps workflow steps browsable, with a scheduling hint instead of a status write", async () => {
    atGate();
    mount();
    fireEvent.click(await screen.findByTestId("tab-workflow"));
    fireEvent.click(screen.getByRole("button", { name: /Renamed Display/ }));
    expect(screen.getByText("Use Add to next stop or Pick a crew and day.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /In Progress/ }));
    expect(screen.getByText("Use Skip scheduling to move past Scheduled without a stop.")).toBeTruthy();
    expect(patchBody()).toBeUndefined();
  });

  it("shows the exact server rejection for a stale workflow move", async () => {
    atGate();
    details.ticket.currentStatusId = "s2";
    details.statuses.push(status("s3", "work_completed", "Work Completed", 3));
    history = () => ({ json: [visit("v1", "planned")] });
    patchResult = { status: 422, json: { error: "SCHEDULE_REQUIRED", message: "Put this job on the schedule first, or skip scheduling with a reason." } };
    mount();
    await screen.findByTestId("row-ticket-visit-v1");
    fireEvent.click(screen.getByTestId("button-step-back"));
    fireEvent.click(await screen.findByTestId("button-confirm-step-back"));
    await waitFor(() => expect(toast.mock.calls.some(([a]) => a.description === "Put this job on the schedule first, or skip scheduling with a reason.")).toBe(true));
    expect(screen.getByTestId("button-confirm-step-back")).toBeTruthy();
  });

  it("localizes the card, stop rows, and both scheduling dialogs in Spanish", async () => {
    await i18n.changeLanguage("es");
    atGate();
    history = () => ({ json: [visit("v1", "done")] });
    mount();
    const card = within(await screen.findByTestId("card-ticket-visits"));
    expect(card.getByText("En el calendario")).toBeTruthy();
    expect((await card.findByTestId("row-ticket-visit-v1")).textContent).toContain("Crew 1 · parada 1");
    fireEvent.click(card.getByRole("button", { name: "Elegir cuadrilla y día" }));
    expect(await screen.findByRole("heading", { name: "Poner en el calendario" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-visit-cancel"));
    fireEvent.click(await screen.findByRole("button", { name: "Omitir programación…" }));
    expect(await screen.findByRole("heading", { name: "Omitir programación" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Realizado durante una parada habitual" })).toBeTruthy();
  });
});
