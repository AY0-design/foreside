/**
 * Pulls real Premier League data into data/snapshot.json.
 *
 *   npm run sync
 *
 * Sources
 * - Official FPL API: players, prices, ownership, availability, fixtures, per-gameweek stats.
 * - Understat: team xG/xGA per match and every shot with pitch coordinates, which powers the
 *   tactical zone model (where teams concede chances, where players create them).
 *
 * Understat match files are cached in data/cache so re-syncs only fetch new matches.
 * Personal-use project: be polite to both sources (small concurrency, cached).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const CACHE = path.join(DATA, "cache", "understat");
const UA = { "User-Agent": "Mozilla/5.0 (Foreside personal FPL tool)" };
const US_HEADERS = { ...UA, "X-Requested-With": "XMLHttpRequest" };

// Understat seasons are keyed by start year. Current season + one prior for sample size.
const SEASONS = ["2026", "2025"] as const;

// ---------- helpers ----------

async function getJson<T>(url: string, headers: Record<string, string> = UA, attempt = 1): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await sleep(1000 * attempt);
      return getJson(url, headers, attempt + 1);
    }
    throw new Error(`${res.status} ${url}`);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/&#0?39;|'/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------- zones (must match src/lib/engine/zones.ts) ----------
// Understat: X = 0..1 towards the opponent goal. Y = 0..1 where HIGH Y is the attacker's LEFT
// (verified: left wingers average Y≈0.61, right wingers ≈0.39).
const LANE_EDGES = [0.2035, 0.37, 0.63, 0.7965]; // box edges + half-space lines, attacker's left → right
const ROW_EDGES = [1 / 3, 2 / 3, 0.843]; // thirds, then the penalty area (16.5m of 105m)

function zoneOf(x: number, y: number): number {
  const across = 1 - y; // 0 = attacker's left touchline
  let lane = LANE_EDGES.findIndex((e) => across < e);
  if (lane === -1) lane = 4;
  let row = ROW_EDGES.findIndex((e) => x < e);
  if (row === -1) row = 3;
  return row * 5 + lane;
}

const emptyGrid = () => new Array(20).fill(0) as number[];

// ---------- types (subset of the upstream payloads) ----------

interface FplTeam { id: number; code: number; name: string; short_name: string }
interface FplElement {
  id: number; code: number; web_name: string; first_name: string; second_name: string; known_name?: string;
  team: number; element_type: number; now_cost: number; selected_by_percent: string; status: string;
  chance_of_playing_next_round: number | null; news: string; minutes: number; starts: number;
  expected_goals: string; expected_assists: string; yellow_cards: number; penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null; direct_freekicks_order: number | null; total_points: number;
  form: string; can_select?: boolean; transfers_in_event: number; transfers_out_event: number;
}
interface FplEvent { id: number; name: string; deadline_time: string; finished: boolean; is_current: boolean; is_next: boolean }
interface FplFixture { id: number; event: number | null; team_h: number; team_a: number; kickoff_time: string | null; finished: boolean; team_h_score: number | null; team_a_score: number | null }
interface LiveElement { id: number; stats: Record<string, number | string | boolean>; explain: { fixture: number }[] }

interface UsTeam { id: string; title: string; history: { h_a: "h" | "a"; xG: number; xGA: number; scored: number; missed: number; date: string }[] }
interface UsPlayer { id: string; player_name: string; team_title: string; position: string; time: string; xG: string; xA: string; games: string }
interface UsDate { id: string; isResult: boolean; h: { title: string }; a: { title: string }; datetime: string }
interface UsLeague { teams: Record<string, UsTeam>; players: UsPlayer[]; dates: UsDate[] }
interface UsShot { X: string; Y: string; xG: string; player_id: string; player: string; player_assisted: string | null; h_a: "h" | "a"; situation: string; season: string }
interface UsRosterEntry { player_id: string; player: string }
interface UsMatch { shots: { h: UsShot[]; a: UsShot[] }; rosters: { h: Record<string, UsRosterEntry>; a: Record<string, UsRosterEntry> } }

// FPL team name → Understat title, where they differ.
const TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city",
  "man utd": "manchester united",
  "nottm forest": "nottingham forest",
  spurs: "tottenham",
  newcastle: "newcastle united",
  wolves: "wolverhampton wanderers",
  "coventry city": "coventry",
  "hull city": "hull",
  "ipswich town": "ipswich",
  "leeds": "leeds",
  "sheffield utd": "sheffield united",
  "luton": "luton",
  "west ham": "west ham",
};

function matchTeam(fplName: string, usTitles: string[]): string | null {
  const n = normalize(fplName);
  const target = TEAM_ALIASES[n] ?? n;
  const titles = usTitles.map((t) => [t, normalize(t)] as const);
  return (
    titles.find(([, t]) => t === target)?.[0] ??
    titles.find(([, t]) => t.startsWith(target) || target.startsWith(t))?.[0] ??
    titles.find(([, t]) => t.includes(target.split(" ")[0]))?.[0] ??
    null
  );
}

const decode = (s: string) => s.replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const tokens = (s: string) => normalize(decode(s)).split(" ").filter(Boolean);

/**
 * Name similarity. A surname hit is mandatory (so "Ben Wilson" never matches "Wilson Isidor");
 * first names/initials then separate namesakes. Mononyms (Alisson, Florentino) match on the
 * single name, but only within the same club.
 */
