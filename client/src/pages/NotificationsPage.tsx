import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, Check, CheckCheck, AlertCircle, Clock, ClipboardCheck, User, MessageSquare, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import type { TicketNotification } from "@shared/schema";

function getNotificationPriority(type: string): "high" | "normal" {
  return ["mentioned", "overdue", "due_today", "assigned"].includes(type) ? "high" : "normal";
}

function getNotificationIcon(type: string, muted = false) {
  const cls = muted ? "text-muted-foreground" : "";
  switch (type) {
    case "assigned": return <User className={`h-5 w-5 ${muted ? cls : "text-blue-500"}`} />;
    case "completed": return <ClipboardCheck className={`h-5 w-5 ${muted ? cls : "text-green-500"}`} />;
    case "due_tomorrow": return <Clock className={`h-5 w-5 ${muted ? cls : "text-amber-500"}`} />;
    case "due_today": return <AlertCircle className={`h-5 w-5 ${muted ? cls : "text-orange-500"}`} />;
    case "overdue": return <AlertCircle className={`h-5 w-5 ${muted ? cls : "text-red-500"}`} />;
    case "mentioned": return <MessageSquare className={`h-5 w-5 ${muted ? cls : "text-purple-500"}`} />;
    default: return <Bell className={`h-5 w-5 ${muted ? cls : ""}`} />;
  }
}

function getNotificationBarColor(type: string, muted = false) {
  if (muted) return "bg-muted-foreground/30";
  switch (type) {
    case "assigned": return "bg-blue-500 dark:bg-blue-400";
    case "completed": return "bg-green-500 dark:bg-green-400";
    case "due_tomorrow": return "bg-amber-500 dark:bg-amber-400";
    case "due_today": return "bg-orange-500 dark:bg-orange-400";
    case "overdue": return "bg-red-500 dark:bg-red-400";
    case "mentioned": return "bg-purple-500 dark:bg-purple-400";
    default: return "bg-muted-foreground";
  }
}

function getNotificationTextColor(type: string, muted = false) {
  if (muted) return "text-muted-foreground";
  switch (type) {
    case "assigned": return "text-blue-600 dark:text-blue-400";
    case "completed": return "text-green-600 dark:text-green-400";
    case "due_tomorrow": return "text-amber-600 dark:text-amber-400";
    case "due_today": return "text-orange-600 dark:text-orange-400";
    case "overdue": return "text-red-600 dark:text-red-400";
    case "mentioned": return "text-purple-600 dark:text-purple-400";
    default: return "text-muted-foreground";
  }
}

function getNotificationTypeLabel(type: string) {
  switch (type) {
    case "assigned": return "Assigned";
    case "completed": return "Completed";
    case "due_tomorrow": return "Due Tomorrow";
    case "due_today": return "Due Today";
    case "overdue": return "Overdue";
    case "mentioned": return "Mentioned";
    default: return "Notification";
  }
}

interface NotificationRowProps {
  notification: TicketNotification;
  isHigh: boolean;
  onMarkRead: (id: string) => void;
}

function NotificationRow({ notification, isHigh, onMarkRead }: NotificationRowProps) {
  const muted = !isHigh;
  return (
    <div
      className={`flex items-start gap-4 p-4 rounded-md hover-elevate cursor-pointer transition-colors ${
        !notification.isRead
          ? isHigh ? "bg-muted/60" : "bg-muted/30"
          : ""
      }`}
      onClick={() => {
        if (!notification.isRead) onMarkRead(notification.id);
      }}
      data-testid={`notification-row-${notification.id}`}
    >
      <div className={`w-1 self-stretch rounded-full shrink-0 ${getNotificationBarColor(notification.type, muted)}`} />
      <div className="mt-0.5 shrink-0">
        {getNotificationIcon(notification.type, muted)}
      </div>
      <div className="flex-1 min-w-0">
        <Link href={`/dashboard/tickets/${notification.ticketId}`} className="block">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-semibold ${getNotificationTextColor(notification.type, muted)}`}>
              {getNotificationTypeLabel(notification.type)}
            </span>
            {!notification.isRead && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${isHigh ? "bg-destructive" : "bg-muted-foreground/50"}`} />
            )}
          </div>
          <p className={`text-sm ${!notification.isRead && isHigh ? "font-semibold" : "font-normal"} text-foreground`}>
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </Link>
      </div>
      {!notification.isRead && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(notification.id);
          }}
          data-testid={`button-mark-read-${notification.id}`}
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface SectionProps {
  label: string;
  items: TicketNotification[];
  isHigh: boolean;
  onMarkRead: (id: string) => void;
  testId: string;
}

