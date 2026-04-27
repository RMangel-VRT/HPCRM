import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DatePickerField } from "@/components/DatePickerField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Search,
  ClipboardCheck,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Archive,
  AlertTriangle,
  Droplets,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { CampaignWithProgress, Customer, CompanyUser, User } from "@shared/schema";

interface CompanyUserWithDetails {
  companyUser: CompanyUser;
  user: User;
  isSuperAdmin: boolean;
}

export default function CampaignsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery<CampaignWithProgress[]>({
    queryKey: ["/api/campaigns"],
  });

  const filteredCampaigns = useMemo(() => {
    let result = campaigns;
    if (statusFilter !== "all") {
      result = result.filter(c => c.status === statusFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(s) ||
        c.description?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [campaigns, statusFilter, search]);

  const canManage = user?.activeRole === "admin" || user?.activeRole === "office";

  const formatWindowDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return format(d, "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatWindow = (start: string, end: string) => {
    const startDate = formatWindowDate(start);
    const endDate = formatWindowDate(end);
    return `${startDate} – ${endDate}`;
  };

  const isOverdue = (campaign: CampaignWithProgress) => {
    if (campaign.status !== "active") return false;
    try {
      const endDate = new Date(campaign.windowEnd + "T23:59:59");
      return endDate < new Date();
    } catch {
      return false;
    }
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (status === "archived") return <Archive className="w-4 h-4 text-muted-foreground" />;
    return <Clock className="w-4 h-4 text-blue-600" />;
  };

  const statusBadge = (status: string) => {
    if (status === "completed") return <Badge variant="default" className="bg-green-600">{t("campaigns.completed")}</Badge>;
    if (status === "archived") return <Badge variant="secondary">{t("campaigns.archived")}</Badge>;
    return <Badge variant="default">{t("campaigns.active")}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-campaigns-title">{t("campaigns.title")}</h1>
          <p className="text-muted-foreground">{t("campaigns.description")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)} data-testid="button-create-campaign">
            <Plus className="w-4 h-4 mr-2" />
            {t("campaigns.newCampaign")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("campaigns.searchPlaceholder")}
            className="pl-9"
            data-testid="input-campaign-search"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList data-testid="tabs-campaign-status-filter">
            <TabsTrigger value="all" data-testid="tab-campaigns-all">{t("common.all")}</TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-campaigns-active">{t("campaigns.active")}</TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-campaigns-completed">{t("campaigns.completed")}</TabsTrigger>
            <TabsTrigger value="archived" data-testid="tab-campaigns-archived">{t("campaigns.archived")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardCheck}
              title={(search.trim() || statusFilter !== "all") ? t("campaigns.noCampaigns") : "No campaigns yet"}
              description={(search.trim() || statusFilter !== "all")
                ? "No campaigns match your current filters. Try adjusting the search or status filter."
                : "Create your first campaign to start managing work across multiple properties."}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredCampaigns.map(campaign => {
            const progressPercent = campaign.totalItems > 0
              ? Math.round(((campaign.completedItems + campaign.skippedItems) / campaign.totalItems) * 100)
              : 0;
            return (
              <Card
                key={campaign.id}
                className="hover-elevate cursor-pointer"
                onClick={() => navigate(`/dashboard/campaigns/${campaign.id}`)}
                data-testid={`card-campaign-${campaign.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusIcon(campaign.status)}
                        <h3 className="font-semibold text-base truncate" data-testid={`text-campaign-title-${campaign.id}`}>
                          {campaign.title}
                        </h3>
                        {statusBadge(campaign.status)}
                        <Badge variant="outline" className="text-xs" data-testid={`badge-campaign-category-${campaign.id}`}>
                          {campaign.category === "irrigation" && <Droplets className="w-3 h-3 mr-1" />}
                          {campaign.category === "chemical" ? t("campaigns.categoryChemical") : campaign.category === "irrigation" ? t("campaigns.categoryIrrigation") : t("campaigns.categoryGeneral")}
                        </Badge>
                      </div>
                      {campaign.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{campaign.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>{t("campaigns.window")}: {formatWindow(campaign.windowStart, campaign.windowEnd)}</span>
                        {isOverdue(campaign) && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {t("campaigns.overdue")}
                          </Badge>
                        )}
                        {(campaign.assignedToName || campaign.assignedToName2) && (
                          <span>{t("campaigns.assignedTo")}: {[campaign.assignedToName, campaign.assignedToName2].filter(Boolean).join(", ")}</span>
                        )}
                        {campaign.seasonName && (
                          <span data-testid={`text-campaign-season-${campaign.id}`}>Season: {campaign.seasonName}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-40 space-y-1 shrink-0">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{campaign.completedItems + campaign.skippedItems}/{campaign.totalItems}</span>
                        <span>{progressPercent}%</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateCampaignDialog open={showCreate} onOpenChange={setShowCreate} />
      )}
    </div>
  );
}

function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<"details" | "customers" | "review">("details");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [assignedToId2, setAssignedToId2] = useState<string>("");
  const [windowStart, setWindowStart] = useState<Date | undefined>(undefined);
  const [windowEnd, setWindowEnd] = useState<Date | undefined>(undefined);
  const [category, setCategory] = useState<"general" | "chemical" | "irrigation">("general");
  const [irrigationSubtype, setIrrigationSubtype] = useState<"spring_turn_on" | "winterization" | "custom">("spring_turn_on");
  const [checklistTasks, setChecklistTasks] = useState<{ label: string; order: number }[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [customerSearch, setCustomerSearch] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: companyUsersData = [] } = useQuery<CompanyUserWithDetails[]>({
    queryKey: ["/api/companies/users"],
  });

  const selectableCustomers = useMemo(() => {
    return customers.filter(c => c.name !== "Internal Tasks" && c.active === "true");
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return selectableCustomers;
    const s = customerSearch.toLowerCase();
    return selectableCustomers.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.city.toLowerCase().includes(s)
    );
  }, [selectableCustomers, customerSearch]);

  const allAssignableMembers = companyUsersData
    .filter(item =>
      item.companyUser.role === "admin" ||
      item.companyUser.role === "office" ||
      item.companyUser.role === "field_manager" ||
      item.companyUser.role === "field" ||
      item.companyUser.role === "chemical_manager"
    )
    .map(item => ({
      id: item.companyUser.userId,
      name: item.user.name,
      role: item.companyUser.role,
    }));

  const chemicalManagers = allAssignableMembers.filter(m => m.role === "chemical_manager");

  useEffect(() => {
    if (category === "chemical" && assignedToId) {
      const isChemicalManager = chemicalManagers.some(m => m.id === assignedToId);
      if (!isChemicalManager) {
        setAssignedToId("");
      }
    }
  }, [category, assignedToId, chemicalManagers]);

  useEffect(() => {
    if (assignedToId2 && assignedToId2 === assignedToId) {
      setAssignedToId2("");
    }
  }, [assignedToId, assignedToId2]);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string | null; assignedToId: string | null; assignedToId2: string | null; windowStart: string; windowEnd: string; customerIds: string[]; category: string; subtype?: string; checklistTasks?: { label: string; order: number }[] }) => {
      const res = await apiRequest("POST", "/api/campaigns", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: t("campaigns.created") });
      onOpenChange(false);
      navigate(`/dashboard/campaigns/${data.id}`);
    },
    onError: () => {
      toast({ title: t("campaigns.createFailed"), variant: "destructive" });
    },
  });

  const SPRING_TURN_ON_TASKS = [
    "Locate and expose all valve boxes",
    "Turn on main water supply slowly",
    "Check backflow preventer and test",
    "Walk each zone — check heads for damage",
    "Adjust head spray patterns and arc",
    "Check for leaks at all connections",
    "Program controller schedule",
    "Run full cycle and verify coverage",
  ];
  const WINTERIZATION_TASKS = [
    "Shut off main water supply",
    "Open drain valves",
    "Blow out each zone with compressor",
    "Verify all zones cleared of water",
    "Insulate backflow preventer",
    "Disconnect and drain hoses",
    "Set controller to rain/off mode",
    "Mark and cover valve boxes",
  ];

  const handleSubtypeChange = (value: "spring_turn_on" | "winterization" | "custom") => {
    setIrrigationSubtype(value);
    if (value === "spring_turn_on") {
      setChecklistTasks(SPRING_TURN_ON_TASKS.map((label, i) => ({ label, order: i })));
    } else if (value === "winterization") {
      setChecklistTasks(WINTERIZATION_TASKS.map((label, i) => ({ label, order: i })));
    } else {
      setChecklistTasks([]);
    }
  };

  const handleNext = () => {
    if (step === "details") {
      if (!title.trim()) {
        toast({ title: t("campaigns.titleRequired"), variant: "destructive" });
        return;
      }
      if (!windowStart || !windowEnd) {
        toast({ title: t("campaigns.datesRequired"), variant: "destructive" });
        return;
      }
      if (category === "irrigation" && checklistTasks.length === 0) {
        toast({ title: t("campaigns.irrigationTasksRequired"), variant: "destructive" });
        return;
      }
      setStep("customers");
    } else if (step === "customers") {
      if (selectedCustomerIds.size === 0) {
        toast({ title: t("campaigns.selectProperties"), variant: "destructive" });
        return;
      }
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "customers") setStep("details");
    else if (step === "review") setStep("customers");
  };

  const handleSubmit = () => {
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      assignedToId: assignedToId || null,
      assignedToId2: (assignedToId2 && assignedToId2 !== "none") ? assignedToId2 : null,
      windowStart: windowStart ? format(windowStart, "yyyy-MM-dd") : "",
      windowEnd: windowEnd ? format(windowEnd, "yyyy-MM-dd") : "",
      customerIds: Array.from(selectedCustomerIds),
      category,
      ...(category === "irrigation" ? { subtype: irrigationSubtype, checklistTasks } : {}),
    });
  };

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCustomers = selectableCustomers.filter(c => selectedCustomerIds.has(c.id));
  const assigneePool = category === "chemical" ? chemicalManagers : allAssignableMembers;
  const assigneeName = allAssignableMembers.find(m => m.id === assignedToId)?.name || t("common.unassigned");
  const assignee2Name = allAssignableMembers.find(m => m.id === assignedToId2)?.name;
  const assigneePool2 = assigneePool.filter(m => m.id !== assignedToId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            {t("campaigns.newCampaign")}
            <Badge variant="secondary" className="ml-2">
              {step === "details" ? t("campaigns.step1") : step === "customers" ? t("campaigns.step2") : t("campaigns.step3")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {step === "details" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("common.title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("campaigns.titlePlaceholder")}
                data-testid="input-campaign-title"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.description")} ({t("common.optional")})</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("campaigns.descriptionPlaceholder")}
                rows={3}
                data-testid="input-campaign-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("campaigns.windowStart")}</Label>
                <DatePickerField
                  value={windowStart}
                  onChange={setWindowStart}
                  placeholder={t("common.select")}
                  data-testid="button-campaign-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("campaigns.windowEnd")}</Label>
                <DatePickerField
                  value={windowEnd}
                  onChange={setWindowEnd}
                  placeholder={t("common.select")}
                  data-testid="button-campaign-end-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("campaigns.assignTo")} ({t("common.optional")})</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger data-testid="select-campaign-assignee">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {assigneePool.map((m, idx) => (
                    <SelectItem key={m.id} value={m.id} data-testid={`select-campaign-assignee-${idx}`}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Second Assignee ({t("common.optional")})</Label>
              <Select value={assignedToId2} onValueChange={setAssignedToId2}>
                <SelectTrigger data-testid="select-campaign-assignee2">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {assigneePool2.map((m, idx) => (
                    <SelectItem key={m.id} value={m.id} data-testid={`select-campaign-assignee2-${idx}`}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("campaigns.categoryLabel")}</Label>
              <Select value={category} onValueChange={(v) => {
                const val = v as "general" | "chemical" | "irrigation";
                setCategory(val);
                if (val === "irrigation") {
                  handleSubtypeChange("spring_turn_on");
                }
              }}>
                <SelectTrigger data-testid="select-campaign-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general" data-testid="select-campaign-category-general">{t("campaigns.categoryGeneral")}</SelectItem>
                  <SelectItem value="chemical" data-testid="select-campaign-category-chemical">{t("campaigns.categoryChemical")}</SelectItem>
                  <SelectItem value="irrigation" data-testid="select-campaign-category-irrigation">{t("campaigns.categoryIrrigation")}</SelectItem>
                </SelectContent>
              </Select>
              {category === "chemical" && (
                <p className="text-xs text-muted-foreground">{t("campaigns.categoryDescription")}</p>
              )}
              {category === "irrigation" && (
                <p className="text-xs text-muted-foreground">{t("campaigns.irrigationDescription")}</p>
              )}
            </div>
            {category === "irrigation" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("campaigns.irrigationSubtype")}</Label>
                  <Select value={irrigationSubtype} onValueChange={(v) => handleSubtypeChange(v as "spring_turn_on" | "winterization" | "custom")}>
                    <SelectTrigger data-testid="select-irrigation-subtype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spring_turn_on" data-testid="select-subtype-spring">{t("campaigns.subtypeSpringTurnOn")}</SelectItem>
                      <SelectItem value="winterization" data-testid="select-subtype-winter">{t("campaigns.subtypeWinterization")}</SelectItem>
                      <SelectItem value="custom" data-testid="select-subtype-custom">{t("campaigns.subtypeCustom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("campaigns.checklistTasks")}</Label>
                  <ScrollArea className="max-h-[200px] border rounded-md">
                    <div className="p-2 space-y-1">
                      {checklistTasks.map((task, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30" data-testid={`checklist-task-row-${idx}`}>
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                          <Input
                            value={task.label}
                            onChange={(e) => {
                              const updated = [...checklistTasks];
                              updated[idx] = { ...updated[idx], label: e.target.value };
                              setChecklistTasks(updated);
                            }}
                            className="flex-1 text-sm"
                            placeholder={t("campaigns.taskLabelPlaceholder")}
                            data-testid={`input-checklist-task-${idx}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const updated = checklistTasks.filter((_, i) => i !== idx).map((t, i) => ({ ...t, order: i }));
                              setChecklistTasks(updated);
                            }}
                            data-testid={`button-remove-task-${idx}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChecklistTasks([...checklistTasks, { label: "", order: checklistTasks.length }])}
                    data-testid="button-add-checklist-task"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {t("campaigns.addTask")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "customers" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder={t("campaigns.searchProperties")}
                  className="pl-9"
                  data-testid="input-campaign-customer-search"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCustomerIds(new Set(filteredCustomers.map(c => c.id)))}
                data-testid="button-campaign-select-all"
              >
                {t("campaigns.selectAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCustomerIds(new Set())}
                data-testid="button-campaign-clear-all"
              >
                {t("common.clear")}
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedCustomerIds.size} / {selectableCustomers.length} {t("common.properties")}
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredCustomers.map(customer => (
                  <div
                    key={customer.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate ${
                      selectedCustomerIds.has(customer.id) ? "bg-primary/10" : ""
                    }`}
                    onClick={() => toggleCustomer(customer.id)}
                    data-testid={`campaign-customer-row-${customer.id}`}
                  >
                    <Checkbox
                      checked={selectedCustomerIds.has(customer.id)}
                      onCheckedChange={() => toggleCustomer(customer.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{customer.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {customer.city}, {customer.state}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{t("common.title")}</span>
                  <span className="text-sm font-medium text-right">{title}</span>
                </div>
                {description && (
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{t("common.description")}</span>
                    <span className="text-sm text-right">{description}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{t("campaigns.window")}</span>
                  <span className="text-sm">
                    {windowStart ? format(windowStart, "MMM d, yyyy") : ""} — {windowEnd ? format(windowEnd, "MMM d, yyyy") : ""}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{t("campaigns.categoryLabel")}</span>
                  <span className="text-sm font-medium">{category === "chemical" ? t("campaigns.categoryChemical") : category === "irrigation" ? t("campaigns.categoryIrrigation") : t("campaigns.categoryGeneral")}</span>
                </div>
                {category === "irrigation" && (
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{t("campaigns.irrigationSubtype")}</span>
                    <span className="text-sm font-medium">
                      {irrigationSubtype === "spring_turn_on" ? t("campaigns.subtypeSpringTurnOn") : irrigationSubtype === "winterization" ? t("campaigns.subtypeWinterization") : t("campaigns.subtypeCustom")}
                    </span>
                  </div>
                )}
                {category === "irrigation" && checklistTasks.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{t("campaigns.checklistTasks")}</span>
                    <span className="text-sm font-medium">{checklistTasks.length} tasks</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{t("campaigns.assignedTo")}</span>
                  <span className="text-sm">{assigneeName}</span>
                </div>
                {assignee2Name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Second Assignee</span>
                    <span className="text-sm">{assignee2Name}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{t("common.properties")}</span>
                  <span className="text-sm font-medium">{selectedCustomerIds.size}</span>
                </div>
              </CardContent>
            </Card>
            <div className="text-sm text-muted-foreground">
              {t("campaigns.reviewNote")}
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2">
          <div>
            {step !== "details" && (
              <Button variant="outline" onClick={handleBack} data-testid="button-campaign-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("common.back")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-campaign-cancel">
              {t("common.cancel")}
            </Button>
            {step === "review" ? (
              <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-campaign-submit">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("campaigns.createCampaign")}
              </Button>
            ) : (
              <Button onClick={handleNext} data-testid="button-campaign-next">
                {t("common.next")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
