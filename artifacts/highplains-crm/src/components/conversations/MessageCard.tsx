import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, MoreHorizontal, Paperclip } from "lucide-react";
import { StoredEmailFrame } from "@/components/conversations/StoredEmailFrame";
import { cn } from "@/lib/utils";
import { CONVERSATIONS_NS } from "./i18n";
import { StaffTag } from "./bits";
import type { ConversationMessage } from "./api";

export function PlainBody({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground/90">{text}</div>;
}

export function AttachmentChips({ items, idPrefix }: { items: { name: string }[]; idPrefix: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {items.map((a, i) => (
        <span key={`${a.name}-${i}`} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground" data-testid={`chip-attachment-${idPrefix}-${i}`}>
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

export default function MessageCard({ message, defaultOpen }: { message: ConversationMessage; defaultOpen: boolean }) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const [open, setOpen] = useState(defaultOpen);
  const [earlier, setEarlier] = useState(false);
  const m = message;
  const label = m.label === "estimate" && m.versionNumber ? t("labels.estimateVersion", { n: m.versionNumber }) : t(`labels.${m.label}`);
  const from = m.fromName ? `${m.fromName} <${m.fromAddress ?? ""}>` : m.fromAddress ?? "";
  const to = (m.toAddresses ?? []).join(", ");
  const when = format(new Date(m.at), "MMM d, yyyy · h:mm a");
  const Arrow = m.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;

  const mainHtml = m.newHtml;
  const earlierHtml = m.earlierHtml;
  const mainText = m.newText;
  const hasEarlier = !!(earlierHtml || m.earlierText);
  const title = `${label} ${when}`;

  return (
    <article className={cn("rounded-xl border bg-card transition-shadow", open ? "shadow-sm" : "hover:border-foreground/20")} data-testid={`card-message-${m.id}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left" data-testid={`button-toggle-message-${m.id}`}>
        <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", m.direction === "inbound" ? "bg-[hsl(198_70%_93%)] text-[hsl(204_62%_30%)]" : "bg-[hsl(150_22%_90%)] text-[hsl(152_30%_26%)]")}>
          <Arrow className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold">{m.fromName || m.fromAddress || label}</span>
            <span className="rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">{label}</span>
            {m.staff && <StaffTag staff={m.staff} />}
            {!m.staff && m.outsideCrm && <span className="text-[11px] italic text-muted-foreground" data-testid={`text-outside-crm-${m.id}`}>{t("outsideCrm")}</span>}
            {!open && m.attachments.length > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" />}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{when}</span>
          </span>
          {open ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
              {from && t("fromLabel", { from })}{to && <> · {t("toLabel", { to })}</>}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{m.snippet}</span>
          )}
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 pb-4 pt-3">
          {mainHtml ? <StoredEmailFrame html={mainHtml} title={title} /> : mainText ? <PlainBody text={mainText} /> : <p className="text-sm italic text-muted-foreground">{t("noBody")}</p>}
          {hasEarlier && (
            <div>
              <button type="button" onClick={() => setEarlier((e) => !e)} aria-expanded={earlier} className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground" data-testid={`button-earlier-${m.id}`}>
                <MoreHorizontal className="h-3.5 w-3.5" />{earlier ? t("hideEarlier") : t("showEarlier")}
              </button>
              {earlier && (
                <div className="mt-2 border-l-2 border-muted pl-3 opacity-90">
                  {earlierHtml ? <StoredEmailFrame html={earlierHtml} title={`${title} earlier`} /> : <PlainBody text={m.earlierText} />}
                </div>
              )}
            </div>
          )}
          <AttachmentChips items={m.attachments} idPrefix={m.id} />
        </div>
      )}
    </article>
  );
}
