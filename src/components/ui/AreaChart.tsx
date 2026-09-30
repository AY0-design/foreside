import { cx } from "@/lib/format";

export interface Series {
  label: string;
  tone: "blue" | "pink" | "muted";
  values: (number | null)[];
}

const STROKE = { blue: "var(--blue)", pink: "var(--pink)", muted: "var(--faint)" } as const;

function path(points: { x: number; y: number }[]) {
  return points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1];
      const mid = (prev.x + p.x) / 2;
      return `C ${mid} ${prev.y}, ${mid} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(" ");
}

/**
 * Fey-style line chart: thin strokes, no fill, a dashed "Today" marker, projections dashed.
 * Colours are Family's: blue for "us", pink for "them".
 */
export function AreaChart({ series, labels, nowIndex, height = 200, ariaLabel, className, nowLabel = "Today", showLegend = true }: {
  series: Series[];
  labels: string[];
  nowIndex?: number;
  nowLabel?: string;
  height?: number;
  ariaLabel: string;
  className?: string;
  showLegend?: boolean;
}) {
  const n = labels.length;
  if (n < 2) return null;
  const W = 1000;
  const top = 18;
  const bottom = height - 6;
  const max = Math.max(0.1, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null))) * 1.1;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const gridLines = [0.25, 0.5, 0.75].map((f) => bottom - f * (bottom - top));

  return (
    <figure className={cx("w-full", className)}>
      {showLegend && (
        <figcaption className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 rounded bg-panel-strong px-1.5 py-0.5">
              <span aria-hidden className="h-2.5 w-0.5 rounded-full" style={{ background: STROKE[s.tone] }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height }} role="img" aria-label={ariaLabel}>
          {gridLines.map((g) => (
            <line key={g} x1={0} x2={W} y1={g} y2={g} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
          ))}
          {nowIndex !== undefined && <line x1={x(nowIndex)} x2={x(nowIndex)} y1={4} y2={bottom} stroke="var(--faint)" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v === null ? null : { x: x(i), y: y(v), i })).filter((p): p is { x: number; y: number; i: number } => p !== null);
            if (pts.length < 2) return null;
            const split = nowIndex === undefined ? -1 : pts.findIndex((p) => p.i > nowIndex);
            const solid = split === -1 ? pts : pts.slice(0, Math.max(split, 1));
            const dashed = split === -1 ? [] : pts.slice(Math.max(split - 1, 0));
            const last = solid[solid.length - 1];
            return (
              <g key={s.label}>
                {solid.length > 1 && <path d={path(solid)} fill="none" stroke={STROKE[s.tone]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
                {dashed.length > 1 && <path d={path(dashed)} fill="none" stroke={STROKE[s.tone]} strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
                <circle cx={last.x} cy={last.y} r={3.5} fill={STROKE[s.tone]} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>
        {nowIndex !== undefined && (
          <span className="absolute -top-1 -translate-x-1/2 rounded bg-panel-strong px-1.5 py-0.5 text-[11px] text-muted" style={{ left: `${(nowIndex / (n - 1)) * 100}%` }}>
            {nowLabel}
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted tnum">
        {labels.map((l, i) => (
          <span key={i} className={cx(i !== 0 && i !== n - 1 && "hidden sm:inline", nowIndex !== undefined && i > nowIndex && "text-faint")}>
            {l}
          </span>
        ))}
      </div>
    </figure>
  );
}
