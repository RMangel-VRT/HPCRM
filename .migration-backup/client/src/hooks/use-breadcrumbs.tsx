import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsContextType {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbsContext = createContext<BreadcrumbsContextType | null>(null);

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);

  return (
    <BreadcrumbsContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbsContext.Provider>
  );
}

const NOOP_CONTEXT: BreadcrumbsContextType = { items: [], setItems: () => {} };

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbsContext);
  return context ?? NOOP_CONTEXT;
}

export function useSetBreadcrumbs(items: BreadcrumbItem[], deps: any[] = []) {
  const { setItems } = useBreadcrumbs();
  
  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, deps);
}
