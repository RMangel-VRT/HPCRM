// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import i18n from "@/i18n";
import { SectionTitle, PageEmptyState, displayStatus, DISPLAY_STATUSES, KNOWN_MODULE_STATES } from "@/components/customer/page";
import ContactsPage, { allContactEmails, managerContactCompany } from "@/components/customer/pages/ContactsPage";
import NotesPage from "@/components/customer/pages/NotesPage";
import CustomerTicketsPage from "@/components/customer/pages/CustomerTicketsPage";
import CommunicationListTab, { isLoggedComm, matchesCommChip } from "@/components/CommunicationListTab";
import { dashboardNote, sortNotes } from "@/hooks/useCustomerNotes";
import { formatCurrency } from "@/lib/currency";
import { paginateRows, seasonText, summaryIdsForPage } from "@/components/customers/listSummary";

const fx = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1", activeCompanyId: "co", activeRole: "admin", accessRole: "admin" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fx.toast }) }));
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/", vi.fn()] };
});
vi.mock("@/lib/queryClient", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
    apiRequest: (...args: unknown[]) => fx.api(...args) };
});
const ok = (v: unknown) => ({ json: async () => v, ok: true });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
beforeEach(() => { queryClient.clear(); fx.api.mockReset(); fx.toast.mockReset(); });
afterEach(() => cleanup());

describe("shared page parts", () => {
  it("SectionTitle allows one primary and renders it last", () => {
    render(<SectionTitle title="Contacts" lead="Lead" actions={[{ primary: true, node: <button>P</button> }, { node: <button>S</button> }]} />);
    const buttons = within(screen.getByTestId("section-title-actions")).getAllByRole("button");
    expect(buttons.map(b => b.textContent)).toEqual(["S", "P"]);
    expect(screen.getByTestId("text-customer-page-heading").textContent).toBe("Contacts");
    expect(() => render(<SectionTitle title="x" actions={[{ primary: true, node: <i /> }, { primary: true, node: <b /> }]} />)).toThrow();
  });
  it("EmptyState shows icon, one sentence and optional action", () => {
    render(<PageEmptyState icon={Inbox} message="Nothing here." action={<button>Go</button>} />);
    expect(screen.getByTestId("page-empty-state-message").textContent).toBe("Nothing here.");
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  });
  it("status map covers every module state and the vocabulary is translated", () => {
    for (const [mod, states] of Object.entries(KNOWN_MODULE_STATES))
      for (const s of states) expect(DISPLAY_STATUSES).toContain(displayStatus(mod as "service", s));
    expect(displayStatus("ticket", { actionType: "waiting" })).toBe("pending");
    expect(displayStatus("ticket", { isFinal: "true", name: "Completed" })).toBe("done");
    expect(displayStatus("proposal", "accepted")).toBe("done");
    expect(displayStatus("contract", "previous")).toBe("ended");
    expect(displayStatus("proposal", "weird")).toBe("pending");
    for (const lang of ["en", "es"]) for (const s of DISPLAY_STATUSES) expect(i18n.getFixedT(lang)(`cp4.status.${s}`)).not.toMatch(/cp4/);
  });
});

