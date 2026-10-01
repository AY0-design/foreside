import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fromSnapshot, type Snapshot } from "./fpl";
import { overlayLive, type LiveFpl } from "./live";
import type { FplBootstrap, FplElement, FplFixture } from "./fpl-api";

const file = path.join(process.cwd(), "data", "snapshot.json");

/** FPL's payloads as they'd look for the synced snapshot, so tests can change one thing at a time. */
function fplFrom(snapshot: Snapshot): { bootstrap: FplBootstrap; fixtures: FplFixture[] } {
  const elements: FplElement[] = snapshot.players.map((p) => ({
    id: p.id, code: p.code, web_name: p.webName, first_name: p.name, second_name: "", known_name: p.name, team: p.team,
    element_type: p.elementType, now_cost: Math.round(p.price * 10), selected_by_percent: String(p.ownership), status: p.status,
    chance_of_playing_next_round: p.chance, news: p.news ?? "", minutes: p.minutes, starts: p.starts, expected_goals: String(p.xg),
    expected_assists: String(p.xa), yellow_cards: p.yellows, penalties_order: p.penaltiesOrder, corners_and_indirect_freekicks_order: p.cornersOrder,
    direct_freekicks_order: null, total_points: 0, form: "0", transfers_in_event: 0, transfers_out_event: 0,
  }));
  return {
    bootstrap: {
      teams: snapshot.teams.map((t) => ({ id: t.id, code: t.code, name: t.name, short_name: t.short })),
      events: snapshot.events.map((e) => ({ id: e.id, name: `Gameweek ${e.id}`, deadline_time: e.deadline, finished: e.finished, is_current: e.isCurrent, is_next: e.isNext })),
      elements,
    },
    fixtures: snapshot.fixtures.map((f) => ({ id: f.id, event: f.gw, team_h: f.homeId, team_a: f.awayId, kickoff_time: f.kickoff, finished: f.finished, team_h_score: f.homeScore, team_a_score: f.awayScore })),
  };
}

