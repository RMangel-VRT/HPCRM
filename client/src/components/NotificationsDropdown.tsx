import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, CheckCheck, AlertCircle, Clock, ClipboardCheck, User, MessageSquare, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { TicketNotification } from "@shared/schema";

function getNotificationPriority(type: string): "high" | "normal" {
  return ["mentioned", "overdue", "due_today"].includes(type) ? "high" : "normal";
}

function getNotificationTitle(type: string) {
  switch (type) {
    case "assigned": return "New Ticket Assigned";
    case "completed": return "Ticket Completed";
    case "due_tomorrow": return "Due Tomorrow";
    case "due_today": return "Due Today";
    case "overdue": return "Ticket Overdue";
    case "mentioned": return "You Were Mentioned";
    default: return "Notification";
  }
}

function getNotificationIcon(type: string, muted = false) {
  const muteClass = "text-muted-foreground";
  switch (type) {
    case "assigned":
      return <User className={`h-4 w-4 ${muted ? muteClass : "text-blue-500"}`} />;
    case "completed":
      return <ClipboardCheck className={`h-4 w-4 ${muted ? muteClass : "text-green-500"}`} />;
    case "due_tomorrow":
      return <Clock className={`h-4 w-4 ${muted ? muteClass : "text-amber-500"}`} />;
    case "due_today":
      return <AlertCircle className={`h-4 w-4 ${muted ? muteClass : "text-orange-500"}`} />;
    case "overdue":
      return <AlertCircle className={`h-4 w-4 ${muted ? muteClass : "text-red-500"}`} />;
    case "mentioned":
      return <MessageSquare className={`h-4 w-4 ${muted ? muteClass : "text-purple-500"}`} />;
    default:
      return <Bell className={`h-4 w-4 ${muted ? muteClass : ""}`} />;
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

interface NotificationItemProps {
  notification: TicketNotification;
  isHigh: boolean;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ notification, isHigh, onMarkRead }: NotificationItemProps) {
  const muted = !isHigh;
  return (
    <div
      className={`p-3 hover-elevate cursor-pointer transition-colors ${
        !notification.isRead
          ? isHigh ? "bg-muted/60" : "bg-muted/30"
          : ""
      }`}
      onClick={() => {
        if (!notification.isRead) onMarkRead(notification.id);
      }}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start gap-2">
        <div className={`w-1 self-stretch rounded-full shrink-0 ${getNotificationBarColor(notification.type, muted)}`} />
        <div className="mt-0.5 shrink-0">
          {getNotificationIcon(notification.type, muted)}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/dashboard/tickets/${notification.ticketId}`} className="block">
            <span
              className={`text-xs font-semibold ${getNotificationTextColor(notification.type, muted)}`}
              data-testid={`text-notification-type-${notification.id}`}
            >
              {getNotificationTypeLabel(notification.type)}
            </span>
            <p className={`text-sm ${
              !notification.isRead
                ? isHigh ? "font-semibold" : "font-normal"
                : isHigh ? "font-medium" : "font-normal"
            }`}>
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
            className="h-6 w-6 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
            data-testid={`button-mark-read-${notification.id}`}
          >
            <Check className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function NotificationsDropdown() {
  const { toast } = useToast();
  const previousNotificationIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  const { data: notifications = [], isLoading } = useQuery<TicketNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (isLoading) return;

    const currentIds = new Set(notifications.map(n => n.id));

    if (isInitialLoad.current) {
      previousNotificationIds.current = currentIds;
      isInitialLoad.current = false;
      return;
    }

    const newNotifications = notifications.filter(
      n => !previousNotificationIds.current.has(n.id) && !n.isRead
    );

    if (newNotifications.length > 0) {
      newNotifications.forEach(notification => {
        const isHigh = getNotificationPriority(notification.type) === "high";
        toast({
          title: getNotificationTitle(notification.type),
          description: notification.message,
          duration: 8000,
          ...(isHigh ? { variant: "destructive" } : {}),
        });
      });

      try {
        if ('vibrate' in navigator) navigator.vibrate(200);
      } catch (e) {}
    }

    previousNotificationIds.current = currentIds;
  }, [notifications, isLoading, toast]);

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

  const urgentNotifications = notifications.filter(n => getNotificationPriority(n.type) === "high");
  const standardNotifications = notifications.filter(n => getNotificationPriority(n.type) === "normal");
  const urgentUnreadCount = urgentNotifications.filter(n => !n.isRead).length;
  const standardUnreadCount = standardNotifications.filter(n => !n.isRead).length;
  const totalUnreadCount = urgentUnreadCount + standardUnreadCount;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${urgentUnreadCount > 0 ? "animate-pulse" : ""}`}
          data-testid="button-notifications"
        >
          <Bell className={`h-5 w-5 ${totalUnreadCount > 0 ? "text-primary" : ""}`} />
          {urgentUnreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -left-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {urgentUnreadCount > 99 ? "99+" : urgentUnreadCount}
            </Badge>
          )}
          {urgentUnreadCount === 0 && standardUnreadCount > 0 && (
            <Badge
              variant="secondary"
              className="absolute -top-1 -left-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {standardUnreadCount > 99 ? "99+" : standardUnreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {totalUnreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="h-7 text-xs gap-1"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No notifications
            </div>
          ) : (
            <div>
              {urgentNotifications.length > 0 && (
                <div>
                  <div
                    className="px-3 pt-3 pb-1"
                    data-testid="section-needs-attention"
                  >
                    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Needs Attention
                    </span>
                  </div>
                  <div className="divide-y">
                    {urgentNotifications.map(n => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        isHigh={true}
                        onMarkRead={(id) => markReadMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {standardNotifications.length > 0 && (
                <div>
                  <div
                    className={`px-3 pb-1 ${urgentNotifications.length > 0 ? "pt-3 border-t mt-1" : "pt-3"}`}
                    data-testid="section-updates"
                  >
                    <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                      Updates
                    </span>
                  </div>
                  <div className="divide-y">
                    {standardNotifications.map(n => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        isHigh={false}
                        onMarkRead={(id) => markReadMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t">
          <Link href="/dashboard/notifications">
            <button
              className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors hover-elevate"
              data-testid="link-view-all-notifications"
            >
              View all notifications
              <ChevronRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
