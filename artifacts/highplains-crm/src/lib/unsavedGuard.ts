// Tiny store so the sidebar (outside the page) can ask the page to confirm leaving with unsaved edits.
type Listener = () => void;
let dirty = false;
let pendingHref: string | null = null;
let pendingHistory = false;
let protectedHistoryHref: string | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l());

export const unsavedGuard = {
  isDirty: () => dirty,
  setDirty(value: boolean, options?: { protectHistory: boolean }) {
    if (options?.protectHistory && value && !protectedHistoryHref) protectedHistoryHref = window.location.href;
    if (!value) { protectedHistoryHref = null; pendingHistory = false; }
    if (dirty !== value) { dirty = value; if (!value) pendingHref = null; emit(); }
  },
  getPending: () => pendingHref,
  isHistoryPending: () => pendingHistory,
  requestLeave(href: string) { pendingHistory = false; pendingHref = href; emit(); },
  clearPending() { if (pendingHref !== null) { pendingHref = null; pendingHistory = false; emit(); } },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

// Install once, before mounted router subscribers. A page-owned listener can be
// removed by a synchronous route commit while the same popstate is dispatching.
// History protection is opt-in; existing other form guards keep their behavior.
function protectHistoryNavigation() {
  if (!dirty || !protectedHistoryHref) return;
  const target = new URL(window.location.href);
  const editor = new URL(protectedHistoryHref);
  if (target.pathname === editor.pathname && target.search === editor.search) return;
  window.history.pushState(window.history.state, "", protectedHistoryHref);
  pendingHistory = true;
  pendingHref = hrefToPath(target.pathname + target.search + target.hash);
  emit();
}
if (typeof window !== "undefined") {
  window.addEventListener("popstate", protectHistoryNavigation, true);
  import.meta.hot?.dispose(() => window.removeEventListener("popstate", protectHistoryNavigation, true));
}

/** Strip the router base so the value can be passed to wouter's navigate. */
export function hrefToPath(href: string): string {
  const base = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/").replace(/\/$/, "");
  return base && href.startsWith(base) ? href.slice(base.length) || "/" : href;
}

/** Capture-phase click handler: stops any same-origin in-app link navigation while edits are unsaved. */
export function guardLinkClick(e: { target: EventTarget | null; button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault(): void; stopPropagation(): void }) {
  if (!dirty || e.button) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  const el = (e.target as HTMLElement | null)?.closest?.("a[href]");
  const href = el?.getAttribute("href");
  if (!el || !href || href.startsWith("#") || el.hasAttribute("download") || (el.getAttribute("target") ?? "_self") !== "_self") return;
  let path = href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    try {
      const u = new URL(href, window.location.href);
      if (u.origin !== window.location.origin) return;
      path = u.pathname + u.search;
    } catch { return; }
  }
  e.preventDefault();
  e.stopPropagation();
  unsavedGuard.requestLeave(hrefToPath(path));
}
