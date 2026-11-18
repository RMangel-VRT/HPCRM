import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companyDocumentEmailInput } from "../../../../../lib/db/src/companyDocumentContracts";
import { companyRequest, companyDocumentErrorText, type CompanyDocumentDto } from "./companyDocumentsApi";
import { StatusChip } from "./bits";

type Mailbox = { id: string; companyId: string; syncEnabled: boolean; syncStatus: string; isActive: boolean;
  accountType: string; ownerUserId: string | null; displayName: string; emailAddress: string };
const split = (v: string) => v.split(/[,;\s]+/).filter(Boolean);
export const companyDocumentSendsKey = (company: string, id: string) => ["/api/company-documents", company, "sends", id];
export function DocumentSendHistory({ companyId, documentId }: { companyId: string; documentId: string }) {
  const { t, i18n } = useTranslation();
  const query = useQuery<import("../../../../../lib/db/src/companyDocumentContracts").CompanyDocumentSendDto[]>({
    queryKey: companyDocumentSendsKey(companyId, documentId),
    queryFn: async () => (await companyRequest(companyId, "GET", `/api/company-documents/${encodeURIComponent(documentId)}/sends`)).json(),
    staleTime: 30_000,
  });
  return <section className="mt-5 space-y-2"><h3 className="text-sm font-semibold">{t("companyDocuments.email.history")}</h3>
    {query.isLoading ? <p>{t("companyDocuments.email.loading")}</p> : query.isError
      ? <p role="alert">{companyDocumentErrorText(query.error, t)} <Button variant="ghost" onClick={() => query.refetch()}>{t("companyDocuments.actions.retry")}</Button></p>
      : !query.data?.length ? <p className="text-xs text-muted-foreground">{t("companyDocuments.email.noHistory")}</p>
      : query.data.map(send => <div key={send.id} className="border-b py-2 text-xs">
        <div className="font-medium">{send.subject}</div><div>{send.to.join(", ")}</div>
        <div className="text-muted-foreground">{new Date(send.date).toLocaleDateString(i18n.language)} · {send.sentByName} · {t(`companyDocuments.email.delivery.${send.deliveryStatus ?? "pending"}`)}</div>
      </div>)}
  </section>;
}
export function EmailDocumentsDialog({ companyId, documents, initialIds, onClose }: {
  companyId: string; documents: CompanyDocumentDto[]; initialIds: string[]; onClose: () => void;
}) {
  const { t } = useTranslation(), { user } = useAuth(), { toast } = useToast(), qc = useQueryClient();
  const [mailboxId, setMailboxId] = useState("");
  const [to, setTo] = useState(""), [cc, setCc] = useState("");
  const [ids, setIds] = useState(initialIds);
  const [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const options = useQuery<{ companyName: string; phone: string | null }>({
    queryKey: ["/api/company-documents", companyId, "email-options"],
    queryFn: async () => (await companyRequest(companyId, "GET", "/api/company-documents/email-options")).json(),
  });
  const mailboxes = useQuery<Mailbox[]>({
    queryKey: ["/api/mailbox-accounts", companyId, "company-documents-compose"],
    queryFn: async () => {
      const rows: Mailbox[] = await (await companyRequest(companyId, "GET", "/api/mailbox-accounts")).json();
      return rows.filter(m => m.companyId === companyId && m.isActive && m.syncEnabled && m.syncStatus === "connected");
    },
  });
  const suggestions = useQuery<{ email: string; name: string }[]>({
    queryKey: ["/api/property-managers", companyId, "company-documents-compose"],
    queryFn: async () => {
      const managers: { id: string; name: string; companyId: string }[] = await (await companyRequest(companyId, "GET", "/api/property-managers")).json();
      const rows = await Promise.all(managers.filter(m => m.companyId === companyId).map(async m => {
        const emails: { email: string }[] = await (await companyRequest(companyId, "GET", `/api/property-managers/${encodeURIComponent(m.id)}/emails`)).json();
        return emails.map(e => ({ email: e.email, name: m.name }));
      }));
      return rows.flat();
    },
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!mailboxId && mailboxes.data) setMailboxId((mailboxes.data.find(m => m.accountType === "shared") ??
      mailboxes.data.find(m => m.ownerUserId === user?.id))?.id ?? "");
  }, [mailboxes.data, mailboxId, user?.id]);
  useEffect(() => {
    if (!initialized && options.data) {
      const name = options.data.companyName;
      setSubject(t("companyDocuments.email.defaultSubject", { name }));
      setBody(t("companyDocuments.email.defaultBody", { name, phone: options.data.phone ? ` · ${options.data.phone}` : "" }));
      setInitialized(true);
    }
  }, [initialized, options.data, t]);
  const payload = { mailboxAccountId: mailboxId, to: split(to), cc: split(cc), subject, bodyText: body, documentIds: ids };
  const valid = companyDocumentEmailInput.safeParse(payload).success;
  const send = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      await companyRequest(companyId, "POST", "/api/company-documents/email", payload);
      await qc.invalidateQueries({ queryKey: ["/api/company-documents", companyId] });
      toast({ title: t("companyDocuments.email.sentTo", { to: payload.to.join(", ") }) });
      onClose();
    } catch (err) { setError(companyDocumentErrorText(err, t)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90vh] max-w-xl flex-col overflow-hidden">
      <DialogHeader><DialogTitle>{t("companyDocuments.email.title")}</DialogTitle>
        <DialogDescription>{t("companyDocuments.email.description")}</DialogDescription></DialogHeader>
      <div className="space-y-4 overflow-y-auto px-1">
        {(options.isError || mailboxes.isError) && <p role="alert" className="text-sm text-destructive">{t("companyDocuments.email.loadError")}
          <Button variant="ghost" onClick={() => { void options.refetch(); void mailboxes.refetch(); }}>{t("companyDocuments.actions.retry")}</Button></p>}
        {mailboxes.data?.length === 0 && <p className="text-sm">{t("companyDocuments.email.noMailbox")}{" "}
          <Link className="underline" href="/dashboard/settings/shared-mailboxes">{t("companyDocuments.email.connect")}</Link></p>}
        <div className="space-y-1"><Label htmlFor="cd-email-from">{t("companyDocuments.email.from")}</Label>
          <select id="cd-email-from" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={mailboxId} onChange={e => setMailboxId(e.target.value)} disabled={busy}>
            <option value="">{t("companyDocuments.email.chooseMailbox")}</option>
            {mailboxes.data?.map(m => <option value={m.id} key={m.id}>{m.displayName} · {m.emailAddress}</option>)}
          </select></div>
        {(["to", "cc"] as const).map(kind => <div className="space-y-1" key={kind}>
          <Label htmlFor={`cd-email-${kind}`}>{t(`companyDocuments.email.${kind}`)}</Label>
          <Input id={`cd-email-${kind}`} list="cd-email-suggestions" value={kind === "to" ? to : cc} onChange={e => (kind === "to" ? setTo : setCc)(e.target.value)} disabled={busy} />
        </div>)}
        <datalist id="cd-email-suggestions">{suggestions.data?.map((s, i) => <option value={s.email} key={`${s.email}-${i}`}>{s.name}</option>)}</datalist>
        {suggestions.isError && <p className="text-xs text-muted-foreground">{t("companyDocuments.email.suggestionsError")}</p>}
        <p className="text-xs text-muted-foreground">{t("companyDocuments.email.limits")}</p>
        <div><Label>{t("companyDocuments.email.attachments")}</Label>
          <div className="my-2 flex flex-wrap gap-1.5">{ids.map(id => <Button variant="secondary" size="sm" key={id} disabled={busy}
            onClick={() => setIds(ids.filter(i => i !== id))} aria-label={t("companyDocuments.email.remove", { name: documents.find(d => d.id === id)?.name })}>
            {documents.find(d => d.id === id)?.name} ×</Button>)}</div>
          <div className="max-h-40 overflow-auto rounded-md border">{documents.map(d => <label key={d.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
            <input type="checkbox" checked={ids.includes(d.id)} disabled={busy || (!ids.includes(d.id) && ids.length >= 10)}
              onChange={e => setIds(e.target.checked ? [...ids, d.id] : ids.filter(i => i !== d.id))} />
            <span className="flex-1">{d.name}</span><StatusChip doc={d} />
          </label>)}</div></div>
        <div className="space-y-1"><Label htmlFor="cd-email-subject">{t("companyDocuments.email.subject")}</Label>
          <Input id="cd-email-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={255} disabled={busy} /></div>
        <div className="space-y-1"><Label htmlFor="cd-email-message">{t("companyDocuments.email.message")}</Label>
          <Textarea id="cd-email-message" value={body} onChange={e => setBody(e.target.value)} rows={6} disabled={busy} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>{t("companyDocuments.actions.cancel")}</Button>
        <Button onClick={send} disabled={!valid || busy || !initialized || mailboxes.isError}>{t(busy ? "companyDocuments.email.sending" : "companyDocuments.email.send")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
