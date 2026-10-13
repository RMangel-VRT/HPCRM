import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowDown, ArrowUp, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LineBadge, RenewalChip, ReviewChip, StatusPill } from "@/components/contracts/ContractBadges";
import { dateOnly, coloradoToday, money } from "@/components/contracts/contractFormat";
import { boardColumns, priceLabel, renewalProgress, rowTerm, tableRows } from "@/components/contracts/boardLogic";
import type { BoardCard, ColumnKey, FilterChip, SortKey } from "@/components/contracts/boardLogic";
import type { BoardLine, ContractListItem } from "@/components/contracts/contractTypes";

const STORAGE_KEY = "hp-contract-center-board";
function readBoard(): BoardLine {
  try { return window.localStorage.getItem(STORAGE_KEY) === "snow" ? "snow" : "landscape"; } catch { return "landscape"; }
}
const COLUMNS: { key: ColumnKey; title: string; empty: string }[] = [
  { key: "renewal", title: "Up for renewal", empty: "Nothing due." },
  { key: "drafted", title: "Renewal drafted / sent", empty: "No renewals in progress." },
  { key: "signed", title: "Signed", empty: "Nothing signed in the last 60 days." },
  { key: "lost", title: "Lost", empty: "No lost contracts this year." },
];
export const COMING_SOON = { title: "Coming in the next update", description: "Creating and renewing contracts arrives with the next release." };

