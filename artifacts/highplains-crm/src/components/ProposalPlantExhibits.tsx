import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { companyHeaders } from "@/lib/hardscapeCatalog";
import { builderPath } from "@/lib/estimateBuilder";
import { DEFAULT_PALETTE_INTRO, EXHIBITS_KEY, type ProposalExhibits } from "../../../../lib/db/src/plantExhibitContracts";

interface Props {
  proposal: { id: string; estimateId: string; includePlantSchedule?: boolean; includePlantPalette?: boolean; paletteIntroText?: string | null; estimate?: { currentVersion: { id: string } | null } | null };
  companyId: string; identity: string;
}
function PlantPhoto({ varietyKey, companyId, name }: { varietyKey: string; companyId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void apiRequest("GET", `/api/plant-library/photo/${encodeURIComponent(varietyKey)}`, undefined,
      { signal: controller.signal, headers: companyHeaders(companyId) })
      .then(response => response.blob()).then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }).catch(() => { /* Images are best-effort, as in the printed exhibit. */ });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [varietyKey, companyId]);
  return url ? <img src={url} alt={name} className="aspect-square w-full object-cover rounded mb-2" /> : null;
}
/** Parent is keyed by company/user/role. Query and mutation closures never cross that boundary. */
export function ProposalPlantExhibits({ proposal, companyId, identity }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [introDraft, setIntroDraft] = useState<string | null>(null);
  const query = useQuery<ProposalExhibits>({
    queryKey: [EXHIBITS_KEY, companyId, identity, proposal.id, proposal.estimateId, proposal.estimate?.currentVersion?.id],
    queryFn: async ({ signal }) => (await apiRequest("GET", `/api/proposals/${proposal.id}/exhibits`, undefined,
      { signal, headers: companyHeaders(companyId) })).json(),
    staleTime: 0, refetchInterval: 30_000,
  });
  const save = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => apiRequest("PATCH", `/api/proposals/${proposal.id}`, updates, { headers: companyHeaders(companyId) }),
    onSuccess: (_response, updates) => {
      if ("paletteIntroText" in updates) setIntroDraft(null);
      void qc.invalidateQueries({ queryKey: ["/api/proposals", proposal.id] });
      void qc.invalidateQueries({ queryKey: [EXHIBITS_KEY, companyId, identity, proposal.id] });
    },
  });
  const data = query.data;
  const provenance = data?.provenance;
  const link = builderPath(proposal.estimateId);
  const source = provenance && <p className="text-sm text-muted-foreground" data-testid="exhibits-provenance">
    {t("plantExhibits.source", { number: provenance.estimateNumber, version: provenance.versionNumber })}
  </p>;
  const state = query.isError
    ? <p role="alert">{t("plantExhibits.loadError")} <Button variant="link" onClick={() => void query.refetch()}>{t("plantExhibits.retry")}</Button></p>
    : query.isPending ? <p role="status">{t("plantExhibits.loading")}</p> : null;
  const intro = introDraft ?? proposal.paletteIntroText ?? DEFAULT_PALETTE_INTRO;
  return <div className="space-y-6">
    {save.isError && <p role="alert">{t("plantExhibits.saveError")}</p>}
    <Card>
      <CardHeader><CardTitle>{t("plantExhibits.schedule")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2"><Switch checked={proposal.includePlantSchedule !== false} disabled={save.isPending}
          aria-label={t("plantExhibits.includeSchedule")} onCheckedChange={includePlantSchedule => save.mutate({ includePlantSchedule })} />{t("plantExhibits.includeSchedule")}</label>
        {source}<Link href={link} className="text-sm underline">{t("plantExhibits.editPlants")}</Link>
        {state}
        {!query.isError && data && (data.schedule.length ? <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="estimate-plant-schedule">
          <thead><tr>{["quantity", "name", "botanical", "size"].map(key => <th key={key} scope="col" className="text-left p-2">{t(`plantExhibits.${key}`)}</th>)}</tr></thead>
          <tbody>{data.schedule.map((row, i) => <tr key={i} className="border-t">
            <td className="p-2">{row.quantity}</td><td className="p-2">{row.name}</td><td className="p-2 italic">{row.botanicalName ?? "—"}</td><td className="p-2">{row.size ?? "—"}</td>
          </tr>)}</tbody>
        </table></div> : <p>{t("plantExhibits.emptySchedule")}</p>)}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>{t("plantExhibits.palette")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2"><Switch checked={proposal.includePlantPalette !== false} disabled={save.isPending}
          aria-label={t("plantExhibits.includePalette")} onCheckedChange={includePlantPalette => save.mutate({ includePlantPalette })} />{t("plantExhibits.includePalette")}</label>
        {source}<Link href={link} className="text-sm underline">{t("plantExhibits.editSelections")}</Link>
        <label className="block space-y-2"><span>{t("plantExhibits.intro")}</span>
          <Textarea value={intro} maxLength={10000} disabled={save.isPending}
            onChange={e => setIntroDraft(e.target.value)} data-testid="palette-intro" />
        </label>
        <div className="flex gap-2">
          <Button size="sm" disabled={introDraft === null || save.isPending} onClick={() => save.mutate({ paletteIntroText: introDraft })}>{t("plantExhibits.saveIntro")}</Button>
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ paletteIntroText: null })}>{t("plantExhibits.defaultIntro")}</Button>
        </div>
        {state}
        {!query.isError && data && (data.palette.groups.length ? data.palette.groups.map(group => <section key={group.category}>
          <h3 className="font-semibold mb-2">{t(`plantExhibits.category.${group.category}`, { defaultValue: group.category })}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{group.cards.map(card => <div key={card.id} className="rounded border p-3" data-testid="estimate-palette-card">
            {card.imagePath && card.id.startsWith("variety:") && <PlantPhoto key={`${identity}:${card.id}`} varietyKey={card.id.slice(8)} companyId={companyId} name={card.name} />}
            <p className="font-medium">{card.name}</p><p className="text-sm text-muted-foreground">{card.typeLabel}</p>
          </div>)}</div>
        </section>) : <p>{t("plantExhibits.emptyPalette")}</p>)}
      </CardContent>
    </Card>
  </div>;
}
