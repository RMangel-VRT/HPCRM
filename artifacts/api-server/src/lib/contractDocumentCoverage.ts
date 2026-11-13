import type { AgreementTerm, TermDocument } from "@workspace/db";
import { compareTermPriority, selectInEffectTerm } from "./contractCenterService";
import { signedSeason } from "./contractState";
import { isCalendarDate } from "@workspace/db/estimate-contracts";

type Season = Pick<AgreementTerm, "id" | "startDate" | "endDate" | "status" | "renewedFromTermId">;
type Document = Pick<TermDocument, "termId" | "coversThroughTermId">;
/** Explicit coverage only. A covering document and its target must belong to
 * these same agreement seasons; renewal-set membership alone implies nothing. */
export function documentsCovering<T extends Document>(term: Season, terms: readonly Season[], documents: readonly T[]): T[] {
  const byId = new Map(terms.map(t => [t.id, t]));
  return documents.filter(document => {
    if (document.termId === term.id) return true;
    const source = byId.get(document.termId), target = byId.get(document.coversThroughTermId ?? "");
    return !!source && !!target && source.startDate < term.startDate &&
      target.startDate > source.startDate && target.startDate >= term.startDate;
  });
}
export function missingContractDocument(terms: Season[], documents: readonly Document[], today: string) {
  terms = terms.filter(t => typeof t.startDate === "string" && typeof t.endDate === "string" &&
    isCalendarDate(t.startDate) && isCalendarDate(t.endDate) && t.startDate <= t.endDate);
  const term = selectInEffectTerm(terms, today) ?? terms.filter(signedSeason).sort(compareTermPriority)[0];
  return !!term && !documentsCovering(term, terms, documents).length;
}
