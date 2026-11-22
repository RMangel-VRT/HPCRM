import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isToday, format } from "date-fns";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Inbox, Paperclip, PenSquare, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import "./i18n";
import { CONVERSATIONS_NS } from "./i18n";
import { KindBadge, TeamInitials } from "./bits";
import ConversationPane from "./ConversationPane";
import UnsortedReader from "./UnsortedReader";
import ComposeCustomerDialog from "./ComposeCustomerDialog";
import {
  useConversationList, useDebounced, usePendingUnsorted,
  type ConversationListResponse, type ConversationSummary, type WorkspaceFilter,
} from "./api";

function when(at: string) {
  const d = new Date(at);
  if (isToday(d)) return format(d, "h:mm a");
  const days = (Date.now() - d.getTime()) / 86_400_000;
  return days < 6 ? format(d, "EEE") : days < 300 ? format(d, "MMM d") : format(d, "MMM yyyy");
}

function Row({ c, active, onClick, hideCustomer }: { c: ConversationSummary; active: boolean; onClick: () => void; hideCustomer: boolean }) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const Arrow = c.lastMessage.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
  const sender = c.lastMessage.senderFirstName;
  return (
    <button type="button" onClick={onClick} aria-current={active}
      className={cn("group relative block w-full border-b px-4 py-3 text-left transition-colors",
        active ? "bg-primary/[0.07]" : "hover:bg-muted/50")}
      data-testid={`row-conversation-${c.key}`}>
      {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
      <div className="flex items-center gap-1.5">
        <Arrow className={cn("h-3.5 w-3.5 shrink-0", c.lastMessage.direction === "inbound" ? "text-[hsl(204_62%_40%)]" : "text-muted-foreground")} />
        {c.needsReply && <span className="h-2 w-2 shrink-0 rounded-full bg-[hsl(14_80%_52%)]" aria-label={t("filters.needs_reply")} data-testid={`dot-needs-reply-${c.key}`} />}
        <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", hideCustomer ? "font-semibold" : "font-bold")}>
          {hideCustomer ? c.subject : c.customer?.name ?? t("noCustomerYet")}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={new Date(c.lastMessage.at).toLocaleString()}>{when(c.lastMessage.at)}</span>
      </div>
      {!hideCustomer && <p className="mt-0.5 truncate pl-5 text-[13px] text-foreground/85">{c.subject}</p>}
      <p className="mt-0.5 line-clamp-2 pl-5 text-[12.5px] leading-snug text-muted-foreground">
        {sender && <span className="font-medium text-foreground/70">{sender}: </span>}{c.lastMessage.snippet}
      </p>
      <div className="mt-1.5 flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
        <KindBadge kind={c.kind} />
        {c.messageCount > 1 && <span className="tabular-nums">{c.messageCount}</span>}
        {c.hasAttachments && <Paperclip className="h-3 w-3" />}
        <span className="ml-auto"><TeamInitials team={c.team} /></span>
      </div>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div>{Array.from({ length: 7 }).map((_, i) => (
      <div key={i} className="space-y-2 border-b px-4 py-3">
        <Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" />
      </div>
    ))}</div>
  );
}

function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
      <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl border-2 border-dashed text-muted-foreground">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <p className="text-sm font-semibold">{title}</p>
      {body && <p className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  );
}

export interface ConversationsWorkspaceProps {
  /** Customer-scoped mode: no customer header, no Unsorted chip. */
  customerId?: string;
  filter: WorkspaceFilter;
  onFilterChange: (f: WorkspaceFilter) => void;
  showUnsorted?: boolean;
  allowCompose?: boolean;
  initialConversation?: string | null;
  renderHeader?: (mailbox: ConversationListResponse["mailbox"] | undefined) => ReactNode;
}

