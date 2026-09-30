/**
 * Synthetic league used until a licensed data feed is connected.
 * Clubs and players are fictional on purpose: the PRD flags that FPL game data is
 * Premier League IP, so the MVP ships with a reproducible demo dataset behind the
 * same `DataSource` shape a real feed would implement.
 */
import type { Fixture, Player, Position, Role, SourceData, Status, Team, ZoneGrid } from "@/lib/types";
import { between, createRng, pickOne, poisson, shuffle, type Rng } from "@/lib/rng";
import { blob, normalize, ROWS, LANES } from "@/lib/engine/zones";
import { expectedGoals } from "@/lib/engine/team";
import { simulateMatch } from "@/lib/engine/scoring";

export type DemoData = SourceData;

const CLUBS: [string, string, string][] = [
  ["Aldermoor", "ALD", "#C8102E"],
  ["Blackwater Rovers", "BLR", "#1D3C6E"],
  ["Castlebrook", "CAS", "#6CABDD"],
  ["Dunmore City", "DUN", "#034694"],
  ["Eastbridge", "EAS", "#EF0107"],
  ["Fairhaven United", "FAI", "#FDB913"],
  ["Glenford", "GLE", "#7A263A"],
  ["Harrowgate Athletic", "HAR", "#132257"],
  ["Ironside", "IRO", "#3A3A3A"],
  ["Kingsport", "KIN", "#0057B8"],
  ["Lakemont", "LAK", "#00A650"],
  ["Marlow Town", "MAR", "#E03A3E"],
  ["Northgate", "NOR", "#241F20"],
  ["Oakridge Wanderers", "OAK", "#FF7A00"],
  ["Portside", "POR", "#003090"],
  ["Queensbury", "QUE", "#95BFE5"],
  ["Redcliffe", "RED", "#B80C2A"],
  ["Stonebridge", "STO", "#6B2D5C"],
  ["Thornbury Albion", "THO", "#0B6E4F"],
  ["Westvale", "WES", "#D4A017"],
];

const FIRST = [
  "Adam", "Ben", "Callum", "Dario", "Elias", "Felix", "Gabriel", "Hugo", "Isaac", "Jonah", "Kai", "Luca", "Mateo",
  "Nico", "Oscar", "Pablo", "Rafael", "Sami", "Theo", "Victor", "Wes", "Yusuf", "Zane", "Arlo", "Bruno", "Cian",
  "Dani", "Emil", "Finn", "Goran", "Idris", "Jude", "Kofi", "Leon", "Milan", "Noah", "Omar", "Rory", "Tomas", "Axel",
];
const LAST = [
  "Adebayo", "Barros", "Calloway", "Delaney", "Ekström", "Ferreira", "Gallagher", "Haddad", "Iversen", "Jansen",
  "Kovač", "Lindqvist", "Moreau", "Nwosu", "Okafor", "Petrov", "Quinn", "Rosario", "Sandoval", "Tavares", "Ulloa",
  "Varga", "Whitlock", "Yamada", "Zielinski", "Ashworth", "Brennan", "Castell", "Duarte", "Eriksen", "Fontaine",
  "Gordon", "Holm", "Ibáñez", "Jovanović", "Keane", "Laurent", "Mensah", "Novak", "Osei", "Pereira", "Rahman",
  "Silva", "Thorne", "Uzor", "Valdés", "Walsh", "Achterberg", "Bakker", "Conte", "Doyle", "Esposito", "Fischer",
  "Grant", "Hartley", "Ivanov", "Jimenez", "Kerr", "Lopes", "Marsh",
];

interface Slot {
  role: Role;
  position: Position;
  starter: boolean;
  lane: number;
}

