import type { Metadata } from "next";
import Link from "next/link";
import { getModel } from "@/lib/data/source";
import { summarize, teamBadge } from "@/lib/data/summaries";
import { exploitsForGw, hotZones } from "@/lib/engine/matchups";
import { describeZone } from "@/lib/engine/explain";
import { fixturesFor, HORIZON } from "@/lib/engine/project";
import { LANES, zoneRatio } from "@/lib/engine/zones";
import type { Position } from "@/lib/types";
import { MiniZone } from "@/components/MiniZone";
import { PlayerIdentity } from "@/components/PlayerBits";
import { Delta, GroupRow, PageBar, Panel, PanelHeader, ROW, TabLinks, TD, TeamBadge, TH } from "@/components/ui/primitives";
import { capitalize, cx, pct, pts } from "@/lib/format";

export const metadata: Metadata = { title: "Matchups" };

const GROUPS: { position: Position; label: string }[] = [
  { position: "FWD", label: "Forwards" },
  { position: "MID", label: "Midfielders" },
  { position: "DEF", label: "Defenders" },
];
const LANE_SHORT = ["LW", "LHS", "C", "RHS", "RW"];

export default async function MatchupsPage({ searchParams }: PageProps<"/matchups">) {
  const model = await getModel();
  const requested = Number((await searchParams).gw);
  const gws = Array.from({ length: HORIZON }, (_, i) => model.currentGw + i);
  const gw = gws.includes(requested) ? requested : model.currentGw;
  const byId = new Map(summarize(model).map((p) => [p.id, p]));
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const league = model.leagueVulnerability;
  const exploits = exploitsForGw(model, gw);

  const exposed = model.teams
    .map((team) => ({ team, hot: hotZones(team, league, 1)[0], opponents: fixturesFor(model.fixtures, team.id, gw).map((f) => teamById.get(f.opponentId)!) }))
    .sort((a, b) => b.hot.ratio - a.hot.ratio);
  const heatZones = [15, 16, 17, 18, 19, 10, 11, 12, 13, 14]; // box lanes, then final-third lanes

  return (
    <div className="space-y-6">
      <PageBar
        title="Matchups"
        sub="Opponent weakness × player footprint, from real shot locations"
        actions={<TabLinks active={`/matchups?gw=${gw}`} items={gws.map((g) => ({ href: `/matchups?gw=${g}`, label: `GW${g}` }))} />}
      />

      {/* Two panels, one table rhythm: same header rows, row height and team order, so each
          side's line in "Most exposed" sits level with its heatmap row. */}
      <div className="grid gap-5 lg:grid-cols-[7fr_5fr]">
        <Panel>
          <PanelHeader title="Where every defence is open" sub="Chance volume conceded by zone vs league average · pink = open" />
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[520px] border-separate border-spacing-[3px] text-[12px] lg:min-w-0">
              <thead>
                <tr className="h-6">
                  <th />
                  <th colSpan={5} className="text-center font-medium text-muted">Penalty area</th>
                  <th colSpan={5} className="text-center font-medium text-muted">Final third</th>
                </tr>
                <tr className="h-6">
                  <th />
                  {heatZones.map((z) => (
                    <th key={z} scope="col" className="text-center font-normal text-muted" title={LANES[z % 5]}>
                      {LANE_SHORT[z % 5]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exposed.map(({ team }) => (
                  <tr key={team.id} className="h-7">
                    <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap">
                      <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <TeamBadge src={teamBadge(team)} short={team.short} size={14} />
                        {team.short}
                      </Link>
                    </th>
                    {heatZones.map((z) => {
                      const r = zoneRatio(team.vulnerability[z], league[z]);
                      const alpha = r >= 1 ? Math.min(0.95, 0.1 + (r - 1) * 1.3) : 0;
                      return (
                        <td
                          key={z}
                          title={`${team.name}: ${describeZone(z)} · ${r.toFixed(2)}× league average`}
                          className={cx("min-w-9 rounded text-center tnum", alpha > 0.55 ? "text-white" : "text-muted")}
                          style={{ background: alpha > 0 ? `rgb(255 79 163 / ${alpha})` : "var(--panel-strong)" }}
                        >
                          {r.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Most exposed" sub={`Each side’s weakest zone and GW${gw} opponent`} />
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full border-separate border-spacing-[3px] text-[12px]">
              <thead>
                <tr className="h-6">
                  <th />
                  <th className="text-left font-medium text-muted">Weakest zone</th>
                  <th className="text-left font-medium text-muted">GW{gw}</th>
                  <th className="text-right font-medium text-muted">Open</th>
                </tr>
                <tr className="h-6" aria-hidden>
                  <th colSpan={4} />
                </tr>
              </thead>
              <tbody>
                {exposed.map(({ team, hot, opponents }) => (
                  <tr key={team.id} className="group h-7">
                    <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap">
                      <Link href={`/teams/${team.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <TeamBadge src={teamBadge(team)} short={team.short} size={14} />
                        {team.short}
                      </Link>
                    </th>
                    <td className="whitespace-nowrap text-muted" title={capitalize(describeZone(hot.zone))}>
                      {LANES[hot.zone % 5]} <span className="ml-1 rounded bg-panel-strong px-1 py-px text-[11px]">{hot.zone >= 15 ? "box" : "final ⅓"}</span>
                    </td>
                    <td className="whitespace-nowrap text-muted">{opponents.length ? opponents.map((o) => o.short).join(" + ") : "Blank"}</td>
                    <td className="text-right">
                      <Delta tone="pink">{hot.ratio.toFixed(2)}×</Delta>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="px-2 sm:px-3">
        <div className="px-3 pt-1">
          <PanelHeader title="Best matchups" sub="Ranked by how much the matchup lifts each player, weighted by threat and minutes." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left md:min-w-0">
            <thead>
              <tr>
                <th scope="col" className={TH}>Player</th>
                <th scope="col" className={TH}>Opponent</th>
                <th scope="col" className={TH}>Weak zone</th>
                <th scope="col" className={cx(TH, "text-right")}>Concede</th>
                <th scope="col" className={cx(TH, "text-right")}>Player share</th>
                <th scope="col" className={cx(TH, "text-right")}>Matchup</th>
                <th scope="col" className={cx(TH, "text-right")}>xPts</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(({ position, label }) => {
                const rows = exploits.filter((e) => byId.get(e.playerId)?.position === position).slice(0, 8);
                if (rows.length === 0) return null;
                return [
                  <GroupRow key={`${position}-g`} label={label} span={7} />,
                  ...rows.map((e) => {
                    const p = byId.get(e.playerId)!;
                    const opp = teamById.get(e.opponentId)!;
                    return (
                      <tr key={`${e.playerId}-${e.fixtureId}`} className={ROW}>
                        <td className={TD}>
                          <PlayerIdentity p={p} sub={p.teamShort} />
                        </td>
                        <td className={TD}>
                          <Link href={`/teams/${opp.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                            <TeamBadge src={teamBadge(opp)} short={opp.short} size={16} />
                            {e.home ? "vs" : "at"} {opp.short}
                          </Link>
                        </td>
                        <td className={TD}>
                          <span className="flex items-center gap-2.5" title={capitalize(describeZone(e.zone))}>
                            <MiniZone grid={opp.vulnerability} league={league} highlight={e.zone} size={40} />
                            <span className="hidden items-center gap-1 text-muted lg:flex">
                              {LANES[e.zone % 5]}
                              <span className="rounded bg-panel-strong px-1 py-px text-[11px]">{e.zone >= 15 ? "box" : "final ⅓"}</span>
                            </span>
                          </span>
                        </td>
                        <td className={cx(TD, "text-right tnum")}>{e.zoneRatio.toFixed(2)}×</td>
                        <td className={cx(TD, "text-right tnum")}>{pct(e.playerShare)}</td>
                        <td className={cx(TD, "text-right")}>
                          <Delta tone="pink">{e.matchup.toFixed(2)}×</Delta>
                        </td>
                        <td className={cx(TD, "text-right font-semibold tnum")}>{pts(model.projections[p.id].horizon.find((h) => h.gw === gw)?.xPts ?? 0)}</td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
