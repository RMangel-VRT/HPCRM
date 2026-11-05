import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RANKINGS } from "../wizardModel";
import type { ParentLite, WizardDraft, WizardStatus } from "../wizardModel";
import { Field, Section, StateSelect, choice, selectCls } from "./shared";
import type { Needed, PatchDraft, SectionMode, TW } from "./shared";

interface Props {
  d: WizardDraft; patch: PatchDraft; tw: TW; parentChoices: ParentLite[]; parentsLoading: boolean;
  mode?: SectionMode; needed?: Needed; framed?: boolean; id?: string; testId?: string; top?: ReactNode; managementFields?: ReactNode;
}

export function PropertySection({ d, patch, tw, parentChoices, parentsLoading, mode = "create", needed, framed, id, testId = "wizard-body-1", top, managementFields }: Props) {
  const active = d.status === "active";
  const reqAddr = active ? tw("requiredActive") : tw("optional");
  const need = (f: "street" | "city" | "state" | "zip") => active && needed?.has(f) ? tw("neededToActivate") : false;
  const statuses: WizardStatus[] = mode === "edit" ? ["prospect", "active", "inactive"] : ["prospect", "active"];
  return (
    <Section title={tw("property.heading")} lead={tw("property.lead")} testId={testId} id={id} framed={framed}>
      {top}
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <Field label={tw("fields.name")} req={tw("required")}>
          <Input value={d.name} onChange={e => patch({ name: e.target.value })} data-testid="input-wizard-name" autoFocus={mode === "create"} />
        </Field>
        <Field label={tw("property.customerNumber")} req={tw("optional")}>
          <Input value={d.customerNumber} onChange={e => patch({ customerNumber: e.target.value })} data-testid="input-wizard-customer-number" />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">{tw("property.status")}</legend>
        <div className={`grid gap-2 ${statuses.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {statuses.map(s => (
            <button key={s} type="button" className={choice(d.status === s)} aria-pressed={d.status === s} onClick={() => patch({ status: s, sendNow: s === "active" ? false : d.sendNow })} data-testid={`button-status-${s}`}>
              <div className="font-medium">{tw(`property.${s}`)}</div><div className="text-xs text-muted-foreground">{tw(`property.${s}Sub`)}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="text-status-help">{tw("property.statusHelp")} {tw("property.activeNoBid")}</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">{tw("property.address")} <span className="ml-1 text-[10px] uppercase tracking-wider text-primary/80">{reqAddr}</span></legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label={tw("fields.street")} need={need("street")} needId="street">
              <Input placeholder={tw("property.streetExample")} value={d.street} onChange={e => patch({ street: e.target.value })} data-testid="input-wizard-street" />
            </Field>
          </div>
          <Field label={tw("fields.city")} need={need("city")} needId="city">
            <Input placeholder={tw("property.cityExample")} value={d.city} onChange={e => patch({ city: e.target.value })} data-testid="input-wizard-city" />
          </Field>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <Field label={tw("fields.state")} need={need("state")} needId="state">
              <StateSelect value={d.state} onChange={v => patch({ state: v })} tw={tw} testId="input-wizard-state" label={tw("fields.state")} />
            </Field>
            <Field label={tw("fields.zip")} need={need("zip")} needId="zip">
              <Input inputMode="numeric" placeholder="80401" value={d.zip} onChange={e => patch({ zip: e.target.value })} data-testid="input-wizard-zip" />
            </Field>
          </div>
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">{tw("property.type")}</legend>
          <div className="flex gap-2">
            {(["commercial", "hoa"] as const).map(k => (
              <Button key={k} type="button" size="sm" variant={d.customerType === k ? "default" : "outline"} aria-pressed={d.customerType === k} onClick={() => patch({ customerType: k })} data-testid={`button-type-${k}`}>{tw(`property.${k}`)}</Button>
            ))}
          </div>
        </fieldset>
        <Field label={tw("property.ranking")}>
          <select className={selectCls} value={d.ranking} onChange={e => patch({ ranking: e.target.value as WizardDraft["ranking"] })} data-testid="select-wizard-ranking">
            {RANKINGS.map(r => <option key={r} value={r}>{tw(`property.rankings.${r}`)}</option>)}
          </select>
        </Field>
        <Field label={tw("property.parent")} hint={tw("property.parentHelp")}>
          <select className={selectCls} value={d.parentCustomerId ?? ""} disabled={parentsLoading || d.isParent}
            onChange={e => patch({ parentCustomerId: e.target.value || null })} data-testid="select-wizard-parent">
            <option value="">{tw("property.parentNone")}</option>
            {d.parentCustomerId && !parentChoices.some(p => p.id === d.parentCustomerId) && !parentsLoading && <option value={d.parentCustomerId}>{tw("property.parentUnavailable")}</option>}
            {parentChoices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="rounded-md border p-4 space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          {tw("property.hasBranches")}
          <Switch checked={d.isParent} disabled={!!d.parentCustomerId} onCheckedChange={v => patch({ isParent: v })} data-testid="switch-has-branches" />
        </label>
        {d.isParent && (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="branch-billing">
            {(["master", "separate"] as const).map(k => (
              <button key={k} type="button" className={choice(d.branchBillingMode === k)} aria-pressed={d.branchBillingMode === k} onClick={() => patch({ branchBillingMode: k })} data-testid={`button-branch-${k}`}>
                <div className="text-sm font-medium">{tw(`property.${k}`)}</div><div className="text-xs text-muted-foreground">{tw(`property.${k}Sub`)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {managementFields}
      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-muted-foreground">{tw("property.extras")}</legend>
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={d.snowEnabled} onCheckedChange={v => patch({ snowEnabled: v })} data-testid="switch-snow" />{tw("property.snow")}</label>
          <Field label={tw("property.acres")}><Input inputMode="decimal" value={d.acres} onChange={e => patch({ acres: e.target.value })} data-testid="input-wizard-acres" /></Field>
          <Field label={tw("property.complexity")}>
            <select className={selectCls} value={d.complexityScore} onChange={e => patch({ complexityScore: e.target.value })} data-testid="select-wizard-complexity">
              <option value="">{tw("property.complexityNone")}</option>
              {["1", "2", "3", "4", "5"].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
      </fieldset>
    </Section>
  );
}
