import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCommunicationsShell } from "./CommunicationsPageShell";
import { cn } from "@/lib/utils";

const VALID_TABS = ["inbox", "sent", "unsorted", "all"] as const;
type Tab = typeof VALID_TABS[number];

interface TabDef {
  id: Tab;
  label: string;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "unsorted", label: "Unsorted" },
  { id: "all", label: "All Communications", adminOnly: true },
];

interface CountBadgeProps {
  count?: number;
  active?: boolean;
}

function CountBadge({ count, active }: CountBadgeProps) {
  if (count === undefined) return null;
  return (
    <span
      className={cn(
        "ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium",
        active
          ? "bg-primary-foreground/20 text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      {count}
    </span>
  );
}

interface CommunicationsSecondaryNavProps {
  counts?: Partial<Record<Tab, number>>;
}

export function CommunicationsSecondaryNav({ counts = {} }: CommunicationsSecondaryNavProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { search, fromDate, toDate, viewAs } = useCommunicationsShell();
  const params = useParams<{ tab?: string }>();
  const activeTab = (VALID_TABS.includes(params.tab as Tab) ? params.tab : "inbox") as Tab;

  const isAdminOrOffice = user?.activeRole === "admin" || user?.activeRole === "office";

  function buildUrl(tab: Tab): string {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (fromDate) p.set("from", fromDate);
    if (toDate) p.set("to", toDate);
    if (viewAs) p.set("viewAs", viewAs);
    const qs = p.toString();
    return `/dashboard/communications/${tab}${qs ? `?${qs}` : ""}`;
  }

  const visibleTabs = TABS.filter((t) => {
    if (t.adminOnly && !isAdminOrOffice) return false;
    return true;
  });

  return (
    <div className="flex items-center gap-0 border-b bg-background shrink-0 px-4 overflow-x-auto no-scrollbar">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => navigate(buildUrl(tab.id))}
            data-testid={`tab-comms-${tab.id}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex items-center px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {tab.label}
            <CountBadge count={counts[tab.id]} active={isActive} />
          </button>
        );
      })}
    </div>
  );
}
