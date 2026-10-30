// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/lib/protected-route";
import { canViewBilling } from "@/lib/billing";
import type { NavRole } from "@/components/nav/navConfig";
import {
  generalFilter, mentionsFilter, mentionsCountKey, notificationCountKey, notificationCountOptions,
  notificationListKey, notificationListOptions, markNotificationRead, markAllNotificationsRead, type Notification,
} from "@/lib/notifications";

const fx = vi.hoisted(() => ({
  api: vi.fn(),
  user: { id: "recipient", activeRole: "admin" as NavRole, activeTags: [] as string[], isSuperAdminBool: false },
  detailsError: null as string | null,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.user, isLoading: false }) }));
vi.mock("@/lib/queryClient", async original => ({
  ...await original<typeof import("@/lib/queryClient")>(),
  apiRequest: (...args: unknown[]) => fx.api(...args),
}));
vi.mock("@assets/LOGO_-_SPREAD-06_1773353516653.png", () => ({ default: "logo.png" }));
vi.mock("@/hooks/use-scheduling", () => ({ useSchedulingQueue: () => ({ data: undefined }) }));
import MentionsDropdown from "./MentionsDropdown";
import NotificationsDropdown from "./NotificationsDropdown";
import MentionsPage from "@/pages/MentionsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import AppSidebar from "./AppSidebar";
import { MentionRow } from "./MentionRow";

const mention = (id = "m1", isRead = false): Notification => ({
  id, type: "mentioned", ticketId: `ticket-${id}`, message: `Mention ${id}`, isRead, createdAt: "2026-10-30T12:00:00Z",
});
const general: Notification = { ...mention("g1"), type: "assigned", message: "Assigned general" };
let clients: QueryClient[] = [];
let rows: Notification[] = [];
let pauseGets = false;
beforeEach(async () => {
  await i18n.changeLanguage("en");
  fx.user = { id: "recipient", activeRole: "admin", activeTags: [], isSuperAdminBool: false };
  fx.detailsError = null;
  rows = [mention(), mention("old", true), general]; pauseGets = false;
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  fx.api.mockImplementation(async (method: string, url: string) => {
    if (method === "GET") {
      if (/\/api\/tickets\/[^/]+\/details$/.test(url)) {
        if (fx.detailsError) throw new Error(fx.detailsError);
        return { json: async () => ({ ticket: { id: "ticket-m1", assignedToId: fx.user.id } }) };
      }
      if (pauseGets) return new Promise(() => {});
      const parsed = new URL(url, "http://localhost");
      const filtered = rows.filter(row => parsed.searchParams.has("type") ? row.type === "mentioned" : row.type !== "mentioned");
      return { json: async () => structuredClone(parsed.pathname.endsWith("unread-count") ? { count: filtered.filter(row => !row.isRead).length } : filtered) };
    }
    if (url.endsWith("read-all")) rows = rows.map(row => ({ ...row, isRead: true }));
    else rows = rows.map(row => url.includes(`/${row.id}/`) ? { ...row, isRead: true } : row);
    return { json: async () => ({}) };
  });
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients = []; fx.api.mockReset(); });
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(value); return value;
}
function mount(content: React.ReactNode, cache = client()) {
  const loc = memoryLocation({ path: "/dashboard/mentions", record: true });
  render(<QueryClientProvider client={cache}><Router hook={loc.hook}><TooltipProvider>{content}</TooltipProvider></Router></QueryClientProvider>);
  return { cache, loc };
}
function seed(cache: QueryClient, count = 1) {
  cache.setQueryData(notificationListKey(mentionsFilter), rows.filter(row => row.type === "mentioned"));
  cache.setQueryData(notificationListKey(generalFilter), [general]);
  cache.setQueryData(mentionsCountKey, { count });
  cache.setQueryData(notificationCountKey(generalFilter), { count: 1 });
}

