import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  CheckCircle2,
  Clock,
  SkipForward,
  ClipboardList,
} from "lucide-react";
import ChecklistItemDetailPanel, { type ChecklistItemWithCampaign } from "@/components/ChecklistItemDetailPanel";

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completed") return "default";
  if (status === "skipped") return "outline";
  return "secondary";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  if (status === "skipped") return <SkipForward className="w-4 h-4 text-muted-foreground" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
}

function stepLabel(step: string | null | undefined): string {
  if (!step) return "";
  const map: Record<string, string> = {
    pre_communication: "Pre-Comm",
    work_in_progress: "In Progress",
    work_completed: "Work Done",
    post_communication: "Post-Comm",
  };
  return map[step] ?? step;
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    chemical: "Chemical",
    irrigation: "Irrigation",
    general: "General",
  };
  return map[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
}

interface ChecklistRowProps {
  item: ChecklistItemWithCampaign;
  isSelected: boolean;
  onSelect: (item: ChecklistItemWithCampaign) => void;
}

function ChecklistRow({ item, isSelected, onSelect }: ChecklistRowProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer border transition-colors ${
        isSelected ? "bg-accent border-border" : "border-transparent hover-elevate"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item);
      }}
      data-testid={`service-checklist-row-${item.id}`}
    >
      <StatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate" data-testid={`sc-row-campaign-${item.id}`}>
            {item.campaignTitle}
          </span>
          <Badge variant="outline" className="text-xs px-1 py-0">
            {categoryLabel(item.campaignCategory)}
          </Badge>
        </div>
        {item.workflowStep && (
          <span className="text-xs text-muted-foreground">{stepLabel(item.workflowStep)}</span>
        )}
      </div>
      <Badge variant={statusBadgeVariant(item.status)} className="text-xs shrink-0">
        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
      </Badge>
    </div>
  );
}

interface CustomerServiceChecklistProps {
  customerId: string;
}

export default function CustomerServiceChecklist({ customerId }: CustomerServiceChecklistProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedItem, setSelectedItem] = useState<ChecklistItemWithCampaign | null>(null);

  const { data: items = [], isLoading } = useQuery<ChecklistItemWithCampaign[]>({
    queryKey: ["/api/customers", customerId, "campaign-items"],
  });

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !item.campaignTitle.toLowerCase().includes(q) &&
          !(item.customerCity ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, filterStatus, search]);

  const handleSelectItem = useCallback((item: ChecklistItemWithCampaign) => {
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  }, []);

  const handleListAreaClick = useCallback(() => {
    setSelectedItem(null);
  }, []);

  return (
    <div className="relative" style={{ minHeight: 300 }}>
      <div
        className="space-y-3"
        onClick={handleListAreaClick}
        data-testid="sc-list-area"
      >
        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-service-checklist"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36" data-testid="select-filter-sc-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
            <ClipboardList className="w-7 h-7" />
            <p className="text-sm">
              {search || filterStatus !== "all"
                ? "No items match your filters."
                : "No campaign items found for this customer."}
            </p>
          </div>
        ) : (
          <div className="space-y-1" data-testid="service-checklist-list">
            {filteredItems.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                isSelected={selectedItem?.id === item.id}
                onSelect={handleSelectItem}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={`absolute top-0 right-0 h-full z-10 w-72 shadow-lg border rounded-md overflow-hidden transition-transform duration-200 ease-in-out ${
          selectedItem ? "translate-x-0" : "translate-x-full"
        }`}
        data-testid="sc-panel-container"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "100%", minHeight: 300 }}
      >
        <ChecklistItemDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      </div>
    </div>
  );
}
