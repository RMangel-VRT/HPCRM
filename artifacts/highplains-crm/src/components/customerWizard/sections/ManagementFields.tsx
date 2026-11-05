import type { PmCompany, PmManager, WizardDraft } from "../wizardModel";
import { Field, selectCls } from "./shared";
import type { PatchDraft, TW } from "./shared";

interface Props {
  d: WizardDraft;
  patch: PatchDraft;
  tw: TW;
  pmCompanies: { data?: PmCompany[]; isLoading: boolean; isError: boolean };
  managers: PmManager[];
}

/** Operational customer ownership is editable independently of bill-to mode. */
export function ManagementFields({ d, patch, tw, pmCompanies, managers }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tw("billing.company")}>
          <select className={selectCls} value={d.propertyManagementCompanyId ?? ""} disabled={pmCompanies.isLoading}
            onChange={e => patch({ propertyManagementCompanyId: e.target.value || null, propertyManagerId: null })} data-testid="select-pm-company">
            <option value="">{pmCompanies.isLoading ? tw("billing.careOfLoading") : tw("billing.companyNone")}</option>
            {(pmCompanies.data ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label={tw("billing.manager")}>
          <select className={selectCls} value={d.propertyManagerId ?? ""} disabled={!d.propertyManagementCompanyId}
            onChange={e => patch({ propertyManagerId: e.target.value || null })} data-testid="select-pm-manager">
            <option value="">{tw("billing.managerNone")}</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
      {pmCompanies.isError && <p className="text-xs text-destructive">{tw("billing.careOfError")}</p>}
    </div>
  );
}
