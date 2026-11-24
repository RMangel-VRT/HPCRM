import { money } from "./revenueFormat";

export interface SeasonLine {
  year: number;
  months: number[];
  /** Index of last closed month; months after it are open (drawn as open dots). -1 = none closed. */
  closedIdx: number;
  isCurrent: boolean;
  /** Missing closed-month actuals are not plotted as zero. */
  firstIndex?: number;
}

interface Props {
  lines: SeasonLine[];
  monthNames: string[];
  ariaLabel: string;
}

const W = 720, H = 230, PAD_L = 44, PAD_B = 22, PAD_T = 10;
const SHADES = ["hsl(var(--muted-foreground) / .45)", "hsl(var(--muted-foreground) / .8)", "hsl(var(--primary))"];

export function RevenueSeasonalityChart({ lines, monthNames, ariaLabel }: Props) {
  const all = lines.flatMap(l => l.months.slice(l.firstIndex ?? 0));
  const max = Math.max(1, ...all), min = Math.min(0, ...all);
  const plotH = H - PAD_B - PAD_T, step = (W - PAD_L - 12) / 11;
  const x = (i: number) => PAD_L + 6 + i * step;
  const y = (c: number) => PAD_T + plotH - ((c - min) / (max - min)) * plotH;
  const ticks = [min, (min + max) / 2, max];

  return (
    <div className="rv-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="rv-chart-grid" x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} />
            <text className="rv-chart-axis" x={PAD_L - 6} y={y(t) + 3} textAnchor="end">{money(t, { compact: true })}</text>
          </g>
        ))}
        {monthNames.map((n, i) => (
          <text key={n} className="rv-chart-axis" x={x(i)} y={H - 6} textAnchor="middle">{n}</text>
        ))}
        {lines.map((l, li) => {
          const color = SHADES[Math.max(0, SHADES.length - lines.length + li)];
          const solidEnd = l.isCurrent ? l.closedIdx : 11;
          const start = l.firstIndex ?? 0;
          const dashedStart = Math.max(start, solidEnd);
          const solid = l.months.slice(start, solidEnd + 1).map((v, i) => `${x(i + start)},${y(v)}`).join(" ");
          const dashed = l.isCurrent && solidEnd < 11
            ? l.months.slice(dashedStart).map((v, i) => `${x(i + dashedStart)},${y(v)}`).join(" ")
            : "";
          return (
            <g key={l.year} data-testid={`seasonality-line-${l.year}`}>
              <title>{`${l.year}: ${l.months.slice(start).map((v, i) => `${monthNames[i + start]} ${money(v)}`).join(", ")}`}</title>
              {solidEnd > start && <polyline points={solid} fill="none" stroke={color} strokeWidth={l.isCurrent ? 2.25 : 1.75} strokeLinejoin="round" />}
              {dashed && <polyline points={dashed} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 4" />}
              {l.months.map((v, i) => {
                const open = l.isCurrent && i > l.closedIdx;
                if (i < start || (!l.isCurrent && i !== 11)) return null;
                return (
                  <circle key={i} cx={x(i)} cy={y(v)} r={open ? 3.5 : 3}
                    fill={open ? "hsl(var(--card))" : color} stroke={color} strokeWidth={1.5}
                    data-testid={open ? "seasonality-open-dot" : undefined} />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