describe.skipIf(!existsSync(file))("live FPL overlay", () => {
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const base = fromSnapshot(snapshot);
  const live = (patch: (fpl: ReturnType<typeof fplFrom>) => void = () => {}, extra: Partial<LiveFpl> = {}): LiveFpl => {
    const fpl = fplFrom(snapshot);
    patch(fpl);
    return { fetchedAt: snapshot.fetchedAt, newGameweeks: {}, ...fpl, ...extra };
  };
  const starter = snapshot.players.find((p) => p.understat && p.status === "a" && p.minutes > 300)!;

  it("changes nothing when FPL matches the snapshot", () => {
    const merged = fromSnapshot(overlayLive(snapshot, live()));
    expect(merged.currentGw).toBe(base.currentGw);
    expect(merged.players).toHaveLength(base.players.length);
    const a = merged.players.find((p) => p.id === starter.id)!;
    const b = base.players.find((p) => p.id === starter.id)!;
    expect(a.occupation).toEqual(b.occupation);
    expect(a.status).toBe(b.status);
  });

  it("takes availability, news, price and ownership from FPL but keeps the Understat profile", () => {
    const merged = overlayLive(snapshot, live((fpl) => {
      const el = fpl.bootstrap.elements.find((e) => e.id === starter.id)!;
      Object.assign(el, { status: "i", chance_of_playing_next_round: 0, news: "Hamstring injury - Expected back 25 Oct", now_cost: 99, selected_by_percent: "42.0" });
    }));
    const p = merged.players.find((x) => x.id === starter.id)!;
    expect(p).toMatchObject({ status: "i", chance: 0, news: "Hamstring injury - Expected back 25 Oct", price: 9.9, ownership: 42 });
    expect(p.understat).toEqual(starter.understat);
    expect(fromSnapshot(merged).players.find((x) => x.id === starter.id)!.status).toBe("injured");
  });

  it("adds a newly finished gameweek to each player's history without duplicating it", () => {
    const gw = base.currentGw;
    const row = { gw, fixtures: [1], minutes: 90, points: 12, goals: 1, assists: 1, starts: 1, defcon: 0, xg: 0.8, xa: 0.3 };
    const once = overlayLive(snapshot, live(undefined, { newGameweeks: { [gw]: { [starter.id]: row } } }));
    const twice = overlayLive(once, live(undefined, { newGameweeks: { [gw]: { [starter.id]: row } } }));
    const history = twice.players.find((p) => p.id === starter.id)!.history;
    expect(history.filter((h) => h.gw === gw)).toHaveLength(1);
    expect(history.map((h) => h.gw)).toEqual([...history.map((h) => h.gw)].sort((a, b) => a - b));
  });

  it("includes a new signing, with estimated zones until the next full sync", () => {
    const merged = overlayLive(snapshot, live((fpl) => {
      fpl.bootstrap.elements.push({ ...fpl.bootstrap.elements.find((e) => e.id === starter.id)!, id: 999_001, code: 0, web_name: "Newboy", status: "a" });
    }));
    const model = fromSnapshot(merged);
    const signing = model.players.find((p) => p.id === 999_001)!;
    expect(signing.zoneSource).toBe("estimated");
    expect(signing.occupation.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("drops players FPL marks unavailable for selection", () => {
    const merged = overlayLive(snapshot, live((fpl) => {
      fpl.bootstrap.elements.find((e) => e.id === starter.id)!.status = "u";
    }));
    expect(merged.players.some((p) => p.id === starter.id)).toBe(false);
  });

  it("moves on to the next gameweek once the deadline has passed", () => {
    const deadline = Date.parse(snapshot.events.find((e) => e.id === base.currentGw)!.deadline);
    const merged = fromSnapshot(overlayLive(snapshot, live(undefined, { fetchedAt: new Date(deadline + 60_000).toISOString() })));
    expect(merged.currentGw).toBe(base.currentGw + 1);
  });
});

describe.skipIf(!existsSync(file))("getModel with live FPL", () => {
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const fpl = fplFrom(snapshot);
  const starter = snapshot.players.find((p) => p.understat && p.status === "a" && p.minutes > 300)!;
  let afterCallbacks: (() => Promise<void> | void)[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/server", () => ({ after: (cb: () => void) => afterCallbacks.push(cb) }));
    afterCallbacks = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const respond = (bootstrap: FplBootstrap) =>
    vi.fn(async (url: string) => {
      if (url.endsWith("/bootstrap-static/")) return new Response(JSON.stringify(bootstrap));
      if (url.endsWith("/fixtures/")) return new Response(JSON.stringify(fpl.fixtures));
      return new Response(JSON.stringify({ elements: [] }));
    });

  it("serves live FPL news on the first request", async () => {
    const bootstrap = structuredClone(fpl.bootstrap);
    bootstrap.elements.find((e) => e.id === starter.id)!.news = "Knock - 75% chance of playing";
    vi.stubGlobal("fetch", respond(bootstrap));
    const { getModel } = await import("./source");
    const model = await getModel();
    expect(model.players.find((p) => p.id === starter.id)!.news).toBe("Knock - 75% chance of playing");
  });

  it("falls back to the snapshot when FPL is down, and doesn't retry on every request", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    vi.stubGlobal("fetch", down);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getModel } = await import("./source");
    const first = await getModel();
    expect(first.players.length).toBeGreaterThan(400);
    const calls = down.mock.calls.length;
    await getModel();
    await getModel();
    expect(down.mock.calls.length).toBe(calls); // within the retry window: no new attempts
    expect(afterCallbacks).toHaveLength(0);
  });

  it("refreshes in the background once the data is older than five minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(snapshot.fetchedAt));
    const bootstrap = structuredClone(fpl.bootstrap);
    const fetchMock = respond(bootstrap);
    vi.stubGlobal("fetch", fetchMock);
    const { getModel } = await import("./source");
    await getModel();
    expect(afterCallbacks).toHaveLength(0);

    bootstrap.elements.find((e) => e.id === starter.id)!.news = "Suspended for one match";
    vi.setSystemTime(Date.parse(snapshot.fetchedAt) + 6 * 60_000);
    const stale = await getModel();
    expect(stale.players.find((p) => p.id === starter.id)!.news).not.toBe("Suspended for one match"); // no waiting on FPL
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect((await getModel()).players.find((p) => p.id === starter.id)!.news).toBe("Suspended for one match");
  });

  it("moves to the next gameweek on the first request after a deadline, without waiting for the refresh cycle", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(snapshot.fetchedAt));
    vi.stubGlobal("fetch", respond(structuredClone(fpl.bootstrap)));
    const { getModel } = await import("./source");
    const before = await getModel();

    vi.setSystemTime(Date.parse(before.deadline!) + 1000); // one second past, well inside the 5-minute window
    const after = await getModel();
    expect(after.currentGw).toBe(before.currentGw + 1);
    expect(Date.parse(after.deadline!)).toBeGreaterThan(Date.now());
  });

  it("still moves to the next gameweek after a deadline when FPL is down", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(snapshot.fetchedAt));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getModel } = await import("./source");
    const before = await getModel();
    vi.setSystemTime(Date.parse(before.deadline!) + 1000);
    expect((await getModel()).currentGw).toBe(before.currentGw + 1);
  });
});
