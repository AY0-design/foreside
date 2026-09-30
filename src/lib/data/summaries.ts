import type { Model, PlayerSummary, Team } from "@/lib/types";
import { difficultyFromXg, expectedGoals } from "@/lib/engine/team";
import { describeZone } from "@/lib/engine/explain";

export const playerPhoto = (code: number) => (code ? `https://resources.premierleague.com/premierleague25/photos/players/110x140/${code}.png` : null);
export const teamBadge = (team: Pick<Team, "code">) => (team.code ? `https://resources.premierleague.com/premierleague25/badges/${team.code}.svg` : null);

export function summarize(model: Model): PlayerSummary[] {
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const difficulty = (teamId: number, opponentId: number | null, home: boolean) => {
    if (opponentId === null) return null;
    return difficultyFromXg(expectedGoals(teamById.get(teamId)!, teamById.get(opponentId)!, home));
  };
  const opponents = (ids: number[]) => (ids.length ? ids.map((id) => teamById.get(id)!.short).join(" + ") : null);

  return model.players.map((p) => {
    const proj = model.projections[p.id];
    const team = teamById.get(p.teamId)!;
    const current = proj.horizon[0];
    return {
      id: p.id,
      name: p.name,
      webName: p.webName,
      photo: playerPhoto(p.code),
      teamBadge: teamBadge(team),
      teamId: p.teamId,
      teamShort: team.short,
      teamColor: team.color,
      position: p.position,
      price: p.price,
      ownership: p.ownership,
      status: p.status,
      chance: p.chance,
      news: p.news,
      xPts: proj.xPts,
      sd: proj.sd,
      floor: proj.floor,
      ceiling: proj.ceiling,
      pStartEff: proj.pStartEff,
      pReturn: proj.pReturn,
      pGoal: proj.pGoal,
      pAssist: proj.pAssist,
      pCleanSheet: proj.pCleanSheet,
      confidence: proj.confidence,
      mainUncertainty: proj.mainUncertainty,
      opponentShort: opponents(current?.opponentIds ?? []),
      home: proj.home,
      difficulty: difficulty(p.teamId, proj.opponentId, proj.home),
      fixtureCount: proj.fixtureCount,
      fixtureFactor: proj.fixtureFactor,
      matchup: proj.matchup,
      horizonTotal: proj.horizonTotal,
      horizon: proj.horizon.map((h) => ({
        gw: h.gw,
        opponentShort: opponents(h.opponentIds),
        home: h.home,
        xPts: h.xPts,
        difficulty: difficulty(p.teamId, h.opponentId, h.home),
      })),
      topReason: proj.reasons.find((r) => r.impact === "positive")?.detail ?? null,
      reasons: proj.reasons.slice(0, 5).map((r) => ({ label: r.label, detail: r.detail, impact: r.impact })),
      risks: proj.risks,
      keyZone: proj.keyZone !== null && proj.matchup >= 1.03 ? describeZone(proj.keyZone) : null,
      zoneSource: p.zoneSource,
      form: p.history.slice(-6).map((h) => h.points),
      value: proj.value,
    };
  });
}
