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

interface CustomerSubNavProps {
  customerId: string;
  customerName: string;
  customers: CustomerSubNavCustomer[];
}

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    heading: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, active: true },
      { label: "Contacts", icon: Users },
      { label: "Notes", icon: MessageSquare },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Operations", icon: Wrench },
      { label: "Maps", icon: Map },
      { label: "Service Checklist", icon: CheckCircle2 },
      { label: "Service Plan", icon: CalendarCheck },
      { label: "Communications", icon: Mail },
    ],
  },
  {
    heading: "Billing",
    items: [{ label: "Billing", icon: DollarSign }],
  },
  {
    heading: "Settings",
    items: [{ label: "Settings", icon: Settings }],
  },
];

export function CustomerSubNav({
  customerId,
  customerName,
  customers,
}: CustomerSubNavProps) {
  const [, navigate] = useLocation();

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
              return (
                <Button
                  key={item.label}
                  variant="ghost"
                  className={`w-full justify-start h-8 px-3 text-sm font-normal rounded-none${
                    item.active ? " bg-accent text-accent-foreground" : ""
                  }`}
                  data-testid={`nav-item-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
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
