import type { PlayerSummary, Position } from "@/lib/types";

export const BUDGET = 100;
export const MAX_PER_CLUB = 3;
export const SQUAD_SHAPE: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MIN_STARTERS: Record<Position, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];
const Z90 = 1.2816;

export type Horizon = 1 | 5;
export type Lookup = Map<number, PlayerSummary>;

export const horizonScore = (p: PlayerSummary, horizon: Horizon) => (horizon === 1 ? p.xPts : p.horizonTotal);
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function squadCost(ids: number[], byId: Lookup): number {
  return round1(ids.reduce((sum, id) => sum + (byId.get(id)?.price ?? 0), 0));
}

export function validateSquad(ids: number[], byId: Lookup): string[] {
  const errors: string[] = [];
  if (new Set(ids).size !== ids.length) errors.push("Squad contains the same player twice.");
  const players = ids.map((id) => byId.get(id)).filter((p): p is PlayerSummary => Boolean(p));
  if (players.length !== ids.length) errors.push("Squad contains players missing from the data feed.");
  for (const pos of POSITIONS) {
    const count = players.filter((p) => p.position === pos).length;
    if (count !== SQUAD_SHAPE[pos]) errors.push(`Needs ${SQUAD_SHAPE[pos]} ${pos}, has ${count}.`);
  }
  const clubs = new Map<string, number>();
  for (const p of players) clubs.set(p.teamShort, (clubs.get(p.teamShort) ?? 0) + 1);
  for (const [club, n] of clubs) if (n > MAX_PER_CLUB) errors.push(`${n} players from ${club} (max ${MAX_PER_CLUB}).`);
  const cost = squadCost(ids, byId);
  if (cost > BUDGET + 1e-9) errors.push(`Over budget by £${round1(cost - BUDGET).toFixed(1)}m.`);
  return errors;
}

export interface Lineup {
  starters: number[];
  bench: number[];
  captainId: number;
  viceId: number;
  formation: string;
}

/** Best valid XI by expected points (next GW by default), bench ordered by the same score. */
export function pickLineup(ids: number[], byId: Lookup, score: (p: PlayerSummary) => number = (p) => p.xPts): Lineup {
  const players = ids.map((id) => byId.get(id)!).sort((a, b) => score(b) - score(a));
  const starters: PlayerSummary[] = [];
  for (const pos of POSITIONS) {
    starters.push(...players.filter((p) => p.position === pos).slice(0, MIN_STARTERS[pos]));
  }
  const outfieldRest = players.filter((p) => p.position !== "GK" && !starters.includes(p));
  starters.push(...outfieldRest.slice(0, 11 - starters.length));
  const bench = players.filter((p) => !starters.includes(p));
  bench.sort((a, b) => (a.position === "GK" ? -1 : b.position === "GK" ? 1 : score(b) - score(a)));
  const byXpts = [...starters].sort((a, b) => score(b) - score(a) || b.ceiling - a.ceiling);
  const count = (pos: Position) => starters.filter((p) => p.position === pos).length;
  return {
    starters: starters.map((p) => p.id),
    bench: bench.map((p) => p.id),
    captainId: byXpts[0]?.id ?? -1,
    viceId: byXpts[1]?.id ?? -1,
    formation: `${count("DEF")}-${count("MID")}-${count("FWD")}`,
  };
}

export interface ScoreDistribution {
  expected: number;
  low: number;
  high: number;
}

/** Normal approximation of the XI's total, with the captain counted twice. */
export function projectLineup(lineup: Lineup, byId: Lookup): ScoreDistribution {
  let mean = 0;
  let variance = 0;
  for (const id of lineup.starters) {
    const p = byId.get(id)!;
    const multiplier = id === lineup.captainId ? 2 : 1;
    mean += p.xPts * multiplier;
    variance += (p.sd * multiplier) ** 2;
  }
  const sd = Math.sqrt(variance);
  return { expected: mean, low: Math.max(0, mean - Z90 * sd), high: mean + Z90 * sd };
}

export type Severity = "blocking" | "warning" | "info";
export interface Issue {
  severity: Severity;
  title: string;
  detail: string;
  playerIds: number[];
}

