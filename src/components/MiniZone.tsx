import { LANES, zoneLane, zoneRatio, zoneRow } from "@/lib/engine/zones";
import type { ZoneGrid } from "@/lib/types";

/**
 * Attacking-half glyph (final third + box, 5 lanes). Pink intensity = how much more than league
 * average the defence concedes there; the blue outline is where the player operates.
 */
export function MiniZone({ grid, league, highlight, size = 56 }: { grid: ZoneGrid; league: ZoneGrid; highlight?: number | null; size?: number }) {
  const cellW = size / 5;
  const cellH = (size * 0.6) / 2;
  const cells = [];
  for (const row of [3, 2]) {
    for (let lane = 0; lane < LANES.length; lane++) {
      const z = row * 5 + lane;
      const ratio = zoneRatio(grid[z], league[z]);
      const alpha = ratio >= 1 ? Math.min(0.95, 0.12 + (ratio - 1) * 1.2) : 0;
      cells.push(
        <rect
          key={z}
          x={lane * cellW + 1}
          y={(row === 3 ? 0 : cellH) + 1}
          width={cellW - 2}
          height={cellH - 2}
          rx={2}
          fill={alpha > 0 ? `rgb(255 79 163 / ${alpha})` : "var(--panel-strong)"}
          stroke={z === highlight ? "var(--blue)" : "none"}
          strokeWidth={1.6}
        />,
      );
    }
  }
  return (
    <svg width={size} height={cellH * 2} viewBox={`0 0 ${size} ${cellH * 2}`} aria-hidden className="shrink-0">
      {cells}
    </svg>
  );
}

export const zoneShort = (z: number) => `${LANES[zoneLane(z)]}${zoneRow(z) === 3 ? " · box" : " · final third"}`;
