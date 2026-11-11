import { useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "wouter";
import { ArrowDown, ArrowUp, CalendarDays, Copy, GripVertical, Loader2, Play, Plus, RefreshCw, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DatePickerField } from "@/components/DatePickerField";
import CampaignContractNotice from "@/components/CampaignContractNotice";
import { format } from "date-fns";
import { parseCalendarDate } from "@/lib/schedulingStatus";
import { useToast } from "@/hooks/use-toast";
import { extractApiErrorMessage } from "@/lib/apiError";
import { useRoundActions, useRoundLists, useStandingCrews } from "@/hooks/use-round-lists";
import { buildLanes, isOpenItem, orderSelection, pacePerDay, startWarnings, stepTarget, type Lane, type RoundItem } from "@/lib/roundLists";
import type { CampaignContractState } from "../../../../../lib/db/src/campaignGenerationContracts";

interface Props {
  campaignId: string;
  contractStates?: Record<string, CampaignContractState | undefined>;
}

export default function GeneratedRoundView({ campaignId, contractStates = {} }: Props) {
  const { toast } = useToast();
  const q = useRoundLists(campaignId);
  const canManage = !!q.data?.canManage;
  const crewsQ = useStandingCrews(canManage);
  const actions = useRoundActions(campaignId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [addCrewId, setAddCrewId] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const dragIds = useRef<string[] | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dateItem, setDateItem] = useState<RoundItem | null>(null);
  const [tDate, setTDate] = useState("");
  const [bDate, setBDate] = useState("");

  const lanes = useMemo(() => buildLanes(q.data?.items ?? [], q.data?.teams ?? []), [q.data]);
  const fail = (e: unknown) => toast({ title: "Update failed", description: extractApiErrorMessage(e), variant: "destructive" });

  if (q.isError) return (
    <Card><CardContent className="p-4 space-y-2" role="alert">
      <div className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="w-4 h-4" />Couldn't load crew lists.</div>
      <Button size="sm" variant="outline" onClick={() => void q.refetch()} data-testid="button-retry-round-lists"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry</Button>
    </CardContent></Card>
  );
  if (!q.data) return <div className="space-y-3" data-testid="skeleton-round-lists"><Skeleton className="h-20" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

  const { campaign, teams, items, today } = q.data;
  const isChemical = campaign.category === "chemical";
  const total = items.length;
  const closed = items.filter(i => !isOpenItem(i)).length;
  const remaining = total - closed;
  const pct = total ? Math.round((closed / total) * 100) : 0;
  const pace = pacePerDay(remaining, today < campaign.windowStart ? campaign.windowStart : today, campaign.windowEnd);
  const warn = startWarnings(items, teams, crewsQ.data);
  const usedCrewIds = new Set(teams.map(t => t.crewId));
  const availableCrews = (crewsQ.data ?? []).filter(c => !usedCrewIds.has(c.id) && c.isActive !== false && c.active !== false);
  const busy = actions.move.isPending;

  const move = (itemIds: string[], laneKey: string, beforeItemId?: string | null) => {
    if (!itemIds.length) return;
    actions.move.mutate(
      { itemIds, assignedCampaignCrewId: laneKey === "unassigned" ? null : laneKey, ...(beforeItemId !== undefined ? { beforeItemId } : {}) },
      { onSuccess: () => setSelected(new Set()), onError: fail },
    );
  };
  const step = (lane: Lane, id: string, dir: -1 | 1) => {
    const before = stepTarget(lane.open, id, dir);
    if (before === undefined) return;
    move([id], lane.key, before);
  };
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const onDragStart = (e: DragEvent, id: string) => {
    const ids = selected.has(id) ? orderSelection(lanes, selected) : [id];
    dragIds.current = ids;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ids.join(","));
  };
  const onDrop = (e: DragEvent, laneKey: string, beforeItemId: string | null) => {
    e.preventDefault(); e.stopPropagation();
    const ids = dragIds.current ?? [];
    dragIds.current = null; setOverKey(null);
    // Dropping on the selection itself must not split/reverse the selection.
    if (beforeItemId && ids.includes(beforeItemId)) return;
    move(ids, laneKey, beforeItemId);
  };

  const openDates = (i: RoundItem) => { setDateItem(i); setTDate(i.targetDate ?? ""); setBDate(i.backupDate ?? ""); };
  const dateInvalid = !!tDate && !!bDate && bDate < tDate;

  return (
    <div className="space-y-4" data-testid="generated-round-view">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Round progress</div>
          <Progress value={pct} className="h-2 mt-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span data-testid="text-round-closed">{closed} of {total} closed</span><span>{pct}%</span>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pace needed</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" data-testid="text-round-pace">{pace == null ? (remaining ? "Past window" : "Done") : `${pace} / day`}</div>
          <div className="text-xs text-muted-foreground">{remaining} remaining, Mon–Sat through {campaign.windowEnd}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Round status</div>
          <div className="text-sm font-medium mt-1" data-testid="text-round-started">{campaign.startedAt ? `Started ${campaign.startedAt.slice(0, 10)}` : "Not started"}</div>
          <div className="text-xs text-muted-foreground">{warn.unassigned} unassigned · {teams.length} crews</div>
        </CardContent></Card>
      </div>

      {canManage && campaign.status === "active" && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="round-manage-bar">
          <Button size="sm" variant="outline" disabled={actions.copySplit.isPending} onClick={() => actions.copySplit.mutate(undefined, { onSuccess: () => toast({ title: "Previous split copied" }), onError: fail })} data-testid="button-copy-previous-split">
            <Copy className="w-4 h-4 mr-2" />Copy previous split
          </Button>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={addCrewId} onChange={e => setAddCrewId(e.target.value)} aria-label="Crew to add" data-testid="select-add-round-crew">
            <option value="">Add crew…</option>
            {availableCrews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!addCrewId || actions.addCrew.isPending} onClick={() => actions.addCrew.mutate(addCrewId, { onSuccess: () => setAddCrewId(""), onError: fail })} data-testid="button-add-round-crew">
            <Plus className="w-4 h-4 mr-1" />Add
          </Button>
          {!campaign.startedAt && (
            <Button size="sm" onClick={() => setStartOpen(true)} data-testid="button-start-round"><Play className="w-4 h-4 mr-2" />Start round</Button>
          )}
        </div>
      )}

      {canManage && selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/40 p-2 text-sm" data-testid="bar-selection">
          <span className="font-medium" data-testid="text-selected-count">{selected.size} selected</span>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={moveTarget} onChange={e => setMoveTarget(e.target.value)} aria-label="Move selected to" data-testid="select-move-target">
            <option value="">Move to…</option>
            <option value="unassigned">Unassigned</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button size="sm" disabled={!moveTarget || busy} onClick={() => move(orderSelection(lanes, selected), moveTarget)} data-testid="button-move-selected">Move (append)</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} data-testid="button-clear-selection">Clear</Button>
        </div>
      )}

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        {lanes.filter(l => l.team || l.open.length || l.closed.length || canManage).map(lane => (
          <Card key={lane.key} className={overKey === lane.key ? "ring-2 ring-primary" : ""} data-testid={`lane-round-${lane.key}`}
            onDragOver={canManage ? e => { e.preventDefault(); setOverKey(lane.key); } : undefined}
            onDragLeave={canManage ? () => setOverKey(k => (k === lane.key ? null : k)) : undefined}
            onDrop={canManage ? e => {
              const list = e.currentTarget.querySelector("ol");
              // The lane heading means prepend; whitespace below means append.
              const before = list && e.clientY < list.getBoundingClientRect().top ? lane.open[0]?.id ?? null : null;
              onDrop(e, lane.key, before);
            } : undefined}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: lane.team?.color ?? "hsl(var(--muted-foreground))" }} />
                <h3 className="font-semibold text-sm flex-1">{lane.team?.name ?? "Unassigned"}</h3>
                <Badge variant="outline" className="tabular-nums" data-testid={`text-lane-count-${lane.key}`}>{lane.open.length} open</Badge>
                {canManage && lane.open.length > 0 && (
                  <Checkbox aria-label={`Select all in ${lane.team?.name ?? "Unassigned"}`}
                    checked={lane.open.every(i => selected.has(i.id))}
                    onCheckedChange={v => setSelected(s => { const n = new Set(s); lane.open.forEach(i => (v ? n.add(i.id) : n.delete(i.id))); return n; })}
                    data-testid={`checkbox-lane-all-${lane.key}`} />
                )}
              </div>
              {lane.open.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground" data-testid={`text-lane-empty-${lane.key}`}>
                  {canManage ? "Drop or move properties here." : "Nothing left on this list."}
                </p>
              )}
              <ol className="space-y-1.5">
                {lane.open.map((item, idx) => (
                  <li key={item.id} draggable={canManage && !busy}
                    onDragStart={e => onDragStart(e, item.id)} onDragEnd={() => { dragIds.current = null; setOverKey(null); }}
                    onDragOver={canManage ? e => { e.preventDefault(); e.stopPropagation(); setOverKey(item.id); } : undefined}
                    onDrop={canManage ? e => {
                      const bounds = e.currentTarget.getBoundingClientRect();
                      const after = bounds.height > 0 && e.clientY >= bounds.top + bounds.height / 2;
                      onDrop(e, lane.key, after ? lane.open[idx + 1]?.id ?? null : item.id);
                    } : undefined}
                    className={`rounded-md border bg-card p-2 text-sm ${overKey === item.id ? "border-t-2 border-t-primary" : ""} ${selected.has(item.id) ? "bg-primary/5" : ""}`}
                    data-testid={`row-round-item-${item.id}`}>
                    <div className="flex items-start gap-2">
                      {canManage && <GripVertical className="w-4 h-4 mt-0.5 text-muted-foreground cursor-grab" aria-hidden />}
                      {canManage && <Checkbox className="mt-0.5" checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} aria-label={`Select ${item.customerName}`} data-testid={`checkbox-round-item-${item.id}`} />}
                      <span className="w-6 text-xs text-muted-foreground tabular-nums mt-0.5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <Link href={`/dashboard/campaigns/${campaignId}/items/${item.id}`} className="font-medium hover:underline truncate block" data-testid={`link-round-item-${item.id}`}>{item.customerName}</Link>
                        <div className="text-xs text-muted-foreground truncate">{item.customerAddress || item.customerCity || ""}</div>
                        {isChemical && (item.targetDate || item.backupDate) && (
                          <div className="text-xs mt-0.5 flex items-center gap-1" data-testid={`text-round-dates-${item.id}`}>
                            <CalendarDays className="w-3 h-3" />{item.targetDate ?? "—"}{item.backupDate ? ` · backup ${item.backupDate}` : ""}
                          </div>
                        )}
                        <CampaignContractNotice value={contractStates[item.id]} />
                      </div>
                      <div className="flex items-center">
                        {canManage && <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || idx === 0} onClick={() => step(lane, item.id, -1)} aria-label={`Move ${item.customerName} up`} data-testid={`button-round-up-${item.id}`}><ArrowUp className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || idx === lane.open.length - 1} onClick={() => step(lane, item.id, 1)} aria-label={`Move ${item.customerName} down`} data-testid={`button-round-down-${item.id}`}><ArrowDown className="w-3.5 h-3.5" /></Button>
                        </>}
                        {isChemical && canManage && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDates(item)} aria-label={`Edit dates for ${item.customerName}`} data-testid={`button-round-dates-${item.id}`}><CalendarDays className="w-3.5 h-3.5" /></Button>
                        )}
                        <Link href={`/dashboard/campaigns/${campaignId}/items/${item.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted" aria-label={`Open ${item.customerName}`} data-testid={`link-round-open-${item.id}`}><ChevronRight className="w-4 h-4" /></Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {lane.closed.length > 0 && (
                <details className="text-xs" data-testid={`closed-${lane.key}`}>
                  <summary className="cursor-pointer text-muted-foreground">{lane.closed.length} closed</summary>
                  <ul className="mt-1 space-y-1">
                    {lane.closed.map(i => (
                      <li key={i.id} className="flex items-center gap-2">
                        <Link href={`/dashboard/campaigns/${campaignId}/items/${i.id}`} className="flex-1 truncate hover:underline" data-testid={`link-round-closed-${i.id}`}>{i.customerName}</Link>
                        <Badge variant="secondary" className="text-[10px]">{i.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start this round?</DialogTitle>
            <DialogDescription>Crews will see their lists. No customer notifications are sent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm" data-testid="text-start-warnings">
            {warn.unassigned > 0 && <div className="flex gap-2 text-amber-700"><AlertTriangle className="w-4 h-4" />{warn.unassigned} unassigned {warn.unassigned === 1 ? "property" : "properties"}.</div>}
            {warn.unlinkedTeams.length > 0 && <div className="flex gap-2 text-amber-700"><AlertTriangle className="w-4 h-4" />{warn.unlinkedTeams.length} crew{warn.unlinkedTeams.length === 1 ? "" : "s"} without an active linked crew: {warn.unlinkedTeams.join(", ")}.</div>}
            {warn.unassigned === 0 && warn.unlinkedTeams.length === 0 && <div className="text-muted-foreground">Every property is assigned.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button disabled={actions.start.isPending} onClick={() => actions.start.mutate(undefined, { onSuccess: () => { setStartOpen(false); toast({ title: "Round started" }); }, onError: fail })} data-testid="button-confirm-start-round">
              {actions.start.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Start round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dateItem} onOpenChange={o => { if (!o) setDateItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Application dates</DialogTitle>
            <DialogDescription>{dateItem?.customerName}. Notices and other date checks are handled in the item detail.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Target date</Label><DatePickerField value={tDate ? parseCalendarDate(tDate) : undefined} onChange={d => setTDate(d ? format(d, "yyyy-MM-dd") : "")} /></div>
            <div className="space-y-1"><Label>Backup date</Label><DatePickerField value={bDate ? parseCalendarDate(bDate) : undefined} onChange={d => setBDate(d ? format(d, "yyyy-MM-dd") : "")} /></div>
          </div>
          {dateInvalid && <p className="text-xs text-destructive" data-testid="text-date-error">Backup date must be on or after the target date.</p>}
          <DialogFooter>
            {dateItem && <Link href={`/dashboard/campaigns/${campaignId}/items/${dateItem.id}`} className="mr-auto text-sm text-primary underline self-center" data-testid="link-round-date-detail">Open item detail</Link>}
            <Button variant="outline" onClick={() => setDateItem(null)}>Cancel</Button>
            <Button disabled={dateInvalid || actions.dates.isPending} onClick={() => dateItem && actions.dates.mutate({ itemId: dateItem.id, targetDate: tDate || null, backupDate: bDate || null }, { onSuccess: () => { setDateItem(null); toast({ title: "Dates saved" }); }, onError: fail })} data-testid="button-save-round-dates">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
