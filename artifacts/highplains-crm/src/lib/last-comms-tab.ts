const STORAGE_KEY = "communications:lastTab";
const VALID_TABS = ["inbox", "sent", "unsorted", "all"] as const;
export type CommsTab = (typeof VALID_TABS)[number];

export function isValidCommsTab(t: string | undefined | null): t is CommsTab {
  return !!t && (VALID_TABS as readonly string[]).includes(t);
}

export function getLastCommsTab(): CommsTab {
  if (typeof window === "undefined") return "inbox";
  try {
    const v = window.sessionStorage.getItem(STORAGE_KEY);
    return isValidCommsTab(v) ? v : "inbox";
  } catch {
    return "inbox";
  }
}

export function setLastCommsTab(tab: CommsTab): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, tab);
    window.dispatchEvent(new CustomEvent("communications:lastTab-changed", { detail: tab }));
  } catch {
    /* ignore */
  }
}

export function commsTabHref(tab: CommsTab): string {
  return `/dashboard/communications/${tab}`;
}
