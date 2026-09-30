import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/data/demo";
import { summarize } from "@/lib/data/summaries";
import { buildModel } from "./project";
import { blob, matchupScore, normalize, ZONE_COUNT } from "./zones";
import {
  analyzeSquad,
  applyTransfer,
  BUDGET,
  defaultSquad,
  MAX_PER_CLUB,
  pickLineup,
  squadCost,
  squadValue,
  suggestTransfers,
  validateSquad,
} from "./squad";
import { differentials } from "./picks";

const model = buildModel(generateDemoData());
const all = summarize(model);
const byId = new Map(all.map((p) => [p.id, p]));

describe("demo data", () => {
  it("is deterministic for a seed", () => {
    const a = generateDemoData(7);
    const b = generateDemoData(7);
    expect(a.players.map((p) => [p.name, p.price])).toEqual(b.players.map((p) => [p.name, p.price]));
  });

  it("gives every team exactly one fixture per gameweek across 38 gameweeks", () => {
    for (let gw = 1; gw <= 38; gw++) {
      const teams = model.fixtures.filter((f) => f.gw === gw).flatMap((f) => [f.homeId, f.awayId]);
      expect(new Set(teams).size).toBe(20);
      expect(teams.length).toBe(20);
    }
  });
});

describe("zones", () => {
  it("normalises grids to a share of 1", () => {
    const g = blob(1, 2, 0.8, 0.6);
    expect(g).toHaveLength(ZONE_COUNT);
    expect(g.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(normalize(new Array(ZONE_COUNT).fill(0)).every((v) => v === 1 / ZONE_COUNT)).toBe(true);
  });

  it("clamps the matchup multiplier and returns neutral for players with no attacking footprint", () => {
    const league = normalize(new Array(ZONE_COUNT).fill(1));
    const extreme = new Array(ZONE_COUNT).fill(0);
    extreme[17] = 1;
    const winger = blob(2, 3, 0.4, 0.3);
    expect(matchupScore(winger, extreme, league).score).toBeLessThanOrEqual(1.3);
    const keeper = blob(2, 0, 0.3, 0.2);
    expect(matchupScore(keeper, extreme, league).score).toBe(1);
  });
});

describe("projections", () => {
  it("projects zero for injured and suspended players", () => {
    const out = all.filter((p) => p.status === "injured" || p.status === "suspended");
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) expect(p.xPts).toBe(0);
  });

  it("never reports high confidence for doubtful players", () => {
    for (const p of all.filter((x) => x.status === "doubtful")) expect(p.confidence).toBe("Low");
  });

  it("keeps projections in a plausible FPL range", () => {
    const top = Math.max(...all.map((p) => p.xPts));
    expect(top).toBeGreaterThan(4);
    expect(top).toBeLessThan(13);
    for (const p of all) {
      expect(p.floor).toBeLessThanOrEqual(p.ceiling);
      expect(p.pReturn).toBeGreaterThanOrEqual(0);
      expect(p.pReturn).toBeLessThanOrEqual(1);
    }
  });

  it("explains every playable projection", () => {
    for (const proj of Object.values(model.projections)) expect(proj.reasons.length).toBeGreaterThan(0);
  });
});

