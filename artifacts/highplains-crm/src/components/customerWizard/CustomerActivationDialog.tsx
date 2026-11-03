import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { canPromote, qboJson, scopeKey } from "@/lib/qboReview";
import { activationError, type MissingField } from "./wizardModel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface CustomerActivation { customerId: string; status: "prospect"; missingFields: MissingField[] }
export interface ActivationResponse { customerActivation?: CustomerActivation }
interface Prompt { activation: CustomerActivation; name: string; companyId: string; scope: string }

/** Both win origins share this explicit, independent follow-up action. */
export function useCustomerActivation() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const scope = scopeKey(user);
  const current = useRef(scope); current.current = scope;
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  useEffect(() => { setPrompt(null); setError(null); setDone(false); }, [scope]);
  function offer(result: ActivationResponse | null | undefined, name: string) {
    if (lock.current || !result?.customerActivation || !user?.activeCompanyId || !canPromote(user) || current.current !== scope) return;
    setPrompt({ activation: result.customerActivation, name, companyId: user.activeCompanyId, scope });
    setError(null); setDone(false);
  }
  function close() { if (!lock.current) setPrompt(null); }
  async function activate() {
    if (!prompt || lock.current || current.current !== prompt.scope) return;
    const captured = prompt;
    lock.current = true; setPending(true); setError(null);
    try {
      await qboJson("PATCH", `/api/customers/${captured.activation.customerId}`, captured.companyId, { status: "active" });
      // Include legacy paginated keys as well as scoped detail/setup/card keys.
      void qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] === "/api/customers" || q.queryKey[0].startsWith("/api/customers?")) });
      if (current.current === captured.scope) setDone(true);
    } catch (e) {
      if (current.current !== captured.scope) return;
      const incomplete = activationError(e);
      if (incomplete) setPrompt({ ...captured, activation: { ...captured.activation, missingFields: incomplete.missingFields } });
      else setError(t("customerActivation.failed"));
    } finally { lock.current = false; setPending(false); }
  }
  const missing = prompt?.activation.missingFields ?? [];
  const dialog = <Dialog open={!!prompt && prompt.scope === scope} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent onEscapeKeyDown={e => { if (pending) e.preventDefault(); }} onPointerDownOutside={e => { if (pending) e.preventDefault(); }}>
      <DialogTitle>{t(done ? "customerActivation.done" : "customerActivation.title", { customer: prompt?.name })}</DialogTitle>
      <DialogDescription>{t(done ? "customerActivation.waiting" : "customerActivation.question")}</DialogDescription>
      {!done && missing.length > 0 && <p data-testid="activation-missing">{t("customerActivation.missing", {
        fields: missing.map(f => t(`customerWizard.fields.${f}`)).join(", "),
      })}</p>}
      {error && <p role="alert">{error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={close}>{t(done ? "customerActivation.close" : "customerActivation.notNow")}</Button>
        {!done && (missing.length ? <Button asChild><Link href={`/dashboard/customers/${prompt?.activation.customerId}/setup`} onClick={close}>{t("customerWizard.finishAction")}</Link></Button>
          : <Button disabled={pending} onClick={() => void activate()}>{t(pending ? "customerActivation.pending" : "customerActivation.activate")}</Button>)}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
  return { offer, dialog };
}
