// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/i18n";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/lib/protected-route";
import { canViewBilling } from "@/lib/billing";
import type { NavRole } from "@/components/nav/navConfig";
import {
  generalFilter, mentionsFilter, mentionsCountKey as scopedMentionsCountKey, notificationCountKey as scopedCountKey, notificationCountOptions as scopedCountOptions,
  notificationListKey as scopedListKey, notificationListOptions as scopedListOptions, markNotificationRead as scopedMarkRead, markAllNotificationsRead as scopedMarkAllRead, type Notification, type NotificationFilter,
} from "@/lib/notifications";

const fx = vi.hoisted(() => ({
  api: vi.fn(),
  loggedIn: true,
  user: { id: "recipient", activeCompanyId: "company-1", activeRole: "admin" as NavRole, activeTags: [] as string[], isSuperAdminBool: false },
  detailsError: null as string | null,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: fx.loggedIn ? fx.user : null, isLoading: false }) }));
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
const scope = () => ({ userId: fx.user.id, companyId: fx.user.activeCompanyId, role: fx.user.activeRole });
const notificationListKey = (filter: NotificationFilter) => scopedListKey(filter, scope());
const notificationCountKey = (filter: NotificationFilter) => scopedCountKey(filter, scope());
const notificationListOptions = (filter: NotificationFilter, interval?: number) => scopedListOptions(filter, scope(), interval);
const notificationCountOptions = (filter: NotificationFilter) => scopedCountOptions(filter, scope());
const mentionsCountKey = () => scopedMentionsCountKey(scope());
const markNotificationRead = (cache: QueryClient, id: string) => scopedMarkRead(cache, id, scope());
const markAllNotificationsRead = (cache: QueryClient, filter?: NotificationFilter) => scopedMarkAllRead(cache, scope(), filter);
beforeEach(async () => {
  await i18n.changeLanguage("en");
  fx.loggedIn = true;
  fx.user = { id: "recipient", activeCompanyId: "company-1", activeRole: "admin", activeTags: [], isSuperAdminBool: false };
  fx.detailsError = null;
  rows = [mention(), mention("old", true), general]; pauseGets = false;
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  fx.api.mockImplementation(async (method: string, url: string) => {
    const parsed = new URL(url, "http://localhost");
    const matches = (row: Notification) => parsed.searchParams.has("type")
      ? row.type === parsed.searchParams.get("type")
      : !parsed.searchParams.has("exclude") || row.type !== parsed.searchParams.get("exclude");
    if (method === "GET") {
      if (/\/api\/tickets\/[^/]+\/details$/.test(url)) {
        if (fx.detailsError) throw new Error(fx.detailsError);
        return { json: async () => ({ ticket: { id: "ticket-m1", assignedToId: fx.user.id } }) };
      }
      if (pauseGets) return new Promise(() => {});
      const filtered = rows.filter(matches);
      return { json: async () => structuredClone(parsed.pathname.endsWith("unread-count") ? { count: filtered.filter(row => !row.isRead).length } : filtered) };
    }
    if (parsed.pathname.endsWith("read-all")) rows = rows.map(row => matches(row) ? { ...row, isRead: true } : row);
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
  cache.setQueryData(mentionsCountKey(), { count });
  cache.setQueryData(notificationCountKey(generalFilter), { count: 1 });
}

describe("dedicated Mentions surfaces", () => {
  it.each(["company", "user", "role", "logout-login"] as const)("never shows previous messages or counts across a %s change while requests wait", async change => {
    const cache = client();
    seed(cache);
    const loc = memoryLocation({ path: "/dashboard/mentions" });
    const tree = () => <QueryClientProvider client={cache}><Router hook={loc.hook}>
      <TooltipProvider><MentionsPage /><NotificationsPage /><MentionsDropdown /><NotificationsDropdown /></TooltipProvider>
    </Router></QueryClientProvider>;
    const view = render(tree());
    await screen.findByText("Mention m1");
    expect(screen.getByTestId("badge-mentions-header").textContent).toBe("1");
    expect(screen.getByTestId("badge-unread-count").textContent).toBe("1");
    const oldScope = scope();
    pauseGets = true;
    if (change === "company") fx.user = { ...fx.user, activeCompanyId: "company-2" };
    if (change === "user") fx.user = { ...fx.user, id: "other-user" };
    if (change === "role") fx.user = { ...fx.user, activeRole: "office" };
    if (change === "logout-login") fx.loggedIn = false;
    view.rerender(tree());
    const assertNoOldData = () => {
      expect(screen.queryByText("Mention m1")).toBeNull();
      expect(screen.queryByText(general.message)).toBeNull();
      expect(screen.queryByTestId("badge-mentions-page")).toBeNull();
      expect(screen.queryByTestId("badge-mentions-header")).toBeNull();
      expect(screen.queryByTestId("badge-unread-count")).toBeNull();
    };
    assertNoOldData();
    if (change === "logout-login") {
      const requests = fx.api.mock.calls.length;
      await act(async () => {});
      expect(fx.api.mock.calls).toHaveLength(requests);
      fx.user = { ...fx.user, id: "next-login" };
      fx.loggedIn = true;
      view.rerender(tree());
      assertNoOldData();
    }
    // Old cache is still populated: isolation, not clearing it or waiting for refetch, protects the new view.
    expect(cache.getQueryData<Notification[]>(scopedListKey(mentionsFilter, oldScope))?.[0].message).toBe("Mention m1");
  });
  it.each(["one", "all"] as const)("restricts %s read mutation cache updates to the initiating scope", async operation => {
    const cache = client();
    seed(cache, 3);
    const oldScope = scope();
    const request = operation === "one" ? scopedMarkRead(cache, "m1", oldScope) : scopedMarkAllRead(cache, oldScope);
    fx.user = { ...fx.user, activeCompanyId: "company-2" };
    rows = [mention(), mention("old", true), general];
    seed(cache, 9);
    await request;
    expect(cache.getQueryData<Notification[]>(scopedListKey(mentionsFilter, oldScope))?.[0].isRead).toBe(true);
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(false);
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 9 });
    expect(fx.api.mock.calls[0][3]?.headers).toEqual({ "X-Company-Id": oldScope.companyId });
  });
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
    expect(notificationCountOptions(mentionsFilter)).toMatchObject({ queryKey: mentionsCountKey(), staleTime: 50_000, refetchInterval: 60_000 });
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
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 0 });
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
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 1 });
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
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 4 });
  });
  it("cancels pre-write list/count responses so they cannot restore stale unread state", async () => {
    const cache = client(); seed(cache);
    const signals: AbortSignal[] = [];
    const pendingFetch = ({ signal }: { signal: AbortSignal }) => {
      signals.push(signal); return new Promise<never>(() => {});
    };
    void cache.fetchQuery({ queryKey: mentionsCountKey(), queryFn: pendingFetch }).catch(() => {});
    void cache.fetchQuery({ queryKey: notificationListKey(mentionsFilter), queryFn: pendingFetch }).catch(() => {});
    await markNotificationRead(cache, "m1");
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 0 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(true);
  });
  it.each(["bell", "page"])("scoped read-all from the general %s preserves mention badges and rows with refetch pending", async surface => {
    rows = [mention(), mention("m2"), mention("m3"), general];
    const cache = client(); seed(cache, 3);
    const mentionRows = cache.getQueryData(notificationListKey(mentionsFilter));
    const mentionCount = cache.getQueryData(mentionsCountKey());
    mount(<><SidebarProvider><AppSidebar userRole="mapping" /></SidebarProvider><MentionsDropdown /><MentionsPage />
      {surface === "bell" ? <NotificationsDropdown /> : <NotificationsPage />}</>, cache);
    if (surface === "bell") await userEvent.click(screen.getByTestId("button-notifications"));
    await screen.findByText("Assigned general");
    expect(screen.getByTestId("badge-mentions-header").textContent).toBe("3");
    pauseGets = true;
    await userEvent.click(screen.getByTestId("button-mark-all-read"));
    await waitFor(() => expect(cache.getQueryData(notificationCountKey(generalFilter))).toEqual({ count: 0 }));
    for (const surface of ["sidebar", "header", "page"]) expect(screen.getByTestId(`badge-mentions-${surface}`).textContent).toBe("3");
    expect(screen.getByTestId("mention-row-m1").textContent).toContain("Mention m1");
    expect(within(screen.getByTestId("mention-row-m1")).getByLabelText("Unread")).toBeTruthy();
    expect(cache.getQueryData(notificationListKey(mentionsFilter))).toBe(mentionRows);
    expect(cache.getQueryData(mentionsCountKey())).toBe(mentionCount);
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.every(row => !row.isRead)).toBe(true);
    expect(cache.getQueryData<Notification[]>(notificationListKey(generalFilter))?.every(row => row.isRead)).toBe(true);
    expect(cache.getQueryData(notificationCountKey(generalFilter))).toEqual({ count: 0 });
    expect(rows.filter(row => row.type === "mentioned" && !row.isRead)).toHaveLength(3);
    expect(fx.api.mock.calls.some(args => args[0] === "POST" && args[1] === "/api/notifications/read-all?exclude=mentioned")).toBe(true);
    process.stdout.write(`Disposable rendered ${surface} clear: unread mentions 3 -> 3; general 1 -> 0; refetch held pending\n`);
  });
  it.each([undefined, mentionsFilter, generalFilter])("failed read-all (%j) cannot report cache success", async filter => {
    const cache = client(); seed(cache, 3);
    const snapshot = cache.getQueriesData({});
    fx.api.mockRejectedValue(new Error("read-all failed"));
    await expect(markAllNotificationsRead(cache, filter)).rejects.toThrow("read-all failed");
    expect(cache.getQueriesData({})).toEqual(snapshot);
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 3 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(false);
  });
  it.each([undefined, mentionsFilter, generalFilter])("read-all (%j) patches only wholly covered lists/counts and preserves mixed data", async filter => {
    const cache = client(); seed(cache, 7);
    const allList = scopedListKey(mentionsFilter, scope()).slice(0, 4);
    const allCount = scopedCountKey(mentionsFilter, scope()).slice(0, 4);
    cache.setQueryData(allList, rows);
    cache.setQueryData(allCount, { count: 99 });
    const keys = [notificationListKey(mentionsFilter), notificationListKey(generalFilter), allList,
      mentionsCountKey(), notificationCountKey(generalFilter), allCount];
    const before = keys.map(key => cache.getQueryData(key));
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const cancel = vi.spyOn(cache, "cancelQueries");
    pauseGets = true;
    const mixedList = new QueryObserver(cache, {
      queryKey: allList, queryFn: async () => (await fx.api("GET", "/api/notifications")).json(),
    });
    const mixedCount = new QueryObserver(cache, {
      queryKey: allCount, queryFn: async () => (await fx.api("GET", "/api/notifications/unread-count")).json(),
    });
    const unsubscribers = [mixedList.subscribe(() => {}), mixedCount.subscribe(() => {})];
    await markAllNotificationsRead(cache, filter);
    expect(fx.api.mock.calls.find(args => args[0] === "POST")?.[1]).toBe(`/api/notifications/read-all${filter ? `?${new URLSearchParams(filter)}` : ""}`);
    expect(cache.getQueryState(allList)?.fetchStatus).toBe("fetching");
    expect(cache.getQueryState(allCount)?.fetchStatus).toBe("fetching");
    for (const [index, key] of keys.entries()) {
      const covered = !filter || (index % 3 === (filter === mentionsFilter ? 0 : 1));
      if (!covered) expect(cache.getQueryData(key)).toBe(before[index]);
      else if (index < 3) expect(cache.getQueryData<Notification[]>(key)?.every(row => row.isRead)).toBe(true);
      else expect(cache.getQueryData(key)).toEqual({ count: 0 });
    }
    expect(rows.filter(row => !row.isRead).map(row => row.id)).toEqual(
      !filter ? [] : filter === mentionsFilter ? ["g1"] : ["m1"]);
    for (const root of ["/api/notifications", "/api/notifications/unread-count"]) {
      const prefix = { queryKey: [root, scope().userId, scope().companyId, scope().role] };
      expect(cancel).toHaveBeenCalledWith(prefix);
      expect(invalidate).toHaveBeenCalledWith(prefix);
    }
    // The mixed cache becomes accurate only when its normal fetch reconciles it.
    unsubscribers.forEach(unsubscribe => unsubscribe());
    await cache.cancelQueries({ queryKey: allList });
    await cache.cancelQueries({ queryKey: allCount });
    if (filter) {
      pauseGets = false;
      await cache.fetchQuery({ queryKey: allList, queryFn: async () => (await fx.api("GET", "/api/notifications")).json() });
      await cache.fetchQuery({ queryKey: allCount, queryFn: async () => (await fx.api("GET", "/api/notifications/unread-count")).json() });
      expect(cache.getQueryData(allList)).toEqual(rows);
      expect(cache.getQueryData(allCount)).toEqual({ count: 1 });
    }
  });
  it("filtered read-all aborts pre-write responses before patching and refetching both roots", async () => {
    const cache = client(); seed(cache);
    const signals: AbortSignal[] = [];
    const pendingFetch = ({ signal }: { signal: AbortSignal }) => {
      signals.push(signal); return new Promise<never>(() => {});
    };
    for (const filter of [mentionsFilter, generalFilter]) {
      void cache.fetchQuery({ queryKey: notificationListKey(filter), queryFn: pendingFetch }).catch(() => {});
      void cache.fetchQuery({ queryKey: notificationCountKey(filter), queryFn: pendingFetch }).catch(() => {});
    }
    await markAllNotificationsRead(cache, generalFilter);
    expect(signals).toHaveLength(4);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 1 });
    expect(cache.getQueryData(notificationCountKey(generalFilter))).toEqual({ count: 0 });
    expect(cache.getQueryData<Notification[]>(notificationListKey(mentionsFilter))?.[0].isRead).toBe(false);
  });
  it.each(["user", "company", "role"] as const)("filtered read-all stays in its initiating %s scope after a switch", async change => {
    const cache = client(); seed(cache, 4);
    const initiating = scope();
    let resolve!: () => void;
    fx.api.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const request = scopedMarkAllRead(cache, initiating, generalFilter);
    if (change === "user") fx.user.id = "other-user";
    if (change === "company") fx.user.activeCompanyId = "other-company";
    if (change === "role") fx.user.activeRole = "office";
    seed(cache, 9);
    const snapshot = cache.getQueryData(notificationListKey(generalFilter));
    resolve(); await request;
    expect(cache.getQueryData(notificationListKey(generalFilter))).toBe(snapshot);
    expect(cache.getQueryData(notificationCountKey(generalFilter))).toEqual({ count: 1 });
    expect(cache.getQueryData(scopedCountKey(generalFilter, initiating))).toEqual({ count: 0 });
    expect(cache.getQueryData(scopedMentionsCountKey(initiating))).toEqual({ count: 4 });
    expect(fx.api.mock.calls[0][3]?.headers).toEqual({ "X-Company-Id": initiating.companyId });
  });
  it.each([0, 100])("all badges hide at zero and cap 100 as 99+ (count=%s)", async count => {
    const cache = client(); seed(cache, count);
    mount(<><SidebarProvider><AppSidebar userRole="mapping" /></SidebarProvider><MentionsDropdown /><MentionsPage /></>, cache);
    for (const surface of ["sidebar", "header", "page"]) {
      const badge = screen.queryByTestId(`badge-mentions-${surface}`);
      expect(badge?.textContent ?? null).toBe(count === 0 ? null : "99+");
    }
    expect(screen.getByTestId("button-mentions").getAttribute("aria-label")).toBe(`Mentions, ${count} unread`);
    expect(cache.getQueryCache().findAll({ queryKey: mentionsCountKey(), exact: true })).toHaveLength(1);
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
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 0 });
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
      expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 0 });
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
    expect(cache.getQueryData(mentionsCountKey())).toEqual({ count: 0 });
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
