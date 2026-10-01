import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fromSnapshot, type Snapshot } from "./fpl";
import { buildModel } from "@/lib/engine/project";
import { summarize } from "./summaries";
import { defaultSquad, validateSquad } from "@/lib/engine/squad";

const file = path.join(process.cwd(), "data", "snapshot.json");

describe.skipIf(!existsSync(file))("real-data snapshot", () => {
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const data = fromSnapshot(snapshot);
  const model = buildModel(data);
  const all = summarize(model);
  const byId = new Map(all.map((p) => [p.id, p]));

  it("maps all 20 clubs with normalised zone grids and sane ratings", () => {
    expect(data.teams).toHaveLength(20);
    for (const t of data.teams) {
      expect(t.vulnerability.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(t.attack).toBeGreaterThan(0.5);
      expect(t.defenceWeakness).toBeGreaterThan(0.5);
    }
  });

  it("targets an unfinished gameweek with a deadline", () => {
    const event = snapshot.events.find((e) => e.id === data.currentGw)!;
    expect(event.finished).toBe(false);
    expect(data.deadline).toBe(event.deadline);
  });

  it("plans for the next deadline when synced while a gameweek is being played", () => {
    // FPL mid-round: the current gameweek's deadline has passed but its matches aren't finished.
    const gw = data.currentGw;
    const live: Snapshot = {
      ...snapshot,
      fetchedAt: new Date(new Date(snapshot.events.find((e) => e.id === gw)!.deadline).getTime() + 3_600_000).toISOString(),
      events: snapshot.events.map((e) => ({ ...e, isCurrent: e.id === gw, isNext: e.id === gw + 1, finished: e.id < gw })),
    };
    const during = fromSnapshot(live);
    expect(during.currentGw).toBe(gw + 1);
    expect(new Date(during.deadline!).getTime()).toBeGreaterThan(new Date(live.fetchedAt).getTime());
  });

  it("produces bounded per-90 rates and probabilities for every player", () => {
    for (const p of data.players) {
      expect(p.xg90).toBeGreaterThanOrEqual(0);
      expect(p.xg90).toBeLessThan(1.6);
      expect(p.pStart).toBeGreaterThanOrEqual(0);
      expect(p.pStart).toBeLessThanOrEqual(0.97);
      expect(p.occupation.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });

  it("measures zone footprints for most regular starters", () => {
    const regulars = data.players.filter((p) => p.position !== "GK" && p.history.filter((h) => h.minutes >= 60).length >= 3);
    const measured = regulars.filter((p) => p.zoneSource === "measured").length;
    expect(measured / regulars.length).toBeGreaterThan(0.5);
  });

  it("builds a valid default squad from real prices", () => {
    const squad = defaultSquad(all);
    expect(validateSquad(squad, byId)).toEqual([]);
  });

  it("keeps projections plausible", () => {
    const top = Math.max(...all.map((p) => p.xPts));
    expect(top).toBeGreaterThan(4);
    expect(top).toBeLessThan(14);
  });
});

describe.skipIf(!existsSync(file))("zone matchups on real data", async () => {
  const { exploitsForGw, exploitersOf, hotZones, creationGrid } = await import("@/lib/engine/matchups");
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const model = buildModel(fromSnapshot(snapshot));

  it("ranks this gameweek's exploits, strongest first, each above neutral", () => {
    const list = exploitsForGw(model);
    expect(list.length).toBeGreaterThan(5);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].score).toBeGreaterThanOrEqual(list[i].score);
    for (const e of list) {
      expect(e.matchup).toBeGreaterThanOrEqual(1.03);
      expect(e.playerShare).toBeGreaterThan(0);
    }
  });

  it("profiles every team: hot zones in chance-creating rows and a normalised creation grid", () => {
    for (const t of model.teams) {
      const zones = hotZones(t, model.leagueVulnerability);
      expect(zones.length).toBe(3);
      for (const z of zones) expect(z.zone).toBeGreaterThanOrEqual(10);
      expect(creationGrid(model, t.id).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });

  it("only lists upcoming exploiters from teams that actually face the side", () => {
    const team = model.teams[0];
    const gws = [model.currentGw, model.currentGw + 1];
    for (const e of exploitersOf(model, team.id, "upcoming", gws)) {
      const p = model.players.find((x) => x.id === e.playerId)!;
      const meets = model.fixtures.some((f) => gws.includes(f.gw) && ((f.homeId === team.id && f.awayId === p.teamId) || (f.awayId === team.id && f.homeId === p.teamId)));
      expect(meets).toBe(true);
    }
  });
});

describe.skipIf(!existsSync(file))("key zones", async () => {
  const { exploitsForGw } = await import("@/lib/engine/matchups");
  const model = buildModel(fromSnapshot(JSON.parse(readFileSync(file, "utf8")) as Snapshot));
  it("only names a key zone the player genuinely occupies and the opponent is weak in", () => {
    for (const e of exploitsForGw(model)) {
      expect(e.playerShare).toBeGreaterThanOrEqual(0.08);
      expect(e.zoneRatio).toBeGreaterThan(1);
    }
  });
});
