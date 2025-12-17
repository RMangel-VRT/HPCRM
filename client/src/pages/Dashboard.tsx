import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, DollarSign, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import TopCustomers from "@/components/TopCustomers";
import UpcomingRenewals from "@/components/UpcomingRenewals";
import MyTicketsPreview from "@/components/MyTicketsPreview";
import SchedulePreview from "@/components/SchedulePreview";
import PendingInvoices from "@/components/PendingInvoices";
import { useAuth } from "@/hooks/use-auth";
import SuperAdminDashboard from "./SuperAdminDashboard";
import FieldCrewDashboard from "./FieldCrewDashboard";

interface DashboardStats {
  customersCount: number;
  activeContractsCount: number;
  monthlyRevenue: number;
  ytdRevenue: number;
}

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  
  if (user?.isSuperAdminBool) {
    return <SuperAdminDashboard />;
  }
  
  if (user?.activeRole === "field_manager" || user?.activeRole === "field") {
    return <FieldCrewDashboard />;
  }
  
  return <AdminOfficeDashboard />;
}

function AdminOfficeDashboard() {
  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });

  const dashboardCards = stats ? [
    { 
      title: "Active Customers", 
      value: stats.customersCount.toString(), 
      icon: Users,
    },
    { 
      title: "Active Contracts", 
      value: stats.activeContractsCount.toString(), 
      icon: FileText,
    },
    { 
      title: `${currentMonth} Revenue`, 
      value: formatCurrency(stats.monthlyRevenue), 
      icon: DollarSign,
    },
    { 
      title: "YTD Revenue", 
      value: formatCurrency(stats.ytdRevenue), 
      icon: TrendingUp,
    },
  ] : [];

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your landscaping business
          </p>
        </div>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Unable to Load Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              There was a problem loading your dashboard statistics. This usually happens due to a session issue.
            </p>
            <p className="text-sm font-mono text-muted-foreground">
              Error: {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                data-testid="button-reload"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  document.cookie.split(";").forEach((c) => {
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                  });
                  window.location.href = "/login";
                }}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90"
                data-testid="button-relogin"
              >
                Clear Session & Re-login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Overview of your landscaping business
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-24 mb-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {dashboardCards.map((card) => (
            <Card key={card.title} data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
                <card.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold" data-testid={`text-stat-value-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  {card.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SchedulePreview />
        <MyTicketsPreview />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <UpcomingRenewals />
        <TopCustomers />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PendingInvoices />
      </div>
    </div>
  );
}
