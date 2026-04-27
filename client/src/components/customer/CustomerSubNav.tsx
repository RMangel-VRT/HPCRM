import { useRef, useCallback } from "react";
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
  Map,
  CheckCircle2,
  CalendarCheck,
  Mail,
  DollarSign,
  Settings,
  ChevronDown,
  BarChart3,
  Ticket as TicketIcon,
  FileText,
  Layers,
  Snowflake,
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
  adminOnly?: boolean;
  fieldManagerVisible?: boolean;
  snowRequired?: boolean;
}

interface CustomerSubNavProps {
  customerId: string;
  customerName: string;
  customers: CustomerSubNavCustomer[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  userRole?: string;
  snowEnabled?: boolean;
  badgeCounts?: Record<string, number>;
}

const BASE_RAIL_ITEMS: Omit<RailItem, "visible">[] = [
  { key: "overview", label: "Dashboard", section: "Overview", tabValue: "overview", icon: LayoutDashboard },
  { key: "contacts", label: "Contacts", section: "Overview", tabValue: "contacts", icon: Users },
  { key: "notes", label: "Notes", section: "Overview", tabValue: "notes", icon: MessageSquare },
  { key: "maps", label: "Maps", section: "Operations", tabValue: "maps", icon: Map },
  { key: "service-checklist", label: "Service Checklist", section: "Operations", tabValue: "service-checklist", icon: CheckCircle2 },
  { key: "fulfillment", label: "Service Plan", section: "Operations", tabValue: "fulfillment", icon: CalendarCheck },
  { key: "annual-rollup", label: "Annual Rollup", section: "Operations", tabValue: "annual-rollup", icon: BarChart3, adminOnly: true },
  { key: "tickets", label: "Tickets", section: "Operations", tabValue: "tickets", icon: TicketIcon },
  { key: "proposals", label: "Proposals", section: "Operations", tabValue: "proposals", icon: FileText, adminOnly: true },
  { key: "visual-scopes", label: "Visual Scopes", section: "Operations", tabValue: "visual-scopes", icon: Layers, adminOnly: true },
  { key: "snow", label: "Snow", section: "Operations", tabValue: "snow", icon: Snowflake, snowRequired: true, fieldManagerVisible: true },
  { key: "communications", label: "Communications", section: "Operations", tabValue: "communications", icon: Mail, adminOnly: true },
  { key: "billing", label: "Billing", section: "Financial", tabValue: "contracts", icon: DollarSign, adminOnly: true },
  { key: "settings", label: "Settings", section: "Settings", tabValue: "settings", icon: Settings, adminOnly: true },
];

const BILLING_SUBTABS = new Set(["contracts", "rate-sheet", "revenue", "monthly-summary"]);

const SECTION_ORDER = ["Overview", "Operations", "Financial", "Settings"];

export function CustomerSubNav({
  customerId,
  customerName,
  customers,
  activeTab,
  onTabChange,
  userRole,
  snowEnabled = false,
  badgeCounts = {},
}: CustomerSubNavProps) {
  const [, navigate] = useLocation();
  const navRef = useRef<HTMLElement>(null);

  const isPrivileged = userRole === "admin" || userRole === "office";
  const isFieldManager = userRole === "field_manager";

  const visibleItems: RailItem[] = BASE_RAIL_ITEMS.map((item) => {
    if (item.adminOnly && !isPrivileged) return { ...item, visible: false };
    if (item.snowRequired && !snowEnabled) return { ...item, visible: false };
    if (item.snowRequired && !isPrivileged && !isFieldManager) return { ...item, visible: false };
    const count = badgeCounts[item.key];
    return { ...item, visible: true, badgeCount: count && count > 0 ? count : undefined };
  }).filter((item) => item.visible);

  const sections = SECTION_ORDER.map((heading) => ({
    heading,
    items: visibleItems.filter((item) => item.section === heading),
  })).filter((s) => s.items.length > 0);

  const getAllNavButtons = useCallback((): HTMLButtonElement[] => {
    if (!navRef.current) return [];
    return Array.from(
      navRef.current.querySelectorAll<HTMLButtonElement>("[data-nav-item]")
    );
  }, []);

  const handleNavKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      e.preventDefault();

      const buttons = getAllNavButtons();
      if (buttons.length === 0) return;

      const focused = document.activeElement as HTMLButtonElement;
      const currentIndex = buttons.indexOf(focused);

      let nextIndex: number;
      if (e.key === "ArrowDown") {
        nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
      }

      const nextButton = buttons[nextIndex];
      nextButton.focus();
      nextButton.click();
    },
    [getAllNavButtons]
  );

  return (
    <div
      className="flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col"
      style={{ width: 200 }}
      data-testid="customer-sub-nav"
    >
      <div className="p-3 border-b border-sidebar-border">
        {customers.length > 1 ? (
          <Select
            value={customerId}
            onValueChange={(val) => navigate(`/dashboard/customers/${val}`)}
          >
            <SelectTrigger
              className="w-full border-0 bg-transparent p-0 h-auto shadow-none focus:ring-0 [&>svg]:hidden gap-1 text-sidebar-foreground hover:text-sidebar-foreground"
              data-testid="select-subnav-customer-switcher"
            >
              <span className="font-semibold text-sm leading-snug truncate" data-testid="text-subnav-customer-name">
                {customerName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/60 flex-shrink-0" />
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

      <nav
        ref={navRef}
        className="flex-1 overflow-y-auto py-2"
        aria-label="Customer sections"
        onKeyDown={handleNavKeyDown}
      >
        {sections.map((section) => (
          <div key={section.heading} className="mb-3" role="group" aria-label={section.heading}>
            <p
              className="px-3 mb-1 text-[11px] uppercase tracking-wider text-sidebar-foreground/60 font-medium"
              aria-hidden="true"
            >
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
                  className={`w-full justify-start h-8 px-3 text-sm rounded-none text-sidebar-foreground hover:text-sidebar-foreground${
                    isActive
                      ? " bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-[3px] border-l-sidebar-primary pl-[calc(0.75rem-3px)]"
                      : " font-normal"
                  }`}
                  onClick={() => onTabChange(item.tabValue)}
                  data-testid={`nav-item-${item.key}`}
                  data-nav-item
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="w-3.5 h-3.5 mr-2 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate flex-1">{item.label}</span>
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span
                      className="ml-1.5 min-w-[18px] h-[18px] rounded-full bg-sidebar-primary/20 text-sidebar-foreground text-[10px] font-semibold flex items-center justify-center px-1 flex-shrink-0"
                      data-testid={`badge-count-${item.key}`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