describe("dedicated Mentions surfaces", () => {
  it("uses explicit isolated filter requests and matching shared 60s/50s count settings", async () => {
    const cache = client();
    await cache.fetchQuery(notificationListOptions(mentionsFilter));
    await cache.fetchQuery(notificationListOptions(generalFilter));
    await cache.fetchQuery(notificationCountOptions(mentionsFilter));
    await cache.fetchQuery(notificationCountOptions(generalFilter));
    expect(fx.api.mock.calls.map(args => args[1])).toEqual([
      "/api/notifications?type=mentioned", "/api/notifications?exclude=mentioned",
      "/api/notifications/unread-count?type=mentioned", "/api/notifications/unread-count?exclude=mentioned",
    ]);
    expect(cache.getQueryData(notificationListKey(mentionsFilter))).toEqual(rows.slice(0, 2));
    expect(cache.getQueryData(notificationListKey(generalFilter))).toEqual([general]);
    expect(notificationCountOptions(mentionsFilter)).toMatchObject({ queryKey: mentionsCountKey, staleTime: 50_000, refetchInterval: 60_000 });
  });
  it("updates the actual sidebar, header, page and cached rows on success without waiting for refetch", async () => {
    const cache = client(); seed(cache);
    const { loc } = mount(<><SidebarProvider><AppSidebar userRole="mapping" /></SidebarProvider><MentionsDropdown /><MentionsPage /></>, cache);
    await screen.findByTestId("badge-mentions-sidebar");
    expect(screen.getByTestId("badge-mentions-header").textContent).toBe("1");
    expect(screen.getByTestId("badge-mentions-page").textContent).toBe("1");
    pauseGets = true;
    await userEvent.click(screen.getByTestId("mention-row-m1"));
    await waitFor(() => expect(loc.history.at(-1)).toBe("/dashboard/tickets/ticket-m1"));
    for (const surface of ["sidebar", "header", "page"]) expect(screen.queryByTestId(`badge-mentions-${surface}`)).toBeNull();
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(true);
    expect(cache.getQueryData(notificationCountKey(generalFilter))).toEqual({ count: 1 });
    await userEvent.click(screen.getByTestId("mention-row-m1"));
    expect(fx.api.mock.calls.filter(args => args[0] === "PATCH")).toHaveLength(1);
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 0 });
  });
  it("dropdown opens only unread mentions and reads/navigates to a ticket without comment links", async () => {
    const { loc } = mount(<MentionsDropdown />);
    await screen.findByTestId("badge-mentions-header");
    await userEvent.click(screen.getByRole("button", { name: "Mentions, 1 unread" }));
    expect(screen.getByTestId("mention-row-m1").tagName).toBe("BUTTON");
    expect(screen.queryByText("Mention old")).toBeNull();
    expect(screen.queryByText("Assigned general")).toBeNull();
    expect(screen.getByTestId("link-view-all-mentions").getAttribute("href")).toBe("/dashboard/mentions");
    expect(screen.queryByTestId("button-mark-all-read")).toBeNull();
    expect(screen.getByRole("dialog").className).toContain("w-80");
    expect(screen.getByRole("dialog").className).toContain("p-0");
    expect(screen.getByTestId("button-mentions").className).toContain("h-9");
    await userEvent.click(screen.getByTestId("mention-row-m1"));
    await waitFor(() => expect(loc.history.at(-1)).toBe("/dashboard/tickets/ticket-m1"));
  });
  it("failed reads leave counts and rows unchanged, show an error and do not navigate", async () => {
    const cache = client(); seed(cache);
    const { loc } = mount(<><MentionsDropdown /><MentionsPage /></>, cache);
    fx.api.mockRejectedValue(new Error("write failed"));
    await userEvent.click(screen.getByTestId("mention-row-m1"));
    expect((await screen.findAllByRole("alert")).some(node => node.textContent?.includes("Could not mark"))).toBe(true);
    expect(loc.history).toEqual(["/dashboard/mentions"]);
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 1 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(false);
  });
  it("already-read rows check access and navigate without a write or decrement", async () => {
    const { loc } = mount(<MentionRow notification={mention("read", true)} />);
    await userEvent.click(screen.getByRole("button"));
    expect(loc.history.at(-1)).toBe("/dashboard/tickets/ticket-read");
    expect(fx.api.mock.calls.map(args => args.slice(0, 2))).toEqual([["GET", "/api/tickets/ticket-read/details"]]);
  });
  it("coalesces simultaneous reads and does not double-decrement when a stale row is clicked again", async () => {
    const cache = client(); seed(cache, 5);
    let resolve!: () => void;
    fx.api.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const first = markNotificationRead(cache, "m1");
    const second = markNotificationRead(cache, "m1");
    expect(first).toBe(second);
    resolve(); await first;
    await markNotificationRead(cache, "m1");
    expect(fx.api).toHaveBeenCalledTimes(1);
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 4 });
  });
  it("cancels pre-write list/count responses so they cannot restore stale unread state", async () => {
    const cache = client(); seed(cache);
    const signals: AbortSignal[] = [];
    const pendingFetch = ({ signal }: { signal: AbortSignal }) => {
      signals.push(signal); return new Promise<never>(() => {});
    };
    void cache.fetchQuery({ queryKey: mentionsCountKey, queryFn: pendingFetch }).catch(() => {});
    void cache.fetchQuery({ queryKey: notificationListKey(mentionsFilter), queryFn: pendingFetch }).catch(() => {});
    await markNotificationRead(cache, "m1");
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 0 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(true);
  });
  it.each(["bell", "page"])("global read-all from the general %s clears unseen cached mentions immediately", async surface => {
    const cache = client(); seed(cache, 3);
    mount(<><MentionsDropdown />{surface === "bell" ? <NotificationsDropdown /> : <NotificationsPage />}</>, cache);
    if (surface === "bell") await userEvent.click(screen.getByTestId("button-notifications"));
    await screen.findByText("Assigned general");
    expect(screen.queryByText("Mention m1")).toBeNull();
    pauseGets = true;
    await userEvent.click(screen.getByTestId("button-mark-all-read"));
    await waitFor(() => expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 0 }));
    expect(screen.queryByTestId("badge-mentions-header")).toBeNull();
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.every(row => row.isRead)).toBe(true);
    expect(cache.getQueryData(notificationCountKey(generalFilter))).toEqual({ count: 0 });
    expect(fx.api.mock.calls.some(args => args[0] === "POST" && args[1] === "/api/notifications/read-all")).toBe(true);
  });
  it("failed global reads cannot report cache success", async () => {
    const cache = client(); seed(cache, 3);
    fx.api.mockRejectedValue(new Error("read-all failed"));
    await expect(markAllNotificationsRead(cache)).rejects.toThrow("read-all failed");
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 3 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(false);
  });
  it.each([0, 100])("all badges hide at zero and cap 100 as 99+ (count=%s)", async count => {
    const cache = client(); seed(cache, count);
    mount(<><SidebarProvider><AppSidebar userRole="mapping" /></SidebarProvider><MentionsDropdown /><MentionsPage /></>, cache);
    for (const surface of ["sidebar", "header", "page"]) {
      const badge = screen.queryByTestId(`badge-mentions-${surface}`);
      expect(badge?.textContent ?? null).toBe(count === 0 ? null : "99+");
    }
    expect(screen.getByTestId("button-mentions").getAttribute("aria-label")).toBe(`Mentions, ${count} unread`);
    expect(cache.getQueryCache().findAll({ queryKey: mentionsCountKey, exact: true })).toHaveLength(1);
  });
  it("bell count comes from its non-mention count endpoint, not the visible list's priority counts", async () => {
    const cache = client(); seed(cache);
    cache.setQueryData(notificationCountKey(generalFilter), { count: 120 });
    mount(<NotificationsDropdown />, cache);
    expect(screen.getByTestId("badge-unread-count").textContent).toBe("99+");
    await userEvent.click(screen.getByTestId("button-notifications"));
    expect(screen.queryByText("Mention m1")).toBeNull();
  });
  it.each(["en", "es"])("renders translated empty, loading, error, accessible count and footer in %s", async language => {
    await i18n.changeLanguage(language);
    rows = [];
    mount(<><MentionsDropdown /><MentionsPage /></>);
    await screen.findByText(language === "es" ? "Aún no hay menciones." : "No mentions yet.");
    const trigger = screen.getByTestId("button-mentions");
    expect(trigger.getAttribute("aria-label")).toBe(language === "es" ? "Menciones, 0 sin leer" : "Mentions, 0 unread");
    await userEvent.click(trigger);
    expect(screen.getByText(language === "es" ? "No hay menciones sin leer." : "No unread mentions.")).toBeTruthy();
    expect(screen.getByTestId("link-view-all-mentions").textContent).toContain(language === "es" ? "Ver todas las menciones" : "View all mentions");
    expect(screen.queryByTestId("button-mark-all-read")).toBeNull();
    expect(screen.queryByText(/^mentions\.[a-zA-Z]/)).toBeNull();
    for (const key of ["loading", "loadFailed", "readFailed", "countFailed", "unread", "type"]) {
      expect(i18n.exists(`mentions.${key}`, { lng: language })).toBe(true);
    }
  });
  it("sorts newest first and exposes an unread indicator with translated relative time", async () => {
    await i18n.changeLanguage("es");
    rows = [{ ...mention("earlier"), createdAt: "2026-10-01T00:00:00Z" }, mention("latest")];
    mount(<MentionsPage />);
    const rendered = await screen.findAllByTestId(/^mention-row-/);
    expect(rendered.map(node => node.dataset.testid)).toEqual(["mention-row-latest", "mention-row-earlier"]);
    expect(within(rendered[0]).getByLabelText("Sin leer")).toBeTruthy();
    expect(rendered[0].querySelector("time")?.textContent).toContain("hace");
  });
  it("supports keyboard activation through a native button", async () => {
    const user = userEvent.setup();
    const { loc } = mount(<MentionRow notification={mention("read", true)} />);
    await user.tab(); await user.keyboard("{Enter}");
    expect(loc.history.at(-1)).toBe("/dashboard/tickets/ticket-read");
  });
  it("renders list loading and failures explicitly instead of empty success", async () => {
    fx.api.mockImplementation(() => new Promise(() => {}));
    const { cache } = mount(<MentionsPage />);
    expect(screen.getByText("Loading mentions...")).toBeTruthy();
    await act(async () => {
      await cache.cancelQueries();
      fx.api.mockRejectedValue(new Error("offline"));
      await cache.invalidateQueries();
    });
    expect((await screen.findAllByRole("alert")).map(node => node.textContent)).toContain("Could not load mentions.");
    expect(screen.queryByText("No mentions yet.")).toBeNull();
  });
});

