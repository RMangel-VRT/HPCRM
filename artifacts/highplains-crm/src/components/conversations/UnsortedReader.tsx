import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ArrowDownLeft, CornerDownRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoredEmailFrame } from "@/components/conversations/StoredEmailFrame";
import { CandidateCustomerChips, RouteEmailDialog } from "@/components/customer/communications/UnsortedAssignment";
import { CONVERSATIONS_NS } from "./i18n";
import { AttachmentChips, PlainBody } from "./MessageCard";
import { invalidateConversations, type PendingUnsorted } from "./api";

function attachmentNames(raw: unknown): { name: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const name = o.name ?? o.filename ?? o.fileName;
    return { name: typeof name === "string" ? name : "attachment" };
  });
}

/** Pending unsorted email reader. Assign reuses the existing route dialog and candidate chips. */
export default function UnsortedReader({ email, onRouted }: { email: PendingUnsorted; onRouted: () => void }) {
  const { t } = useTranslation(CONVERSATIONS_NS);
  const [assign, setAssign] = useState(false);
  const from = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
  const when = format(new Date(email.receivedAt), "MMM d, yyyy · h:mm a");
  const routed = () => { invalidateConversations(); onRouted(); };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={`pane-unsorted-${email.id}`}>
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground">?</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{t("noCustomerYet")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("fromLabel", { from: email.fromAddress })} · {t("notMatched")}</p>
        </div>
        <Button size="sm" onClick={() => setAssign(true)} className="gap-1.5" data-testid="button-assign-customer"><UserPlus className="h-3.5 w-3.5" />{t("assignCustomer")}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] space-y-3 px-5 py-4">
          <h2 className="text-[19px] font-semibold leading-tight tracking-tight">{email.subject}</h2>
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("suggested")}</p>
            <CandidateCustomerChips email={email} onRoute={routed} />
          </div>
          <article className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-[hsl(198_70%_93%)] text-[hsl(204_62%_30%)]"><ArrowDownLeft className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{from}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{(email.toAddresses ?? []).length > 0 && t("toLabel", { to: (email.toAddresses ?? []).join(", ") })}</p>
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">{when}</span>
            </div>
            <div className="space-y-3 border-t px-4 pb-4 pt-3">
              {email.newHtml ? <StoredEmailFrame html={email.newHtml} title={email.subject} /> : email.newText ? <PlainBody text={email.newText} /> : <p className="text-sm italic text-muted-foreground">{t("noBody")}</p>}
              {(email.earlierHtml || email.earlierText) && <details className="rounded-md border border-dashed px-3 py-2 text-sm">
                <summary className="cursor-pointer">{t("showEarlier")}</summary>
                {email.earlierHtml ? <StoredEmailFrame html={email.earlierHtml} title={t("showEarlier")} /> : <PlainBody text={email.earlierText} />}
              </details>}
              <AttachmentChips items={attachmentNames(email.attachmentsJson)} idPrefix={email.id} />
            </div>
          </article>
          <div className="flex items-start gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-[13px] text-muted-foreground" data-testid="note-unsorted-reply">
            <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0" />{t("composer.unsortedNote")}
          </div>
        </div>
      </div>
      <RouteEmailDialog email={email} open={assign} onOpenChange={setAssign} onRouted={routed} />
    </div>
  );
}
