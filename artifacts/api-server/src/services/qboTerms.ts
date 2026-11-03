import { z } from "zod";
import { qboRequest } from "./qboClient";

export type QboTerm = { id: string; name: string };
const termsResponse = z.object({
  QueryResponse: z.object({ Term: z.array(z.object({
    Id: z.string().min(1), Name: z.string(), Active: z.boolean().optional(),
  })).optional() }),
});
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; terms: QboTerm[] }>();
const pending = new Map<string, Promise<QboTerm[]>>();

/** Read-only per-company term projection. Failed fetches never replace good data. */
export async function activeQboTerms(companyId: string): Promise<QboTerm[]> {
  const found = cache.get(companyId);
  if (found && found.expiresAt > Date.now()) return found.terms.map(t => ({ ...t }));
  let flight = pending.get(companyId);
  if (!flight) {
    flight = (async () => {
      const terms: QboTerm[] = [];
      // Query API pages have at most 1000 results. Do not silently truncate.
      for (let start = 1; ; start += 1000) {
        const response = await qboRequest(companyId, "GET", `/query?query=${encodeURIComponent(
          `SELECT * FROM Term WHERE Active = true STARTPOSITION ${start} MAXRESULTS 1000`)}`);
        if (!response.ok) throw new Error("Unable to load QuickBooks terms");
        const page = termsResponse.parse(await response.json()).QueryResponse.Term ?? [];
        terms.push(...page.filter(t => t.Active !== false).map(t => ({ id: t.Id, name: t.Name })));
        if (page.length < 1000) break;
      }
      cache.set(companyId, { expiresAt: Date.now() + TTL, terms });
      return terms;
    })();
    pending.set(companyId, flight);
  }
  try { return (await flight).map(t => ({ ...t })); }
  finally { if (pending.get(companyId) === flight) pending.delete(companyId); }
}
