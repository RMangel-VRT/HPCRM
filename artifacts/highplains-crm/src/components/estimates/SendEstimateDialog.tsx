import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { estimateApproximatePages, estimateEmailInput, estimateHasMultipleVersions, estimatePdfFilename,
  type EstimateEmailInput, type EstimateEmailOptionsDto } from "../../../../../lib/db/src/estimateContracts";
import { apiRequest } from "@/lib/queryClient";
import { ESTIMATES_API, type EstimateDetailDto } from "@/lib/estimateBuilder";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EstimateNeedsPriceWarning } from "./LifecycleDialogs";
import { useEstimateEmailPreview } from "./useEstimateEmailPreview";

const split = (value: string) => value.split(/[,;\s]+/).filter(Boolean);

export function SendEstimateDialog({ estimate, companyId, senderId, busy, error, resend,
  delivery, needPrice, onSend, onRecover, onClose }: {
  estimate: EstimateDetailDto; companyId: string; senderId?: string;
  busy: boolean; error: string | null; resend: boolean; delivery: "recover" | "recordUnavailable" | "uncertain" | null;
  needPrice: { id: string; name: string | null }[] | null;
  onSend: (body: EstimateEmailInput) => void; onRecover: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mailboxId, setMailboxId] = useState("");
  const [to, setTo] = useState(""), [cc, setCc] = useState("");
  const [editedSubject, setEditedSubject] = useState<string>();
  const [initialSubject, setInitialSubject] = useState<string>();
  const [note, setNote] = useState("");
  const [initialized, setInitialized] = useState(false);
  const version = estimate.version;
  const showVersion = estimateHasMultipleVersions(estimate.versions.length);
  const options = useQuery<EstimateEmailOptionsDto>({
    queryKey: [ESTIMATES_API, "email-options", companyId, senderId, estimate.id],
    enabled: !delivery,
    queryFn: async ({ signal }) => (await apiRequest("GET", `${ESTIMATES_API}/${encodeURIComponent(estimate.id)}/email-options`, undefined,
      { headers: companyHeaders(companyId), signal })).json(),
  });
  const preview = useEstimateEmailPreview({
    companyId, estimateId: estimate.id, versionId: version.id, updatedAt: estimate.updatedAt,
    enabled: !delivery, note: note.trim(), subject: resend ? undefined : editedSubject?.trim() || undefined,
  });
  const previewSubject = preview.result?.subject;
  useEffect(() => {
    if (previewSubject !== undefined && (resend || editedSubject === undefined)) setInitialSubject(previewSubject);
  }, [editedSubject, previewSubject, resend]);
  const subject = resend ? previewSubject ?? initialSubject ?? "" : editedSubject ?? previewSubject ?? initialSubject ?? "";

  useEffect(() => {
    if (!options.data || initialized) return;
    setMailboxId(options.data.defaultMailboxId ?? "");
    setTo(options.data.defaultTo ?? "");
    setInitialized(true);
  }, [initialized, options.data]);

  const lines = version.sections.flatMap(s => s.lines);
  const warning = needPrice ?? lines.filter(l => l.needsPrice);
  const confirming = !resend && !!needPrice?.length;
  const payload = estimateEmailInput.safeParse({ mailboxAccountId: mailboxId, to: split(to), cc: split(cc),
    subject, note: note.trim() || undefined, ...(confirming ? { confirmZeroPriced: true } : {}) });
  const selectedMailbox = options.data?.mailboxes.find(m => m.id === mailboxId);
  const valid = initialized && !options.isError && selectedMailbox && payload.success && preview.result && (resend || lines.length > 0);
  const attachment = version.issuedAttachment;
  const filename = attachment?.filename ?? estimatePdfFilename(estimate.estimateNumber, version.versionNumber, showVersion);
  const pages = estimateApproximatePages(version);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className={`flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl flex-col overflow-hidden rounded-lg p-4 sm:p-6 ${delivery ? "" : "lg:max-w-[min(1120px,calc(100vw-3rem))]"}`} data-testid="dialog-estimate-email">
      <DialogHeader>
        <DialogTitle>{t(delivery === "recover" ? "estimateBuilder.email.recoveryTitle" : resend ? "estimateBuilder.email.resend" : "estimateBuilder.email.action")}</DialogTitle>
        <DialogDescription>{t(delivery === "recover" ? "estimateBuilder.email.recoveryBody"
          : delivery === "uncertain" ? "estimateBuilder.email.errors.ESTIMATE_EMAIL_DELIVERY_UNCERTAIN"
          : delivery ? "estimateBuilder.email.recordUnavailable" : resend ? "estimateBuilder.email.resendBody" : "estimateBuilder.email.description")}</DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 min-w-0 flex-col gap-4" noValidate onSubmit={e => {
        e.preventDefault();
        if (!busy && !delivery && valid && payload.success) onSend(payload.data);
      }}>
        {!delivery && <div className="min-h-0 overflow-y-auto overflow-x-hidden px-1">
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-testid="estimate-email-layout">
          <div className="min-w-0 space-y-3" data-testid="estimate-email-fields">
          {!resend && warning.length > 0 && <EstimateNeedsPriceWarning lines={warning} />}
          {!resend && lines.length === 0 && <p role="alert" className="text-sm">{t("estimateBuilder.life.err.NO_LINES")}</p>}
          {options.isPending && <p role="status" className="text-sm">{t("estimateBuilder.email.loading")}</p>}
          {options.isError && <div role="alert" className="text-sm text-destructive">{t("estimateBuilder.email.loadFailed")}{" "}
            <Button type="button" variant="ghost" onClick={() => void options.refetch()}>{t("companyDocuments.actions.retry")}</Button></div>}
          {options.data?.mailboxes.length === 0 && <p className="text-sm">{t("estimateBuilder.email.noMailbox")}{" "}
            <Link className="underline" href="/dashboard/settings/shared-mailboxes">{t("estimateBuilder.email.connect")}</Link></p>}
          <div className="space-y-1"><Label htmlFor="estimate-email-from">{t("companyDocuments.email.from")}</Label>
            <select id="estimate-email-from" value={mailboxId} onChange={e => setMailboxId(e.target.value)}
              data-testid="select-estimate-email-from"
              disabled={busy || !options.data?.mailboxes.length} className="w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">{t("companyDocuments.email.chooseMailbox")}</option>
              {options.data?.mailboxes.map(m => <option key={m.id} value={m.id}>{m.displayName} · {m.emailAddress}</option>)}
            </select>

          </div>
          {(["to", "cc"] as const).map(kind => <div className="space-y-1" key={kind}>
            <Label htmlFor={`estimate-email-${kind}`}>{t(`companyDocuments.email.${kind}`)}</Label>
            <Input id={`estimate-email-${kind}`} type="email" multiple list="estimate-email-suggestions" disabled={busy || !initialized}
              value={kind === "to" ? to : cc} onChange={e => (kind === "to" ? setTo : setCc)(e.target.value)} />
          </div>)}
          <datalist id="estimate-email-suggestions">{options.data?.recipients.map(r => <option key={r.email} value={r.email} label={r.name || undefined} />)}</datalist>
          <p className="text-xs text-muted-foreground">{t("estimateBuilder.email.recipientHint")}</p>
          <div className="space-y-1"><Label htmlFor="estimate-email-subject">{t("companyDocuments.email.subject")}</Label>
            <Input id="estimate-email-subject" data-testid="input-estimate-email-subject" maxLength={255}
              value={subject} readOnly={resend} disabled={busy || (!previewSubject && initialSubject === undefined)}
              onChange={e => setEditedSubject(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="estimate-email-note">{t("estimateBuilder.email.note")}</Label>
            <Textarea id="estimate-email-note" data-testid="input-estimate-email-note" rows={4} maxLength={2000} value={note}
              disabled={busy} onChange={e => setNote(e.target.value)} /></div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="estimate-email-attachment">
            <FileText aria-hidden className="h-4 w-4 shrink-0 text-[hsl(var(--rail-active-icon))]" />
            <span className="min-w-0 flex-1 truncate">{filename}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{t(attachment ? "estimateBuilder.email.pages" : "estimateBuilder.email.approxPages", { count: pages })}</span>
          </div>
          </div>
          <section aria-label={t("estimateBuilder.email.preview")} className="min-w-0 space-y-2" data-testid="estimate-email-preview">
            <h3 className="text-sm font-semibold">{t("estimateBuilder.email.preview")}</h3>
            <p className="break-words text-sm"><strong>{t("companyDocuments.email.subject")}: </strong>
              {preview.result?.subject ?? "—"}</p>
            {preview.result ? <iframe sandbox="" referrerPolicy="no-referrer" srcDoc={preview.result.html}
              title={t("estimateBuilder.email.preview")} data-testid="frame-estimate-email-preview"
              className="h-[min(52dvh,560px)] min-h-[340px] w-full min-w-0 rounded-md border bg-[#f1f2ef]" /> :
              <div className="min-h-[340px] rounded-md border bg-muted/30 p-3 text-sm">
                {preview.failed ? <div role="alert">{t("estimateBuilder.email.previewFailed")}{" "}
                  <Button type="button" variant="ghost" data-testid="button-retry-estimate-email-preview" onClick={preview.retry}>
                    {t("companyDocuments.actions.retry")}</Button></div>
                  : <p role="status">{t("estimateBuilder.email.previewLoading")}</p>}
              </div>}
          </section>
          </div>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t(delivery ? "estimateBuilder.pdf.close" : "estimateBuilder.cancel")}</Button>
          {delivery === "recover" && <Button type="button" disabled={busy} onClick={onRecover} data-testid="button-recover-estimate-email">
            {t(busy ? "estimateBuilder.life.working" : "estimateBuilder.email.recoveryAction")}</Button>}
          {!delivery && <Button type="submit" disabled={!valid || busy} data-testid="button-submit-estimate-email">
            <Send aria-hidden className="mr-1.5 h-3.5 w-3.5" />{t(busy ? "companyDocuments.email.sending"
              : confirming ? "estimateBuilder.life.send.sendAnyway" : "companyDocuments.email.send")}</Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
