import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RenewDialog } from "@/components/contracts/RenewDialog";
import { BoardColumn } from "@/components/contracts/BoardColumn";
import { Skeleton } from "@/components/ui/skeleton";
import { LineBadge, RenewalChip, ReviewChip, StatusPill } from "@/components/contracts/ContractBadges";
import { dateOnly, coloradoToday, money } from "@/components/contracts/contractFormat";
import { boardColumns, priceLabel, renewalProgress, rowTerm, tableRows } from "@/components/contracts/boardLogic";
import type { BoardCard, ColumnKey, FilterChip, SortKey } from "@/components/contracts/boardLogic";
import type { BoardLine, ContractListItem } from "@/components/contracts/contractTypes";
import { contractCustomerLabel } from "@/components/contracts/parentContract";

const STORAGE_KEY = "hp-contract-center-board";
const OPEN_STORAGE_KEY = "hp-contract-center-board-open";
function readBoardOpen(): boolean {
  try { return window.localStorage.getItem(OPEN_STORAGE_KEY) !== "0"; } catch { return true; }
}
function readBoard(): BoardLine {
  try { return window.localStorage.getItem(STORAGE_KEY) === "snow" ? "snow" : "landscape"; } catch { return "landscape"; }
}
const COLUMNS: { key: ColumnKey; title: string; empty: string }[] = [
  { key: "renewal", title: "Up for renewal", empty: "Nothing due." },
  { key: "drafted", title: "Renewal drafted / sent", empty: "No renewals in progress." },
  { key: "signed", title: "Signed", empty: "Nothing signed in the last 60 days." },
  { key: "lost", title: "Lost", empty: "No contracts lost in the last 90 days." },
];
export const COMING_SOON = { title: "Coming in the next update", description: "Creating and renewing contracts arrives with the next release." };

