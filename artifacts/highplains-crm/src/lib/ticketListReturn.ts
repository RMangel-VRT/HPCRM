const ORIGIN_KEY = "ticketsList_ticketOrigin";
export const RETURN_MARKER = "fromTicketsList";

interface TicketOrigin {
  ticketId: string;
  url: string;
  scrollTop: number;
  savedAt: number;
}

export function saveTicketOrigin(ticketId: string) {
  const container = document.querySelector("main");
  const scrollTop = container instanceof HTMLElement ? container.scrollTop : window.scrollY;
  sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({
    ticketId,
    url: window.location.pathname + window.location.search,
    scrollTop,
    savedAt: Date.now(),
  } satisfies TicketOrigin));
}

export function ticketDetailHref(ticketId: string) {
  return `/dashboard/tickets/${ticketId}?${RETURN_MARKER}=1`;
}

const LIST_KEYS = [
  "q", "priority", "type", "workType", "status", "assignedTo",
  "actionType", "needsScheduling", "view", "completedPage",
  "openCollapsed", "completedCollapsed", "equipmentCollapsed",
];

/** Allowed origins: main Tickets list (known query fields), Billing, and My Tickets ?tab=invoice|other. */
export function isSafeOriginUrl(url: URL, siteOrigin: string): boolean {
  if (url.origin !== siteOrigin) return false;
  const keys = [...url.searchParams.keys()];
  if (url.pathname === "/dashboard/billing") return keys.length === 0;
  if (url.pathname === "/dashboard/tickets/my") {
    const tab = url.searchParams.get("tab");
    return keys.length === 1 && url.searchParams.getAll("tab").length === 1 && (tab === "invoice" || tab === "other");
  }
  if (url.pathname !== "/dashboard/tickets") return false;
  const view = url.searchParams.get("view");
  const page = url.searchParams.get("completedPage");
  return !((view !== null && !["list", "kanban-type", "kanban-user"].includes(view)) ||
    (page !== null && (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)))) ||
    keys.some(key => !LIST_KEYS.includes(key)));
}

// Never use an untrusted stored URL as a navigation target. Operational and
// billing origins each have a narrowly validated path and query allowlist.
export function consumeTicketOrigin(ticketId: string): TicketOrigin | null {
  const raw = sessionStorage.getItem(ORIGIN_KEY);
  sessionStorage.removeItem(ORIGIN_KEY);
  if (!raw) return null;
  try {
    const origin: TicketOrigin = JSON.parse(raw);
    if (origin.ticketId !== ticketId || !Number.isFinite(origin.scrollTop) ||
        origin.scrollTop < 0 || origin.scrollTop > 10000000 ||
        !Number.isFinite(origin.savedAt) || Date.now() - origin.savedAt > 5 * 60 * 1000 ||
        origin.savedAt > Date.now() ||
        typeof origin.url !== "string" || origin.url.length > 4000) return null;
    const url = new URL(origin.url, window.location.origin);
    if (!isSafeOriginUrl(url, window.location.origin)) return null;
    return { ...origin, url: url.pathname + url.search };
  } catch {
    return null;
  }
}

export const RETURN_SCROLL_KEY = "ticketsList_returnScroll";