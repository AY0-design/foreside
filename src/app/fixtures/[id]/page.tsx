import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getModel } from "@/lib/data/source";
import { summarize, teamBadge } from "@/lib/data/summaries";
import type { Model, Team } from "@/lib/types";
import { Delta, Panel, PanelHeader, ProbabilityCell, ROW, SplitBar, StatStrip, TD, TeamBadge, TH } from "@/components/ui/primitives";
import { FixtureZones } from "@/components/FixtureZones";
import { PlayerIdentity, ProjectionValue } from "@/components/PlayerBits";
import { describeZone } from "@/lib/engine/explain";
import { zoneRatio } from "@/lib/engine/zones";
import { capitalize, cx, own, pct, pts } from "@/lib/format";

async function findFixture(id: string) {
  const model = await getModel();
  const fixture = model.fixtures.find((f) => f.id === Number(id));
  return fixture ? { model, fixture } : null;
}

export async function generateMetadata({ params }: PageProps<"/fixtures/[id]">): Promise<Metadata> {
  const found = await findFixture((await params).id);
  if (!found) return { title: "Fixture not found" };
  const t = (id: number) => found.model.teams.find((x) => x.id === id)!.short;
  return { title: `${t(found.fixture.homeId)} v ${t(found.fixture.awayId)}` };
}

function recentForm(model: Model, teamId: number) {
  return model.fixtures
    .filter((f) => f.result && (f.homeId === teamId || f.awayId === teamId))
    .sort((a, b) => b.gw - a.gw)
    .slice(0, 5)
    .map((f) => {
      const home = f.homeId === teamId;
      const scored = home ? f.result!.home : f.result!.away;
      const conceded = home ? f.result!.away : f.result!.home;
      return { gw: f.gw, scored, conceded, outcome: (scored > conceded ? "W" : scored < conceded ? "L" : "D") as "W" | "D" | "L", opponentId: home ? f.awayId : f.homeId, home };
    });
}

