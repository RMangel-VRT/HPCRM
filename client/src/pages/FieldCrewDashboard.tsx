import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ClipboardList, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  AlertCircle,
  Calendar,
  ClipboardCheck,
  CalendarDays
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { CampaignWithProgress } from "@shared/schema";

interface Ticket {
  id: string;
  title: string;
  workType: string;
  priority: string;
  currentStatusId: string | null;
  customerId: string | null;
  locationLat: string | null;
  locationLng: string | null;
  createdAt: string;
  customer?: {
    name: string;
    street?: string;
    city?: string;
  } | null;
  currentStatus?: {
    name: string;
    color: string;
  } | null;
}

const priorityVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  urgent: "destructive",
};

export default function FieldCrewDashboard() {
  const { t } = useTranslation();

  const getPriorityLabel = (key: string) => t(`priorities.${key}`, key);
  const getWorkTypeLabel = (key: string) => t(`workTypes.${key}`, key);
  const { data: myTickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/tickets/my"],
    staleTime: 60000,
  });

  const { data: campaigns = [] } = useQuery<CampaignWithProgress[]>({
    queryKey: ["/api/campaigns"],
    staleTime: 60000,
  });

  const activeCampaigns = campaigns.filter(c => c.status === "active");

  const activeTickets = myTickets.filter(tk => 
    tk.currentStatus?.name?.toLowerCase() !== "completed" && 
    tk.currentStatus?.name?.toLowerCase() !== "closed"
  );
  
  const completedToday = myTickets.filter(tk => {
    if (tk.currentStatus?.name?.toLowerCase() !== "completed") return false;
    return true;
  });

  const urgentTickets = activeTickets.filter(tk => tk.priority === "urgent" || tk.priority === "high");
  
  const stats = [
    {
      title: t("fieldDashboard.activeTasks"),
      value: activeTickets.length.toString(),
      icon: ClipboardList,
      color: "text-blue-500",
    },
    {
      title: t("fieldDashboard.highPriority"),
      value: urgentTickets.length.toString(),
      icon: AlertCircle,
      color: "text-orange-500",
    },
    {
      title: t("fieldDashboard.completed"),
      value: completedToday.length.toString(),
      icon: CheckCircle2,
      color: "text-green-500",
    },
  ];

  return (
    <div className="space-y-4 pb-20">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          {t("fieldDashboard.myWork")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Card key={stat.title} className="text-center" data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="pt-4 pb-3 px-2">
              <stat.icon className={`w-5 h-5 mx-auto mb-1 ${stat.color}`} />
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground truncate">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-lg">{t("fieldDashboard.myTickets")}</CardTitle>
          <Link href="/dashboard/tickets/my">
            <Button variant="ghost" size="sm" data-testid="button-view-all-tickets">
              {t("fieldDashboard.viewAll")}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : activeTickets.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <p className="font-medium">{t("fieldDashboard.allCaughtUp")}</p>
              <p className="text-sm text-muted-foreground">{t("fieldDashboard.noActiveTasks")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTickets.slice(0, 5).map((ticket) => (
                <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                  <div
                    className="p-3 border rounded-md hover-elevate active-elevate-2 cursor-pointer"
                    data-testid={`card-ticket-${ticket.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ticket.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {getWorkTypeLabel(ticket.workType)}
                        </p>
                      </div>
                      <Badge 
                        variant={priorityVariants[ticket.priority] || "secondary"}
                        className="shrink-0"
                      >
                        {getPriorityLabel(ticket.priority)}
                      </Badge>
                    </div>
                    
                    {ticket.customer && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">
                          {ticket.customer.name}
                          {ticket.customer.street && ` - ${ticket.customer.street}`}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      {ticket.currentStatus && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: ticket.currentStatus.color,
                            color: ticket.currentStatus.color 
                          }}
                        >
                          {ticket.currentStatus.name}
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(ticket.createdAt), "MMM d")}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              
              {activeTickets.length > 5 && (
                <Link href="/dashboard/tickets/my">
                  <Button variant="outline" className="w-full" size="sm">
                    {t("fieldDashboard.viewMoreTickets", { count: activeTickets.length - 5 })}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {activeCampaigns.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              {t("fieldDashboard.myCampaigns")}
            </CardTitle>
            <Link href="/dashboard/campaigns">
              <Button variant="ghost" size="sm" data-testid="button-view-all-campaigns">
                {t("fieldDashboard.viewAll")}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="px-3">
            <div className="space-y-3">
              {activeCampaigns.slice(0, 3).map((campaign) => {
                const pendingCount = campaign.totalItems - campaign.completedItems - campaign.skippedItems;
                return (
                  <Link key={campaign.id} href={`/dashboard/campaigns/${campaign.id}`}>
                    <div
                      className="p-3 border rounded-md hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`card-campaign-${campaign.id}`}
                    >
                      <p className="font-medium text-sm truncate" data-testid={`text-campaign-title-${campaign.id}`}>
                        {campaign.title}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <CalendarDays className="w-3 h-3" />
                        {campaign.windowStart && campaign.windowEnd
                          ? `${new Date(campaign.windowStart).toLocaleDateString()} - ${new Date(campaign.windowEnd).toLocaleDateString()}`
                          : t("campaigns.window")}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="outline" className="text-xs">
                          {pendingCount} {t("campaigns.pending")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {campaign.completedItems}/{campaign.totalItems} {t("campaigns.done")}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t("fieldDashboard.quickActions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/tickets/my">
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
              <ClipboardList className="w-5 h-5" />
              <span className="text-xs">{t("fieldDashboard.allMyTickets")}</span>
            </Button>
          </Link>
          <Link href="/dashboard/customers">
            <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
              <MapPin className="w-5 h-5" />
              <span className="text-xs">{t("fieldDashboard.customerList")}</span>
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
