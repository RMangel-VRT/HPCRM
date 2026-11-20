import type { EstimateRevisionIdMap } from "../../../../lib/db/src/estimateContracts";
import { estimateOrderSchema } from "../../../../lib/db/src/estimateContracts";
import { conflictOf, ESTIMATES_API, sendEstimate, type EstimateDetailDto } from "./estimateBuilder";
import { fetchJson } from "./hardscapeCatalog";

export type EstimateEdit = { method: string; url: string; body?: unknown };

export async function startEstimateEditRevision(companyId: string, source: EstimateDetailDto, signal: AbortSignal) {
  const base = `${ESTIMATES_API}/${encodeURIComponent(source.id)}`;
  const from = `${base}/versions/${encodeURIComponent(source.version.id)}`;
  try {
    const { idMap, ...draft } = await sendEstimate("POST", `${from}/revise`, companyId, { firstEdit: true }, signal);
    return { from, draft, idMap };
  } catch (err) {
    const conflict = conflictOf(err);
    if (conflict?.error !== "DRAFT_EXISTS" || !conflict.versionId) throw err;
    const draft = await fetchJson<EstimateDetailDto>(base, companyId, signal);
    if (draft.version.id !== conflict.versionId || draft.version.status !== "draft") throw err;
    return { from, draft, idMap: conflict.idMap };
  }
}

/** Verify every target before making the first write. A deleted row or an older
 * draft without copy provenance must never be matched by position or name. */
export function replayEstimateEdits(source: EstimateDetailDto, from: string, draft: EstimateDetailDto,
  idMap: EstimateRevisionIdMap | undefined, edits: EstimateEdit[]): EstimateEdit[] | null {
  if (draft.id !== source.id || draft.currentVersionId !== draft.version.id || draft.version.status !== "draft"
    || draft.version.createdFromVersionId !== source.version.id) return null;
  const target = `${ESTIMATES_API}/${encodeURIComponent(draft.id)}/versions/${encodeURIComponent(draft.version.id)}`;
  const sections = new Set(draft.version.sections.map(s => s.id));
  const lines = new Set(draft.version.sections.flatMap(s => s.lines.map(l => l.id)));
  const mapped = (kind: "sections" | "lines", id: string) => {
    const ids = idMap?.[kind];
    const result = ids && Object.hasOwn(ids, id) ? ids[id] : undefined;
    return typeof result === "string" && (kind === "sections" ? sections : lines).has(result) ? result : null;
  };
  const result: EstimateEdit[] = [];
  for (const edit of edits) {
    let path = target;
    if (edit.url !== from) {
      if (!edit.url.startsWith(`${from}/`)) return null;
      const suffix = edit.url.slice(from.length + 1);
      if (suffix === "order" && edit.method === "PUT") {
        const order = estimateOrderSchema.safeParse(edit.body);
        if (!order.success) return null;
        const mappedSections = [];
        for (const section of order.data.sections) {
          const id = mapped("sections", section.id);
          const lineIds = section.lineIds.map(lineId => mapped("lines", lineId));
          if (!id || lineIds.some(lineId => lineId === null)) return null;
          mappedSections.push({ id, lineIds });
        }
        result.push({ method: edit.method, url: `${target}/order`, body: { sections: mappedSections } });
        continue;
      }
      const match = /^(sections|lines)(?:\/([^/]+))?(?:\/(duplicate|replace))?$/.exec(suffix);
      if (!match) return null;
      const kind = match[1] as "sections" | "lines";
      path += `/${kind}`;
      if (match[2]) {
        const id = mapped(kind, decodeURIComponent(match[2]));
        if (!id) return null;
        path += `/${encodeURIComponent(id)}`;
      }
      if (match[3]) {
        if (kind !== "lines" || !match[2]) return null;
        path += `/${match[3]}`;
      }
    }
    let body = edit.body;
    if (body && typeof body === "object" && "sectionId" in body) {
      if (typeof body.sectionId !== "string") return null;
      const sectionId = mapped("sections", body.sectionId);
      if (!sectionId) return null;
      body = { ...body, sectionId };
    }
    result.push({ method: edit.method, url: path, body });
  }
  return result;
}
