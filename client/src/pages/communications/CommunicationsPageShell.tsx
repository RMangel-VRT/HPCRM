import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useSearch, useLocation } from "wouter";

interface CommunicationsShellState {
  search: string;
  fromDate: string;
  toDate: string;
  viewAs: string;
  setSearch: (v: string) => void;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  setViewAs: (v: string) => void;
}

const CommunicationsShellContext = createContext<CommunicationsShellState | null>(null);

export function useCommunicationsShell(): CommunicationsShellState {
  const ctx = useContext(CommunicationsShellContext);
  if (!ctx) throw new Error("useCommunicationsShell must be used within CommunicationsPageShell");
  return ctx;
}

interface CommunicationsPageShellProps {
  children: React.ReactNode;
}

export function CommunicationsPageShell({ children }: CommunicationsPageShellProps) {
  const searchString = useSearch();
  const [, navigate] = useLocation();

  function getParam(key: string): string {
    return new URLSearchParams(searchString).get(key) ?? "";
  }

  const [search, setSearchState] = useState(() => getParam("q"));
  const [fromDate, setFromDateState] = useState(() => getParam("from"));
  const [toDate, setToDateState] = useState(() => getParam("to"));
  const [viewAs, setViewAsState] = useState(() => getParam("viewAs"));

  useEffect(() => {
    const p = new URLSearchParams(searchString);
    setSearchState(p.get("q") ?? "");
    setFromDateState(p.get("from") ?? "");
    setToDateState(p.get("to") ?? "");
    setViewAsState(p.get("viewAs") ?? "");
  }, [searchString]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(window.location.search);
      if (value) {
        p.set(key, value);
      } else {
        p.delete(key);
      }
      const newSearch = p.toString();
      const path = window.location.pathname;
      navigate(path + (newSearch ? `?${newSearch}` : ""), { replace: true });
    },
    [navigate]
  );

  const setSearch = useCallback((v: string) => { setSearchState(v); updateParam("q", v); }, [updateParam]);
  const setFromDate = useCallback((v: string) => { setFromDateState(v); updateParam("from", v); }, [updateParam]);
  const setToDate = useCallback((v: string) => { setToDateState(v); updateParam("to", v); }, [updateParam]);
  const setViewAs = useCallback((v: string) => { setViewAsState(v); updateParam("viewAs", v); }, [updateParam]);

  return (
    <CommunicationsShellContext.Provider value={{ search, fromDate, toDate, viewAs, setSearch, setFromDate, setToDate, setViewAs }}>
      {children}
    </CommunicationsShellContext.Provider>
  );
}
