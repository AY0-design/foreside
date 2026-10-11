/**
 * The recommendation record: what Foreside would have told you before a deadline, saved so it can
 * later be held against what happened. One file per gameweek (data/recommendations/gw-N.json),
 * rewritten by each sync while the deadline is open and never touched once it has passed.
 */
import type { Model } from "@/lib/types";
import { summarize } from "./summaries";
import { captainPicks, topProjected } from "@/lib/engine/picks";
import { pickLineup, recommendSquad } from "@/lib/engine/squad";

export interface Recommendation {
  gw: number;
  /** When this record was written, and the FPL deadline it was written ahead of. */
  recordedAt: string;
  deadline: string;
  /** When the underlying data was synced. */
  dataFetchedAt: string | null;
  /** The recommended squad as the Squad page shows it. */
  squad: { ids: number[]; starters: number[]; bench: number[]; captainId: number; viceId: number; formation: string; expectedXI: number };
  /** Ranked player ids. */
  captains: number[];
  topPicks: number[];
  /** Projected points for every player with a realistic chance of scoring, to check calibration later. */
  xPts: Record<number, number>;
}

/** Players below this are noise (injured, benched, blank) and are left out of the record. */
const MIN_XPTS = 0.3;

export function buildRecommendation(model: Model, recordedAt = new Date()): Recommendation | null {
  if (!model.deadline) return null;
  const all = summarize(model);
  const byId = new Map(all.map((p) => [p.id, p]));
  const ids = recommendSquad(all).ids;
  const lineup = pickLineup(ids, byId);
  return {
    gw: model.currentGw,
    recordedAt: recordedAt.toISOString(),
    deadline: model.deadline,
    dataFetchedAt: model.fetchedAt,
    squad: { ids, ...lineup, expectedXI: Math.round(lineup.starters.reduce((s, id) => s + byId.get(id)!.xPts, 0) * 100) / 100 },
    captains: captainPicks(all, 5).map((p) => p.id),
    topPicks: topProjected(all, 10).map((p) => p.id),
    xPts: Object.fromEntries(all.filter((p) => p.xPts >= MIN_XPTS).map((p) => [p.id, Math.round(p.xPts * 100) / 100])),
  };
}

/** A record is frozen once its deadline has passed: later syncs must never rewrite it. */
export const isFrozen = (existing: Pick<Recommendation, "deadline"> | null, now = Date.now()) => existing !== null && now >= Date.parse(existing.deadline);
