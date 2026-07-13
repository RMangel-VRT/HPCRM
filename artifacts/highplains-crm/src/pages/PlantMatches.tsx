import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CheckSquare, XSquare, Search, RefreshCw, Leaf, PackageOpen, ExternalLink,
  ChevronLeft, ChevronRight, AlertCircle, Sprout
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { PlantMatchQueueItem, PlantMatchStatus, PlantEnrichmentData } from "@/shared/schema";
import { PLANT_CATEGORY_LABELS } from "@/shared/schema";
import { formatDistanceToNow } from "date-fns";

type FilterTab = "pending" | "confirmed" | "rejected" | "all";

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? "text-green-700 bg-green-50 border-green-300"
    : pct >= 70 ? "text-amber-700 bg-amber-50 border-amber-300"
    : "text-muted-foreground bg-muted border-muted-foreground/30";
  return (
    <Badge variant="outline" className={`text-xs ${color}`}>
      {pct}% match
    </Badge>
  );
}

function StatusBadge({ status }: { status: PlantMatchStatus }) {
  const { t } = useTranslation();
  if (status === "confirmed") return <Badge variant="outline" className="text-green-700 bg-green-50 border-green-300 text-xs">{t("plantMatches.confirmed")}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-xs">{t("plantMatches.rejected")}</Badge>;
  if (status === "auto") return <Badge variant="secondary" className="text-xs">{t("plantMatches.auto")}</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">{t("plantMatches.unmatched")}</Badge>;
}

function FactChip({ label, value }: { label: string; value: string | boolean | null }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") {
    if (!value) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5">
      <span className="font-medium text-foreground">{label}:</span> {value}
    </span>
  );
}

