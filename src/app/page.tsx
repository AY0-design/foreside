import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getModel } from "@/lib/data/source";
import { summarize, teamBadge } from "@/lib/data/summaries";
import { availabilityAlerts, topProjected } from "@/lib/engine/picks";
import { exploitsForGw } from "@/lib/engine/matchups";
import { gameweekBrief, gameweekSentiment } from "@/lib/engine/brief";
import { describeZone } from "@/lib/engine/explain";
import { HORIZON } from "@/lib/engine/project";
import { LEAGUE_GOALS } from "@/lib/engine/team";
import { AreaChart } from "@/components/ui/AreaChart";
import { MiniZone } from "@/components/MiniZone";
import { PlayerIdentity, ProjectionValue } from "@/components/PlayerBits";
import { Delta, Headline, Panel, PanelHeader, PillLink, PlayerAvatar, ShareBar, TeamBadge } from "@/components/ui/primitives";
import { capitalize, own, pct } from "@/lib/format";

const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default function Home() {
  const model = getModel();
  const all = summarize(model);
  const byId = new Map(all.map((p) => [p.id, p]));
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const gw = model.currentGw;
  const sentiment = gameweekSentiment(model);
  const brief = gameweekBrief(model, all);

  // League goals per match: actual for played rounds, projected for the next five.
  const playedGws = [...new Set(model.fixtures.filter((f) => f.result).map((f) => f.gw))].sort((a, b) => a - b);
  const actual = playedGws.map((g) => {
    const fx = model.fixtures.filter((f) => f.gw === g && f.result);
    return fx.reduce((s, f) => s + f.result!.home + f.result!.away, 0) / fx.length;
  });
  const projected = Array.from({ length: HORIZON }, (_, i) => gameweekSentiment(model, gw + i).goalsPerMatch);
  const labels = [...playedGws.map((g) => `GW${g}`), ...projected.map((_, i) => `GW${gw + i}`)];

  const teamRows = model.teamProjections
    .filter((t) => t.gw === gw)
    .map((t) => ({ t, team: teamById.get(t.teamId)!, opp: teamById.get(t.opponentId)!, diff: t.xG - LEAGUE_GOALS }))
    .sort((a, b) => b.t.xG - a.t.xG);
  const maxDiff = Math.max(...teamRows.map((r) => Math.abs(r.diff)), 0.1);

  const perOpponent = new Map<number, number>();
  const exploits = exploitsForGw(model)
    .filter((e) => {
      const n = perOpponent.get(e.opponentId) ?? 0;
      perOpponent.set(e.opponentId, n + 1);
      return n < 2;
    })
    .slice(0, 4);
  const alerts = availabilityAlerts(all, 4);
  const top = topProjected(all, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Gameweek {gw}</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[5fr_7fr]">
        {/* Left: the round at a glance */}
        <Panel className="lg:self-start">
          <p className="text-[12px] text-muted">{model.deadline ? `Deadline ${DATE.format(new Date(model.deadline))}` : `Gameweek ${gw}`}</p>
          <div className="mt-1">
            <Headline lead={`Gameweek ${gw} looks`} emphasis={sentiment.word} tone={sentiment.word === "attacking" ? "green" : sentiment.word === "tight" ? "red" : "fg"} />
          </div>
          <AreaChart
            className="mt-5"
            height={150}
            ariaLabel="League goals per match: actual by gameweek, then projected for the next five"
            labels={labels}
            nowIndex={actual.length ? actual.length - 1 : undefined}
            series={[{ label: `Goals per match · ${sentiment.goalsPerMatch.toFixed(2)} projected`, tone: "blue", values: [...actual, ...projected.map(() => null)] }, { label: "Projected", tone: "pink", values: [...actual.map((v, i) => (i === actual.length - 1 ? v : null)), ...projected] }]}
          />

          <div className="mt-7 border-t border-line pt-4">
            <p className="mb-2 text-[12px] text-muted">Projected goals · GW{gw}</p>
            <ul>
              {teamRows.map(({ t, team, opp, diff }) => (
                <li key={`${t.teamId}-${t.fixtureId}`}>
                  <Link href={`/teams/${team.id}`} className="grid grid-cols-[1fr_52px_72px] items-center gap-3 rounded-md px-1 py-1.5 text-[13px] transition-colors hover:bg-panel-strong/60">
                    <span className="flex min-w-0 items-center gap-2">
                      <TeamBadge src={teamBadge(team)} short={team.short} size={16} />
                      <span className="truncate">{team.name}</span>
                      <span className="truncate text-[12px] text-muted">{t.home ? "v" : "@"} {opp.short}</span>
                    </span>
                    <span className={diff >= 0 ? "text-right text-green tnum" : "text-right text-red tnum"}>{t.xG.toFixed(2)}</span>
                    <ShareBar value={Math.abs(diff)} max={maxDiff} tone={diff >= 0 ? "green" : "red"} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        {/* Right: brief, intelligence, feed */}
        <div className="order-first min-w-0 space-y-5 lg:order-none">
          <Panel className="brief-glow">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded bg-panel-strong/80 px-1.5 py-0.5 text-[12px] text-muted">
                <Sparkles size={12} className="text-pink" /> Foreside brief
              </span>
              <span className="text-[12px] text-muted">Written from today’s data</span>
            </div>
            <p className="text-[15px] leading-relaxed font-semibold">{brief.join(" ")}</p>
          </Panel>

          <Panel>
            <PanelHeader title="Zone exploits" sub={`${exploits.length} strong weakness × footprint matches this round`} actions={<PillLink href="/matchups" size="sm" tone="secondary">All matchups</PillLink>} />
            <ul>
              {exploits.map((e) => {
                const p = byId.get(e.playerId)!;
                const opp = teamById.get(e.opponentId)!;
                return (
                  <li key={`${e.playerId}-${e.fixtureId}`} className="border-t border-line first:border-t-0">
                    <Link href={`/players/${p.id}`} className="flex items-center gap-4 py-3 transition-colors hover:opacity-80">
                      <PlayerAvatar photo={p.photo} badge={p.teamBadge} short={p.teamShort} name={p.webName} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px]">
                          <span className="font-semibold">{p.webName}</span> <span className="text-muted">{e.home ? "vs" : "at"}</span> <span className="font-semibold">{opp.short}</span>
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-muted">
                          {capitalize(describeZone(e.zone))} · {opp.short} concede {e.zoneRatio.toFixed(1)}× average · {pct(e.playerShare)} of {p.webName}’s chances
                        </p>
                      </div>
                      <MiniZone grid={opp.vulnerability} league={model.leagueVulnerability} highlight={e.zone} size={48} />
                      <Delta tone="pink">{e.matchup.toFixed(2)}×</Delta>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid gap-5 md:grid-cols-2">
            <Panel>
              <PanelHeader title="Top projected" actions={<PillLink href="/players" size="sm" tone="ghost">All</PillLink>} />
              <ul>
                {top.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                    <PlayerIdentity p={p} sub={p.teamShort} />
                    <ProjectionValue p={p} />
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader title="Availability" sub="Owned by 2%+" />
              {alerts.length === 0 ? (
                <p className="text-[13px] text-muted">No flagged players.</p>
              ) : (
                <ul>
                  {alerts.map((p) => (
                    <li key={p.id} className="border-t border-line py-2.5 first:border-t-0">
                      <div className="flex items-center justify-between gap-2">
                        <PlayerIdentity p={p} sub={`${own(p.ownership)} owned`} />
                      </div>
                      {p.news && <p className="mt-1 pl-[38px] text-[12px] leading-snug text-muted">{p.news}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
