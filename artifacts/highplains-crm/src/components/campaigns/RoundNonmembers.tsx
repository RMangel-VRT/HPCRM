import { useTranslation } from "react-i18next";
import type { DemandNonmember } from "../../../../../lib/db/src/campaignGenerationContracts";
export function RenewalPendingChip() {
  const { t } = useTranslation();
  return <span className="rounded border border-amber-500/50 px-1.5 text-[11px] text-amber-700">{t("sc22.renewalPending")}</span>;
}
export function RoundNonmembers({ rows = [] }: { rows?: DemandNonmember[] }) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  return <details className="rounded border px-3 py-2 text-xs" data-testid="round-nonmembers">
    <summary className="cursor-pointer font-medium">{t("sc22.notOnRound", { count: rows.length })}</summary>
    <ul className="mt-2 space-y-1">{rows.map(row => <li key={row.propertyId}>
      <span className="font-medium">{row.propertyName}</span> · {t(`sc22.reasons.${row.reason}`, {
        season: row.seasonLabel, date: row.nonRenewalOn ?? "",
      })}
    </li>)}</ul>
  </details>;
}
