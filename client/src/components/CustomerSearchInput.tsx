import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import type { Customer } from "@shared/schema";

interface CustomerSearchInputProps {
  onSelect: (customer: { id: string; name: string }) => void;
  selectedId?: string;
  selectedCustomerName?: string;
  placeholder?: string;
  testId?: string;
  excludeIds?: string[];
}

export default function CustomerSearchInput({
  onSelect,
  selectedId,
  selectedCustomerName,
  placeholder,
  testId,
  excludeIds,
}: CustomerSearchInputProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState(selectedCustomerName || "");
  const [results, setResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
    onSelect({ id: c.id, name: c.name });
  };

  const displayValue = selectedId && !search ? selectedName : search;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          data-testid={testId || "input-customer-search"}
          value={displayValue}
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
          {results.map((c) => (
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