// Exercise ProtectedRoute with the actual, unchanged App.tsx ticket predicate,
// not a permissive memory-router destination that masks the mapping boundary.
const app = readFileSync("src/App.tsx", "utf8");
const fieldRoles = JSON.parse(/const allFieldRoles = (\[[^\]]+\])/.exec(app)![1]);
const ticketDeclaration = /<ProtectedRoute\s+path="\/dashboard\/tickets\/:id"[\s\S]*?\/>/.exec(app)![0];
const ticketExpression = /access=\{\(viewer\) => (.*?)\}/.exec(ticketDeclaration)![1];
const ticketAccess = (viewer: { activeRole: NavRole; activeTags?: string[]; isSuperAdminBool?: boolean }) => new Function("viewer", "canViewBilling", "allFieldRoles",
  `return ${ticketExpression.replace(/ as typeof allFieldRoles\[number\]/g, "")}`)(viewer, canViewBilling, fieldRoles);
function TicketDestination() { return <p>Ticket destination</p>; }
function MentionRoutes({ dropdown }: { dropdown: boolean }) {
  return <>
    {dropdown && <MentionsDropdown />}
    <Switch>
      <ProtectedRoute path="/dashboard/mentions" component={MentionsPage} />
      <ProtectedRoute path="/dashboard/tickets/:id" component={TicketDestination} access={ticketAccess} />
      <Route path="/access-denied"><p>Raw access denied screen</p></Route>
    </Switch>
  </>;
}
describe("mention clicks across unchanged route and API permissions", () => {
  it.each(["page", "dropdown"])("ordinary mapping reads a mention in the %s without entering the denied ticket route", async surface => {
    fx.user.activeRole = "mapping";
    expect(ticketAccess(fx.user)).toBe(false);
    const cache = client(); seed(cache);
    const { loc } = mount(<MentionRoutes dropdown={surface === "dropdown"} />, cache);
    if (surface === "dropdown") await userEvent.click(screen.getByTestId("button-mentions"));
    const target = surface === "dropdown" ? within(screen.getByRole("dialog")) : screen;
    await userEvent.click(target.getByTestId("mention-row-m1"));
    await waitFor(() => expect(target.getByRole("alert").textContent).toBe("You don’t have access to this ticket. The mention has been marked as read."));
    expect(loc.history).toEqual(["/dashboard/mentions"]);
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 0 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(true);
    expect(fx.api.mock.calls.some(args => args[0] === "PATCH")).toBe(true);
    expect(fx.api.mock.calls.some(args => String(args[1]).includes("/api/tickets/"))).toBe(false);
    expect(screen.queryByText("Raw access denied screen")).toBeNull();
    expect(screen.queryByText("Ticket destination")).toBeNull();
    if (surface === "dropdown") expect(target.queryByTestId("mention-row-m1")).toBeNull();
    // Confirm that direct navigation is STILL denied by the unchanged route.
    await act(async () => { loc.navigate("/dashboard/tickets/ticket-m1"); });
    await screen.findByText("Raw access denied screen");
  });
  it.each(["field_manager", "chemical_manager", "irrigation_manager", "crew_supervisor"] as NavRole[])(
    "%s can receive mentions but reads and stays on Mentions when the details API denies an unassigned ticket", async role => {
      fx.user.activeRole = role; fx.detailsError = "403: Access denied";
      expect(ticketAccess(fx.user)).toBe(true);
      const cache = client(); seed(cache);
      const { loc } = mount(<MentionRoutes dropdown={false} />, cache);
      await userEvent.click(screen.getByTestId("mention-row-m1"));
      expect((await screen.findByRole("alert")).textContent).toContain("You don’t have access to this ticket");
      expect(loc.history).toEqual(["/dashboard/mentions"]);
      expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 0 });
      expect(fx.api.mock.calls.some(args => args[0] === "GET" && args[1] === "/api/tickets/ticket-m1/details")).toBe(true);
      expect(screen.queryByText("Raw access denied screen")).toBeNull();
      expect(screen.queryByText("Ticket destination")).toBeNull();
    },
  );
  it("keeps the dropdown's denial message visible after the read crew-supervisor row disappears", async () => {
    fx.user.activeRole = "crew_supervisor"; fx.detailsError = "403: Access denied";
    await i18n.changeLanguage("es");
    const { loc, cache } = mount(<MentionsDropdown />);
    await screen.findByTestId("badge-mentions-header");
    await userEvent.click(screen.getByTestId("button-mentions"));
    await userEvent.click(screen.getByTestId("mention-row-m1"));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes acceso a este ticket. La mención se ha marcado como leída.");
    expect(screen.queryByTestId("mention-row-m1")).toBeNull();
    expect(cache.getQueryData(mentionsCountKey)).toEqual({ count: 0 });
    expect(loc.history).toEqual(["/dashboard/mentions"]);
  });
  it.each(["billing", "super-admin", "assigned-crew"])("preserves existing %s access and opens an authorized ticket", async exception => {
    fx.user.activeRole = exception === "assigned-crew" ? "crew_supervisor" : "mapping";
    fx.user.activeTags = exception === "billing" ? ["billing"] : [];
    fx.user.isSuperAdminBool = exception === "super-admin";
    const { loc } = mount(<MentionRoutes dropdown={false} />);
    await userEvent.click(await screen.findByTestId("mention-row-m1"));
    await screen.findByText("Ticket destination");
    expect(loc.history.at(-1)).toBe("/dashboard/tickets/ticket-m1");
  });
  it.each(["404: Ticket not found", "500: unavailable"])("handles %s without a raw error screen or dead row", async error => {
    fx.detailsError = error;
    const { loc } = mount(<MentionRoutes dropdown={false} />);
    await userEvent.click(await screen.findByTestId("mention-row-m1"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(error.startsWith("404") ? "no longer available" : "Could not open this ticket");
    expect(loc.history).toEqual(["/dashboard/mentions"]);
    expect(rows.find(row => row.id === "m1")?.isRead).toBe(true);
  });
});
