import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardList,
  MapPin,
  Map,
  Building2,
  ClipboardCheck,
  CalendarDays,
  Wrench,
  UserCheck,
  AlertCircle,
  ArrowRight,
  ListChecks,
} from "lucide-react";
import MyExtraBillableBatchesWidget from "@/components/MyExtraBillableBatchesWidget";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface Ticket {
  id: string;
  title: string;
  workType: string;
  priority: string;
  createdAt: string;
  completedAt?: string | null;
  customer?: {
    name: string;
    street?: string;
  } | null;
  currentStatus?: {
    name: string;
    color: string;
  } | null;
}

interface EquipmentTicket {
  id: string;
  status: string;
}

interface Campaign {
  id: string;
  status: "active" | "completed" | "archived";
}

type FieldRole =
  | "field"
  | "field_manager"
  | "chemical_manager"
  | "irrigation_manager"
  | "shop_manager"
  | "landscape_supervisor";

const CAMPAIGN_PANEL_ROLES: FieldRole[] = ["field_manager", "chemical_manager", "landscape_supervisor"];
const BATCH_WIDGET_ROLES: FieldRole[] = ["field", "field_manager", "landscape_supervisor"];

interface NavButton {
  title: string;
  url: string;
  icon: typeof ClipboardList;
}

function getNavButtons(role: FieldRole, t: (key: string) => string): NavButton[] {
  switch (role) {
    case "field_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.myBatches"), url: "/dashboard/my-batches", icon: ListChecks },
        { title: t("fieldLayout.customers"), url: "/dashboard/field-customers", icon: Building2 },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
      ];
    case "chemical_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.customers"), url: "/dashboard/field-customers", icon: Building2 },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
      ];
    case "irrigation_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.customers"), url: "/dashboard/field-customers", icon: Building2 },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
        { title: t("fieldLayout.schedule"), url: "/dashboard/schedule", icon: CalendarDays },
        { title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck },
      ];
    case "shop_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
        { title: t("fieldLayout.equipment"), url: "/dashboard/equipment", icon: Wrench },
      ];
    case "landscape_supervisor":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.myBatches"), url: "/dashboard/my-batches", icon: ListChecks },
        { title: t("fieldLayout.customers"), url: "/dashboard/field-customers", icon: Building2 },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
      ];
    case "field":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.myBatches"), url: "/dashboard/my-batches", icon: ListChecks },
      ];
    default:
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
      ];
  }
}

export default function FieldHomeDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.activeRole as FieldRole;

  const showTabs = role === "landscape_supervisor";
  const showCampaignPanel = CAMPAIGN_PANEL_ROLES.includes(role);
  const showBatchWidget = BATCH_WIDGET_ROLES.includes(role);

  const { data: myTickets = [], isLoading: ticketsLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my", { userId: user?.id }],
    queryFn: async () => {
      const res = await fetch("/api/tickets/my", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: equipmentTickets = [], isLoading: equipLoading } = useQuery<EquipmentTicket[]>({
    queryKey: ["/api/equipment-tickets", { assignedToId: user?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/equipment-tickets?assignedToId=${user?.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showCampaignPanel,
    staleTime: 60000,
  });

  const isLoading = ticketsLoading || equipLoading;

  const activeTickets = myTickets.filter((tk) => !tk.completedAt);
  const openEquipTickets = equipmentTickets.filter((tk) => tk.status !== "completed" && tk.status !== "closed");

  const totalOpenCount = showTabs ? activeTickets.length : activeTickets.length + openEquipTickets.length;

  const urgentTickets = activeTickets.filter((tk) => tk.priority === "urgent");
  const activeCampaignCount = campaigns.filter((c) => c.status === "active").length;

  const navButtons = role ? getNavButtons(role, t) : [];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          {t("fieldDashboard.myWork")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            {t("fieldDashboard.myTickets")}
          </h2>
          <Link href="/dashboard/tickets/my">
            <span
              className="flex items-center gap-1 text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1 cursor-pointer"
              data-testid="link-view-all-tickets"
            >
              {t("fieldDashboard.viewAll", "View all")}
              <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>

        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <Link href="/dashboard/tickets/my">
            <Card
              className="hover-elevate active-elevate-2 cursor-pointer"
              data-testid="card-my-tickets-summary"
            >
              <CardContent className="flex items-stretch divide-x py-0">
                <div className="flex flex-col items-center justify-center gap-1 flex-1 py-6" data-testid="stat-total-tickets">
                  <span className="text-3xl font-bold">{totalOpenCount}</span>
                  <span className="text-xs text-muted-foreground text-center">{t("fieldDashboard.totalTickets", "Total tickets")}</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 flex-1 py-6" data-testid="stat-urgent-tickets">
                  <div className="flex items-center gap-1.5">
                    {urgentTickets.length > 0 && (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-3xl font-bold">{urgentTickets.length}</span>
                  </div>
                  <span className="text-xs text-muted-foreground text-center">{t("fieldDashboard.urgentTickets", "Urgent")}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {showBatchWidget && <MyExtraBillableBatchesWidget />}

      {showCampaignPanel && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
              {t("fieldDashboard.myCampaigns", "My Campaigns")}
            </h2>
            <Link href="/dashboard/campaigns">
              <span
                className="flex items-center gap-1 text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1 cursor-pointer"
                data-testid="link-view-all-campaigns"
              >
                {t("fieldDashboard.view", "View")}
                <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          {campaignsLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <Link href="/dashboard/campaigns">
              <Card
                className="hover-elevate active-elevate-2 cursor-pointer"
                data-testid="card-my-campaigns-summary"
              >
                <CardContent className="flex items-center justify-center py-6">
                  <div className="flex flex-col items-center gap-1" data-testid="stat-active-campaigns">
                    <span className="text-3xl font-bold">{activeCampaignCount}</span>
                    <span className="text-xs text-muted-foreground text-center">
                      {t("fieldDashboard.activeCampaigns", "Active campaigns")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-medium mb-3">
          {t("fieldLayout.navigation")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {navButtons.map((btn) => (
            <Link key={btn.url} href={btn.url}>
              <Card
                className="hover-elevate active-elevate-2 cursor-pointer"
                data-testid={`button-nav-${btn.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <CardContent className="flex flex-col items-center justify-center gap-3 py-6">
                  <btn.icon className="w-7 h-7 text-primary" />
                  <span className="text-sm font-medium text-center leading-tight">{btn.title}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
