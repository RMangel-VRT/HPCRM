import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { estimateEmailInput, estimateHasMultipleVersions, estimatePdfFilename,
  type EstimateEmailInput, type EstimateEmailOptionsDto } from "../../../../../lib/db/src/estimateContracts";
import { apiRequest } from "@/lib/queryClient";
import { ESTIMATES_API, type EstimateDetailDto } from "@/lib/estimateBuilder";
import { companyHeaders, formatCents } from "@/lib/hardscapeCatalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EstimateNeedsPriceWarning } from "./LifecycleDialogs";
import { estimateApproximatePages } from "./EstimateReviewRail";

const split = (value: string) => value.split(/[,;\s]+/).filter(Boolean);

export function SendEstimateDialog({ estimate, companyId, senderId, senderName, customerName, lang, busy, error, resend,
  delivery, needPrice, onSend, onRecover, onClose }: {
  estimate: EstimateDetailDto; companyId: string; senderId?: string; senderName: string; customerName: string; lang: string;
  busy: boolean; error: string | null; resend: boolean; delivery: "recover" | "recordUnavailable" | "uncertain" | null;
  needPrice: { id: string; name: string | null }[] | null;
  onSend: (body: EstimateEmailInput) => void; onRecover: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mailboxId, setMailboxId] = useState("");
  const [to, setTo] = useState(""), [cc, setCc] = useState("");
  const [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const [initialized, setInitialized] = useState(false);
  const version = estimate.version;
  const showVersion = estimateHasMultipleVersions(estimate.versions.length);
  const options = useQuery<EstimateEmailOptionsDto>({
    queryKey: [ESTIMATES_API, "email-options", companyId, senderId, estimate.id],
    enabled: !delivery,
    queryFn: async ({ signal }) => (await apiRequest("GET", `${ESTIMATES_API}/${encodeURIComponent(estimate.id)}/email-options`, undefined,
      { headers: companyHeaders(companyId), signal })).json(),
  });
  const total = formatCents(version.frozenSubtotalCents ?? version.totals.subtotalCents, lang);

  useEffect(() => {
    if (!options.data || initialized) return;
    setMailboxId(options.data.defaultMailboxId ?? "");
    setTo(options.data.defaultTo ?? "");
    setSubject(t("estimateBuilder.email.defaultSubject", { number: estimate.estimateNumber, title: estimate.title.replace(/\s+/g, " "),
      version: showVersion ? t("estimateBuilder.email.versionSuffix", { n: version.versionNumber }) : "" }).slice(0, 255));
    setBody(t("estimateBuilder.email.defaultBody", {
      title: estimate.title, customer: customerName, total, sender: senderName, company: options.data.companyName,
      phone: options.data.phone ? ` · ${options.data.phone}` : "",
    }));
    setInitialized(true);
  }, [customerName, estimate.estimateNumber, estimate.title, initialized, options.data, senderName, showVersion, t, total, version.versionNumber]);

  const lines = version.sections.flatMap(s => s.lines);
  const warning = needPrice ?? lines.filter(l => l.needsPrice);
  const confirming = !resend && !!needPrice?.length;
  const payload = estimateEmailInput.safeParse({ mailboxAccountId: mailboxId, to: split(to), cc: split(cc),
    subject, bodyText: body, ...(confirming ? { confirmZeroPriced: true } : {}) });
  const available = options.data?.mailboxes.some(m => m.id === mailboxId);
  const valid = initialized && !options.isError && available && payload.success && (resend || lines.length > 0);
  const attachment = version.issuedAttachment;
  const filename = attachment?.filename ?? estimatePdfFilename(estimate.estimateNumber, version.versionNumber, showVersion);
  const pages = estimateApproximatePages(version);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90vh] max-w-xl flex-col overflow-hidden" data-testid="dialog-estimate-email">
      <DialogHeader>
        <DialogTitle>{t(delivery === "recover" ? "estimateBuilder.email.recoveryTitle" : resend ? "estimateBuilder.email.resend" : "estimateBuilder.email.action")}</DialogTitle>
        <DialogDescription>{t(delivery === "recover" ? "estimateBuilder.email.recoveryBody"
          : delivery === "uncertain" ? "estimateBuilder.email.errors.ESTIMATE_EMAIL_DELIVERY_UNCERTAIN"
          : delivery ? "estimateBuilder.email.recordUnavailable" : resend ? "estimateBuilder.email.resendBody" : "estimateBuilder.email.description")}</DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-4" noValidate onSubmit={e => {
        e.preventDefault();
        if (!busy && !delivery && valid && payload.success) onSend(payload.data);
      }}>
        {!delivery && <div className="space-y-3 overflow-y-auto px-1">
          {!resend && warning.length > 0 && <EstimateNeedsPriceWarning lines={warning} />}
          {!resend && lines.length === 0 && <p role="alert" className="text-sm">{t("estimateBuilder.life.err.NO_LINES")}</p>}
          {options.isPending && <p role="status" className="text-sm">{t("estimateBuilder.email.loading")}</p>}
          {options.isError && <div role="alert" className="text-sm text-destructive">{t("estimateBuilder.email.loadFailed")}{" "}
            <Button type="button" variant="ghost" onClick={() => void options.refetch()}>{t("companyDocuments.actions.retry")}</Button></div>}
          {options.data?.mailboxes.length === 0 && <p className="text-sm">{t("estimateBuilder.email.noMailbox")}{" "}
            <Link className="underline" href="/dashboard/settings/shared-mailboxes">{t("estimateBuilder.email.connect")}</Link></p>}
          <div className="space-y-1"><Label htmlFor="estimate-email-from">{t("companyDocuments.email.from")}</Label>
            <select id="estimate-email-from" value={mailboxId} onChange={e => setMailboxId(e.target.value)}
              disabled={busy || !options.data?.mailboxes.length} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
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
            <Input id="estimate-email-subject" maxLength={255} value={subject} disabled={busy || !initialized} onChange={e => setSubject(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="estimate-email-body">{t("companyDocuments.email.message")}</Label>
            <Textarea id="estimate-email-body" rows={8} maxLength={100000} value={body} disabled={busy || !initialized} onChange={e => setBody(e.target.value)} /></div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="estimate-email-attachment">
            <FileText aria-hidden className="h-4 w-4 shrink-0 text-[hsl(var(--rail-active-icon))]" />
            <span className="min-w-0 flex-1 truncate">{filename}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{t(attachment ? "estimateBuilder.email.pages" : "estimateBuilder.email.approxPages", { count: pages })}</span>
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
