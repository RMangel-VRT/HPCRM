import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { MentionRow, type MentionNotice } from "@/components/MentionRow";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { mentionsFilter, notificationListOptions, useMentionsCount, useNotificationScope } from "@/lib/notifications";

export default function MentionsPage() {
  const { t } = useTranslation();
  const scope = useNotificationScope();
  const [notice, setNotice] = useState<MentionNotice>(null);
  useSetBreadcrumbs([{ label: t("mentions.title") }]);
  const { data: count, isError: countError } = useMentionsCount();
  const { data = [], isLoading, isError } = useQuery(notificationListOptions(mentionsFilter, scope));
  const rows = [...data].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const total = count?.count ?? 0;
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("mentions.title")}</h1>
        {total > 0 && <Badge data-testid="badge-mentions-page" aria-label={t("mentions.count", { count: total })}>{total > 99 ? "99+" : total}</Badge>}
      </div>
      {countError && <p role="alert" className="text-sm text-destructive">{t("mentions.countFailed")}</p>}
      {notice && <p role="alert" className="mb-3 text-sm text-muted-foreground">{t(`mentions.${notice}`)}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">{t("mentions.loading")}</p>
        : isError ? <p role="alert" className="text-sm text-destructive">{t("mentions.loadFailed")}</p>
        : rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("mentions.empty")}</p>
        : <div className="divide-y">{rows.map(row => <MentionRow key={row.id} notification={row} onNotice={setNotice} />)}</div>}
    </div>
  );
}