export const READINESS = ["Not ready", "Needs work", "Almost ready", "Ready"] as const;

export interface SquadAnalysis {
  lineup: Lineup;
  projection: ScoreDistribution;
  readiness: number;
  issues: Issue[];
  strengths: string[];
  cost: number;
  bank: number;
}

export function analyzeSquad(ids: number[], byId: Lookup): SquadAnalysis {
  const errors = validateSquad(ids, byId);
  const cost = squadCost(ids, byId);
  const lineup = pickLineup(ids, byId);
  const starters = lineup.starters.map((id) => byId.get(id)!);
  const squad = ids.map((id) => byId.get(id)!);
  const issues: Issue[] = errors.map((e) => ({ severity: "blocking", title: "Invalid squad", detail: e, playerIds: [] }));

  const unavailable = squad.filter((p) => p.status === "injured" || p.status === "suspended");
  for (const p of unavailable) {
    const starting = lineup.starters.includes(p.id);
    issues.push({
      severity: starting ? "blocking" : "warning",
      title: `${p.name} is ${p.status}`,
      detail: starting ? `No fit cover on the bench — ${p.news ?? "will not play"}.` : `${p.news ?? "Will not play"}. Dead squad slot.`,
      playerIds: [p.id],
    });
  }
  for (const p of starters.filter((s) => s.status === "doubtful")) {
    issues.push({ severity: "warning", title: `${p.name} is a doubt`, detail: p.news ?? `${p.chance}% chance of playing`, playerIds: [p.id] });
  }
  const rotation = starters.filter((p) => p.status === "available" && p.pStartEff < 0.75);
  if (rotation.length > 0) {
    issues.push({
      severity: "warning",
      title: `${rotation.length} rotation risk${rotation.length > 1 ? "s" : ""} in your XI`,
      detail: rotation.map((p) => `${p.name} (${Math.round(p.pStartEff * 100)}% to start)`).join(", "),
      playerIds: rotation.map((p) => p.id),
    });
  }
  const tough = starters.filter((p) => (p.difficulty ?? 3) >= 4);
  if (tough.length >= 4) {
    issues.push({
      severity: "warning",
      title: "Heavy exposure to tough fixtures",
      detail: `${tough.length} starters face a difficulty 4–5 fixture this gameweek.`,
      playerIds: tough.map((p) => p.id),
    });
  }
  const captain = byId.get(lineup.captainId);
  if (captain && captain.ceiling * 2 < 14) {
    issues.push({
      severity: "info",
      title: "Low captain ceiling",
      detail: `${captain.name}'s 90th-percentile outcome is ${captain.ceiling * 2} points as captain. Consider a higher-upside option.`,
      playerIds: [captain.id],
    });
  }
  const benchPts = lineup.bench.reduce((s, id) => s + byId.get(id)!.xPts, 0);
  if (benchPts < 4) {
    issues.push({ severity: "info", title: "Thin bench", detail: `Bench projects ${benchPts.toFixed(1)} pts — little cover if a starter drops out.`, playerIds: lineup.bench });
  }

  const strengths: string[] = [];
  const expectedReturns = starters.reduce((s, p) => s + p.pReturn, 0);
  if (expectedReturns >= 5.5) strengths.push(`Strong attacking exposure — ${expectedReturns.toFixed(1)} expected returns across the XI`);
  const easy = starters.filter((p) => (p.difficulty ?? 3) <= 2).length;
  if (easy >= 5) strengths.push(`Good fixture coverage — ${easy} starters have a difficulty 1–2 fixture`);
  if (captain && captain.confidence === "High") strengths.push(`Reliable captain — ${captain.name} projects ${(captain.xPts * 2).toFixed(1)} pts as captain`);
  if (rotation.length === 0 && starters.every((p) => p.status === "available")) strengths.push("Every starter is nailed and fit");

  const blocking = issues.filter((i) => i.severity === "blocking").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const readiness = blocking > 0 ? 0 : warnings >= 2 ? 1 : warnings === 1 ? 2 : 3;

  return {
    lineup,
    projection: projectLineup(lineup, byId),
    readiness,
    issues,
    strengths,
    cost,
    bank: round1(BUDGET - cost),
  };
}

