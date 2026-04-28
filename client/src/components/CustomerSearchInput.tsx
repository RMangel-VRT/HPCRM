import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import type { Customer } from "@shared/schema";

interface CustomerSearchInputProps {
  onSelect: (customer: { id: string; name: string }) => void;
  selectedId?: string;
  placeholder?: string;
  testId?: string;
}

export default function CustomerSearchInput({
  onSelect,
  selectedId,
  placeholder,
  testId,
}: CustomerSearchInputProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  useEffect(() => {
    if (selectedId) {
      const found = customers.find(c => c.id === selectedId);
      if (found) setSelectedName(found.name);
    } else {
      setSelectedName("");
    }
  }, [selectedId, customers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = search.length >= 2
    ? customers
        .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.street ?? "").toLowerCase().includes(search.toLowerCase()))
        .slice(0, 10)
    : [];

  const handleSelect = (c: Customer) => {
    setSelectedName(c.name);
    setSearch("");
    setOpen(false);
    onSelect({ id: c.id, name: c.name });
  };

  const handleClear = () => {
    setSelectedName("");
    setSearch("");
    onSelect({ id: "", name: "" });
  };

  return (
    <div ref={containerRef} className="relative">
      {selectedName ? (
        <div className="flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
          <span className="text-sm flex-1 truncate" data-testid={`${testId}-selected`}>{selectedName}</span>
          <button type="button" onClick={handleClear} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder={placeholder ?? t("emailTracking.searchCustomersPlaceholder")}
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            data-testid={testId}
          />
        </div>
      )}
      {open && filtered.length > 0 && !selectedName && (
        <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-md max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <button
              type="button"
              key={c.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col"
              onClick={() => handleSelect(c)}
              data-testid={`option-customer-${c.id}`}
            >
              <span className="font-medium">{c.name}</span>
              {c.street && <span className="text-xs text-muted-foreground">{c.street}</span>}
            </button>
          ))}
        </div>
      )}
      {open && search.length >= 2 && filtered.length === 0 && !selectedName && (
        <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-md px-3 py-2">
          <p className="text-sm text-muted-foreground">{t("emailTracking.noCustomersFound")}</p>
        </div>
      )}
    </div>
  );
}
