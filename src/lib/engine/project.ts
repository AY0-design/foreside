import type { Fixture, Model, Player, PlayerProjection, SourceData, Team, TeamFixtureProjection } from "@/lib/types";
import { createRng } from "@/lib/rng";
import { simulateMatch } from "./scoring";
import { expectedGoals, LEAGUE_GOALS, pAtLeast } from "./team";
import { averageGrid, matchupScore } from "./zones";
import { buildPercentiles } from "./stats";
import { explain } from "./explain";

export const HORIZON = 5;
const SIMS_NEXT = 1500;
const SIMS_HORIZON = 300;

/** Per-simulation outcomes, kept sample-aligned so double gameweeks can be summed. */
interface Samples {
  points: number[];
  goal: boolean[];
  assist: boolean[];
  ret: boolean[];
  cleanSheet: boolean[];
  sixty: boolean[];
  minutes: number[];
}

interface SimSummary {
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
}

const EMPTY: SimSummary = { xPts: 0, sd: 0, floor: 0, median: 0, ceiling: 0, pGoal: 0, pAssist: 0, pReturn: 0, pCleanSheet: 0, p60: 0, xMins: 0 };

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export function effectiveStart(p: Player): { pStart: number; pCameo: number } {
  if (p.status === "injured" || p.status === "suspended") return { pStart: 0, pCameo: 0 };
  const available = p.chance / 100;
  return { pStart: p.pStart * available, pCameo: p.pCameo * available };
}

function simulate(p: Player, team: Team, opponent: Team, home: boolean, matchup: number, sims: number, seed: number): Samples {
  const rng = createRng(seed);
  const teamXg = expectedGoals(team, opponent, home);
  const factor = teamXg / (LEAGUE_GOALS * team.attack);
  const { pStart, pCameo } = effectiveStart(p);
  const inputs = {
    position: p.position,
    pStart,
    pCameo,
    goalRate: p.xg90 * factor * matchup,
    assistRate: p.xa90 * factor * matchup,
    concedeRate: expectedGoals(opponent, team, !home),
    defcon90: p.defcon90,
    yellow90: p.yellow90,
  };
  const out: Samples = { points: [], goal: [], assist: [], ret: [], cleanSheet: [], sixty: [], minutes: [] };
  const defensive = p.position === "GK" || p.position === "DEF";
  for (let i = 0; i < sims; i++) {
    const o = simulateMatch(rng, inputs);
    out.points.push(o.points);
    out.goal.push(o.goals > 0);
    out.assist.push(o.assists > 0);
    out.ret.push(o.goals + o.assists > 0 || (o.cleanSheet && defensive));
    out.cleanSheet.push(o.cleanSheet);
    out.sixty.push(o.minutes >= 60);
    out.minutes.push(o.minutes);
  }
  return out;
}

function combine(a: Samples, b: Samples): Samples {
  return {
    points: a.points.map((v, i) => v + b.points[i]),
    goal: a.goal.map((v, i) => v || b.goal[i]),
    assist: a.assist.map((v, i) => v || b.assist[i]),
    ret: a.ret.map((v, i) => v || b.ret[i]),
    cleanSheet: a.cleanSheet.map((v, i) => v || b.cleanSheet[i]),
    sixty: a.sixty.map((v, i) => v || b.sixty[i]),
    minutes: a.minutes.map((v, i) => v + b.minutes[i]),
  };
}

function summarizeSamples(s: Samples): SimSummary {
  const n = s.points.length;
  if (n === 0) return EMPTY;
  const share = (xs: boolean[]) => xs.filter(Boolean).length / n;
  const mean = s.points.reduce((a, b) => a + b, 0) / n;
  const variance = s.points.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sorted = [...s.points].sort((a, b) => a - b);
  return {
    xPts: mean,
    sd: Math.sqrt(variance),
    floor: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    ceiling: quantile(sorted, 0.9),
    pGoal: share(s.goal),
    pAssist: share(s.assist),
    pReturn: share(s.ret),
    pCleanSheet: share(s.cleanSheet),
    p60: share(s.sixty),
    xMins: s.minutes.reduce((a, b) => a + b, 0) / n,
  };
}

export function fixturesFor(fixtures: Fixture[], teamId: number, gw: number) {
  return fixtures
    .filter((f) => f.gw === gw && (f.homeId === teamId || f.awayId === teamId))
    .map((fixture) => {
      const home = fixture.homeId === teamId;
      return { fixture, home, opponentId: home ? fixture.awayId : fixture.homeId };
    });
}

