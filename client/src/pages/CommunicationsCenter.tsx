import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearch } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { DatePickerField } from "@/components/DatePickerField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  MessageSquare,
  FileText,
  Search,
  Building2,
  CalendarDays,
  Tag,
  Link as LinkIcon,
  ClipboardList,
  Lock,
  AlertTriangle,
  ShieldAlert,
  Send,
  Phone,
  StickyNote,
  FileEdit,
  Users,
  Loader2,
  Scroll,
  LayoutTemplate,
  User,
  Clock,
  CheckCircle,
  Eye,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  MessagesSquare,
  Reply,
  UserCheck,
  Archive,
  XCircle,
  Calendar,
  AlertCircle,
  LayoutDashboard,
  ChevronRight,
  AlarmClock,
  CheckCircle2,
  Inbox,
  ChevronDown,
  Info,
  Star,
  Zap,
  Play,
  Trash2,
  Bot,
} from "lucide-react";
import type { Communication, Customer, CommunicationWithDetails, CommunicationAnalytics, CommunicationTemplate, CommunicationAuditLogWithUser, CommunicationAutomationRule } from "@shared/schema";
import { COMMUNICATION_TEMPLATE_CATEGORIES, COMMUNICATION_TEMPLATE_CATEGORY_LABELS } from "@shared/schema";
import ComposeDrawer from "@/components/ComposeDrawer";

type SectionFilter = "all" | "draft" | "sent" | "scheduled" | "follow_ups" | "templates" | "audit_log";
type ViewMode = "communications" | "automations";

/** Map URL ?view= param (which may use old or new format) to SectionFilter */
function resolveViewParam(raw: string | undefined): SectionFilter {
  const MAP: Record<string, SectionFilter> = {
    drafts: "draft",
    followups: "follow_ups",
    follow_ups: "follow_ups",
    draft: "draft",
    sent: "sent",
    scheduled: "scheduled",
    templates: "templates",
    audit_log: "audit_log",
    all: "all",
  };
  return (raw && MAP[raw]) ?? "all";
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  sms: Phone,
  note: StickyNote,
  letter: FileEdit,
};

type CommunicationWithOverdue = Communication & { isOverdue?: boolean };

const TYPE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  note: "Note",
  letter: "Letter",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  scheduled: "Scheduled",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};


function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status] ?? "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-normal capitalize ${colorClass}`}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  template_created: "Template Created",
  template_edited: "Template Edited",
  template_archived: "Template Archived",
  communication_sent: "Communication Sent",
  scheduled_send_cancelled: "Scheduled Send Cancelled",
  automation_edited: "Automation Edited",
  automation_toggled: "Automation Toggled",
};

const ACTION_TYPE_VARIANTS: Record<string, string> = {
  template_created: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  template_edited: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  template_archived: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  communication_sent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  scheduled_send_cancelled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  automation_edited: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  automation_toggled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
};

function ActionTypeBadge({ actionType }: { actionType: string }) {
  const colorClass = ACTION_TYPE_VARIANTS[actionType] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {ACTION_TYPE_LABELS[actionType] ?? actionType}
    </span>
  );
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  time_after_event: "Time After Event",
  time_before_event: "Time Before Event",
  recurring: "Recurring",
};

const EVENT_KEY_LABELS: Record<string, string> = {
  proposal_created: "Proposal Created",
  work_order_closed: "Work Order Closed",
  invoice_due_date: "Invoice Due Date",
  service_date: "Service Date",
};

function getTriggerSummary(rule: CommunicationAutomationRule): string {
  if (rule.triggerType === "recurring") {
    return `Every ${rule.recurringIntervalDays ?? "?"} days`;
  }
  const direction = rule.triggerType === "time_after_event" ? "after" : "before";
  const eventLabel = rule.eventKey ? (EVENT_KEY_LABELS[rule.eventKey] ?? rule.eventKey) : "?";
  return `${rule.delayDays ?? "?"} days ${direction} ${eventLabel}`;
}

function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildDetailSummary(log: CommunicationAuditLogWithUser): string {
  const details = log.actionDetails as Record<string, unknown> | null;
  if (!details) return "—";
  const parts: string[] = [];
  if (details.templateName) parts.push(`Template: ${details.templateName}`);
  if (details.subject) parts.push(`Subject: ${details.subject}`);
  if (details.customerName) parts.push(`Customer: ${details.customerName}`);
  if (details.recipientCount) parts.push(`Recipients: ${details.recipientCount}`);
  if (details.archived !== undefined) parts.push(details.archived ? "Archived" : "Unarchived");
  return parts.join(" · ") || "—";
}

// Permission helper — determines what the current user can do
function useCommPermissions() {
  const { user } = useAuth();
  const role = user?.activeRole;
  return {
    canView: role === "admin" || role === "office",
    canManageTemplates: role === "admin" || role === "office",
    canSend: role === "admin" || role === "office",
    canManageAutomations: role === "admin",
    isAdmin: role === "admin",
  };
}

// Access-denied locked state
function LockedState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16 gap-3">
      <ShieldAlert className="w-12 h-12 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Your current role does not have access to this section. Contact your administrator if you believe this is an error.
      </p>
    </div>
  );
}

