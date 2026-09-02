import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { TicketStatusPill, TicketTypeBadge, ticketHue } from "@/components/TicketIdentity";

type QueueBand = "overdue" | "today" | "week";
type QueueSource =
  | "pending_invoice"
  | "ready_for_billing"
  | "stale_proposal"
  | "blocked_rfp"
  | "unassigned_request"
  | "comm_draft"
  | "comm_followup"
  | "contract_renewal";

interface QueueType {
  name: string;
  typeKey: string | null;
}

interface QueueStatus {
  name: string;
  statusKey: string | null;
  actionType: "needs_action" | "waiting" | null;
  isFinal: "true" | "false" | null;
}

interface ActionQueueItem {
  id: string;
  source: QueueSource;
  band: QueueBand;
  href: string;
  customerName: string | null;
  headline: string;
  ageDays: number;
  verb: string;
  amountCents: number | null;
  ticketType: QueueType | null;
  ticketStatus: QueueStatus | null;
  parentTicketId: string | null;
}

interface ActionQueueResponse {
  items: ActionQueueItem[];
  total: number;
  byFilter: {
    billing: number;
    communications: number;
    estimates: number;
    contracts: number;
    flags: number;
  };
}

type QueueFilter = "all" | "billing" | "communications" | "estimates" | "contracts" | "flags";

const FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "billing", label: "Billing" },
  { key: "communications", label: "Communications" },
  { key: "estimates", label: "Estimates" },
  { key: "contracts", label: "Contracts" },
  { key: "flags", label: "Flags" },
];

const BANDS: Array<{ key: QueueBand; label: string }> = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
];

const FALLBACK_TYPE_BY_SOURCE: Partial<Record<QueueSource, QueueType>> = {
  comm_draft: { name: "Communication", typeKey: null },
  comm_followup: { name: "Communication", typeKey: null },
  contract_renewal: { name: "Contract", typeKey: null },
};

const FALLBACK_STATUS: QueueStatus = {
  name: "Needs action",
  statusKey: null,
  actionType: "needs_action",
  isFinal: "false",
};

function filterForSource(source: QueueSource): Exclude<QueueFilter, "all"> {
  if (source === "pending_invoice" || source === "ready_for_billing") return "billing";
  if (source === "comm_draft" || source === "comm_followup") return "communications";
  if (source === "stale_proposal" || source === "blocked_rfp" || source === "unassigned_request") return "estimates";
  if (source === "contract_renewal") return "contracts";
  return "flags";
}

function ageLabel(ageDays: number): string {
  return `${ageDays}d`;
}

function QueueRow({
  item,
  parent,
}: {
  item: ActionQueueItem;
  parent: ActionQueueItem | undefined;
}) {
  const type = item.ticketType ?? FALLBACK_TYPE_BY_SOURCE[item.source] ?? { name: "Flag", typeKey: null };
  const inheritedType = parent?.ticketType ?? type;
  const status = item.ticketStatus ?? FALLBACK_STATUS;
  const hue = ticketHue(inheritedType);
  const isNested = item.parentTicketId !== null;

  return (
    <div className={isNested ? "relative ml-7 before:absolute before:-left-4 before:top-0 before:h-1/2 before:w-4 before:border-b before:border-l before:border-border" : undefined}>
      <div
        className="group grid min-h-[66px] grid-cols-[3px_auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border py-3 transition-colors hover:bg-muted/35 max-sm:grid-cols-[3px_auto_minmax(0,1fr)]"
        data-testid={`needs-you-row-${item.id}`}
      >
        <span className="h-full min-h-[42px] w-[3px]" style={{ backgroundColor: hue }} aria-hidden="true" />
        <TicketTypeBadge
          type={type}
          hueType={parent?.ticketType}
          testId={`needs-you-type-${item.id}`}
        />
        <div className="min-w-0">
          {item.customerName && (
            <p className="truncate text-sm font-semibold" data-testid={`needs-you-customer-${item.id}`}>
              {item.customerName}
            </p>
          )}
          <p className="truncate text-sm text-muted-foreground" title={item.headline} data-testid={`needs-you-headline-${item.id}`}>
            {item.headline}
          </p>
        </div>
        <div className="flex items-center gap-2 max-sm:col-start-3 max-sm:row-start-2 max-sm:justify-self-start">
          <TicketStatusPill status={status} testId={`needs-you-status-${item.id}`} />
          <span className="font-mono text-xs text-muted-foreground" data-testid={`needs-you-age-${item.id}`}>
            {ageLabel(item.ageDays)}
          </span>
        </div>
        <Button
          asChild
          size="sm"
          variant={item.band === "overdue" ? "default" : "outline"}
          className="h-8 shrink-0 px-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-sm:col-start-3 max-sm:row-start-1"
          data-testid={`needs-you-action-${item.id}`}
        >
          <Link href={item.href}>{item.verb}</Link>
        </Button>
      </div>
    </div>
  );
}

