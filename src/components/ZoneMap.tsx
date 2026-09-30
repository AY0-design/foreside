"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ZoneGrid } from "@/lib/types";
import { attackingShareIn, LANES, ROWS, ZONE_COUNT, zoneLane, zoneName, zoneRatio, zoneRow } from "@/lib/engine/zones";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx, pct } from "@/lib/format";

export interface ZonePlayer {
  id: number;
  name: string;
  color: string;
  occupation: ZoneGrid;
  /** Optional context shown in the list, e.g. "MUN · GW6". */
  sub?: string;
}

type Layer = "overlap" | "grid" | "player";

// Attacking half only (viewBox 100 × 82): that's where chance data lives.
const LANE_X = [0, 20, 38, 62, 80, 100];
const ROW_Y_FROM_BOTTOM = [0, 50, 100, 126, 150];
const H = 150;

const cellRect = (zone: number) => {
  const l = zoneLane(zone);
  const r = zoneRow(zone);
  return { x: LANE_X[l], y: H - ROW_Y_FROM_BOTTOM[r + 1], w: LANE_X[l + 1] - LANE_X[l], h: ROW_Y_FROM_BOTTOM[r + 1] - ROW_Y_FROM_BOTTOM[r] };
};

function centroid(occ: ZoneGrid) {
  let x = 0;
  let y = 0;
  occ.forEach((v, z) => {
    const c = cellRect(z);
    x += v * (c.x + c.w / 2);
    y += v * (c.y + c.h / 2);
  });
  return { x, y: Math.min(y, 74) };
}

/**
 * Weakness × occupation on one pitch. `grid` is where a team concedes (or creates); `league` is
 * the league-average shape so cells show "× more than average". Players are overlaid by footprint.
 */
