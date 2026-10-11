import type { Metadata } from "next";
import Link from "next/link";
import { getModel } from "@/lib/data/source";
import { summarize, teamBadge } from "@/lib/data/summaries";
import { gameweekSentiment } from "@/lib/engine/brief";
import { HORIZON } from "@/lib/engine/project";
import { PlayerIdentity } from "@/components/PlayerBits";
import { Delta, GroupRow, Headline, PageBar, Panel, ROW, TabLinks, TD, TeamBadge, TH } from "@/components/ui/primitives";
import { cx, pct, pts } from "@/lib/format";

export const metadata: Metadata = { title: "Fixtures" };

export default async function FixturesPage({ searchParams }: PageProps<"/fixtures">) {
  const model = await getModel();
  const requested = Number((await searchParams).gw);
  // Every gameweek played so far, then the projection window.
  const last = model.currentGw + HORIZON - 1;
  const gws = Array.from({ length: last }, (_, i) => i + 1);
  const gw = gws.includes(requested) ? requested : model.currentGw;
  const past = gw < model.currentGw;
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const summaries = new Map(summarize(model).map((s) => [s.id, s]));
  const fixtures = model.fixtures.filter((f) => f.gw === gw);
  const proj = (fixtureId: number, teamId: number) => model.teamProjections.find((t) => t.fixtureId === fixtureId && t.teamId === teamId)!;
  const sentiment = gameweekSentiment(model, gw);
  const scored = fixtures.filter((f) => f.result);
  const actualGoals = scored.length ? scored.reduce((s, f) => s + f.result!.home + f.result!.away, 0) / scored.length : 0;
  const goalsPerMatch = past ? actualGoals : sentiment.goalsPerMatch;
  const word = goalsPerMatch >= 3.0 ? "attacking" : goalsPerMatch <= 2.6 ? "tight" : "balanced";

  // Highest FPL scorer in a played match, from each player's gameweek history.
  const topScorer = (f: (typeof fixtures)[number]) => {
    let best: { id: number; points: number } | null = null;
    for (const p of model.players) {
      const opponentId = p.teamId === f.homeId ? f.awayId : p.teamId === f.awayId ? f.homeId : null;
      if (opponentId === null) continue;
      const h = p.history.find((x) => x.gw === f.gw && x.opponentId === opponentId);
      if (h && (!best || h.points > best.points)) best = { id: p.id, points: h.points };
    }
    return best;
  };

  const bestPlayer = (fixtureId: number) => {
    let best: { id: number; xPts: number } | null = null;
    for (const p of model.players) {
      const h = model.projections[p.id].horizon.find((x) => x.gw === gw && x.fixtureId === fixtureId);
      if (h && (!best || h.xPts > best.xPts)) best = { id: p.id, xPts: h.xPts };
    }
    return best;
  };

  // Group by matchday, as Fey groups its earnings calendar.
  const days = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    const day = f.kickoff.split(" · ")[0];
    days.set(day, [...(days.get(day) ?? []), f]);
  }

  return (
    <div className="space-y-6">
      <PageBar title="Fixtures" sub={`${fixtures.length} matches · ${goalsPerMatch.toFixed(2)} goals per match ${past ? "scored" : "projected"}`} actions={<TabLinks active={`/fixtures?gw=${gw}`} items={gws.map((g) => ({ href: `/fixtures?gw=${g}`, label: `GW${g}` }))} />} />
      <Headline lead={`Gameweek ${gw} ${past ? "played out" : "looks"}`} emphasis={word} tone={word === "attacking" ? "green" : word === "tight" ? "red" : "fg"} />

      {fixtures.length === 0 ? (
        <p className="text-[14px] text-muted">No fixtures scheduled in GW{gw}.</p>
      ) : (
        <Panel className="px-2 sm:px-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Kick-off</th>
                  <th scope="col" className={TH}>Match</th>
                  <th scope="col" className={cx(TH, "text-center")}>{past ? "Result" : "Projected"}</th>
                  {!past && <th scope="col" className={cx(TH, "text-right")}>Clean sheet</th>}
                  <th scope="col" className={TH}>{past ? "Top scorer" : "Best pick"}</th>
                </tr>
              </thead>
              <tbody>
                {[...days.entries()].map(([day, list]) => [
                  <GroupRow key={day} label={day} span={past ? 4 : 5} />,
                  ...list.map((f) => {
                    const home = teamById.get(f.homeId)!;
                    const away = teamById.get(f.awayId)!;
                    const hp = past ? null : proj(f.id, home.id);
                    const ap = past ? null : proj(f.id, away.id);
                    const best = past ? topScorer(f) : bestPlayer(f.id);
                    const bp = best ? summaries.get(best.id)! : null;
                    return (
                      <tr key={f.id} className={ROW}>
                        <td className={cx(TD, "text-muted tnum")}>{f.kickoff.split(" · ")[1]}</td>
                        <td className={TD}>
                          <Link href={`/fixtures/${f.id}`} className="flex items-center gap-2 hover:underline">
                            <TeamBadge src={teamBadge(home)} short={home.short} size={18} />
                            <span className="font-semibold">{home.short}</span>
                            <span className="text-muted">v</span>
                            <span className="font-semibold">{away.short}</span>
                            <TeamBadge src={teamBadge(away)} short={away.short} size={18} />
                          </Link>
                        </td>
                        <td className={cx(TD, "text-center font-semibold tnum")}>
                          {hp && ap ? (
                            <>
                              <span className="text-blue">{hp.xG.toFixed(1)}</span>
                              <span className="mx-1 text-faint">–</span>
                              <span className="text-pink">{ap.xG.toFixed(1)}</span>
                            </>
                          ) : f.result ? (
                            <>
                              {f.result.home}
                              <span className="mx-1 text-faint">–</span>
                              {f.result.away}
                            </>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        {hp && ap && (
                          <td className={cx(TD, "text-right")}>
                            <span className="inline-flex gap-1">
                              <Delta tone={hp.pCleanSheet >= 0.4 ? "green" : "neutral"}>{home.short} {pct(hp.pCleanSheet)}</Delta>
                              <Delta tone={ap.pCleanSheet >= 0.4 ? "green" : "neutral"}>{away.short} {pct(ap.pCleanSheet)}</Delta>
                            </span>
                          </td>
                        )}
                        <td className={TD}>{bp && best ? <PlayerIdentity p={bp} size={22} sub={"xPts" in best ? `${pts(best.xPts)} xPts` : `${best.points} pts`} /> : "—"}</td>
                      </tr>
                    );
                  }),
                ])}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
