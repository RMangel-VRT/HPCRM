import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { ExternalLink, MessagesSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CONVERSATIONS_NS } from "./i18n";
import { KindBadge, StaffTag } from "./bits";
import MessageCard from "./MessageCard";
import ReplyComposer from "./ReplyComposer";
import CustomerConversationsDialog from "./CustomerConversationsDialog";
import { initials, useConversation, type ConversationSummary } from "./api";

export function CustomerHeader({ customer }: { customer: NonNullable<ConversationSummary["customer"]> }) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const [dialog, setDialog] = useState(false);
  const typeLabel = customer.type ? t(`customerType.${customer.type}`, { defaultValue: customer.type }) : null;
  const detail = [typeLabel, customer.managementCompany].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5" data-testid="header-conversation-customer">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(customer.name)}</span>
      <div className="min-w-36 flex-1">
        <p className="break-words text-[15px] font-semibold" data-testid="text-pane-customer-name">{customer.name}</p>
        {detail && <p className="break-words text-xs text-muted-foreground">{detail}</p>}
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setDialog(true)} className="gap-1.5" data-testid="button-all-conversations">
          <MessagesSquare className="h-3.5 w-3.5" />{t("allConversations")}
        </Button>
        <Button size="sm" variant="ghost" asChild className="gap-1.5">
          <Link href={`/dashboard/customers/${customer.id}`} data-testid="link-open-customer"><ExternalLink className="h-3.5 w-3.5" />{t("openCustomer")}</Link>
        </Button>
      </div>
      <CustomerConversationsDialog open={dialog} onOpenChange={setDialog} customer={customer} />
    </div>
  );
}

export function PaneSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function ConversationPane({ conversationKey, customerId, showCustomerHeader }: {
  conversationKey: string;
  customerId?: string;
  showCustomerHeader: boolean;
}) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const q = useConversation(conversationKey, customerId);
  const { user } = useAuth();
  const canReply = user?.accessRole === "admin" || user?.accessRole === "office";

  if (q.isLoading) return <PaneSkeleton />;
  if (q.isError || !q.data) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("detailError")}</p>
          <Button size="sm" variant="outline" onClick={() => void q.refetch()} className="gap-1.5" data-testid="button-retry-detail"><RefreshCw className="h-3.5 w-3.5" />{t("retry")}</Button>
        </div>
      </div>
    );
  }
  const c = q.data;
  const last = c.messages.length - 1;
  const target = c.replyTargetId ? c.messages.find((m) => m.id === c.replyTargetId) : null;
  const replyCustomerId = customerId ?? c.customer?.id;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={`pane-conversation-${c.key}`}>
      {showCustomerHeader && c.customer && <CustomerHeader customer={c.customer} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] space-y-3 px-5 py-4">
          <div className="space-y-2">
            <h2 className="text-[19px] font-semibold leading-tight tracking-tight" data-testid="text-conversation-subject">{c.subject}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <KindBadge kind={c.kind} />
              <span>{t("messages", { count: c.messageCount })}</span>
              {c.team.length > 0 && (
                <>
                  <span className="mx-1 h-3 w-px bg-border" />
                  <span>{t("ourTeam")}</span>
                  {c.team.map((s) => <StaffTag key={s.userId} staff={s} />)}
                </>
              )}
            </div>
          </div>
          {c.messages.map((m, i) => <MessageCard key={`${m.id}:${i === last}`} message={m} defaultOpen={i === last} />)}
          {canReply && c.replyTargetId && replyCustomerId ? (
            <ReplyComposer key={`${c.key}:${c.replyTargetId}`} conversationKey={c.key} parentId={c.replyTargetId} customerId={replyCustomerId}
              fallbackTo={target ? (target.direction === "inbound" ? target.fromAddress : target.toAddresses?.[0]) : null} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
