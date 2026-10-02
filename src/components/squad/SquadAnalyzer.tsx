"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowRight, Check, Info, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PlayerSummary, Position } from "@/lib/types";
import { analyzeSquad, applyTransfer, captainOptions, READINESS, recommendSquad, squadValue, suggestTransfers, validateSquad, type Horizon, type Severity } from "@/lib/engine/squad";
import { Delta, FixtureChip, GroupRow, HeroNumber, IconCircle, Panel, PanelHeader, PillButton, PlayerAvatar, ROW, TD, TH, type IconTone } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Pitch, LENSES, type Lens } from "./Pitch";
import { PlayerSheet } from "./PlayerSheet";
import { ReplaceDrawer } from "./ReplaceDrawer";
import { ConfirmTransfer, type PendingTransfer } from "./ConfirmTransfer";
import { cx, own, pct, price, pts } from "@/lib/format";

const STORAGE_KEY = "foreside:squad:v4";
const LEGACY_KEY = "foreside:squad:v3";
const HIT_COST = 4;

/** A squad the user has changed with transfers. Until then the page follows the latest recommendation. */
interface Custom {
  ids: number[];
  transfers: { outId: number; inId: number }[];
  /** Why each player is in the squad (recommendation or transfer). */
  origin: Record<number, string>;
}

interface Saved {
  freeTransfers: number;
  custom: Custom | null;
}

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** The saved state, migrating a v3 save: kept only if it had transfers (otherwise it was just an old recommendation). */
function load(): Partial<Saved> | null {
  const v4 = read(STORAGE_KEY) as Partial<Saved> | null;
  if (v4 && typeof v4 === "object") return v4;
  const v3 = read(LEGACY_KEY) as { ids?: unknown; freeTransfers?: unknown; transfers?: unknown; origin?: unknown } | null;
  if (!v3 || typeof v3 !== "object") return null;
  const transfers = Array.isArray(v3.transfers) ? (v3.transfers as Custom["transfers"]) : [];
  return {
    freeTransfers: Number(v3.freeTransfers),
    custom: transfers.length && Array.isArray(v3.ids) ? { ids: v3.ids as number[], transfers, origin: (v3.origin && typeof v3.origin === "object" ? v3.origin : {}) as Custom["origin"] } : null,
  };
}

function save(state: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage unavailable (private mode, blocked). The squad still works for this session.
  }
}

const SEVERITY: Record<Severity, { icon: LucideIcon; tone: IconTone }> = {
  blocking: { icon: AlertOctagon, tone: "red" },
  warning: { icon: AlertTriangle, tone: "orange" },
  info: { icon: Info, tone: "grey" },
};
const POSITIONS: { position: Position; label: string }[] = [
  { position: "GK", label: "Goalkeepers" },
  { position: "DEF", label: "Defenders" },
  { position: "MID", label: "Midfielders" },
  { position: "FWD", label: "Forwards" },
];
const READY_WORD = ["not ready", "short of ready", "nearly ready", "ready"] as const;

const noopSubscribe = () => () => {};

/** Squads live in browser storage, so render the analyzer on the client only. */
export function SquadAnalyzer({ players }: { players: PlayerSummary[] }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return <div aria-busy="true" className="h-[640px] animate-pulse rounded-2xl bg-panel" />;
  return <SquadAnalyzerClient players={players} />;
}

