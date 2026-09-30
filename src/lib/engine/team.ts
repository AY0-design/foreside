import type { Team } from "@/lib/types";

export const LEAGUE_GOALS = 1.4;
const HOME_BOOST = 1.1;
const AWAY_PENALTY = 0.91;

/** Expected goals for `attacking` against `defending`. */
export function expectedGoals(attacking: Team, defending: Team, home: boolean): number {
  return LEAGUE_GOALS * attacking.attack * defending.defenceWeakness * (home ? HOME_BOOST : AWAY_PENALTY);
}

/** Fixture effect on a team's attack relative to its own average output. */
export function fixtureFactor(defending: Team, home: boolean): number {
  return defending.defenceWeakness * (home ? HOME_BOOST : AWAY_PENALTY);
}

const poissonPmf = (k: number, lambda: number) => {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
};

export function pAtLeast(k: number, lambda: number): number {
  let below = 0;
  for (let i = 0; i < k; i++) below += poissonPmf(i, lambda);
  return 1 - below;
}

/** 1 (easiest) – 5 (hardest) difficulty derived from the projected goal expectation. */
export function difficultyFromXg(xG: number): 1 | 2 | 3 | 4 | 5 {
  if (xG >= 1.9) return 1;
  if (xG >= 1.55) return 2;
  if (xG >= 1.2) return 3;
  if (xG >= 0.95) return 4;
  return 5;
}