export default function ConversationsWorkspace({ customerId, filter, onFilterChange, showUnsorted = false, allowCompose = false, initialConversation, renderHeader }: ConversationsWorkspaceProps) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const scoped = !!customerId;
  const unsortedOn = showUnsorted && !scoped;
  const effFilter: WorkspaceFilter = filter === "unsorted" && !unsortedOn ? "all" : filter;
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 300);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(initialConversation ?? null);
  const [compose, setCompose] = useState(false);

  useEffect(() => { setPage(1); setSelected(initialConversation ?? null); }, [effFilter, search, customerId, initialConversation]);

  const list = useConversationList({ filter: effFilter === "unsorted" ? "all" : effFilter, customerId, search, page });
  const unsorted = usePendingUnsorted(effFilter === "unsorted", page, search);
  const unsortedItems = unsorted.data ?? [];

  const counts = list.data?.counts;
  const chips: { id: WorkspaceFilter; n?: number }[] = [
    { id: "all", n: counts?.all }, { id: "needs_reply", n: counts?.needs_reply }, { id: "sent", n: counts?.sent },
    ...(unsortedOn ? [{ id: "unsorted" as const, n: counts?.unsorted }] : []),
  ];

  const isUnsorted = effFilter === "unsorted";
  const items = list.data?.items ?? [];
  const selectedUnsorted = isUnsorted ? unsortedItems.find((e) => e.id === selected) ?? null : null;
  const hasMore = !!list.data && page * list.data.pageSize < list.data.counts[effFilter];

  const listBody = isUnsorted ? (
    unsorted.isLoading ? <ListSkeleton /> : unsorted.isError ? (
      <div className="space-y-3 p-6 text-center"><p className="text-sm text-muted-foreground">{t("loadError")}</p>
        <Button size="sm" variant="outline" onClick={() => void unsorted.refetch()} data-testid="button-retry-unsorted"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("retry")}</Button></div>
    ) : unsortedItems.length === 0 ? <EmptyState title={search ? t("emptySearch", { q: search }) : t("emptyUnsorted")} /> :
    unsortedItems.map((e) => (
      <button key={e.id} type="button" onClick={() => setSelected(e.id)} aria-current={selected === e.id}
        className={cn("relative block w-full border-b px-4 py-3 text-left transition-colors", selected === e.id ? "bg-primary/[0.07]" : "hover:bg-muted/50")}
        data-testid={`row-unsorted-${e.id}`}>
        {selected === e.id && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
        <div className="flex items-center gap-1.5">
          {e.direction === "outbound" ? <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            : <ArrowDownLeft className="h-3.5 w-3.5 text-[hsl(204_62%_40%)]" />}
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold italic text-muted-foreground">{t("noCustomerYet")}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{when(String(e.receivedAt))}</span>
        </div>
        <p className="mt-0.5 truncate pl-5 text-[13px]">{e.subject}</p>
        <p className="mt-0.5 truncate pl-5 text-[12.5px] text-muted-foreground">{e.fromName || e.fromAddress}{e.snippet ? `: ${e.snippet}` : ""}</p>
      </button>
    ))
  ) : list.isLoading ? <ListSkeleton /> : list.isError ? (
    <div className="space-y-3 p-6 text-center"><p className="text-sm text-muted-foreground">{t("loadError")}</p>
      <Button size="sm" variant="outline" onClick={() => void list.refetch()} data-testid="button-retry-list"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("retry")}</Button></div>
  ) : items.length === 0 ? (
    <EmptyState title={search ? t("emptySearch", { q: search }) : t("emptyListTitle")} body={search ? undefined : t("emptyListBody")} />
  ) : (
    items.map((c) => <Row key={c.key} c={c} active={selected === c.key} onClick={() => setSelected(c.key)} hideCustomer={scoped} />)
  );

  const pane = selected == null ? (
    <div className="hidden h-full place-items-center p-10 text-center md:grid">
      <div className="max-w-xs space-y-2">
        <div className="mx-auto mb-3 flex w-24 flex-col gap-1.5 opacity-60">
          <span className="h-3 rounded bg-muted" /><span className="ml-4 h-3 rounded bg-muted" /><span className="h-8 rounded-md border-2 border-dashed" />
        </div>
        <p className="text-sm font-semibold">{t("selectPrompt")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("selectPromptBody")}</p>
      </div>
    </div>
  ) : isUnsorted ? (selectedUnsorted ? <UnsortedReader key={selectedUnsorted.id} email={selectedUnsorted} onRouted={() => setSelected(null)} /> : null)
    : <ConversationPane key={selected} conversationKey={selected} customerId={customerId} showCustomerHeader={!scoped} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {renderHeader?.(list.data?.mailbox)}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className={cn("flex min-h-0 w-full flex-col bg-background md:w-[340px] md:shrink-0 md:border-r",
          selected == null ? "flex-1 md:flex-none" : "max-h-[36%] shrink-0 border-b md:max-h-none md:border-b-0")} data-testid="list-conversations">
          <div className="space-y-2.5 border-b px-3 py-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} maxLength={300} aria-label={t("searchPlaceholder")} placeholder={t("searchPlaceholder")} className="h-9 pl-8 pr-8" data-testid="input-conversations-search" />
                {searchInput && (
                  <button type="button" onClick={() => setSearchInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={t("clearSearch")} data-testid="button-clear-conversations-search"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>
              {allowCompose && (
                <Button size="sm" className="h-9 gap-1.5" onClick={() => setCompose(true)} data-testid="button-new-conversation"><PenSquare className="h-3.5 w-3.5" />{t("newConversation")}</Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {chips.map((ch) => (
                <button key={ch.id} type="button" role="tab" aria-selected={effFilter === ch.id} onClick={() => onFilterChange(ch.id)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    effFilter === ch.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    ch.id === "unsorted" && effFilter !== ch.id && "border-dashed")}
                  data-testid={`chip-filter-${ch.id}`}>
                  {t(`filters.${ch.id}`)}
                  {ch.n != null && <span className={cn("tabular-nums", effFilter === ch.id ? "opacity-80" : "opacity-70")}>{ch.n}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{listBody}
            {(page > 1 || hasMore) && <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => { setSelected(null); setPage(p => p - 1); }} data-testid="button-page-prev">{t("prev")}</Button>
              <span>{t("pageOf", { page })}</span>
              <Button size="sm" variant="ghost" disabled={!hasMore} onClick={() => { setSelected(null); setPage(p => p + 1); }} data-testid="button-page-next">{t("next")}</Button>
            </div>}
          </div>
        </aside>
        <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(var(--muted)/0.25)]", selected == null && "hidden md:flex")}>
          {selected != null && (
            <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-1.5 border-b px-4 py-2 text-xs text-muted-foreground md:hidden" data-testid="button-conversation-back">
              <ArrowLeft className="h-3.5 w-3.5" />{t("back")}
            </button>
          )}
          <div className="min-h-0 flex-1">{pane}</div>
        </section>
      </div>
      {allowCompose && <ComposeCustomerDialog open={compose} onOpenChange={setCompose} />}
    </div>
  );
}