// Pre-send validation error display
function ValidationErrors({ errors, onDismiss }: { errors: string[]; onDismiss: () => void }) {
  return (
    <Alert variant="destructive" className="mt-3" data-testid="alert-validation-errors">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Cannot send — please fix the following:</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4 mt-1 space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="text-sm" data-testid={`text-validation-error-${i}`}>{e}</li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-3" onClick={onDismiss} data-testid="button-dismiss-errors">
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// Audit Log Panel
function AuditLogPanel() {
  const { data: logs = [], isLoading } = useQuery<CommunicationAuditLogWithUser[]>({
    queryKey: ["/api/communications/audit-log"],
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b shrink-0">
        <h2 className="text-base font-semibold" data-testid="text-audit-log-title">Audit Log</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Last 200 actions in this company</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <ClipboardList className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No audit log entries yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-3"
                data-testid={`row-audit-log-${log.id}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <ActionTypeBadge actionType={log.actionType} />
                  <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-audit-time-${log.id}`}>
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1" data-testid={`text-audit-user-${log.id}`}>
                  By: {log.actionByUserName ?? "Unknown"}
                </p>
                <p className="text-xs text-foreground/70 mt-0.5 truncate" data-testid={`text-audit-detail-${log.id}`}>
                  {buildDetailSummary(log)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AutomationBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
      data-testid="badge-automation"
    >
      <Bot className="w-3 h-3" />
      Automation
    </span>
  );
}



const automationRuleFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  triggerType: z.enum(["time_after_event", "time_before_event", "recurring"]),
  eventKey: z.enum(["proposal_created", "work_order_closed", "invoice_due_date", "service_date"]).optional().nullable(),
  delayDays: z.coerce.number().int().min(0).optional().nullable(),
  recurringIntervalDays: z.coerce.number().int().min(1).optional().nullable(),
  templateId: z.string().optional().nullable(),
  recipientScope: z.enum(["primary_contact", "all_contacts"]),
  autoSend: z.boolean(),
  isEnabled: z.boolean(),
});

type AutomationRuleFormValues = z.infer<typeof automationRuleFormSchema>;

function AutomationRuleDialog({
  open,
  onClose,
  rule,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  rule?: CommunicationAutomationRule | null;
  templates: CommunicationTemplate[];
}) {
  const { toast } = useToast();
  const isEdit = !!rule;

  const form = useForm<AutomationRuleFormValues>({
    resolver: zodResolver(automationRuleFormSchema),
    defaultValues: {
      name: rule?.name ?? "",
      description: rule?.description ?? "",
      triggerType: rule?.triggerType ?? "time_after_event",
      eventKey: rule?.eventKey ?? null,
      delayDays: rule?.delayDays ?? 3,
      recurringIntervalDays: rule?.recurringIntervalDays ?? 7,
      templateId: rule?.templateId ?? "none",
      recipientScope: rule?.recipientScope ?? "primary_contact",
      autoSend: rule?.autoSend ?? false,
      isEnabled: rule?.isEnabled ?? true,
    },
  });

  const triggerType = form.watch("triggerType");

  const createMutation = useMutation({
    mutationFn: (data: AutomationRuleFormValues) =>
      apiRequest("POST", "/api/automation-rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Rule created", description: "Automation rule created successfully." });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create rule.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: AutomationRuleFormValues) =>
      apiRequest("PATCH", `/api/automation-rules/${rule?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Rule updated", description: "Automation rule updated successfully." });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update rule.", variant: "destructive" });
    },
  });

  function onSubmit(data: AutomationRuleFormValues) {
    if (triggerType !== "recurring") {
      data.recurringIntervalDays = null;
    } else {
      data.eventKey = null;
      data.delayDays = null;
    }
    if (data.templateId === "none") {
      data.templateId = null;
    }
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Automation Rule" : "New Automation Rule"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Proposal Follow-Up" data-testid="input-rule-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What does this rule do?"
                      data-testid="input-rule-description"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="triggerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trigger Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-trigger-type">
                        <SelectValue placeholder="Select trigger type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="time_after_event">Time After Event</SelectItem>
                      <SelectItem value="time_before_event">Time Before Event</SelectItem>
                      <SelectItem value="recurring">Recurring</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(triggerType === "time_after_event" || triggerType === "time_before_event") && (
              <>
                <FormField
                  control={form.control}
                  name="eventKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-event-key">
                            <SelectValue placeholder="Select an event" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="proposal_created">Proposal Created</SelectItem>
                          <SelectItem value="work_order_closed">Work Order Closed</SelectItem>
                          <SelectItem value="invoice_due_date">Invoice Due Date</SelectItem>
                          <SelectItem value="service_date">Service Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delayDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {triggerType === "time_after_event" ? "Days After Event" : "Days Before Event"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          data-testid="input-delay-days"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {triggerType === "recurring" && (
              <FormField
                control={form.control}
                name="recurringIntervalDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repeat Every (days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        data-testid="input-recurring-interval"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Communication Template (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-template">
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recipientScope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Scope</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-recipient-scope">
                        <SelectValue placeholder="Select recipient scope" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="primary_contact">Primary Contact Only</SelectItem>
                      <SelectItem value="all_contacts">All Contacts</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-is-enabled"
                    />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Rule Enabled</FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="autoSend"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-auto-send"
                    />
                  </FormControl>
                  <div>
                    <FormLabel className="cursor-pointer">Auto-Send</FormLabel>
                    {field.value && (
                      <p className="text-xs text-destructive mt-0.5">
                        Generated communications will be sent without review.
                      </p>
                    )}
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-rule">
                {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {isEdit ? "Save Changes" : "Create Rule"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AutomationsView({ templates }: { templates: CommunicationTemplate[] }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommunicationAutomationRule | null>(null);

  const { data: rules = [], isLoading } = useQuery<CommunicationAutomationRule[]>({
    queryKey: ["/api/automation-rules"],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/automation-rules/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/automation-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/automation-rules/${id}/run`),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      toast({
        title: "Rule executed",
        description: `Created ${data.draftsCreated} draft communication${data.draftsCreated !== 1 ? "s" : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to run rule.", variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingRule(null);
    setDialogOpen(true);
  }

  function openEdit(rule: CommunicationAutomationRule) {
    setEditingRule(rule);
    setDialogOpen(true);
  }

  const templateNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of templates) map[t.id] = t.name;
    return map;
  }, [templates]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-automations-title">Automation Rules</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rules that automatically generate draft communications based on triggers
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-rule">
          <Plus className="w-4 h-4 mr-1" />
          Add Rule
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Zap className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No automation rules yet</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Create your first rule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="border rounded-md p-4 bg-card space-y-3"
                data-testid={`card-rule-${rule.id}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className="font-medium text-sm"
                        data-testid={`text-rule-name-${rule.id}`}
                      >
                        {rule.name}
                      </h3>
                      {!rule.isEnabled && (
                        <Badge variant="secondary" className="text-xs">Disabled</Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => runMutation.mutate(rule.id)}
                      disabled={runMutation.isPending}
                      title="Run now"
                      data-testid={`button-run-${rule.id}`}
                    >
                      {runMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(rule)}
                      title="Edit rule"
                      data-testid={`button-edit-${rule.id}`}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(rule.id)}
                      disabled={deleteMutation.isPending}
                      title="Delete rule"
                      data-testid={`button-delete-${rule.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Trigger</span>
                    <span data-testid={`text-rule-trigger-${rule.id}`}>{getTriggerSummary(rule)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Template</span>
                    <span data-testid={`text-rule-template-${rule.id}`}>
                      {rule.templateId ? (templateNameMap[rule.templateId] ?? "Unknown template") : "None"}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Last Run</span>
                    <span data-testid={`text-rule-last-run-${rule.id}`}>{formatDateTime(rule.lastRunAt)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Recipient</span>
                    <span>{rule.recipientScope === "all_contacts" ? "All Contacts" : "Primary Contact"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t">
                  <span className="text-xs text-muted-foreground">
                    {rule.autoSend ? "Auto-send enabled" : "Drafts only"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${rule.id}`} className="text-xs text-muted-foreground cursor-pointer">
                      {rule.isEnabled ? "Enabled" : "Disabled"}
                    </Label>
                    <Switch
                      id={`toggle-${rule.id}`}
                      checked={rule.isEnabled}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: rule.id, isEnabled: v })}
                      data-testid={`toggle-rule-${rule.id}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AutomationRuleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        rule={editingRule}
        templates={templates}
      />
    </div>
  );
}


function FollowUpBadge({ status, isOverdue }: { status: string; isOverdue?: boolean }) {
  if (!status || status === "none") return null;
  const colorMap: Record<string, string> = {
    open: isOverdue
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    snoozed: isOverdue
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };
  const label: Record<string, string> = { open: "Follow-Up Open", done: "Follow-Up Done", snoozed: "Snoozed" };
  return (
    <Badge className={`${colorMap[status] ?? ""} text-xs border-0 py-0`} variant="outline">
      {label[status] ?? status}
    </Badge>
  );
}

function SnoozePopover({ commId, onSnooze }: { commId: string; onSnooze: (id: string, date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const presets = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "7 days", days: 7 },
  ];
  const snoozeUntil = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    onSnooze(commId, d.toISOString().split("T")[0]);
    setOpen(false);
  };
  const handleCustomDate = (date: Date | undefined) => {
    setCustomDate(date);
    if (date) {
      onSnooze(commId, format(date, "yyyy-MM-dd"));
      setOpen(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-snooze-${commId}`}>
          <AlarmClock className="w-3.5 h-3.5 mr-1" />
          Snooze
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">Snooze until</p>
        {presets.map((p) => (
          <Button key={p.days} size="sm" variant="ghost" className="w-full justify-start" onClick={() => snoozeUntil(p.days)}>
            {p.label}
          </Button>
        ))}
        <div className="pt-1">
          <p className="text-xs text-muted-foreground mb-1">Custom date</p>
          <DatePickerField
            value={customDate}
            onChange={handleCustomDate}
            placeholder="Pick a date"
            compact
            data-testid={`input-snooze-custom-date-${commId}`}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScheduleSendPanel({ isAdmin, value, onChange }: { isAdmin: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">Schedule send (admin only)</label>
      {isAdmin ? (
        <input
          type="datetime-local"
          className="text-xs border rounded px-2 py-1 w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="input-schedule-for"
        />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-muted-foreground cursor-not-allowed">
              <input type="datetime-local" className="text-xs border rounded px-2 py-1 w-full opacity-50" disabled />
              <Info className="w-3.5 h-3.5 shrink-0" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Only admins can schedule send</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function FollowUpPanel({
  enabled,
  onToggle,
  preset,
  onPresetChange,
  customDate,
  onCustomDate,
}: {
  enabled: boolean;
  onToggle: () => void;
  preset: string;
  onPresetChange: (v: string) => void;
  customDate: Date | undefined;
  onCustomDate: (v: Date | undefined) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input type="checkbox" checked={enabled} onChange={onToggle} data-testid="checkbox-followup-enabled" />
        Set follow-up reminder
      </label>
      {enabled && (
        <div className="mt-2 space-y-1.5">
          <Select value={preset} onValueChange={onPresetChange}>
            <SelectTrigger className="h-7 text-xs" data-testid="select-followup-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_week">1 week</SelectItem>
              <SelectItem value="2_weeks">2 weeks</SelectItem>
              <SelectItem value="1_month">1 month</SelectItem>
              <SelectItem value="custom">Custom date</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <DatePickerField
              value={customDate}
              onChange={onCustomDate}
              placeholder="Pick a date"
              compact
              data-testid="input-followup-custom-date"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Detail Panel
// ──────────────────────────────────────────────

function DetailPanel({ id }: { id: string | null }) {
  const { user } = useAuth();
  const isAdmin = user?.activeRole === "admin";
  const [scheduleFor, setScheduleFor] = useState<string>("");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpPreset, setFollowUpPreset] = useState<string>("1_week");
  const [followUpCustomDate, setFollowUpCustomDate] = useState<Date | undefined>(undefined);

  const { data, isLoading } = useQuery<CommunicationWithDetails & { links?: unknown[] }>({
    queryKey: ["/api/communications", id],
    queryFn: async () => {
      const res = await fetch(`/api/communications/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const patchMutation = useMutation({
    mutationFn: async ({ commId, patch }: { commId: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/communications/${commId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
    },
  });

  function handleMarkDone(commId: string) {
    patchMutation.mutate({ commId, patch: { followUpStatus: "done" } });
  }
  function handleSnooze(commId: string, snoozeUntil: string) {
    patchMutation.mutate({ commId, patch: { followUpStatus: "snoozed", followUpDueAt: snoozeUntil } });
  }
  function handleSaveSchedule(commId: string) {
    patchMutation.mutate({ commId, patch: { scheduledFor: scheduleFor, status: "scheduled" } });
  }
  function handleSaveFollowUp(commId: string) {
    const customDateStr = followUpCustomDate ? format(followUpCustomDate, "yyyy-MM-dd") : undefined;
    const dueDate = followUpPreset === "custom" ? customDateStr
      : followUpPreset === "2_weeks" ? new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split("T")[0]
      : followUpPreset === "1_month" ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0]
      : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
    patchMutation.mutate({ commId, patch: { followUpStatus: "open", followUpDueAt: dueDate } });
  }

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">Select a communication to preview it</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const Icon = TYPE_ICONS[data.type] ?? MessageSquare;
  const displayDate = data.sentAt ?? data.createdAt;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 border-b">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base leading-tight" data-testid="text-detail-subject">{data.subject || "(No subject)"}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge className={STATUS_COLORS[data.status] + " text-xs border-0"} variant="outline">
                {STATUS_LABELS[data.status] ?? data.status}
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Icon className="w-3 h-3 mr-1" />
                {TYPE_LABELS[data.type]}
              </Badge>
              {data.isOverdue && (
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs border-0" variant="outline">
                  Overdue Follow-Up
                </Badge>
              )}
              {data.followUpStatus && data.followUpStatus !== "none" && (
                <FollowUpBadge status={data.followUpStatus} isOverdue={data.isOverdue} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {data.deliveryStatus === "failed" && data.failureReason && (
          <Alert variant="destructive" data-testid="alert-delivery-failed">
            <XCircle className="w-4 h-4" />
            <AlertDescription>
              <span className="font-medium">Delivery failed:</span> {data.failureReason}
            </AlertDescription>
          </Alert>
        )}
        {/* Metadata */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</p>
            <p className="mt-0.5" data-testid="text-detail-customer">{data.customerName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</p>
            <p className="mt-0.5" data-testid="text-detail-contact">{data.contactName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sent By</p>
            <p className="mt-0.5" data-testid="text-detail-sent-by">{data.sentByName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {data.status === "draft" ? "Created" : "Sent"}
            </p>
            <p className="mt-0.5" data-testid="text-detail-sent-at">{formatDateTime(displayDate)}</p>
          </div>
          {data.recipientEmail && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recipient Email</p>
              <p className="mt-0.5">{data.recipientEmail}</p>
            </div>
          )}
          {data.deliveryStatus && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Status</p>
              <Badge
                className={`${DELIVERY_STATUS_COLORS[data.deliveryStatus as string] ?? ""} text-xs border-0 mt-0.5`}
                variant="outline"
                data-testid="badge-delivery-status"
              >
                {data.deliveryStatus.charAt(0).toUpperCase() + data.deliveryStatus.slice(1)}
              </Badge>
            </div>
          )}
          {data.templateName && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template</p>
              <p className="mt-0.5">{data.templateName}</p>
            </div>
          )}
          {data.scheduledFor && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scheduled For</p>
              <p className="mt-0.5" data-testid="text-detail-scheduled-for">{formatDateTime(data.scheduledFor)}</p>
            </div>
          )}
          {data.followUpDueAt && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Follow-Up Due</p>
              <p className={`mt-0.5 ${data.isOverdue ? "text-orange-600 dark:text-orange-400 font-medium" : ""}`} data-testid="text-detail-followup-due">
                {formatDateTime(data.followUpDueAt)}
                {data.isOverdue && " (Overdue)"}
              </p>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Message</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-detail-body">{data.body}</p>
        </div>
      </div>

      {/* Schedule & Follow-Up for drafts */}
      {data.status === "draft" && (
        <div className="p-4 border-t shrink-0 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule &amp; Follow-Up</h3>
          <ScheduleSendPanel isAdmin={isAdmin} value={scheduleFor} onChange={setScheduleFor} />
          <FollowUpPanel
            enabled={followUpEnabled}
            onToggle={() => setFollowUpEnabled((v) => !v)}
            preset={followUpPreset}
            onPresetChange={setFollowUpPreset}
            customDate={followUpCustomDate}
            onCustomDate={setFollowUpCustomDate}
          />
          <div className="flex gap-2 pt-1">
            {isAdmin && scheduleFor ? (
              <Button
                size="sm"
                onClick={() => handleSaveSchedule(data.id)}
                disabled={patchMutation.isPending}
                data-testid="button-save-schedule"
              >
                <Clock className="w-3.5 h-3.5 mr-1" />
                Schedule
              </Button>
            ) : null}
            {followUpEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSaveFollowUp(data.id)}
                disabled={patchMutation.isPending || (followUpPreset === "custom" && !followUpCustomDate)}
                data-testid="button-save-followup"
              >
                <AlarmClock className="w-3.5 h-3.5 mr-1" />
                Save Reminder
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Follow-up actions */}
      {data.followUpStatus && (data.followUpStatus === "open" || data.followUpStatus === "snoozed") && (
        <div className="p-4 border-t shrink-0">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Follow-Up Actions</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMarkDone(data.id)}
              disabled={patchMutation.isPending}
              data-testid="button-detail-markdone"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Mark done
            </Button>
            <SnoozePopover commId={data.id} onSnooze={handleSnooze} />
          </div>
        </div>
      )}

      <div className="p-4 border-t shrink-0">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
          <LinkIcon className="w-3.5 h-3.5" />
          <h3 className="text-xs font-semibold uppercase tracking-wide">Linked Records</h3>
        </div>
        <p className="text-xs text-muted-foreground italic">
          No linked records. Record linking coming in a future update.
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Communications List
// ──────────────────────────────────────────────

interface CommListProps {
  view: string;
  search: string;
  typeFilter: string;
  customerIdFilter: string;
  sentByIdFilter: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  initialFilters?: Record<string, string>;
}

function CommunicationsList({
  view,
  search,
  typeFilter,
  customerIdFilter,
  sentByIdFilter,
  selectedId,
  onSelect,
  initialFilters,
}: CommListProps) {
  const params = new URLSearchParams();
  if (view && view !== "all") params.set("view", view);
  if (typeFilter) params.set("type", typeFilter);
  if (customerIdFilter) params.set("customerId", customerIdFilter);
  if (sentByIdFilter) params.set("sentById", sentByIdFilter);
  if (search) params.set("search", search);
  if (initialFilters?.startDate) params.set("startDate", initialFilters.startDate);
  if (initialFilters?.endDate) params.set("endDate", initialFilters.endDate);

  const { data: comms = [], isLoading } = useQuery<CommunicationWithDetails[]>({
    queryKey: ["/api/communications", view, search, typeFilter, customerIdFilter, sentByIdFilter, initialFilters?.startDate, initialFilters?.endDate],
    queryFn: async () => {
      const res = await fetch(`/api/communications?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ commId, patch }: { commId: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/communications/${commId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
      </div>
    );
  }

  if (!comms.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center px-4">
        <Inbox className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No communications found</p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {comms.map(c => {
        const Icon = TYPE_ICONS[c.type] ?? MessageSquare;
        const displayDate = c.sentAt ?? c.createdAt;
        return (
          <li key={c.id} className="flex flex-col">
            <button
              className={`flex items-start gap-3 p-3 text-left w-full hover-elevate ${selectedId === c.id ? "bg-accent/40" : ""}`}
              onClick={() => onSelect(c.id)}
              data-testid={`comm-row-${c.id}`}
            >
              <div className="rounded-md bg-muted p-1.5 shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium truncate">{c.subject || "(No subject)"}</p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDate(displayDate)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.customerName ?? "No customer"}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <Badge className={STATUS_COLORS[c.status] + " text-xs border-0 py-0"} variant="outline">
                    {STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs py-0">
                    {TYPE_LABELS[c.type]}
                  </Badge>
                  {c.isOverdue && (
                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs border-0 py-0" variant="outline">
                      Overdue
                    </Badge>
                  )}
                  {c.followUpStatus && c.followUpStatus !== "none" && (
                    <FollowUpBadge status={c.followUpStatus} isOverdue={c.isOverdue} />
                  )}
                </div>
              </div>
            </button>
            {/* Inline follow-up actions for follow-ups view */}
            {view === "followups" && c.followUpStatus && (c.followUpStatus === "open" || c.followUpStatus === "snoozed") && (
              <div className="px-3 pb-2 flex items-center gap-2 pl-12">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patchMutation.mutate({ commId: c.id, patch: { followUpStatus: "done" } })}
                  disabled={patchMutation.isPending}
                  data-testid={`button-markdone-${c.id}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Mark done
                </Button>
                <SnoozePopover
                  commId={c.id}
                  onSnooze={(commId, date) => patchMutation.mutate({ commId, patch: { followUpStatus: "snoozed", followUpDueAt: date } })}
                />
                {c.followUpDueAt && (
                  <span className={`text-xs ${c.isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                    Due {formatDate(c.followUpDueAt)}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────
// Main CommunicationsCenter Page
// ──────────────────────────────────────────────


const KNOWN_TOKENS = [
  "customer_name",
  "property_name",
  "contact_name",
  "proposal_name",
  "proposal_total",
  "service_date",
  "pm_name",
  "company_name",
];

function TokenHighlightedText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <>
      {parts.map((part, i) => {
        const tokenMatch = part.match(/^{{(.+)}}$/);
        if (tokenMatch) {
          const tokenKey = tokenMatch[1].trim();
          const isKnown = KNOWN_TOKENS.includes(tokenKey);
          return (
            <span
              key={i}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold mx-0.5 ${
                isKnown
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {part}
            </span>
          );
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      })}
    </>
  );
}

const templateFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum([
    "proposal_follow_up",
    "irrigation_approval_request",
    "service_update",
    "chemical_notice",
    "snow_event_notice",
    "winter_watering",
    "billing_reminder",
    "general_outreach",
  ]),
  type: z.enum(["email", "sms", "note", "letter"]),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  defaultCommunicationType: z.enum(["email", "sms", "note", "letter"]).nullable().optional(),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;

function TemplateManager() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const { data: templates = [], isLoading } = useQuery<CommunicationTemplate[]>({
    queryKey: ["/api/communication-templates", { includeInactive: showInactive }],
    queryFn: async () => {
      const res = await fetch(`/api/communication-templates?includeInactive=${showInactive}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      category: "general_outreach",
      type: "email",
      subject: "",
      body: "",
      description: "",
      isActive: true,
      defaultCommunicationType: null,
    },
  });

  useEffect(() => {
    if (isNewTemplate) {
      form.reset({
        name: "",
        category: "general_outreach",
        type: "email",
        subject: "",
        body: "",
        description: "",
        isActive: true,
        defaultCommunicationType: null,
      });
    } else if (selectedTemplate) {
      form.reset({
        name: selectedTemplate.name,
        category: selectedTemplate.category as TemplateFormValues["category"],
        type: selectedTemplate.type as TemplateFormValues["type"],
        subject: selectedTemplate.subject ?? "",
        body: selectedTemplate.body,
        description: selectedTemplate.description ?? "",
        isActive: selectedTemplate.isActive,
        defaultCommunicationType: (selectedTemplate.defaultCommunicationType as TemplateFormValues["defaultCommunicationType"]) ?? null,
      });
    }
  }, [selectedTemplate, isNewTemplate]);

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormValues) => {
      const res = await apiRequest("POST", "/api/communication-templates", data);
      return res.json();
    },
    onSuccess: (created: CommunicationTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communication-templates"] });
      setIsNewTemplate(false);
      setSelectedId(created.id);
      toast({ title: "Template saved", description: `"${created.name}" has been created.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateFormValues> }) => {
      const res = await apiRequest("PATCH", `/api/communication-templates/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: CommunicationTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communication-templates"] });
      toast({ title: "Template saved", description: `"${updated.name}" has been updated.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    },
  });

  const handleSelect = (id: string) => {
    setIsNewTemplate(false);
    setSelectedId(id === selectedId ? null : id);
  };

  const handleNew = () => {
    setSelectedId(null);
    setIsNewTemplate(true);
  };

  const handleCancel = () => {
    setIsNewTemplate(false);
    if (!selectedTemplate) {
      setSelectedId(null);
    } else {
      form.reset({
        name: selectedTemplate.name,
        category: selectedTemplate.category as TemplateFormValues["category"],
        type: selectedTemplate.type as TemplateFormValues["type"],
        subject: selectedTemplate.subject ?? "",
        body: selectedTemplate.body,
        description: selectedTemplate.description ?? "",
        isActive: selectedTemplate.isActive,
        defaultCommunicationType: (selectedTemplate.defaultCommunicationType as TemplateFormValues["defaultCommunicationType"]) ?? null,
      });
    }
  };

  const onSubmit = (values: TemplateFormValues) => {
    if (isNewTemplate) {
      createMutation.mutate(values);
    } else if (selectedId) {
      updateMutation.mutate({ id: selectedId, data: values });
    }
  };

  const grouped = useMemo(() => {
    const groups: Record<string, CommunicationTemplate[]> = {};
    for (const cat of COMMUNICATION_TEMPLATE_CATEGORIES) {
      const items = templates.filter((t) => t.category === cat);
      if (items.length > 0) {
        groups[cat] = items;
      }
    }
    return groups;
  }, [templates]);

  const watchedSubject = form.watch("subject");
  const watchedBody = form.watch("body");
  const watchedName = form.watch("name");
  const watchedCategory = form.watch("category");
  const watchedIsActive = form.watch("isActive");

  const isEditing = isNewTemplate || (selectedId !== null);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Template List — Left Panel */}
      <div className="w-64 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="p-3 border-b flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleNew}
            data-testid="button-new-template"
            className="flex-1"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Template
          </Button>
        </div>
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
            data-testid="toggle-show-inactive"
          />
          <Label htmlFor="show-inactive" className="text-xs text-muted-foreground cursor-pointer">
            Show archived
          </Label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">No templates yet</p>
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="mb-1">
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[cat as keyof typeof COMMUNICATION_TEMPLATE_CATEGORY_LABELS]}
                    </span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t.id)}
                      data-testid={`template-item-${t.id}`}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors hover-elevate flex items-start gap-2 ${
                        selectedId === t.id && !isNewTemplate ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm leading-snug">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{TYPE_LABELS[t.type] ?? t.type}</p>
                      </div>
                      {!t.isActive && (
                        <Archive className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor — Center Panel */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r">
        {isEditing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b shrink-0 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-base font-semibold" data-testid="text-editor-title">
                  {isNewTemplate ? "New Template" : "Edit Template"}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    data-testid="button-cancel-template"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSaving}
                    data-testid="button-save-template"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Proposal Follow-Up — Standard" {...field} data-testid="input-template-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-template-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COMMUNICATION_TEMPLATE_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[cat]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-template-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                            <SelectItem value="note">Note</SelectItem>
                            <SelectItem value="letter">Letter</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Following up on your proposal — {{proposal_name}}" {...field} data-testid="input-template-subject" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Write your message here. Use {{customer_name}}, {{property_name}}, {{pm_name}}, etc. to insert dynamic values."
                          rows={8}
                          {...field}
                          data-testid="textarea-template-body"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Note <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Usage notes, guidance for staff, when to use this template..."
                          rows={3}
                          {...field}
                          value={field.value ?? ""}
                          data-testid="textarea-template-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between gap-4 pt-1">
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="toggle-template-active"
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer">
                          {field.value ? "Active" : "Archived (inactive)"}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="defaultCommunicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Compose Type <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Select
                        value={field.value ?? "__none__"}
                        onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-template-default-type">
                            <SelectValue placeholder="Inherit from Template Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Inherit from Template Type</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="note">Note</SelectItem>
                          <SelectItem value="letter">Letter</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Override the communication type pre-selected when composing with this template.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Available Tokens</p>
                  <div className="flex flex-wrap gap-1.5">
                    {KNOWN_TOKENS.map((token) => (
                      <span
                        key={token}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                      >
                        {`{{${token}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </form>
          </Form>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <LayoutTemplate className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Select a template to edit</p>
            <p className="text-xs text-muted-foreground mt-1">
              Or click "New Template" to create one
            </p>
          </div>
        )}
      </div>

      {/* Preview — Right Panel */}
      <div className="w-80 shrink-0 flex flex-col overflow-hidden bg-muted/20">
        <div className="p-3 border-b flex items-center gap-2 shrink-0">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-muted-foreground">Live Preview</span>
        </div>
        {isEditing ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Template</p>
              <p className="text-sm font-medium" data-testid="preview-name">
                {watchedName || <span className="text-muted-foreground italic">Untitled</span>}
              </p>
              {watchedCategory && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {COMMUNICATION_TEMPLATE_CATEGORY_LABELS[watchedCategory as keyof typeof COMMUNICATION_TEMPLATE_CATEGORY_LABELS]}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {form.watch("type") && (
                <Badge variant="outline" className="text-xs capitalize">{form.watch("type")}</Badge>
              )}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  watchedIsActive
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {watchedIsActive ? "Active" : "Archived"}
              </span>
            </div>

            {watchedSubject && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
                <p className="text-sm leading-relaxed" data-testid="preview-subject">
                  <TokenHighlightedText text={watchedSubject} />
                </p>
              </div>
            )}

            {watchedBody && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body</p>
                <div className="text-sm leading-relaxed" data-testid="preview-body">
                  <TokenHighlightedText text={watchedBody} />
                </div>
              </div>
            )}

            {!watchedSubject && !watchedBody && (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground">Fill in the subject and body to see the preview</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Token Reference</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {KNOWN_TOKENS.map((token) => (
                  <div key={token} className="flex items-center gap-2">
                    <span className="font-mono text-amber-700 dark:text-amber-400">{`{{${token}}}`}</span>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                    <span className="capitalize">{token.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Eye className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">Preview will appear here when editing a template</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommunicationsCenter() {
  const { toast } = useToast();
  const permissions = useCommPermissions();
  const searchString = useSearch();

  // Initialize sectionFilter from the ?view= URL query param
  const initialView = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return resolveViewParam(params.get("view") ?? undefined);
  }, []);

  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(initialView);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Keep sectionFilter in sync when the URL query param changes (e.g., clicking dashboard widgets)
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const view = resolveViewParam(params.get("view") ?? undefined);
    setSectionFilter(view);
  }, [searchString]);

  useSetBreadcrumbs([{ label: "Communications" }], []);

  const { data: communications = [], isLoading } = useQuery<Communication[]>({
    queryKey: ["/api/communications"],
    enabled: permissions.canView,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: permissions.canView,
  });

  // Cancel-schedule mutation
  const cancelScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/communications/${id}/cancel-schedule`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to cancel scheduled send");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      toast({ title: "Scheduled send cancelled", description: "The communication has been moved back to Drafts." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });


  const [viewMode, setViewMode] = useState<"communications" | "automations">("communications");
  const [customerIdFilter, setCustomerIdFilter] = useState<string>("");
  const [sentByIdFilter, setSentByIdFilter] = useState<string>("");
  const { data: templates = [] } = useQuery<CommunicationTemplate[]>({ queryKey: ["/api/communication-templates"] });

  const filteredCommunications = useMemo(() => {
    let items = communications;

    if (sectionFilter === "follow_ups") {
      items = items.filter((c) => c.status === "draft" && c.type === "note");
    } else if (sectionFilter !== "all" && sectionFilter !== "audit_log") {
      items = items.filter((c) => c.status === sectionFilter);
    }

    if (typeFilter !== "all") {
      items = items.filter((c) => c.type === typeFilter);
    }

    if (statusFilter !== "all") {
      items = items.filter((c) => c.status === statusFilter);
    }

    if (customerFilter !== "all") {
      items = items.filter((c) => c.customerId === customerFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          (c.customerName ?? "").toLowerCase().includes(q) ||
          c.body.toLowerCase().includes(q)
      );
    }

    return items;
  }, [communications, sectionFilter, typeFilter, statusFilter, customerFilter, search]);

  const selectedComm = filteredCommunications.find((c) => c.id === selectedId) ??
    communications.find((c) => c.id === selectedId);

  const navSections: { id: SectionFilter; label: string; icon: typeof Inbox; count?: number; requiresAdmin?: boolean }[] = [
    { id: "all", label: "All Communications", icon: Inbox, count: communications.length },
    { id: "draft", label: "Drafts", icon: FileText, count: communications.filter((c) => c.status === "draft").length },
    { id: "sent", label: "Sent", icon: Send, count: communications.filter((c) => c.status === "sent").length },
    { id: "scheduled", label: "Scheduled", icon: Clock, count: communications.filter((c) => c.status === "scheduled").length },
    { id: "follow_ups", label: "Follow-Ups", icon: UserCheck, count: communications.filter((c) => c.status === "draft" && c.type === "note").length },
    { id: "audit_log", label: "Audit Log", icon: ClipboardList, requiresAdmin: true },
  ];

  const handleNavigateToList = (params: Record<string, string>) => {
    setSectionFilter(resolveViewParam(params.view));
    setViewMode("communications");
    if (params.type) setTypeFilter(params.type);
    if (params.sentById) setSentByIdFilter(params.sentById);
    if (params.customerId) setCustomerIdFilter(params.customerId);
    setSelectedId(null);
  };

  const handleNavSelect = (view: SectionFilter) => {
    setSectionFilter(view);
    setShowTemplates(false);
    setViewMode("communications");
    setSelectedId(null);
    setSearch("");
    setTypeFilter("");
    setCustomerIdFilter("");
    setSentByIdFilter("");
  };
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunicationWithDetails | undefined>();
  const [showTemplates, setShowTemplates] = useState(false);

  const isTemplatesView = showTemplates;

  if (!permissions.canView) {
    return (
      <div className="flex h-full -m-6 md:-m-8 overflow-hidden items-center justify-center">
        <LockedState message="You do not have access to the Communication Center." />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden -m-6 md:-m-8">
      {/* Left Nav Panel */}
      <div className="w-52 shrink-0 border-r bg-muted/30 flex flex-col overflow-y-auto">
        <div className="p-4 border-b space-y-2">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Communications</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Command Center</p>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => { setReplyTo(undefined); setComposeOpen(true); }}
            data-testid="button-compose-new"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Compose
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {navSections.map((section) => {
              const Icon = section.icon;
              const isLocked = section.requiresAdmin && !permissions.isAdmin;

              if (isLocked) {
                return (
                  <div
                    key={section.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed"
                    data-testid={`nav-${section.id}-locked`}
                    title="Only administrators can access the audit log"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{section.label}</span>
                    <Lock className="w-3 h-3 ml-auto" />
                  </div>
                );
              }

              return (
                <button
                  key={section.id}
                  data-testid={`nav-${section.id}`}
                  onClick={() => {
                    if (section.id === "audit_log") {
                      setSectionFilter("audit_log");
                      setShowTemplates(false);
                    } else {
                      handleNavSelect(section.id);
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover-elevate ${
                    (sectionFilter === section.id && !showTemplates)
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                  {section.count !== undefined && (
                    <span
                      className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${
                        (sectionFilter === section.id && !showTemplates)
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {section.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-2 border-t mt-4">
            <p className="text-xs text-muted-foreground px-3 py-1 font-medium uppercase tracking-wide">Templates</p>
            <button
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                showTemplates
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/70 hover-elevate"
              }`}
              data-testid="nav-templates"
              onClick={() => { setShowTemplates(true); setSelectedId(null); }}
            >
              <FileEdit className="w-4 h-4 shrink-0" />
              <span>Template Manager</span>
            </button>
            <button
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                viewMode === "automations"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/70 hover-elevate"
              }`}
              data-testid="nav-automations"
              onClick={() => {
                setViewMode("automations");
                setSelectedId(null);
              }}
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>Automations</span>
            </button>
          </div>
        </div>
      </div>

      {/* ComposeDrawer */}
      <ComposeDrawer
        open={composeOpen}
        onClose={() => { setComposeOpen(false); setReplyTo(undefined); }}
        replyTo={replyTo}
      />

      {/* Center + Right Panels */}
      {isTemplatesView ? (
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <div className="border-b p-3 shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold" data-testid="text-templates-title">Communication Templates</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowTemplates(false); }}
              data-testid="button-back-to-comms"
            >
              Back
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <TemplateManager />
          </div>
        </div>
      ) : sectionFilter === "audit_log" && permissions.isAdmin ? (
        <div className="flex-1 min-w-0 overflow-hidden border-r">
          <AuditLogPanel />
        </div>
      ) : viewMode === "automations" ? (
        <div className="flex-1 overflow-hidden">
          <AutomationsView templates={templates} />
        </div>
      ) : (
        <>
          {/* Main List Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r">
            <div className="p-4 border-b space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold capitalize" data-testid="text-view-title">{sectionFilter} Communications</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="pl-9 h-8 w-64"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      data-testid="input-search"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-[130px]" data-testid="select-type-filter">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={customerIdFilter} onValueChange={setCustomerIdFilter}>
                  <SelectTrigger className="h-8 w-[150px]" data-testid="select-customer-filter">
                    <SelectValue placeholder="Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CommunicationsList
                view={sectionFilter}
                search={search}
                typeFilter={typeFilter}
                customerIdFilter={customerIdFilter}
                sentByIdFilter={sentByIdFilter}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </div>
          {/* Detail Panel Area */}
          <div className="w-[450px] shrink-0 overflow-hidden">
            <DetailPanel id={selectedId} />
          </div>
        </>
      )}
    </div>
  );
}
