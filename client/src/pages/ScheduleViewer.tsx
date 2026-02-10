import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useRef, useCallback } from "react";
import { AlertCircle, Clock, Printer, Download, MapPin, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CREW_COLORS, type MaintenanceCrew, type WeeklyScheduleTemplate, type ScheduleBlock, type MaintenanceVisitConfig, type Customer } from "@shared/schema";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

interface ScheduleBlockWithDetails extends ScheduleBlock {
  visitConfig?: MaintenanceVisitConfig;
  customer?: Customer;
  crew?: MaintenanceCrew;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function generatePrintContent(
  templateName: string,
  crews: MaintenanceCrew[],
  blocksByCrew: Record<string, Record<DayOfWeek, ScheduleBlockWithDetails[]>>,
  getCrewColor: (crew?: MaintenanceCrew) => string,
  filterCrewId?: string
): string {
  const filteredCrews = filterCrewId ? crews.filter(c => c.id === filterCrewId) : crews;

  const crewSections = filteredCrews.map(crew => {
    const crewColor = getCrewColor(crew);
    const crewBlocks = blocksByCrew[crew.id] || {};
    const totalMinutes = DAYS_OF_WEEK.reduce((sum, day) => {
      return sum + (crewBlocks[day] || []).reduce((s, b) => s + (b.visitConfig?.estimatedDurationMinutes || 0), 0);
    }, 0);
    const totalProperties = DAYS_OF_WEEK.reduce((sum, day) => sum + (crewBlocks[day] || []).length, 0);

    const dayColumns = DAYS_OF_WEEK.map(day => {
      const dayBlocks = crewBlocks[day] || [];
      const dayMinutes = dayBlocks.reduce((s, b) => s + (b.visitConfig?.estimatedDurationMinutes || 0), 0);
      const propList = dayBlocks.length === 0
        ? '<div style="color: #999; font-style: italic; padding: 8px 0;">No properties</div>'
        : dayBlocks.map(b => `
          <div style="padding: 4px 0; border-bottom: 1px solid #eee;">
            <div style="font-weight: 500; font-size: 11px;">${b.customer?.name || "Unknown"}</div>
            <div style="color: #666; font-size: 10px;">${b.visitConfig?.estimatedDurationMinutes || 0} min</div>
          </div>
        `).join('');

      return `
        <td style="vertical-align: top; padding: 4px 6px; border: 1px solid #ddd; width: ${100/6}%;">
          <div style="font-weight: 600; font-size: 10px; color: #666; margin-bottom: 4px; text-transform: uppercase;">${DAY_SHORT[day]}</div>
          ${propList}
          ${dayBlocks.length > 0 ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #ccc; font-size: 10px; color: #666;">${dayBlocks.length} props &middot; ${formatMinutes(dayMinutes)}</div>` : ''}
        </td>
      `;
    }).join('');

    return `
      <div style="margin-bottom: 24px; page-break-inside: avoid;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="width: 14px; height: 14px; border-radius: 50%; background: ${crewColor};"></div>
          <span style="font-weight: 700; font-size: 14px;">${crew.name}</span>
          <span style="color: #666; font-size: 12px;">${totalProperties} properties &middot; ${formatMinutes(totalMinutes)} total</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr>${dayColumns}</tr>
        </table>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${templateName} - Weekly Schedule</title>
      <style>
        @media print {
          body { margin: 0; padding: 16px; }
          .no-print { display: none !important; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; }
      </style>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px;">
        <h1 style="margin: 0; font-size: 20px;">${templateName}</h1>
        <span style="color: #666; font-size: 12px;">Printed ${new Date().toLocaleDateString()}</span>
      </div>
      ${crewSections}
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
}

export default function ScheduleViewer() {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<WeeklyScheduleTemplate[]>({
    queryKey: ["/api/schedule-templates"],
  });

  const { data: crews = [], isLoading: loadingCrews } = useQuery<MaintenanceCrew[]>({
    queryKey: ["/api/maintenance-crews"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const { data: blocks = [], isLoading: loadingBlocks } = useQuery<ScheduleBlock[]>({
    queryKey: ["/api/schedule-templates", activeTemplate?.id, "blocks"],
    enabled: !!activeTemplate?.id,
  });

  const { data: visitConfigs = [] } = useQuery<MaintenanceVisitConfig[]>({
    queryKey: ["/api/maintenance-visit-configs"],
  });

  const activeCrews = crews.filter((c) => c.isActive);

  const blocksWithDetails: ScheduleBlockWithDetails[] = useMemo(() => {
    if (!activeTemplate) return [];
    return blocks
      .map((block) => {
        const config = visitConfigs.find((v) => v.id === block.visitConfigId);
        const customer = customers.find((c) => c.id === config?.customerId);
        const crew = crews.find((c) => c.id === block.crewId);
        return { ...block, visitConfig: config, customer, crew };
      })
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [activeTemplate, blocks, visitConfigs, customers, crews]);

  const getCrewColor = useCallback((crew?: MaintenanceCrew) => {
    if (crew?.color) return crew.color;
    const crewIndex = crews.findIndex((c) => c.id === crew?.id);
    return CREW_COLORS[crewIndex % CREW_COLORS.length];
  }, [crews]);

  const blocksByCrew = useMemo(() => {
    const result: Record<string, Record<DayOfWeek, ScheduleBlockWithDetails[]>> = {};
    for (const crew of activeCrews) {
      const crewDays: Record<DayOfWeek, ScheduleBlockWithDetails[]> = {} as any;
      for (const day of DAYS_OF_WEEK) {
        crewDays[day] = blocksWithDetails.filter(b => b.crewId === crew.id && b.dayOfWeek === day);
      }
      result[crew.id] = crewDays;
    }
    return result;
  }, [activeCrews, blocksWithDetails]);

  const handlePrint = useCallback((crewId?: string) => {
    if (!activeTemplate) return;
    const html = generatePrintContent(
      activeTemplate.name,
      activeCrews,
      blocksByCrew,
      getCrewColor,
      crewId
    );
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  }, [activeTemplate, activeCrews, blocksByCrew, getCrewColor]);

  const isLoading = loadingTemplates || loadingCrews || loadingBlocks;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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

  const totalProperties = blocksWithDetails.length;
  const totalMinutes = blocksWithDetails.reduce((sum, b) => sum + (b.visitConfig?.estimatedDurationMinutes || 0), 0);

  return (
    <div className="space-y-4" data-testid="schedule-viewer" ref={contentRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
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
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {totalProperties} properties
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatMinutes(totalMinutes)} total
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-print-schedule">
              <Printer className="h-4 w-4 mr-1" />
              Print / PDF
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handlePrint()} data-testid="menu-print-all">
              <Download className="h-4 w-4 mr-2" />
              Full Schedule
            </DropdownMenuItem>
            {activeCrews.length > 0 && <DropdownMenuSeparator />}
            {activeCrews.map(crew => (
              <DropdownMenuItem
                key={crew.id}
                onClick={() => handlePrint(crew.id)}
                data-testid={`menu-print-crew-${crew.id}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: getCrewColor(crew) }}
                  />
                  {crew.name}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        {activeCrews.map((crew) => {
          const crewBlocks = blocksByCrew[crew.id] || {};
          const crewTotalMinutes = DAYS_OF_WEEK.reduce((sum, day) => {
            return sum + (crewBlocks[day] || []).reduce((s, b) => s + (b.visitConfig?.estimatedDurationMinutes || 0), 0);
          }, 0);
          const crewTotalProperties = DAYS_OF_WEEK.reduce((sum, day) => sum + (crewBlocks[day] || []).length, 0);
          const crewColor = getCrewColor(crew);
          const capacityMinutes = (crew.defaultHoursPerDay || 8) * 60;

          return (
            <Card key={crew.id} data-testid={`crew-section-${crew.id}`}>
              <div
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b"
                style={{ borderLeftWidth: 4, borderLeftColor: crewColor }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: crewColor }}
                  />
                  <span className="font-semibold" data-testid={`text-crew-header-${crew.id}`}>{crew.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {crewTotalProperties} {crewTotalProperties === 1 ? 'property' : 'properties'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatMinutes(crewTotalMinutes)} / week
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {crew.defaultHoursPerDay}h / day capacity
                  </span>
                </div>
              </div>
              <CardContent className="p-0">
                <div className="grid grid-cols-6 divide-x">
                  {DAYS_OF_WEEK.map((day) => {
                    const dayBlocks = crewBlocks[day] || [];
                    const dayMinutes = dayBlocks.reduce((s, b) => s + (b.visitConfig?.estimatedDurationMinutes || 0), 0);
                    const utilization = capacityMinutes > 0 ? Math.round((dayMinutes / capacityMinutes) * 100) : 0;
                    const isOverCapacity = dayMinutes > capacityMinutes;

                    return (
                      <div key={day} className="min-h-[120px] flex flex-col" data-testid={`crew-${crew.id}-day-${day}`}>
                        <div className="px-2 py-1.5 bg-muted/40 border-b flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                            {DAY_SHORT[day]}
                          </span>
                          {dayBlocks.length > 0 && (
                            <span className={`text-[10px] font-medium ${isOverCapacity ? "text-destructive" : "text-muted-foreground"}`}>
                              {formatMinutes(dayMinutes)}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 p-1.5 space-y-1">
                          {dayBlocks.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground text-center py-3 italic">
                              Off
                            </div>
                          ) : (
                            dayBlocks.map((block, idx) => (
                              <div
                                key={block.id}
                                className="px-2 py-1.5 rounded bg-accent/60 border border-border/50"
                                data-testid={`block-${block.id}`}
                              >
                                <div className="text-xs font-medium truncate" data-testid={`text-block-name-${block.id}`}>
                                  {idx + 1}. {block.customer?.name || "Unknown"}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                  <Clock className="h-2.5 w-2.5" />
                                  {block.visitConfig?.estimatedDurationMinutes || 0} min
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        {dayBlocks.length > 0 && (
                          <div className={`px-2 py-1 border-t text-[10px] flex items-center justify-between ${isOverCapacity ? "text-destructive bg-destructive/5" : "text-muted-foreground bg-muted/20"}`}>
                            <span>{dayBlocks.length} stops</span>
                            <span className="font-medium">{utilization}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeCrews.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active crews found. Add crews in the Builder tab.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
