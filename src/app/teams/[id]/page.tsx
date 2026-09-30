import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { getModel } from "@/lib/data/source";
import { summarize, teamBadge } from "@/lib/data/summaries";
import { creationGrid, exploitersOf, hotZones, leagueCreationGrid } from "@/lib/engine/matchups";
import { describeZone } from "@/lib/engine/explain";
import { teamSummary } from "@/lib/engine/brief";
import { LEAGUE_GOALS } from "@/lib/engine/team";
import { HORIZON } from "@/lib/engine/project";
import type { Position } from "@/lib/types";
import { AreaChart } from "@/components/ui/AreaChart";
import { ZoneMap } from "@/components/ZoneMap";
import { TeamExploiters } from "@/components/TeamExploiters";
import { PlayerIdentity, ProjectionValue } from "@/components/PlayerBits";
import { Delta, GroupRow, HeroNumber, Panel, PanelHeader, ROW, Sparkline, StatStrip, TD, TeamBadge, TH } from "@/components/ui/primitives";
import { capitalize, cx, own, pct, price, pts } from "@/lib/format";

function findTeam(id: string) {
  const model = getModel();
  const team = model.teams.find((t) => t.id === Number(id));
  return team ? { model, team } : null;
}

export async function generateMetadata({ params }: PageProps<"/teams/[id]">): Promise<Metadata> {
  const found = findTeam((await params).id);
  return { title: found?.team.name ?? "Team not found" };
}

