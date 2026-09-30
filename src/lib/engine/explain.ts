import type { Confidence, Player, Reason, Team, ZoneGrid } from "@/lib/types";
import type { PercentileFn } from "./stats";
import { seasonStats } from "./stats";
import { attackingShareIn, LANES, ROWS, zoneLane, zoneRatio, zoneRow } from "./zones";

export interface ExplainInput {
  player: Player;
  team: Team;
  opponent: Team | null;
  home: boolean;
  teamXg: number;
  teamAvgXg: number;
  pStartEff: number;
  /** Team clean-sheet probability — independent of whether this player features. */
  teamCleanSheet: number;
  matchup: number;
  keyZone: number | null;
  xPts: number;
  sd: number;
  fixtureCount: number;
  league: ZoneGrid;
  percentile: PercentileFn;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const positionNoun = { GK: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" } as const;

export function describeZone(zone: number): string {
  return `${LANES[zoneLane(zone)].toLowerCase()} (${ROWS[zoneRow(zone)].toLowerCase()})`;
}

/**
 * Turns the model's inputs into ranked, human-readable drivers. Every projection must be able
 * to answer "why?" — this is where the answer is assembled.
 */
export function explain(input: ExplainInput) {
  const { player: p, opponent, pStartEff, matchup, keyZone } = input;
  const reasons: Reason[] = [];
  const risks: string[] = [];
  const stats = seasonStats(p);

  if (!opponent) {
    return {
      reasons: [{ label: "Blank gameweek", detail: "No fixture this gameweek.", impact: "negative" as const, weight: 10 }],
      risks: ["Team has no fixture this gameweek"],
      confidence: "High" as Confidence,
      mainUncertainty: "none — player will not play",
    };
  }

  if (input.fixtureCount > 1) {
    reasons.push({ label: "Double gameweek", detail: `${input.fixtureCount} fixtures this gameweek`, impact: "positive", weight: 8 });
  }

  // Minutes
  if (pStartEff >= 0.85) {
    reasons.push({ label: "Nailed starter", detail: `${pct(pStartEff)} projected start probability`, impact: "positive", weight: 3 });
  } else if (pStartEff >= 0.6) {
    reasons.push({ label: "Some rotation risk", detail: `${pct(pStartEff)} projected start probability`, impact: "neutral", weight: 2 });
  } else {
    reasons.push({ label: "Minutes risk", detail: `Only ${pct(pStartEff)} projected start probability`, impact: "negative", weight: 5 });
  }

  // Fixture
  const lift = input.teamXg / input.teamAvgXg - 1;
  const fixtureText = `${input.team.short} projected ${input.teamXg.toFixed(2)} goals ${input.home ? "at home to" : "away at"} ${opponent.short}`;
  if (lift >= 0.1) {
    reasons.push({ label: "Favourable fixture", detail: `${fixtureText} — ${Math.round(lift * 100)}% above their average`, impact: "positive", weight: 2 + lift * 6 });
  } else if (lift <= -0.1) {
    reasons.push({ label: "Tough fixture", detail: `${fixtureText} — ${Math.round(-lift * 100)}% below their average`, impact: "negative", weight: 2 - lift * 6 });
  }

  // Tactical zone matchup — the signature signal
  const attacking = p.position === "MID" || p.position === "FWD" || (p.position === "DEF" && p.xg90 + p.xa90 >= 0.12);
  if (attacking && keyZone !== null && matchup >= 1.06) {
    const conceded = opponent.vulnerability[keyZone];
    const relative = zoneRatio(conceded, input.league[keyZone]);
    reasons.push({
      label: "Zone matchup",
      detail: `${opponent.short} concede ${pct(conceded)} of chance volume from the ${describeZone(keyZone)} (${relative.toFixed(1)}× league average) — ${pct(attackingShareIn(p.occupation, keyZone))} of ${p.webName}'s attacking work happens there`,
      impact: "positive",
      weight: 2 + (matchup - 1) * 20,
    });
  } else if (attacking && matchup <= 0.94) {
    reasons.push({ label: "Zone mismatch", detail: `${opponent.short} are strong in the areas ${p.webName} operates`, impact: "negative", weight: 2 + (1 - matchup) * 20 });
  }

  // Underlying numbers
  if (p.position !== "GK") {
    const xgiPct = input.percentile(p, "xgi90");
    const xgi = (p.xg90 + p.xa90).toFixed(2);
    if (xgiPct >= 75) {
      reasons.push({ label: "Elite underlying numbers", detail: `xGI ${xgi}/90 — top ${100 - xgiPct}% of ${positionNoun[p.position]}`, impact: "positive", weight: 2 + (xgiPct - 75) / 8 });
    } else if (xgiPct <= 25 && (p.position === "MID" || p.position === "FWD")) {
      reasons.push({ label: "Low attacking threat", detail: `xGI ${xgi}/90 — bottom ${xgiPct}% of ${positionNoun[p.position]}`, impact: "negative", weight: 2 });
    }
  }

  if (p.penalties) reasons.push({ label: "On penalties", detail: "First-choice penalty taker", impact: "positive", weight: 1.8 });
  if (p.setPieces) reasons.push({ label: "Set-piece duties", detail: "Takes corners and wide free kicks", impact: "positive", weight: 1.2 });

  if (stats.recentReturns >= 3) {
    reasons.push({ label: "Hot form", detail: `${stats.recentReturns} attacking returns in last ${stats.recentPoints.length}`, impact: "positive", weight: 1.2 + stats.recentReturns * 0.2 });
  }

  if (p.position === "GK" || p.position === "DEF") {
    const cs = input.teamCleanSheet;
    if (cs >= 0.38) reasons.push({ label: "Clean-sheet chance", detail: `${input.team.short} keep a clean sheet ${pct(cs)} of the time in this fixture`, impact: "positive", weight: 2 + cs * 3 });
    else if (cs <= 0.2) reasons.push({ label: "Clean sheet unlikely", detail: `${input.team.short} keep a clean sheet only ${pct(cs)} of the time in this fixture`, impact: "negative", weight: 2 });
  }
  if ((p.position === "DEF" || p.position === "MID") && p.defcon90 >= 0.4) {
    reasons.push({ label: "Defensive contributions", detail: `Hits the DefCon threshold in ~${pct(p.defcon90)} of full games`, impact: "positive", weight: 1.3 });
  }

  // Risks
  if (p.news) risks.push(p.news);
  if (pStartEff < 0.75 && p.status === "available") risks.push(`Rotation: started ${stats.starts} of ${p.history.length} gameweeks`);
  if (opponent.xgaTrend <= -0.15) risks.push(`${opponent.short} have tightened up — ${Math.abs(opponent.xgaTrend).toFixed(2)} fewer xGA per game over the last five`);
  if (stats.minutes < 270) risks.push("Small sample — under 270 minutes this season");
  if (lift <= -0.15) risks.push(`Difficult fixture against ${opponent.short}`);

  // Confidence + main uncertainty
  const cv = input.xPts > 0 ? input.sd / input.xPts : 0;
  let confidence: Confidence = "High";
  let mainUncertainty = "normal match variance";
  if (p.status !== "available") {
    confidence = "Low";
    mainUncertainty = p.status === "doubtful" ? "fitness" : "availability";
  } else if (pStartEff < 0.6) {
    confidence = "Low";
    mainUncertainty = "minutes";
  } else if (pStartEff < 0.82) {
    confidence = "Medium";
    mainUncertainty = "minutes";
  } else if (stats.minutes < 270) {
    confidence = "Medium";
    mainUncertainty = "limited sample";
  } else if (cv > 1.05) {
    confidence = "Medium";
    mainUncertainty = "return volatility";
  }

  reasons.sort((a, b) => b.weight - a.weight);
  return { reasons, risks, confidence, mainUncertainty };
}
