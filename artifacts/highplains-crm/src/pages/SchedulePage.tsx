import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Eye } from "lucide-react";
import WeeklySchedulerBuilder from "./WeeklySchedulerPage";
import ScheduleViewer from "./ScheduleViewer";
import { PlannerReplacedBanner } from "@/components/routes/PlannerReplacedBanner";
import { useAuth } from "@/hooks/use-auth";
import { usePlannerReadiness } from "@/hooks/use-routes";

export default function SchedulePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"builder" | "viewer">("builder");
  const readiness = usePlannerReadiness();
  // Freeze only on the company's confirmed import marker. Unknown/failed readiness keeps
  // the existing editor; the server still enforces 409 PLANNER_REPLACED on writes.
  const frozen = readiness.data?.plannerReadOnly === true;
  const showRoutesLink = ["admin", "office", "field_manager"].includes(user?.activeRole ?? "");

  if (readiness.isLoading) {
    return <div className="space-y-4" data-testid="schedule-page"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  }

  const tab = frozen ? "viewer" : activeTab;
  return (
    <div className="space-y-4" data-testid="schedule-page" data-readonly={frozen}>
      {frozen && <PlannerReplacedBanner message={readiness.data?.plannerMessage} showLink={showRoutesLink} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("schedule.title")}</h1>
        {!frozen && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "builder" | "viewer")} className="w-full sm:w-auto">
            <TabsList className="grid w-full sm:w-[280px] grid-cols-2">
              <TabsTrigger value="builder" className="gap-1.5" data-testid="tab-builder">
                <Pencil className="h-4 w-4" />
                {t("schedule.builder")}
              </TabsTrigger>
              <TabsTrigger value="viewer" className="gap-1.5" data-testid="tab-viewer">
                <Eye className="h-4 w-4" />
                {t("schedule.viewer")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {tab === "builder" ? <WeeklySchedulerBuilder /> : <ScheduleViewer />}
    </div>
  );
}