function nameScore(el: FplElement, usName: string, sameClub: boolean): number {
  const u = tokens(usName);
  const uJoined = u.join(" ");
  const first = tokens(el.first_name);
  const second = tokens(el.second_name);
  const known = el.known_name ? tokens(el.known_name) : [];
  const web = tokens(el.web_name.replace(/^[A-Z]\./, ""));
  if (uJoined === [...first, ...second].join(" ") || (known.length && uJoined === known.join(" "))) return 100;
  const surnameHit = second.some((t) => t.length > 2 && u.slice(1).includes(t)) || (web.length > 0 && u.slice(1).join(" ").endsWith(web.join(" ")));
  const firstHit = first.some((t) => u[0] === t) || (first[0] && u[0]?.[0] === first[0][0]);
  if (surnameHit && firstHit) return 90;
  if (surnameHit && sameClub) return 70;
  const mononym = known.length === 1 ? known[0] : el.first_name && !el.second_name ? first[0] : web.length === 1 && web[0] === first[0] ? web[0] : null;
  if (mononym && u[0] === mononym && sameClub) return 65;
  if (u.length === 1 && [...first, ...second, ...web].includes(u[0]) && sameClub) return 60;
  return 0;
}

// ---------- main ----------

async function main() {
  await mkdir(CACHE, { recursive: true });
  console.log("FPL: bootstrap + fixtures");
  const bootstrap = await getJson<{ events: FplEvent[]; teams: FplTeam[]; elements: FplElement[] }>(
    "https://fantasy.premierleague.com/api/bootstrap-static/",
  );
  const fixtures = await getJson<FplFixture[]>("https://fantasy.premierleague.com/api/fixtures/");

  const finishedGws = bootstrap.events.filter((e) => e.finished).map((e) => e.id);
  console.log(`FPL: live stats for GW ${finishedGws.join(", ")}`);
  const live = await pool(finishedGws, 3, async (gw) => ({
    gw,
    elements: (await getJson<{ elements: LiveElement[] }>(`https://fantasy.premierleague.com/api/event/${gw}/live/`)).elements,
  }));

  const history = new Map<number, { gw: number; fixtures: number[]; minutes: number; points: number; goals: number; assists: number; starts: number; defcon: number; xg: number; xa: number }[]>();
  for (const { gw, elements } of live) {
    for (const el of elements) {
      const s = el.stats;
      const fixtureIds = el.explain.map((x) => x.fixture);
      if (fixtureIds.length === 0) continue;
      const rows = history.get(el.id) ?? [];
      rows.push({
        gw,
        fixtures: fixtureIds,
        minutes: Number(s.minutes),
        points: Number(s.total_points),
        goals: Number(s.goals_scored),
        assists: Number(s.assists),
        starts: Number(s.starts),
        defcon: Number(s.defensive_contribution ?? 0),
        xg: Number(s.expected_goals),
        xa: Number(s.expected_assists),
      });
      history.set(el.id, rows);
    }
  }

  // ---- Understat ----
  const leagues: Record<string, UsLeague> = {};
  for (const season of SEASONS) {
    console.log(`Understat: league ${season}`);
    leagues[season] = await getJson<UsLeague>(`https://understat.com/getLeagueData/EPL/${season}`, US_HEADERS);
  }

  const matchIds = SEASONS.flatMap((season) => leagues[season].dates.filter((d) => d.isResult).map((d) => ({ season, id: d.id, h: d.h.title, a: d.a.title })));
  let fetched = 0;
  const matches = await pool(matchIds, 6, async (m) => {
    const file = path.join(CACHE, `${m.id}.json`);
    if (existsSync(file)) return { ...m, data: JSON.parse(await readFile(file, "utf8")) as UsMatch };
    const data = await getJson<UsMatch>(`https://understat.com/getMatchData/${m.id}`, US_HEADERS);
    await writeFile(file, JSON.stringify({ shots: data.shots, rosters: data.rosters }));
    if (++fetched % 25 === 0) console.log(`  fetched ${fetched} new matches`);
    await sleep(120);
    return { ...m, data };
  });
  console.log(`Understat: ${matches.length} matches (${fetched} newly fetched)`);

  // Aggregate shots into zone grids.
  // conceded[teamTitle][season] = open-play + set-piece xG conceded by zone (penalties excluded:
  // they always come from the spot and say nothing about where a defence is weak).
  const conceded: Record<string, Record<string, { grid: number[]; xg: number; matches: number }>> = {};
  // created[playerId][season] = xG of own shots + xG of shots they assisted, by zone.
  const created: Record<string, Record<string, { grid: number[]; xg: number }>> = {};
  const bump = (g: number[], z: number, v: number) => (g[z] += v);

  for (const m of matches) {
    const sides = { h: m.h, a: m.a };
    for (const side of ["h", "a"] as const) {
      const defending = side === "h" ? sides.a : sides.h;
      conceded[defending] ??= {};
      conceded[defending][m.season] ??= { grid: emptyGrid(), xg: 0, matches: 0 };
      const bucket = conceded[defending][m.season];
      bucket.matches++;
      const roster = Object.values(m.data.rosters?.[side] ?? {});
      const idByName = new Map(roster.map((r) => [r.player, r.player_id]));
      for (const shot of m.data.shots[side] ?? []) {
        if (shot.situation === "Penalty") continue;
        const z = zoneOf(Number(shot.X), Number(shot.Y));
        const xg = Number(shot.xG);
        bump(bucket.grid, z, xg);
        bucket.xg += xg;
        const shooter = (created[shot.player_id] ??= {});
        const s = (shooter[m.season] ??= { grid: emptyGrid(), xg: 0 });
        bump(s.grid, z, xg);
        s.xg += xg;
        const assistId = shot.player_assisted ? idByName.get(shot.player_assisted) : undefined;
        if (assistId) {
          const a = ((created[assistId] ??= {})[m.season] ??= { grid: emptyGrid(), xg: 0 });
          bump(a.grid, z, xg * 0.8);
          a.xg += xg * 0.8;
        }
      }
    }
  }

  // ---- Join Understat → FPL ----
  const usTitles = [...new Set(SEASONS.flatMap((s) => Object.values(leagues[s].teams).map((t) => t.title)))];
  const teamMap = new Map<number, string | null>();
  for (const t of bootstrap.teams) teamMap.set(t.id, matchTeam(t.name, usTitles));
  const unmatchedTeams = bootstrap.teams.filter((t) => !teamMap.get(t.id)).map((t) => t.name);
  if (unmatchedTeams.length) console.warn("Unmatched teams:", unmatchedTeams);

  const usPlayers = new Map<string, { id: string; name: string; teams: string[]; seasons: Record<string, { minutes: number; xg: number; xa: number }> }>();
  for (const season of SEASONS) {
    for (const p of leagues[season].players) {
      const entry = usPlayers.get(p.id) ?? { id: p.id, name: decode(p.player_name), teams: [], seasons: {} };
      entry.teams.push(...p.team_title.split(","));
      entry.seasons[season] = { minutes: Number(p.time), xg: Number(p.xG), xa: Number(p.xA) };
      usPlayers.set(p.id, entry);
    }
  }

  const elements = bootstrap.elements.filter((e) => e.status !== "u");
  // Global best-first assignment: score every plausible pair, then take the strongest first so an
  // exact match is never pre-empted by a weaker namesake.
  const pairs: { el: number; us: string; score: number }[] = [];
  for (const el of elements) {
    const title = teamMap.get(el.team);
    for (const u of usPlayers.values()) {
      const sameClub = Boolean(title && u.teams.includes(title));
      const score = nameScore(el, u.name, sameClub);
      if (score >= 60) pairs.push({ el: el.id, us: u.id, score: score + (sameClub ? 5 : 0) });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const byElement = new Map<number, string>();
  const claimed = new Set<string>();
  for (const pair of pairs) {
    if (byElement.has(pair.el) || claimed.has(pair.us)) continue;
    byElement.set(pair.el, pair.us);
    claimed.add(pair.us);
  }
  const matched = byElement.size;
  const players = elements.map((el) => {
    const understatId = byElement.get(el.id) ?? null;
    const us = understatId ? usPlayers.get(understatId)! : null;
    return {
      id: el.id,
      code: el.code,
      webName: el.web_name,
      name: el.known_name || `${el.first_name} ${el.second_name}`,
      team: el.team,
      elementType: el.element_type,
      price: el.now_cost / 10,
      ownership: Number(el.selected_by_percent),
      status: el.status,
      chance: el.chance_of_playing_next_round,
      news: el.news || null,
      minutes: el.minutes,
      starts: el.starts,
      xg: Number(el.expected_goals),
      xa: Number(el.expected_assists),
      yellows: el.yellow_cards,
      penaltiesOrder: el.penalties_order,
      cornersOrder: el.corners_and_indirect_freekicks_order,
      freekicksOrder: el.direct_freekicks_order,
      totalPoints: el.total_points,
      transfersIn: el.transfers_in_event,
      transfersOut: el.transfers_out_event,
      history: history.get(el.id) ?? [],
      understat: us
        ? {
            id: us.id,
            name: us.name,
            seasons: us.seasons,
            zones: Object.fromEntries(SEASONS.map((s) => [s, created[us.id]?.[s] ?? null])),
          }
        : null,
    };
  });

  const relevant = players.filter((p) => p.minutes > 0);
  const relevantMatched = relevant.filter((p) => p.understat).length;
  console.log(`Players: ${players.length}, Understat matched ${matched} (${relevantMatched}/${relevant.length} of those with minutes)`);

  const teams = bootstrap.teams.map((t) => {
    const title = teamMap.get(t.id) ?? null;
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      short: t.short_name,
      understatTitle: title,
      seasons: Object.fromEntries(
        SEASONS.map((s) => {
          const team = title ? Object.values(leagues[s].teams).find((x) => x.title === title) : undefined;
          return [
            s,
            team
              ? {
                  matches: team.history.map((h) => ({ date: h.date, home: h.h_a === "h", xg: Number(h.xG), xga: Number(h.xGA), scored: Number(h.scored), conceded: Number(h.missed) })),
                  conceded: title ? conceded[title]?.[s] ?? null : null,
                }
              : null,
          ];
        }),
      ),
    };
  });

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    sources: ["fantasy.premierleague.com", "understat.com"],
    events: bootstrap.events.map((e) => ({ id: e.id, name: e.name, deadline: e.deadline_time, finished: e.finished, isCurrent: e.is_current, isNext: e.is_next })),
    teams,
    players,
    fixtures: fixtures
      .filter((f) => f.event !== null)
      .map((f) => ({ id: f.id, gw: f.event!, homeId: f.team_h, awayId: f.team_a, kickoff: f.kickoff_time, finished: f.finished, homeScore: f.team_h_score, awayScore: f.team_a_score })),
  };

  await writeFile(path.join(DATA, "snapshot.json"), JSON.stringify(snapshot));
  console.log(`Wrote data/snapshot.json (${(JSON.stringify(snapshot).length / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
