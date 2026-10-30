import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { type Notification, useNotificationRead } from "@/lib/notifications";
import { useAuth } from "@/hooks/use-auth";
import { canViewBilling } from "@/lib/billing";
import { apiRequest } from "@/lib/queryClient";

export type MentionNotice = "accessDenied" | "ticketUnavailable" | "openFailed" | null;

export function MentionRow({ notification, onNotice }: {
  notification: Notification;
  onNotice?: (notice: MentionNotice) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const read = useNotificationRead();
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<MentionNotice>(null);
  const report = onNotice ?? setNotice;
  async function open() {
    setFailed(false);
    report(null);
    setOpening(true);
    try {
      if (!notification.isRead) await read.mutateAsync(notification.id);
    } catch {
      setFailed(true);
      setOpening(false);
      return;
    }
    try {
      // Ordinary mapping is excluded by the existing CLIENT ticket route, not
      // the details API. Keep that route gate and its billing/super-admin exceptions.
      if (user?.activeRole === "mapping" && !user.isSuperAdminBool && !canViewBilling(user)) {
        report("accessDenied");
        return;
      }
      // The API independently restricts four roles to their assigned tickets.
      // Check current authorization even for read mentions; a mention grants no access.
      await apiRequest("GET", `/api/tickets/${notification.ticketId}/details`);
      navigate(`/dashboard/tickets/${notification.ticketId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      report(/^403:/.test(message) ? "accessDenied" : /^404:/.test(message) ? "ticketUnavailable" : "openFailed");
    } finally { setOpening(false); }
  }
  return (
    <div>
      <button type="button" onClick={open} disabled={read.isPending || opening}
        className={`block w-full text-left p-3 hover-elevate transition-colors disabled:opacity-60 ${!notification.isRead ? "bg-muted/60" : ""}`}
        data-testid={`mention-row-${notification.id}`}>
        <span className="flex items-start gap-2">
          <span className="w-1 self-stretch rounded-full shrink-0 bg-purple-500 dark:bg-purple-400" />
          <MessageSquare aria-hidden="true" className="h-4 w-4 mt-0.5 shrink-0 text-purple-500" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-purple-600 dark:text-purple-400">{t("mentions.type")}</span>
            <span className={`block text-sm ${!notification.isRead ? "font-semibold" : "font-normal"}`}>{notification.message}</span>
            <time dateTime={new Date(notification.createdAt).toISOString()} className="block text-xs text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: i18n.language.startsWith("es") ? es : enUS })}
            </time>
          </span>
          {!notification.isRead && <span className="w-2 h-2 rounded-full shrink-0 bg-destructive mt-1" aria-label={t("mentions.unread")} />}
        </span>
      </button>
      {failed && <p role="alert" className="p-3 text-sm text-destructive">{t("mentions.readFailed")}</p>}
      {notice && <p role="alert" className="p-3 text-sm text-muted-foreground">{t(`mentions.${notice}`)}</p>}
    </div>
  );
}
