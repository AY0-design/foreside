import type { Player, Position } from "@/lib/types";

export interface SeasonStats {
  minutes: number;
  starts: number;
  points: number;
  goals: number;
  assists: number;
  ppg: number;
  /** Games with a goal or assist in the last six. */
  recentReturns: number;
  recentPoints: number[];
}

export function seasonStats(p: Player): SeasonStats {
  const minutes = p.history.reduce((s, h) => s + h.minutes, 0);
  const points = p.history.reduce((s, h) => s + h.points, 0);
  const appearances = p.history.filter((h) => h.minutes > 0).length;
  const recent = p.history.slice(-6);
  return {
    minutes,
    starts: p.history.filter((h) => h.minutes >= 45).length,
    points,
    goals: p.history.reduce((s, h) => s + h.goals, 0),
    assists: p.history.reduce((s, h) => s + h.assists, 0),
    ppg: appearances > 0 ? points / appearances : 0,
    recentReturns: recent.filter((h) => h.goals + h.assists > 0).length,
    recentPoints: recent.map((h) => h.points),
  };
}

export const METRICS = {
  xg90: { label: "xG", per90: true, format: 2 },
  xa90: { label: "xA", per90: true, format: 2 },
  xgi90: { label: "xGI", per90: true, format: 2 },
  defcon90: { label: "DefCon hit rate", per90: false, format: 0 },
  ppg: { label: "Points per game", per90: false, format: 1 },
  minutesShare: { label: "Minutes share", per90: false, format: 0 },
} as const;

export type Metric = keyof typeof METRICS;

export function metricValue(p: Player, metric: Metric): number {
  switch (metric) {
    case "xg90":
      return p.xg90;
    case "xa90":
      return p.xa90;
    case "xgi90":
      return p.xg90 + p.xa90;
    case "defcon90":
      return p.defcon90;
    case "ppg":
      return seasonStats(p).ppg;
    case "minutesShare":
      return seasonStats(p).minutes / Math.max(1, p.history.length * 90);
  }
}

export type PercentileFn = (p: Player, metric: Metric) => number;

/** Percentile rank (0–100) of a player within their position, among regulars. */
export function buildPercentiles(players: Player[]): PercentileFn {
  const pools = new Map<string, number[]>();
  const regulars = players.filter((p) => seasonStats(p).minutes >= 180);
  for (const metric of Object.keys(METRICS) as Metric[]) {
    for (const position of ["GK", "DEF", "MID", "FWD"] as Position[]) {
      const values = regulars
        .filter((p) => p.position === position)
        .map((p) => metricValue(p, metric))
        .sort((a, b) => a - b);
      pools.set(`${position}:${metric}`, values);
    }
  }
  return (p, metric) => {
    const pool = pools.get(`${p.position}:${metric}`) ?? [];
    if (pool.length === 0) return 50;
    const v = metricValue(p, metric);
    const below = pool.filter((x) => x < v).length;
    const equal = pool.filter((x) => x === v).length;
    return Math.round(((below + equal / 2) / pool.length) * 100);
  };
}
