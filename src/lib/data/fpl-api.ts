/**
 * The official FPL API: payload shapes and how they map onto the snapshot. Shared by the full
 * sync (scripts/sync-data.ts) and the live overlay (live.ts) so both read FPL the same way.
 * No path aliases or runtime imports: Node runs the sync script straight from TypeScript.
 */

export const FPL = "https://fantasy.premierleague.com/api";
export const FPL_HEADERS = { "User-Agent": "Mozilla/5.0 (Foreside personal FPL tool)" };

export interface FplTeam { id: number; code: number; name: string; short_name: string }
export interface FplElement {
  id: number; code: number; web_name: string; first_name: string; second_name: string; known_name?: string;
  team: number; element_type: number; now_cost: number; selected_by_percent: string; status: string;
  chance_of_playing_next_round: number | null; news: string; minutes: number; starts: number;
  expected_goals: string; expected_assists: string; yellow_cards: number; penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null; direct_freekicks_order: number | null; total_points: number;
  form: string; can_select?: boolean; transfers_in_event: number; transfers_out_event: number;
}
export interface FplEvent { id: number; name: string; deadline_time: string; finished: boolean; is_current: boolean; is_next: boolean }
export interface FplFixture { id: number; event: number | null; team_h: number; team_a: number; kickoff_time: string | null; finished: boolean; team_h_score: number | null; team_a_score: number | null }
export interface FplLiveElement { id: number; stats: Record<string, number | string | boolean>; explain: { fixture: number }[] }
export interface FplBootstrap { events: FplEvent[]; teams: FplTeam[]; elements: FplElement[] }

export interface HistoryRow { gw: number; fixtures: number[]; minutes: number; points: number; goals: number; assists: number; starts: number; defcon: number; xg: number; xa: number }

/** Everything the snapshot keeps about a player that comes from FPL (Understat is joined separately). */
export function playerFields(el: FplElement) {
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
  };
}

export const eventFields = (e: FplEvent) => ({ id: e.id, name: e.name, deadline: e.deadline_time, finished: e.finished, isCurrent: e.is_current, isNext: e.is_next });

export const fixtureFields = (fixtures: FplFixture[]) =>
  fixtures
    .filter((f) => f.event !== null)
    .map((f) => ({ id: f.id, gw: f.event!, homeId: f.team_h, awayId: f.team_a, kickoff: f.kickoff_time, finished: f.finished, homeScore: f.team_h_score, awayScore: f.team_a_score }));

/** Per-player rows for one gameweek from event/{gw}/live. Players who had no fixture are skipped. */
export function historyRows(gw: number, elements: FplLiveElement[]): Map<number, HistoryRow> {
  const rows = new Map<number, HistoryRow>();
  for (const el of elements) {
    const fixtures = el.explain.map((x) => x.fixture);
    if (fixtures.length === 0) continue;
    const s = el.stats;
    rows.set(el.id, {
      gw,
      fixtures,
      minutes: Number(s.minutes),
      points: Number(s.total_points),
      goals: Number(s.goals_scored),
      assists: Number(s.assists),
      starts: Number(s.starts),
      defcon: Number(s.defensive_contribution ?? 0),
      xg: Number(s.expected_goals),
      xa: Number(s.expected_assists),
    });
  }
  return rows;
}