export function buildModel(data: SourceData): Model {
  const { teams, players, fixtures, currentGw } = data;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const league = averageGrid(teams.map((t) => t.vulnerability));
  const percentile = buildPercentiles(players);

  const teamProjections: TeamFixtureProjection[] = [];
  for (const fx of fixtures.filter((f) => f.gw >= currentGw && f.gw < currentGw + HORIZON)) {
    const home = teamById.get(fx.homeId)!;
    const away = teamById.get(fx.awayId)!;
    const homeXg = expectedGoals(home, away, true);
    const awayXg = expectedGoals(away, home, false);
    for (const [team, opp, isHome, xG, xGA] of [
      [home, away, true, homeXg, awayXg],
      [away, home, false, awayXg, homeXg],
    ] as const) {
      teamProjections.push({
        fixtureId: fx.id,
        gw: fx.gw,
        teamId: team.id,
        opponentId: opp.id,
        home: isHome,
        xG,
        xGA,
        pScore: pAtLeast(1, xG),
        pTwoPlus: pAtLeast(2, xG),
        pCleanSheet: Math.exp(-xGA),
      });
    }
  }

  const projections: Record<number, PlayerProjection> = {};
  for (const p of players) {
    const team = teamById.get(p.teamId)!;
    const horizon: PlayerProjection["horizon"] = [];
    let next: SimSummary = EMPTY;
    let nextMatchup = 1;
    let nextKeyZone: number | null = null;
    let nextFixtures: ReturnType<typeof fixturesFor> = [];

    for (let gw = currentGw; gw < currentGw + HORIZON; gw++) {
      const fxs = fixturesFor(fixtures, p.teamId, gw);
      if (fxs.length === 0) {
        horizon.push({ gw, fixtureId: null, opponentId: null, home: false, xPts: 0, opponentIds: [] });
        continue;
      }
      const sims = gw === currentGw ? SIMS_NEXT : SIMS_HORIZON;
      let samples: Samples | null = null;
      fxs.forEach((f, i) => {
        const opponent = teamById.get(f.opponentId)!;
        const { score, keyZone } = matchupScore(p.occupation, opponent.vulnerability, league);
        const s = simulate(p, team, opponent, f.home, score, sims, p.id * 1000 + gw * 10 + i);
        samples = samples ? combine(samples, s) : s;
        if (gw === currentGw && i === 0) {
          nextMatchup = score;
          nextKeyZone = keyZone;
        }
      });
      const summary = summarizeSamples(samples!);
      horizon.push({ gw, fixtureId: fxs[0].fixture.id, opponentId: fxs[0].opponentId, home: fxs[0].home, xPts: summary.xPts, opponentIds: fxs.map((f) => f.opponentId) });
      if (gw === currentGw) {
        next = summary;
        nextFixtures = fxs;
      }
    }

    const first = nextFixtures[0] ?? null;
    const opponent = first ? teamById.get(first.opponentId)! : null;
    const teamXg = opponent ? expectedGoals(team, opponent, first!.home) : 0;
    const { pStart } = effectiveStart(p);
    const why = explain({
      player: p,
      team,
      opponent,
      home: first?.home ?? false,
      teamXg,
      teamAvgXg: LEAGUE_GOALS * team.attack,
      pStartEff: pStart,
      teamCleanSheet: opponent ? Math.exp(-expectedGoals(opponent, team, !first!.home)) : 0,
      matchup: nextMatchup,
      keyZone: nextKeyZone,
      xPts: next.xPts,
      sd: next.sd,
      fixtureCount: nextFixtures.length,
      league,
      percentile,
    });

    projections[p.id] = {
      playerId: p.id,
      gw: currentGw,
      fixtureId: first?.fixture.id ?? null,
      opponentId: first?.opponentId ?? null,
      home: first?.home ?? false,
      ...next,
      pStartEff: pStart,
      fixtureFactor: opponent ? teamXg / (LEAGUE_GOALS * team.attack) : 0,
      matchup: nextMatchup,
      keyZone: nextKeyZone,
      ...why,
      horizon,
      fixtureCount: nextFixtures.length,
      horizonTotal: horizon.reduce((s, h) => s + h.xPts, 0),
      value: next.xPts / p.price,
    };
  }

  return {
    season: data.season,
    currentGw,
    deadline: data.deadline,
    fetchedAt: data.fetchedAt,
    source: data.source,
    teams,
    players,
    fixtures,
    projections,
    teamProjections,
    leagueVulnerability: league,
  };
}
