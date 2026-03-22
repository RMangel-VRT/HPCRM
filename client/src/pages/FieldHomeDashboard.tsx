import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  MapPin,
  Map,
  Building2,
  ClipboardCheck,
  CalendarDays,
  Snowflake,
  Leaf,
  Wrench,
  UserCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface Ticket {
  id: string;
  title: string;
  workType: string;
  priority: string;
  createdAt: string;
  customer?: {
    name: string;
    street?: string;
  } | null;
  currentStatus?: {
    name: string;
    color: string;
  } | null;
}

type FieldRole =
  | "field_manager"
  | "chemical_manager"
  | "irrigation_manager"
  | "shop_manager"
  | "landscape_supervisor";

interface NavButton {
  title: string;
  url: string;
  icon: typeof ClipboardList;
}

const priorityVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  urgent: "destructive",
};

function getNavButtons(role: FieldRole, t: (key: string) => string): NavButton[] {
  switch (role) {
    case "field_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.customers"), url: "/dashboard/field-customers", icon: Building2 },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
        { title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck },
        { title: t("fieldLayout.snow"), url: "/dashboard/snow", icon: Snowflake },
      ];
    case "chemical_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.customers"), url: "/dashboard/field-customers", icon: Building2 },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
        { title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck },
        { title: t("fieldLayout.seasons"), url: "/dashboard/seasons", icon: Leaf },
        { title: t("fieldLayout.snow"), url: "/dashboard/snow", icon: Snowflake },
      ];
    case "irrigation_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
        { title: t("fieldLayout.schedule"), url: "/dashboard/schedule", icon: CalendarDays },
        { title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck },
      ];
    case "shop_manager":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.equipment"), url: "/dashboard/equipment", icon: Wrench },
      ];
    case "landscape_supervisor":
      return [
        { title: t("fieldLayout.myTickets"), url: "/dashboard/tickets/my", icon: UserCheck },
        { title: t("fieldLayout.propertyMaps"), url: "/dashboard/maps", icon: Map },
        { title: t("fieldLayout.routeMap"), url: "/dashboard/customers/map", icon: MapPin },
        { title: t("fieldLayout.campaigns"), url: "/dashboard/campaigns", icon: ClipboardCheck },
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

  const { data: myTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my"],
  });

  const activeTickets = myTickets.filter(
    (tk) =>
      tk.currentStatus?.name?.toLowerCase() !== "completed" &&
      tk.currentStatus?.name?.toLowerCase() !== "closed"
  );

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
        <h2 className="text-base font-medium mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          {t("fieldDashboard.myTickets")}
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : activeTickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="font-medium">{t("fieldDashboard.allCaughtUp")}</p>
              <p className="text-sm text-muted-foreground">{t("fieldDashboard.noActiveTasks")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeTickets.slice(0, 5).map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                <Card
                  className="hover-elevate active-elevate-2 cursor-pointer"
                  data-testid={`card-ticket-${ticket.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ticket.title}</p>
                        {ticket.customer && (
                          <p className="text-xs text-muted-foreground truncate">
                            {ticket.customer.name}
                            {ticket.customer.street && ` — ${ticket.customer.street}`}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={priorityVariants[ticket.priority] || "secondary"}
                        className="shrink-0"
                      >
                        {t(`priorities.${ticket.priority}`, ticket.priority)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      {ticket.currentStatus && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: ticket.currentStatus.color,
                            color: ticket.currentStatus.color,
                          }}
                        >
                          {ticket.currentStatus.name}
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(ticket.createdAt), "MMM d")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {activeTickets.length > 5 && (
              <Link href="/dashboard/tickets/my">
                <Card className="hover-elevate active-elevate-2 cursor-pointer">
                  <CardContent className="py-3 text-center text-sm text-muted-foreground">
                    {t("fieldDashboard.viewMoreTickets", { count: activeTickets.length - 5 })}
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        )}
      </div>

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
