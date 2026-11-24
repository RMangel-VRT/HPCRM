import { useId, type ReactElement } from "react";
import type { RevenueIncomeMonth } from "@workspace/api-client-react";
import { money, streamVar, type StreamKey } from "./revenueFormat";

interface Props {
  rows: { key: StreamKey; months: RevenueIncomeMonth[] }[];
  targetMonths: number[] | null;
  monthNames: string[];
  ariaLabel: string;
  currentIndex: number;
  /** Localized "net" and "target" words for tooltips. */
  netLabel: string;
  targetLabel: string;
}

const W = 720, H = 240, PAD_L = 48, PAD_B = 22, PAD_T = 8;
type Part = { key: string; v: number; fill: string; op: number };

/** Diverging stack: positive contributions rise from zero, credits fall below it. Tooltips show the true net. */
export function RevenueMonthChart({ rows, targetMonths, monthNames, ariaLabel, currentIndex, netLabel, targetLabel }: Props) {
  const uid = useId().replace(/:/g, "");
  const parts = monthNames.map((_, i) => rows.flatMap(r => {
    const m = r.months[i];
    const list: Part[] = [
      { key: `${r.key}-e`, v: m.earnedCents ?? 0, fill: streamVar(r.key), op: 1 },
      { key: `${r.key}-s`, v: m.signedCents, fill: streamVar(r.key), op: 0.45 },
      { key: `${r.key}-x`, v: m.estimatedCents, fill: `url(#${uid}-st-${r.key})`, op: 1 },
    ];
    return list.filter(p => p.v !== 0);
  }));
  const pos = parts.map(ps => ps.reduce((n, p) => n + Math.max(0, p.v), 0));
  const neg = parts.map(ps => ps.reduce((n, p) => n + Math.min(0, p.v), 0));
  const net = parts.map(ps => ps.reduce((n, p) => n + p.v, 0));
  const max = Math.max(1, ...pos, ...(targetMonths ?? []));
  const min = Math.min(0, ...neg);
  const plotH = H - PAD_B - PAD_T, plotW = W - PAD_L;
  const slot = plotW / 12, barW = slot * 0.58;
  const y = (c: number) => PAD_T + ((max - c) / (max - min)) * plotH;
  const ticks = min < 0 ? [min, 0, max] : [0, max / 2, max];

  return (
    <div className="rv-chart" data-testid="revenue-month-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        <defs>
          {rows.map(r => (
            <pattern key={r.key} id={`${uid}-st-${r.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={streamVar(r.key)} opacity="0.16" />
              <rect width="3" height="6" fill={streamVar(r.key)} opacity="0.6" />
            </pattern>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="rv-chart-grid" x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} />
            <text className="rv-chart-axis" x={PAD_L - 6} y={y(t) + 3} textAnchor="end">{money(t, { compact: true })}</text>
          </g>
        ))}
        {monthNames.map((name, i) => {
          const x = PAD_L + i * slot + (slot - barW) / 2;
          let up = 0, down = 0;
          const segs: ReactElement[] = [];
          for (const p of parts[i]) {
            let top: number, bottom: number;
            if (p.v > 0) { top = y(up + p.v); bottom = y(up); up += p.v; }
            else { top = y(down); bottom = y(down + p.v); down += p.v; }
            segs.push(
              <rect key={p.key} x={x} y={top} width={barW} height={Math.max(bottom - top, 0.5)} fill={p.fill} opacity={p.op}
                stroke={p.v < 0 ? "var(--rv-neg)" : undefined} strokeDasharray={p.v < 0 ? "2 2" : undefined} data-credit={p.v < 0 || undefined} />,
            );
          }
          const tgt = targetMonths ? targetMonths[i] : null;
          return (
            <g key={name}>
              <title>{`${name}: ${netLabel} ${money(net[i])}${neg[i] < 0 ? ` (${money(pos[i])} ${money(neg[i])})` : ""}${tgt !== null ? ` \u00b7 ${targetLabel} ${money(tgt)}` : ""}`}</title>
              {i === currentIndex && <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} fill="var(--rv-month-tint)" />}
              {segs}
              {tgt !== null && (
                <line className="rv-target-line" data-testid="revenue-chart-target" x1={x - 4} x2={x + barW + 4} y1={y(tgt)} y2={y(tgt)} />
              )}
              <text className="rv-chart-axis" x={PAD_L + i * slot + slot / 2} y={H - 6} textAnchor="middle">{name}</text>
            </g>
          );
        })}
        {min < 0 && <line x1={PAD_L} x2={W} y1={y(0)} y2={y(0)} stroke="var(--rv-tick)" strokeWidth={1} />}
      </svg>
    </div>
  );
}
