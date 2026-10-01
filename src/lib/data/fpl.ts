/**
 * Adapter: data/snapshot.json (written by `npm run sync`) → the engine's SourceData.
 * Everything here is derived from real FPL + Understat data; the only modelling choices are the
 * blending weights and priors, which exist so early-season samples don't swing wildly.
 */
import type { Fixture, GameweekHistory, Player, Position, Role, SourceData, Status, Team, ZoneGrid } from "@/lib/types";
import { blob, normalize, ZONE_COUNT } from "@/lib/engine/zones";
import { LEAGUE_GOALS } from "@/lib/engine/team";

// ---- Snapshot shape (mirrors scripts/sync-data.ts output) ----
interface ZoneBucket { grid: number[]; xg: number }
interface SnapshotTeam {
  id: number;
  code: number;
  name: string;
  short: string;
  seasons: Record<string, { matches: { date: string; home: boolean; xg: number; xga: number; scored: number; conceded: number }[]; conceded: (ZoneBucket & { matches: number }) | null } | null>;
}
interface SnapshotPlayer {
  id: number;
  code: number;
  webName: string;
  name: string;
  team: number;
  elementType: number;
  price: number;
  ownership: number;
  status: string;
  chance: number | null;
  news: string | null;
  minutes: number;
  starts: number;
  xg: number;
  xa: number;
  yellows: number;
  penaltiesOrder: number | null;
  cornersOrder: number | null;
  history: { gw: number; fixtures: number[]; minutes: number; points: number; goals: number; assists: number; starts: number; defcon: number }[];
  understat: { seasons: Record<string, { minutes: number; xg: number; xa: number }>; zones: Record<string, ZoneBucket | null> } | null;
}
export interface Snapshot {
  fetchedAt: string;
  events: { id: number; deadline: string; finished: boolean; isCurrent: boolean; isNext: boolean }[];
  teams: SnapshotTeam[];
  players: SnapshotPlayer[];
  fixtures: { id: number; gw: number; homeId: number; awayId: number; kickoff: string | null; finished: boolean; homeScore: number | null; awayScore: number | null }[];
}

const CURRENT = "2026";
const PREVIOUS = "2025";

const CLUB_COLORS: Record<string, string> = {
  ARS: "#EF0107", AVL: "#670E36", BOU: "#DA291C", BRE: "#E30613", BHA: "#0057B8", BUR: "#6C1D45", CHE: "#034694",
  COV: "#59CBE8", CRY: "#1B458F", EVE: "#003399", FUL: "#1A1A1A", HUL: "#F5A12D", IPS: "#3A64A3", LEE: "#FFCD00",
  LEI: "#003090", LIV: "#C8102E", LUT: "#F78F1E", MCI: "#6CABDD", MUN: "#DA291C", NEW: "#241F20", NFO: "#DD0000",
  SHU: "#EE2737", SOU: "#D71920", SUN: "#EB172B", TOT: "#132257", WHU: "#7A263A", WOL: "#FDB913",
};

const POSITIONS: Record<number, Position> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
const ROLE: Record<Position, Role> = { GK: "GK", DEF: "CB", MID: "CM", FWD: "ST" };

/** Per-90 priors by position, blended in so a 90-minute cameo can't produce an elite rate. */
const PRIOR_RATES: Record<Position, { xg: number; xa: number; defcon: number }> = {
  GK: { xg: 0, xa: 0.01, defcon: 0 },
  DEF: { xg: 0.04, xa: 0.06, defcon: 0.3 },
  MID: { xg: 0.12, xa: 0.13, defcon: 0.15 },
  FWD: { xg: 0.32, xa: 0.1, defcon: 0.03 },
};
const PRIOR_MINUTES = 270;
const LAST_SEASON_WEIGHT = 0.6;
const DEFCON_THRESHOLD: Record<Position, number> = { GK: Infinity, DEF: 10, MID: 12, FWD: 12 };

