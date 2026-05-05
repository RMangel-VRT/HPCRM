import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Search, X, ChevronRight, ChevronDown, Users } from "lucide-react";
import type { Customer } from "@shared/schema";

interface CustomerSearchInputProps {
  onSelect: (customer: { id: string; name: string }) => void;
  selectedId?: string;
  selectedCustomerName?: string;
  placeholder?: string;
  testId?: string;
  excludeIds?: string[];
  mode?: "operational" | "any";
  disabled?: boolean;
}

export default function CustomerSearchInput({
  onSelect,
  selectedId,
  selectedCustomerName,
  placeholder,
  testId,
  excludeIds,
  mode = "operational",
  disabled = false,
}: CustomerSearchInputProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState(selectedCustomerName || "");
  const [results, setResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedCustomerName !== undefined) {
      setSelectedName(selectedCustomerName);
    }
  }, [selectedCustomerName]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedName("");
    }
  }, [selectedId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(search.trim())}`, { credentials: "include" });
        if (res.ok) {
          const data: Customer[] = await res.json();
          const filtered = excludeIds && excludeIds.length > 0
            ? data.filter(c => !excludeIds.includes(c.id))
            : data;
          setResults(filtered);
          setExpandedParents(new Set());
          setOpen(filtered.length > 0);
        }
      } finally {
        setIsSearching(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, excludeIds]);

  const handleSelect = (c: Customer) => {
    setSelectedName(c.name);
    setSearch("");
    setOpen(false);
    setResults([]);
    setExpandedParents(new Set());
    onSelect({ id: c.id, name: c.name });
  };

  const toggleParent = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const parents = results.filter(c => c.isParent === "true");
  const parentIds = new Set(parents.map(p => p.id));
  const parentNameMap = new Map<string, string>(parents.map(p => [p.id, p.name]));

  const childrenByParent = new Map<string, Customer[]>();
  for (const c of results) {
    if (c.parentCustomerId && parentIds.has(c.parentCustomerId)) {
      if (!childrenByParent.has(c.parentCustomerId)) {
        childrenByParent.set(c.parentCustomerId, []);
      }
      childrenByParent.get(c.parentCustomerId)!.push(c);
    }
  }

  const standalones = results.filter(c => c.isParent !== "true" && !c.parentCustomerId);
  const orphanChildren = results.filter(c => c.parentCustomerId && !parentIds.has(c.parentCustomerId));

  const displayValue = selectedId && !search ? selectedName : search;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          data-testid={testId || "input-customer-search"}
          value={displayValue}
          disabled={disabled}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value === "") setSelectedName("");
          }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder || t("common.searchCustomers", "Search customers…")}
          className="pl-8 pr-8"
        />
        {(selectedId || search) && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearch("");
              setSelectedName("");
              setResults([]);
              setOpen(false);
              setExpandedParents(new Set());
              onSelect({ id: "", name: "" });
            }}
            data-testid="button-customer-search-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
          {parents.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? [];
            const isExpanded = expandedParents.has(parent.id);
            const childCount = children.length;

            if (mode === "operational") {
              return (
                <div key={parent.id}>
                  <div
                    className="px-3 py-2 text-sm flex items-center gap-2 cursor-default select-none bg-muted/40 text-muted-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleParent(parent.id);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    data-testid={`option-customer-parent-${parent.id}`}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{parent.name}</div>
                      <div className="text-xs">
                        {childCount > 0
                          ? `Group of ${childCount} ${childCount === 1 ? "property" : "properties"}`
                          : "Parent group"}
                      </div>
                    </div>
                  </div>
                  {isExpanded && children.map((child) => (
                    <div
                      key={child.id}
                      className="pl-8 pr-3 py-2 text-sm cursor-pointer hover-elevate border-l-2 border-l-border/50 ml-3"
                      onMouseDown={() => handleSelect(child)}
                      data-testid={`option-customer-child-${child.id}`}
                    >
                      <div className="font-medium">{child.name}</div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{parent.name}</span>
                        {child.street && (
                          <span className="text-xs text-muted-foreground">{child.street}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            } else {
              return (
                <div key={parent.id}>
                  <div
                    className="px-3 py-2 text-sm cursor-pointer hover-elevate flex items-center gap-2"
                    onMouseDown={() => handleSelect(parent)}
                    data-testid={`option-customer-parent-${parent.id}`}
                  >
                    <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{parent.name}</div>
                      {childCount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {`Group of ${childCount} ${childCount === 1 ? "property" : "properties"}`}
                        </div>
                      )}
                    </div>
                  </div>
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="pl-8 pr-3 py-2 text-sm cursor-pointer hover-elevate border-l-2 border-l-border/50 ml-3"
                      onMouseDown={() => handleSelect(child)}
                      data-testid={`option-customer-child-${child.id}`}
                    >
                      <div className="font-medium">{child.name}</div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{parent.name}</span>
                        {child.street && (
                          <span className="text-xs text-muted-foreground">{child.street}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
          })}

          {standalones.map((c) => (
            <div
              key={c.id}
              className="px-3 py-2 text-sm cursor-pointer hover-elevate"
              onMouseDown={() => handleSelect(c)}
              data-testid={`option-customer-${c.id}`}
            >
              <div className="font-medium">{c.name}</div>
              {c.street && <div className="text-xs text-muted-foreground">{c.street}</div>}
            </div>
          ))}

          {orphanChildren.map((c) => {
            const pName = c.parentCustomerId ? parentNameMap.get(c.parentCustomerId) : undefined;
            return (
              <div
                key={c.id}
                className="px-3 py-2 text-sm cursor-pointer hover-elevate"
                onMouseDown={() => handleSelect(c)}
                data-testid={`option-customer-child-${c.id}`}
              >
                <div className="font-medium">{c.name}</div>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {pName && (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{pName}</span>
                  )}
                  {c.street && <span className="text-xs text-muted-foreground">{c.street}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {isSearching && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
          {t("common.searching", "Searching…")}
        </div>
      )}
    </div>
  );
}