function PlantMatchCard({
  item,
  isActive,
  onSelect,
  onConfirm,
  onReject,
  onPickDifferent,
  isPending,
}: {
  item: PlantMatchQueueItem;
  isActive: boolean;
  onSelect: () => void;
  onConfirm: (varietyKey: string) => void;
  onReject: (varietyKey: string) => void;
  onPickDifferent: (varietyKey: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const e = item.enrichment;
  const isActionable = e.matchStatus === "auto" || e.matchStatus === "unmatched";

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all cursor-pointer ${isActive ? "ring-2 ring-primary border-primary" : "hover:border-muted-foreground/40"}`}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(); } }}
      role="button"
      aria-pressed={isActive}
    >
      <div className="flex flex-col sm:flex-row gap-0">
        {e.imageUrl && (
          <div className="sm:w-36 sm:flex-shrink-0 bg-muted relative">
            <img
              src={e.imageUrl}
              alt={e.displayName ?? item.commonName}
              className="w-full h-32 sm:h-full object-cover"
              onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }}
            />
            {e.matchStatus === "auto" && (
              <div className="absolute top-1 left-1">
                <Badge variant="secondary" className="text-xs opacity-90 scale-90">{t("plantLibrary.unverifiedMatch")}</Badge>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="font-semibold text-sm" data-testid="text-match-common-name">{item.commonName}</span>
                <Badge variant="outline" className="text-xs">{PLANT_CATEGORY_LABELS[item.category]}</Badge>
              </div>
              {item.botanicalName && (
                <p className="text-xs text-muted-foreground italic">{item.botanicalName}</p>
              )}
            </div>
            <StatusBadge status={e.matchStatus} />
          </div>

          {e.displayName ? (
            <div className="flex items-start gap-3 p-2 bg-muted/40 rounded-md border">
              <Sprout className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{e.displayName}</span>
                  <ConfidenceBadge score={e.matchConfidence} />
                </div>
                {e.treefarmUrl && (
                  <a
                    href={e.treefarmUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary flex items-center gap-1 mt-0.5 hover:underline"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {t("plantMatches.proposedMatch")}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {e.imageAttribution && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t("plantLibrary.photoCredit")}: {e.imageAttribution}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">{t("plantMatches.noProposal")}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <FactChip label={t("plantMatches.lightLabel")} value={e.light} />
            <FactChip label={t("plantMatches.waterLabel")} value={e.waterUse} />
            <FactChip label={t("plantMatches.bloomLabel")} value={e.bloomTime} />
            <FactChip label={t("plantMatches.growthLabel")} value={e.growthRate} />
            <FactChip label={t("plantMatches.nativeLabel")} value={e.isNative} />
            <FactChip label={t("plantMatches.pollinatorLabel")} value={e.isPollinatorFriendly} />
            <FactChip label={t("plantMatches.deerLabel")} value={e.deerResistant} />
            <FactChip label={t("plantMatches.xeriscapeLabel")} value={e.isXeriscape} />
          </div>

          {isActionable && isActive && (
            <div className="flex gap-2 flex-wrap pt-1 border-t" onClick={(ev) => ev.stopPropagation()}>
              {e.displayName && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onConfirm(item.varietyKey)}
                  disabled={isPending}
                  data-testid="button-confirm-match"
                >
                  <CheckSquare className="w-4 h-4" />
                  {t("plantMatches.confirm")}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => onReject(item.varietyKey)}
                disabled={isPending}
                data-testid="button-reject-match"
              >
                <XSquare className="w-4 h-4" />
                {t("plantMatches.reject")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => onPickDifferent(item.varietyKey)}
                disabled={isPending}
                data-testid="button-pick-different"
              >
                <Search className="w-4 h-4" />
                {t("plantMatches.pickDifferent")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateSearchPanel({
  varietyKey,
  onAssign,
  onCancel,
}: {
  varietyKey: string;
  onAssign: (slug: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");

  const { data: candidates, isLoading } = useQuery<Array<{ slug: string; title: string; imageUrl: string | null; pageUrl: string }>>({
    queryKey: ["/api/plant-library/candidates", q],
    queryFn: () =>
      apiRequest("GET", `/api/plant-library/candidates?q=${encodeURIComponent(q)}`).then((r) => r.json()),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });

  return (
    <div className="border rounded-lg p-4 bg-muted/20 mt-2 flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder={t("plantMatches.searchCandidates")}
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          className="pl-9"
          data-testid="input-candidate-search"
        />
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">{t("common.loading")}</p>}
      {candidates && candidates.length > 0 && (
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="flex items-center gap-3 p-2 rounded hover:bg-muted text-left"
              onClick={() => onAssign(c.slug)}
              data-testid="button-assign-candidate"
            >
              {c.imageUrl && (
                <img src={c.imageUrl} alt={c.title} className="w-10 h-10 object-cover rounded flex-shrink-0" />
              )}
              <span className="text-sm">{c.title}</span>
            </button>
          ))}
        </div>
      )}
      {candidates && candidates.length === 0 && q.trim().length >= 2 && (
        <p className="text-xs text-muted-foreground">{t("plantMatches.noMatches")}</p>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>{t("plantMatches.cancelSearch")}</Button>
      </div>
    </div>
  );
}

export default function PlantMatches() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEnrich = user?.activeRole === "admin" || user?.activeRole === "office" || user?.isSuperAdminBool;

  const [filter, setFilter] = useState<FilterTab>("pending");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (filter === "pending") { params.set("matchStatus", "auto"); params.set("matchStatus2", "unmatched"); }
  else if (filter === "confirmed") params.set("matchStatus", "confirmed");
  else if (filter === "rejected") params.set("matchStatus", "rejected");

  const { data: items, isLoading, isError } = useQuery<PlantMatchQueueItem[]>({
    queryKey: ["/api/plant-library/matches", filter],
    queryFn: () => {
      const qs = filter === "pending"
        ? "matchStatus=auto&matchStatus=unmatched"
        : filter === "all" ? "" : `matchStatus=${filter}`;
      return apiRequest("GET", `/api/plant-library/matches?${qs}`).then((r) => r.json());
    },
    staleTime: 30_000,
  });

  const enrichMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/plant-library/enrich"),
    onSuccess: () => {
      toast({ title: t("plantMatches.enrichStarted"), description: t("plantMatches.enrichStartedDesc") });
    },
    onError: () => toast({ title: t("plantMatches.enrichFailed"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ varietyKey, data }: { varietyKey: string; data: Record<string, unknown> }) =>
      apiRequest("POST", `/api/plant-library/matches/${encodeURIComponent(varietyKey)}`, data),
    onSuccess: (_, variables) => {
      const action = variables.data.matchStatus;
      toast({
        title: action === "confirmed" ? t("plantMatches.confirmSuccess") : t("plantMatches.rejectSuccess"),
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/plant-library/matches"] });
      setActiveKey(null);
      setPickingFor(null);
    },
    onError: () => toast({ title: t("plantMatches.updateFailed"), variant: "destructive" }),
  });

  const handleConfirm = useCallback((varietyKey: string) => {
    updateMutation.mutate({ varietyKey, data: { matchStatus: "confirmed" } });
  }, [updateMutation]);

  const handleReject = useCallback((varietyKey: string) => {
    updateMutation.mutate({ varietyKey, data: { matchStatus: "rejected" } });
  }, [updateMutation]);

  const handleAssign = useCallback((varietyKey: string, slug: string) => {
    updateMutation.mutate({ varietyKey, data: { treefarmSlug: slug, matchStatus: "confirmed" } });
  }, [updateMutation]);

  useEffect(() => {
    function handleKey(ev: KeyboardEvent) {
      if (!items || items.length === 0) return;
      const idx = items.findIndex((i) => i.varietyKey === activeKey);
      if (ev.key === "ArrowDown" || ev.key === "j") {
        ev.preventDefault();
        const next = items[Math.min(idx + 1, items.length - 1)];
        if (next) setActiveKey(next.varietyKey);
      } else if (ev.key === "ArrowUp" || ev.key === "k") {
        ev.preventDefault();
        const prev = items[Math.max(idx - 1, 0)];
        if (prev) setActiveKey(prev.varietyKey);
      } else if (ev.key === "c" && activeKey) {
        const item = items.find((i) => i.varietyKey === activeKey);
        if (item && item.enrichment.displayName) handleConfirm(activeKey);
      } else if (ev.key === "r" && activeKey) {
        handleReject(activeKey);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items, activeKey, handleConfirm, handleReject]);

  const TABS: Array<{ key: FilterTab; label: string }> = [
    { key: "pending", label: t("plantMatches.filterPending") },
    { key: "confirmed", label: t("plantMatches.filterConfirmed") },
    { key: "rejected", label: t("plantMatches.filterRejected") },
    { key: "all", label: t("plantMatches.filterAll") },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Leaf className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              {t("plantMatches.title")}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm" data-testid="text-page-description">
            {t("plantMatches.description")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Keyboard: ↑/↓ navigate · <kbd className="px-1 py-0.5 bg-muted rounded text-xs">c</kbd> confirm · <kbd className="px-1 py-0.5 bg-muted rounded text-xs">r</kbd> reject
          </p>
        </div>

        {canEnrich && (
          <Button
            onClick={() => enrichMutation.mutate()}
            disabled={enrichMutation.isPending}
            data-testid="button-enrich-now"
            className="flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${enrichMutation.isPending ? "animate-spin" : ""}`} />
            {t("plantMatches.enrichNow")}
          </Button>
        )}
      </div>

      <div className="flex gap-1 mb-6 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => { setFilter(tab.key); setActiveKey(null); }}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground" data-testid="state-loading">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          {t("common.loading")}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-2 py-20 text-destructive" data-testid="state-error">
          <AlertCircle className="w-8 h-8" />
          <p>{t("plantMatches.loadError")}</p>
        </div>
      )}

      {!isLoading && !isError && items && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground" data-testid="state-empty">
          <PackageOpen className="w-10 h-10" />
          <p className="font-medium">{t("plantMatches.noMatches")}</p>
          <p className="text-sm">{t("plantMatches.noMatchesHint")}</p>
        </div>
      )}

      {!isLoading && !isError && items && items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            {t("plantMatches.showingCount", { count: items.length })}
          </p>
          <div className="flex flex-col gap-3" data-testid="list-plant-matches">
            {items.map((item) => (
              <div key={item.varietyKey}>
                <PlantMatchCard
                  item={item}
                  isActive={activeKey === item.varietyKey}
                  onSelect={() => setActiveKey((k) => k === item.varietyKey ? null : item.varietyKey)}
                  onConfirm={handleConfirm}
                  onReject={handleReject}
                  onPickDifferent={() => setPickingFor(item.varietyKey)}
                  isPending={updateMutation.isPending}
                />
                {pickingFor === item.varietyKey && activeKey === item.varietyKey && (
                  <CandidateSearchPanel
                    varietyKey={item.varietyKey}
                    onAssign={(slug) => handleAssign(item.varietyKey, slug)}
                    onCancel={() => setPickingFor(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