function QueueBandSection({
  band,
  items,
  allItems,
  expanded,
  onExpand,
}: {
  band: (typeof BANDS)[number];
  items: ActionQueueItem[];
  allItems: ActionQueueItem[];
  expanded: boolean;
  onExpand: () => void;
}) {
  if (items.length === 0) return null;

  const visibleItems = band.key === "week" && !expanded ? items.slice(0, 3) : items;
  const hiddenCount = items.length - visibleItems.length;
  const itemById = new Map(allItems.map((item) => [item.id, item]));

  return (
    <section aria-labelledby={`needs-you-${band.key}-heading`} data-testid={`needs-you-band-${band.key}`}>
      <div className={`flex items-center gap-2 border-b pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] ${band.key === "overdue" ? "border-destructive text-destructive" : "border-foreground text-muted-foreground"}`}>
        <h3 id={`needs-you-${band.key}-heading`}>{band.label}</h3>
        <span className="font-mono text-[10px]" data-testid={`needs-you-band-count-${band.key}`}>{items.length}</span>
      </div>
      <div id={`needs-you-${band.key}-rows`}>
        {visibleItems.map((item) => (
          <QueueRow
            key={`${item.source}-${item.id}`}
            item={item}
            parent={item.parentTicketId ? itemById.get(item.parentTicketId) : undefined}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-controls={`needs-you-${band.key}-rows`}
          className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid="needs-you-expand-week"
        >
          + {hiddenCount} more this week
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  );
}

export default function NeedsYouQueue() {
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [weekExpanded, setWeekExpanded] = useState(false);
  const { data, error, isLoading, refetch } = useQuery<ActionQueueResponse>({
    queryKey: ["/api/dashboard/action-queue"],
  });

  const items = data?.items ?? [];
  const filteredItems = useMemo(
    () =>
      activeFilter === "all"
        ? items
        : items.filter((item) => filterForSource(item.source) === activeFilter),
    [activeFilter, items],
  );
  const itemsByBand = useMemo(
    () =>
      BANDS.reduce<Record<QueueBand, ActionQueueItem[]>>(
        (groups, band) => {
          groups[band.key] = filteredItems.filter((item) => item.band === band.key);
          return groups;
        },
        { overdue: [], today: [], week: [] },
      ),
    [filteredItems],
  );

  const counts: Record<QueueFilter, number> = {
    all: data?.total ?? 0,
    billing: data?.byFilter.billing ?? 0,
    communications: data?.byFilter.communications ?? 0,
    estimates: data?.byFilter.estimates ?? 0,
    contracts: data?.byFilter.contracts ?? 0,
    flags: data?.byFilter.flags ?? 0,
  };

  if (isLoading) {
    return (
      <section className="space-y-3" aria-labelledby="needs-you-heading" data-testid="needs-you-queue">
        <QueueHeading total={null} />
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading office decisions…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-3" aria-labelledby="needs-you-heading" data-testid="needs-you-queue">
        <QueueHeading total={null} />
        <div className="flex flex-wrap items-center gap-3 py-6 text-sm text-muted-foreground" role="alert">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span>Unable to load the office queue.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="needs-you-retry"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="needs-you-heading" data-testid="needs-you-queue">
      <QueueHeading total={data?.total ?? 0} />
      <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Filter office decisions">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={activeFilter === filter.key}
            onClick={() => {
              setActiveFilter(filter.key);
              setWeekExpanded(false);
            }}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${activeFilter === filter.key ? "border-foreground bg-foreground text-background" : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            data-testid={`needs-you-filter-${filter.key}`}
          >
            {filter.label}
            <span className="font-mono text-[10px] opacity-75">{counts[filter.key]}</span>
          </button>
        ))}
      </div>
      {data?.total === 0 ? (
        <p className="py-7 text-sm text-muted-foreground" data-testid="needs-you-empty">
          Nothing waiting on the office.
        </p>
      ) : filteredItems.length === 0 ? (
        <p className="py-7 text-sm text-muted-foreground" data-testid="needs-you-filter-empty">
          Nothing matches this filter.
        </p>
      ) : (
        <div>
          {BANDS.map((band) => (
            <QueueBandSection
              key={band.key}
              band={band}
              items={itemsByBand[band.key]}
              allItems={items}
              expanded={weekExpanded}
              onExpand={() => setWeekExpanded(true)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QueueHeading({ total }: { total: number | null }) {
  return (
    <div className="flex items-baseline gap-2 border-b-2 border-foreground pb-2">
      <h2 id="needs-you-heading" className="text-base font-semibold">Needs you</h2>
      {total !== null && <span className="font-mono text-xs text-muted-foreground" data-testid="needs-you-total">{total}</span>}
    </div>
  );
}