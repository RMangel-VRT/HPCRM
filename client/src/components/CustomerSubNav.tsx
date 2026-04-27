import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Users,
  MessageSquare,
  Wrench,
  Map,
  CheckCircle2,
  Mail,
  Settings,
  Package,
  FileText,
  BarChart3,
  DollarSign,
  CalendarRange,
} from "lucide-react";

interface NavItem {
  value: string;
  label: string;
  icon: React.ElementType;
  badge?: number | null;
  testId?: string;
}

interface NavSection {
  heading?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

interface CustomerSubNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  contractsCount: number;
  isAdminOrOffice: boolean;
  className?: string;
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-testid={item.testId}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover-elevate"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
          {item.badge}
        </Badge>
      )}
    </button>
  );
}

export default function CustomerSubNav({
  activeTab,
  onTabChange,
  contractsCount,
  isAdminOrOffice,
  className,
}: CustomerSubNavProps) {
  const { t } = useTranslation();

  const sections: NavSection[] = [
    {
      items: [
        {
          value: "overview",
          label: "Dashboard",
          icon: Eye,
          testId: "rail-tab-overview",
        },
        {
          value: "contacts",
          label: t("customerDetail.tabs.contacts"),
          icon: Users,
          testId: "rail-tab-contacts",
        },
        {
          value: "notes",
          label: t("customerDetail.tabs.notes"),
          icon: MessageSquare,
          testId: "rail-tab-notes",
        },
        {
          value: "operations",
          label: t("customerDetail.tabs.operations"),
          icon: Wrench,
          testId: "rail-tab-operations",
        },
        {
          value: "maps",
          label: t("customerDetail.tabs.maps"),
          icon: Map,
          testId: "rail-tab-maps",
        },
        {
          value: "service-checklist",
          label: "Service Checklist",
          icon: CheckCircle2,
          testId: "rail-tab-service-checklist",
        },
        {
          value: "fulfillment",
          label: "Service Plan",
          icon: Package,
          testId: "rail-tab-fulfillment",
        },
      ],
    },
    {
      heading: "FINANCIAL",
      adminOnly: true,
      items: [
        {
          value: "contracts",
          label: t("customerDetail.billingTabs.contracts"),
          icon: FileText,
          badge: contractsCount,
          testId: "rail-tab-contracts",
        },
        {
          value: "rate-sheet",
          label: t("customerDetail.billingTabs.rateSheet"),
          icon: DollarSign,
          testId: "rail-tab-rate-sheet",
        },
        {
          value: "revenue",
          label: t("customerDetail.billingTabs.revenue"),
          icon: BarChart3,
          testId: "rail-tab-revenue",
        },
        {
          value: "monthly-summary",
          label: t("customerDetail.billingTabs.monthlySummary"),
          icon: CalendarRange,
          testId: "rail-tab-monthly-summary",
        },
      ],
    },
    {
      adminOnly: true,
      items: [
        {
          value: "communications",
          label: "Communications",
          icon: Mail,
          testId: "rail-tab-communications",
        },
        {
          value: "settings",
          label: t("customerDetail.tabs.settings"),
          icon: Settings,
          testId: "rail-tab-settings",
        },
      ],
    },
  ];

  return (
    <nav
      className={cn("w-48 shrink-0 flex flex-col gap-4", className)}
      data-testid="customer-sub-nav"
    >
      {sections.map((section, sectionIndex) => {
        if (section.adminOnly && !isAdminOrOffice) return null;
        return (
          <div key={sectionIndex} className="flex flex-col gap-0.5">
            {section.heading && (
              <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none">
                {section.heading}
              </p>
            )}
            {section.items.map((item) => (
              <NavButton
                key={item.value}
                item={item}
                active={activeTab === item.value}
                onClick={() => onTabChange(item.value)}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