describe("squad", () => {
  const squad = defaultSquad(all);

  it("builds a valid default squad within budget", () => {
    expect(squad).toHaveLength(15);
    expect(validateSquad(squad, byId)).toEqual([]);
    expect(squadCost(squad, byId)).toBeLessThanOrEqual(BUDGET);
  });

  it("picks a legal XI", () => {
    const lineup = pickLineup(squad, byId);
    expect(lineup.starters).toHaveLength(11);
    expect(lineup.bench).toHaveLength(4);
    const pos = (id: number) => byId.get(id)!.position;
    expect(lineup.starters.filter((id) => pos(id) === "GK")).toHaveLength(1);
    expect(lineup.starters.filter((id) => pos(id) === "DEF").length).toBeGreaterThanOrEqual(3);
    expect(lineup.starters.filter((id) => pos(id) === "FWD").length).toBeGreaterThanOrEqual(1);
    expect(byId.get(lineup.bench[0])!.position).toBe("GK");
    expect(lineup.starters).toContain(lineup.captainId);
    expect(lineup.captainId).not.toBe(lineup.viceId);
  });

  // The default squad arrives optimised, so weaken it: swap its best midfielder for a cheap non-starter.
  const bestMid = squad.map((id) => byId.get(id)!).filter((p) => p.position === "MID").sort((a, b) => b.xPts - a.xPts)[0];
  const benchwarmer = all
    .filter((p) => p.position === "MID" && !squad.includes(p.id) && p.pStartEff < 0.3 && p.price <= bestMid.price)
    .find((p) => validateSquad(applyTransfer(squad, bestMid.id, p.id), byId).length === 0)!;
  const weakened = applyTransfer(squad, bestMid.id, benchwarmer.id);

  it("only suggests affordable, same-position, club-legal, fit replacements", () => {
    for (const horizon of [1, 5] as const) {
      const suggestions = suggestTransfers(weakened, all, byId, horizon);
      expect(suggestions.length).toBeGreaterThan(0);
      for (const s of suggestions) {
        const out = byId.get(s.outId)!;
        const inn = byId.get(s.inId)!;
        expect(inn.position).toBe(out.position);
        expect(["injured", "suspended"]).not.toContain(inn.status);
        const next = applyTransfer(weakened, s.outId, s.inId);
        expect(validateSquad(next, byId)).toEqual([]);
        expect(s.gain).toBeGreaterThan(0);
        expect(s.why.length).toBeGreaterThan(0);
      }
    }
  });

  it("values transfers by the change in the best XI, not player-vs-player", () => {
    for (const horizon of [1, 5] as const) {
      for (const s of suggestTransfers(weakened, all, byId, horizon)) {
        const delta = squadValue(applyTransfer(weakened, s.outId, s.inId), byId, horizon) - squadValue(weakened, byId, horizon);
        expect(s.gain).toBeCloseTo(delta, 6);
      }
    }
    // Swapping a benched player for a slightly better one who still wouldn't start adds nothing.
    const lineup = pickLineup(squad, byId);
    const benchDef = lineup.bench.map((id) => byId.get(id)!).find((p) => p.position === "DEF");
    if (benchDef) {
      const worstStartingDef = Math.min(...lineup.starters.map((id) => byId.get(id)!).filter((p) => p.position === "DEF").map((p) => p.xPts));
      const marginal = all.find((p) => p.position === "DEF" && !squad.includes(p.id) && p.xPts > benchDef.xPts && p.xPts < worstStartingDef && p.teamId === benchDef.teamId);
      if (marginal) expect(squadValue(applyTransfer(squad, benchDef.id, marginal.id), byId, 1)).toBeCloseTo(squadValue(squad, byId, 1), 6);
    }
  });

  it("respects dismissed suggestions", () => {
    const [first] = suggestTransfers(weakened, all, byId, 1);
    const again = suggestTransfers(weakened, all, byId, 1, new Set([`${first.outId}:${first.inId}`]));
    expect(again.some((s) => s.outId === first.outId && s.inId === first.inId)).toBe(false);
  });

  it("flags an over-budget or broken squad as not ready", () => {
    const priciest = [...all].sort((a, b) => b.price - a.price);
    const broken = [...squad.slice(0, 14), priciest[0].id];
    const analysis = analyzeSquad(broken, byId);
    expect(analysis.readiness).toBe(0);
    expect(analysis.issues.some((i) => i.severity === "blocking")).toBe(true);
  });

  it("detects the club limit", () => {
    const club = all[0].teamId;
    const clubDefs = all.filter((p) => p.teamId === club && p.position === "DEF").slice(0, MAX_PER_CLUB + 1).map((p) => p.id);
    const others = squad.filter((id) => byId.get(id)!.position !== "DEF");
    const errors = validateSquad([...others, ...clubDefs, all.find((p) => p.position === "DEF" && p.teamId !== club)!.id], byId);
    expect(errors.some((e) => e.includes("max"))).toBe(true);
  });
});

describe("differential finder", () => {
  it("honours ownership ceilings by risk appetite", () => {
    expect(differentials(all, "aggressive", 10).every((p) => p.ownership < 5)).toBe(true);
    expect(differentials(all, "safe", 10).every((p) => p.ownership < 10 && p.confidence === "High")).toBe(true);
  });
});

describe("recommendation and selection reasons", () => {
  it("gives every recommended player a reason", async () => {
    const { recommendSquad } = await import("./squad");
    const rec = recommendSquad(all);
    expect(rec.ids).toHaveLength(15);
    for (const id of rec.ids) expect(rec.reasons[id]).toMatch(/\w/);
  });

  it("explains captain, starters and bench consistently with the lineup", async () => {
    const { explainSelection } = await import("./squad");
    const squad = defaultSquad(all);
    const lineup = pickLineup(squad, byId);
    expect(explainSelection(lineup.captainId, lineup, byId).role).toBe("Captain");
    for (const id of lineup.bench) expect(explainSelection(id, lineup, byId).role).toMatch(/^Bench/);
    for (const id of lineup.starters) expect(explainSelection(id, lineup, byId).lines.length).toBeGreaterThan(0);
  });
});
