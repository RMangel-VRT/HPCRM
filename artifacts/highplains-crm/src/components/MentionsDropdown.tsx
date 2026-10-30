import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MentionRow, type MentionNotice } from "./MentionRow";
import { mentionsFilter, notificationListOptions, useMentionsCount } from "@/lib/notifications";

export default function MentionsDropdown() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<MentionNotice>(null);
  const { data: count, isError: countError } = useMentionsCount();
  const { data = [], isLoading, isError } = useQuery(notificationListOptions(mentionsFilter));
  const unread = data.filter(row => !row.isRead).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20);
  const total = count?.count ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-mentions"
          aria-label={t("mentions.trigger", { count: total })}>
          <MessageSquare aria-hidden="true" className={`h-5 w-5 ${total > 0 ? "text-primary" : ""}`} />
          {total > 0 && <Badge variant="destructive" aria-hidden="true"
            className="absolute -top-1 -left-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
            data-testid="badge-mentions-header">{total > 99 ? "99+" : total}</Badge>}
          <span className="sr-only" role="status">{t("mentions.count", { count: total })}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b"><h4 className="font-semibold text-sm">{t("mentions.title")}</h4></div>
        {countError && <p role="alert" className="p-3 text-sm text-destructive">{t("mentions.countFailed")}</p>}
        {notice && <p role="alert" className="p-3 text-sm text-muted-foreground">{t(`mentions.${notice}`)}</p>}
        <ScrollArea className="h-80">
          {isLoading ? <p className="p-4 text-center text-muted-foreground text-sm">{t("mentions.loading")}</p>
            : isError ? <p role="alert" className="p-4 text-sm text-destructive">{t("mentions.loadFailed")}</p>
            : unread.length === 0 ? <p className="p-8 text-center text-muted-foreground text-sm">{t("mentions.dropdownEmpty")}</p>
            : <div className="divide-y">{unread.map(row => <MentionRow key={row.id} notification={row} onNotice={setNotice} />)}</div>}
        </ScrollArea>
        <div className="border-t">
          <Link href="/dashboard/mentions" className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors hover-elevate"
            data-testid="link-view-all-mentions">{t("mentions.viewAll")}<ChevronRight aria-hidden="true" className="h-3 w-3" /></Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
