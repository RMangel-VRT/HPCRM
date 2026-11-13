import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, FileText, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RenewDialog } from "@/components/contracts/RenewDialog";
import { NotRenewingDialog } from "@/components/contracts/NotRenewingDialog";
import { NonRenewalChip } from "@/components/contracts/NonRenewalChip";
import { useTranslation } from "react-i18next";
import { BoardColumn } from "@/components/contracts/BoardColumn";
import { Skeleton } from "@/components/ui/skeleton";
import { LineBadge, MissingDocChip, RenewalChip, ReviewChip, StateChip, StatusPill } from "@/components/contracts/ContractBadges";
import { dateOnly, coloradoToday, money } from "@/components/contracts/contractFormat";
import { COLUMN_SEGMENT, boardColumns, priceLabel, renewalProgress, rowForm, rowLine, rowTerm, tableRows } from "@/components/contracts/boardLogic";
import { termForm, termLine } from "@/components/contracts/contractTypes";
import type { BoardCard, ColumnKey, FilterChip, SortKey } from "@/components/contracts/boardLogic";
import type { BoardLine, ContractListItem } from "@/components/contracts/contractTypes";
import { contractCustomerLabel } from "@/components/contracts/parentContract";
import { ContractViewSwitch } from "@/components/contracts/ContractViewSwitch";
import { AccountingBar, MarkSignedDialog } from "@/components/contracts/AttentionWidgets";
import { ATTENTION_KEY, STATE_TONE, contractNeedsAction, hasMissingDoc, isAttention, itemState, stateReasonText } from "@/components/contracts/contractAttention";
import type { AttentionResponse, ContractSegment } from "@/components/contracts/contractAttention";

const STORAGE_KEY = "hp-contract-center-board";
const OPEN_STORAGE_KEY = "hp-contract-center-board-open";
function readBoardOpen(): boolean {
  try { return window.localStorage.getItem(OPEN_STORAGE_KEY) !== "0"; } catch { return true; }
}
function readBoard(): BoardLine {
  try { return window.localStorage.getItem(STORAGE_KEY) === "snow" ? "snow" : "landscape"; } catch { return "landscape"; }
}
const COLUMNS: ColumnKey[] = ["decision", "renewal", "drafted"];
export const COMING_SOON = { title: "Coming in the next update", description: "Creating and renewing contracts arrives with the next release." };
export type MarkSignedTarget = { termId: string; customerName: string; seasonLabel?: string };

export function ContractBoard({ items, board, q, today, onRenew, onNotRenewing, onMarkSigned, defaultOpen, segment }: {
  items: ContractListItem[]; board: BoardLine; q: string; today: string; onComingSoon?: () => void; onRenew?: (item: ContractListItem) => void;
  defaultOpen?: boolean; onNotRenewing?: (item: ContractListItem) => void; onMarkSigned?: (target: MarkSignedTarget) => void;
  segment?: ContractSegment | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => defaultOpen ?? readBoardOpen());
  const changeOpen = (next: boolean) => {
    setOpen(next);
    try { window.localStorage.setItem(OPEN_STORAGE_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  };
  const cols = boardColumns(items, board, q);
  const prog = renewalProgress(items, board, q);
  const pct = prog.due ? Math.min(100, (prog.signed / prog.due) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold"
            data-testid="button-toggle-board" aria-expanded={open} aria-controls="renewals-board-body" onClick={() => changeOpen(!open)}>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />{t("contractAttention.pipeline")}
          </button>
          <p className="text-xs whitespace-nowrap" data-testid="text-board-summary">
            {COLUMNS.map((c, index) => <span key={c}>
              {index > 0 && " · "}
              <span className={cols[c].length === 0 ? "text-muted-foreground" : undefined}>
                {t(`contractAttention.summary.${c}`, { count: cols[c].length })}
              </span>
            </span>)}
          </p>
          {!open && q.trim() && COLUMNS.some(c => cols[c].length > 0) &&
            <button type="button" className="text-xs underline underline-offset-2" onClick={() => changeOpen(true)}>{t("contractAttention.show")}</button>}
        </div>
        <div className="w-full xl:ml-auto xl:w-64 xl:shrink-0" data-testid="renewal-progress">
          <p className="text-sm font-medium" data-testid="text-renewal-progress">{t("contractAttention.progress", { signed: prog.signed, due: prog.due })}</p>
          <p className="text-xs text-muted-foreground" data-testid="text-non-renewal-progress">{t("nonRenewal.progress", { renewed: prog.signed, count: prog.notRenewing })}</p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            <div className="h-full" style={{ width: `${100 - pct}%`, backgroundColor: "color-mix(in srgb, var(--ts-waiting) 45%, transparent)" }} />
          </div>
        </div>
      </div>
      <div id="renewals-board-body" hidden={!open}>
        {open && <div className="grid min-w-0 gap-4 pb-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 17rem), 1fr))" }} data-testid="renewals-board">
          {COLUMNS.map(c => (
            <BoardColumn key={c} column={c} title={t(`contractAttention.column.${c}`)} count={cols[c].length}
              dimmed={!!segment && COLUMN_SEGMENT[c] !== segment}>
              {!cols[c].length && <p className="text-xs text-muted-foreground py-4 text-center">{t(`contractAttention.empty.${c}`)}</p>}
              {cols[c].map(card => <BoardCardView key={`${c}-${card.item.id}`} card={card} board={board} today={today}
                onRenew={onRenew} onNotRenewing={onNotRenewing} onMarkSigned={onMarkSigned} />)}
            </BoardColumn>
          ))}
        </div>}
      </div>
    </div>
  );
}

