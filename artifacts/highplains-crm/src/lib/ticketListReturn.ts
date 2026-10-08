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

// Never use an untrusted stored URL as a navigation target. Only the main list,
// with its known query fields, is a valid origin.
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
    const view = url.searchParams.get("view");
    const page = url.searchParams.get("completedPage");
    if (url.origin !== window.location.origin || url.pathname !== "/dashboard/tickets" ||
        (view !== null && !["list", "kanban-type", "kanban-user", "billing"].includes(view)) ||
        (page !== null && (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)))) ||
        [...url.searchParams.keys()].some(key => ![
          "q", "priority", "type", "workType", "status", "assignedTo",
          "actionType", "needsScheduling", "view", "completedPage",
          "openCollapsed", "completedCollapsed", "equipmentCollapsed",
        ].includes(key))) return null;
    return { ...origin, url: url.pathname + url.search };
  } catch {
    return null;
  }
}

export const RETURN_SCROLL_KEY = "ticketsList_returnScroll";