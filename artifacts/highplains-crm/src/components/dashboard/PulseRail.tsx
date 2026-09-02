import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Snowflake, Users } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export interface PulseResponse {
  stats: {
    customersCount: number;
    activeContractsCount: number;
    monthlyRevenue: number;
    ytdRevenue: number;
  };
  revenue: {
    year: number;
    months: number[];
    priorYear: number;
    priorMonths: number[];
  };
  unbilledTicketCount: number;
  avgDaysCloseToInvoice: number | null;
  activeSeason: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
  } | null;
  nextSeason: {
    id: string;
    name: string;
    startDate: string | null;
  } | null;
  snowBook: {
    activeSnowContracts: number;
    expiringBeforeSeasonStart: number;
  };
  renewals: Array<{
    contractId: string;
    customerId: string;
    customerName: string;
    serviceType: string;
    endDate: string;
    daysUntilExpiry: number;
  }>;
  crewsToday: Array<{
    crewId: string;
    crewName: string;
    stops: number;
    complete: number;
    flagged: number;
  }>;
}

interface PulseRailProps {
  pulse?: PulseResponse;
  isLoading?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_WIDTH = 460;
const CHART_HEIGHT = 190;
const CHART_LEFT = 44;
const CHART_RIGHT = 72;
const CHART_TOP = 24;
const CHART_BOTTOM = 28;

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(Number.isFinite(value) ? value : 0);
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string | null, options: Intl.DateTimeFormatOptions): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("en-US", options);
}

