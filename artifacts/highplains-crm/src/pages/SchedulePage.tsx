import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Eye } from "lucide-react";
import WeeklySchedulerBuilder from "./WeeklySchedulerPage";
import ScheduleViewer from "./ScheduleViewer";

export default function SchedulePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"builder" | "viewer">("builder");

  return (
    <div className="space-y-4" data-testid="schedule-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("schedule.title")}</h1>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "builder" | "viewer")}
          className="w-full sm:w-auto"
        >
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
      </div>

      {activeTab === "builder" ? (
        <WeeklySchedulerBuilder />
      ) : (
        <ScheduleViewer />
      )}
    </div>
  );
}