const small = "h-7 min-h-0 shrink-0 px-2.5 text-xs";
function BoardCardView({ card, board, today, onRenew, onNotRenewing, onMarkSigned }: {
  card: BoardCard; board: BoardLine; today: string; onRenew?: (item: ContractListItem) => void; onNotRenewing?: (item: ContractListItem) => void;
  onMarkSigned?: (target: MarkSignedTarget) => void;
}) {
  const { t } = useTranslation();
  const { item, term, column } = card;
  const state = itemState(item);
  const allowed = item.allowedActions;
  const href = `/dashboard/contracts/${item.id}${term ? `#term-${term.id}` : ""}`;
  // Server-permitted actions only; older payloads keep the previous column defaults.
  const canSign = !!allowed?.includes("mark_signed") && !!item.actionTermId;
  const canRenew = allowed ? allowed.includes("renew") : column === "renewal";
  const canNR = allowed ? allowed.includes("not_renewing") : column === "renewal" && !!item.canRecordNonRenewal;
  const openLink = (primary: boolean) => <Button size="sm" variant={primary ? "outline" : "ghost"} className={small} asChild>
    <Link href={href} data-testid={`link-open-${column}-${item.id}`}>{t("contractAttention.open")}</Link></Button>;
  const primary = canSign
    ? <Button size="sm" className={small} data-testid={`button-mark-signed-${item.id}`}
        onClick={() => onMarkSigned?.({ termId: item.actionTermId!, customerName: item.customerName, seasonLabel: term?.seasonLabel })}>{t("contractAttention.markSigned")}</Button>
    : canRenew ? <Button size="sm" className={small} onClick={() => onRenew?.(item)} data-testid={`button-renew-${item.id}`}>{t("contractAttention.renew")}</Button>
    : openLink(true);
  const secondary = (canSign || canRenew) || canNR;
  return (
    <div className="rounded-md border border-border hover:border-foreground/20 bg-background dark:bg-card shadow-sm dark:shadow-none px-3 py-2 space-y-1.5"
      data-testid={`card-${column}-${item.id}`} data-state={state}>
      <div className="flex items-center gap-2">
        <div className="font-medium text-sm truncate flex-1 min-w-0" title={contractCustomerLabel(item)} data-testid={`text-card-customer-${column}-${item.id}`}>{contractCustomerLabel(item)}</div>
        <div className="text-sm tabular-nums whitespace-nowrap">{term ? priceLabel(item, term, money, board) : "\u2014"}</div>
        {primary}
      </div>
      {secondary && <div className="flex flex-wrap gap-1.5">
        {canNR && <Button size="sm" variant="outline" className={small} onClick={() => onNotRenewing?.(item)} data-testid={`button-not-renewing-${item.id}`}>{t("nonRenewal.notRenewing")}</Button>}
        {(canSign || canRenew) && openLink(false)}
      </div>}
      <p className="border-l-[3px] pl-1.5 text-xs" style={{ borderColor: STATE_TONE[state] }} data-testid={`text-card-reason-${item.id}`}>
        {stateReasonText(t, state, term, item.stateSince, today, item.stateReason)}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <LineBadge line={termLine(term, item.line)} />
        <span className="text-xs text-muted-foreground">{termForm(term, item.form) === "ours" ? "Our form" : "Their form"}</span>
        {term && <StatusPill status={term.displayStatus} />}
        {item.notRenewing && <NonRenewalChip />}
        {state === "unclassified" && <StateChip state={state} />}
        {column === "renewal" && <RenewalChip />}
        {term?.needsReview && <ReviewChip />}
        {hasMissingDoc(item) && <MissingDocChip />}
        {term && <span className="text-muted-foreground">{term.seasonLabel} · ends {dateOnly(term.endDate)}</span>}
      </div>
    </div>
  );
}

