import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight, Clock, MapPin, Users } from "lucide-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import type { MaintenanceCrew, WeeklyScheduleTemplate, ScheduleBlock, MaintenanceVisitConfig, Customer } from "@shared/schema";

const CREW_COLORS = [
  "#2563eb", "#16a34a", "#ea580c", "#7c3aed", "#0891b2",
  "#dc2626", "#ca8a04", "#db2777", "#059669", "#6366f1",
];

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

interface ScheduleBlockWithDetails extends ScheduleBlock {
  visitConfig?: MaintenanceVisitConfig;
  customer?: Customer;
  crew?: MaintenanceCrew;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

function getTodaysDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = ["sunday" as DayOfWeek, "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = new Date().getDay();
  const day = days[today];
  if (day === "sunday" as DayOfWeek) return "monday";
  return day;
}

export default function SchedulePreview() {
  const [showModal, setShowModal] = useState(false);
  const todayDay = getTodaysDayOfWeek();

  const { data: templates = [] } = useQuery<WeeklyScheduleTemplate[]>({
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

  const activeTemplate = templates[0];

  const todaysBlocks: ScheduleBlockWithDetails[] = useMemo(() => {
    if (!activeTemplate) return [];
    return blocks
      .filter((b) => b.templateId === activeTemplate.id && b.dayOfWeek === todayDay)
      .map((block) => {
        const config = visitConfigs.find((v) => v.id === block.visitConfigId);
        const customer = customers.find((c) => c.id === config?.customerId);
        const crew = crews.find((c) => c.id === block.crewId);
        return { ...block, visitConfig: config, customer, crew };
      })
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [activeTemplate, blocks, visitConfigs, customers, crews, todayDay]);

  const getCrewColor = (crew?: MaintenanceCrew) => {
    if (crew?.color) return crew.color;
    const crewIndex = crews.findIndex((c) => c.id === crew?.id);
    return CREW_COLORS[crewIndex % CREW_COLORS.length];
  };

  const blocksByCrewId = useMemo(() => {
    const grouped: Record<string, ScheduleBlockWithDetails[]> = {};
    for (const block of todaysBlocks) {
      const crewId = block.crewId;
      if (!grouped[crewId]) grouped[crewId] = [];
      grouped[crewId].push(block);
    }
    return grouped;
  }, [todaysBlocks]);

  const isLoading = loadingCrews || loadingBlocks;

  const activeCrews = crews.filter((c) => c.isActive);
  const totalMinutes = todaysBlocks.reduce((sum, b) => sum + (b.visitConfig?.estimatedDurationMinutes || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;

  return (
    <>
      <Card data-testid="card-schedule-preview">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Calendar className="w-4 h-4" />
            Today's Schedule
          </CardTitle>
          <Link href="/dashboard/schedule">
            <Button variant="ghost" size="sm" data-testid="button-view-schedule">
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : todaysBlocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Calendar className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">No Properties Today</p>
              <p className="text-xs">Nothing scheduled for {DAY_LABELS[todayDay]}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {todaysBlocks.length} properties • {totalHours > 0 ? `${totalHours}h ` : ""}{remainingMins > 0 ? `${remainingMins}m` : ""}
                </span>
                <Dialog open={showModal} onOpenChange={setShowModal}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-view-daily-schedule">
                      View Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        {DAY_LABELS[todayDay]}'s Schedule
                      </DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] pr-4">
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2 pb-2 border-b">
                          {activeCrews.map((crew) => (
                            <div
                              key={crew.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: getCrewColor(crew) }}
                            >
                              <Users className="h-3 w-3" />
                              {crew.name}
                            </div>
                          ))}
                        </div>

                        {activeCrews.map((crew) => {
                          const crewBlocks = blocksByCrewId[crew.id] || [];
                          if (crewBlocks.length === 0) return null;
                          const crewMinutes = crewBlocks.reduce((sum, b) => sum + (b.visitConfig?.estimatedDurationMinutes || 0), 0);

                          return (
                            <div key={crew.id} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: getCrewColor(crew) }}
                                />
                                <span className="font-medium text-sm">{crew.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({crewBlocks.length} stops • {Math.floor(crewMinutes / 60)}h {crewMinutes % 60}m)
                                </span>
                              </div>
                              <div className="pl-5 space-y-1.5">
                                {crewBlocks.map((block, idx) => (
                                  <div
                                    key={block.id}
                                    className="flex items-start gap-3 p-2 rounded-md border text-sm"
                                    style={{ borderLeftColor: getCrewColor(crew), borderLeftWidth: 3 }}
                                    data-testid={`daily-block-${block.id}`}
                                  >
                                    <span className="text-muted-foreground font-mono text-xs mt-0.5">
                                      {idx + 1}.
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate">
                                        {block.customer?.name || "Unknown Customer"}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                        <span className="flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {block.visitConfig?.estimatedDurationMinutes || 0} min
                                        </span>
                                        {block.customer?.street && (
                                          <span className="flex items-center gap-1 truncate">
                                            <MapPin className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{block.customer.city}, {block.customer.state}</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-1.5">
                {todaysBlocks.slice(0, 4).map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center gap-2 p-2 rounded-md text-sm"
                    style={{ 
                      backgroundColor: `${getCrewColor(block.crew)}15`,
                      borderLeft: `3px solid ${getCrewColor(block.crew)}`
                    }}
                    data-testid={`preview-block-${block.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{block.customer?.name || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{block.crew?.name}</span>
                        <span>•</span>
                        <span>{block.visitConfig?.estimatedDurationMinutes || 0} min</span>
                      </div>
                    </div>
                  </div>
                ))}
                {todaysBlocks.length > 4 && (
                  <div className="text-xs text-muted-foreground text-center py-1">
                    +{todaysBlocks.length - 4} more properties
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