const STARTERS: Slot[] = [
  { role: "GK", position: "GK", starter: true, lane: 2 },
  { role: "LB", position: "DEF", starter: true, lane: 0.2 },
  { role: "CB", position: "DEF", starter: true, lane: 1.4 },
  { role: "CB", position: "DEF", starter: true, lane: 2.6 },
  { role: "RB", position: "DEF", starter: true, lane: 3.8 },
  { role: "DM", position: "MID", starter: true, lane: 2 },
  { role: "CM", position: "MID", starter: true, lane: 1.4 },
  { role: "AM", position: "MID", starter: true, lane: 2.3 },
  { role: "LW", position: "MID", starter: true, lane: 0.7 },
  { role: "RW", position: "MID", starter: true, lane: 3.3 },
  { role: "ST", position: "FWD", starter: true, lane: 2 },
];
const BENCH: Slot[] = [
  { role: "GK", position: "GK", starter: false, lane: 2 },
  { role: "CB", position: "DEF", starter: false, lane: 2.2 },
  { role: "RB", position: "DEF", starter: false, lane: 3.8 },
  { role: "CM", position: "MID", starter: false, lane: 2.6 },
  { role: "RW", position: "MID", starter: false, lane: 3.4 },
  { role: "ST", position: "FWD", starter: false, lane: 2 },
  { role: "ST", position: "FWD", starter: false, lane: 1.8 },
];

/** Base per-90 rates and positional footprint by role. */
const ROLE_PROFILE: Record<Role, { xg: number; xa: number; defcon: number; yellow: number; row: number; laneSpread: number; rowSpread: number }> = {
  GK: { xg: 0, xa: 0.01, defcon: 0, yellow: 0.02, row: 0, laneSpread: 0.5, rowSpread: 0.35 },
  CB: { xg: 0.05, xa: 0.03, defcon: 0.5, yellow: 0.13, row: 0.4, laneSpread: 0.7, rowSpread: 0.55 },
  LB: { xg: 0.04, xa: 0.13, defcon: 0.3, yellow: 0.12, row: 1.4, laneSpread: 0.55, rowSpread: 0.85 },
  RB: { xg: 0.04, xa: 0.13, defcon: 0.3, yellow: 0.12, row: 1.4, laneSpread: 0.55, rowSpread: 0.85 },
  DM: { xg: 0.05, xa: 0.08, defcon: 0.45, yellow: 0.18, row: 1.1, laneSpread: 0.8, rowSpread: 0.6 },
  CM: { xg: 0.1, xa: 0.13, defcon: 0.25, yellow: 0.12, row: 1.6, laneSpread: 0.9, rowSpread: 0.7 },
  AM: { xg: 0.23, xa: 0.24, defcon: 0.1, yellow: 0.08, row: 2.3, laneSpread: 0.9, rowSpread: 0.6 },
  LW: { xg: 0.3, xa: 0.2, defcon: 0.06, yellow: 0.07, row: 2.4, laneSpread: 0.7, rowSpread: 0.6 },
  RW: { xg: 0.3, xa: 0.2, defcon: 0.06, yellow: 0.07, row: 2.4, laneSpread: 0.7, rowSpread: 0.6 },
  ST: { xg: 0.5, xa: 0.12, defcon: 0.03, yellow: 0.08, row: 2.9, laneSpread: 0.8, rowSpread: 0.5 },
};

const INJURIES = ["Hamstring", "Knee", "Ankle", "Calf", "Groin", "Illness", "Muscle"];
const KICKOFFS = ["Sat 12:30", "Sat 15:00", "Sat 15:00", "Sat 15:00", "Sat 15:00", "Sat 17:30", "Sun 14:00", "Sun 14:00", "Sun 16:30", "Mon 20:00"];

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function buildTeams(rng: Rng): Team[] {
  return shuffle(rng, CLUBS).map(([name, short, color], i) => {
    const strength = 1.34 - i * 0.034 + between(rng, -0.05, 0.05);
    const attack = clamp(strength + between(rng, -0.08, 0.08), 0.68, 1.45);
    const defenceWeakness = clamp(2 - strength + between(rng, -0.1, 0.1), 0.7, 1.4);
    return {
      id: i + 1,
      code: 0,
      name,
      short,
      color,
      attack,
      defenceWeakness,
      vulnerability: buildVulnerability(rng),
      xgaTrend: between(rng, -0.35, 0.3),
      matches: [],
    };
  });
}

