import type { ZoneGrid } from "@/lib/types";

export const LANES = ["Left wing", "Left half-space", "Central", "Right half-space", "Right wing"] as const;
export const ROWS = ["Own third", "Middle third", "Final third", "Penalty area"] as const;
export const ZONE_COUNT = LANES.length * ROWS.length;

/** How much each row contributes to chance creation. Own-third touches don't create chances. */
const ROW_WEIGHT = [0, 0.15, 1, 1.6];

export const zoneIndex = (row: number, lane: number) => row * LANES.length + lane;
export const zoneRow = (zone: number) => Math.floor(zone / LANES.length);
export const zoneLane = (zone: number) => zone % LANES.length;
export const zoneName = (zone: number) => `${LANES[zoneLane(zone)]} · ${ROWS[zoneRow(zone)].toLowerCase()}`;

export function normalize(grid: number[]): ZoneGrid {
  const total = grid.reduce((a, b) => a + b, 0);
  return total > 0 ? grid.map((v) => v / total) : grid.map(() => 1 / grid.length);
}

/** Gaussian blob centred on a (lane, row) position, used to model where a player operates. */
export function blob(lane: number, row: number, laneSpread: number, rowSpread: number): ZoneGrid {
  const grid: number[] = [];
  for (let r = 0; r < ROWS.length; r++) {
    for (let l = 0; l < LANES.length; l++) {
      const d = (l - lane) ** 2 / (2 * laneSpread ** 2) + (r - row) ** 2 / (2 * rowSpread ** 2);
      grid.push(Math.exp(-d));
    }
  }
  return normalize(grid);
}

export function averageGrid(grids: ZoneGrid[]): ZoneGrid {
  const out = new Array(ZONE_COUNT).fill(0);
  for (const g of grids) g.forEach((v, i) => (out[i] += v / grids.length));
  return out;
}

/**
 * Share relative to league average, smoothed: a 1.5% pseudo-share is added to both sides so a zone
 * that barely sees any shots (wide in the box) can't read as "6× the league" off two chances.
 */
export const RATIO_PRIOR = 0.015;
export const zoneRatio = (value: number, leagueValue: number) => (value + RATIO_PRIOR) / (leagueValue + RATIO_PRIOR);

/** Opponent vulnerability relative to league average — 1 = average, 1.5 = concedes 50% more there. */
export function vulnerabilityRatio(vulnerability: ZoneGrid, league: ZoneGrid): number[] {
  return vulnerability.map((v, i) => zoneRatio(v, league[i]));
}

/**
 * Weakness × occupation. Weights the opponent's relative vulnerability by where the player
 * actually operates, counting only chance-creating rows. Clamped so a single zone can't
 * dominate the projection.
 */
export function matchupScore(occupation: ZoneGrid, vulnerability: ZoneGrid, league: ZoneGrid) {
  const ratio = vulnerabilityRatio(vulnerability, league);
  let weighted = 0;
  let weight = 0;
  let keyZone: number | null = null;
  let keyValue = 0;
  const totalWeight = occupation.reduce((sum, occ, z) => sum + occ * ROW_WEIGHT[zoneRow(z)], 0);
  occupation.forEach((occ, z) => {
    const w = occ * ROW_WEIGHT[zoneRow(z)];
    weighted += w * ratio[z];
    weight += w;
    // A key zone must be somewhere the player genuinely operates, not a corner they rarely visit.
    if (totalWeight > 0 && w / totalWeight < 0.08) return;
    const lift = w * (ratio[z] - 1);
    if (lift > keyValue) {
      keyValue = lift;
      keyZone = z;
    }
  });
  if (weight < 0.02) return { score: 1, keyZone: null, attackingShare: weight };
  const raw = weighted / weight;
  // Opponent grids are already shrunk toward the league shape, so use the ratio directly.
  const score = Math.min(1.3, Math.max(0.78, raw));
  return { score, keyZone, attackingShare: weight };
}

/** Share of a player's chance-creating activity that sits in a given zone. */
export function attackingShareIn(occupation: ZoneGrid, zone: number): number {
  const total = occupation.reduce((sum, occ, z) => sum + occ * ROW_WEIGHT[zoneRow(z)], 0);
  return total > 0 ? (occupation[zone] * ROW_WEIGHT[zoneRow(zone)]) / total : 0;
}
