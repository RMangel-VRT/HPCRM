import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, GripVertical, Clock, Users, Calendar, X, Trash2, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type {
  MaintenanceCrew,
  MaintenanceVisitConfig,
  WeeklyScheduleTemplate,
  ScheduleBlock,
  Customer,
  DayOfWeek,
} from "@shared/schema";

const DAYS_OF_WEEK: { key: DayOfWeek; label: string; short: string }[] = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
];

interface VisitConfigWithCustomer extends MaintenanceVisitConfig {
  customer?: Customer;
}

interface ScheduleBlockWithDetails extends ScheduleBlock {
  visitConfig?: VisitConfigWithCustomer;
}

export default function WeeklySchedulerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showAddPropertyDialog, setShowAddPropertyDialog] = useState(false);
  const [addPropertyTarget, setAddPropertyTarget] = useState<{ crewId: string; day: DayOfWeek } | null>(null);
  const [searchProperty, setSearchProperty] = useState("");

  const canEdit = user?.activeRole === "admin" || user?.activeRole === "office";

  const { data: crews = [], isLoading: crewsLoading } = useQuery<MaintenanceCrew[]>({
    queryKey: ["/api/maintenance-crews"],
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<WeeklyScheduleTemplate[]>({
    queryKey: ["/api/schedule-templates"],
  });

  const { data: visitConfigs = [], isLoading: configsLoading } = useQuery<MaintenanceVisitConfig[]>({
    queryKey: ["/api/maintenance-visit-configs"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates.find((t) => t.isActive) || templates[0];

  const { data: blocks = [], isLoading: blocksLoading } = useQuery<ScheduleBlock[]>({
    queryKey: ["/api/schedule-templates", activeTemplate?.id, "blocks"],
    enabled: !!activeTemplate?.id,
  });

  const activeCrews = crews.filter((c) => c.isActive);

  const visitConfigsWithCustomers: VisitConfigWithCustomer[] = visitConfigs.map((vc) => ({
    ...vc,
    customer: customers.find((c) => c.id === vc.customerId),
  }));

  const blocksWithDetails: ScheduleBlockWithDetails[] = blocks.map((block) => ({
    ...block,
    visitConfig: visitConfigsWithCustomers.find((vc) => vc.id === block.visitConfigId),
  }));

  const scheduledConfigIds = new Set(blocks.map((b) => b.visitConfigId));
  const unscheduledConfigs = visitConfigsWithCustomers.filter(
    (vc) => vc.isActive && !scheduledConfigIds.has(vc.id)
  );

  const addBlockMutation = useMutation({
    mutationFn: async (data: { templateId: string; visitConfigId: string; crewId: string; dayOfWeek: DayOfWeek }) => {
      return apiRequest("POST", `/api/schedule-templates/${data.templateId}/blocks`, {
        visitConfigId: data.visitConfigId,
        crewId: data.crewId,
        dayOfWeek: data.dayOfWeek,
        sortOrder: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates", activeTemplate?.id, "blocks"] });
      setShowAddPropertyDialog(false);
      setAddPropertyTarget(null);
      setSearchProperty("");
      toast({ title: "Property added to schedule" });
    },
    onError: () => {
      toast({ title: "Failed to add property", variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      return apiRequest("DELETE", `/api/schedule-blocks/${blockId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates", activeTemplate?.id, "blocks"] });
      toast({ title: "Property removed from schedule" });
    },
    onError: () => {
      toast({ title: "Failed to remove property", variant: "destructive" });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/schedule-templates", { name: "New Schedule Template" });
      return res.json() as Promise<WeeklyScheduleTemplate>;
    },
    onSuccess: (data: WeeklyScheduleTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      setSelectedTemplateId(data.id);
      toast({ title: "Template created" });
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const getBlocksForCell = (crewId: string, day: DayOfWeek) => {
    return blocksWithDetails.filter((b) => b.crewId === crewId && b.dayOfWeek === day);
  };

  const handleAddPropertyClick = (crewId: string, day: DayOfWeek) => {
    if (!canEdit) return;
    setAddPropertyTarget({ crewId, day });
    setShowAddPropertyDialog(true);
  };

  const handleAddProperty = (configId: string) => {
    if (!activeTemplate || !addPropertyTarget) return;
    addBlockMutation.mutate({
      templateId: activeTemplate.id,
      visitConfigId: configId,
      crewId: addPropertyTarget.crewId,
      dayOfWeek: addPropertyTarget.day,
    });
  };

  const filteredUnscheduled = unscheduledConfigs.filter((vc) =>
    vc.customer?.name?.toLowerCase().includes(searchProperty.toLowerCase())
  );

  const isLoading = crewsLoading || templatesLoading || configsLoading || blocksLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activeCrews.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Weekly Scheduler
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign properties to crews for weekly maintenance visits
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Crews Configured</h3>
            <p className="text-muted-foreground mb-4">
              Create maintenance crews in Settings before building a schedule.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Weekly Scheduler
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign properties to crews for weekly maintenance visits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={activeTemplate?.id || ""}
            onValueChange={(val) => setSelectedTemplateId(val)}
          >
            <SelectTrigger className="w-[200px]" data-testid="select-template">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => createTemplateMutation.mutate()}
              disabled={createTemplateMutation.isPending}
              data-testid="button-new-template"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Template
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid gap-2" style={{ gridTemplateColumns: `180px repeat(${DAYS_OF_WEEK.length}, 1fr)` }}>
              <div className="p-2 font-medium text-sm text-muted-foreground">Crew</div>
              {DAYS_OF_WEEK.map((day) => (
                <div key={day.key} className="p-2 font-medium text-center text-sm">
                  <span className="hidden sm:inline">{day.label}</span>
                  <span className="sm:hidden">{day.short}</span>
                </div>
              ))}

              {activeCrews.map((crew) => (
                <>
                  <div key={`crew-${crew.id}`} className="p-2 flex items-start">
                    <div>
                      <div className="font-medium text-sm" data-testid={`text-crew-name-${crew.id}`}>
                        {crew.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {crew.defaultHoursPerDay}h/day
                      </div>
                    </div>
                  </div>
                  {DAYS_OF_WEEK.map((day) => {
                    const cellBlocks = getBlocksForCell(crew.id, day.key);
                    return (
                      <Card
                        key={`${crew.id}-${day.key}`}
                        className="min-h-[100px] p-1"
                        data-testid={`cell-${crew.id}-${day.key}`}
                      >
                        <div className="space-y-1">
                          {cellBlocks.map((block) => (
                            <div
                              key={block.id}
                              className="group bg-accent/50 rounded p-1.5 text-xs relative"
                              data-testid={`block-${block.id}`}
                            >
                              <div className="flex items-start gap-1">
                                <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {block.visitConfig?.customer?.name || "Unknown"}
                                  </div>
                                  <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                                    <Clock className="h-3 w-3" />
                                    {block.visitConfig?.estimatedDurationMinutes || 0}m
                                  </div>
                                </div>
                                {canEdit && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => deleteBlockMutation.mutate(block.id)}
                                    data-testid={`button-remove-block-${block.id}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-7 text-xs text-muted-foreground"
                              onClick={() => handleAddPropertyClick(crew.id, day.key)}
                              data-testid={`button-add-${crew.id}-${day.key}`}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </div>

        <Card className="w-full lg:w-80 shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Unscheduled Properties
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unscheduledConfigs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                All configured properties are scheduled
              </p>
            ) : (
              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-2">
                  {unscheduledConfigs.map((vc) => (
                    <div
                      key={vc.id}
                      className="p-2 rounded border bg-card hover-elevate cursor-pointer"
                      data-testid={`unscheduled-${vc.id}`}
                    >
                      <div className="font-medium text-sm truncate">
                        {vc.customer?.name || "Unknown Customer"}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {vc.estimatedDurationMinutes}m
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {vc.crewSize}
                        </span>
                        {vc.preferredDay && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {vc.preferredDay.slice(0, 3)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddPropertyDialog} onOpenChange={setShowAddPropertyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add Property to{" "}
              {addPropertyTarget && (
                <span className="capitalize">
                  {DAYS_OF_WEEK.find((d) => d.key === addPropertyTarget.day)?.label} -{" "}
                  {activeCrews.find((c) => c.id === addPropertyTarget.crewId)?.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Search properties..."
              value={searchProperty}
              onChange={(e) => setSearchProperty(e.target.value)}
              data-testid="input-search-property"
            />
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {filteredUnscheduled.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No unscheduled properties found
                  </p>
                ) : (
                  filteredUnscheduled.map((vc) => (
                    <div
                      key={vc.id}
                      className="flex items-center justify-between p-2 rounded border bg-card hover-elevate cursor-pointer"
                      onClick={() => handleAddProperty(vc.id)}
                      data-testid={`select-property-${vc.id}`}
                    >
                      <div>
                        <div className="font-medium text-sm">{vc.customer?.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {vc.estimatedDurationMinutes}m - {vc.crewSize} crew
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPropertyDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