export function ContractBoard({ items, board, q, today, onComingSoon }: {
  items: ContractListItem[]; board: BoardLine; q: string; today: string; onComingSoon: () => void;
}) {
  const cols = boardColumns(items, board, q, today);
  const prog = renewalProgress(items, board, q);
  const pct = prog.due ? Math.min(100, (prog.signed / prog.due) * 100) : 0;
  return (
    <div className="space-y-3">
      <div data-testid="renewal-progress">
        <p className="text-sm font-medium" data-testid="text-renewal-progress">{prog.signed} of {prog.due} renewals signed</p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          <div className="h-full" style={{ width: `${100 - pct}%`, backgroundColor: "color-mix(in srgb, var(--ts-waiting) 45%, transparent)" }} />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2" data-testid="renewals-board">
        {COLUMNS.map(c => (
          <section key={c.key} className="min-w-[17rem] flex-1 rounded-lg bg-muted/40 p-3" data-testid={`column-${c.key}`}>
            <h2 className="text-sm font-semibold mb-2">{c.title} <span className="text-muted-foreground font-normal">({cols[c.key].length})</span></h2>
            <div className="space-y-2">
              {!cols[c.key].length && <p className="text-xs text-muted-foreground py-4 text-center">{c.empty}</p>}
              {cols[c.key].map(card => <BoardCardView key={`${c.key}-${card.item.id}`} card={card} board={board} onComingSoon={onComingSoon} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardCardView({ card, board, onComingSoon }: { card: BoardCard; board: BoardLine; onComingSoon: () => void }) {
  const { item, term, column } = card;
  const href = `/dashboard/contracts/${item.id}${column === "renewal" ? "" : `#term-${term.id}`}`;
  return (
    <div className="rounded-md border bg-card p-3 space-y-2" data-testid={`card-${column}-${item.id}`}>
      <div className="font-medium text-sm" data-testid={`text-card-customer-${column}-${item.id}`}>{item.customerName}</div>
      <div className="flex flex-wrap items-center gap-2">
        <LineBadge line={item.line} />
        <span className="text-xs text-muted-foreground">{item.form === "ours" ? "Our form" : "Their form"}</span>
        <StatusPill status={term.displayStatus} />
        {column === "drafted" && <span className="text-xs text-muted-foreground" data-testid="text-renewal-state">Renewal {term.status}</span>}
        {column === "renewal" && item.renewalDue && <RenewalChip />}
        {term.needsReview && <ReviewChip />}
      </div>
      <div className="text-xs text-muted-foreground">{term.seasonLabel} · ends {dateOnly(term.endDate)}</div>
      <div className="text-sm tabular-nums">{priceLabel(item, term, money, board)}</div>
      <div className="flex justify-end">
        {column === "renewal"
          ? <Button size="sm" onClick={onComingSoon} data-testid={`button-renew-${item.id}`}>Renew</Button>
          : <Button size="sm" variant="outline" asChild><Link href={href} data-testid={`link-open-${column}-${item.id}`}>Open</Link></Button>}
      </div>
    </div>
  );
}

const HEADS: { key: SortKey; label: string }[] = [
  { key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "form", label: "Form" }, { key: "season", label: "Season" },
  { key: "status", label: "Status" }, { key: "price", label: "Annual price" }, { key: "agent", label: "Managing agent" }, { key: "ends", label: "Ends" },
];
const CHIPS: { key: FilterChip; label: string }[] = [
  { key: "review", label: "Needs review" }, { key: "renewal", label: "Up for renewal" }, { key: "expired", label: "Expired" },
];

export function ContractTable({ items, board, q, onOpen }: { items: ContractListItem[]; board: BoardLine; q: string; onOpen?: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>("ends");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const rows = tableRows(items, board, q, chips, sort, dir);
  const toggle = (k: SortKey) => { if (k === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir("asc"); } };
  return (
    <section className="space-y-3" data-testid="contracts-table">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold mr-2">All contracts</h2>
        {CHIPS.map(c => (
          <Button key={c.key} size="sm" variant={chips.includes(c.key) ? "default" : "outline"} aria-pressed={chips.includes(c.key)}
            data-testid={`chip-filter-${c.key}`} onClick={() => setChips(chips.includes(c.key) ? chips.filter(x => x !== c.key) : [...chips, c.key])}>
            {c.label}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
              {HEADS.map(h => (
                <th key={h.key} className="p-2 font-medium" aria-sort={sort === h.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggle(h.key)} data-testid={`sort-${h.key}`}>
                    {h.label}{sort === h.key && (dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground" data-testid="empty-table">No contracts match.</td></tr>}
            {rows.map(i => {
              const t = rowTerm(i);
              return (
                <tr key={i.id} className="border-t cursor-pointer hover:bg-muted/40" tabIndex={0} data-testid={`row-contract-${i.id}`}
                  onClick={() => onOpen?.(i.id)} onKeyDown={e => { if (e.key === "Enter") onOpen?.(i.id); }}>
                  <td className="p-2 font-medium">{i.customerName}</td>
                  <td className="p-2"><LineBadge line={i.line} /></td>
                  <td className="p-2">{i.form === "ours" ? "Our form" : "Their form"}</td>
                  <td className="p-2">{t?.seasonLabel ?? "\u2014"}</td>
                  <td className="p-2">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {t && <StatusPill status={t.displayStatus} />}{i.renewalDue && <RenewalChip />}{t?.needsReview && <ReviewChip />}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums">{t ? priceLabel(i, t, money, board) : "\u2014"}</td>
                  <td className="p-2">{t?.managingAgentName || "\u2014"}</td>
                  <td className="p-2">{dateOnly(t?.endDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ContractCenterPage() {
  const [board, setBoardState] = useState<BoardLine>(readBoard);
  const [q, setQ] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<ContractListItem[]>({ queryKey: ["/api/contract-center/contracts"], retry: false });
  const setBoard = (b: BoardLine) => { setBoardState(b); try { window.localStorage.setItem(STORAGE_KEY, b); } catch { /* storage unavailable */ } };
  const soon = () => toast(COMING_SOON);
  const today = data?.find(i => i.companyDay)?.companyDay ?? coloradoToday();

  return (
    <div className="space-y-6" data-testid="page-contract-center">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight mr-auto">Contracts</h1>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Board">
          {(["landscape", "snow"] as const).map(b => (
            <Button key={b} size="sm" variant={board === b ? "default" : "ghost"} aria-pressed={board === b} onClick={() => setBoard(b)} data-testid={`toggle-${b}`}>
              {b === "landscape" ? "Landscape" : "Snow"}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 w-56" placeholder="Search customer" aria-label="Search customer" value={q} onChange={e => setQ(e.target.value)} data-testid="input-search-contracts" />
        </div>
        <Button onClick={soon} data-testid="button-new-contract"><Plus className="w-4 h-4 mr-1" />New contract</Button>
      </div>
      {isLoading ? (
        <div className="space-y-3" data-testid="loading-contracts"><Skeleton className="h-6 w-64" /><div className="flex gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 flex-1" />)}</div></div>
      ) : isError || !data ? (
        <div className="rounded-md border p-8 text-center space-y-3" data-testid="error-contracts">
          <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
          <p className="text-sm">The contracts could not be loaded.</p>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-contracts">Try again</Button>
        </div>
      ) : !data.length ? (
        <div className="rounded-md border p-10 text-center space-y-2" data-testid="empty-contracts">
          <FileText className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No contracts in the Contract Center yet.</p>
          <Button variant="outline" asChild><Link href="/dashboard/contracts/old" data-testid="link-old-contracts">Open the old contracts page</Link></Button>
        </div>
      ) : (
        <>
          <ContractBoard items={data} board={board} q={q} today={today} onComingSoon={soon} />
          <ContractTable items={data} board={board} q={q} onOpen={id => navigate(`/dashboard/contracts/${id}`)} />
        </>
      )}
      <p className="text-xs text-muted-foreground"><Link href="/dashboard/contracts/old" data-testid="link-old-page">Old contracts page</Link></p>
    </div>
  );
}
