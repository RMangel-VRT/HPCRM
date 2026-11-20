import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import "./emailWording.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ExternalLink, Eye, Lock, Mail, RotateCcw, Save } from "lucide-react";
import {
  listEmailWording, saveEmailWording, resetEmailWording, previewEmailWording, getWorkCompletedEmailRule,
  type EmailWordingEntry, type EmailWordingFields, type EmailWordingFieldErrors, type GetWorkCompletedEmailRule200,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSetBreadcrumbs } from "@/hooks/use-breadcrumbs";
import { apiRequest } from "@/lib/queryClient";
import { guardLinkClick, unsavedGuard } from "@/lib/unsavedGuard";
import { SettingsRailLayout } from "@/components/nav/SettingsRailLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  WORDING_FIELDS, WORDING_LIMITS, isEmailKey, wordingProblem, type WordingField,
} from "../../../../lib/db/src/emailWordingContracts";

const GROUPS = ["estimates", "invoices", "chemical", "work", "contracts"] as const;
const NOT_LIVE_GROUPS = new Set<string>(["invoices", "contracts"]);
const LONG_FIELDS = new Set<WordingField>(["intro", "closing"]);
const DEBOUNCE_MS = 400;

type Preview = { subject: string; html: string };
type Confirm =
  | { kind: "switch"; key: string }
  | { kind: "reset" }
  | { kind: "href" | "pop"; href: string }
  | null;

export const emailWordingKey = (companyId: string, userId: string, role: string) =>
  ["email-wording", companyId, userId, role] as const;
export const workRuleKey = (companyId: string, userId: string, role: string) =>
  ["email-wording-work-rule", companyId, userId, role] as const;

const sameFields = (a: EmailWordingFields, b: EmailWordingFields) => WORDING_FIELDS.every(f => a[f] === b[f]);
const errStatus = (e: unknown) => (e as { status?: number } | null)?.status;
const errData = (e: unknown) => (e as { data?: unknown } | null)?.data as { fieldErrors?: EmailWordingFieldErrors } | null | undefined;

/* Outer shell: scope by company + user + role; a change remounts the body. */
export default function EmailWordingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useSetBreadcrumbs([{ label: t("settings.title"), href: "/dashboard/settings" }, { label: t("emailWording.title") }], []);
  const companyId = user?.activeCompanyId ?? "";
  const role = user?.accessRole ?? "";
  const scope = `${companyId}|${user?.id ?? ""}|${role}`;
  useEffect(() => () => { unsavedGuard.setDirty(false); unsavedGuard.clearPending(); }, [scope]);

  return (
    <SettingsRailLayout activeKey="email-wording">
      {user && companyId ? (
        <WordingBody
          key={scope}
          companyId={companyId}
          userId={user.id}
          role={role}
          canWrite={role === "admin"}
        />
      ) : <LoadingSkeleton />}
    </SettingsRailLayout>
  );
}

type BodyProps = { companyId: string; userId: string; role: string; canWrite: boolean };

