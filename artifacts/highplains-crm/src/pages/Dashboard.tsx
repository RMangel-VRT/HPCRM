import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import SchedulePreview from "@/components/SchedulePreview";
import NeedsYouQueue from "@/components/dashboard/NeedsYouQueue";
import CommandBand from "@/components/dashboard/CommandBand";
import PulseRail, { type PulseResponse } from "@/components/dashboard/PulseRail";
import { useAuth } from "@/hooks/use-auth";
import SuperAdminDashboard from "./SuperAdminDashboard";
import FieldHomeDashboard from "./FieldHomeDashboard";

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  
  if (user?.isSuperAdminBool) {
    return <SuperAdminDashboard />;
  }
  
  const FIELD_APP_ROLES = ["field", "field_manager", "chemical_manager", "irrigation_manager", "shop_manager", "landscape_supervisor"];
  if (user?.activeRole && FIELD_APP_ROLES.includes(user.activeRole)) {
    return <FieldHomeDashboard />;
  }
  
  return <AdminOfficeDashboard />;
}

function AdminOfficeDashboard() {
  const { t } = useTranslation();
  const { data: pulse, isLoading, error } = useQuery<PulseResponse>({
    queryKey: ["/api/dashboard/pulse"],
  });

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("dashboard.businessOverview")}
          </p>
        </div>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{t("dashboard.unableToLoad")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("dashboard.loadError")}
            </p>
            <p className="text-sm font-mono text-muted-foreground">
              {t("common.error")}: {error instanceof Error ? error.message : t("common.unknown")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                data-testid="button-reload"
              >
                {t("dashboard.reloadPage")}
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
                {t("dashboard.clearSession")}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommandBand pulse={pulse} />

      <div className="grid grid-cols-1 gap-11 min-[1040px]:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <NeedsYouQueue />
        <PulseRail pulse={pulse} isLoading={isLoading} />
      </div>

      <SchedulePreview />
    </div>
  );
}
