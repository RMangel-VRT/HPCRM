import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, PenLine, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LINE_TINT, type EstimateLineType } from "@/lib/estimateBuilder";
import {
  SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS, SEARCH_TYPES, groupSearchRows, idPart, pickerFetch, pickerQueryKey, pickerRows,
  type PickerRow, type SearchGroup, type SearchType,
} from "@/lib/pickerSources";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SearchHandoff { type: EstimateLineType; search?: string; rowKey?: string; name?: string; row?: PickerRow }

type Opt =
  | { kind: "row"; id: string; type: SearchType; row: PickerRow }
  | { kind: "seeAll"; id: string; type: SearchType }
  | { kind: "error"; id: string; type: SearchType }
  | { kind: "custom"; id: string };

/**
 * Section-wide search: fans out to the seven catalog pickers in parallel through the
 * shared picker helpers. The caller handles add, replace, or a typed form.
 */
export function SectionSearch({ sectionId, customerId, companyId, onOpen, preferredType, onDismiss }: {
  sectionId: string; customerId: string; companyId: string; onOpen: (h: SearchHandoff) => void;
  preferredType?: EstimateLineType; onDismiss?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const scopeKey = [user?.activeCompanyId, user?.id, user?.activeRole] as const;
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const swapping = preferredType !== undefined;
  useEffect(() => { const id = setTimeout(() => setDebounced(input.trim()), SEARCH_DEBOUNCE_MS); return () => clearTimeout(id); }, [input]);
  // Results (and handoff) exist only for the exact current text: never a previous debounced query.
  const fresh = input.trim() === debounced;
  const query = fresh && debounced.length >= SEARCH_MIN_CHARS ? debounced : "";
  const open = input.trim().length >= SEARCH_MIN_CHARS && !closed;
  const base = `section-search-${idPart(sectionId)}`;
  const listId = `${base}-list`;

  const results = useQueries({
    queries: SEARCH_TYPES.map((type) => {
      const f = { search: query, category: null, brand: null, customerId };
      return {
        queryKey: pickerQueryKey(type, scopeKey, f),
        staleTime: 30_000,
        enabled: !!query && (type !== "labor" || !!customerId),
        queryFn: ({ signal }: { signal: AbortSignal }) => pickerFetch(type, f, companyId, signal),
      };
    }),
  });

  // Projection per type; a query result whose search differs from the current one is never shown.
  const sections = SEARCH_TYPES.map((type, i) => {
    const r = results[i];
    const rows = r.data && query ? pickerRows(type, r.data, { search: query, category: null, t, lang }).rows : [];
    const groups: SearchGroup[] = groupSearchRows(type, rows, swapping ? Infinity : undefined);
    return { type, groups, error: r.isError, loading: r.isLoading && r.fetchStatus !== "idle", refetch: r.refetch };
  }).sort((a, b) => Number(b.type === preferredType) - Number(a.type === preferredType));

  const opts: Opt[] = [];
  for (const s of sections) {
    if (s.error) { opts.push({ kind: "error", id: `${base}-err-${s.type}`, type: s.type }); continue; }
    for (const g of s.groups) {
      for (const row of g.rows) opts.push({ kind: "row", id: `${base}-opt-${s.type}-${idPart(row.key)}`, type: s.type, row });
    }
    const total = s.groups.reduce((n, g) => n + g.total, 0);
    if (!swapping && total > 0) opts.push({ kind: "seeAll", id: `${base}-all-${s.type}`, type: s.type });
  }
  if (query && !swapping) opts.push({ kind: "custom", id: `${base}-custom` });
  const optIndex = useMemo(() => new Map(opts.map((o, i) => [o.id, i])), [opts.map((o) => o.id).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActive(null); }, [query]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) listRef.current?.querySelector<HTMLElement>(`[data-opt="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(o: Opt | undefined) {
    if (!o || !query) return;
    if (o.kind === "row") { if (o.row.disabled) return; onOpen({ type: o.type, search: query, rowKey: o.row.key, row: o.row }); }
    else if (o.kind === "seeAll") onOpen({ type: o.type, search: query });
    else if (o.kind === "error") { void sections.find((s) => s.type === o.type)?.refetch(); return; }
    else onOpen({ type: "custom", name: query });
    setInput(""); setDebounced(""); setClosed(true); setActive(null);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setInput(""); setDebounced(""); setClosed(true); setActive(null); onDismiss?.(); return; }
    if (!open || !opts.length || e.nativeEvent.isComposing) return;
    const eligible = opts.filter(o => o.kind !== "row" || !o.row.disabled);
    const index = eligible.findIndex(o => o.id === active);
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(eligible[Math.min(eligible.length - 1, index + 1)]?.id ?? null); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(eligible[Math.max(0, index - 1)]?.id ?? null); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const first = eligible.find(o => o.kind === "row") ?? (!anyLoading && eligible.find(o => o.kind === "custom"));
      choose(eligible[index] ?? (first || undefined));
    }
  }
  const activeId = open && active && optIndex.has(active) ? active : undefined;
  const typeLabel = (type: EstimateLineType) => t(`estimateBuilder.line.type.${type}`);
  const optCls = (id: string, extra?: string) => cn("flex cursor-pointer select-none items-start gap-2.5 border-l-2 border-l-transparent px-3 py-2 text-sm hover:bg-muted/50",
    activeId === id && "border-l-[hsl(var(--rail-active-icon))] bg-rail-hover hover:bg-rail-hover", extra);
  const anyLoading = sections.some((s) => s.loading);
  const nothing = !anyLoading && opts.every((o) => o.kind === "custom");

  return (
    <div className="relative" data-testid={`section-search-${sectionId}`} onBlur={e => {
      if (!e.currentTarget.contains(e.relatedTarget)) setClosed(true);
    }}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" autoFocus={swapping} maxLength={500} value={input} onFocus={() => setClosed(false)} onChange={(e) => { setInput(e.target.value); setClosed(false); setActive(null); }} onKeyDown={onKey}
          placeholder={t(swapping ? "estimateBuilder.lineEdit.swapSearch" : "estimateBuilder.inlineSearch.placeholder")} aria-label={t(swapping ? "estimateBuilder.lineEdit.swapSearch" : "estimateBuilder.inlineSearch.label")}
          role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={activeId}
          className="h-9 bg-background pl-8 text-[13px]" data-testid={`input-section-search-${sectionId}`} />
      </div>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-md border bg-card shadow-sm"
          onMouseDown={e => { if ((e.target as HTMLElement).closest('[role="option"]')) e.preventDefault(); }} data-testid={`panel-section-search-${sectionId}`}>
          <div id={listId} ref={listRef} role="listbox" aria-label={t("estimateBuilder.inlineSearch.results")} aria-busy={!query || anyLoading} className="max-h-[420px] overflow-y-auto">
            {!query && <div role="presentation" className="space-y-1.5 px-3 py-2" data-testid="search-pending"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-1/3" /></div>}
            {query && sections.map((s) => {
              const tint = `hsl(${LINE_TINT[s.type]})`;
              const chip = (
                <span aria-hidden className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10.5px] font-semibold uppercase tracking-wide"
                  style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}>{typeLabel(s.type)}</span>
              );
              if (s.loading) return (
                <div key={s.type} role="presentation" className="border-b px-3 py-2" data-testid={`search-loading-${s.type}`}>
                  <Skeleton className="h-4 w-1/3" />
                </div>
              );
              if (s.error) {
                const id = `${base}-err-${s.type}`;
                return (
                  <div key={s.type} role="group" aria-label={typeLabel(s.type)} className="border-b">
                    <div role="option" id={id} data-opt={id} aria-selected={activeId === id} onClick={() => choose(opts[optIndex.get(id)!])}
                      className={optCls(id, "text-xs text-destructive")} data-testid={`search-error-${s.type}`}>
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{t("estimateBuilder.inlineSearch.loadError", { type: typeLabel(s.type) })} <span className="underline">{t("estimateBuilder.picker.retry")}</span></span>
                    </div>
                  </div>
                );
              }
              if (!s.groups.length) return null;
              const allId = `${base}-all-${s.type}`;
              return (
                <div key={s.type} className="border-b" data-testid={`search-section-${s.type}`}>
                  {s.groups.map((g) => {
                    const hid = `${base}-grp-${idPart(g.id)}`;
                    return (
                      <div key={g.id} role="group" aria-labelledby={hid} data-testid={`search-group-${g.id}`}>
                        <div id={hid} role="presentation" className="bg-muted/40 px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          {typeLabel(s.type)}{g.label ? ` · ${g.label}` : ""}
                        </div>
                        {g.rows.map((r) => {
                          const id = `${base}-opt-${s.type}-${idPart(r.key)}`;
                          return (
                            <div key={r.key} id={id} data-opt={id} role="option" aria-selected={activeId === id} aria-disabled={!!r.disabled}
                              onClick={() => choose(opts[optIndex.get(id)!])} onMouseMove={() => { if (!r.disabled) setActive(id); }}
                              className={optCls(id, r.disabled ? "cursor-not-allowed opacity-70" : undefined)} data-testid={`search-option-${s.type}-${r.key}`}>
                              {chip}
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold">{r.title}</div>
                                {(r.detail || r.meta) && <div className="truncate text-xs text-muted-foreground">{[r.detail, r.meta].filter(Boolean).join(" · ")}</div>}
                                {r.warn && <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--est-warn))]"><AlertTriangle className="h-3 w-3" />{r.warn}</div>}
                                {r.disabled && <div className="mt-0.5 text-xs text-destructive" data-testid={`search-disabled-${s.type}-${r.key}`}>{r.disabled}</div>}
                              </div>
                              {r.badge && <span className="mt-0.5 shrink-0 rounded border px-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">{r.badge}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!swapping && <div id={allId} data-opt={allId} role="option" aria-selected={activeId === allId} onClick={() => choose(opts[optIndex.get(allId)!])}
                    className={optCls(allId, "py-1.5 text-xs font-medium text-[hsl(var(--rail-active-icon))]")} data-testid={`search-see-all-${s.type}`}>
                    <span>{t("estimateBuilder.inlineSearch.seeAll", { catalog: typeLabel(s.type) })}</span><ArrowRight className="mt-0.5 h-3 w-3" />
                  </div>}
                </div>
              );
            })}
            {query && nothing && <p role="presentation" className="px-3 py-3 text-xs text-muted-foreground" data-testid="search-empty">{t("estimateBuilder.inlineSearch.empty")}</p>}
            {query && !swapping && <div id={`${base}-custom`} data-opt={`${base}-custom`} role="option" aria-selected={activeId === `${base}-custom`}
              onClick={() => choose(opts[optIndex.get(`${base}-custom`)!])} className={optCls(`${base}-custom`, "text-[13px]")} data-testid="search-create-custom">
              <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>{t("estimateBuilder.inlineSearch.notInCatalog")} <span className="font-semibold">{t("estimateBuilder.inlineSearch.createCustom", { query })}</span></span>
            </div>}
          </div>
          <div className="border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground" data-testid="text-search-keyboard-hint">{t("estimateBuilder.inlineSearch.keyboard")}</div>
        </div>
      )}
    </div>
  );
}
