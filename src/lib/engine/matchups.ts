/**
 * The Foreside signature: opponent weakness × player occupation.
 * Everything here reads the zone grids built from real Understat shot locations.
 */
import type { Model, Player, Team, ZoneGrid } from "@/lib/types";
import { attackingShareIn, averageGrid, matchupScore, normalize, vulnerabilityRatio, ZONE_COUNT, zoneRatio, zoneRow } from "./zones";
import { effectiveStart, fixturesFor } from "./project";

export interface Exploit {
  playerId: number;
  teamId: number;
  opponentId: number;
  fixtureId: number;
  gw: number;
  home: boolean;
  /** Zone where this player's footprint best meets the opponent's weakness. */
  zone: number;
  /** Opponent's share of chance volume conceded from that zone. */
  zoneShare: number;
  /** That share relative to league average (1.4 = 40% more than average). */
  zoneRatio: number;
  /** Share of the player's own chance creation that happens in that zone. */
  playerShare: number;
  /** Weakness × occupation multiplier across all zones. */
  matchup: number;
  /** Ranking score: how much the matchup should move this player, weighted by threat and minutes. */
  score: number;
}

const threat = (p: Player) => p.xg90 + p.xa90;

function exploitFor(model: Model, p: Player, opponent: Team, league: ZoneGrid) {
  const { score: matchup, keyZone } = matchupScore(p.occupation, opponent.vulnerability, league);
  if (keyZone === null) return null;
  const zoneShare = opponent.vulnerability[keyZone];
  return {
    matchup,
    zone: keyZone,
    zoneShare,
    zoneRatio: zoneRatio(zoneShare, league[keyZone]),
    playerShare: attackingShareIn(p.occupation, keyZone),
  };
}

/** Best player-vs-weakness matchups for a gameweek, strongest first. */
export function exploitsForGw(model: Model, gw = model.currentGw, minStart = 0.6): Exploit[] {
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const out: Exploit[] = [];
  for (const p of model.players) {
    if (p.position === "GK" || p.zoneSource !== "measured") continue;
    const start = effectiveStart(p).pStart;
    if (start < minStart) continue;
    for (const f of fixturesFor(model.fixtures, p.teamId, gw)) {
      const opponent = teamById.get(f.opponentId)!;
      const e = exploitFor(model, p, opponent, model.leagueVulnerability);
      if (!e || e.matchup < 1.03) continue;
      out.push({ playerId: p.id, teamId: p.teamId, opponentId: opponent.id, fixtureId: f.fixture.id, gw, home: f.home, ...e, score: (e.matchup - 1) * threat(p) * start * 10 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** A team's most exposed chance-creating zones, most exposed first. */
export function hotZones(team: Team, league: ZoneGrid, n = 3) {
  const ratio = vulnerabilityRatio(team.vulnerability, league);
  return Array.from({ length: ZONE_COUNT }, (_, z) => z)
    .filter((z) => zoneRow(z) >= 2)
    .sort((a, b) => team.vulnerability[b] - league[b] - (team.vulnerability[a] - league[a]))
    .slice(0, n)
    .map((z) => ({ zone: z, share: team.vulnerability[z], ratio: ratio[z] }));
}

/** Where a team creates: its players' footprints weighted by threat and minutes. */
export function creationGrid(model: Model, teamId: number): ZoneGrid {
  const grid = new Array(ZONE_COUNT).fill(0);
  for (const p of model.players) {
    if (p.teamId !== teamId || p.position === "GK") continue;
    const w = threat(p) * p.pStart;
    p.occupation.forEach((v, z) => (grid[z] += v * w));
  }
  return normalize(grid);
}

export function leagueCreationGrid(model: Model): ZoneGrid {
  return averageGrid(model.teams.map((t) => creationGrid(model, t.id)));
}

export interface Exploiter {
  playerId: number;
  matchup: number;
  zone: number;
  playerShare: number;
  score: number;
  /** Set when this player's team actually faces the team within the horizon. */
  gw: number | null;
  fixtureId: number | null;
}

/**
 * Who is best placed to exploit this team's weaknesses.
 * `upcoming` limits to opponents in the given gameweek window; `league` ranks every attacker.
 */
export function exploitersOf(model: Model, teamId: number, scope: "upcoming" | "league", gws: number[] = [], n = 8): Exploiter[] {
  const team = model.teams.find((t) => t.id === teamId)!;
  const facing = new Map<number, { gw: number; fixtureId: number }>();
  for (const gw of gws) {
    for (const f of fixturesFor(model.fixtures, teamId, gw)) if (!facing.has(f.opponentId)) facing.set(f.opponentId, { gw, fixtureId: f.fixture.id });
  }
  const out: Exploiter[] = [];
  for (const p of model.players) {
    if (p.teamId === teamId || p.position === "GK" || p.zoneSource !== "measured" || p.status === "injured" || p.status === "suspended") continue;
    const meeting = facing.get(p.teamId) ?? null;
    if (scope === "upcoming" && !meeting) continue;
    const start = effectiveStart(p).pStart;
    if (start < 0.5) continue;
    const e = exploitFor(model, p, team, model.leagueVulnerability);
    if (!e || e.matchup < 1.02) continue;
    out.push({ playerId: p.id, matchup: e.matchup, zone: e.zone, playerShare: e.playerShare, score: (e.matchup - 1) * threat(p) * start * 10, gw: meeting?.gw ?? null, fixtureId: meeting?.fixtureId ?? null });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
