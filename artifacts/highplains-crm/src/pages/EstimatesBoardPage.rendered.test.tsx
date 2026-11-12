// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { EstimateActionTicket } from "@shared/schema";
import "@/i18n";
import i18n from "@/i18n";
import en from "@/i18n/locales/en";
import EstimatesBoardPage from "./EstimatesBoardPage";
import BidsBoardPage from "./BidsBoardPage";
import { apiRequest } from "@/lib/queryClient";
import { runEstimateLifecycle } from "@/lib/estimateLifecycleActions";
import { addDaysYmd, compareRows } from "@/lib/estimateActionList";
import { denverToday } from "@/lib/estimateBuilder";

const auth = vi.hoisted(() => ({ user: { id: "u1", name: "Randy", activeCompanyId: "c1", activeRole: "admin", accessRole: "admin" } as Record<string, unknown> }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/estimateLifecycleActions", () => ({ runEstimateLifecycle: vi.fn() }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));

beforeAll(() => {
  // Radix menus need these in jsdom.
  Object.assign(window.HTMLElement.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, scrollIntoView: () => {} });
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const today = denverToday();
const est = (id: string, o: Partial<NonNullable<EstimateActionTicket["estimate"]>> = {}) => ({
  id, number: `EST-${id}`, versionNumber: 1, status: "sent" as const, subtotalCents: 100000, versionId: `v-${id}`,
  sentAt: null, acceptedAt: null, validUntil: null, draftEditedAt: null, linesNeedingPrice: 0, lineCount: 2, ...o,
});
function tk(id: string, bucket: EstimateActionTicket["nextAction"]["bucket"], urgency: "red" | "amber" | null, o: Partial<EstimateActionTicket> = {}): EstimateActionTicket {
  return {
    id, title: `Job ${id}`, typeKey: "estimate_request", statusKey: "s", statusName: "Stage", customer: { id: `cust-${id}`, name: `Customer ${id}` },
    assignee: { id: "u2", name: "Brady" }, owner: null, priority: "normal", estimateNumber: null, daysInStage: 4, followUpDate: null, followUpNote: null,
    estimate: est(id), nextAction: { bucket, urgency, reason: { key: "estimateActions.reason.overdue", params: { count: 3 } } }, ...o,
  };
}
const rows: EstimateActionTicket[] = [
  tk("fu", "follow_up", "red", { followUpNote: "Called once", estimate: est("fu", { sentAt: "2026-01-02T15:00:00Z", validUntil: "2026-02-01" }),
    nextAction: { bucket: "follow_up", urgency: "red", reason: { key: "estimateActions.reason.expired", params: { date: "2026-02-01" } } } }),
  tk("dec", "decide", "amber"),
  tk("snd", "send", "red", { estimate: est("snd", { status: "draft" }) }),
  tk("fin", "finish", "red", { estimate: est("fin", { status: "draft" }) }),
  tk("fin2", "finish", null, { estimate: est("fin2", { status: "draft", linesNeedingPrice: 1 }) }),
  tk("st", "start", "red", { estimate: null, assignee: null, daysInStage: 9 }),
  tk("st2", "start", "amber", { estimate: null, customer: { id: "c9", name: "Aspen Ridge HOA" } }),
  tk("wt", "waiting", null),
  tk("won", "won", null, { owner: { sectionKey: "scheduling", label: "in Scheduling", href: "/dashboard/scheduling" },
    estimate: est("won", { status: "accepted", acceptedAt: new Date().toISOString() }),
    nextAction: { bucket: "won", urgency: null, reason: { key: "estimates.owner.scheduling" } } }),
  tk("old", "won", null, { owner: { sectionKey: "invoicing", label: "x", href: "/dashboard/invoicing" },
    estimate: est("old", { status: "accepted", acceptedAt: "2020-01-01T12:00:00Z" }), nextAction: { bucket: "won", urgency: null, reason: { key: "estimates.owner.invoicing" } } }),
];
const team = [
  { companyUser: { userId: "u1", isActive: true }, user: { id: "u1", name: "Randy" }, isSuperAdmin: false },
  { companyUser: { userId: "u2", isActive: true }, user: { id: "u2", name: "Brady" }, isSuperAdmin: false },
  { companyUser: { userId: "u3", isActive: false }, user: { id: "u3", name: "Gone Person" }, isSuperAdmin: false },
  { companyUser: { userId: "u4", status: "suspended" }, user: { id: "u4", name: "Suspended Person" }, isSuperAdmin: false },
];
let boardData: { stages: { key: string; tickets: EstimateActionTicket[] }[] } = { stages: [{ key: "all", tickets: rows }] };
const ok = (v: unknown) => ({ json: async () => v }) as Response;
function mockApi(extra?: (m: string, u: string, b: unknown) => unknown) {
  vi.mocked(apiRequest).mockImplementation(async (m: string, u: string, b?: unknown) => {
    const r = extra?.(m, u, b);
    if (r !== undefined) return r as Response;
    if (u === "/api/companies/users") return ok(team);
    if (u === "/api/estimates/board") return ok(boardData);
    return ok({});
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const loc = memoryLocation({ path: "/dashboard/estimates", record: true });
  const utils = render(<QueryClientProvider client={client}><Router hook={loc.hook}><EstimatesBoardPage /></Router></QueryClientProvider>);
  return { ...utils, loc, client };
}
const ids = () => screen.queryAllByTestId(/^row-/).map((e) => e.getAttribute("data-testid")!.slice(4));

afterEach(async () => {
  cleanup(); vi.clearAllMocks();
  boardData = { stages: [{ key: "all", tickets: rows }] };
  auth.user = { id: "u1", name: "Randy", activeCompanyId: "c1", activeRole: "admin", accessRole: "admin" };
  await i18n.changeLanguage("en");
});

describe("Estimates action list", () => {
  it("defaults to Urgent with only red action rows, sorted, and uses the scoped board query", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    expect(ids()).toEqual(["fu", "snd", "fin", "st"]);
    expect(screen.getByTestId("scope-urgent").getAttribute("aria-pressed")).toBe("true");
    expect(vi.mocked(apiRequest).mock.calls.find((c) => c[1] === "/api/estimates/board")?.[3]).toMatchObject({ headers: { "X-Company-Id": "c1" } });
    expect(screen.getByTestId("text-summary").textContent).toBe("7 estimate requests need an action · 4 urgent · $3,000.00 out with customers");
    expect(screen.getByTestId("row-fu").getAttribute("style")).toContain("hsl(var(--est-danger))");
    expect(screen.getByTestId("text-reason-fu").textContent).toMatch(/Expired on Feb 1, 2026/);
    expect(screen.getByTestId("button-new-estimate-request").getAttribute("href")).toBe("/dashboard/tickets/new?workType=estimate_request");
    expect(screen.getByTestId("link-estimate-fu").getAttribute("href")).toBe("/dashboard/estimates/builder/fu");
  });

  it("scope counts and lists match; recently won is 30-day newest-first; won rows are quiet", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    const counts = { urgent: 4, action: 7, waiting: 1, won: 1, all: 10 };
    for (const [s, n] of Object.entries(counts)) {
      expect(screen.getByTestId(`count-scope-${s}`).textContent).toBe(String(n));
      fireEvent.click(screen.getByTestId(`scope-${s}`));
      expect(ids()).toHaveLength(n);
    }
    fireEvent.click(screen.getByTestId("scope-won"));
    const won = screen.getByTestId("row-won");
    expect(won.className).toContain("opportunity-won");
    expect(within(won).getByTestId("owner-won").getAttribute("href")).toBe("/dashboard/scheduling");
    expect(won.textContent).toContain("Project");
    expect(within(won).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByTestId("scope-action"));
    expect(ids()).toEqual(["fu", "snd", "fin", "st", "dec", "st2", "fin2"]);
  });

  it("bucket cards filter, toggle off, reflect scope, and scope change clears them", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    expect(screen.getByTestId("count-bucket-decide").textContent).toBe("0");
    expect(screen.getByTestId("dot-bucket-finish")).toBeTruthy();
    fireEvent.click(screen.getByTestId("scope-action"));
    expect(screen.getByTestId("count-bucket-finish").textContent).toBe("2");
    fireEvent.click(screen.getByTestId("card-bucket-finish"));
    expect(ids()).toEqual(["fin", "fin2"]);
    fireEvent.click(screen.getByTestId("card-bucket-finish"));
    expect(ids()).toHaveLength(7);
    fireEvent.click(screen.getByTestId("card-bucket-start"));
    fireEvent.click(screen.getByTestId("scope-all"));
    expect(screen.getByTestId("card-bucket-start").getAttribute("aria-pressed")).toBe("false");
  });

  it("search and assignee filter; empty states", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    fireEvent.click(screen.getByTestId("scope-all"));
    fireEvent.change(screen.getByTestId("input-search-estimates"), { target: { value: "aspen" } });
    expect(ids()).toEqual(["st2"]);
    fireEvent.change(screen.getByTestId("input-search-estimates"), { target: { value: "EST-dec" } });
    expect(ids()).toEqual(["dec"]);
    fireEvent.change(screen.getByTestId("input-search-estimates"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("select-assignee"), { target: { value: "unassigned" } });
    expect(ids()).toEqual(["st"]);
    fireEvent.change(screen.getByTestId("select-assignee"), { target: { value: "u2" } });
    expect(ids()).not.toContain("st");
    fireEvent.change(screen.getByTestId("input-search-estimates"), { target: { value: "zzz" } });
    expect(screen.getByTestId("empty-estimates").textContent).toBe("Nothing matches these filters.");
  });

  it("empty Urgent links to Needs action", async () => {
    boardData = { stages: [{ key: "x", tickets: [rows[1]] }] };
    mockApi(); renderPage();
    const link = await screen.findByTestId("button-see-needs-action");
    expect(screen.getByTestId("empty-estimates").textContent).toContain("Nothing urgent right now.");
    fireEvent.click(link);
    expect(ids()).toEqual(["dec"]);
  });

  it("primary and icon actions open the right dialogs and links; tooltips have names", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    expect(screen.getByTestId("act-fin").getAttribute("href")).toBe("/dashboard/estimates/builder/fin");
    expect(screen.getByRole("button", { name: "Send EST-fin" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("scope-action"));
    expect(screen.queryByTestId("icon-send-fin2")).toBeNull();
    expect(screen.getByRole("button", { name: "Mark lost" })).toBe(screen.getByTestId("icon-lost-dec"));
    fireEvent.click(screen.getByTestId("act-dec"));
    expect(await screen.findByTestId("dialog-accept")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-cancel-lifecycle"));
    await waitFor(() => expect(screen.queryByTestId("dialog-accept")).toBeNull());
    fireEvent.click(screen.getByTestId("icon-lost-dec"));
    expect(await screen.findByTestId("dialog-decline")).toBeTruthy();
  });

  it("accept calls the shared lifecycle helper with the captured company and version", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    fireEvent.click(screen.getByTestId("scope-action"));
    vi.mocked(runEstimateLifecycle).mockResolvedValue({ kind: "success", data: {} as never });
    fireEvent.click(screen.getByTestId("act-dec"));
    fireEvent.click(await screen.findByTestId("button-submit-accept"));
    await waitFor(() => expect(screen.queryByTestId("dialog-accept")).toBeNull());
    const opts = vi.mocked(runEstimateLifecycle).mock.calls[0][0];
    expect(opts).toMatchObject({ kind: "accept", method: "POST", companyId: "c1", url: "/api/estimates/dec/versions/v-dec/accept", customerName: "Customer dec" });
    expect(opts.isActive()).toBe(true);
  });
  it("rejects a stale dialog version after the board refreshes", async () => {
    mockApi(); const { client } = renderPage();
    await screen.findByTestId("row-snd");
    fireEvent.click(screen.getByTestId("act-snd"));
    await screen.findByTestId("dialog-send");
    act(() => client.setQueryData(["/api/estimates/board", "c1", "u1", "admin"], {
      stages: [{ key: "proposal", tickets: rows.map(r => r.id === "snd" ? { ...r, estimate: { ...r.estimate, versionId: "new-version" } } : r) }],
    }));
    await waitFor(() => expect(client.getQueryData<any>(["/api/estimates/board", "c1", "u1", "admin"]).stages[0].tickets.find((r: any) => r.id === "snd").estimate.versionId).toBe("new-version"));
    fireEvent.click(screen.getByTestId("button-submit-send"));
    expect(await screen.findByTestId("error-lifecycle")).toBeTruthy();
    expect(runEstimateLifecycle).not.toHaveBeenCalled();
  });
  it("Mark lost submits the existing reason route through the shared helper", async () => {
    mockApi(); renderPage(); await screen.findByTestId("row-fu");
    fireEvent.click(screen.getByTestId("scope-action"));
    vi.mocked(runEstimateLifecycle).mockResolvedValue({ kind: "success", data: {} as never });
    fireEvent.click(screen.getByTestId("icon-lost-dec"));
    fireEvent.change(await screen.findByTestId("input-decline-reason"), { target: { value: "Not needed" } });
    fireEvent.click(screen.getByTestId("button-submit-decline"));
    await waitFor(() => expect(runEstimateLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      kind: "decline", url: "/api/estimates/dec/versions/v-dec/decline", body: { reason: "Not needed" },
    })));
  });
  it("waiting menu offers links, scoped inline PDF, follow-up and reassign", async () => {
    mockApi(); renderPage(); const user = userEvent.setup();
    await screen.findByTestId("row-fu"); fireEvent.click(screen.getByTestId("scope-waiting"));
    expect(screen.queryByTestId("act-wt")).toBeNull();
    await user.click(screen.getByTestId("menu-wt"));
    expect((await screen.findByTestId("menu-ticket-wt")).getAttribute("href")).toBe("/dashboard/tickets/wt");
    expect(screen.getByTestId("menu-estimate-wt").getAttribute("href")).toBe("/dashboard/estimates/builder/wt");
    expect(screen.getByTestId("menu-won-wt")).toBeTruthy();
    expect(screen.getByTestId("menu-lost-wt")).toBeTruthy();
    await user.click(screen.getByTestId("menu-follow-up-wt"));
    expect(await screen.findByTestId("dialog-follow-up")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-cancel-follow-up"));
    await user.click(screen.getByTestId("menu-wt"));
    await user.hover(await screen.findByTestId("menu-reassign-wt"));
    fireEvent.click(await screen.findByTestId("menu-reassign-wt-u1"));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/tickets/wt", { assignedToId: "u1" }, { headers: { "X-Company-Id": "c1" } }));
    await user.click(screen.getByTestId("menu-wt"));
    await user.click(await screen.findByTestId("menu-pdf-wt"));
    expect(await screen.findByTestId("dialog-pdf-preview")).toBeTruthy();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("GET", "/api/estimates/wt/versions/v-wt/pdf", undefined, expect.objectContaining({ headers: { "X-Company-Id": "c1" } })));
  });

  it("Send's needs-a-price path keeps the dialog open with the confirmation, then sends anyway", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-snd");
    vi.mocked(runEstimateLifecycle).mockResolvedValueOnce({ kind: "needsPrice", lineIds: ["l1"] });
    fireEvent.click(screen.getByTestId("act-snd"));
    fireEvent.click(await screen.findByTestId("button-submit-send"));
    expect(await screen.findByTestId("panel-need-price")).toBeTruthy();
    vi.mocked(runEstimateLifecycle).mockResolvedValueOnce({ kind: "error", message: "Version changed", status: 409, conflict: null });
    fireEvent.click(screen.getByTestId("button-send-anyway"));
    expect((await screen.findByTestId("error-lifecycle")).textContent).toBe("Version changed");
    expect(vi.mocked(runEstimateLifecycle).mock.calls[1][0].body).toEqual({ method: "email", confirmZeroPriced: true });
  });

  it("Build estimate creates the estimate and opens the builder; missing customer fails explicitly", async () => {
    mockApi((m, u) => m === "POST" && u === "/api/estimates" ? ok({ id: "new-est" }) : undefined);
    const { loc } = renderPage();
    await screen.findByTestId("row-fu");
    fireEvent.click(screen.getByTestId("scope-action"));
    fireEvent.click(screen.getByTestId("act-st2"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/new-est"));
    expect(vi.mocked(apiRequest).mock.calls.find((c) => c[0] === "POST")).toEqual(
      ["POST", "/api/estimates", { ticketId: "st2", customerId: "c9", title: "Job st2" }, expect.objectContaining({ headers: { "X-Company-Id": "c1" } })]);
  });

  it("Build on a row that already has an estimate opens it; no customer toasts", async () => {
    boardData = { stages: [{ key: "x", tickets: [tk("a", "start", "red", { customer: null, estimate: null }), tk("b", "start", "red", { estimate: est("b", { status: "draft" }) })] }] };
    mockApi();
    const { loc } = renderPage();
    await screen.findByTestId("row-a");
    fireEvent.click(screen.getByTestId("act-a"));
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    fireEvent.click(screen.getByTestId("act-b"));
    expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/b");
    expect(vi.mocked(apiRequest).mock.calls.some((c) => c[0] === "POST")).toBe(false);
  });

  it("Assign lists active team members and patches the ticket with the company header", async () => {
    mockApi(); renderPage();
    await screen.findByTestId("row-st");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("act-st"));
    const menu = await screen.findByTestId("assign-st-menu");
    expect(menu.textContent).not.toContain("Gone Person");
    expect(menu.textContent).not.toContain("Suspended Person");
    expect(menu.textContent).toContain("Me (Randy)");
    await user.click(within(menu).getByTestId("assign-st-u2"));
    await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith("PATCH", "/api/tickets/st", { assignedToId: "u2" }, { headers: { "X-Company-Id": "c1" } }));
  });

  it("saving a follow-up patches the typed note and moves the row from follow_up to waiting", async () => {
    let saved = false;
    mockApi((m, u, b) => {
      if (m === "PATCH") { saved = true; return ok({}); }
      if (u === "/api/estimates/board" && saved) return ok({ stages: [{ key: "x", tickets: [{ ...rows[0], followUpNote: (b as never) ?? "", nextAction: { bucket: "waiting", urgency: null, reason: { key: "estimateActions.reason.scheduled", params: { date: addDaysYmd(today, 7) } } } }] }] });
      return undefined;
    });
    renderPage();
    await screen.findByTestId("row-fu");
    fireEvent.click(screen.getByTestId("act-fu"));
    const dlg = await screen.findByTestId("dialog-follow-up");
    expect(dlg.textContent).toContain("Log follow-up — Customer fu");
    expect(screen.getByTestId("text-follow-up-last").textContent).toContain("Called once");
    expect((screen.getByTestId("input-follow-up-note") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByTestId("input-follow-up-date") as HTMLInputElement).value).toBe(addDaysYmd(today, 7));
    fireEvent.click(screen.getByTestId("pick-follow-up-d3"));
    fireEvent.click(screen.getByTestId("button-save-follow-up"));
    await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith("PATCH", "/api/tickets/fu",
      { followUpDate: addDaysYmd(today, 3), followUpNote: "" }, { headers: { "X-Company-Id": "c1" } }));
    await waitFor(() => expect(screen.queryByTestId("row-fu")).toBeNull());
    fireEvent.click(screen.getByTestId("scope-waiting"));
    expect(screen.getByTestId("row-fu").getAttribute("data-bucket")).toBe("waiting");
  });

  it("ignores a lifecycle result that resolves after unmount", async () => {
    mockApi(); const { unmount } = renderPage();
    await screen.findByTestId("row-snd");
    let resolve!: (v: never) => void;
    vi.mocked(runEstimateLifecycle).mockReturnValue(new Promise((r) => { resolve = r as never; }));
    fireEvent.click(screen.getByTestId("act-snd"));
    fireEvent.click(await screen.findByTestId("button-submit-send"));
    await waitFor(() => expect(runEstimateLifecycle).toHaveBeenCalled());
    const opts = vi.mocked(runEstimateLifecycle).mock.calls[0][0];
    unmount();
    expect(opts.isActive()).toBe(false);
    await act(async () => { resolve({ kind: "error", message: "late", status: 500, conflict: null } as never); });
  });

  it("ignores a follow-up save that resolves after unmount", async () => {
    let finish!: () => void;
    mockApi((m) => m === "PATCH" ? new Promise((r) => { finish = () => r(ok({})); }) : undefined);
    const { unmount } = renderPage();
    await screen.findByTestId("row-fu");
    fireEvent.click(screen.getByTestId("act-fu"));
    fireEvent.click(await screen.findByTestId("button-save-follow-up"));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    unmount();
    await act(async () => { finish(); });
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("renders Spanish with no English fallbacks", async () => {
    await i18n.changeLanguage("es");
    mockApi(); renderPage();
    await screen.findByTestId("row-fu");
    expect(screen.getByText("Lo que necesita su atención")).toBeTruthy();
    expect(screen.getByTestId("scope-urgent").textContent).toContain("Urgentes");
    expect(screen.getByTestId("act-fu").textContent).toBe("Registrar seguimiento");
    const text = document.body.textContent ?? "";
    for (const word of ["What needs you", "Follow up", "Needs action", "Log follow-up", "Everyone", "Expired"]) expect(text).not.toContain(word);
    const flat = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]);
    for (const key of flat((en as { estimateActions: object }).estimateActions, "estimateActions.")) expect(i18n.exists(key, { lng: "es", fallbackLng: [] })).toBe(true);
  });

  it("renders nothing for non-office roles", async () => {
    auth.user = { ...auth.user, activeRole: "field", accessRole: "field" };
    mockApi(); const { container } = renderPage();
    expect(container.textContent).toBe("");
  });
  it("recovers a finish row with no draft through the existing Build flow", async () => {
    boardData = { stages: [{ key: "estimating", tickets: [tk("missing-draft", "finish", "red", { estimate: null })] }] };
    mockApi((m, u) => m === "POST" && u === "/api/estimates" ? ok({ id: "recovered" }) : undefined);
    const { loc } = renderPage();
    expect((await screen.findByTestId("act-missing-draft")).textContent).toBe("Build estimate");
    fireEvent.click(screen.getByTestId("act-missing-draft"));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/dashboard/estimates/builder/recovered"));
  });

  it("sort comparator: red, amber, none; then bucket order; then oldest", () => {
    const list = [tk("a", "start", "red"), tk("b", "follow_up", null), tk("c", "follow_up", "red", { daysInStage: 1 }), tk("d", "follow_up", "red", { daysInStage: 9 }), tk("e", "decide", "amber")];
    expect([...list].sort(compareRows).map((x) => x.id)).toEqual(["d", "c", "a", "e", "b"]);
  });
});

describe("Bids board is unchanged", () => {
  it("still renders the OpportunityBoard stage columns", async () => {
    vi.mocked(apiRequest).mockResolvedValue(ok({ stages: [] }));
    const loc = memoryLocation({ path: "/dashboard/bids" });
    render(<QueryClientProvider client={new QueryClient()}><Router hook={loc.hook}><BidsBoardPage /></Router></QueryClientProvider>);
    for (const k of ["new", "reviewing", "walk", "proposal", "submitted", "decision"]) expect(await screen.findByTestId(`column-${k}`)).toBeTruthy();
  });
});
