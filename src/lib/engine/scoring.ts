import type { Position } from "@/lib/types";
import { poisson, type Rng } from "@/lib/rng";

/** FPL scoring rules the simulation maps back to. */
export const SCORING = {
  appearance: { short: 1, full: 2 },
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 } satisfies Record<Position, number>,
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 } satisfies Record<Position, number>,
  concededPerTwo: -1,
  savesPerPoint: 3,
  defensiveContribution: 2,
  yellow: -1,
} as const;

export interface MatchInputs {
  position: Position;
  pStart: number;
  pCameo: number;
  /** Expected goals per 90 for this fixture (already fixture- and matchup-adjusted). */
  goalRate: number;
  assistRate: number;
  /** Opponent's expected goals in the fixture. */
  concedeRate: number;
  defcon90: number;
  yellow90: number;
}

export interface MatchOutcome {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  points: number;
}

function drawMinutes(rng: Rng, pStart: number, pCameo: number): number {
  const u = rng();
  if (u < pStart) {
    const v = rng();
    if (v < 0.07) return 45 + Math.floor(rng() * 15);
    if (v < 0.6) return 90;
    return 60 + Math.floor(rng() * 30);
  }
  if (u < pStart + (1 - pStart) * pCameo) return 8 + Math.floor(rng() * 27);
  return 0;
}

export function simulateMatch(rng: Rng, m: MatchInputs): MatchOutcome {
  const minutes = drawMinutes(rng, m.pStart, m.pCameo);
  if (minutes === 0) return { minutes, goals: 0, assists: 0, cleanSheet: false, points: 0 };

  const share = minutes / 90;
  const goals = poisson(rng, m.goalRate * share);
  const assists = poisson(rng, m.assistRate * share);
  const conceded = poisson(rng, m.concedeRate * share);
  const played60 = minutes >= 60;
  const cleanSheet = played60 && conceded === 0;

  let points = played60 ? SCORING.appearance.full : SCORING.appearance.short;
  points += goals * SCORING.goal[m.position] + assists * SCORING.assist;
  if (cleanSheet) points += SCORING.cleanSheet[m.position];
  if (m.position === "GK" || m.position === "DEF") {
    points += Math.floor(conceded / 2) * SCORING.concededPerTwo;
  }
  if (m.position === "GK") {
    points += Math.floor(poisson(rng, m.concedeRate * 2.7 * share) / SCORING.savesPerPoint);
  }
  const defcon = m.position !== "GK" && rng() < m.defcon90 * share;
  if (defcon) points += SCORING.defensiveContribution;
  if (rng() < m.yellow90 * share) points += SCORING.yellow;

  // Bonus approximation from a BPS-like proxy.
  const bps =
    goals * 3 + assists * 2 + (cleanSheet && (m.position === "GK" || m.position === "DEF") ? 1 : 0) + (defcon ? 0.5 : 0);
  if (bps >= 5) points += 3;
  else if (bps >= 3) points += rng() < 0.6 ? 2 : 1;
  else if (bps >= 2) points += rng() < 0.35 ? 1 : 0;

  return { minutes, goals, assists, cleanSheet, points };
}
