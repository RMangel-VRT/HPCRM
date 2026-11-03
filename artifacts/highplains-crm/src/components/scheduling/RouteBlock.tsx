import { useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtHours, type EnrichedVisit } from "@/lib/scheduling";
import { isSlid, routeServiceLabel, serviceColorVar, type RouteBlock as Block } from "@/lib/routes";

/**
 * One non-draggable block per crew, date and service. It is deliberately not registered with
 * dnd-kit: neither draggable nor droppable, so ticket DnD around it is unaffected.
 */
export function RouteBlock({ block, onMove, onSkip }: { block: Block; onMove: (v: EnrichedVisit) => void; onSkip: (v: EnrichedVisit) => void }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const id = `${block.crewId}-${block.date}-${block.serviceKey}`;
  const n = block.visits.length;
  return (
    <div className="sb-route" style={{ "--svc": serviceColorVar(block.serviceKey) } as CSSProperties} data-slid={block.slid} data-testid={`route-block-${id}`}>
      <button type="button" className="sb-route-head" aria-expanded={open} aria-controls={`route-list-${id}`} onClick={() => setOpen(o => !o)} data-testid={`button-route-block-${id}`}>
        <span className="min-w-0 flex-1 truncate">
          <span className="sb-route-name">{routeServiceLabel(block.serviceKey)} route</span>
          <span className="tabular-nums text-muted-foreground"> · {n} {n === 1 ? "stop" : "stops"} · {fmtHours(block.hours)} h</span>
          {block.slid && <span className="text-muted-foreground" data-testid={`text-route-slid-${id}`}> · slid</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ol id={`route-list-${id}`} className="sb-route-list" data-testid={`list-route-${id}`}>
          {block.visits.map((v, i) => (
            <li key={v.id} data-testid={`route-stop-${v.id}`}>
              <span className="font-mono text-[10.5px] text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{v.customer?.name ?? v.title ?? "Stop"}</span>
              {isSlid(v) && <span className="text-[10px] text-muted-foreground">slid</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" aria-label="Stop actions" data-testid={`button-route-stop-menu-${v.id}`}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {v.status === "planned" && <DropdownMenuItem onSelect={() => onMove(v)} data-testid={`menu-route-move-${v.id}`}>Move…</DropdownMenuItem>}
                  {v.status === "planned" && <DropdownMenuItem className="sb-danger" onSelect={() => onSkip(v)} data-testid={`menu-route-skip-${v.id}`}>Skip this visit</DropdownMenuItem>}
                  {v.customerId && <DropdownMenuItem onSelect={() => navigate(`/dashboard/customers/${v.customerId}`)} data-testid={`menu-route-property-${v.id}`}>Open property</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
