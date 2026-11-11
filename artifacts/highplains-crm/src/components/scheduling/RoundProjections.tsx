import { useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { ChevronDown, FlaskConical, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoundCalendar } from "@/hooks/use-round-lists";
import { windowSpan, type RoundCalendar } from "@/lib/roundLists";

interface Lane { id: string; name: string; color: string }

/** Read-only round windows and chemical target dates. Never counts toward visit capacity; not draggable. */
export function RoundProjectionsView({ data: raw, days, crews, today }: { data: RoundCalendar; days: string[]; crews: Lane[]; today: string }) {
  const data: RoundCalendar = { rounds: Array.isArray(raw?.rounds) ? raw.rounds : [], chemicalItems: Array.isArray(raw?.chemicalItems) ? raw.chemicalItems : [] };
  const lanes = crews.filter(c => data.rounds.some(r => r.teams.some(t => t.crewId === c.id)) || data.chemicalItems.some(i => i.crewId === c.id));
  const unassignedRounds = data.rounds.filter(r => r.unassigned > 0);
  const unlanedChem = data.chemicalItems.filter(i => !i.crewId || !lanes.some(l => l.id === i.crewId));
  const grid = { gridTemplateColumns: `220px repeat(${days.length}, minmax(156px, 1fr))`, minWidth: 232 + days.length * 156 } as CSSProperties;
  const chemCard = (i: RoundCalendar["chemicalItems"][number]) => (
    <Link key={i.id} href={`/dashboard/campaigns/${i.campaignId}/items/${i.id}`}
      className="block truncate rounded border border-dashed bg-card px-1.5 py-0.5 text-[11px] hover:bg-muted" data-testid={`card-chem-target-${i.id}`}
      title={i.backupDate ? `Backup ${i.backupDate}` : undefined}>
      <FlaskConical className="mr-1 inline h-3 w-3" aria-hidden />{i.customerName}
    </Link>
  );
  if (!data.rounds.length && !data.chemicalItems.length) {
    return <p className="p-3 text-sm text-muted-foreground" data-testid="text-no-round-projections">No rounds or chemical target dates this week.</p>;
  }
  return (
    <div className="overflow-x-auto" data-testid="round-projections">
      {unassignedRounds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs" data-testid="queue-unassigned-rounds">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">Unassigned rounds</span>
          {unassignedRounds.map(r => (
            <Link key={r.id} href={`/dashboard/campaigns/${r.id}`} className="rounded-full border px-2 py-0.5 hover:bg-muted" data-testid={`link-unassigned-round-${r.id}`}>
              {r.title} · {r.unassigned} unassigned
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-px text-xs" style={grid}>
        {[...lanes.map(l => ({ ...l, unassigned: false })), ...(unlanedChem.length || data.rounds.length ? [{ id: "__none", name: "Rounds / no crew", color: "hsl(var(--muted-foreground))", unassigned: true }] : [])].map(lane => {
          const rounds = lane.unassigned ? data.rounds.filter(r => !r.teams.some(t => t.crewId && lanes.some(l => l.id === t.crewId))) : data.rounds.filter(r => r.teams.some(t => t.crewId === lane.id));
          const chem = lane.unassigned ? unlanedChem : data.chemicalItems.filter(i => i.crewId === lane.id);
          if (lane.unassigned && !rounds.length && !chem.length) return null;
          return (
            <div key={lane.id} className="contents" data-testid={`projection-lane-${lane.id}`}>
              <div className="flex items-center gap-2 px-3 py-1 font-medium" style={{ gridColumn: 1 }}>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: lane.color }} />{lane.name}
              </div>
              {rounds.map((r, ri) => {
                const sp = windowSpan(days, r.windowStart, r.windowEnd);
                if (!sp) return null;
                return (
                  <Link key={r.id} href={`/dashboard/campaigns/${r.id}`} style={{ gridColumn: `${sp.col + 1} / span ${sp.span}`, gridRow: "auto" }}
                    className="truncate rounded-sm border-l-4 bg-muted/60 px-2 py-0.5 hover:bg-muted" data-testid={`bar-round-${r.id}-${lane.id}`} data-row={ri}>
                    <Layers className="mr-1 inline h-3 w-3" aria-hidden />{r.title} · {r.remaining} left{r.startedAt ? "" : " · not started"}
                  </Link>
                );
              })}
              {chem.length > 0 && (
                <>
                  <div style={{ gridColumn: 1 }} />
                  {days.map((d, di) => (
                    <div key={d} style={{ gridColumn: di + 2 }} className={`space-y-0.5 ${d === today ? "bg-primary/5" : ""}`} data-testid={`chem-cell-${lane.id}-${d}`}>
                      {chem.filter(i => i.targetDate?.slice(0, 10) === d).map(chemCard)}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoundProjections({ days, crews, today }: { days: string[]; crews: Lane[]; today: string }) {
  const [open, setOpen] = useState(true);
  const q = useRoundCalendar(days[0], days[days.length - 1]);
  return (
    <section className="rounded-md border bg-card/60 mx-3 mb-2" data-print-hide data-testid="panel-round-projections">
      <Button variant="ghost" className="w-full justify-between" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="button-toggle-round-projections">
        <span className="text-sm">Campaign rounds <span className="text-muted-foreground">(not counted in capacity)</span></span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (q.isError ? (
        <div className="flex items-center gap-2 p-3 text-sm" role="alert">
          Couldn't load rounds.
          <Button size="sm" variant="outline" onClick={() => void q.refetch()} data-testid="button-retry-round-projections"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
        </div>
      ) : !q.data ? <div className="p-3"><Skeleton className="h-10" /></div>
        : <RoundProjectionsView data={q.data} days={days} crews={crews} today={today} />)}
    </section>
  );
}
