import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { CREW_COLORS, type MaintenanceCrew, type WeeklyScheduleTemplate, type ScheduleBlock, type MaintenanceVisitConfig, type Customer } from "@shared/schema";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

interface ScheduleBlockWithDetails extends ScheduleBlock {
  visitConfig?: MaintenanceVisitConfig;
  customer?: Customer;
  crew?: MaintenanceCrew;
}

export default function ScheduleViewer() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<WeeklyScheduleTemplate[]>({
    queryKey: ["/api/schedule-templates"],
  });

  const { data: crews = [], isLoading: loadingCrews } = useQuery<MaintenanceCrew[]>({
    queryKey: ["/api/maintenance-crews"],
  });

  const { data: blocks = [], isLoading: loadingBlocks } = useQuery<ScheduleBlock[]>({
    queryKey: ["/api/schedule-blocks"],
  });

  const { data: visitConfigs = [] } = useQuery<MaintenanceVisitConfig[]>({
    queryKey: ["/api/customer-visit-configs"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const activeCrews = crews.filter((c) => c.isActive);

  const blocksWithDetails: ScheduleBlockWithDetails[] = useMemo(() => {
    if (!activeTemplate) return [];
    return blocks
      .filter((b) => b.templateId === activeTemplate.id)
      .map((block) => {
        const config = visitConfigs.find((v) => v.id === block.visitConfigId);
        const customer = customers.find((c) => c.id === config?.customerId);
        const crew = crews.find((c) => c.id === block.crewId);
        return { ...block, visitConfig: config, customer, crew };
      })
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [activeTemplate, blocks, visitConfigs, customers, crews]);

  const getBlocksForDay = (day: DayOfWeek) => {
    return blocksWithDetails.filter((b) => b.dayOfWeek === day);
  };

  const getCrewColor = (crew?: MaintenanceCrew) => {
    if (crew?.color) return crew.color;
    const crewIndex = crews.findIndex((c) => c.id === crew?.id);
    return CREW_COLORS[crewIndex % CREW_COLORS.length];
  };

  const isLoading = loadingTemplates || loadingCrews || loadingBlocks;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-5 gap-2">
          {DAYS_OF_WEEK.map((day) => (
            <Skeleton key={day} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (!activeTemplate) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No schedule templates found. Create a template in the Builder tab first.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4" data-testid="schedule-viewer">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select
            value={selectedTemplateId || activeTemplate.id}
            onValueChange={setSelectedTemplateId}
          >
            <SelectTrigger className="w-[200px]" data-testid="select-template-viewer">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} data-testid={`template-option-${t.id}`}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Crews:</span>
          {activeCrews.map((crew) => (
            <div 
              key={crew.id} 
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: getCrewColor(crew) }}
              data-testid={`crew-legend-${crew.id}`}
            >
              {crew.name}
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-5 gap-0 border-b">
                {DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className="py-3 px-2 text-center font-semibold bg-muted/50 border-r last:border-r-0"
                  >
                    {DAY_LABELS[day]}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-5 gap-0 min-h-[400px]">
                {DAYS_OF_WEEK.map((day) => {
                  const dayBlocks = getBlocksForDay(day);
                  return (
                    <div
                      key={day}
                      className="border-r last:border-r-0 p-2 space-y-2 bg-background"
                      data-testid={`viewer-day-${day}`}
                    >
                      {dayBlocks.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          No properties
                        </div>
                      ) : (
                        dayBlocks.map((block) => (
                          <div
                            key={block.id}
                            className="rounded-md p-2 text-white text-xs space-y-1"
                            style={{ backgroundColor: getCrewColor(block.crew) }}
                            data-testid={`block-${block.id}`}
                          >
                            <div className="font-medium truncate">
                              {block.customer?.name || "Unknown"}
                            </div>
                            <div className="flex items-center gap-1 opacity-90">
                              <Clock className="h-3 w-3" />
                              <span>{block.visitConfig?.estimatedDurationMinutes || 0} min</span>
                            </div>
                            <div className="opacity-75 truncate text-[10px]">
                              {block.crew?.name || "Unassigned"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Showing {blocksWithDetails.length} scheduled properties for "{activeTemplate.name}"
      </div>
    </div>
  );
}
