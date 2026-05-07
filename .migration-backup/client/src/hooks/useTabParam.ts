import { useLocation, useSearch } from "wouter";

/**
 * Syncs a "tab" query parameter with the URL so that tab selection is
 * reflected in the address bar and survives page refresh / deep-linking.
 *
 * Param-preservation guarantee
 * ─────────────────────────────
 * When setActiveTab is called it reads the *full* current search string into
 * URLSearchParams first, then only overwrites the "tab" key.  Every other
 * query param present at that moment (e.g. ?id=, ?modal=, ?filter=…) is
 * therefore carried forward unchanged.  New URL-driven features can freely
 * add their own params without any risk of them being dropped on a tab switch.
 */
export function useTabParam(defaultTab = "overview"): [string, (tab: string) => void] {
  const [location, setLocation] = useLocation();
  const search = useSearch();

  // Normalise: wouter may return the string with or without the leading "?"
  const searchStr = search.startsWith("?") ? search.slice(1) : search;

  // Read active tab from the URL, falling back to the caller-supplied default
  const params = new URLSearchParams(searchStr);
  const activeTab = params.get("tab") || defaultTab;

  const setActiveTab = (tab: string) => {
    // Build from the full current search string so all non-tab params are kept
    const newParams = new URLSearchParams(searchStr);
    newParams.set("tab", tab);
    setLocation(`${location}?${newParams.toString()}`);
  };

  return [activeTab, setActiveTab];
}
