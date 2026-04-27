import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Wrench,
  Map,
  CheckCircle2,
  CalendarCheck,
  Mail,
  DollarSign,
  Settings,
  ChevronDown,
} from "lucide-react";

interface CustomerSubNavCustomer {
  id: string;
  name: string;
}

export interface RailItem {
  key: string;
  label: string;
  section: string;
  tabValue: string;
  badgeCount?: number;
  visible?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

interface CustomerSubNavProps {
  customerId: string;
  customerName: string;
  customers: CustomerSubNavCustomer[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole?: string;
}

const ALL_RAIL_ITEMS: Omit<RailItem, "visible">[] = [
  { key: "overview", label: "Dashboard", section: "Overview", tabValue: "overview", icon: LayoutDashboard },
  { key: "contacts", label: "Contacts", section: "Overview", tabValue: "contacts", icon: Users },
  { key: "notes", label: "Notes", section: "Overview", tabValue: "notes", icon: MessageSquare },
  { key: "operations", label: "Operations", section: "Operations", tabValue: "operations", icon: Wrench },
  { key: "maps", label: "Maps", section: "Operations", tabValue: "maps", icon: Map },
  { key: "service-checklist", label: "Service Checklist", section: "Operations", tabValue: "service-checklist", icon: CheckCircle2 },
  { key: "fulfillment", label: "Service Plan", section: "Operations", tabValue: "fulfillment", icon: CalendarCheck },
  { key: "communications", label: "Communications", section: "Operations", tabValue: "communications", icon: Mail },
  { key: "billing", label: "Billing", section: "Billing", tabValue: "contracts", icon: DollarSign },
  { key: "settings", label: "Settings", section: "Settings", tabValue: "settings", icon: Settings },
];

const PERMISSION_GATED = new Set(["communications", "billing", "settings"]);

const BILLING_SUBTABS = new Set(["contracts", "rate-sheet", "revenue", "monthly-summary"]);

const SECTION_ORDER = ["Overview", "Operations", "Billing", "Settings"];

export function CustomerSubNav({
  customerId,
  customerName,
  customers,
  activeTab,
  onTabChange,
  userRole,
}: CustomerSubNavProps) {
  const [, navigate] = useLocation();

  const isPrivileged = userRole === "admin" || userRole === "office";

  const visibleItems: RailItem[] = ALL_RAIL_ITEMS.map((item) => ({
    ...item,
    visible: PERMISSION_GATED.has(item.key) ? isPrivileged : true,
  })).filter((item) => item.visible);

  const sections = SECTION_ORDER.map((heading) => ({
    heading,
    items: visibleItems.filter((item) => item.section === heading),
  })).filter((s) => s.items.length > 0);

  return (
    <div
      className="flex-shrink-0 border-r bg-muted/30 flex flex-col"
      style={{ width: 200 }}
      data-testid="customer-sub-nav"
    >
      <div className="p-3 border-b">
        {customers.length > 1 ? (
          <Select
            value={customerId}
            onValueChange={(val) =>
              navigate(`/dashboard/customers/${val}`)
            }
          >
            <SelectTrigger
              className="w-full border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0 [&>svg]:hidden gap-1"
              data-testid="select-subnav-customer-switcher"
            >
              <span className="font-semibold text-sm leading-snug truncate" data-testid="text-subnav-customer-name">
                {customerName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem
                  key={c.id}
                  value={c.id}
                  data-testid={`option-subnav-customer-${c.id}`}
                >
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span
            className="font-semibold text-sm leading-snug block truncate"
            data-testid="text-subnav-customer-name"
          >
            {customerName}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((section) => (
          <div key={section.heading} className="mb-3">
            <p className="px-3 mb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {section.heading}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.key === "billing"
                  ? BILLING_SUBTABS.has(activeTab)
                  : item.tabValue === activeTab;
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  className={`w-full justify-start h-8 px-3 text-sm rounded-none${
                    isActive ? " bg-accent text-accent-foreground font-medium" : " font-normal"
                  }`}
                  onClick={() => onTabChange(item.tabValue)}
                  data-testid={`nav-item-${item.key}`}
                >
                  <Icon className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
