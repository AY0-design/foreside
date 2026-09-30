import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Minus, ShieldAlert } from "lucide-react";
import { getModel } from "@/lib/data/source";
import { summarize, teamBadge } from "@/lib/data/summaries";
import { buildPercentiles, seasonStats } from "@/lib/engine/stats";
import { AreaChart } from "@/components/ui/AreaChart";
import { Delta, FixtureChip, HeroNumber, IconCircle, Panel, PanelHeader, PillLink, PlayerAvatar, RangeBar, ROW, StatStrip, TD, TeamBadge, TH } from "@/components/ui/primitives";
import { ZoneMap } from "@/components/ZoneMap";
import { PercentilePanel } from "@/components/PercentilePanel";
import { cx, own, pct, price, pts } from "@/lib/format";

const POSITION_LABEL = { GK: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" } as const;
const POSITION_NAME = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" } as const;
const CONF = { High: "green", Medium: "orange", Low: "red" } as const;

function findPlayer(id: string) {
  const model = getModel();
  const player = model.players.find((p) => p.id === Number(id));
  return player ? { model, player } : null;
}

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const found = findPlayer((await params).id);
  return { title: found?.player.webName ?? "Player not found" };
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const found = findPlayer((await params).id);
  if (!found) notFound();
  const { model, player: p } = found;
  const proj = model.projections[p.id];
  const summary = summarize(model).find((s) => s.id === p.id)!;
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const team = teamById.get(p.teamId)!;
  const opponent = proj.opponentId ? teamById.get(proj.opponentId)! : null;
  const stats = seasonStats(p);
  const percentile = buildPercentiles(model.players);
  const minutes90 = stats.minutes / 90;
  const defensive = p.position === "GK" || p.position === "DEF";

  const teammates = model.players
    .filter((t) => t.teamId === p.teamId && t.position !== "GK" && t.pStart > 0.5 && t.status === "available")
    .sort((a, b) => b.xg90 + b.xa90 - (a.xg90 + a.xa90))
    .slice(0, 6);
  if (!teammates.some((t) => t.id === p.id) && p.position !== "GK") teammates.unshift(p);

  const labels = [...p.history.map((h) => `GW${h.gw}`), ...proj.horizon.map((h) => `GW${h.gw}`)];
  const ppg = stats.ppg;
  const percentileRows = [
    { label: "xG", per90: p.xg90.toFixed(2), total: (p.xg90 * minutes90).toFixed(1), percentile: percentile(p, "xg90") },
    { label: "xA", per90: p.xa90.toFixed(2), total: (p.xa90 * minutes90).toFixed(1), percentile: percentile(p, "xa90") },
    { label: "xGI", per90: (p.xg90 + p.xa90).toFixed(2), total: ((p.xg90 + p.xa90) * minutes90).toFixed(1), percentile: percentile(p, "xgi90") },
    { label: "DefCon hit rate", per90: pct(p.defcon90), total: `~${Math.round(p.defcon90 * minutes90)} games`, percentile: percentile(p, "defcon90") },
    { label: "Points per appearance", per90: ppg.toFixed(1), total: `${stats.points} pts`, percentile: percentile(p, "ppg") },
    { label: "Minutes share", per90: pct(stats.minutes / Math.max(1, p.history.length * 90)), total: `${stats.minutes}′`, percentile: percentile(p, "minutesShare") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/players" aria-label="Back to players" className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel hover:text-fg">
            <ArrowLeft size={16} />
          </Link>
          <PlayerAvatar photo={summary.photo} badge={summary.teamBadge} short={team.short} name={p.webName} size={34} />
          <div>
            <h1 className="text-[16px] leading-tight font-semibold">{p.webName}</h1>
            <p className="text-[12px] text-muted">
              {p.name} · {POSITION_NAME[p.position]} · <Link href={`/teams/${team.id}`} className="hover:underline">{team.name}</Link>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {proj.fixtureId && <PillLink href={`/fixtures/${proj.fixtureId}`} size="sm" tone="secondary">Match intel</PillLink>}
          <PillLink href="/squad" size="sm">My squad</PillLink>
        </div>
      </div>

      {p.news && (
        <p role="status" className={cx("rounded-xl px-4 py-2.5 text-[13px] font-medium", p.status === "doubtful" ? "bg-orange-soft text-orange" : p.status === "available" ? "bg-panel text-muted" : "bg-red-soft text-red")}>
          {p.news}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[8fr_4fr]">
        <div className="min-w-0 pt-2">
          <div className="flex flex-wrap items-baseline gap-3">
            <HeroNumber value={proj.xPts} unit="xPts" />
            <Delta tone={CONF[proj.confidence]}>{proj.confidence} confidence</Delta>
            <span className="text-[13px] text-muted">
              GW{model.currentGw} {opponent ? `${proj.fixtureCount > 1 ? "double:" : proj.home ? "vs" : "at"} ${summary.opponentShort}` : "blank"} · range {proj.floor}–{proj.ceiling}
            </span>
          </div>
          {labels.length > 1 && (
            <AreaChart
              className="mt-6"
              height={220}
              ariaLabel={`${p.webName}: points by gameweek, then projected`}
              labels={labels}
              nowIndex={p.history.length ? p.history.length - 1 : undefined}
              unit="pts"
              series={[
                { label: `Points · ${stats.points} total`, name: "Points", tone: "blue", values: [...p.history.map((h) => h.points), ...proj.horizon.map(() => null)] },
                { label: `Projected · ${pts(proj.horizonTotal)} next 5`, name: "Expected points", tone: "pink", projection: true, values: [...p.history.map((h, i) => (i === p.history.length - 1 ? h.points : null)), ...proj.horizon.map((h) => h.xPts)] },
              ]}
            />
          )}
        </div>

        <Panel className="brief-glow lg:self-start">
          <PanelHeader title="Why" sub={opponent ? `${proj.home ? "Home to" : "Away at"} ${opponent.name}` : "Blank gameweek"} />
          <ul className="space-y-3.5">
            {proj.reasons.map((r) => (
              <li key={r.label} className="flex gap-3">
                <IconCircle icon={r.impact === "positive" ? ArrowUpRight : r.impact === "negative" ? ArrowDownRight : Minus} tone={r.impact === "positive" ? "green" : r.impact === "negative" ? "red" : "grey"} size={22} />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{r.label}</p>
                  <p className="text-[12px] leading-snug text-muted">{r.detail}</p>
                </div>
              </li>
            ))}
            {proj.risks.map((r) => (
              <li key={r} className="flex gap-3">
                <IconCircle icon={ShieldAlert} tone="orange" size={22} />
                <p className="pt-0.5 text-[12px] leading-snug text-muted">{r}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <StatStrip
        items={[
          { label: "Price", value: price(p.price) },
          { label: "Owned", value: own(p.ownership) },
          { label: "Start", value: pct(proj.pStartEff) },
          { label: "Goal", value: pct(proj.pGoal) },
          { label: defensive ? "CS points" : "Assist", value: pct(defensive ? proj.pCleanSheet : proj.pAssist) },
          { label: "Return", value: pct(proj.pReturn) },
          { label: "Zone fit", value: <span className={proj.matchup >= 1.05 ? "text-pink" : ""}>{proj.matchup.toFixed(2)}×</span> },
          { label: "Points", value: stats.points },
        ]}
      />

      {opponent && p.position !== "GK" && (
        <Panel>
          <PanelHeader
            title="Zone matchup"
            sub={`Where ${opponent.name} concede (pink) against where ${p.webName} and teammates shoot and create (blue). ${p.zoneSource === "measured" ? "From real shot locations." : "Estimated — little shot data for this player yet."}`}
            actions={<PillLink href={`/teams/${opponent.id}`} size="sm" tone="secondary">{opponent.short} weaknesses</PillLink>}
          />
          <ZoneMap grid={opponent.vulnerability} league={model.leagueVulnerability} valueLabel={`${opponent.short} concede here`} attackingLabel={`${team.short} attacking`} focusPlayerId={p.id} players={teammates.map((t) => ({ id: t.id, name: t.webName, color: t.id === p.id ? "var(--blue)" : "var(--faint)", occupation: t.occupation }))} />
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Outcome range" sub="10th · 50th · 90th percentile of 1,500 simulations" />
          <RangeBar floor={proj.floor} mean={proj.xPts} ceiling={proj.ceiling} max={Math.max(15, proj.ceiling + 2)} />
          <div className="mt-3 grid grid-cols-3 text-[12px] text-muted">
            <span>Floor <b className="font-semibold text-fg tnum">{proj.floor}</b></span>
            <span className="text-center">Median <b className="font-semibold text-fg tnum">{proj.median}</b></span>
            <span className="text-right">Ceiling <b className="font-semibold text-fg tnum">{proj.ceiling}</b></span>
          </div>
          <p className="mt-6 mb-2 text-[12px] text-muted">Next five</p>
          <ul>
            {summary.horizon.map((h) => (
              <li key={h.gw} className="flex items-center justify-between border-t border-line py-2 text-[13px] first:border-t-0">
                <span className="flex items-center gap-2">
                  <span className="w-9 text-muted">GW{h.gw}</span>
                  <FixtureChip opponent={h.opponentShort} home={h.home} difficulty={h.difficulty} />
                </span>
                <span className="font-semibold tnum">{pts(h.xPts)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Underlying numbers" />
          <PercentilePanel rows={percentileRows} positionLabel={POSITION_LABEL[p.position]} />
        </Panel>

        <Panel className="px-2 sm:px-3">
          <div className="px-3">
            <PanelHeader title="Gameweeks" sub={`${stats.goals} goals · ${stats.assists} assists`} />
          </div>
          {p.history.length === 0 ? (
            <p className="px-3 text-[13px] text-muted">No appearances yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th scope="col" className={TH}>GW</th>
                  <th scope="col" className={TH}>Opp</th>
                  <th scope="col" className={cx(TH, "text-right")}>Min</th>
                  <th scope="col" className={cx(TH, "text-right")}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {[...p.history].reverse().map((h) => {
                  const opp = teamById.get(h.opponentId)!;
                  return (
                    <tr key={h.gw} className={ROW}>
                      <td className={cx(TD, "text-muted")}>{h.gw}</td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-1.5">
                          <TeamBadge src={teamBadge(opp)} short={opp.short} size={14} />
                          {opp.short} <span className="text-muted">{h.home ? "H" : "A"}</span>
                          {h.goals > 0 && <Delta tone="green">{h.goals}G</Delta>}
                          {h.assists > 0 && <Delta tone="blue">{h.assists}A</Delta>}
                        </span>
                      </td>
                      <td className={cx(TD, "text-right text-muted tnum")}>{h.minutes}</td>
                      <td className={cx(TD, "text-right font-semibold tnum")}>{h.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
