// Tiny store so the sidebar (outside the page) can ask the page to confirm leaving with unsaved edits.
type Listener = () => void;
let dirty = false;
let pendingHref: string | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l());

export const unsavedGuard = {
  isDirty: () => dirty,
  setDirty(value: boolean) { if (dirty !== value) { dirty = value; if (!value) pendingHref = null; emit(); } },
  getPending: () => pendingHref,
  requestLeave(href: string) { pendingHref = href; emit(); },
  clearPending() { if (pendingHref !== null) { pendingHref = null; emit(); } },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};

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
