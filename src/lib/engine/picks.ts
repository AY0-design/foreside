import type { PlayerSummary } from "@/lib/types";

export type RiskAppetite = "safe" | "balanced" | "aggressive";

const playable = (p: PlayerSummary) => p.status !== "injured" && p.status !== "suspended" && p.opponentShort !== null;

export function topProjected(all: PlayerSummary[], n = 5) {
  return all.filter(playable).sort((a, b) => b.xPts - a.xPts).slice(0, n);
}

/** Captaincy balances expectation with ceiling, and needs a near-certain starter. */
export function captainPicks(all: PlayerSummary[], n = 5) {
  const score = (p: PlayerSummary) => p.xPts * 0.7 + p.ceiling * 0.3;
  return all
    .filter((p) => playable(p) && p.pStartEff >= 0.75)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}

export const DIFFERENTIAL_RULES: Record<RiskAppetite, { label: string; maxOwnership: number; minStart: number; describe: string }> = {
  safe: { label: "Safe", maxOwnership: 10, minStart: 0.85, describe: "Under 10% owned, nailed starters, high confidence" },
  balanced: { label: "Balanced", maxOwnership: 10, minStart: 0.7, describe: "Under 10% owned, likely starters, ranked by projection" },
  aggressive: { label: "Aggressive", maxOwnership: 5, minStart: 0.55, describe: "Under 5% owned, ranked by ceiling" },
};

export function differentials(all: PlayerSummary[], appetite: RiskAppetite = "balanced", n = 5) {
  const rule = DIFFERENTIAL_RULES[appetite];
  return all
    .filter((p) => playable(p) && p.ownership < rule.maxOwnership && p.pStartEff >= rule.minStart)
    .filter((p) => appetite !== "safe" || p.confidence === "High")
    .sort((a, b) => (appetite === "aggressive" ? b.ceiling - a.ceiling || b.xPts - a.xPts : b.xPts - a.xPts))
    .slice(0, n);
}

export function budgetPicks(all: PlayerSummary[], n = 5) {
  const cap = { GK: 4.8, DEF: 5.0, MID: 6.5, FWD: 6.5 } as const;
  return all
    .filter((p) => playable(p) && p.price <= cap[p.position] && p.pStartEff >= 0.7)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function availabilityAlerts(all: PlayerSummary[], n = 6) {
  return all
    .filter((p) => p.status !== "available" && p.ownership >= 2)
    .sort((a, b) => b.ownership - a.ownership)
    .slice(0, n);
}
