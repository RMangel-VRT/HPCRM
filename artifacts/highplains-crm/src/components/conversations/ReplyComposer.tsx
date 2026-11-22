import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StoredEmailFrame } from "@/components/conversations/StoredEmailFrame";
import { cn } from "@/lib/utils";
import { CONVERSATIONS_NS } from "./i18n";
import { StaffTag } from "./bits";
import { useReplyPreview, useSendReply } from "./api";

export default function ReplyComposer({ conversationKey, parentId, customerId, fallbackTo }: {
  conversationKey: string;
  parentId: string;
  customerId?: string;
  fallbackTo?: string | null;
}) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const preview = useReplyPreview(conversationKey, parentId, customerId, body);
  const send = useSendReply(conversationKey, customerId);
  const p = preview.data;

  function submit() {
    if (!body.trim() || !preview.isCurrent || send.isPending) return;
    send.mutate({ parentId, body }, {
      onSuccess: (r) => {
        if (r.deliveryStatus === "sent") {
          setBody("");
          setMode("write");
          toast({ title: t("composer.sent") });
        } else {
          toast({ title: t("composer.sendError"), description: t("composer.sendErrorBody"), variant: "destructive" });
        }
      },
      onError: () => toast({ title: t("composer.sendError"), description: t("composer.sendErrorBody"), variant: "destructive" }),
    });
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" data-testid="composer-reply">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12.5px]">
        <span className="text-muted-foreground">{t("composer.to")}</span>
        <span className="font-medium" data-testid="text-reply-to">{p?.to ?? fallbackTo ?? ""}</span>
        <div className="ml-auto inline-flex rounded-md bg-muted p-0.5" role="tablist">
          {(["write", "preview"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={cn("rounded px-2.5 py-1 text-[12px] font-medium transition-colors", mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
              data-testid={`tab-composer-${m}`}>
              {m === "write" ? t("composer.write") : t("composer.preview")}
            </button>
          ))}
        </div>
      </div>

      {mode === "write" ? (
        <div className="space-y-2 px-4 py-3">
          <p className="text-[13.5px] text-muted-foreground" data-testid="text-reply-greeting">{p?.greeting ?? "\u00a0"}</p>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("composer.placeholder")} rows={5}
            maxLength={100000} aria-label={t("composer.placeholder")} disabled={send.isPending}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
            className="resize-y border-dashed bg-background text-[14px] leading-relaxed" data-testid="input-reply-body" />
          <p className="text-[12.5px] text-muted-foreground" data-testid="text-reply-signoff">
            {p && <>Thank you,<br /><strong>{p.company.name}</strong></>}
          </p>
          {p && <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
            {p.company.logoUrl && <img src={p.company.logoUrl} alt="" width={36} height={36} referrerPolicy="no-referrer" />}
            <div><p className="font-medium text-foreground">{p.company.name}</p>
              {p.company.addressLine && <p>{p.company.addressLine}</p>}
              <p className="break-words">{[p.company.phone, p.company.email, p.company.website].filter(Boolean).join(" · ")}</p>
            </div>
          </div>}
          {preview.isError && <p role="alert" className="text-sm text-destructive">{t("composer.previewError")}</p>}
        </div>
      ) : (
        <div className="relative px-4 py-3" data-testid="panel-reply-preview">
          {preview.isError ? (
            <p className="text-sm text-destructive">{t("composer.previewError")}</p>
          ) : !p || !preview.isCurrent ? (
            <div className="space-y-2" aria-label={t("composer.previewLoading")}><Skeleton className="h-4 w-1/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-4 w-1/2" /></div>
          ) : (
            <div className={cn("rounded-lg border bg-[hsl(60_10%_98%)] p-2 transition-opacity", preview.isFetching && "opacity-60")}>
              <p className="px-2 pb-2 text-[12px] text-muted-foreground">{p.subject}</p>
              <StoredEmailFrame html={p.html} title={p.subject} />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
        {p?.staff && <StaffTag staff={p.staff} />}
        {p && <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{t("composer.loggedAs", { name: p.mailbox.displayName, address: p.mailbox.emailAddress })}</span>}
        <Button size="sm" onClick={submit} disabled={!body.trim() || !preview.isCurrent || send.isPending} className="ml-auto gap-1.5" data-testid="button-send-reply">
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {send.isPending ? t("composer.sending") : t("composer.send")}
        </Button>
      </div>
    </section>
  );
}
