import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MessageSquare,
  Send,
  FileText,
  Calendar,
  AlertCircle,
  LayoutDashboard,
  ChevronRight,
  Search,
  Mail,
  Phone,
  StickyNote,
  FileEdit,
  Users,
  Building2,
  Star,
  TrendingUp,
  Clock,
  CheckCircle,
  Eye,
  Loader2,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  MessagesSquare,
  Reply,
  User,
  UserCheck,
  Archive,
  LayoutTemplate,
  XCircle,
} from "lucide-react";
import type { CommunicationWithDetails, CommunicationAnalytics, CommunicationTemplate } from "@shared/schema";
import { COMMUNICATION_TEMPLATE_CATEGORIES, COMMUNICATION_TEMPLATE_CATEGORY_LABELS } from "@shared/schema";
import ComposeDrawer from "@/components/ComposeDrawer";

type NavView = "dashboard" | "all" | "drafts" | "sent" | "scheduled" | "followups";
type SectionFilter = "all" | "draft" | "sent" | "scheduled" | "follow_ups" | "templates";
type Section = NavView;

const TYPE_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  sms: Phone,
  note: StickyNote,
  letter: FileEdit,
};

const TYPE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  note: "Note",
  letter: "Letter",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type];
  return (
    <Badge variant="outline" className="gap-1 text-xs capitalize">
      {Icon && <Icon className="w-3 h-3" />}
      {TYPE_LABELS[type] ?? type}
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

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ──────────────────────────────────────────────
// Analytics Dashboard
// ──────────────────────────────────────────────

type DatePreset = "this_week" | "this_month" | "last_30" | "custom";

interface AnalyticsDashboardProps {
  onNavigateToList: (params: Record<string, string>) => void;
}

function AnalyticsDashboard({ onNavigateToList }: AnalyticsDashboardProps) {
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const queryParams = new URLSearchParams();
  if (preset !== "custom") {
    queryParams.set("preset", preset);
  } else {
    if (customStart) queryParams.set("startDate", customStart);
    if (customEnd) queryParams.set("endDate", customEnd);
  }

  const { data: analytics, isLoading } = useQuery<CommunicationAnalytics>({
    queryKey: ["/api/communications/analytics", preset, customStart, customEnd],
    queryFn: async () => {
      const res = await fetch(`/api/communications/analytics?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  const presetLabel = (p: DatePreset) => {
    if (p === "this_week") return "This Week";
    if (p === "this_month") return "This Month";
    if (p === "last_30") return "Last 30 Days";
    return "Custom";
  };

  const periodLabel = preset === "custom"
    ? (customStart && customEnd ? `${formatDate(customStart)} – ${formatDate(customEnd)}` : "Select dates")
    : presetLabel(preset);

  const statCards = [
    {
      label: "Sent This Week",
      value: analytics?.totalSentThisWeek ?? 0,
      icon: Send,
      description: "Messages sent in the last 7 days",
      onClick: () => onNavigateToList({ view: "sent", preset: "this_week" }),
      testId: "stat-sent-this-week",
    },
    {
      label: "Sent This Month",
      value: analytics?.totalSentThisMonth ?? 0,
      icon: TrendingUp,
      description: "Messages sent this calendar month",
      onClick: () => onNavigateToList({ view: "sent", preset: "this_month" }),
      testId: "stat-sent-this-month",
    },
    {
      label: "Drafts Pending",
      value: analytics?.draftsCount ?? 0,
      icon: FileText,
      description: "Unsent draft messages",
      onClick: () => onNavigateToList({ view: "drafts" }),
      testId: "stat-drafts",
    },
    {
      label: "Overdue Follow-Ups",
      value: analytics?.overdueFollowUpsCount ?? 0,
      icon: AlertCircle,
      description: "Follow-ups past their due date",
      onClick: () => onNavigateToList({ view: "followups" }),
      testId: "stat-overdue-followups",
      variant: "warning",
    },
  ];

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto p-6">
      {/* Header row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Communications Overview</h2>
          <p className="text-sm text-muted-foreground">Activity for: {periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["this_week", "this_month", "last_30", "custom"] as DatePreset[]).map(p => (
            <Button
              key={p}
              variant={preset === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset(p)}
              data-testid={`button-preset-${p}`}
            >
              {presetLabel(p)}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">From</label>
            <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-40" data-testid="input-custom-start" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">To</label>
            <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-40" data-testid="input-custom-end" />
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(card => (
          <Card
            key={card.testId}
            className="cursor-pointer hover-elevate"
            onClick={card.onClick}
            data-testid={card.testId}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{card.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className={`text-3xl font-bold mt-1 ${card.variant === "warning" && (analytics?.overdueFollowUpsCount ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>
                      {card.value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </div>
                <div className="rounded-md bg-primary/10 p-2 shrink-0">
                  <card.icon className="w-4 h-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom rows */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* Sent by Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Sent by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !analytics?.sentByType?.length ? (
              <p className="text-sm text-muted-foreground">No data for this period</p>
            ) : (
              <ul className="space-y-1">
                {analytics.sentByType.map(row => {
                  const Icon = TYPE_ICONS[row.type] ?? MessageSquare;
                  return (
                    <li
                      key={row.type}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer hover-elevate"
                      onClick={() => onNavigateToList({ view: "sent", type: row.type })}
                      data-testid={`type-row-${row.type}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{TYPE_LABELS[row.type] ?? row.type}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{row.count}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Sent by Staff */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Sent by Staff Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !analytics?.sentByStaff?.length ? (
              <p className="text-sm text-muted-foreground">No data for this period</p>
            ) : (
              <ul className="space-y-1">
                {analytics.sentByStaff.map(row => (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer hover-elevate"
                    onClick={() => onNavigateToList({ view: "sent", sentById: row.userId })}
                    data-testid={`staff-row-${row.userId}`}
                  >
                    <span className="text-sm truncate">{row.userName}</span>
                    <Badge variant="secondary" className="text-xs">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top Customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Top Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !analytics?.topCustomers?.length ? (
              <p className="text-sm text-muted-foreground">No data for this period</p>
            ) : (
              <ul className="space-y-1">
                {analytics.topCustomers.map(row => (
                  <li
                    key={row.customerId}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer hover-elevate"
                    onClick={() => onNavigateToList({ customerId: row.customerId })}
                    data-testid={`customer-row-${row.customerId}`}
                  >
                    <span className="text-sm truncate">{row.customerName}</span>
                    <Badge variant="secondary" className="text-xs">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top Templates */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="w-4 h-4" />
              Top Templates Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !analytics?.topTemplates?.length ? (
              <p className="text-sm text-muted-foreground">No templates used in this period</p>
            ) : (
              <ul className="space-y-1">
                {analytics.topTemplates.map(row => (
                  <li
                    key={row.templateId}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer hover-elevate"
                    onClick={() => onNavigateToList({ templateId: row.templateId })}
                    data-testid={`template-row-${row.templateId}`}
                  >
                    <span className="text-sm truncate">{row.templateName}</span>
                    <Badge variant="secondary" className="text-xs">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Communication Detail Panel
// ──────────────────────────────────────────────

function DetailPanel({ id }: { id: string | null }) {
  const { data, isLoading } = useQuery<CommunicationWithDetails & { links?: unknown[] }>({
    queryKey: ["/api/communications", id],
    queryFn: async () => {
      const res = await fetch(`/api/communications/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

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
            <h3 className="font-semibold text-base leading-tight">{data.subject || "(No subject)"}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge className={STATUS_COLORS[data.status] + " text-xs border-0"} variant="outline">
                {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
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
            <p className="mt-0.5">{data.customerName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</p>
            <p className="mt-0.5">{data.contactName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sent By</p>
            <p className="mt-0.5">{data.sentByName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {data.status === "draft" ? "Created" : "Sent"}
            </p>
            <p className="mt-0.5">{formatDateTime(displayDate)}</p>
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
              <p className="mt-0.5">{formatDateTime(data.scheduledFor)}</p>
            </div>
          )}
          {data.followUpDueAt && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Follow-Up Due</p>
              <p className={`mt-0.5 ${data.isOverdue ? "text-orange-600 dark:text-orange-400 font-medium" : ""}`}>
                {formatDateTime(data.followUpDueAt)}
                {data.isOverdue && " (Overdue)"}
              </p>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Message</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{data.body}</p>
        </div>
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
          <li
            key={c.id}
            className={`flex items-start gap-3 p-3 cursor-pointer hover-elevate ${selectedId === c.id ? "bg-accent/40" : ""}`}
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
                  {c.status}
                </Badge>
                <Badge variant="outline" className="text-xs py-0">
                  {TYPE_LABELS[c.type]}
                </Badge>
                {c.isOverdue && (
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-xs border-0 py-0" variant="outline">
                    Overdue
                  </Badge>
                )}
              </div>
            </div>
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
  const [location, navigate] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] ?? "");

  const initialView = (searchParams.get("view") as NavView) ?? "dashboard";
  const initialCustomerId = searchParams.get("customerId") ?? "";
  const initialSentById = searchParams.get("sentById") ?? "";
  const initialType = searchParams.get("type") ?? "";

  const [activeView, setActiveView] = useState<NavView>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [customerIdFilter, setCustomerIdFilter] = useState(initialCustomerId);
  const [sentByIdFilter, setSentByIdFilter] = useState(initialSentById);
  const [initialFilters] = useState<Record<string, string>>({
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
  });

  const { data: countData } = useQuery<CommunicationWithDetails[]>({
    queryKey: ["/api/communications", "all"],
    queryFn: async () => {
      const res = await fetch("/api/communications");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const draftsCount = countData?.filter(c => c.status === "draft").length ?? 0;
  const scheduledCount = countData?.filter(c => c.status === "scheduled").length ?? 0;
  const followupsCount = countData?.filter(c => c.followUpStatus === "open" || c.followUpStatus === "snoozed").length ?? 0;
  const overdueCount = countData?.filter(c => c.isOverdue).length ?? 0;

  const navItems: { view: NavView; label: string; icon: React.ElementType; count?: number; overdue?: boolean }[] = [
    { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { view: "all", label: "All Communications", icon: MessageSquare },
    { view: "drafts", label: "Drafts", icon: FileText, count: draftsCount },
    { view: "sent", label: "Sent", icon: Send },
    { view: "scheduled", label: "Scheduled", icon: Calendar, count: scheduledCount },
    { view: "followups", label: "Follow-Ups", icon: AlertCircle, count: followupsCount, overdue: overdueCount > 0 },
  ];

  const handleNavigateToList = (params: Record<string, string>) => {
    const view = (params.view as NavView) ?? "all";
    setActiveView(view);
    if (params.type) setTypeFilter(params.type);
    if (params.sentById) setSentByIdFilter(params.sentById);
    if (params.customerId) setCustomerIdFilter(params.customerId);
    setSelectedId(null);
  };

  const handleNavSelect = (view: NavView) => {
    setActiveView(view);
    setShowTemplates(false);
    setSelectedId(null);
    setSearch("");
    setTypeFilter("");
    setCustomerIdFilter("");
    setSentByIdFilter("");
  };

  const isDashboard = activeView === "dashboard";
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunicationWithDetails | undefined>();
  const [showTemplates, setShowTemplates] = useState(false);

  const isTemplatesView = showTemplates;

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
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNavSelect(item.view)}
                data-testid={`nav-${item.view}`}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/70 hover-elevate"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.count != null && item.count > 0 && (
                  <Badge
                    className={`text-xs shrink-0 border-0 ${
                      item.overdue
                        ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                        : isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    variant="outline"
                  >
                    {item.count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t">
          <Button
            className="w-full"
            onClick={() => setComposeOpen(true)}
            data-testid="button-new-message"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Message
          </Button>
        </div>

        <div className="p-2 border-t">
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
      ) : isDashboard ? (
        <div className="flex-1 overflow-hidden">
          <AnalyticsDashboard onNavigateToList={handleNavigateToList} />
        </div>
      ) : (
        <>
          {/* Center Panel */}
          <div className="w-80 shrink-0 border-r flex flex-col overflow-hidden">
            {/* Center Header */}
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Search messages..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={typeFilter || "all"} onValueChange={v => setTypeFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-type-filter">
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
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              <CommunicationsList
                view={activeView}
                search={search}
                typeFilter={typeFilter}
                customerIdFilter={customerIdFilter}
                sentByIdFilter={sentByIdFilter}
                selectedId={selectedId}
                onSelect={setSelectedId}
                initialFilters={initialFilters}
              />
            </div>
          </div>

          {/* Right Detail Panel */}
          <div className="flex-1 overflow-hidden">
            <DetailPanel id={selectedId} />
          </div>
        </>
      )}
    </div>
  );
}
