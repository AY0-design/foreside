import type { Model, PlayerSummary } from "@/lib/types";
import { exploitsForGw } from "./matchups";
import { describeZone } from "./explain";
import { vulnerabilityRatio } from "./zones";

export interface Sentiment {
  word: "attacking" | "balanced" | "tight";
  goalsPerMatch: number;
}

/** Fey's "the markets are neutral", for a gameweek: is this an open or a cagey round? */
export function gameweekSentiment(model: Model, gw = model.currentGw): Sentiment {
  const rows = model.teamProjections.filter((t) => t.gw === gw);
  const fixtures = new Set(rows.map((r) => r.fixtureId)).size || 1;
  const goalsPerMatch = rows.reduce((s, r) => s + r.xG, 0) / fixtures;
  return { word: goalsPerMatch >= 3.0 ? "attacking" : goalsPerMatch <= 2.6 ? "tight" : "balanced", goalsPerMatch };
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/** Fey's "news summary" panel for a team: where they rank and where they're vulnerable. */
export function teamSummary(model: Model, teamId: number): string[] {
  const team = model.teams.find((t) => t.id === teamId)!;
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const attackRank = [...model.teams].sort((a, b) => b.attack - a.attack).findIndex((t) => t.id === teamId) + 1;
  const defenceRank = [...model.teams].sort((a, b) => a.defenceWeakness - b.defenceWeakness).findIndex((t) => t.id === teamId) + 1;
  const out = [`${team.name} have the ${ordinal(attackRank)}-best attack and the ${ordinal(defenceRank)}-best defence in the league by blended xG.`];
  const ratio = vulnerabilityRatio(team.vulnerability, model.leagueVulnerability);
  let hot = 10;
  for (let z = 10; z < 20; z++) if (team.vulnerability[z] - model.leagueVulnerability[z] > team.vulnerability[hot] - model.leagueVulnerability[hot]) hot = z;
  out.push(`They are most open in the ${describeZone(hot)}, conceding ${ratio[hot].toFixed(1)}× the league-average share of chances there.`);
  const next = model.teamProjections.filter((t) => t.teamId === teamId).sort((a, b) => a.gw - b.gw);
  if (next[0]) {
    const opp = teamById.get(next[0].opponentId)!;
    out.push(`Next up: ${next[0].home ? "home to" : "away at"} ${opp.name}, projected ${next[0].xG.toFixed(1)}–${next[0].xGA.toFixed(1)} with a ${Math.round(next[0].pCleanSheet * 100)}% clean-sheet chance.`);
  }
  const easy = next.filter((t) => t.xG >= 1.55).length;
  if (next.length) out.push(`${easy} of their next ${next.length} fixtures project 1.55+ goals for them.`);
  if (team.xgaTrend <= -0.15) out.push(`Their defence has tightened recently (${Math.abs(team.xgaTrend).toFixed(2)} fewer xGA per game).`);
  else if (team.xgaTrend >= 0.15) out.push(`Their defence has been leakier recently (+${team.xgaTrend.toFixed(2)} xGA per game).`);
  return out;
}

/**
 * Fey's daily recap, written from the numbers: the round's biggest attack, safest defence,
 * the standout zone exploit, the top projection and the doubts that matter.
 */
export function gameweekBrief(model: Model, players: PlayerSummary[], gw = model.currentGw): string[] {
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = model.teamProjections.filter((t) => t.gw === gw);
  if (rows.length === 0) return [`No fixtures are scheduled for gameweek ${gw}.`];
  const out: string[] = [];

  const attack = [...rows].sort((a, b) => b.xG - a.xG)[0];
  const a = teamById.get(attack.teamId)!;
  const ao = teamById.get(attack.opponentId)!;
  out.push(`${a.name} are the round’s biggest attack, projected ${attack.xG.toFixed(1)} goals ${attack.home ? "at home to" : "away at"} ${ao.name}.`);

  const cs = [...rows].sort((x, y) => y.pCleanSheet - x.pCleanSheet)[0];
  out.push(`${teamById.get(cs.teamId)!.name} have the best clean-sheet odds at ${Math.round(cs.pCleanSheet * 100)}%.`);

  const exploit = exploitsForGw(model, gw)[0];
  if (exploit) {
    const p = byId.get(exploit.playerId);
    const opp = teamById.get(exploit.opponentId)!;
    if (p) out.push(`${opp.name} leave the ${describeZone(exploit.zone)} open (${exploit.zoneRatio.toFixed(1)}× league average), and ${Math.round(exploit.playerShare * 100)}% of ${p.webName}’s chances come from exactly there.`);
  }

  const top = [...players].filter((p) => p.status === "available").sort((x, y) => y.xPts - x.xPts)[0];
  if (top) out.push(`${top.webName} leads the projections on ${top.xPts.toFixed(1)} expected points.`);

  const doubts = players.filter((p) => p.status !== "available" && p.ownership >= 10).sort((x, y) => y.ownership - x.ownership).slice(0, 3);
  if (doubts.length) out.push(`${doubts.map((d) => `${d.webName} (${d.status === "doubtful" ? `${d.chance}%` : "out"})`).join(", ")} ${doubts.length > 1 ? "are" : "is"} the doubts that matter most.`);

  return out;
}
