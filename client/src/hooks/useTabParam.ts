import { useLocation, useSearch } from "wouter";

export function useTabParam(defaultTab = "overview"): [string, (tab: string) => void] {
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const searchStr = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(searchStr);
  const activeTab = params.get("tab") || defaultTab;

  const setActiveTab = (tab: string) => {
    const newParams = new URLSearchParams(searchStr);
    newParams.set("tab", tab);
    setLocation(`${location}?${newParams.toString()}`);
  };

  return [activeTab, setActiveTab];
}