describe("contacts", () => {
  const contacts = [
    { id: "c1", name: "Ana", role: "Board", isPrimary: "true", emails: ["a@x.co"], phones: ["555"], propertyManagerId: null },
    { id: "c2", name: "Ben", role: "Manager", isPrimary: "false", emails: ["b@x.co", " "], phones: [], propertyManagerId: "pm1" },
  ] as never[];
  it("renders table with primary chip, From company tag and copy buttons", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<ContactsPage contacts={contacts} isLoading={false} error={null} onRetry={() => {}}
      pmManagers={[{ id: "pm1", propertyManagementCompanyId: "pc" }] as never[]} pmCompanies={[{ id: "pc", name: "Summit Mgmt" }] as never[]} />);
    expect(screen.getByTestId("chip-primary-c1")).toBeTruthy();
    expect(screen.getByTestId("tag-from-company-c2").textContent).toBe("From Summit Mgmt");
    fireEvent.click(screen.getByTestId("button-copy-email-c1-0"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith({ title: i18n.t("cp4.contacts.copied") }));
    expect(allContactEmails(contacts)).toEqual(["a@x.co", "b@x.co"]);
    expect(managerContactCompany(contacts[0], [], [])).toBeNull();
  });
  it("reports copy failure honestly", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    render(<ContactsPage contacts={contacts} isLoading={false} error={null} onRetry={() => {}} pmManagers={[]} pmCompanies={[]} />);
    fireEvent.click(screen.getByTestId("button-copy-email-c1-0"));
    await waitFor(() => expect(fx.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});

describe("notes", () => {
  const notes = [
    { id: "n1", body: "old", authorName: "Rosa Diaz", createdAt: "2026-01-02T10:00:00Z", pinnedAt: null },
    { id: "n2", body: "pinned", authorName: "Ken Ito", createdAt: "2025-12-01T10:00:00Z", pinnedAt: "2026-01-05T00:00:00Z" },
    { id: "n3", body: "new", authorName: null, createdAt: "2026-02-01T10:00:00Z", pinnedAt: null },
  ] as never[];
  it("orders pinned first, dashboard shows pinned else newest", () => {
    expect(sortNotes(notes).map((n: { id: string }) => n.id)).toEqual(["n2", "n3", "n1"]);
    expect((dashboardNote(notes) as { id: string } | null)?.id).toBe("n2");
    expect((dashboardNote([notes[0], notes[2]]) as { id: string } | null)?.id).toBe("n3");
  });
  it("renders author + date heading, pinned chip, and no tab add button", () => {
    wrap(<NotesPage customerId="cu" notes={notes} isLoading={false} error={null} onRetry={() => {}} canWrite onEdit={() => {}} />);
    expect(screen.getByTestId("text-note-heading-n1").textContent).toContain("Rosa Diaz");
    expect(screen.getByTestId("text-note-date-n1").textContent).toMatch(/Jan 2, 2026/);
    expect(screen.getByTestId("chip-pinned-n2")).toBeTruthy();
    expect(screen.queryByTestId("button-add-note-tab")).toBeNull();
  });
  it("pins through PATCH /api/notes/:id/pin and invalidates notes + activity", async () => {
    fx.api.mockResolvedValue(ok({}));
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    wrap(<NotesPage customerId="cu" notes={notes} isLoading={false} error={null} onRetry={() => {}} canWrite onEdit={() => {}} />);
    const trigger = screen.getByTestId("button-note-menu-n1");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false }); fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByTestId("menu-pin-note-n1"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("PATCH", "/api/notes/n1/pin", { pinned: true }, expect.objectContaining({ headers: { "X-Company-Id": "co" } })));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["/api/customers", "cu", "notes"] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["/api/customers", "cu", "dashboard-activity"] });
  });
});

describe("communications", () => {
  it("logged predicate matches the server's", () => {
    expect(isLoggedComm({})).toBe(true);
    expect(isLoggedComm({ providerMessageId: "m" })).toBe(false);
    expect(isLoggedComm({ deliveryProvider: "sendgrid" })).toBe(false);
    expect(isLoggedComm({ automationRuleId: "r" })).toBe(false);
    expect(isLoggedComm({ mailboxAccountId: "mb" })).toBe(false);
    const out = { direction: "outbound" } as never;
    expect(matchesCommChip(out, "from_us")).toBe(true);
    expect(matchesCommChip(out, "from_them")).toBe(false);
  });
  it("renders thread rows, scoped request, chips, no type column", async () => {
    const comms = [
      { id: "m1", threadId: "t1", subject: "Gate code", direction: "inbound", contactName: "Lena", bodyText: "Hi there\nmore", createdAt: "2026-03-01T10:00:00Z", type: "email", status: "sent", mailboxAccountId: "mb" },
      { id: "m2", threadId: "t1", subject: "Gate code", direction: "outbound", sentByName: "Sam", bodyText: "Reply", createdAt: "2026-03-02T10:00:00Z", type: "email", status: "sent", mailboxAccountId: "mb" },
    ];
    fx.api.mockImplementation(async (_m: string, url: string) => url.startsWith("/api/mailbox-accounts") ? ok([]) : ok({ data: comms, total: 2 }));
    wrap(<CommunicationListTab queryKey={["/api/customers", "cu", "communications"]} customerId="cu" showLogButton={false} />);
    expect(await screen.findByTestId("badge-thread-count-t1")).toBeTruthy();
    expect(fx.api).toHaveBeenCalledWith("GET", expect.stringContaining("/api/customers/cu/communications"), undefined, expect.objectContaining({ headers: { "X-Company-Id": "co" } }));
    expect(screen.queryByText(/^email$/)).toBeNull();
    expect(screen.queryByTestId("button-log-new-comm")).toBeNull();
    fireEvent.click(screen.getByTestId("chip-comm-logged"));
    await waitFor(() => expect(fx.api).toHaveBeenCalledWith("GET", expect.stringContaining("source=logged"), undefined, expect.anything()));
  });
});

