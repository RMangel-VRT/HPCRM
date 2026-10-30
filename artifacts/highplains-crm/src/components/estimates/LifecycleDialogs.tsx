import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock } from "lucide-react";
import {
  ACCEPT_METHODS, DECLINE_CHIPS, SENT_METHODS, denverToday, isCalendarDate, type AcceptMethod, type SentMethod,
} from "@/lib/estimateBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Base { open: boolean; busy: boolean; error: string | null; versionNumber: number; onClose: () => void }

function Shell(props: { open: boolean; busy: boolean; onClose: () => void; testId: string; title: string; body: ReactNode; children: ReactNode }) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => { if (!o && !props.busy) props.onClose(); }}>
      <DialogContent className="max-w-md" data-testid={props.testId}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.body}</DialogDescription>
        </DialogHeader>
        {props.children}
      </DialogContent>
    </Dialog>
  );
}
function FormError({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="error-lifecycle">{error}</p> : null;
}
function MethodGroup<T extends string>(props: { name: string; legend: string; options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{props.legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={props.legend}>
        {props.options.map((o) => (
          <label key={o} className={cn("inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-ring",
            props.value === o ? "border-transparent bg-rail-active text-rail-active-foreground" : "bg-background text-muted-foreground hover:bg-rail-hover")}>
            <input type="radio" name={props.name} value={o} checked={props.value === o} onChange={() => props.onChange(o)} className="sr-only" data-testid={`radio-${props.name}-${o}`} />
            {props.label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function Footer({ busy, onClose, submit, testId, destructive }: { busy: boolean; onClose: () => void; submit: string; testId: string; destructive?: boolean }) {
  const { t } = useTranslation();
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={busy} data-testid="button-cancel-lifecycle">{t("estimateBuilder.cancel")}</Button>
      <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy} aria-busy={busy} data-testid={testId}>
        {busy ? t("estimateBuilder.life.working") : submit}
      </Button>
    </DialogFooter>
  );
}

export function SendDialog(props: Base & { needPrice: { id: string; name: string | null }[] | null; onSubmit: (b: { method: SentMethod; confirmZeroPriced?: boolean }) => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<SentMethod>("email");
  useEffect(() => { if (props.open) setMethod("email"); }, [props.open]);
  const confirming = !!props.needPrice?.length;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (props.busy) return;
    props.onSubmit(confirming ? { method, confirmZeroPriced: true } : { method });
  }
  return (
    <Shell open={props.open} busy={props.busy} onClose={props.onClose} testId="dialog-send"
      title={t("estimateBuilder.life.send.title", { n: props.versionNumber })} body={t("estimateBuilder.life.send.body")}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <MethodGroup name="send-method" legend={t("estimateBuilder.life.send.method")} options={SENT_METHODS} value={method}
          onChange={(m: SentMethod) => setMethod(m)} label={(m: SentMethod) => t(`estimateBuilder.life.sentMethod.${m}`)} />
        {confirming && (
          <div role="alert" className="rounded-md border border-[hsl(var(--est-warn))]/40 bg-[hsl(var(--est-warn-bg))] p-3 text-sm" data-testid="panel-need-price">
            <p className="flex items-center gap-1.5 font-semibold text-[hsl(var(--est-warn))]"><AlertTriangle className="h-4 w-4" />{t("estimateBuilder.life.send.needPriceTitle")}</p>
            <p className="mt-1 text-xs">{t("estimateBuilder.life.send.needPriceBody")}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {props.needPrice!.map((l) => <li key={l.id} data-testid={`need-price-${l.id}`}>{l.name ?? t("estimateBuilder.life.send.unknownLine", { id: l.id })}</li>)}
            </ul>
          </div>
        )}
        <FormError error={props.error} />
        <Footer busy={props.busy} onClose={props.onClose} testId={confirming ? "button-send-anyway" : "button-submit-send"}
          submit={confirming ? t("estimateBuilder.life.send.sendAnyway") : t("estimateBuilder.life.send.submit")} />
      </form>
    </Shell>
  );
}

export function AcceptDialog(props: Base & { onSubmit: (b: { method: AcceptMethod; poNumber?: string; acceptedOn: string }) => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<AcceptMethod>("email_approval");
  const [po, setPo] = useState("");
  const [date, setDate] = useState(() => denverToday());
  const [dateErr, setDateErr] = useState(false);
  useEffect(() => { if (props.open) { setMethod("email_approval"); setPo(""); setDate(denverToday()); setDateErr(false); } }, [props.open]);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (props.busy) return;
    if (!isCalendarDate(date)) { setDateErr(true); return; }
    setDateErr(false);
    const p = po.trim();
    props.onSubmit({ method, acceptedOn: date, ...(p ? { poNumber: p } : {}) });
  }
  return (
    <Shell open={props.open} busy={props.busy} onClose={props.onClose} testId="dialog-accept"
      title={t("estimateBuilder.life.accept.title", { n: props.versionNumber })}
      body={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />{t("estimateBuilder.life.accept.body")}</span>}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <MethodGroup name="accept-method" legend={t("estimateBuilder.life.accept.method")} options={ACCEPT_METHODS} value={method}
          onChange={(m: AcceptMethod) => setMethod(m)} label={(m: AcceptMethod) => t(`estimateBuilder.life.acceptMethod.${m}`)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="est-accept-po">{t("estimateBuilder.life.accept.po")}</Label>
            <Input id="est-accept-po" value={po} maxLength={100} onChange={(e) => setPo(e.target.value)} data-testid="input-accept-po" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="est-accept-date">{t("estimateBuilder.life.accept.date")}</Label>
            <Input id="est-accept-date" type="date" value={date} required aria-invalid={dateErr} aria-describedby="est-accept-date-hint"
              onChange={(e) => setDate(e.target.value)} data-testid="input-accept-date" />
            <span id="est-accept-date-hint" className="text-[11px] text-muted-foreground">{t("estimateBuilder.life.accept.dateHint")}</span>
            {dateErr && <p className="text-xs font-medium text-destructive" data-testid="error-accept-date">{t("estimateBuilder.life.accept.errDate")}</p>}
          </div>
        </div>
        <FormError error={props.error} />
        <Footer busy={props.busy} onClose={props.onClose} testId="button-submit-accept" submit={t("estimateBuilder.life.accept.submit")} />
      </form>
    </Shell>
  );
}

function ReasonForm(props: { idBase: string; label: string; errLabel: string; busy: boolean; open: boolean; chips?: boolean; onReason: (r: string) => void; children: ReactNode }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (props.open) { setReason(""); setErr(false); } }, [props.open]);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (props.busy) return;
    const r = reason.trim();
    if (!r) { setErr(true); return; }
    setErr(false);
    props.onReason(r);
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {props.chips && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("estimateBuilder.life.decline.quick")}>
          {DECLINE_CHIPS.map((c) => (
            <button key={c} type="button" data-testid={`chip-decline-${c}`}
              onClick={() => { if (c === "other") { setReason(""); ref.current?.focus(); } else setReason(t(`estimateBuilder.life.declineChip.${c}`)); }}
              className="h-7 rounded-full border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-rail-hover hover:text-foreground">
              {t(`estimateBuilder.life.declineChip.${c}`)}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={props.idBase}>{props.label}</Label>
        <Textarea id={props.idBase} ref={ref} value={reason} maxLength={2000} rows={3} required aria-invalid={err}
          onChange={(e) => setReason(e.target.value)} data-testid={`input-${props.idBase}`} />
        {err && <p className="text-xs font-medium text-destructive" data-testid={`error-${props.idBase}`}>{props.errLabel}</p>}
      </div>
      {props.children}
    </form>
  );
}

export function DeclineDialog(props: Base & { onSubmit: (b: { reason: string }) => void }) {
  const { t } = useTranslation();
  return (
    <Shell open={props.open} busy={props.busy} onClose={props.onClose} testId="dialog-decline"
      title={t("estimateBuilder.life.decline.title", { n: props.versionNumber })} body={t("estimateBuilder.life.decline.body")}>
      <ReasonForm idBase="decline-reason" chips open={props.open} busy={props.busy} label={t("estimateBuilder.life.decline.reason")}
        errLabel={t("estimateBuilder.life.decline.errReason")} onReason={(reason) => props.onSubmit({ reason })}>
        <FormError error={props.error} />
        <Footer busy={props.busy} onClose={props.onClose} testId="button-submit-decline" submit={t("estimateBuilder.life.decline.submit")} />
      </ReasonForm>
    </Shell>
  );
}

export function VoidDialog(props: Base & { onSubmit: (b: { reason: string }) => void }) {
  const { t } = useTranslation();
  return (
    <Shell open={props.open} busy={props.busy} onClose={props.onClose} testId="dialog-void"
      title={t("estimateBuilder.life.voidDialog.title")} body={t("estimateBuilder.life.voidDialog.body")}>
      <ReasonForm idBase="void-reason" open={props.open} busy={props.busy} label={t("estimateBuilder.life.voidDialog.reason")}
        errLabel={t("estimateBuilder.life.voidDialog.errReason")} onReason={(reason) => props.onSubmit({ reason })}>
        <FormError error={props.error} />
        <Footer busy={props.busy} destructive onClose={props.onClose} testId="button-submit-void" submit={t("estimateBuilder.life.voidDialog.submit")} />
      </ReasonForm>
    </Shell>
  );
}

export function DiscardDialog(props: Base & { onSubmit: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell open={props.open} busy={props.busy} onClose={props.onClose} testId="dialog-discard"
      title={t("estimateBuilder.life.discardDialog.title", { n: props.versionNumber })} body={t("estimateBuilder.life.discardDialog.body")}>
      <form onSubmit={(e) => { e.preventDefault(); if (!props.busy) props.onSubmit(); }} className="grid gap-4">
        <FormError error={props.error} />
        <Footer busy={props.busy} destructive onClose={props.onClose} testId="button-submit-discard" submit={t("estimateBuilder.life.discardDialog.submit")} />
      </form>
    </Shell>
  );
}
