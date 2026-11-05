import { useState } from "react";
import { Link2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chipProblem, emailsRemaining, pmAddressComplete } from "../wizardModel";
import type { DuplicateCandidate, PmCompany, PmManager, WizardDraft } from "../wizardModel";
import type { Preview } from "../billToPreview";
import { Field, Section, StateSelect, choice, selectCls } from "./shared";
import type { Needed, PatchDraft, SectionMode, SetDraft, TW } from "./shared";
import { ManagementFields } from "./ManagementFields";

export interface DupProps { dup: { state: string; name: string }; exactHits: DuplicateCandidate[] }

export interface BillingSectionProps {
  d: WizardDraft; setD: SetDraft; patch: PatchDraft; tw: TW;
  pm: PmCompany | null; pmCompanies: { data?: PmCompany[]; isLoading: boolean; isError: boolean }; managers: PmManager[];
  /** Value shown in the billing-name input. Create shows the name fallback; edit shows only what is stored. */
  billingName: string; billingNamePlaceholder?: string;
  dupInfo?: DupProps | null; alreadyLinked: boolean;
  terms: { data?: { id: string; name: string }[]; isLoading: boolean; isError: boolean; refetch?: () => unknown }; termDefaulted: boolean;
  termsEmptyFallback?: boolean;
  preview?: Preview | null; mode?: SectionMode; needed?: Needed; framed?: boolean; id?: string; testId?: string;
}

