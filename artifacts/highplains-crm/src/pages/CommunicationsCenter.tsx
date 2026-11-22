import { useParams, useLocation, useRouter, Link } from "wouter";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { useAuth } from "@/hooks/use-auth";
import { CONVERSATIONS_NS } from "@/components/conversations/i18n";
import ConversationsWorkspace from "@/components/conversations/ConversationsWorkspace";
import type { WorkspaceFilter } from "@/components/conversations/api";

const FILTERS: WorkspaceFilter[] = ["all", "needs_reply", "sent", "unsorted"];
export function threadFilter(tab: string | undefined, canSeeUnsorted: boolean): WorkspaceFilter {
  if (!tab || !FILTERS.includes(tab as WorkspaceFilter) || (tab === "unsorted" && !canSeeUnsorted)) return "all";
  return tab as WorkspaceFilter;
}

/** M8 Conversations page. Route kept at /dashboard/communications/:tab? */
export default function CommunicationsCenter() {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const params = useParams<{ tab?: string }>();
  const [, navigate] = useLocation();
  const router = useRouter();
  const search = router.searchHook(router);
  const { user } = useAuth();
  const isAdminOrOffice = user?.accessRole === "admin" || user?.accessRole === "office";
  useSetBreadcrumbs([{ label: t("title") }], [t]);

  const raw = params.tab;
  const filter = threadFilter(raw, isAdminOrOffice);
  useEffect(() => {
    if (!raw || raw === filter) return;
    const query = search.replace(/^\?/, "");
    navigate(`/dashboard/communications/${filter}${query ? `?${query}` : ""}`, { replace: true });
  }, [raw, filter, search, navigate]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="page-conversations">
      <ConversationsWorkspace
        filter={filter}
        onFilterChange={(f) => navigate(`/dashboard/communications/${f}`)}
        showUnsorted={isAdminOrOffice}
        allowCompose={isAdminOrOffice}
        initialConversation={filter === "unsorted" ? null : new URLSearchParams(search).get("conversation")}
        renderHeader={(mailbox) => (
          <header className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b bg-background px-5 py-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-semibold tracking-tight">{t("title")}</h1>
              <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground" data-testid="text-mailbox-line">
                {mailbox ? <>{mailbox.emailAddress} · {t("syncedEvery", { count: mailbox.syncIntervalMinutes })}</> : t("noMailbox")}
              </p>
            </div>
            {isAdminOrOffice && (
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <Link href="/dashboard/settings/shared-mailboxes" data-testid="link-email-settings"><Settings className="h-3.5 w-3.5" />{t("emailSettings")}</Link>
              </Button>
            )}
          </header>
        )}
      />
    </div>
  );
}
