import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/** The parent is keyed by identity/company/version and installs authoritative detail.
 * Serialize blur saves; keep newer local typing when a previous save returns. */
export function ScopeOfWorkCard({ value, editable, onSave }: {
  value: string | null; editable: boolean; onSave: (value: string | null) => Promise<{ scopeOfWork: string | null } | null>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const local = useRef(draft);
  const baseline = useRef(value ?? "");
  const saving = useRef(false);
  const queued = useRef(false);
  const dirty = useRef(false);
  const alive = useRef(true);
  const normalize = (text: string) => text.trim() ? text : "";
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    baseline.current = value ?? "";
    if (!dirty.current) { local.current = value ?? ""; setDraft(local.current); }
  }, [value]);
  async function save() {
    if (!editable) return;
    if (saving.current) { queued.current = true; return; }
    const text = normalize(local.current);
    if (text === baseline.current) { dirty.current = false; return; }
    saving.current = true;
    queued.current = false;
    setStatus("saving");
    const result = await onSave(text || null);
    saving.current = false;
    if (!alive.current) return;
    if (result) {
      baseline.current = result.scopeOfWork ?? "";
      // The parent has installed the returned detail. Never overwrite newer typing.
      dirty.current = normalize(local.current) !== text;
      if (!dirty.current) { local.current = baseline.current; setDraft(baseline.current); }
      setStatus(dirty.current ? "idle" : "saved");
    } else {
      dirty.current = true;
      setStatus("error");
    }
    if (result && queued.current && dirty.current) void save();
  }
  return <section className="rounded-lg border bg-card" data-testid="scope-of-work-card">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-[hsl(var(--table-header))] px-4 py-3">
      <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" />{t("estimateBuilder.scope.title")}</h2>
      <span className="text-xs text-muted-foreground">{t("estimateBuilder.scope.hint")}</span>
    </div>
    <div className="p-4">
      {editable ? <>
        <Textarea aria-label={t("estimateBuilder.scope.title")} rows={7} maxLength={10000} className="resize-y"
          value={draft} onChange={e => { local.current = e.target.value; dirty.current = true; setDraft(e.target.value); if (!saving.current) setStatus("idle"); }}
          onBlur={() => void save()} />
        <div className="mt-1 min-h-5 text-xs text-muted-foreground" role="status" aria-live="polite">
          {status !== "idle" && t(`estimateBuilder.scope.${status}`)}
          {status === "error" && <Button variant="ghost" size="sm" onClick={() => void save()}>{t("estimateBuilder.scope.retry")}</Button>}
        </div>
      </> : <p className={`whitespace-pre-wrap break-words text-sm ${value ? "" : "text-muted-foreground"}`}>{value || t("estimateBuilder.scope.empty")}</p>}
    </div>
  </section>;
}
