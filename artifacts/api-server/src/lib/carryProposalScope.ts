import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "./logger";

export const PROPOSAL_SCOPE_BOOT_LOCK = 665006;
const required = {
  proposals: ["id", "company_id", "estimate_id", "scope_of_work", "created_at"],
  estimates: ["id", "company_id", "current_version_id"],
  estimate_versions: ["id", "company_id", "estimate_id", "status", "scope_of_work"],
};
export interface ProposalScopeReport {
  copied: number; ambiguous: { estimateId: string; proposalIds: string[]; selectedProposalId: string }[];
  skippedFrozenProposalIds: string[]; skippedPopulated: number;
}

/** Boot DML only. Parent locks use the same order as normal estimate mutations.
 * Oldest created proposal then ID wins; preserved source text is never deleted. */
export async function carryProposalScope(database = db): Promise<ProposalScopeReport | null> {
  const report = await database.transaction(async tx => {
    const schema = await tx.execute(sql`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('proposals','estimates','estimate_versions')`);
    const present = new Set(schema.rows.map(r => `${r.table_name}.${r.column_name}`));
    const missing = Object.entries(required).flatMap(([table, columns]) =>
      columns.map(c => `${table}.${c}`)).filter(c => !present.has(c));
    if (missing.length) {
      logger.warn({ missing }, "Proposal scope carry-forward skipped: required schema is not present");
      return null;
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${PROPOSAL_SCOPE_BOOT_LOCK})`);
    // Wait for edits/lifecycle before reading the current pointer. At READ
    // COMMITTED the following statement sees any commit made while we waited.
    const parents = await tx.execute(sql`SELECT e.id,e.company_id FROM public.estimates e
      WHERE EXISTS (SELECT 1 FROM public.proposals p WHERE p.company_id=e.company_id
        AND p.estimate_id=e.id AND coalesce(p.scope_of_work,'') ~ '[^[:space:]]')
      ORDER BY e.company_id,e.id FOR UPDATE OF e`);
    const result: ProposalScopeReport = { copied: 0, ambiguous: [], skippedFrozenProposalIds: [], skippedPopulated: 0 };
    for (const parent of parents.rows) {
      const versions = await tx.execute(sql`SELECT v.id,v.status,v.scope_of_work FROM public.estimate_versions v
        JOIN public.estimates e ON e.current_version_id=v.id AND e.company_id=v.company_id AND e.id=v.estimate_id
        WHERE e.id=${parent.id} AND e.company_id=${parent.company_id} FOR UPDATE OF v`);
      const v = versions.rows[0];
      // Lock candidate source rows too; do not select text from another company.
      const candidates = await tx.execute(sql`SELECT id,scope_of_work FROM public.proposals
        WHERE company_id=${parent.company_id} AND estimate_id=${parent.id}
          AND coalesce(scope_of_work,'') ~ '[^[:space:]]' ORDER BY created_at ASC,id ASC FOR UPDATE`);
      if (!v || v.status !== "draft") {
        result.skippedFrozenProposalIds.push(...candidates.rows.map(p => String(p.id)));
        continue;
      }
      if (String(v.scope_of_work ?? "").trim()) { result.skippedPopulated++; continue; }
      if (!candidates.rows.length) continue;
      const chosen = candidates.rows[0];
      if (candidates.rows.length > 1) result.ambiguous.push({ estimateId: String(parent.id),
        proposalIds: candidates.rows.map(p => String(p.id)), selectedProposalId: String(chosen.id) });
      const updated = await tx.execute(sql`UPDATE public.estimate_versions v SET scope_of_work=${chosen.scope_of_work}
        WHERE v.id=${v.id} AND v.company_id=${parent.company_id} AND v.estimate_id=${parent.id}
          AND v.status='draft' AND coalesce(v.scope_of_work,'') !~ '[^[:space:]]'
          AND EXISTS (SELECT 1 FROM public.estimates e WHERE e.id=v.estimate_id
            AND e.company_id=v.company_id AND e.current_version_id=v.id) RETURNING v.id`);
      result.copied += updated.rowCount ?? updated.rows.length;
    }
    return result;
  }, { isolationLevel: "read committed" });
  if (report) logger.info(report, "Proposal scope carry-forward complete");
  return report;
}