function buildVulnerability(rng: Rng): ZoneGrid {
  const rowWeight = [0.02, 0.1, 0.36, 0.52];
  const laneWeight = [0.14, 0.2, 0.32, 0.2, 0.14];
  const weakLanes = new Set([Math.floor(rng() * LANES.length)]);
  if (rng() < 0.45) weakLanes.add(Math.floor(rng() * LANES.length));
  const grid: number[] = [];
  for (let r = 0; r < ROWS.length; r++) {
    for (let l = 0; l < LANES.length; l++) {
      let v = rowWeight[r] * laneWeight[l] * between(rng, 0.85, 1.15);
      if (r >= 2 && weakLanes.has(l)) v *= between(rng, 1.45, 1.95);
      grid.push(v);
    }
  }
  return normalize(grid);
}

function uniqueName(rng: Rng, used: Set<string>): string {
  for (;;) {
    const name = `${pickOne(rng, FIRST)} ${pickOne(rng, LAST)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

function priceFor(position: Position, team: Team, xg90: number, xa90: number, starter: boolean): number {
  if (!starter) return position === "GK" || position === "DEF" ? 4.0 : 4.5 + Math.min(0.8, xg90 * 2);
  const defensive = 1.4 - team.defenceWeakness;
  switch (position) {
    case "GK":
      return clamp(4.2 + defensive * 2.4, 4.0, 5.8);
    case "DEF":
      return clamp(4.0 + defensive * 2.0 + (xg90 * 6 + xa90 * 3) * 1.5, 4.0, 7.0);
    case "MID":
      return clamp(4.5 + 0.65 * (xg90 * 5 + xa90 * 3) ** 2, 4.5, 13.5);
    case "FWD":
      return clamp(4.5 + 0.55 * (xg90 * 4 + xa90 * 3) ** 2, 4.5, 14.5);
  }
}

function buildPlayers(rng: Rng, teams: Team[]): Player[] {
  const used = new Set<string>();
  const players: Player[] = [];
  for (const team of teams) {
    const squad = [...STARTERS, ...BENCH];
    const starIndex = team.attack > 1.05 ? pickOne(rng, [7, 8, 9, 10]) : -1;
    const teamPlayers: Player[] = [];
    squad.forEach((slot, i) => {
      const profile = ROLE_PROFILE[slot.role];
      const quality = between(rng, 0.78, 1.22) * (i === starIndex ? 1.3 : 1) * (slot.starter ? 1 : 0.85);
      const attackScale = team.attack ** 1.1 * quality;
      const position: Position = slot.role === "LW" && rng() < 0.3 ? "FWD" : slot.position;
      const lane = clamp(slot.lane + between(rng, -0.3, 0.3), 0, 4);
      const occupation = blob(lane, clamp(profile.row + between(rng, -0.2, 0.2), 0, 3), profile.laneSpread, profile.rowSpread);
      const pStart = slot.starter
        ? rng() < 0.18
          ? between(rng, 0.62, 0.8)
          : between(rng, 0.85, 0.97)
        : between(rng, 0.04, 0.3);
      const name = uniqueName(rng, used);
      teamPlayers.push({
        id: team.id * 100 + i + 1,
        code: 0,
        name,
        webName: name.split(" ").slice(1).join(" "),
        teamId: team.id,
        position,
        role: slot.role,
        price: 0,
        ownership: 0,
        status: "available",
        chance: 100,
        news: null,
        xg90: profile.xg * attackScale,
        xa90: profile.xa * attackScale,
        pStart,
        pCameo: slot.starter ? 0.6 : between(rng, 0.35, 0.7),
        penalties: false,
        setPieces: false,
        defcon90: clamp(profile.defcon * between(rng, 0.75, 1.25), 0, 0.8),
        yellow90: profile.yellow,
        occupation,
        zoneSource: "estimated",
        history: [],
      });
    });

    const outfieldStarters = teamPlayers.filter((p) => p.position !== "GK" && p.pStart > 0.5);
    const penTaker = [...outfieldStarters].sort((a, b) => b.xg90 - a.xg90)[0];
    penTaker.penalties = true;
    penTaker.xg90 += 0.08;
    const setPieceTaker = [...outfieldStarters].filter((p) => p.position === "MID" || p.position === "DEF").sort((a, b) => b.xa90 - a.xa90)[0];
    setPieceTaker.setPieces = true;
    setPieceTaker.xa90 += 0.05;

    for (const p of teamPlayers) {
      p.price = round1(priceFor(p.position, team, p.xg90, p.xa90, p.pStart > 0.5));
    }
    players.push(...teamPlayers);
  }

  for (const p of players) {
    const u = rng();
    if (u < 0.045) setStatus(rng, p, "injured", 0);
    else if (u < 0.055) {
      p.status = "suspended";
      p.chance = 0;
      p.news = "Suspended – one-match ban";
    } else if (u < 0.13) setStatus(rng, p, "doubtful", pickOne(rng, [25, 50, 75, 75]));
  }
  return players;
}

function setStatus(rng: Rng, p: Player, status: Status, chance: number) {
  p.status = status;
  p.chance = chance;
  const injury = pickOne(rng, INJURIES);
  p.news = status === "injured" ? `${injury} injury – expected back in ${Math.ceil(between(rng, 1, 6))} weeks` : `${injury} – ${chance}% chance of playing`;
}

function buildFixtures(rng: Rng, teams: Team[]): Fixture[] {
  const ids = shuffle(rng, teams.map((t) => t.id));
  const n = ids.length;
  const rounds: [number, number][][] = [];
  const rotating = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const circle = [ids[0], ...rotating];
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop() as number);
  }
  const season = [...rounds, ...rounds.map((pairs) => pairs.map(([h, a]) => [a, h] as [number, number]))];
  const fixtures: Fixture[] = [];
  season.forEach((pairs, r) => {
    pairs.forEach(([homeId, awayId], i) => {
      fixtures.push({ id: fixtures.length + 1, gw: r + 1, homeId, awayId, kickoff: KICKOFFS[i], result: null });
    });
  });
  return fixtures;
}

function playHistory(rng: Rng, teams: Team[], players: Player[], fixtures: Fixture[], currentGw: number) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  for (const fx of fixtures.filter((f) => f.gw < currentGw)) {
    const home = teamById.get(fx.homeId)!;
    const away = teamById.get(fx.awayId)!;
    const homeXg = expectedGoals(home, away, true);
    const awayXg = expectedGoals(away, home, false);
    fx.result = { home: poisson(rng, homeXg), away: poisson(rng, awayXg) };
    for (const p of players) {
      if (p.teamId !== fx.homeId && p.teamId !== fx.awayId) continue;
      const isHome = p.teamId === fx.homeId;
      const teamXg = isHome ? homeXg : awayXg;
      const own = isHome ? home : away;
      const factor = teamXg / (1.4 * own.attack);
      const outcome = simulateMatch(rng, {
        position: p.position,
        pStart: p.pStart,
        pCameo: p.pCameo,
        goalRate: p.xg90 * factor,
        assistRate: p.xa90 * factor,
        concedeRate: isHome ? awayXg : homeXg,
        defcon90: p.defcon90,
        yellow90: p.yellow90,
      });
      p.history.push({
        gw: fx.gw,
        opponentId: isHome ? fx.awayId : fx.homeId,
        home: isHome,
        minutes: outcome.minutes,
        points: outcome.points,
        goals: outcome.goals,
        assists: outcome.assists,
      });
    }
  }
}

function assignOwnership(rng: Rng, players: Player[]) {
  for (const p of players) {
    const games = Math.max(1, p.history.length);
    const ppg = p.history.reduce((s, h) => s + h.points, 0) / games;
    const raw = ppg * 1.8 + (p.price - 4) * 1.2 + between(rng, -2, 2);
    p.ownership = round1(clamp(0.5 * Math.exp(raw * 0.18), 0.1, 68));
  }
}

export function generateDemoData(seed = 2026, currentGw = 7): DemoData {
  const rng = createRng(seed);
  const teams = buildTeams(rng);
  const players = buildPlayers(rng, teams);
  const fixtures = buildFixtures(rng, teams);
  playHistory(rng, teams, players, fixtures, currentGw);
  assignOwnership(rng, players);
  return { teams, players, fixtures, currentGw, deadline: null, fetchedAt: null, source: "demo", season: "Demo" };
}