const HEADS: { key: SortKey; label: string }[] = [
  { key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "form", label: "Form" }, { key: "season", label: "Season" },
  { key: "status", label: "Status" }, { key: "price", label: "Annual price" }, { key: "agent", label: "Managing agent" }, { key: "ends", label: "Ends" },
];
const CHIPS: FilterChip[] = ["review", "renewal", "expired", "lost", "signed", "nodoc"];

export function ContractTable({ items, board, q, onOpen, chips: controlledChips, onChipsChange, segment, onClearSegment, today }: {
  items: ContractListItem[]; board: BoardLine; q: string; onOpen?: (id: string) => void;
  chips?: FilterChip[]; onChipsChange?: (chips: FilterChip[]) => void;
  segment?: ContractSegment | null; onClearSegment?: () => void; today?: string;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<SortKey>("ends");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [internalChips, setInternalChips] = useState<FilterChip[]>([]);
  const chips = controlledChips ?? internalChips;
  const setChips = (next: FilterChip[]) => {
    if (controlledChips === undefined) setInternalChips(next);
    onChipsChange?.(next);
  };
  const rows = tableRows(items, board, q, chips, sort, dir, { segment, today });
  const toggle = (k: SortKey) => { if (k === sort) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir("asc"); } };
  return (
    <section className="space-y-3" data-testid="contracts-table">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold mr-2">All contracts</h2>
        {segment && <Button size="sm" onClick={onClearSegment} data-testid="chip-showing-segment" aria-label={t("contractAttention.clearShowing", { segment: t(`contractAttention.segment.${segment}`) })}>
          {t("contractAttention.showing", { segment: t(`contractAttention.segment.${segment}`) })}<X className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Button>}
        {CHIPS.map(c => (
          <Button key={c} size="sm" variant={chips.includes(c) ? "default" : "outline"} aria-pressed={chips.includes(c)}
            data-testid={`chip-filter-${c}`} onClick={() => setChips(chips.includes(c) ? chips.filter(x => x !== c) : [...chips, c])}>
            {t(`contractAttention.chip.${c}`)}
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
              const tm = rowTerm(i);
              const state = itemState(i);
              return (
                <tr key={i.id} className="border-t cursor-pointer hover:bg-muted/40" tabIndex={0} data-testid={`row-contract-${i.id}`}
                  onClick={() => onOpen?.(i.id)} onKeyDown={e => { if (e.key === "Enter") onOpen?.(i.id); }}>
                  <td className="p-2 font-medium">{contractCustomerLabel(i)}</td>
                  <td className="p-2"><LineBadge line={rowLine(i)} /></td>
                  <td className="p-2">{rowForm(i) === "ours" ? "Our form" : "Their form"}</td>
                  <td className="p-2">{tm?.seasonLabel ?? "\u2014"}</td>
                  <td className="p-2">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {tm && <StatusPill status={tm.displayStatus} />}
                      {i.notRenewing ? <NonRenewalChip /> : state === "renewal_due" && <RenewalChip />}
                      {tm?.needsReview && <ReviewChip />}
                      {contractNeedsAction(state) && state !== "renewal_due" && <StateChip state={state} />}
                      {hasMissingDoc(i) && <MissingDocChip />}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums">{tm ? priceLabel(i, tm, money, board) : "\u2014"}</td>
                  <td className="p-2">{tm?.managingAgentName || "\u2014"}</td>
                  <td className="p-2">{dateOnly(tm?.endDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const lineBadgeStyle = { backgroundColor: "color-mix(in srgb, var(--ts-lost) 14%, transparent)", borderColor: "color-mix(in srgb, var(--ts-lost) 40%, transparent)" };

export default function ContractCenterPage() {
  const { t } = useTranslation();
  const [board, setBoardState] = useState<BoardLine>(readBoard);
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [segment, setSegment] = useState<ContractSegment | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const viewAllLost = () => {
    setSegment("closed");
    setChips([]);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch } = useQuery<ContractListItem[]>({ queryKey: ["/api/contract-center/contracts"], retry: false, staleTime: 30_000, refetchOnWindowFocus: true });
  const attentionQuery = useQuery<AttentionResponse>({ queryKey: [ATTENTION_KEY], retry: false, staleTime: 30_000, refetchOnWindowFocus: true });
  const attention = isAttention(attentionQuery.data) ? attentionQuery.data : null;
  const setBoard = (b: BoardLine) => { setBoardState(b); try { window.localStorage.setItem(STORAGE_KEY, b); } catch { /* storage unavailable */ } };
  const [renewTarget, setRenewTarget] = useState<{ id: string; customerName: string } | null>(null);
  const [nonRenewalTarget, setNonRenewalTarget] = useState<{ id: string; customerName: string } | null>(null);
  const [signTarget, setSignTarget] = useState<MarkSignedTarget | null>(null);
  const list = Array.isArray(data) ? data : null;
  const today = list?.find(i => i.companyDay)?.companyDay ?? coloradoToday();
  // Accounting totals come only from the attention endpoint; the bounded list never stands in for them.
  const lineData = (b: BoardLine) => attention?.lines?.[b] ?? null;

  return (
    <div className="space-y-6" data-testid="page-contract-center">
      <ContractViewSwitch active="contracts" noContract={attention?.flagged?.active_no_contract} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight mr-auto">Contracts</h1>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Board">
          {(["landscape", "snow"] as const).map(b => {
            const n = lineData(b)?.actionNeeded ?? 0;
            return (
              <Button key={b} size="sm" variant={board === b ? "default" : "ghost"} aria-pressed={board === b} onClick={() => setBoard(b)} data-testid={`toggle-${b}`}
                aria-label={n ? `${b === "landscape" ? "Landscape" : "Snow"}, ${t("contractAttention.needAction", { count: n })}` : undefined}>
                {b === "landscape" ? "Landscape" : "Snow"}
                {n > 0 && <span className="ml-1.5 rounded-full border px-1.5 text-[11px] font-semibold text-foreground tabular-nums" style={lineBadgeStyle}
                  data-testid={`badge-action-${b}`}>{n}</span>}
              </Button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 w-full sm:w-56" placeholder="Search customer" aria-label="Search customer" value={q} onChange={e => setQ(e.target.value)} data-testid="input-search-contracts" />
        </div>
        <Button onClick={() => navigate("/dashboard/contracts/new")} data-testid="button-new-contract"><Plus className="w-4 h-4 mr-1" />New contract</Button>
      </div>
      {isLoading ? (
        <div className="space-y-3" data-testid="loading-contracts"><Skeleton className="h-16 w-full" /><Skeleton className="h-6 w-64" /><div className="flex gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48 flex-1" />)}</div></div>
      ) : isError || !list ? (
        <div className="rounded-md border p-8 text-center space-y-3" data-testid="error-contracts">
          <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
          <p className="text-sm">The contracts could not be loaded.</p>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-contracts">Try again</Button>
        </div>
      ) : !list.length ? (
        <div className="rounded-md border p-10 text-center space-y-2" data-testid="empty-contracts">
          <FileText className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No contracts in the Contract Center yet.</p>
          <Button variant="outline" asChild><Link href="/dashboard/contracts/old" data-testid="link-old-contracts">Open the old contracts page</Link></Button>
        </div>
      ) : (
        <>
          {lineData(board) ? <AccountingBar board={board} line={lineData(board)!} segment={segment} onSegment={setSegment}
            footer={<button type="button" className="text-xs underline underline-offset-2" data-testid="link-view-all-lost" onClick={viewAllLost}>{t("contractAttention.viewAllLost")}</button>} />
          : attentionQuery.isLoading ? <Skeleton className="h-20 w-full" data-testid="loading-accounting" />
          : <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-sm" role="alert" data-testid="error-accounting">
              <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
              <span>{t("contractAttention.accountingError")}</span>
              <Button size="sm" variant="outline" onClick={() => attentionQuery.refetch()} data-testid="button-retry-accounting">{t("contractAttention.retry")}</Button>
            </div>}
          <ContractBoard items={list} board={board} q={q} today={today} segment={segment}
            onRenew={i => setRenewTarget({ id: i.id, customerName: i.customerName })}
            onNotRenewing={i => setNonRenewalTarget({ id: i.id, customerName: i.customerName })}
            onMarkSigned={setSignTarget} />
          <div ref={tableRef}>
            <ContractTable items={list} board={board} q={q} chips={chips} onChipsChange={setChips} today={today}
              segment={segment} onClearSegment={() => setSegment(null)} onOpen={id => navigate(`/dashboard/contracts/${id}`)} />
          </div>
        </>
      )}
      <RenewDialog target={renewTarget} onClose={() => setRenewTarget(null)} />
      <NotRenewingDialog target={nonRenewalTarget} onClose={() => setNonRenewalTarget(null)} />
      <MarkSignedDialog target={signTarget} onClose={() => setSignTarget(null)} />
      <p className="text-xs text-muted-foreground"><Link href="/dashboard/contracts/old" data-testid="link-old-page">Old contracts page</Link></p>
    </div>
  );
}