const POSITION_FOOTPRINT: Record<Position, ZoneGrid> = {
  GK: blob(2, 0, 0.5, 0.35),
  DEF: blob(2, 1.2, 1.3, 0.8),
  MID: blob(2, 2.2, 1.1, 0.6),
  FWD: blob(2, 2.9, 0.9, 0.4),
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const addGrid = (target: number[], grid: number[] | undefined, w: number) => grid?.forEach((v, i) => (target[i] += v * w));

const KICKOFF = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
function kickoffLabel(iso: string | null): string {
  if (!iso) return "TBC";
  const parts = Object.fromEntries(KICKOFF.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}`;
}

function buildTeams(snapshot: Snapshot): Team[] {
  const leagueGrid = new Array(ZONE_COUNT).fill(0);
  for (const t of snapshot.teams) {
    addGrid(leagueGrid, t.seasons[CURRENT]?.conceded?.grid, 1);
    addGrid(leagueGrid, t.seasons[PREVIOUS]?.conceded?.grid, 0.3);
  }
  const leagueShare = normalize(leagueGrid);

  return snapshot.teams.map((t) => {
    const cur = t.seasons[CURRENT]?.matches ?? [];
    const last = t.seasons[PREVIOUS]?.matches ?? [];
    const promoted = last.length === 0;
    // Promoted sides get a weaker prior until their own numbers build up.
    const prior = promoted ? { xg: 1.15, xga: 1.6, games: 6 } : { xg: LEAGUE_GOALS, xga: LEAGUE_GOALS, games: 4 };
    const w = 0.25;
    const games = cur.length + w * last.length + prior.games;
    const xgFor = (sum(cur.map((m) => m.xg)) + w * sum(last.map((m) => m.xg)) + prior.games * prior.xg) / games;
    const xgAgainst = (sum(cur.map((m) => m.xga)) + w * sum(last.map((m) => m.xga)) + prior.games * prior.xga) / games;
    const recent = cur.slice(-5);
    const xgaTrend = recent.length >= 2 ? sum(recent.map((m) => m.xga)) / recent.length - xgAgainst : 0;

    // Where they concede: this season, last season (down-weighted), shrunk toward league shape.
    const grid = new Array(ZONE_COUNT).fill(0);
    addGrid(grid, t.seasons[CURRENT]?.conceded?.grid, 1);
    addGrid(grid, t.seasons[PREVIOUS]?.conceded?.grid, 0.3);
    // Promoted sides only have a handful of matches of shot data, so lean harder on the league shape.
    addGrid(grid, leagueShare, promoted ? 9 : 5);

    return {
      id: t.id,
      code: t.code,
      name: t.name,
      short: t.short,
      color: CLUB_COLORS[t.short] ?? "#8E8E93",
      attack: clamp(xgFor / LEAGUE_GOALS, 0.55, 1.7),
      defenceWeakness: clamp(xgAgainst / LEAGUE_GOALS, 0.55, 1.7),
      vulnerability: normalize(grid),
      xgaTrend,
      matches: cur.map((m) => ({ date: m.date, home: m.home, xg: m.xg, xga: m.xga, scored: m.scored, conceded: m.conceded })),
    };
  });
}

function status(raw: string, chance: number | null): { status: Status; chance: number } {
  switch (raw) {
    case "d":
      return { status: "doubtful", chance: chance ?? 50 };
    case "i":
    case "n":
      return { status: "injured", chance: 0 };
    case "s":
      return { status: "suspended", chance: 0 };
    default:
      return { status: "available", chance: chance ?? 100 };
  }
}

export function fromSnapshot(snapshot: Snapshot): SourceData {
  const teams = buildTeams(snapshot);
  // Plan for the next deadline still open at sync time. FPL keeps a round "current" until its
  // matches finish, long after its deadline has locked, so the flags alone point at a closed round.
  const syncedAt = new Date(snapshot.fetchedAt).getTime();
  const current = snapshot.events.find((e) => e.isCurrent);
  const open = [...snapshot.events].sort((a, b) => a.id - b.id).find((e) => new Date(e.deadline).getTime() > syncedAt);
  const target = open ?? (current && !current.finished ? current : snapshot.events.find((e) => e.isNext) ?? current);
  const currentGw = target?.id ?? 1;

  const fixtures: Fixture[] = snapshot.fixtures.map((f) => ({
    id: f.id,
    gw: f.gw,
    homeId: f.homeId,
    awayId: f.awayId,
    kickoff: kickoffLabel(f.kickoff),
    result: f.finished && f.homeScore !== null && f.awayScore !== null ? { home: f.homeScore, away: f.awayScore } : null,
  }));
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  // Team games played so far, and the gameweeks they happened in.
  const teamGws = new Map<number, number[]>();
  for (const f of fixtures.filter((x) => x.result)) {
    for (const id of [f.homeId, f.awayId]) teamGws.set(id, [...(teamGws.get(id) ?? []), f.gw]);
  }

  const players: Player[] = snapshot.players.map((sp) => {
    const position = POSITIONS[sp.elementType] ?? "MID";
    const prior = PRIOR_RATES[position];
    const last = sp.understat?.seasons[PREVIOUS];
    const minutes90 = (sp.minutes + LAST_SEASON_WEIGHT * (last?.minutes ?? 0) + PRIOR_MINUTES) / 90;
    const xg90 = (sp.xg + LAST_SEASON_WEIGHT * (last?.xg ?? 0) + (PRIOR_MINUTES / 90) * prior.xg) / minutes90;
    const xa90 = (sp.xa + LAST_SEASON_WEIGHT * (last?.xa ?? 0) + (PRIOR_MINUTES / 90) * prior.xa) / minutes90;

    const games = teamGws.get(sp.team)?.length ?? 0;
    const recentGws = new Set((teamGws.get(sp.team) ?? []).slice(-2));
    const recentStarts = sp.history.filter((h) => recentGws.has(h.gw)).reduce((s, h) => s + h.starts, 0);
    // Light smoothing: an ever-present starter should land near the cap, not at 85%.
    const seasonRate = (sp.starts + 0.2) / (games + 0.25);
    const recentRate = (recentStarts + 0.2) / (recentGws.size + 0.25);
    const pStart = games === 0 ? 0.4 : clamp(0.55 * recentRate + 0.45 * seasonRate, 0.02, 0.95);
    const apps = sp.history.filter((h) => h.minutes > 0).length;
    const pCameo = clamp((apps - sp.starts + 0.3) / (Math.max(0, games - sp.starts) + 1), 0.05, 0.9);

    const full = sp.history.filter((h) => h.minutes >= 60);
    const hits = full.filter((h) => h.defcon >= DEFCON_THRESHOLD[position]).length;
    const defcon90 = position === "GK" ? 0 : (hits + prior.defcon * 3) / (full.length + 3);

    // Chance-creation footprint from real shot + assisted-shot locations.
    const zones = sp.understat?.zones;
    const grid = new Array(ZONE_COUNT).fill(0);
    addGrid(grid, zones?.[CURRENT]?.grid, 1);
    addGrid(grid, zones?.[PREVIOUS]?.grid, 0.5);
    const measuredXg = (zones?.[CURRENT]?.xg ?? 0) + 0.5 * (zones?.[PREVIOUS]?.xg ?? 0);
    addGrid(grid, POSITION_FOOTPRINT[position], 0.4);

    const history: GameweekHistory[] = sp.history.map((h) => {
      const fx = fixtureById.get(h.fixtures[0]);
      const home = fx ? fx.homeId === sp.team : true;
      return { gw: h.gw, opponentId: fx ? (home ? fx.awayId : fx.homeId) : sp.team, home, minutes: h.minutes, points: h.points, goals: h.goals, assists: h.assists };
    });

    return {
      id: sp.id,
      code: sp.code,
      name: sp.name,
      webName: sp.webName,
      teamId: sp.team,
      position,
      role: ROLE[position],
      price: sp.price,
      ownership: sp.ownership,
      ...status(sp.status, sp.chance),
      news: sp.news,
      xg90,
      xa90,
      pStart,
      pCameo,
      penalties: sp.penaltiesOrder === 1,
      setPieces: sp.cornersOrder === 1,
      defcon90,
      yellow90: (sp.yellows + 0.12 * 3) / (sp.minutes / 90 + 3),
      occupation: normalize(grid),
      zoneSource: measuredXg >= 0.5 ? "measured" : "estimated",
      history,
    };
  });

  return {
    teams,
    players,
    fixtures,
    currentGw,
    deadline: target?.deadline ?? null,
    fetchedAt: snapshot.fetchedAt,
    source: "live",
    season: "2026/27",
  };
}
