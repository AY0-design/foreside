import { FPL, FPL_HEADERS, eventFields, fixtureFields, historyRows, playerFields, type FplBootstrap, type FplFixture, type FplLiveElement, type HistoryRow } from "./fpl-api";
import type { Snapshot } from "./fpl";

/**
 * Live FPL on top of the synced snapshot. The snapshot carries the slow-moving Understat work
 * (zones, xG history); FPL's own data (deadlines, availability, prices, ownership, fixtures,
 * results and newly finished gameweeks) is fetched fresh and laid over it.
 */
export interface LiveFpl {
  fetchedAt: string;
  bootstrap: FplBootstrap;
  fixtures: FplFixture[];
  /** History rows for finished gameweeks the snapshot doesn't have yet, by gameweek then player. */
  newGameweeks: Record<number, Record<number, HistoryRow>>;
}

const TIMEOUT_MS = 6000;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: FPL_HEADERS, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`FPL ${res.status} ${url}`);
  return (await res.json()) as T;
}

/** Gameweeks the snapshot already has per-player history for. */
const syncedGameweeks = (snapshot: Snapshot) => new Set(snapshot.players.flatMap((p) => p.history.map((h) => h.gw)));

export async function fetchLive(snapshot: Snapshot): Promise<LiveFpl> {
  const [bootstrap, fixtures] = await Promise.all([get<FplBootstrap>(`${FPL}/bootstrap-static/`), get<FplFixture[]>(`${FPL}/fixtures/`)]);
  const synced = syncedGameweeks(snapshot);
  const missing = bootstrap.events.filter((e) => e.finished && !synced.has(e.id)).map((e) => e.id);
  const rounds = await Promise.all(missing.map(async (gw) => [gw, historyRows(gw, (await get<{ elements: FplLiveElement[] }>(`${FPL}/event/${gw}/live/`)).elements)] as const));
  return {
    fetchedAt: new Date().toISOString(),
    bootstrap,
    fixtures,
    newGameweeks: Object.fromEntries(rounds.map(([gw, rows]) => [gw, Object.fromEntries(rows)])),
  };
}

/** The snapshot with live FPL laid over it. Pure, so it can be tested without the network. */
export function overlayLive(snapshot: Snapshot, live: LiveFpl): Snapshot {
  const synced = new Map(snapshot.players.map((p) => [p.id, p]));
  const newGws = Object.keys(live.newGameweeks).map(Number);
  const players = live.bootstrap.elements
    .filter((el) => el.status !== "u")
    .map((el) => {
      const base = synced.get(el.id);
      const added = newGws.map((gw) => live.newGameweeks[gw][el.id]).filter((r): r is HistoryRow => Boolean(r));
      const history = [...(base?.history ?? []).filter((h) => !newGws.includes(h.gw)), ...added].sort((a, b) => a.gw - b.gw);
      // New signings have no Understat profile until the next full sync; the model estimates their zones.
      return { ...(base ?? { understat: null }), ...playerFields(el), history } as Snapshot["players"][number];
    });
  return {
    ...snapshot,
    fetchedAt: live.fetchedAt,
    events: live.bootstrap.events.map(eventFields),
    fixtures: fixtureFields(live.fixtures),
    players,
  };
}