export default async function FixturePage({ params }: PageProps<"/fixtures/[id]">) {
  const found = await findFixture((await params).id);
  if (!found) notFound();
  const { model, fixture: f } = found;
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const home = teamById.get(f.homeId)!;
  const away = teamById.get(f.awayId)!;
  const hp = model.teamProjections.find((t) => t.fixtureId === f.id && t.teamId === home.id);
  const ap = model.teamProjections.find((t) => t.fixtureId === f.id && t.teamId === away.id);

  if (!hp || !ap) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-16 text-center">
        <h1 className="text-[20px] font-semibold">
          {home.name} {f.result ? `${f.result.home}–${f.result.away}` : "v"} {away.name}
        </h1>
        <p className="text-[14px] text-muted">{f.result ? `Played in gameweek ${f.gw}.` : `Gameweek ${f.gw} is outside the projection window.`} Match intelligence covers the next five gameweeks.</p>
        <Link href="/fixtures" className="text-[14px] font-medium hover:underline">Back to fixtures</Link>
      </div>
    );
  }

  const isCurrent = f.gw === model.currentGw;
  const summaries = new Map(summarize(model).map((s) => [s.id, s]));
  const xPtsFor = (playerId: number) => model.projections[playerId].horizon.find((h) => h.gw === f.gw)?.xPts ?? 0;
  const squad = (team: Team) => model.players.filter((p) => p.teamId === team.id && p.pStart > 0.5 && p.status !== "injured" && p.status !== "suspended").sort((a, b) => xPtsFor(b.id) - xPtsFor(a.id));
  const attackers = (team: Team, color: string) =>
    model.players
      .filter((p) => p.teamId === team.id && p.position !== "GK" && p.pStart > 0.5 && p.status === "available")
      .sort((a, b) => b.xg90 + b.xa90 - (a.xg90 + a.xa90))
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.webName, color, occupation: p.occupation }));

  const all = [...squad(home), ...squad(away)];
  const best = [...all].sort((a, b) => xPtsFor(b.id) - xPtsFor(a.id)).slice(0, 4);
  const differential = all.filter((p) => p.ownership < 10 && p.status === "available" && !best.includes(p)).sort((a, b) => xPtsFor(b.id) - xPtsFor(a.id))[0];
  const hForm = recentForm(model, home.id);
  const aForm = recentForm(model, away.id);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const formPts = (form: ReturnType<typeof recentForm>) => form.reduce((s, r) => s + (r.outcome === "W" ? 3 : r.outcome === "D" ? 1 : 0), 0);
  const hottest = (defending: Team) => {
    let top = 10;
    for (let z = 10; z < 20; z++) if (defending.vulnerability[z] - model.leagueVulnerability[z] > defending.vulnerability[top] - model.leagueVulnerability[top]) top = z;
    return top;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/fixtures?gw=${f.gw}`} aria-label="Back to fixtures" className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel hover:text-fg">
          <ArrowLeft size={16} />
        </Link>
        <p className="text-[13px] text-muted">GW{f.gw} · {f.kickoff}</p>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-4">
        <Link href={`/teams/${home.id}`} className="flex items-center justify-end gap-3 text-right">
          <span>
            <span className="block text-[18px] font-semibold">{home.name}</span>
            <span className="text-[12px] text-muted">Home</span>
          </span>
          <TeamBadge src={teamBadge(home)} short={home.short} size={44} />
        </Link>
        <div className="text-center">
          <p className="text-[40px] leading-none font-semibold tracking-[-0.03em] tnum">
            <span className="text-blue">{hp.xG.toFixed(1)}</span>
            <span className="mx-2 text-faint">–</span>
            <span className="text-pink">{ap.xG.toFixed(1)}</span>
          </p>
          <p className="mt-2 text-[12px] text-muted">Projected goals</p>
        </div>
        <Link href={`/teams/${away.id}`} className="flex items-center gap-3">
          <TeamBadge src={teamBadge(away)} short={away.short} size={44} />
          <span>
            <span className="block text-[18px] font-semibold">{away.name}</span>
            <span className="text-[12px] text-muted">Away</span>
          </span>
        </Link>
      </div>

      <StatStrip
        items={[
          { label: `${home.short} to score`, value: pct(hp.pScore) },
          { label: `${home.short} 2+ goals`, value: pct(hp.pTwoPlus) },
          { label: `${home.short} clean sheet`, value: pct(hp.pCleanSheet) },
          { label: `${away.short} to score`, value: pct(ap.pScore) },
          { label: `${away.short} 2+ goals`, value: pct(ap.pTwoPlus) },
          { label: `${away.short} clean sheet`, value: pct(ap.pCleanSheet) },
        ]}
      />

      <Panel>
        <PanelHeader title="Where the goals should come from" sub="Where each side concedes (pink) against who operates there (blue). Real shot locations." />
        <div className="mb-6 flex flex-wrap gap-2">
          {[away, home].map((def) => {
            const z = hottest(def);
            return (
              <span key={def.id} className="inline-flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-[13px]">
                <TeamBadge src={teamBadge(def)} short={def.short} size={16} />
                {def.short} weakest: {capitalize(describeZone(z))}
                <Delta tone="pink">{zoneRatio(def.vulnerability[z], model.leagueVulnerability[z]).toFixed(2)}×</Delta>
              </span>
            );
          })}
        </div>
        <FixtureZones
          league={model.leagueVulnerability}
          sides={[
            { key: "home", attackingShort: home.short, defendingShort: away.short, vulnerability: away.vulnerability, players: attackers(home, "var(--blue)") },
            { key: "away", attackingShort: away.short, defendingShort: home.short, vulnerability: home.vulnerability, players: attackers(away, "var(--blue)") },
          ]}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Team comparison" sub={<span><span className="text-blue">■</span> {home.short} · <span className="text-pink">■</span> {away.short}</span>} />
          <div className="space-y-4">
            <SplitBar label="Attack rating" left={home.attack} right={away.attack} />
            <SplitBar label="Defensive solidity" left={1 / home.defenceWeakness} right={1 / away.defenceWeakness} />
            <SplitBar label="Scored per game (last 5)" left={avg(hForm.map((r) => r.scored))} right={avg(aForm.map((r) => r.scored))} format={(n) => n.toFixed(1)} />
            <SplitBar label="Conceded per game (last 5)" left={avg(hForm.map((r) => r.conceded))} right={avg(aForm.map((r) => r.conceded))} format={(n) => n.toFixed(1)} higherIsBetter={false} />
            <SplitBar label="Form points (last 5)" left={formPts(hForm)} right={formPts(aForm)} format={(n) => String(n)} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Best FPL opportunities" />
          <ul>
            {best.map((p) => {
              const s = summaries.get(p.id)!;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                  <PlayerIdentity p={s} sub={s.teamShort} />
                  {isCurrent ? <ProjectionValue p={s} /> : <span className="text-[13px] font-semibold tnum">{pts(xPtsFor(p.id))}</span>}
                </li>
              );
            })}
          </ul>
          {differential && (
            <div className="mt-4 rounded-xl bg-bg p-3">
              <p className="mb-2 text-[12px] text-muted">Differential · {own(differential.ownership)} owned</p>
              <div className="flex items-center justify-between gap-3">
                <PlayerIdentity p={summaries.get(differential.id)!} sub={summaries.get(differential.id)!.teamShort} />
                <span className="text-[13px] font-semibold tnum">{pts(xPtsFor(differential.id))}</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="px-2 sm:px-3">
        <div className="px-3">
          <PanelHeader title="Goal involvement" sub={isCurrent ? "Per player, from 1,500 simulated matches" : "Expected points (probabilities for the current gameweek only)"} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[home, away].map((team) => (
            <div key={team.id} className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-left">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      <span className="inline-flex items-center gap-1.5 text-fg">
                        <TeamBadge src={teamBadge(team)} short={team.short} size={14} />
                        {team.short}
                      </span>
                    </th>
                    {isCurrent && <th scope="col" className={TH}>Goal</th>}
                    {isCurrent && <th scope="col" className={TH}>Assist</th>}
                    <th scope="col" className={cx(TH, "text-right")}>xPts</th>
                  </tr>
                </thead>
                <tbody>
                  {squad(team).slice(0, 8).map((p) => {
                    const s = summaries.get(p.id)!;
                    return (
                      <tr key={p.id} className={ROW}>
                        <td className={TD}>
                          <PlayerIdentity p={s} size={22} sub={s.position} />
                        </td>
                        {isCurrent && (
                          <td className={TD}>
                            <ProbabilityCell value={s.pGoal} />
                          </td>
                        )}
                        {isCurrent && (
                          <td className={TD}>
                            <ProbabilityCell value={s.pAssist} />
                          </td>
                        )}
                        <td className={cx(TD, "text-right font-semibold tnum")}>{pts(xPtsFor(p.id))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