const POSITIONS: { position: Position; label: string }[] = [
  { position: "GK", label: "Goalkeepers" },
  { position: "DEF", label: "Defenders" },
  { position: "MID", label: "Midfielders" },
  { position: "FWD", label: "Forwards" },
];

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const found = findTeam((await params).id);
  if (!found) notFound();
  const { model, team } = found;
  const all = summarize(model);
  const byId = new Map(all.map((p) => [p.id, p]));
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const league = model.leagueVulnerability;
  const gws = Array.from({ length: HORIZON }, (_, i) => model.currentGw + i);

  const upcoming = model.teamProjections.filter((t) => t.teamId === team.id).sort((a, b) => a.gw - b.gw);
  const results = model.fixtures
    .filter((f) => f.result && (f.homeId === team.id || f.awayId === team.id))
    .sort((a, b) => b.gw - a.gw)
    .map((f) => {
      const home = f.homeId === team.id;
      const scored = home ? f.result!.home : f.result!.away;
      const conceded = home ? f.result!.away : f.result!.home;
      return { f, home, scored, conceded, opponent: teamById.get(home ? f.awayId : f.homeId)!, outcome: (scored > conceded ? "W" : scored < conceded ? "L" : "D") as "W" | "D" | "L" };
    });
  const goals = results.reduce((s, r) => s + r.scored, 0);
  const conceded = results.reduce((s, r) => s + r.conceded, 0);
  const cleanSheets = results.filter((r) => r.conceded === 0).length;
  const formPts = results.slice(0, 5).reduce((s, r) => s + (r.outcome === "W" ? 3 : r.outcome === "D" ? 1 : 0), 0);

  const hot = hotZones(team, league, 3);
  const xgPerGame = team.attack * LEAGUE_GOALS;
  const squad = model.players.filter((p) => p.teamId === team.id && (p.pStart > 0.15 || p.history.some((h) => h.minutes > 0)));
  const attackers = squad.filter((p) => p.position !== "GK" && p.pStart > 0.4 && p.status === "available").sort((a, b) => b.xg90 + b.xa90 - (a.xg90 + a.xa90)).slice(0, 7);

  const toRow = (e: ReturnType<typeof exploitersOf>[number]) => ({ player: byId.get(e.playerId)!, matchup: e.matchup, zoneText: describeZone(e.zone), playerShare: e.playerShare, when: e.gw ? `GW${e.gw}` : null, href: `/players/${e.playerId}` });
  const upcomingExploiters = exploitersOf(model, team.id, "upcoming", gws, 8).map(toRow);
  const leagueExploiters = exploitersOf(model, team.id, "league", gws, 8).map(toRow);

  const labels = [...team.matches.map((_, i) => `GW${i + 1}`), ...upcoming.map((f) => `GW${f.gw}`)];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/teams" aria-label="Back to teams" className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel hover:text-fg">
            <ArrowLeft size={16} />
          </Link>
          <TeamBadge src={teamBadge(team)} short={team.short} size={30} />
          <div>
            <h1 className="text-[16px] leading-tight font-semibold">{team.short}</h1>
            <p className="text-[12px] text-muted">{team.name}</p>
          </div>
        </div>
        <nav className="flex gap-1 text-[13px] font-medium">
          {[
            ["#weakness", "Weakness"],
            ["#attack", "Attack"],
            ["#squad", "Squad"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-3 py-1.5 text-muted hover:bg-panel hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid gap-5 lg:grid-cols-[8fr_4fr]">
        <div className="min-w-0 pt-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <HeroNumber value={xgPerGame} digits={2} unit="xG per game" />
            <Delta tone={xgPerGame >= LEAGUE_GOALS ? "green" : "red"}>
              {xgPerGame >= LEAGUE_GOALS ? "+" : ""}
              {(xgPerGame - LEAGUE_GOALS).toFixed(2)} vs league
            </Delta>
          </div>
          {team.matches.length > 1 && (
            <AreaChart
              className="mt-6"
              height={220}
              ariaLabel={`${team.name} expected goals for and against by match, then projected`}
              labels={labels}
              nowIndex={team.matches.length - 1}
              decimals={2}
              series={[
                { label: "xG for", tone: "blue", values: [...team.matches.map((m) => m.xg), ...upcoming.map((f) => f.xG)] },
                { label: "xG against", tone: "pink", values: [...team.matches.map((m) => m.xga), ...upcoming.map((f) => f.xGA)] },
              ]}
            />
          )}
        </div>
        <Panel className="brief-glow">
          <span className="inline-flex items-center gap-1.5 rounded bg-panel-strong/80 px-1.5 py-0.5 text-[12px] text-muted">
            <Sparkles size={12} className="text-pink" /> Scout summary
          </span>
          <div className="mt-4 space-y-3 text-[14px] leading-relaxed">
            {teamSummary(model, team.id).map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        </Panel>
      </div>

      <StatStrip
        items={[
          { label: "xG / game", value: xgPerGame.toFixed(2) },
          { label: "xGA / game", value: (team.defenceWeakness * LEAGUE_GOALS).toFixed(2) },
          { label: "Goals", value: goals },
          { label: "Conceded", value: conceded },
          { label: "Clean sheets", value: cleanSheets },
          { label: "Form (last 5)", value: `${formPts} pts` },
          { label: "Most open", value: <span className="text-pink">{hot[0].ratio.toFixed(2)}×</span> },
          { label: "Next", value: upcoming[0] ? `${teamById.get(upcoming[0].opponentId)!.short} (${upcoming[0].home ? "H" : "A"})` : "—" },
        ]}
      />

      <Panel id="weakness">
        <PanelHeader title={`Where ${team.short} concede`} sub="Non-penalty xG conceded by zone (this season and last) versus the league. Real Understat shot locations." />
        <div className="mb-6 flex flex-wrap gap-2">
          {hot.map((h) => (
            <span key={h.zone} className="inline-flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-[13px]">
              {capitalize(describeZone(h.zone))} <Delta tone="pink">{h.ratio.toFixed(2)}×</Delta>
            </span>
          ))}
        </div>
        <div className="space-y-8">
          <ZoneMap
            grid={team.vulnerability}
            league={league}
            valueLabel={`${team.short} concede here`}
            attackingLabel="Opponents attacking"
            listTitle="Next opponents who operate here"
            players={upcomingExploiters.slice(0, 6).map((r) => ({ id: r.player.id, name: r.player.webName, color: r.player.teamColor, occupation: model.players.find((p) => p.id === r.player.id)!.occupation, sub: `${r.player.teamShort}${r.when ? ` · ${r.when}` : ""}` }))}
          />
          <div className="border-t border-line pt-6">
            <TeamExploiters teamShort={team.short} upcoming={upcomingExploiters} league={leagueExploiters} />
          </div>
        </div>
      </Panel>

      <Panel id="attack">
        <PanelHeader title={`Where ${team.short} create`} sub="The squad’s shots and chances by zone, weighted by threat and minutes, versus the league." />
        <ZoneMap grid={creationGrid(model, team.id)} league={leagueCreationGrid(model)} valueLabel={`${team.short} create here`} attackingLabel={`${team.short} attacking`} players={attackers.map((p) => ({ id: p.id, name: p.webName, color: "var(--blue)", occupation: p.occupation }))} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="px-2 sm:px-3">
          <div className="px-3">
            <PanelHeader title={`Next ${HORIZON}`} />
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={TH}>GW</th>
                <th scope="col" className={TH}>Opponent</th>
                <th scope="col" className={cx(TH, "text-right")}>xG</th>
                <th scope="col" className={cx(TH, "text-right")}>xGA</th>
                <th scope="col" className={cx(TH, "text-right")}>Clean sheet</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((f) => {
                const opp = teamById.get(f.opponentId)!;
                return (
                  <tr key={f.fixtureId} className={ROW}>
                    <td className={cx(TD, "text-muted")}>{f.gw}</td>
                    <td className={TD}>
                      <Link href={`/fixtures/${f.fixtureId}`} className="inline-flex items-center gap-2 hover:underline">
                        <TeamBadge src={teamBadge(opp)} short={opp.short} size={16} />
                        <span className="font-semibold">{opp.short}</span>
                        <span className="text-muted">{f.home ? "home" : "away"}</span>
                      </Link>
                    </td>
                    <td className={cx(TD, "text-right tnum")}>{f.xG.toFixed(2)}</td>
                    <td className={cx(TD, "text-right tnum")}>{f.xGA.toFixed(2)}</td>
                    <td className={cx(TD, "text-right")}>
                      <Delta tone={f.pCleanSheet >= 0.4 ? "green" : f.pCleanSheet <= 0.2 ? "red" : "neutral"}>{pct(f.pCleanSheet)}</Delta>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel className="px-2 sm:px-3">
          <div className="px-3">
            <PanelHeader title="Results" />
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={TH}>GW</th>
                <th scope="col" className={TH}>Opponent</th>
                <th scope="col" className={cx(TH, "text-right")}>Score</th>
                <th scope="col" className={cx(TH, "text-right")}>xG</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const m = team.matches[team.matches.length - 1 - i];
                return (
                  <tr key={r.f.id} className={ROW}>
                    <td className={cx(TD, "text-muted")}>{r.f.gw}</td>
                    <td className={TD}>
                      <Link href={`/fixtures/${r.f.id}`} className="inline-flex items-center gap-2 hover:underline">
                        <TeamBadge src={teamBadge(r.opponent)} short={r.opponent.short} size={16} />
                        <span className="font-semibold">{r.opponent.short}</span>
                        <span className="text-muted">{r.home ? "home" : "away"}</span>
                      </Link>
                    </td>
                    <td className={cx(TD, "text-right")}>
                      <span className="inline-flex items-center gap-2 tnum">
                        {r.scored}–{r.conceded}
                        <Delta tone={r.outcome === "W" ? "green" : r.outcome === "L" ? "red" : "neutral"} className="w-5 justify-center px-0">
                          {r.outcome}
                        </Delta>
                      </span>
                    </td>
                    <td className={cx(TD, "text-right text-muted tnum")}>{m ? `${m.xg.toFixed(1)}–${m.xga.toFixed(1)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel id="squad" className="px-2 sm:px-3">
        <div className="px-3">
          <PanelHeader title="Squad" sub={`Gameweek ${model.currentGw} projections`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr>
                <th scope="col" className={TH}>Player</th>
                <th scope="col" className={cx(TH, "text-center")}>Form</th>
                <th scope="col" className={cx(TH, "text-right")}>xPts</th>
                <th scope="col" className={cx(TH, "text-right")}>Start</th>
                <th scope="col" className={cx(TH, "text-right")}>Zone fit</th>
                <th scope="col" className={cx(TH, "text-right")}>Next 5</th>
                <th scope="col" className={cx(TH, "text-right")}>Own</th>
                <th scope="col" className={cx(TH, "text-right")}>Price</th>
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map(({ position, label }) => {
                const rows = squad.filter((p) => p.position === position).map((p) => byId.get(p.id)!).sort((a, b) => b.xPts - a.xPts);
                if (!rows.length) return null;
                return [
                  <GroupRow key={position} label={label} span={8} />,
                  ...rows.map((s) => (
                    <tr key={s.id} className={ROW}>
                      <td className={TD}>
                        <PlayerIdentity p={s} sub={s.position} />
                      </td>
                      <td className={cx(TD, "text-center")}>
                        <Sparkline values={s.form} />
                      </td>
                      <td className={cx(TD, "text-right")}>
                        <ProjectionValue p={s} />
                      </td>
                      <td className={cx(TD, "text-right tnum", s.pStartEff < 0.7 && "text-orange")}>{pct(s.pStartEff)}</td>
                      <td className={cx(TD, "text-right tnum", s.matchup >= 1.05 && "text-pink")}>{s.matchup.toFixed(2)}×</td>
                      <td className={cx(TD, "text-right tnum")}>{pts(s.horizonTotal)}</td>
                      <td className={cx(TD, "text-right tnum")}>{own(s.ownership)}</td>
                      <td className={cx(TD, "text-right tnum")}>{price(s.price)}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