export function ContractBoard({ items, board, q, today, onRenew, defaultOpen, onViewAllLost }: {
  items: ContractListItem[]; board: BoardLine; q: string; today: string; onComingSoon?: () => void; onRenew?: (item: ContractListItem) => void;
  defaultOpen?: boolean; onViewAllLost?: () => void;
}) {
  const [open, setOpen] = useState(() => defaultOpen ?? readBoardOpen());
  const changeOpen = (next: boolean) => {
    setOpen(next);
    try { window.localStorage.setItem(OPEN_STORAGE_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  };
  const cols = boardColumns(items, board, q, today);
  const prog = renewalProgress(items, board, q);
  const pct = prog.due ? Math.min(100, (prog.signed / prog.due) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold"
            data-testid="button-toggle-board" aria-expanded={open} aria-controls="renewals-board-body" onClick={() => changeOpen(!open)}>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />Renewals
          </button>
          <p className="text-xs whitespace-nowrap" data-testid="text-board-summary">
            {COLUMNS.map((c, index) => <span key={c.key}>
              {index > 0 && " · "}
              <span className={cols[c.key].length === 0 ? "text-muted-foreground" : undefined}>
                {cols[c.key].length} {c.key === "renewal" ? "up for renewal" : c.key === "drafted" ? "sent" : c.key}
              </span>
            </span>)}
          </p>
          {!open && q.trim() && COLUMNS.some(c => cols[c.key].length > 0) &&
            <button type="button" className="text-xs underline underline-offset-2" onClick={() => changeOpen(true)}>Show</button>}
        </div>
      <div className="w-full xl:ml-auto xl:w-64 xl:shrink-0" data-testid="renewal-progress">
        <p className="text-sm font-medium" data-testid="text-renewal-progress">{prog.signed} of {prog.due} renewals signed</p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          <div className="h-full" style={{ width: `${100 - pct}%`, backgroundColor: "color-mix(in srgb, var(--ts-waiting) 45%, transparent)" }} />
        </div>
      </div>
      </div>
      <div id="renewals-board-body" hidden={!open}>
      {open && <div className="flex gap-4 overflow-x-auto pb-2" data-testid="renewals-board">
        {COLUMNS.map(c => (
          <BoardColumn key={c.key} column={c.key} title={c.title} count={cols[c.key].length}
            footer={c.key === "lost" && onViewAllLost &&
              <button type="button" className="mt-2 text-xs underline underline-offset-2" data-testid="link-view-all-lost" onClick={onViewAllLost}>View all lost</button>}>
              {!cols[c.key].length && <p className="text-xs text-muted-foreground py-4 text-center">{c.empty}</p>}
              {cols[c.key].map(card => <BoardCardView key={`${c.key}-${card.item.id}`} card={card} board={board} onRenew={onRenew} />)}
          </BoardColumn>
        ))}
      </div>}
      </div>
    </div>
  );
}

function BoardCardView({ card, board, onRenew }: { card: BoardCard; board: BoardLine; onRenew?: (item: ContractListItem) => void }) {
  const { item, term, column } = card;
  const href = `/dashboard/contracts/${item.id}${column === "renewal" ? "" : `#term-${term.id}`}`;
  return (
    <div className="rounded-md border border-border hover:border-foreground/20 bg-background dark:bg-card shadow-sm dark:shadow-none px-3 py-2 space-y-1.5" data-testid={`card-${column}-${item.id}`}>
      <div className="flex items-center gap-2">
        <div className="font-medium text-sm truncate flex-1 min-w-0" title={contractCustomerLabel(item)} data-testid={`text-card-customer-${column}-${item.id}`}>{contractCustomerLabel(item)}</div>
        <div className="text-sm tabular-nums whitespace-nowrap">{priceLabel(item, term, money, board)}</div>
        {column === "renewal"
          ? <Button size="sm" className="h-7 min-h-0 shrink-0 px-2.5 text-xs" onClick={() => onRenew?.(item)} data-testid={`button-renew-${item.id}`}>Renew</Button>
          : <Button size="sm" variant="outline" className="h-7 min-h-0 shrink-0 px-2.5 text-xs" asChild><Link href={href} data-testid={`link-open-${column}-${item.id}`}>Open</Link></Button>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <LineBadge line={item.line} />
        <span className="text-xs text-muted-foreground">{item.form === "ours" ? "Our form" : "Their form"}</span>
        <StatusPill status={term.displayStatus} />
        {column === "drafted" && <span className="text-xs text-muted-foreground" data-testid="text-renewal-state">Renewal {term.status}</span>}
        {column === "renewal" && item.renewalDue && <RenewalChip />}
        {term.needsReview && <ReviewChip />}
        <span className="text-muted-foreground">{term.seasonLabel} · ends {dateOnly(term.endDate)}</span>
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
  { key: "lost", label: "Lost" },
];

export function ContractTable({ items, board, q, onOpen, chips: controlledChips, onChipsChange }: {
  items: ContractListItem[]; board: BoardLine; q: string; onOpen?: (id: string) => void;
  chips?: FilterChip[]; onChipsChange?: (chips: FilterChip[]) => void;
}) {
  const [sort, setSort] = useState<SortKey>("ends");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [internalChips, setInternalChips] = useState<FilterChip[]>([]);
  const chips = controlledChips ?? internalChips;
  const setChips = (next: FilterChip[]) => {
    if (controlledChips === undefined) setInternalChips(next);
    onChipsChange?.(next);
  };
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
                  <td className="p-2 font-medium">{contractCustomerLabel(i)}</td>
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
  const [chips, setChips] = useState<FilterChip[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const viewAllLost = () => {
    setChips(["lost"]);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch } = useQuery<ContractListItem[]>({ queryKey: ["/api/contract-center/contracts"], retry: false });
  const setBoard = (b: BoardLine) => { setBoardState(b); try { window.localStorage.setItem(STORAGE_KEY, b); } catch { /* storage unavailable */ } };
  const [renewTarget, setRenewTarget] = useState<{ id: string; customerName: string } | null>(null);
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
        <Button onClick={() => navigate("/dashboard/contracts/new")} data-testid="button-new-contract"><Plus className="w-4 h-4 mr-1" />New contract</Button>
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
          <ContractBoard items={data} board={board} q={q} today={today} onRenew={i => setRenewTarget({ id: i.id, customerName: i.customerName })} onViewAllLost={viewAllLost} />
          <div ref={tableRef}>
            <ContractTable items={data} board={board} q={q} chips={chips} onChipsChange={setChips} onOpen={id => navigate(`/dashboard/contracts/${id}`)} />
          </div>
        </>
      )}
      <RenewDialog target={renewTarget} onClose={() => setRenewTarget(null)} />
      <p className="text-xs text-muted-foreground"><Link href="/dashboard/contracts/old" data-testid="link-old-page">Old contracts page</Link></p>
    </div>
  );
}
