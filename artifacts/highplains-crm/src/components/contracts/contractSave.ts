import { parseDollarsToCents } from "./rateCardUtils";
import { errorText } from "./contractFormat";
import type { DetailTerm } from "./contractTypes";

export interface FieldDraft {
  seasonLabel?: string; startDate?: string; endDate?: string; legalName?: string | null; managingAgentName?: string | null;
  projectContact?: string | null; contactPhone?: string | null; contactEmail?: string | null; projectAddress?: string | null;
  po?: string | null; notes?: string | null; snowTriggers?: string | null; snowPricing?: string; flatInput?: string;
}

const TEXT_KEYS = ["seasonLabel", "startDate", "endDate", "legalName", "managingAgentName", "projectContact", "contactPhone", "contactEmail", "projectAddress", "po", "notes", "snowTriggers"] as const;
const REQUIRED = ["seasonLabel", "startDate", "endDate"];

/** Only changed keys (PATCH semantics), plus validation problems that must block saving. */
export function buildFieldPatch(f: FieldDraft, t: Pick<DetailTerm, "snowPricing" | "snowFlatPriceCents"> & Partial<DetailTerm>) {
  const patch: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const k of TEXT_KEYS) {
    if (f[k] === undefined) continue;
    const cur = (t[k as keyof DetailTerm] as string | null | undefined) ?? "";
    if (f[k] === cur) continue;
    if (f[k] === "" && REQUIRED.includes(k)) problems.push(`${k} is required`);
    else patch[k] = f[k] === "" && !REQUIRED.includes(k) ? null : f[k];
  }
  const pricing = f.snowPricing ?? t.snowPricing ?? "time_and_materials";
  if (f.snowPricing !== undefined && f.snowPricing !== (t.snowPricing ?? "time_and_materials")) patch.snowPricing = f.snowPricing;
  if (pricing !== "flat_rate") {
    // Leaving flat rate explicitly clears the stored flat price.
    if (t.snowFlatPriceCents != null) patch.snowFlatPriceCents = null;
  } else if (f.flatInput !== undefined) {
    const raw = f.flatInput.trim();
    const cents = raw === "" ? null : parseDollarsToCents(raw);
    if (raw !== "" && cents === null) problems.push("Flat snow price must be a dollar amount");
    else if (cents !== (t.snowFlatPriceCents ?? null)) patch.snowFlatPriceCents = cents;
  }
  return { patch, problems };
}

export interface SaveSection { name: string; run: () => Promise<unknown> }

/** Runs sections in order; one failure never stops or hides the others. */
export async function saveSections(sections: SaveSection[]) {
  const ok: string[] = [];
  const failures: Record<string, string> = {};
  for (const s of sections) {
    try { await s.run(); ok.push(s.name); } catch (e) { failures[s.name] = errorText(e); }
  }
  return { ok, failures };
}
