"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/lib/format";

export interface Series {
  /** Legend text. */
  label: string;
  /** Short name for the tooltip; defaults to the legend text. */
  name?: string;
  tone: "blue" | "pink" | "muted";
  values: (number | null)[];
  /** A projection that only continues the actual line: hidden in the tooltip up to "Today". */
  projection?: boolean;
}

/** Matches the layout: the plot sits 16px inside its box (left-4/right-4), after a 32px axis and 8px gap. */
const PLOT_INSET = 16;
const AXIS_WIDTH = 40;

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
 * Fey-style interactive line chart. Thin strokes, dashed projection after "Today", value axis on
 * the left. Hover (or arrow keys) snaps a crosshair to the nearest gameweek and shows every
 * series' actual value. Points sit inside a small inset so edge labels can centre on them.
 */
export function AreaChart({ series, labels, nowIndex, height = 200, ariaLabel, className, nowLabel = "Today", showLegend = true, decimals = 1, unit = "" }: {
  series: Series[];
  labels: string[];
  nowIndex?: number;
  nowLabel?: string;
  height?: number;
  ariaLabel: string;
  className?: string;
  showLegend?: boolean;
  decimals?: number;
  unit?: string;
}) {
  const n = labels.length;
  const innerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const tooltipId = useId();
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);

  // Place the tooltip so it never wraps: right of the crosshair if it fits, else left, else as
  // close as the figure allows. Measured before paint, so it never visibly jumps.
  useLayoutEffect(() => {
    const plot = innerRef.current;
    const tip = tipRef.current;
    if (active === null || !plot || !tip || n < 2) return;
    const width = plot.clientWidth;
    const x = (active / (n - 1)) * width;
    const w = tip.offsetWidth;
    const gap = 12;
    const min = -PLOT_INSET - AXIS_WIDTH; // the figure's left edge, over the value axis
    const max = width + PLOT_INSET; // the figure's right edge
    const left = x + gap + w <= max ? x + gap : x - gap - w >= min ? x - gap - w : Math.min(max - w, Math.max(min, x - w / 2));
    setTipLeft(left);
  }, [active, n]);

  if (n < 2) return null;

  const W = 1000;
  const top = 12;
  const bottom = height - 6;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(0.1, ...all) * 1.1;
  const xPct = (i: number) => (i / (n - 1)) * 100;
  const yPx = (v: number) => bottom - (v / max) * (bottom - top);
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => f * max);
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;

  const indexFromClientX = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (n - 1));
  };
  const onPointerMove = (e: PointerEvent) => setActive(indexFromClientX(e.clientX));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => {
        const cur = i ?? nowIndex ?? n - 1;
        return Math.min(n - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setActive(null);
  };

  const rows =
    active === null
      ? []
      : series
          .filter((s) => !(s.projection && nowIndex !== undefined && active <= nowIndex))
          .map((s) => ({ s, v: s.values[active] }))
          .filter((r): r is { s: Series; v: number } => r.v !== null && r.v !== undefined);
  const projected = active !== null && nowIndex !== undefined && active > nowIndex;

  // Last point of each series, marked with a dot at rest.
  const ends = series
    .map((s) => {
      let i = s.values.length - 1;
      while (i >= 0 && s.values[i] === null) i--;
      return i >= 0 ? { s, i, v: s.values[i] as number } : null;
    })
    .filter((e): e is { s: Series; i: number; v: number } => e !== null && e.i === n - 1);

  return (
    <figure className={cx("w-full", className)}>
      {showLegend && (
        <figcaption className="mb-9 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 rounded bg-panel-strong px-1.5 py-0.5">
              <span aria-hidden className="h-2.5 w-0.5 rounded-full" style={{ background: STROKE[s.tone] }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}

      <div className="flex gap-2">
        {/* Value axis */}
        <div aria-hidden className="relative w-8 shrink-0 text-[10px] text-faint tnum" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: yPx(t) }}>
              {t.toFixed(t < 10 ? 1 : 0)}
            </span>
          ))}
        </div>

        <div
          className="relative min-w-0 flex-1 cursor-crosshair touch-pan-y outline-none"
          style={{ height }}
          tabIndex={0}
          role="img"
          aria-label={`${ariaLabel}. Use the left and right arrow keys to read values.`}
          aria-describedby={active !== null ? tooltipId : undefined}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {/* Grid spans the full width; data lives in the inset box below. */}
          <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 block size-full" aria-hidden>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={yPx(t)} y2={yPx(t)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>

          <div ref={innerRef} className="absolute inset-y-0 right-4 left-4">
            <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible" aria-hidden>
              {nowIndex !== undefined && <line x1={(xPct(nowIndex) / 100) * W} x2={(xPct(nowIndex) / 100) * W} y1={2} y2={bottom} stroke="var(--faint)" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
              {series.map((s) => {
                const pts = s.values.map((v, i) => (v === null ? null : { x: (xPct(i) / 100) * W, y: yPx(v), i })).filter((p): p is { x: number; y: number; i: number } => p !== null);
                if (pts.length < 2) return null;
                const split = nowIndex === undefined ? -1 : pts.findIndex((p) => p.i > nowIndex);
                const solid = split === -1 ? pts : pts.slice(0, Math.max(split, 1));
                const dashed = split === -1 ? [] : pts.slice(Math.max(split - 1, 0));
                return (
                  <g key={s.label}>
                    {solid.length > 1 && <path d={path(solid)} fill="none" stroke={STROKE[s.tone]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
                    {dashed.length > 1 && <path d={path(dashed)} fill="none" stroke={STROKE[s.tone]} strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
                  </g>
                );
              })}
              {active !== null && <line x1={(xPct(active) / 100) * W} x2={(xPct(active) / 100) * W} y1={0} y2={bottom} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            </svg>

            {/* "Today" marker label */}
            {nowIndex !== undefined && (
              <span className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-panel-strong px-1.5 py-0.5 text-[11px] text-muted" style={{ left: `${xPct(nowIndex)}%` }}>
                {nowLabel}
              </span>
            )}

            {/* Round dots (HTML, so they don't stretch with the SVG). */}
            {active === null
              ? ends.map(({ s, v }) => (
                  <span key={s.label} aria-hidden className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: "100%", top: yPx(v), background: STROKE[s.tone] }} />
                ))
              : rows.map(({ s, v }) => (
                  <span key={s.label} aria-hidden className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel" style={{ left: `${xPct(active)}%`, top: yPx(v), background: STROKE[s.tone] }} />
                ))}

            {/* Fey tooltip */}
            {active !== null && rows.length > 0 && (
              <div
                id={tooltipId}
                role="status"
                ref={tipRef}
                className="pointer-events-none absolute top-2 z-10 w-max min-w-40 rounded-xl bg-panel-strong/95 p-3 whitespace-nowrap shadow-pop backdrop-blur"
                style={{ left: tipLeft ?? 0, visibility: tipLeft === null ? "hidden" : undefined }}
              >
                <p className="mb-2 text-[12px] text-muted">
                  {labels[active]} · {projected ? "projected" : "actual"}
                </p>
                <ul className="space-y-1.5">
                  {rows.map(({ s, v }) => (
                    <li key={s.label} className="flex items-center justify-between gap-6 text-[13px]">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-3 w-0.5 rounded-full" style={{ background: STROKE[s.tone] }} />
                        {s.name ?? s.label}
                      </span>
                      <span className="font-semibold tnum">{fmt(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* X labels, each centred on its point (same insets as the plot). */}
      <div aria-hidden className="mt-2 flex gap-2 text-[11px] text-muted tnum">
        <div className="w-8 shrink-0" />
        <div className="relative mx-4 h-4 flex-1">
          {labels.map((l, i) => (
            <span
              key={i}
              className={cx("absolute top-0 -translate-x-1/2 whitespace-nowrap", i !== 0 && i !== n - 1 && "hidden sm:inline", nowIndex !== undefined && i > nowIndex && "text-faint", active === i && "text-fg")}
              style={{ left: `${xPct(i)}%` }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
