import type { Metadata } from "next";
import Link from "next/link";
import { getModel } from "@/lib/data/source";
import { teamBadge } from "@/lib/data/summaries";
import { hotZones } from "@/lib/engine/matchups";
import { describeZone } from "@/lib/engine/explain";
import { LANES } from "@/lib/engine/zones";
import { difficultyFromXg, LEAGUE_GOALS } from "@/lib/engine/team";
import { HORIZON } from "@/lib/engine/project";
import type { Team } from "@/lib/types";
import { MiniZone } from "@/components/MiniZone";
import { Delta, FDR_BG, GroupRow, PageBar, Panel, ROW, Sparkline, TD, TeamBadge, TH } from "@/components/ui/primitives";
import { capitalize, cx } from "@/lib/format";

export const metadata: Metadata = { title: "Teams" };

const GROUPS: { label: string; test: (t: Team) => boolean }[] = [
  { label: "Strongest attacks", test: (t) => t.attack >= 1.1 },
  { label: "Mid-table attacks", test: (t) => t.attack >= 0.95 && t.attack < 1.1 },
  { label: "Weakest attacks", test: (t) => t.attack < 0.95 },
];

export default async function TeamsPage() {
  const model = await getModel();
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const gws = Array.from({ length: HORIZON }, (_, i) => model.currentGw + i);
  const league = model.leagueVulnerability;

  const form = (teamId: number) =>
    model.fixtures
      .filter((f) => f.result && (f.homeId === teamId || f.awayId === teamId))
      .sort((a, b) => b.gw - a.gw)
      .slice(0, 5)
      .reverse()
      .map((f) => {
        const home = f.homeId === teamId;
        const s = home ? f.result!.home : f.result!.away;
        const c = home ? f.result!.away : f.result!.home;
        return s > c ? "W" : s < c ? "L" : "D";
      });

  return (
    <div className="space-y-6">
      <PageBar title="Teams" sub="Attack, defence and the zones each side leaves open" />
      <Panel className="px-2 sm:px-3">
        <div className="overflow-x-auto">
          {/* Fits the panel from tablet up by dropping detail columns; only phones scroll sideways. */}
          <table className="w-full min-w-[560px] text-left md:min-w-0">
            <thead>
              <tr>
                <th scope="col" className={TH}>Team</th>
                <th scope="col" className={cx(TH, "text-right")}>xG / game</th>
                <th scope="col" className={cx(TH, "text-right")}>xGA / game</th>
                <th scope="col" className={cx(TH, "hidden text-center xl:table-cell")}>xG by match</th>
                <th scope="col" className={cx(TH, "hidden lg:table-cell")}>Form</th>
                <th scope="col" className={TH}>Weakest zone</th>
                <th scope="col" className={TH}>Next {HORIZON}</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(({ label, test }) => {
                const teams = model.teams.filter(test).sort((a, b) => b.attack - a.attack);
                if (!teams.length) return null;
                return [
                  <GroupRow key={label} label={label} span={7} />,
                  ...teams.map((team) => {
                    const [hot] = hotZones(team, league, 1);
                    const runs = gws.map((gw) => model.teamProjections.filter((t) => t.teamId === team.id && t.gw === gw));
                    return (
                      <tr key={team.id} className={ROW}>
                        <td className={TD}>
                          <Link href={`/teams/${team.id}`} className="flex items-center gap-2.5">
                            <TeamBadge src={teamBadge(team)} short={team.short} size={22} />
                            <span className="font-semibold">{team.short}</span>
                            <span className="hidden text-muted xl:inline">{team.name}</span>
                          </Link>
                        </td>
                        <td className={cx(TD, "text-right tnum")}>{(team.attack * LEAGUE_GOALS).toFixed(2)}</td>
                        <td className={cx(TD, "text-right tnum")}>{(team.defenceWeakness * LEAGUE_GOALS).toFixed(2)}</td>
                        <td className={cx(TD, "hidden text-center xl:table-cell")}>
                          <Sparkline values={team.matches.map((m) => m.xg)} tone="blue" />
                        </td>
                        <td className={cx(TD, "hidden lg:table-cell")}>
                          <span className="flex gap-0.5">
                            {form(team.id).map((r, i) => (
                              <Delta key={i} tone={r === "W" ? "green" : r === "L" ? "red" : "neutral"} className="w-5 justify-center px-0">
                                {r}
                              </Delta>
                            ))}
                          </span>
                        </td>
                        <td className={TD}>
                          <span className="flex items-center gap-2" title={capitalize(describeZone(hot.zone))}>
                            <MiniZone grid={team.vulnerability} league={league} highlight={hot.zone} size={36} />
                            <span className="hidden items-center gap-1 text-muted lg:flex">
                              {LANES[hot.zone % 5]}
                              <span className="rounded bg-panel-strong px-1 py-px text-[11px]">{hot.zone >= 15 ? "box" : "final ⅓"}</span>
                            </span>
                            <Delta tone="pink">{hot.ratio.toFixed(2)}×</Delta>
                          </span>
                        </td>
                        <td className={TD}>
                          <span className="flex gap-1">
                            {runs.map((cell, i) => (
                              <span
                                key={gws[i]}
                                title={cell.map((r) => `GW${r.gw} ${teamById.get(r.opponentId)!.short} (${r.home ? "H" : "A"}) · ${r.xG.toFixed(2)} xG`).join(", ") || `GW${gws[i]} blank`}
                                className={cx("w-9 rounded py-px text-center text-[11px] font-medium", cell[0] ? FDR_BG[difficultyFromXg(cell[0].xG)] : "bg-panel-strong", cell[0] && difficultyFromXg(cell[0].xG) % 4 === 1 ? "text-white" : "")}
                              >
                                {cell[0] ? teamById.get(cell[0].opponentId)!.short : "—"}
                              </span>
                            ))}
                          </span>
                        </td>
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
