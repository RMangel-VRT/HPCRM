import { useTranslation } from "react-i18next";
import { latestMatchingSeason, nextSeasonConflict } from "../../../../../lib/db/src/contractNextSeason";
import { selectRenewalSource, type ContractListItem } from "./contractTypes";
import { dateOnly, money } from "./contractFormat";
import { StatusPill } from "./ContractBadges";
import { Textarea } from "@/components/ui/textarea";

export function nextSeasonOptions(items: ContractListItem[], incoming: { seasonLabel: string; startDate: string; endDate: string }) {
  return items.map(item => {
    const terms = item.nextSeasonTerms ?? [];
    return { item, latest: latestMatchingSeason(terms)!,
      conflict: nextSeasonConflict(selectRenewalSource(terms), terms, [incoming]) };
  });
}
export function NextSeasonPanel({ options, customerName, line, choice, reason, onChoice, onReason }: {
  options: ReturnType<typeof nextSeasonOptions>; customerName: string; line: string;
  choice: string; reason: string; onChoice: (id: string) => void; onReason: (value: string) => void;
}) {
  const { t } = useTranslation();
  return <section className="rounded-md border p-4 space-y-4" data-testid="next-season-panel">
    <h2 className="font-medium">{t("nextSeason.heading", { customer: customerName, line: t(`nextSeason.line.${line}`) })}</h2>
    <fieldset className="space-y-4">
      <legend className="sr-only">{t("nextSeason.choose")}</legend>
      {options.map(({ item, latest, conflict }) => <div key={item.id} className="space-y-2 border-b pb-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <strong>{latest.seasonLabel}</strong>
          <span>{dateOnly(latest.startDate)} – {dateOnly(latest.endDate)}</span>
          <StatusPill status={latest.displayStatus} />
          <span>{t("nextSeason.annual", { price: money(latest.annualPriceCents) })}</span>
          <span>{t(`nextSeason.line.${latest.line}`)} → {t(`nextSeason.line.${line}`)}</span>
          <a className="underline" href={`/dashboard/contracts/${item.id}`} target="_blank" rel="noopener noreferrer">{t("nextSeason.open")}</a>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="contract-destination" value={item.id} checked={choice === item.id}
            disabled={!!conflict} onChange={() => onChoice(item.id)} aria-describedby={conflict ? `next-season-reason-${item.id}` : undefined} />
          {t("nextSeason.add", { season: latest.seasonLabel })}
        </label>
        {conflict && <p className="text-sm text-muted-foreground" id={`next-season-reason-${item.id}`}>
          {t(`nextSeason.conflict.${conflict.code}`, { ...conflict, status: t(`nextSeason.status.${conflict.status ?? "draft"}`) })}
        </p>}
      </div>)}
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="contract-destination" value="separate" checked={choice === "separate"} onChange={() => onChoice("separate")} />
        {t("nextSeason.separate")}
      </label>
      {choice === "separate" && <label className="block space-y-1 text-sm">
        <span>{t("nextSeason.reason")}</span>
        <Textarea value={reason} maxLength={200} required onChange={e => onReason(e.target.value)} data-testid="separate-contract-reason" />
      </label>}
    </fieldset>
  </section>;
}