describe("tickets", () => {
  const types = [{ id: "ty", name: "Irrigation" }];
  const statuses = [{ id: "s-open", name: "Open", statusKey: "open", isFinal: "false" }, { id: "s-done", name: "Done", statusKey: "done", isFinal: "true" }];
  const tk = (id: string, cu: string, st: string) => ({ id, title: `T ${id}`, customerId: cu, ticketTypeId: "ty", currentStatusId: st, createdAt: "2026-01-01T00:00:00Z", completedAt: st === "s-done" ? "2026-02-03T00:00:00Z" : null });
  const mock = (byCustomer: Record<string, unknown[]>) => fx.api.mockImplementation(async (_m: string, url: string) => {
    if (url === "/api/ticket-types") return ok(types);
    if (url === "/api/ticket-type-statuses") return ok(statuses);
    if (url === "/api/companies/users") return ok([]);
    const m = url.match(/customers\/(.+)\/tickets/); if (m) return ok(byCustomer[m[1]!] ?? []);
    throw new Error(url);
  });
  it("open first, completed collapsed, no new-ticket button, no internal id", async () => {
    mock({ cu: [tk("a", "cu", "s-open"), tk("b", "cu", "s-done")] });
    wrap(<CustomerTicketsPage customerId="cu" />);
    expect(await screen.findByTestId("row-ticket-a")).toBeTruthy();
    expect(screen.queryByTestId("row-ticket-b")).toBeNull();
    expect(screen.queryByText(/new ticket/i)).toBeNull();
    expect(screen.getByTestId("status-ticket-a").getAttribute("data-status")).toBe("active");
    fireEvent.click(screen.getByTestId("button-toggle-completed"));
    expect(screen.getByTestId("text-ticket-when-b").textContent).toMatch(/Feb 3, 2026/);
    fireEvent.change(screen.getByTestId("input-ticket-search"), { target: { value: "zzz" } });
    expect(screen.queryByTestId("row-ticket-a")).toBeNull();
  });
  it("parent version adds Branch column across branches", async () => {
    mock({ b1: [tk("x", "b1", "s-open")], b2: [tk("y", "b2", "s-open")] });
    wrap(<CustomerTicketsPage customerId="p" branches={[{ id: "b1", name: "North" }, { id: "b2", name: "South" }]} />);
    expect(await screen.findByTestId("text-ticket-branch-y")).toHaveProperty("textContent", "South");
    expect(screen.getByTestId("col-branch")).toBeTruthy();
  });
});

describe("list helpers", () => {
  const t = (k: string) => i18n.t(k);
  const term = (o: object) => ({ termId: Math.random().toString(), label: "L", line: "landscape", parentCustomerId: null, annualCents: null, snowPricing: null, ...o });
  it("formatCurrency drops cents only for whole dollars and never rounds", () => {
    expect(formatCurrency(1234500, true)).toBe("$12,345");
    expect(formatCurrency(1234567, true)).toBe("$12,345.67");
    expect(formatCurrency(1234500)).toBe("$12,345.00");
    expect(formatCurrency(null, true)).toBe("\u2014");
  });
  it("This season cases", () => {
    expect(seasonText({ current: [term({ annualCents: 1234550 })] } as never, t)).toBe("$12,345.50");
    expect(seasonText(undefined, t)).toBe("\u2014");
    expect(seasonText({ current: [] } as never, t)).toBe("\u2014");
    expect(seasonText({ current: [term({ annualCents: 1234500 })] } as never, t)).toBe("$12,345");
    expect(seasonText({ current: [term({ annualCents: 100000 }), term({ line: "snow", snowPricing: "time_and_materials" })] } as never, t)).toContain("snow T&M");
    expect(seasonText({ current: [term({ line: "snow", snowPricing: "time_and_materials" })] } as never, t)).toBe(i18n.t("cp1.timeAndMaterials"));
    expect(seasonText({ current: [term({ parentCustomerId: "p" })] } as never, t)).toBe(i18n.t("cp3.chips.parentPriced"));
    expect(seasonText({ current: [term({})] } as never, t)).toBe(i18n.t("cp3.chips.priceNotSet"));
  });
  it("batches exactly the rendered ids and never truncates silently", () => {
    expect(summaryIdsForPage(["b", "a", "c", "a"])).toEqual(["a", "b", "c"]);
    expect(() => summaryIdsForPage(Array.from({ length: 201 }, (_, i) => `i${i}`))).toThrow();
    const flat = Array.from({ length: 120 }, (_, i) => i);
    expect(paginateRows(flat, 3).rows).toEqual(flat.slice(100));
    expect(paginateRows(flat, 9).page).toBe(3);
  });
});
