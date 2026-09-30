export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Role = "GK" | "LB" | "CB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";
export type Status = "available" | "doubtful" | "injured" | "suspended";
export type Confidence = "High" | "Medium" | "Low";

/**
 * 20 tactical zones, index = row * 5 + lane.
 * Lanes run left → right from the ATTACKING team's point of view.
 * Rows run from the attacking team's own third (0) to the opponent's penalty area (3).
 * Values in a grid sum to 1 (a share of touches, or a share of chances conceded).
 */
export type ZoneGrid = number[];

export interface Team {
  id: number;
  /** FPL team code, used for the club badge. 0 for demo data. */
  code: number;
  name: string;
  short: string;
  color: string;
  /** Attacking strength multiplier, ~0.7–1.45 (1 = league average). */
  attack: number;
  /** Defensive weakness multiplier, ~0.7–1.4 (1 = league average, higher concedes more). */
  defenceWeakness: number;
  /** Where this team concedes chance volume, in the attacker's frame. */
  vulnerability: ZoneGrid;
  /** Change in xGA per game over the last five vs. season (negative = improving). */
  xgaTrend: number;
  /** This season's matches from Understat: xG for/against, oldest first. Empty for demo data. */
  matches: { date: string; home: boolean; xg: number; xga: number; scored: number; conceded: number }[];
}

export interface GameweekHistory {
  gw: number;
  opponentId: number;
  home: boolean;
  minutes: number;
  points: number;
  goals: number;
  assists: number;
}

export interface Player {
  id: number;
  /** FPL player code, used for the headshot. 0 for demo data. */
  code: number;
  name: string;
  /** Short display name, e.g. "Saka". */
  webName: string;
  teamId: number;
  position: Position;
  role: Role;
  price: number;
  /** Selected-by percentage. */
  ownership: number;
  status: Status;
  /** Chance of playing next round, 0–100. */
  chance: number;
  news: string | null;
  xg90: number;
  xa90: number;
  /** Probability of starting when fit. */
  pStart: number;
  /** Probability of a substitute appearance when not starting. */
  pCameo: number;
  penalties: boolean;
  setPieces: boolean;
  /** Probability of reaching the defensive-contribution threshold per 90. */
  defcon90: number;
  yellow90: number;
  occupation: ZoneGrid;
  /** "measured" when the occupation grid comes from real shot/chance locations. */
  zoneSource: "measured" | "estimated";
  history: GameweekHistory[];
}

export interface Fixture {
  id: number;
  gw: number;
  homeId: number;
  awayId: number;
  /** Display label, e.g. "Sat 10 Oct · 15:00". */
  kickoff: string;
  result: { home: number; away: number } | null;
}

/** Everything the engine needs from a data source (live feed or demo generator). */
export interface SourceData {
  teams: Team[];
  players: Player[];
  fixtures: Fixture[];
  currentGw: number;
  /** ISO deadline for currentGw, when known. */
  deadline: string | null;
  fetchedAt: string | null;
  source: "live" | "demo";
  season: string;
}

export interface Reason {
  label: string;
  detail: string;
  impact: "positive" | "negative" | "neutral";
  weight: number;
}

export interface FixtureProjection {
  gw: number;
  fixtureId: number | null;
  opponentId: number | null;
  home: boolean;
  xPts: number;
  /** All opponents this gameweek (more than one in a double gameweek). */
  opponentIds: number[];
}

export interface PlayerProjection {
  playerId: number;
  gw: number;
  fixtureId: number | null;
  opponentId: number | null;
  home: boolean;
  xPts: number;
  sd: number;
  floor: number;
  median: number;
  ceiling: number;
  pGoal: number;
  pAssist: number;
  pReturn: number;
  pCleanSheet: number;
  p60: number;
  xMins: number;
  /** Effective start probability after availability. */
  pStartEff: number;
  fixtureFactor: number;
  matchup: number;
  /** Zone where this player's occupation best meets the opponent's weakness. */
  keyZone: number | null;
  confidence: Confidence;
  mainUncertainty: string;
  reasons: Reason[];
  risks: string[];
  horizon: FixtureProjection[];
  /** Fixtures in the current gameweek (0 = blank, 2 = double). */
  fixtureCount: number;
  horizonTotal: number;
  value: number;
}

export interface TeamFixtureProjection {
  fixtureId: number;
  gw: number;
  teamId: number;
  opponentId: number;
  home: boolean;
  xG: number;
  xGA: number;
  pScore: number;
  pTwoPlus: number;
  pCleanSheet: number;
}

/** Flattened, serialisable view of a player + next-GW projection, for client components. */
export interface PlayerSummary {
  id: number;
  name: string;
  webName: string;
  photo: string | null;
  teamBadge: string | null;
  teamId: number;
  teamShort: string;
  teamColor: string;
  position: Position;
  price: number;
  ownership: number;
  status: Status;
  chance: number;
  news: string | null;
  xPts: number;
  sd: number;
  floor: number;
  ceiling: number;
  pStartEff: number;
  pReturn: number;
  pGoal: number;
  pAssist: number;
  pCleanSheet: number;
  confidence: Confidence;
  mainUncertainty: string;
  /** "BOU" or "BOU + LIV" in a double gameweek; null when blank. */
  opponentShort: string | null;
  home: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5 | null;
  fixtureCount: number;
  fixtureFactor: number;
  matchup: number;
  horizonTotal: number;
  horizon: { gw: number; opponentShort: string | null; home: boolean; xPts: number; difficulty: 1 | 2 | 3 | 4 | 5 | null }[];
  topReason: string | null;
  /** Ranked drivers of this gameweek's projection. */
  reasons: { label: string; detail: string; impact: Reason["impact"] }[];
  risks: string[];
  /** "Right half-space (penalty area)" etc., when a zone matchup drives the projection. */
  keyZone: string | null;
  zoneSource: "measured" | "estimated";
  form: number[];
  value: number;
}

export interface Model {
  season: string;
  currentGw: number;
  deadline: string | null;
  fetchedAt: string | null;
  source: "live" | "demo";
  teams: Team[];
  players: Player[];
  fixtures: Fixture[];
  projections: Record<number, PlayerProjection>;
  teamProjections: TeamFixtureProjection[];
  leagueVulnerability: ZoneGrid;
}