/**
 * Squad-level value: the best XI's expected points with the captain doubled. Transfers are judged
 * on how they change this, so upgrading a benchwarmer who won't play scores (correctly) near zero.
 */
export function squadValue(ids: number[], byId: Lookup, horizon: Horizon): number {
  const score = (p: PlayerSummary) => horizonScore(p, horizon);
  const lineup = pickLineup(ids, byId, score);
  const total = lineup.starters.reduce((s, id) => s + score(byId.get(id)!), 0);
  return total + score(byId.get(lineup.captainId)!);
}

export interface TransferSuggestion {
  outId: number;
  inId: number;
  gain: number;
  why: string[];
}

function clubCounts(ids: number[], byId: Lookup) {
  const counts = new Map<number, number>();
  for (const id of ids) {
    const team = byId.get(id)!.teamId;
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  return counts;
}

export function canAfford(out: PlayerSummary, candidate: PlayerSummary, bank: number) {
  return candidate.price <= round1(bank + out.price) + 1e-9;
}

export function isEligibleReplacement(ids: number[], byId: Lookup, out: PlayerSummary, candidate: PlayerSummary): boolean {
  if (candidate.position !== out.position || ids.includes(candidate.id)) return false;
  const counts = clubCounts(ids, byId);
  const sameClub = candidate.teamId === out.teamId;
  return sameClub || (counts.get(candidate.teamId) ?? 0) < MAX_PER_CLUB;
}

function transferReasons(out: PlayerSummary, inn: PlayerSummary, horizon: Horizon): string[] {
  const why: string[] = [];
  if (out.status !== "available") why.push(`${out.name}: ${out.news ?? out.status}`);
  if (inn.pStartEff - out.pStartEff >= 0.15) {
    why.push(`Minutes: ${Math.round(inn.pStartEff * 100)}% vs ${Math.round(out.pStartEff * 100)}% start probability`);
  }
  const fixtureLabel = (p: PlayerSummary) => (p.opponentShort ? `${p.opponentShort} (${p.home ? "H" : "A"})` : "blank");
  if ((out.difficulty ?? 3) - (inn.difficulty ?? 3) >= 1) why.push(`Fixture: ${fixtureLabel(inn)} vs ${fixtureLabel(out)}`);
  if (inn.matchup - out.matchup >= 0.06) why.push(`Better zone matchup (${inn.matchup.toFixed(2)}× vs ${out.matchup.toFixed(2)}×)`);
  if (horizon === 5) {
    const easyIn = inn.horizon.filter((h) => (h.difficulty ?? 3) <= 2).length;
    const easyOut = out.horizon.filter((h) => (h.difficulty ?? 3) <= 2).length;
    if (easyIn > easyOut) why.push(`${easyIn} favourable fixtures in the next 5 (vs ${easyOut})`);
  }
  if (why.length === 0) why.push(`Stronger underlying projection (${inn.xPts.toFixed(1)} vs ${out.xPts.toFixed(1)} xPts)`);
  return why.slice(0, 3);
}

export function suggestTransfers(
  ids: number[],
  all: PlayerSummary[],
  byId: Lookup,
  horizon: Horizon,
  dismissed: ReadonlySet<string> = new Set(),
  limit = 3,
): TransferSuggestion[] {
  const bank = BUDGET - squadCost(ids, byId);
  const baseline = squadValue(ids, byId, horizon);
  const best: TransferSuggestion[] = [];
  for (const outId of ids) {
    const out = byId.get(outId)!;
    let top: TransferSuggestion | null = null;
    for (const cand of all) {
      if (cand.status === "injured" || cand.status === "suspended" || cand.chance < 75) continue;
      if (!isEligibleReplacement(ids, byId, out, cand) || !canAfford(out, cand, bank)) continue;
      if (dismissed.has(`${outId}:${cand.id}`)) continue;
      // Cheap pre-filter: a player who doesn't out-project the outgoing one can't improve the XI.
      if (horizonScore(cand, horizon) <= horizonScore(out, horizon)) continue;
      const gain = squadValue(applyTransfer(ids, outId, cand.id), byId, horizon) - baseline;
      if (!top || gain > top.gain) top = { outId, inId: cand.id, gain, why: [] };
    }
    if (top && top.gain > 0.3) best.push(top);
  }
  best.sort((a, b) => b.gain - a.gain);
  const usedIn = new Set<number>();
  const picked: TransferSuggestion[] = [];
  for (const s of best) {
    if (usedIn.has(s.inId)) continue;
    usedIn.add(s.inId);
    picked.push({ ...s, why: transferReasons(byId.get(s.outId)!, byId.get(s.inId)!, horizon) });
    if (picked.length === limit) break;
  }
  return picked;
}

export function applyTransfer(ids: number[], outId: number, inId: number): number[] {
  return ids.map((id) => (id === outId ? inId : id));
}

export interface CaptainOption {
  playerId: number;
  expected: number;
  ceiling: number;
  ownership: number;
  risk: "Low" | "Medium" | "High";
}

export function captainOptions(lineup: Lineup, byId: Lookup, limit = 4): CaptainOption[] {
  const risk = { High: "Low", Medium: "Medium", Low: "High" } as const;
  return lineup.starters
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.xPts - a.xPts)
    .slice(0, limit)
    .map((p) => ({ playerId: p.id, expected: p.xPts * 2, ceiling: p.ceiling * 2, ownership: p.ownership, risk: risk[p.confidence] }));
}