function formatServiceType(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function seriesPoints(values: number[], maxValue: number): string {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  return values.slice(0, 12).map((value, index) => {
    const x = CHART_LEFT + (plotWidth * index) / 11;
    const y = CHART_TOP + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
    return `${x},${y}`;
  }).join(" ");
}

function RevenueChart({ revenue }: { revenue: PulseResponse["revenue"] }) {
  const currentMonth = new Date().getMonth();
  const current = Array.from({ length: 12 }, (_, index) => Number(revenue.months[index]) || 0);
  const prior = Array.from({ length: 12 }, (_, index) => Number(revenue.priorMonths[index]) || 0);
  const maximum = Math.max(...current, ...prior, 1);
  const currentPoints = seriesPoints(current, maximum);
  const priorPoints = seriesPoints(prior, maximum);
  const currentPoint = currentPoints.split(" ")[currentMonth] ?? currentPoints.split(" ")[0];
  const [currentX, currentY] = currentPoint.split(",").map(Number);
  const endCurrent = currentPoints.split(" ")[11].split(",").map(Number);
  const endPrior = priorPoints.split(" ")[11].split(",").map(Number);
  const currentYearLabel = `${revenue.year} current`;
  const priorYearLabel = `${revenue.priorYear} prior`;
  const yTicks = [maximum, maximum / 2, 0];
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const areaPoints = `${CHART_LEFT},${CHART_HEIGHT - CHART_BOTTOM} ${currentPoints} ${CHART_WIDTH - CHART_RIGHT},${CHART_HEIGHT - CHART_BOTTOM}`;

  return (
    <div className="min-w-0" data-testid="chart-revenue-pace">
      <svg
        className="block h-auto w-full"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby="revenue-chart-title revenue-chart-description"
      >
        <title id="revenue-chart-title">Revenue pace comparison</title>
        <desc id="revenue-chart-description">
          Monthly billed revenue for {revenue.year} compared with {revenue.priorYear}. The {MONTHS[currentMonth]} point is highlighted.
        </desc>
        {yTicks.map((tick, index) => {
          const y = CHART_TOP + (plotHeight * index) / 2;
          return (
            <g key={tick}>
              <line
                x1={CHART_LEFT}
                x2={CHART_WIDTH - CHART_RIGHT}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              <text
                x={CHART_LEFT - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                style={{ fill: "hsl(var(--muted-foreground))" }}
              >
                {compactCurrency(tick)}
              </text>
            </g>
          );
        })}
        <polygon points={areaPoints} style={{ fill: "hsl(var(--primary) / 0.12)" }} />
        <polyline
          points={priorPoints}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={currentPoints}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={currentX}
          x2={currentX}
          y1={CHART_TOP}
          y2={CHART_HEIGHT - CHART_BOTTOM}
          stroke="hsl(var(--primary) / 0.35)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle
          cx={currentX}
          cy={currentY}
          r="5"
          fill="hsl(var(--background))"
          stroke="hsl(var(--primary))"
          strokeWidth="3"
          data-testid="chart-current-month-marker"
        />
        <text
          x={currentMonth >= 10 ? currentX - 8 : currentX}
          y={Math.max(CHART_TOP - 8, currentY - 11)}
          textAnchor={currentMonth >= 10 ? "end" : "middle"}
          fontSize="9"
          fontWeight="700"
          style={{ fill: "hsl(var(--foreground))" }}
        >
          {MONTHS[currentMonth]} now
        </text>
        {MONTHS.map((month, index) => (
          <text
            key={month}
            x={CHART_LEFT + (plotWidth * index) / 11}
            y={CHART_HEIGHT - 8}
            textAnchor="middle"
            fontSize="9"
            style={{
              fill: index === currentMonth ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              fontWeight: index === currentMonth ? 700 : 400,
            }}
          >
            {month}
          </text>
        ))}
        <line
          x1={endCurrent[0]}
          y1={endCurrent[1]}
          x2={CHART_WIDTH - CHART_RIGHT + 5}
          y2="10"
          stroke="hsl(var(--primary))"
          strokeWidth="1"
        />
        <text
          x={CHART_WIDTH - CHART_RIGHT + 8}
          y="13"
          fontSize="9"
          fontWeight="700"
          style={{ fill: "hsl(var(--primary))" }}
        >
          {currentYearLabel}
        </text>
        <line
          x1={endPrior[0]}
          y1={endPrior[1]}
          x2={CHART_WIDTH - CHART_RIGHT + 5}
          y2="25"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <text
          x={CHART_WIDTH - CHART_RIGHT + 8}
          y="28"
          fontSize="9"
          style={{ fill: "hsl(var(--muted-foreground))" }}
        >
          {priorYearLabel}
        </text>
      </svg>
      <div className="sr-only">
        <span>{currentYearLabel}</span>
        <span>{priorYearLabel}</span>
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  warning = false,
  testId,
}: {
  label: string;
  value: string;
  warning?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-2.5 text-sm" data-testid={testId}>
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className={`shrink-0 font-mono font-medium ${warning ? "text-[hsl(var(--warning))]" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export default function PulseRail({ pulse, isLoading = false }: PulseRailProps) {
  if (isLoading || !pulse) {
    return (
      <aside className="min-w-0 space-y-6" aria-label="Business pulse" data-testid="pulse-rail-loading">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-36 w-full" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((row) => <Skeleton key={row} className="h-9 w-full" />)}
        </div>
      </aside>
    );
  }

  const currentMonth = new Date().getMonth();
  const currentYtd = Number(pulse.stats?.ytdRevenue) || 0;
  const priorYtd = (pulse.revenue?.priorMonths ?? []).slice(0, currentMonth + 1).reduce((total, value) => total + (Number(value) || 0), 0);
  const revenueDelta = currentYtd - priorYtd;
  const revenueDeltaPercent = priorYtd > 0 ? Math.round((revenueDelta / priorYtd) * 100) : null;
  const avgDays = pulse.avgDaysCloseToInvoice;
  const snowContracts = Number(pulse.snowBook?.activeSnowContracts) || 0;
  const snowExpiring = Number(pulse.snowBook?.expiringBeforeSeasonStart) || 0;

  return (
    <aside className="min-w-0 space-y-7" aria-label="Business pulse" data-testid="pulse-rail">
      <section aria-labelledby="pulse-revenue-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="pulse-revenue-heading" className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Revenue pace
          </h2>
          <span className="text-xs text-muted-foreground">{pulse.revenue.year}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-extrabold tracking-tight" data-testid="text-pulse-ytd-revenue">{currency(currentYtd)}</span>
          <span
            className={`text-sm font-medium ${revenueDelta >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--destructive))]"}`}
            data-testid="text-pulse-revenue-delta"
          >
            {revenueDelta >= 0 ? "+" : "-"}{currency(Math.abs(revenueDelta))}
            {revenueDeltaPercent === null ? "" : ` (${revenueDeltaPercent}%)`} vs {pulse.revenue.priorYear}
          </span>
        </div>
        <RevenueChart revenue={pulse.revenue} />
      </section>

      <section aria-labelledby="pulse-ledger-heading" data-testid="pulse-ledger">
        <h2 id="pulse-ledger-heading" className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          At a glance
        </h2>
        <LedgerRow label={`${MONTHS[currentMonth]} billed`} value={currency(Number(pulse.stats?.monthlyRevenue) || 0)} testId="pulse-ledger-monthly-revenue" />
        <LedgerRow label="Active customers" value={number(Number(pulse.stats?.customersCount) || 0)} testId="pulse-ledger-active-customers" />
        <LedgerRow label="Active contracts" value={number(Number(pulse.stats?.activeContractsCount) || 0)} testId="pulse-ledger-active-contracts" />
        <LedgerRow
          label="Work waiting to be billed"
          value={`${number(Number(pulse.unbilledTicketCount) || 0)} tickets`}
          warning={Number(pulse.unbilledTicketCount) >= 5}
          testId="pulse-ledger-unbilled"
        />
        <LedgerRow
          label="Avg close → invoice"
          value={avgDays === null ? "—" : `${avgDays.toFixed(1)} days`}
          warning={avgDays !== null && avgDays > 7}
          testId="pulse-ledger-close-to-invoice"
        />
      </section>

      {snowContracts > 0 && (
        <section aria-labelledby="pulse-snow-heading" className="space-y-2" data-testid="pulse-snow-book">
          <div className="flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="pulse-snow-heading" className="text-sm font-semibold">Snow book</h2>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`${snowContracts} snow contracts, ${snowExpiring} expire before the season opens`}>
            <span
              className="bg-[hsl(var(--primary))]"
              style={{ width: `${Math.max(0, Math.min(100, ((snowContracts - snowExpiring) / snowContracts) * 100))}%` }}
            />
            <span className="bg-[hsl(var(--warning))]" style={{ width: `${Math.max(0, Math.min(100, (snowExpiring / snowContracts) * 100))}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {snowContracts} snow {snowContracts === 1 ? "contract" : "contracts"} · {snowExpiring} expire before the season opens
          </p>
        </section>
      )}

      {pulse.renewals?.length > 0 && (
        <section aria-labelledby="pulse-renewals-heading" className="space-y-2" data-testid="pulse-renewals">
          <div className="flex items-center justify-between gap-2">
            <h2 id="pulse-renewals-heading" className="text-sm font-semibold">Contracts expiring</h2>
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="divide-y divide-border border-y border-border">
            {pulse.renewals.slice(0, 3).map((renewal) => (
              <Link
                key={renewal.contractId}
                href={`/dashboard/customers/${renewal.customerId}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`link-pulse-renewal-${renewal.contractId}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{renewal.customerName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{formatServiceType(renewal.serviceType)} · {formatDate(renewal.endDate, { month: "short", day: "numeric" })}</span>
                </span>
                <span className={`shrink-0 font-mono text-xs ${renewal.daysUntilExpiry <= 30 ? "text-destructive" : "text-muted-foreground"}`}>
                  {renewal.daysUntilExpiry}d
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {pulse.crewsToday?.length > 0 && (
        <section aria-labelledby="pulse-crews-heading" className="space-y-2" data-testid="pulse-crews-today">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="pulse-crews-heading" className="text-sm font-semibold">Crews today</h2>
          </div>
          <div className="space-y-2">
            {pulse.crewsToday.map((crew) => (
              <div key={crew.crewId} className="flex items-center justify-between gap-3 text-sm" data-testid={`pulse-crew-${crew.crewId}`}>
                <span className="min-w-0 truncate">{crew.crewName}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>{crew.stops} {crew.stops === 1 ? "stop" : "stops"}</span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {crew.complete}
                  </span>
                  {crew.flagged > 0 && (
                    <span className="flex items-center gap-1 font-medium text-[hsl(var(--warning))]">
                      <CircleAlert className="h-3 w-3" aria-hidden="true" />
                      {crew.flagged}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="link-pulse-top-customers"
      >
        Top customers <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </aside>
  );
}