function WordingBody({ companyId, userId, role, canWrite }: BodyProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const headers = useMemo(() => ({ "X-Company-Id": companyId }), [companyId]);
  const listKey = useMemo(() => emailWordingKey(companyId, userId, role), [companyId, userId, role]);
  const ruleKey = useMemo(() => workRuleKey(companyId, userId, role), [companyId, userId, role]);

  const list = useQuery<EmailWordingEntry[]>({
    queryKey: listKey,
    queryFn: ({ signal }) => listEmailWording({ headers, signal }),
    staleTime: 30_000,
  });
  const entries = useMemo(() => (list.data ?? []).filter(e => isEmailKey(e.key)), [list.data]);

  const [selected, setSelected] = useState<string | null>(null);
  const entry = entries.find(e => e.key === selected) ?? entries[0] ?? null;
  const key = entry?.key ?? null;

  // A clean view follows current server data. A refetch must not turn a clean
  // view dirty or replace a real draft in progress.
  const [draft, setDraft] = useState<{ key: string; fields: EmailWordingFields } | null>(null);
  const [serverErrors, setServerErrors] = useState<EmailWordingFieldErrors>({});
  const fields = draft && draft.key === key ? draft.fields : entry ? entry.wording : null;
  const dirty = !!(canWrite && entry && fields && !sameFields(fields, entry.wording));

  const problemText = useCallback((field: WordingField, value: string): string | null => {
    if (!key || !isEmailKey(key)) return null;
    const p = wordingProblem(key, field, value);
    if (!p) return null;
    if (p.code === "placeholder") {
      return t("emailWording.errors.placeholder", { token: p.token, list: (entry?.placeholders ?? []).map(x => `{${x}}`).join(", ") });
    }
    return t(`emailWording.errors.${p.code}`, { max: WORDING_LIMITS[field] });
  }, [key, entry, t]);
  const localErrors = useMemo(() => {
    const out: Partial<Record<WordingField, string>> = {};
    if (fields) for (const f of WORDING_FIELDS) { const m = problemText(f, fields[f]); if (m) out[f] = m; }
    return out;
  }, [fields, problemText]);
  const hasLocalErrors = Object.keys(localErrors).length > 0;

  /* ---- Leave protection (existing unsavedGuard convention, incl. browser history) ---- */
  useEffect(() => { unsavedGuard.setDirty(dirty, { protectHistory: true }); }, [dirty]);
  useEffect(() => () => unsavedGuard.setDirty(false), []);
  useEffect(() => {
    document.addEventListener("click", guardLinkClick as never, true);
    return () => document.removeEventListener("click", guardLinkClick as never, true);
  }, []);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (!dirtyRef.current) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  const guardPending = useSyncExternalStore(unsavedGuard.subscribe, unsavedGuard.getPending, () => null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  useEffect(() => {
    if (guardPending) setConfirm({ kind: unsavedGuard.isHistoryPending() ? "pop" : "href", href: guardPending });
  }, [guardPending]);

  function selectEntry(next: string) {
    if (next === key || saving) return;
    if (dirty) { setConfirm({ kind: "switch", key: next }); return; }
    clearDraft();
    setSelected(next);
  }
  function clearDraft() {
    setDraft(null);
    setServerErrors({});
    lastFocus.current = { field: "intro", start: -1, end: -1 };
  }
  function discardAndContinue() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "switch") {
      clearDraft();
      if (key) setPreviews(previous => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      dirtyRef.current = false;
      unsavedGuard.setDirty(false);
      setSelected(c.key);
    } else if (c.kind === "href" || c.kind === "pop") {
      unsavedGuard.setDirty(false); unsavedGuard.clearPending(); dirtyRef.current = false;
      navigate(c.href, c.kind === "pop" ? { replace: true } : undefined);
    }
  }
  function cancelConfirm() {
    if (confirm && (confirm.kind === "href" || confirm.kind === "pop")) unsavedGuard.clearPending();
    setConfirm(null);
  }

  /* ---- Field edits + placeholder insertion at last focused cursor ---- */
  const inputRefs = useRef<Partial<Record<WordingField, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const lastFocus = useRef<{ field: WordingField; start: number; end: number }>({ field: "intro", start: -1, end: -1 });
  const remember = (field: WordingField, el: HTMLInputElement | HTMLTextAreaElement) => {
    lastFocus.current = { field, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length };
  };
  function setField(field: WordingField, value: string) {
    if (!canWrite || !fields || !key || saving) return;
    const edited = { ...fields, [field]: value };
    setDraft(entry && sameFields(edited, entry.wording) ? null : { key, fields: edited });
    setServerErrors(e => { if (!e[field]) return e; const n = { ...e }; delete n[field]; return n; });
  }
  function insertToken(token: string) {
    if (!canWrite || !fields) return;
    const { field } = lastFocus.current;
    const current = fields[field];
    let { start, end } = lastFocus.current;
    if (start < 0 || start > current.length) { start = current.length; end = current.length; }
    const before = current.slice(0, start);
    const after = current.slice(Math.min(end, current.length));
    const text = `${/[\p{L}\p{N}}]$/u.test(before) ? " " : ""}{${token}}${/^[\p{L}\p{N}{]/u.test(after) ? " " : ""}`;
    const next = before + text + after;
    setField(field, next);
    const caret = start + text.length;
    lastFocus.current = { field, start: caret, end: caret };
    requestAnimationFrame(() => {
      const el = inputRefs.current[field];
      if (el) { el.focus(); el.setSelectionRange(caret, caret); }
    });
  }

  /* ---- Debounced sandboxed preview: abort + stale guards, last valid retained per entry ---- */
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [previewErrors, setPreviewErrors] = useState<EmailWordingFieldErrors>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const seq = useRef(0);
  const [retry, setRetry] = useState(0);
  const fieldsSig = fields ? JSON.stringify(fields) : "";
  useEffect(() => {
    if (!key || !fieldsSig) return;
    const mine = ++seq.current;
    setPreviewErrors({});
    setPreviewFailed(false);
    if (hasLocalErrors) { setPreviewLoading(false); return; }
    const ctl = new AbortController();
    setPreviewLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await previewEmailWording(key, JSON.parse(fieldsSig) as EmailWordingFields, { headers, signal: ctl.signal });
        if (mine !== seq.current || ctl.signal.aborted) return;
        if (res.fieldErrors) setPreviewErrors(res.fieldErrors);
        else if ("html" in res) setPreviews(p => ({ ...p, [key]: { subject: res.subject, html: res.html } }));
      } catch (e) {
        if (ctl.signal.aborted || mine !== seq.current) return;
        const fe = errData(e)?.fieldErrors;
        if (fe) setPreviewErrors(fe); else setPreviewFailed(true);
      } finally {
        if (mine === seq.current && !ctl.signal.aborted) setPreviewLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); ctl.abort(); };
  }, [key, fieldsSig, hasLocalErrors, headers, retry]);

  const errors: Partial<Record<WordingField, string>> = { ...previewErrors, ...serverErrors, ...localErrors };
  const hasErrors = Object.keys(errors).length > 0;

  /* ---- Save / reset ---- */
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!key || !fields || !dirty || hasErrors || saving) return;
    setSaving(true);
    try {
      const saved = await saveEmailWording(key, fields, { headers });
      qc.setQueryData<EmailWordingEntry[]>(listKey, old => old?.map(e => (e.key === saved.key ? saved : e)));
      clearDraft();
      void qc.invalidateQueries({ queryKey: listKey });
      toast({ title: t("emailWording.saved") });
    } catch (e) {
      const fe = errStatus(e) === 422 ? errData(e)?.fieldErrors : undefined;
      if (fe) setServerErrors(fe);
      toast({ title: fe ? t("emailWording.fixFields") : t("emailWording.saveFailed"), variant: "destructive" });
    } finally { setSaving(false); }
  }
  async function reset() {
    setConfirm(null);
    if (!key || !entry || saving) return;
    setSaving(true);
    try {
      await resetEmailWording(key, { headers });
      qc.setQueryData<EmailWordingEntry[]>(listKey, old => old?.map(e => e.key === key ? {
        ...e, wording: e.defaults, isCustom: false, updatedAt: null, updatedBy: null,
      } : e));
      clearDraft();
      void qc.invalidateQueries({ queryKey: listKey });
      toast({ title: t("emailWording.resetDone") });
    } catch {
      toast({ title: t("emailWording.resetFailed"), variant: "destructive" });
    } finally { setSaving(false); }
  }

  /* ---- Work-completed rule ---- */
  const rule = useQuery<GetWorkCompletedEmailRule200>({
    queryKey: ruleKey,
    queryFn: ({ signal }) => getWorkCompletedEmailRule({ headers, signal }),
    enabled: key === "work_completed",
  });
  const [ruleBusy, setRuleBusy] = useState(false);
  async function toggleRule(next: boolean) {
    const r = rule.data?.rule;
    if (!canWrite || !r || ruleBusy) return;
    setRuleBusy(true);
    qc.setQueryData<GetWorkCompletedEmailRule200>(ruleKey, { rule: { ...r, isEnabled: next } });
    try {
      await apiRequest("PATCH", `/api/email-rules/${encodeURIComponent(r.id)}`, { isEnabled: next }, { headers });
      toast({ title: next ? t("emailWording.ruleOn") : t("emailWording.ruleOff") });
    } catch {
      qc.setQueryData<GetWorkCompletedEmailRule200>(ruleKey, { rule: r });
      toast({ title: t("emailWording.ruleFailed"), variant: "destructive" });
    } finally {
      setRuleBusy(false);
      void qc.invalidateQueries({ queryKey: ruleKey });
    }
  }

  /* ---- Render ---- */
  if (list.isLoading) return <LoadingSkeleton />;
  if (!entry || !fields) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm" data-testid="status-email-wording-error">
        <div className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-4 w-4" />{t("emailWording.loadFailed")}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => list.refetch()} data-testid="button-retry-email-wording">{t("emailWording.retry")}</Button>
      </div>
    );
  }

  const group = entry.group;
  const notLive = NOT_LIVE_GROUPS.has(group);
  const preview = previews[entry.key];
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(i18n.language === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="email-wording-shell min-w-0 space-y-4" data-testid="page-email-wording">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Mail className="h-5 w-5 text-primary" />{t("emailWording.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("emailWording.subtitle")}</p>
        </div>
        {!canWrite && (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground" data-testid="status-read-only">
            <Lock className="h-3.5 w-3.5" />{t("emailWording.readOnly")}
          </span>
        )}
      </header>

      <div className="email-wording-grid grid min-w-0 gap-4">
        {/* Left: grouped list */}
        <nav aria-label={t("emailWording.listLabel")} className="min-w-0 rounded-lg border bg-card p-2" data-testid="list-email-keys">
          {GROUPS.map(g => {
            const items = entries.filter(e => e.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-2 last:mb-0">
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--rail-heading))]">{t(`emailWording.groups.${g}`)}</div>
                <ul>
                  {items.map(e => {
                    const active = e.key === entry.key;
                    return (
                      <li key={e.key}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => selectEntry(e.key)}
                          aria-current={active ? "true" : undefined}
                          className={cn(
                            "flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            active ? "bg-[hsl(var(--rail-active))] font-medium text-[hsl(var(--rail-active-foreground))]" : "hover:bg-[hsl(var(--rail-hover))]",
                          )}
                          data-testid={`button-email-key-${e.key}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{t(`emailWording.keys.${e.key}`, { defaultValue: e.label })}</span>
                          {e.isCustom && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--rail-heading))]" data-testid={`badge-custom-${e.key}`}>{t("emailWording.custom")}</span>}
                          {NOT_LIVE_GROUPS.has(e.group) && <span className="rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground" data-testid={`badge-not-live-${e.key}`}>{t("emailWording.notSending")}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Middle: fields */}
        <section className="min-w-0 space-y-4 rounded-lg border bg-card p-4" aria-labelledby="ew-entry-title">
          <div className="space-y-1">
            <h2 id="ew-entry-title" className="text-base font-semibold" data-testid="text-entry-title">{t(`emailWording.keys.${entry.key}`, { defaultValue: entry.label })}</h2>
            {notLive && <p className="text-xs text-muted-foreground" data-testid="text-not-live-note">{t("emailWording.notSendingNote")}</p>}
            {entry.isCustom && entry.updatedAt && (
              <p className="text-xs text-muted-foreground" data-testid="text-last-changed">
                {t("emailWording.lastChanged", { date: dateFmt(entry.updatedAt), name: entry.updatedBy ?? t("emailWording.someone") })}
              </p>
            )}
          </div>

          {group === "chemical" && (
            <Link href="/dashboard/settings/notification-templates" className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50" data-testid="link-chemical-products">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span>{t("emailWording.chemicalLink")}</span>
            </Link>
          )}

          {entry.key === "work_completed" && (
            <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5" data-testid="panel-work-rule">
              <div className="min-w-0 text-sm">
                <label htmlFor="ew-work-rule" className="font-medium">{t("emailWording.ruleLabel")}</label>
                <p className="text-xs text-muted-foreground">{t("emailWording.ruleScope")}</p>
                {rule.isError && <p className="text-xs text-destructive">{t("emailWording.ruleLoadFailed")}</p>}
                {rule.data && !rule.data.rule && <p className="text-xs text-muted-foreground">{t("emailWording.ruleMissing")}</p>}
                {!canWrite && rule.data?.rule && <p className="text-xs text-muted-foreground">{t("emailWording.ruleAdminOnly")}</p>}
              </div>
              {rule.isLoading ? <Skeleton className="h-5 w-9" /> : (
                <Switch
                  id="ew-work-rule"
                  checked={!!rule.data?.rule?.isEnabled}
                  disabled={!canWrite || !rule.data?.rule || ruleBusy}
                  onCheckedChange={toggleRule}
                  data-testid="switch-work-completed-rule"
                />
              )}
            </div>
          )}

          {WORDING_FIELDS.map(f => {
            const value = fields[f];
            const err = errors[f];
            const over = value.length > WORDING_LIMITS[f];
            const common = {
              id: `ew-${f}`,
              value,
              readOnly: !canWrite || saving,
              "aria-invalid": !!err,
              "aria-describedby": `ew-${f}-meta`,
              onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => remember(f, e.currentTarget),
              onSelect: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => remember(f, e.currentTarget),
              onKeyUp: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => remember(f, e.currentTarget),
              className: cn("min-w-0", err && "border-destructive focus-visible:ring-destructive"),
              "data-testid": `input-wording-${f}`,
            };
            return (
              <div key={f} className="space-y-1">
                <label htmlFor={`ew-${f}`} className="text-sm font-medium">{t(`emailWording.fields.${f}`)}</label>
                {LONG_FIELDS.has(f) ? (
                  <Textarea {...common} rows={f === "intro" ? 5 : 3} ref={el => { inputRefs.current[f] = el; }}
                    onChange={e => { setField(f, e.target.value); remember(f, e.currentTarget); }} />
                ) : (
                  <Input {...common} ref={el => { inputRefs.current[f] = el; }}
                    onChange={e => { setField(f, e.target.value); remember(f, e.currentTarget); }} />
                )}
                <div id={`ew-${f}-meta`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 break-words text-destructive" role={err ? "alert" : undefined} data-testid={`error-wording-${f}`}>{err ?? ""}</span>
                  <span className={cn("shrink-0 tabular-nums text-muted-foreground", over && "font-medium text-destructive")} data-testid={`counter-wording-${f}`}>
                    {value.length}/{WORDING_LIMITS[f]}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{t("emailWording.placeholders")}</div>
            <div className="flex flex-wrap gap-1.5" data-testid="list-placeholder-chips">
              {entry.placeholders.map(p => (
                <button
                  key={p}
                  type="button"
                  disabled={!canWrite || saving}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insertToken(p)}
                  className="rounded-full border bg-background px-2.5 py-0.5 font-mono text-[11px] hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid={`chip-placeholder-${p}`}
                >{`{${p}}`}</button>
              ))}
            </div>
            {canWrite && <p className="text-[11px] text-muted-foreground">{t("emailWording.placeholdersHint")}</p>}
          </div>

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button onClick={save} disabled={!dirty || hasErrors || saving} data-testid="button-save-wording">
                <Save className="mr-1.5 h-4 w-4" />{saving ? t("emailWording.saving") : t("emailWording.save")}
              </Button>
              {entry.isCustom && (
                <Button variant="outline" onClick={() => setConfirm({ kind: "reset" })} disabled={saving} data-testid="button-reset-wording">
                  <RotateCcw className="mr-1.5 h-4 w-4" />{t("emailWording.reset")}
                </Button>
              )}
              {dirty && <span className="text-xs text-muted-foreground" data-testid="status-unsaved">{t("emailWording.unsaved")}</span>}
            </div>
          )}
        </section>

        {/* Right: live preview */}
        <section className="min-w-0 rounded-lg border bg-card p-4" aria-label={t("emailWording.preview")} data-testid="panel-preview">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Eye className="h-4 w-4 text-muted-foreground" />{t("emailWording.preview")}</h2>
            <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="status-preview">
              {previewLoading ? t("emailWording.updating") : hasErrors ? t("emailWording.previewHeld") : ""}
            </span>
          </div>
          {previewFailed && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="status-preview-failed">
              <AlertTriangle className="h-3.5 w-3.5" />{t("emailWording.previewFailed")}
              <button type="button" className="underline" onClick={() => setRetry(r => r + 1)} data-testid="button-retry-preview">{t("emailWording.retry")}</button>
            </div>
          )}
          {preview ? (
            <div className={cn("transition-opacity", previewLoading && "opacity-70")}>
              <div className="mb-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">{t("emailWording.subjectLine")} </span>
                <span className="break-words font-medium" data-testid="text-preview-subject">{preview.subject}</span>
              </div>
              <iframe
                title={t("emailWording.previewFrame")}
                sandbox=""
                srcDoc={preview.html}
                className="h-[36rem] w-full rounded-md border bg-[hsl(80_20%_98%)]"
                data-testid="iframe-preview"
              />
            </div>
          ) : (
            <div className="space-y-2" data-testid="status-preview-empty">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-[30rem] w-full" />
              {hasErrors && !previewLoading && <p className="text-xs text-muted-foreground">{t("emailWording.previewNeedsFix")}</p>}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">{t("emailWording.sampleNote")}</p>
        </section>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={o => { if (!o) cancelConfirm(); }}>
        <AlertDialogContent data-testid="dialog-email-wording-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "reset" ? t("emailWording.resetTitle") : t("emailWording.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.kind === "reset" ? t("emailWording.resetBody") : t("emailWording.leaveBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelConfirm} data-testid="button-confirm-cancel">
              {confirm?.kind === "reset" ? t("emailWording.cancel") : t("emailWording.keepEditing")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => (confirm?.kind === "reset" ? void reset() : discardAndContinue())}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-ok"
            >
              {confirm?.kind === "reset" ? t("emailWording.resetConfirm") : t("emailWording.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="email-wording-shell min-w-0" data-testid="status-email-wording-loading">
      <div className="email-wording-grid grid gap-4">
        <Skeleton className="h-96" /><Skeleton className="h-96" /><Skeleton className="h-96" />
      </div>
    </div>
  );
}