export function ZoneMap({ grid, league, players, valueLabel, attackingLabel, focusPlayerId, listTitle = "Who operates here" }: {
  grid: ZoneGrid;
  league: ZoneGrid;
  players: ZonePlayer[];
  /** e.g. "LEE concede here" */
  valueLabel: string;
  /** e.g. "ARS attacking" */
  attackingLabel: string;
  focusPlayerId?: number;
  listTitle?: string;
}) {
  const ratio = useMemo(() => grid.map((v, i) => zoneRatio(v, league[i])), [grid, league]);
  const hottest = useMemo(() => {
    let best = ZONE_COUNT - 3;
    for (let z = 10; z < ZONE_COUNT; z++) if (grid[z] - league[z] > grid[best] - league[best]) best = z;
    return best;
  }, [grid, league]);

  const [layer, setLayer] = useState<Layer>("overlap");
  const [zone, setZone] = useState(hottest);
  const [highlight, setHighlight] = useState<number | null>(focusPlayerId ?? null);

  const highlighted = players.find((p) => p.id === highlight) ?? null;
  const ranked = useMemo(() => players.map((p) => ({ p, share: attackingShareIn(p.occupation, zone) })).sort((a, b) => b.share - a.share), [players, zone]);
  const maxOcc = highlighted ? Math.max(...highlighted.occupation) : 1;
  const maxShare = Math.max(0.01, ...ranked.map((r) => r.share));

  const fillFor = (z: number) => {
    if (layer === "player") {
      if (!highlighted) return "transparent";
      return `rgb(10 132 255 / ${(highlighted.occupation[z] / maxOcc) * 0.75})`;
    }
    if (zoneRow(z) < 2) return "transparent";
    const r = ratio[z];
    // Family pink = the defence is open here. Below-average zones stay neutral.
    if (r >= 1) return `rgb(255 79 163 / ${Math.min(0.9, 0.08 + (r - 1) * 1.2)})`;
    return "transparent";
  };

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] md:gap-10">
      <div>
        <div className="mb-4">
          <SegmentedControl<Layer>
            size="sm"
            label="Map layer"
            value={layer}
            onChange={setLayer}
            options={[
              { value: "overlap", label: "Matchup" },
              { value: "grid", label: "Zones" },
              { value: "player", label: "Player" },
            ]}
          />
        </div>
        <svg viewBox="0 0 100 82" className="w-full rounded-xl bg-bg" role="group" aria-label={`${valueLabel}: zone map, ${attackingLabel} upward`}>
          {Array.from({ length: ZONE_COUNT }, (_, z) => {
            const c = cellRect(z);
            const selected = z === zone;
            const occ = highlighted?.occupation[z] ?? 0;
            return (
              <g key={z}>
                <rect
                  x={c.x}
                  y={c.y}
                  width={c.w}
                  height={c.h}
                  fill={fillFor(z)}
                  className="cursor-pointer outline-none"
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  aria-label={`${zoneName(z)}: ${pct(grid[z])}, ${ratio[z].toFixed(1)} times league average`}
                  onClick={() => setZone(z)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setZone(z);
                    }
                  }}
                />
                {layer === "overlap" && highlighted && occ / maxOcc > 0.25 && (
                  <rect x={c.x + 1.2} y={c.y + 1.2} width={c.w - 2.4} height={c.h - 2.4} rx={1.5} fill="none" stroke="var(--blue)" strokeOpacity={0.45 + (occ / maxOcc) * 0.55} strokeWidth={0.8} strokeDasharray="1.6 1.2" pointerEvents="none" />
                )}
                {selected && <rect x={c.x + 0.5} y={c.y + 0.5} width={c.w - 1} height={c.h - 1} rx={1.5} fill="none" stroke="var(--fg)" strokeWidth={0.9} pointerEvents="none" />}
                {layer !== "player" && zoneRow(z) >= 2 && (
                  <text x={c.x + 1.8} y={c.y + 4.6} fontSize={3.1} fill="var(--muted)" pointerEvents="none" className="tabular-nums">
                    {ratio[z].toFixed(1)}×
                  </text>
                )}
              </g>
            );
          })}

          <g fill="none" stroke="var(--line)" strokeWidth={0.5} pointerEvents="none">
            <rect x={0.25} y={0.25} width={99.5} height={81.5} rx={2} />
            <line x1={0} y1={75} x2={100} y2={75} />
            <circle cx={50} cy={75} r={9} />
            <rect x={20.5} y={0.25} width={59} height={24} />
            <rect x={37} y={0.25} width={26} height={8} />
            <line x1={0} y1={50} x2={100} y2={50} strokeDasharray="1.2 1.2" />
          </g>

          {layer !== "grid" &&
            players.map((p) => {
              const c = centroid(p.occupation);
              const active = p.id === highlight;
              return (
                <g key={p.id} pointerEvents="none" opacity={highlight && !active ? 0.5 : 1}>
                  <circle cx={c.x} cy={c.y} r={active ? 3 : 2.2} fill={p.color} stroke="var(--bg)" strokeWidth={0.8} />
                  {active && (
                    <text x={c.x} y={c.y + 6.4} textAnchor="middle" fontSize={3.3} fill="var(--fg)" fontWeight={600} stroke="var(--bg)" strokeWidth={1.2} paintOrder="stroke" strokeLinejoin="round">
                      {p.name}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
        <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
          <span>↑ {attackingLabel}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-10 rounded-full" style={{ background: "linear-gradient(90deg, var(--panel-strong), rgb(255 79 163))" }} aria-hidden />
            open vs league average
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-[12px] text-muted">Selected zone</p>
        <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">{LANES[zoneLane(zone)]}</h3>
        <p className="text-[13px] text-muted">{ROWS[zoneRow(zone)]}</p>
        <div className="mt-5 grid grid-cols-2 divide-x divide-line overflow-hidden rounded-xl bg-bg">
          <div className="px-4 py-3">
            <div className="text-[12px] text-muted">{valueLabel}</div>
            <div className="mt-1 text-[20px] font-semibold tnum">{pct(grid[zone])}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[12px] text-muted">vs league average</div>
            <div className={cx("mt-1 text-[20px] font-semibold tnum", ratio[zone] >= 1.1 ? "text-pink" : "")}>{ratio[zone].toFixed(2)}×</div>
          </div>
        </div>

        <p className="mt-6 mb-2 text-[13px] font-semibold">{listTitle}</p>
        <ul>
          {ranked.map(({ p, share }) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(p.id)}
                onFocus={() => setHighlight(p.id)}
                onClick={() => setHighlight(p.id)}
                className={cx("grid w-full grid-cols-[minmax(0,1fr)_72px_40px] items-center gap-3 border-t border-line px-1 py-2 text-left first:border-t-0", highlight === p.id && "text-blue")}
              >
                <span className="flex min-w-0 items-center gap-2 text-[13px]">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.sub && <span className="truncate text-[12px] text-muted">{p.sub}</span>}
                </span>
                <span className="block h-1.5 rounded-full bg-panel-strong" aria-hidden>
                  <span className="block h-full rounded-full bg-blue" style={{ width: `${Math.max(6, (share / maxShare) * 100)}%` }} />
                </span>
                <span className="text-right text-[13px] tnum">{pct(share)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">Share of each player’s shots and chances created that come from the selected zone. Pick a zone or a player to see their footprint.</p>
        {highlighted && (
          <Link href={`/players/${highlighted.id}`} className="mt-4 inline-flex h-8 items-center rounded-full bg-inverse px-3.5 text-[13px] font-medium text-inverse-fg hover:opacity-85">
            Open {highlighted.name}
          </Link>
        )}
      </div>
    </div>
  );
}