function NotificationSection({ label, items, isHigh, onMarkRead, testId }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2" data-testid={testId}>
        {label}
      </p>
      <div className="space-y-1">
        {items.map(n => (
          <NotificationRow
            key={n.id}
            notification={n}
            isHigh={isHigh}
            onMarkRead={onMarkRead}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Bell className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("all");

  useSetBreadcrumbs([{ label: "Notifications" }]);

  const { data: notifications = [], isLoading } = useQuery<TicketNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const urgentAll = notifications.filter(n => getNotificationPriority(n.type) === "high");
  const standardAll = notifications.filter(n => getNotificationPriority(n.type) === "normal");
  const unreadAll = notifications.filter(n => !n.isRead);

  const urgentUnread = urgentAll.filter(n => !n.isRead).length;
  const standardUnread = standardAll.filter(n => !n.isRead).length;
  const totalUnread = unreadAll.length;

  function handleMarkRead(id: string) {
    markReadMutation.mutate(id);
  }

  function renderTwoSections(urgent: TicketNotification[], standard: TicketNotification[]) {
    if (urgent.length === 0 && standard.length === 0) {
      return <EmptyState message="You're all caught up" />;
    }
    return (
      <>
        <NotificationSection
          label="Needs Attention"
          items={urgent}
          isHigh={true}
          onMarkRead={handleMarkRead}
          testId="section-needs-attention"
        />
        {urgent.length > 0 && standard.length > 0 && (
          <div className="border-t my-4" />
        )}
        <NotificationSection
          label="Updates"
          items={standard}
          isHigh={false}
          onMarkRead={handleMarkRead}
          testId="section-updates"
        />
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalUnread > 0 ? `${totalUnread} unread` : "All caught up"}
          </p>
        </div>
        {totalUnread > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="gap-2"
            data-testid="button-mark-all-read"
          >
            {markAllReadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="tabs-notifications">
            <TabsTrigger value="all" className="gap-2" data-testid="tab-all">
              All
              {notifications.length > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5">
                  {notifications.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="needs-attention" className="gap-2" data-testid="tab-needs-attention">
              Needs Attention
              {urgentUnread > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5">
                  {urgentUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-2" data-testid="tab-updates">
              Updates
              {standardUnread > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5">
                  {standardUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread" className="gap-2" data-testid="tab-unread">
              Unread
              {totalUnread > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5">
                  {totalUnread}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {notifications.length === 0
              ? <EmptyState message="No notifications yet" />
              : renderTwoSections(urgentAll, standardAll)
            }
          </TabsContent>

          <TabsContent value="needs-attention">
            {urgentAll.length === 0
              ? <EmptyState message="Nothing needs your attention right now" />
              : (
                <div className="space-y-1">
                  {urgentAll.map(n => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      isHigh={true}
                      onMarkRead={handleMarkRead}
                    />
                  ))}
                </div>
              )
            }
          </TabsContent>

          <TabsContent value="updates">
            {standardAll.length === 0
              ? <EmptyState message="No updates" />
              : (
                <div className="space-y-1">
                  {standardAll.map(n => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      isHigh={false}
                      onMarkRead={handleMarkRead}
                    />
                  ))}
                </div>
              )
            }
          </TabsContent>

          <TabsContent value="unread">
            {unreadAll.length === 0
              ? <EmptyState message="You're all caught up" />
              : renderTwoSections(
                  urgentAll.filter(n => !n.isRead),
                  standardAll.filter(n => !n.isRead)
                )
            }
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