function SquadAnalyzerClient({ players }: { players: PlayerSummary[] }) {
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const recommendation = useMemo(() => recommendSquad(players), [players]);

  // Restore once. A saved edit is kept only while the current data still validates it.
  const [initial] = useState<Saved>(() => {
    const saved = load();
    const c = saved?.custom;
    const valid = c && Array.isArray(c.ids) && Array.isArray(c.transfers) && c.transfers.length > 0 && validateSquad(c.ids, byId).length === 0;
    return {
      freeTransfers: Math.min(5, Math.max(0, Number.isFinite(Number(saved?.freeTransfers)) ? Number(saved?.freeTransfers) : 1)),
      custom: valid ? { ids: c.ids, transfers: c.transfers, origin: c.origin && typeof c.origin === "object" ? c.origin : {} } : null,
    };
  });

  const [custom, setCustom] = useState<Custom | null>(initial.custom);
  const [freeTransfers, setFreeTransfers] = useState(initial.freeTransfers);
  // Untouched, the squad is always the latest recommendation; the first transfer makes it the user's.
  const ids = custom?.ids ?? recommendation.ids;
  const transfers = custom?.transfers ?? [];
  const origin = custom?.origin ?? recommendation.reasons;
  const [horizon, setHorizon] = useState<Horizon>(1);
  const [lens, setLens] = useState<Lens>("xPts");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  // The player a confirmed transfer just brought in: their row and shirt get a one-off arrival cue.
  const [arrivedId, setArrivedId] = useState<number | null>(null);

  useEffect(() => {
    save({ freeTransfers, custom });
  }, [freeTransfers, custom]);

  const analysis = useMemo(() => analyzeSquad(ids, byId), [ids, byId]);
  const suggestions = useMemo(() => suggestTransfers(ids, players, byId, horizon, dismissed), [ids, players, byId, horizon, dismissed]);
  const captains = useMemo(() => captainOptions(analysis.lineup, byId), [analysis.lineup, byId]);

  const hits = Math.max(0, transfers.length - freeTransfers);
  const nextCostsHit = transfers.length >= freeTransfers;
  const starters = analysis.lineup.starters.map((id) => byId.get(id)!);
  const bench = analysis.lineup.bench.map((id) => byId.get(id)!);
  const squad = ids.map((id) => byId.get(id)!);

  const review = useCallback(
    (outId: number, inId: number, gain?: number) => {
      const next = applyTransfer(ids, outId, inId);
      setReplacing(null);
      setInspecting(null);
      setPending({ out: byId.get(outId)!, in: byId.get(inId)!, gain: gain ?? squadValue(next, byId, horizon) - squadValue(ids, byId, horizon), horizon });
    },
    [ids, byId, horizon],
  );

  const confirm = () => {
    if (!pending) return;
    const { out, in: inn, gain } = pending;
    const why = `You brought ${inn.webName} in for ${out.webName}${gain !== null ? `, adding ${gain.toFixed(1)} xPts to your best XI ${pending.horizon === 1 ? "this gameweek" : "over the next five"}` : ""}.`;
    setCustom((c) => {
      const base = c ?? { ids: recommendation.ids, transfers: [], origin: recommendation.reasons };
      const nextOrigin = { ...base.origin, [inn.id]: why };
      delete nextOrigin[out.id];
      return { ids: applyTransfer(base.ids, out.id, inn.id), transfers: [...base.transfers, { outId: out.id, inId: inn.id }], origin: nextOrigin };
    });
    setArrivedId(inn.id);
    setPending(null);
  };

  const reset = () => {
    setCustom(null);
    setArrivedId(null);
    setDismissed(new Set());
  };

  const closeSheet = useCallback(() => setInspecting(null), []);
  const closeDrawer = useCallback(() => setReplacing(null), []);
  const cancelConfirm = useCallback(() => setPending(null), []);
  const role = (id: number) => (id === analysis.lineup.captainId ? "C" : id === analysis.lineup.viceId ? "V" : analysis.lineup.starters.includes(id) ? "XI" : "Bench");

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[5fr_7fr]">
        {/* Left: the projection and the pitch, then readiness, so both columns end together */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <p className="text-[15px] font-semibold text-muted">
              Your squad is{" "}
              <span className={analysis.readiness === 3 ? "text-green" : analysis.readiness === 0 ? "text-red" : "text-orange"}>{READY_WORD[analysis.readiness]}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <HeroNumber value={analysis.projection.expected - hits * HIT_COST} unit="projected" />
              {hits > 0 && <Delta tone="red">−{hits * HIT_COST} hit</Delta>}
            </div>
            <p className="mt-2 text-[12px] text-muted tnum">
              80% range {Math.round(analysis.projection.low)}–{Math.round(analysis.projection.high)} · {analysis.lineup.formation} · bank {price(analysis.bank)} · {transfers.length} transfer{transfers.length === 1 ? "" : "s"} made
            </p>

            <div className="mt-5 mb-3 flex items-center justify-between gap-2">
              <SegmentedControl<Lens> size="sm" label="Pitch lens" value={lens} onChange={setLens} options={LENSES} />
              {custom && (
                <button type="button" onClick={reset} aria-label="Back to the latest recommendation" title="Back to the latest recommendation" className="grid size-7 place-items-center rounded-full text-muted hover:bg-panel-strong hover:text-fg">
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
            <Pitch starters={starters} bench={bench} captainId={analysis.lineup.captainId} viceId={analysis.lineup.viceId} lens={lens} arrivedId={arrivedId} onSelect={setInspecting} />
            <p className="mt-3 text-[12px] text-muted">Tap any player to see why they were picked.</p>
          </Panel>
          <Panel className="flex-1">
            <PanelHeader title="Readiness" actions={<Delta tone={analysis.readiness === 3 ? "green" : analysis.readiness === 0 ? "red" : "orange"}>{READINESS[analysis.readiness]}</Delta>} />
            <div className="grid grid-cols-4 gap-1" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={analysis.readiness} aria-valuetext={READINESS[analysis.readiness]} aria-label="Squad readiness">
              {READINESS.map((label, i) => (
                <div key={label} className={cx("h-1 rounded-full transition-[background-color] duration-200 ease-[ease]", i <= analysis.readiness ? (analysis.readiness === 3 ? "bg-green" : analysis.readiness === 0 ? "bg-red" : "bg-orange") : "bg-panel-strong")} />
              ))}
            </div>
            <ul className="mt-4 space-y-3">
              {analysis.issues.map((issue, i) => {
                const s = SEVERITY[issue.severity];
                return (
                  <li key={`${issue.title}-${i}`} className="flex items-start gap-3">
                    <IconCircle icon={s.icon} tone={s.tone} size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">{issue.title}</p>
                      <p className="text-[12px] leading-snug text-muted">{issue.detail}</p>
                    </div>
                    {issue.playerIds.length === 1 && (
                      <PillButton size="sm" tone="secondary" onClick={() => setInspecting(issue.playerIds[0])}>
                        Why
                      </PillButton>
                    )}
                  </li>
                );
              })}
              {analysis.strengths.map((s) => (
                <li key={s} className="flex items-start gap-3">
                  <IconCircle icon={Check} tone="green" size={22} />
                  <p className="text-[13px] leading-snug">{s}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* Right: the squad as a Fey watchlist */}
        <Panel className="px-2 sm:px-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3">
            <PanelHeader
              title={custom ? "Your squad" : "Squad"}
              sub={
                custom ? (
                  <>
                    Edited from the recommendation · {transfers.length} transfer{transfers.length === 1 ? "" : "s"} ·{" "}
                    <button type="button" onClick={reset} className="font-medium text-fg hover:underline">
                      Back to latest recommendation
                    </button>
                  </>
                ) : (
                  "Recommended £100m squad from the latest data. Every pick has a reason."
                )
              }
            />
            <label className="mb-5 flex items-center gap-2 text-[12px] text-muted">
              Free transfers
              <select value={freeTransfers} onChange={(e) => setFreeTransfers(Number(e.target.value))} className="rounded-md bg-panel-strong px-1.5 py-0.5 text-[13px] font-semibold text-fg">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            {/* In the two-column layout (lg) the panel is narrow, so "Next 5" waits for xl. */}
            <table className="w-full min-w-[520px] text-left lg:min-w-0">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Player</th>
                  <th scope="col" className={TH}>Fixture</th>
                  <th scope="col" className={cx(TH, "text-right")}>xPts</th>
                  <th scope="col" className={cx(TH, "text-right")}>Zone fit</th>
                  <th scope="col" className={cx(TH, "text-right lg:max-xl:hidden")}>Next 5</th>
                  <th scope="col" className={cx(TH, "text-right")}>Role</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map(({ position, label }) => [
                  <GroupRow key={position} label={label} span={6} />,
                  ...squad
                    .filter((p) => p.position === position)
                    .sort((a, b) => b.xPts - a.xPts)
                    .map((p) => {
                      const r = role(p.id);
                      return (
                        <tr key={p.id} className={cx(ROW, "cursor-pointer", p.id === arrivedId && "arrived")} onClick={() => setInspecting(p.id)}>
                          <td className={TD}>
                            <button type="button" onClick={() => setInspecting(p.id)} className="flex items-center gap-2.5 text-left">
                              <PlayerAvatar photo={p.photo} badge={p.teamBadge} short={p.teamShort} name={p.webName} size={24} />
                              <span className="font-semibold">{p.webName}</span>
                              <span className="text-[12px] text-muted">{price(p.price)}</span>
                              {p.status !== "available" && <Delta tone={p.status === "doubtful" ? "orange" : "red"}>{p.status === "doubtful" ? `${p.chance}%` : "Out"}</Delta>}
                            </button>
                          </td>
                          <td className={TD}>
                            <FixtureChip opponent={p.opponentShort} home={p.home} difficulty={p.difficulty} />
                          </td>
                          <td className={cx(TD, "text-right font-semibold tnum")}>{pts(p.xPts * (r === "C" ? 2 : 1))}</td>
                          <td className={cx(TD, "text-right tnum", p.matchup >= 1.05 && "text-pink")}>{p.matchup.toFixed(2)}×</td>
                          <td className={cx(TD, "text-right tnum lg:max-xl:hidden")}>{pts(p.horizonTotal)}</td>
                          <td className={cx(TD, "text-right")}>
                            <Delta tone={r === "C" ? "blue" : r === "V" ? "blue" : r === "XI" ? "green" : "neutral"}>{r}</Delta>
                          </td>
                        </tr>
                      );
                    }),
                ])}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Transfers"
          sub="Best like-for-like upgrades, valued by how much they lift your XI"
          actions={
            <SegmentedControl<"1" | "5">
              size="sm"
              label="Horizon"
              value={String(horizon) as "1" | "5"}
              onChange={(v) => setHorizon(Number(v) as Horizon)}
              options={[
                { value: "1", label: "This GW" },
                { value: "5", label: "Next 5" },
              ]}
            />
          }
        />
        {suggestions.length === 0 && <p className="py-4 text-[13px] text-muted">Nothing worth more than 0.3 xPts — roll the transfer.</p>}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suggestions.map((s) => {
            const out = byId.get(s.outId)!;
            const inn = byId.get(s.inId)!;
            const net = s.gain - (nextCostsHit ? HIT_COST : 0);
            return (
              <li key={`${s.outId}:${s.inId}`} className="flex flex-col rounded-xl bg-panel-strong/50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex items-center">
                    <span className="opacity-50">
                      <PlayerAvatar photo={out.photo} badge={out.teamBadge} short={out.teamShort} name={out.webName} size={28} />
                    </span>
                    <ArrowRight size={13} className="mx-1.5 text-muted" aria-label="to" />
                    <PlayerAvatar photo={inn.photo} badge={inn.teamBadge} short={inn.teamShort} name={inn.webName} size={28} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="text-muted">{out.webName}</span> → <Link href={`/players/${inn.id}`} className="font-semibold hover:underline">{inn.webName}</Link>
                    <span className="block text-[12px] text-muted">{inn.teamShort} · {price(inn.price)} · {own(inn.ownership)} owned</span>
                  </span>
                  <Delta tone="green">+{pts(s.gain)}</Delta>
                  {nextCostsHit && <Delta tone={net > 0 ? "orange" : "red"}>net {net > 0 ? "+" : ""}{pts(net)}</Delta>}
                </div>
                <ul className="mt-3 flex-1 space-y-0.5 text-[12px] text-muted">
                  {s.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <PillButton size="sm" onClick={() => review(s.outId, s.inId, s.gain)}>Review</PillButton>
                  <PillButton size="sm" tone="ghost" onClick={() => setDismissed((d) => new Set(d).add(`${s.outId}:${s.inId}`))}>Dismiss</PillButton>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="px-2 sm:px-3">
        <div className="px-3">
          <PanelHeader title="Captaincy" sub="Expected against upside, template risk and minutes. Shown doubled." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr>
                <th scope="col" className={TH}>Option</th>
                <th scope="col" className={cx(TH, "text-right")}>Expected</th>
                <th scope="col" className={cx(TH, "text-right")}>Ceiling (90th)</th>
                <th scope="col" className={cx(TH, "text-right")}>Ownership</th>
                <th scope="col" className={cx(TH, "text-right")}>Start</th>
                <th scope="col" className={cx(TH, "text-right")}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {captains.map((c, i) => {
                const p = byId.get(c.playerId)!;
                const topCeiling = Math.max(...captains.map((x) => x.ceiling));
                return (
                  <tr key={c.playerId} className={cx(ROW, "cursor-pointer")} onClick={() => setInspecting(p.id)}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <PlayerAvatar photo={p.photo} badge={p.teamBadge} short={p.teamShort} name={p.webName} size={24} />
                        <span className="font-semibold">{p.webName}</span>
                        <span className="text-[12px] text-muted">{p.opponentShort ?? "Blank"}</span>
                        {i === 0 && <Delta tone="blue">Recommended</Delta>}
                      </span>
                    </td>
                    <td className={cx(TD, "text-right tnum", i === 0 && "font-semibold")}>{pts(c.expected)}</td>
                    <td className={cx(TD, "text-right tnum", c.ceiling === topCeiling && "font-semibold")}>{c.ceiling}</td>
                    <td className={cx(TD, "text-right tnum")}>{own(c.ownership)}</td>
                    <td className={cx(TD, "text-right tnum")}>{pct(p.pStartEff)}</td>
                    <td className={cx(TD, "text-right")}>
                      <Delta tone={c.risk === "Low" ? "green" : c.risk === "Medium" ? "orange" : "red"}>{c.risk}</Delta>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 px-3 text-[12px] leading-relaxed text-muted">Chasing rank? A low-owned captain with a high ceiling gains more when it lands. Protecting rank? Favour expected points and ownership.</p>
      </Panel>

      <PlayerSheet
        player={inspecting !== null ? byId.get(inspecting) ?? null : null}
        origin={inspecting !== null ? origin[inspecting] : undefined}
        lineup={analysis.lineup}
        ids={ids}
        all={players}
        byId={byId}
        bank={analysis.bank}
        horizon={horizon}
        onClose={closeSheet}
        onReplace={(id) => {
          setInspecting(null);
          setReplacing(id);
        }}
        onSwap={(outId, inId) => review(outId, inId)}
      />
      <ReplaceDrawer player={replacing !== null ? byId.get(replacing) ?? null : null} ids={ids} all={players} byId={byId} bank={analysis.bank} horizon={horizon} onClose={closeDrawer} onPick={(outId, inId) => review(outId, inId)} />
      <ConfirmTransfer pending={pending} bank={analysis.bank} costsHit={nextCostsHit} hitCost={HIT_COST} onCancel={cancelConfirm} onConfirm={confirm} />
    </div>
  );
}