export interface Recommendation {
  ids: number[];
  /** Why each player is in the recommended 15. */
  reasons: Record<number, string>;
}

const BANDS: [Position, number][] = [
  ["GK", 5.0], ["GK", 4.0],
  ["DEF", 6.0], ["DEF", 5.5], ["DEF", 5.0], ["DEF", 4.5], ["DEF", 4.0],
  ["MID", 13.0], ["MID", 9.5], ["MID", 7.5], ["MID", 6.5], ["MID", 4.5],
  ["FWD", 12.0], ["FWD", 7.5], ["FWD", 5.5],
];
const NOUN: Record<Position, string> = { GK: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" };

/**
 * Recommended £100m squad: fill a realistic price structure with the best next-five projection in
 * each band, then spend leftover budget on the upgrades that lift the best XI most. Every pick
 * carries a plain-English reason.
 */
export function recommendSquad(all: PlayerSummary[]): Recommendation {
  const picked: number[] = [];
  const reasons: Record<number, string> = {};
  const clubCount = new Map<number, number>();
  let spent = 0;
  let reserved = BANDS.reduce((s, [pos]) => s + (pos === "GK" || pos === "DEF" ? 4.0 : 4.5), 0);
  for (const [pos, cap] of BANDS) {
    reserved -= pos === "GK" || pos === "DEF" ? 4.0 : 4.5;
    const eligible = all
      .filter((p) => p.position === pos && !picked.includes(p.id))
      .filter((p) => (clubCount.get(p.teamId) ?? 0) < MAX_PER_CLUB)
      .filter((p) => p.status === "available" || (p.status === "doubtful" && p.chance >= 75))
      // Never spend money the remaining slots need.
      .filter((p) => spent + p.price + reserved <= BUDGET);
    const floor = cap - 1.5;
    const inBand = eligible.filter((p) => p.price <= cap && p.price >= floor);
    const pool = inBand.length > 0 ? inBand : eligible.filter((p) => p.price <= cap);
    const ranked = [...pool].sort((a, b) => b.horizonTotal - a.horizonTotal);
    const choice = ranked[0] ?? [...eligible].sort((a, b) => a.price - b.price)[0];
    if (!choice) throw new Error(`recommendSquad: no eligible ${pos} within budget`);
    const runnerUp = ranked[1];
    reasons[choice.id] =
      `Best projection over the next five (${choice.horizonTotal.toFixed(1)} xPts) among ${NOUN[pos]} priced £${floor.toFixed(1)}–${cap.toFixed(1)}m` +
      (runnerUp ? `, ahead of ${runnerUp.webName} (${runnerUp.horizonTotal.toFixed(1)})` : "") +
      ".";
    spent += choice.price;
    picked.push(choice.id);
    clubCount.set(choice.teamId, (clubCount.get(choice.teamId) ?? 0) + 1);
  }
  // Spend what's left the way a manager would: best XI upgrades over the next five.
  const byId: Lookup = new Map(all.map((p) => [p.id, p]));
  let squad = picked;
  for (let i = 0; i < 6; i++) {
    const [best] = suggestTransfers(squad, all, byId, 5, new Set(), 1);
    if (!best || best.gain < 0.5) break;
    const out = byId.get(best.outId)!;
    squad = applyTransfer(squad, best.outId, best.inId);
    delete reasons[best.outId];
    reasons[best.inId] = `Upgrade bought with spare budget: replaces ${out.webName} and adds ${best.gain.toFixed(1)} xPts to your best XI over the next five.`;
  }
  return { ids: squad, reasons };
}

export function defaultSquad(all: PlayerSummary[]): number[] {
  return recommendSquad(all).ids;
}

export interface SelectionExplanation {
  role: string;
  lines: string[];
}

/** Why a player sits where they do in the XI — starter, bench, captain — in plain English. */
export function explainSelection(id: number, lineup: Lineup, byId: Lookup): SelectionExplanation {
  const p = byId.get(id)!;
  const starters = lineup.starters.map((x) => byId.get(x)!);
  const bench = lineup.bench.map((x) => byId.get(x)!);
  const samePos = [...starters, ...bench].filter((x) => x.position === p.position).sort((a, b) => b.xPts - a.xPts);
  const rank = samePos.findIndex((x) => x.id === id) + 1;
  const lines: string[] = [];
  const starting = lineup.starters.includes(id);
  let role = starting ? "Starting" : `Bench ${lineup.bench.indexOf(id) === 0 && p.position === "GK" ? "GK" : lineup.bench.indexOf(id)}`;

  if (id === lineup.captainId) {
    role = "Captain";
    const second = starters.filter((x) => x.id !== id).sort((a, b) => b.xPts - a.xPts)[0];
    lines.push(`Captain: the highest projection in your XI — ${p.xPts.toFixed(1)} xPts, ${(p.xPts * 2).toFixed(1)} doubled, with a ${p.ceiling * 2}-point ceiling.` + (second ? ` Next best is ${second.webName} at ${second.xPts.toFixed(1)}.` : ""));
  } else if (id === lineup.viceId) {
    role = "Vice-captain";
    lines.push(`Vice-captain: second-highest projection in your XI (${p.xPts.toFixed(1)} xPts), so the armband falls here if your captain doesn't play.`);
  }

  if (starting) {
    const benched = bench.filter((x) => x.position === p.position).sort((a, b) => b.xPts - a.xPts)[0];
    lines.push(`Starts as your ${rank === 1 ? "best" : `${ordinal(rank)}-best`} ${POSITION_WORD[p.position]} this gameweek (${p.xPts.toFixed(1)} xPts).` + (benched ? ` ${benched.webName} (${benched.xPts.toFixed(1)}) sits out.` : ""));
  } else if (p.position === "GK") {
    lines.push(`Backup keeper: projects ${p.xPts.toFixed(1)} xPts, below your starter.`);
  } else {
    const weakest = starters.filter((x) => x.position === p.position).sort((a, b) => a.xPts - b.xPts)[0];
    const weakestOutfield = starters.filter((x) => x.position !== "GK").sort((a, b) => a.xPts - b.xPts)[0];
    const compare = weakest ?? weakestOutfield;
    lines.push(`On the bench: ${p.xPts.toFixed(1)} xPts is below ${compare.webName} (${compare.xPts.toFixed(1)}), the weakest starter who could make way.`);
  }
  return { role, lines };
}

const ordinal = (n: number) => (n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const POSITION_WORD: Record<Position, string> = { GK: "goalkeeper", DEF: "defender", MID: "midfielder", FWD: "forward" };