export function BillingSection(p: BillingSectionProps) {
  const { d, setD, patch, tw, pm, pmCompanies, managers, billingName, dupInfo, alreadyLinked, terms, termDefaulted, preview, mode = "create", needed } = p;
  const active = d.status === "active";
  const req = active ? tw("requiredActive") : tw("optional");
  const need = (f: "billingName" | "billingEmails" | "billTo") => active && needed?.has(f) ? tw("neededToActivate") : false;
  const [chip, setChip] = useState("");
  const [chipErr, setChipErr] = useState<string | null>(null);
  const remaining = emailsRemaining(d.billingEmails);
  const previewLeft = remaining - (chip.trim() ? chip.trim().length + (d.billingEmails.length ? 1 : 0) : 0);
  function addChip() {
    if (!chip.trim()) return;
    const prob = chipProblem(d.billingEmails, chip);
    if (prob) { setChipErr(tw(prob === "invalid" ? "billing.chipInvalid" : prob === "duplicate" ? "billing.chipDuplicate" : "billing.chipTooLong")); return; }
    setD(c => ({ ...c, billingEmails: [...c.billingEmails, chip.trim()] })); setChip(""); setChipErr(null);
  }
  // Mirrors CQ1 resolveBillTo: street = "c/o {company}", street2 = company street, then city/state/zip.
  const careOf = pm ? [`c/o ${pm.name}`, pm.street, [[pm.city, pm.state].filter(Boolean).join(", "), pm.zip].filter(Boolean).join(" ")].filter(Boolean) as string[] : [];
  const billToNeed = need("billTo");
  return (
    <Section title={tw("billing.heading")} lead={tw("billing.lead")} testId={p.testId ?? "wizard-body-2"} id={p.id} framed={p.framed}>
      {d.status === "prospect" && <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground" data-testid="text-prospect-billing">{tw("billing.prospectNote")}</p>}
      <fieldset className="space-y-2">
        <legend className="flex w-full items-baseline justify-between text-xs font-medium text-muted-foreground">
          <span>{tw("billing.billTo")} <span className="ml-1 text-[10px] uppercase tracking-wider text-primary/80">{req}</span></span>
          {billToNeed && <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400" data-testid="need-billTo">{billToNeed}</span>}
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([["property", "property"], ["management_company", "mgmt"], ["custom", "custom"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={choice(d.billToMode === k)} aria-pressed={d.billToMode === k} onClick={() => patch({ billToMode: k })} data-testid={`button-billto-${k}`}>
              <div className="text-sm font-medium">{tw(`billing.${l}`)}</div><div className="text-xs text-muted-foreground">{tw(`billing.${l}Sub`)}</div>
            </button>
          ))}
        </div>
        {preview && (
          <p className="text-sm" aria-live="polite" data-testid="text-billto-preview">
            <span className="text-muted-foreground">{tw("billing.previewLabel")} </span>
            {preview.state === "loading" ? <span className="text-muted-foreground">{tw("billing.previewLoading")}</span>
              : preview.state === "incomplete" ? <span className="text-amber-700 dark:text-amber-400" data-testid="text-billto-preview-incomplete">{preview.viaParent ? tw("billing.previewParentIncomplete", { parent: preview.viaParent.name }) : tw("billing.previewIncomplete")}</span>
              : <span className="font-medium">{preview.billTo.lines.join(", ")}{preview.viaParent ? <span className="font-normal text-muted-foreground"> · {tw("billing.previewViaParent", { parent: preview.viaParent.name })}</span> : null}</span>}
          </p>
        )}
        {d.billToMode === "property" && (
          <p className="rounded-md border border-dashed p-3 text-sm" data-testid="text-billto-property">
            {d.street.trim() ? <>{tw(mode === "edit" ? "billing.propertyAddrEdit" : "billing.propertyAddr")}: <span className="font-medium">{[d.street, [d.city, d.state].filter(Boolean).join(", "), d.zip].filter(Boolean).join(" ")}</span></> : tw(mode === "edit" ? "billing.propertyAddrMissingEdit" : "billing.propertyAddrMissing")}
          </p>
        )}
        {d.billToMode === "management_company" && (
          <div className="space-y-3 rounded-md border p-3">
            {mode === "create" && <ManagementFields d={d} patch={patch} tw={tw} pmCompanies={pmCompanies} managers={managers} />}
            {pm && (
              <div className="rounded bg-muted/50 p-3 text-sm" data-testid="text-care-of" aria-readonly>
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{tw("billing.careOf")}</div>
                {careOf.map((l, i) => <div key={i}>{l}</div>)}
                {!pmAddressComplete(pm) && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" data-testid="text-care-of-incomplete">{tw("billing.careOfIncomplete")}</p>}
              </div>
            )}
          </div>
        )}
        {d.billToMode === "custom" && (
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
            <div className="md:col-span-2"><Field label={tw("billing.billStreet")}><Input value={d.billStreet} onChange={e => patch({ billStreet: e.target.value })} data-testid="input-bill-street" /></Field></div>
            <div className="md:col-span-2"><Field label={tw("billing.billStreet2")}><Input value={d.billStreet2} onChange={e => patch({ billStreet2: e.target.value })} data-testid="input-bill-street2" /></Field></div>
            <Field label={tw("billing.billCity")}><Input value={d.billCity} onChange={e => patch({ billCity: e.target.value })} data-testid="input-bill-city" /></Field>
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <Field label={tw("billing.billState")}><StateSelect value={d.billState} onChange={v => patch({ billState: v })} tw={tw} testId="input-bill-state" label={tw("billing.billState")} /></Field>
              <Field label={tw("billing.billZip")}><Input inputMode="numeric" value={d.billZip} onChange={e => patch({ billZip: e.target.value })} data-testid="input-bill-zip" /></Field>
            </div>
          </div>
        )}
      </fieldset>

      <Field label={tw("billing.billingName")} req={req} need={need("billingName")} needId="billingName" hint={tw("billing.billingNameHelp")}>
        <Input value={billingName} placeholder={p.billingNamePlaceholder} onChange={e => patch({ billingName: e.target.value, billingNameTouched: true, linkQboId: null, linkQboName: null })} data-testid="input-billing-name" />
      </Field>
      {!alreadyLinked && dupInfo && (
        <div className="min-h-[1.5rem] text-sm" aria-live="polite" data-testid="dup-status">
          {d.linkQboId ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5" data-testid="text-linked-qbo">
              <Link2 className="h-4 w-4 text-primary" />{tw("billing.linked", { name: d.linkQboName ?? "" })}
              <Button size="sm" variant="ghost" onClick={() => patch({ linkQboId: null, linkQboName: null })} data-testid="button-unlink-qbo">{tw("billing.unlink")}</Button>
            </div>
          ) : dupInfo.dup.state === "checking" ? <span className="text-muted-foreground" data-testid="text-dup-checking">{tw("billing.checking")}</span>
            : dupInfo.dup.state === "error" ? <span className="text-muted-foreground" data-testid="text-dup-error">{tw("billing.checkFailed")}</span>
            : dupInfo.exactHits.length > 0 ? (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3" data-testid="dup-matches">
                {dupInfo.exactHits.map(h => (
                  <div key={h.qboId} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{tw("billing.match")} <strong data-testid={`text-dup-${h.qboId}`}>{h.displayName}</strong>{h.city ? <span className="text-muted-foreground"> · {h.city}</span> : null}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">{tw("billing.matchSame")}
                      <Button size="sm" variant="outline" onClick={() => patch({ linkQboId: h.qboId, linkQboName: h.displayName })} data-testid={`button-link-${h.qboId}`}>{tw("billing.link")}</Button>
                    </span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{tw("billing.orChange")}</p>
              </div>
            ) : dupInfo.dup.state === "done" ? <span className="text-muted-foreground" data-testid="text-dup-none">{tw("billing.noMatch")}</span> : null}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tw("billing.companyName")}><Input value={d.billingCompanyName} onChange={e => patch({ billingCompanyName: e.target.value })} data-testid="input-billing-company" /></Field>
        <Field label={tw("billing.apName")}><Input value={d.billingContactName} onChange={e => patch({ billingContactName: e.target.value })} data-testid="input-billing-contact" /></Field>
      </div>

      <Field label={tw("billing.emails")} req={req} need={need("billingEmails")} needId="billingEmails"
        hint={<span className={previewLeft < 0 ? "text-destructive" : ""} data-testid="text-email-remaining">{previewLeft < 0 ? tw("billing.over", { n: -previewLeft }) : tw("billing.remaining", { n: previewLeft })}</span>}>
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
          {d.billingEmails.map(e => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary" data-testid={`chip-email-${e}`}>
              {e}<button type="button" aria-label={tw("billing.removeEmail", { email: e })} onClick={() => setD(c => ({ ...c, billingEmails: c.billingEmails.filter(x => x !== e) }))}><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input className="min-w-[10rem] flex-1 bg-transparent text-sm outline-none" value={chip} placeholder={tw("billing.emailsPlaceholder")}
            onChange={e => { setChip(e.target.value); setChipErr(null); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(); } }}
            onBlur={() => chip.trim() && addChip()} data-testid="input-billing-email" />
        </div>
      </Field>
      {chipErr && <p className="-mt-3 text-xs text-destructive" data-testid="error-email-chip">{chipErr}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <Field label={tw("billing.phone")}><Input type="tel" value={d.billingPhone} onChange={e => patch({ billingPhone: e.target.value })} data-testid="input-billing-phone" /></Field>
        <Field label={tw("billing.mobile")}><Input type="tel" value={d.billingMobile} onChange={e => patch({ billingMobile: e.target.value })} data-testid="input-billing-mobile" /></Field>
        <Field label={tw("billing.terms")}
          hint={terms.isError ? null : termDefaulted && d.qboTermId ? <span data-testid="text-terms-default">{tw("billing.termsDefault")}</span> : p.termsEmptyFallback ? <span data-testid="text-terms-no-default">{tw("billing.termsNoDefault")}</span> : null}>
          {terms.isError ? (
            // Never fall back to a raw term-ID input; the stored term is kept untouched.
            <span className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs" role="alert" data-testid="error-terms">
              <span className="text-destructive">{tw("billing.termsError")}</span>
              {terms.refetch && <Button type="button" size="sm" variant="outline" className="h-7" onClick={e => { e.preventDefault(); void terms.refetch!(); }} data-testid="button-retry-terms"><RefreshCw className="mr-1 h-3 w-3" />{tw("retry")}</Button>}
            </span>
          ) : (
            <select className={selectCls} value={d.qboTermId} disabled={terms.isLoading} onChange={e => patch({ qboTermId: e.target.value, termTouched: true })} data-testid="select-billing-terms">
              <option value="">{terms.isLoading ? tw("billing.termsLoading") : tw("billing.termsNone")}</option>
              {d.qboTermId && !terms.isLoading && !(terms.data ?? []).some(x => x.id === d.qboTermId) && <option value={d.qboTermId}>{tw("billing.termsCurrent")}</option>}
              {(terms.data ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
        </Field>
      </div>
    </Section>
  );
}
