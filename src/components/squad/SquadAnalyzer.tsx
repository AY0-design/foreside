"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
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

const STORAGE_KEY = "foreside:squad:v3";
const HIT_COST = 4;

interface Saved {
  ids: number[];
  freeTransfers: number;
  transfers: { outId: number; inId: number }[];
  /** Why each player is in the squad (recommendation or transfer). */
  origin: Record<number, string>;
}

function load(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(state: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  const fresh = useCallback((): Saved => ({ ids: recommendation.ids, freeTransfers: 1, transfers: [], origin: recommendation.reasons }), [recommendation]);

  // Restore a saved squad once; ignore anything the current data can't validate.
  const [initial] = useState<Saved>(() => {
    const saved = load();
    if (saved && Array.isArray(saved.ids) && validateSquad(saved.ids, byId).length === 0) {
      return {
        ids: saved.ids,
        freeTransfers: Math.min(5, Math.max(0, Number(saved.freeTransfers) || 1)),
        transfers: Array.isArray(saved.transfers) ? saved.transfers : [],
        origin: saved.origin && typeof saved.origin === "object" ? saved.origin : {},
      };
    }
    return fresh();
  });

  const [ids, setIds] = useState<number[]>(initial.ids);
  const [freeTransfers, setFreeTransfers] = useState(initial.freeTransfers);
  const [transfers, setTransfers] = useState<Saved["transfers"]>(initial.transfers);
  const [origin, setOrigin] = useState<Saved["origin"]>(initial.origin);
  const [horizon, setHorizon] = useState<Horizon>(1);
  const [lens, setLens] = useState<Lens>("xPts");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [replacing, setReplacing] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingTransfer | null>(null);

  useEffect(() => {
    save({ ids, freeTransfers, transfers, origin });
  }, [ids, freeTransfers, transfers, origin]);

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
    setIds((cur) => applyTransfer(cur, out.id, inn.id));
    setTransfers((t) => [...t, { outId: out.id, inId: inn.id }]);
    setOrigin((o) => {
      const next = { ...o };
      delete next[out.id];
      next[inn.id] = `You brought ${inn.webName} in for ${out.webName}${gain !== null ? `, adding ${gain.toFixed(1)} xPts to your best XI ${pending.horizon === 1 ? "this gameweek" : "over the next five"}` : ""}.`;
      return next;
    });
    setPending(null);
  };

  const reset = () => {
    const f = fresh();
    setIds(f.ids);
    setTransfers([]);
    setOrigin(f.origin);
    setDismissed(new Set());
  };

  const closeSheet = useCallback(() => setInspecting(null), []);
  const closeDrawer = useCallback(() => setReplacing(null), []);
  const cancelConfirm = useCallback(() => setPending(null), []);
  const role = (id: number) => (id === analysis.lineup.captainId ? "C" : id === analysis.lineup.viceId ? "V" : analysis.lineup.starters.includes(id) ? "XI" : "Bench");

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[5fr_7fr]">
        {/* Left: the projection and the pitch */}
        <Panel className="lg:self-start">
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
            <button type="button" onClick={reset} aria-label="Reset to recommended squad" title="Reset to recommended squad" className="grid size-7 place-items-center rounded-full text-muted hover:bg-panel-strong hover:text-fg">
              <RotateCcw size={13} />
            </button>
          </div>
          <Pitch starters={starters} bench={bench} captainId={analysis.lineup.captainId} viceId={analysis.lineup.viceId} lens={lens} onSelect={setInspecting} />
          <p className="mt-3 text-[12px] text-muted">Tap any player to see why they were picked.</p>
        </Panel>

        {/* Right: the squad as a Fey watchlist */}
        <Panel className="px-2 sm:px-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3">
            <PanelHeader title="Squad" sub="Recommended £100m squad — every pick has a reason" />
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
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Player</th>
                  <th scope="col" className={TH}>Fixture</th>
                  <th scope="col" className={cx(TH, "text-right")}>xPts</th>
                  <th scope="col" className={cx(TH, "text-right")}>Zone fit</th>
                  <th scope="col" className={cx(TH, "text-right")}>Next 5</th>
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
                        <tr key={p.id} className={cx(ROW, "cursor-pointer")} onClick={() => setInspecting(p.id)}>
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
                          <td className={cx(TD, "text-right tnum")}>{pts(p.horizonTotal)}</td>
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

      <div className="grid gap-5 lg:grid-cols-[7fr_5fr]">
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
          <ul>
            <AnimatePresence initial={false}>
              {suggestions.map((s) => {
                const out = byId.get(s.outId)!;
                const inn = byId.get(s.inId)!;
                const net = s.gain - (nextCostsHit ? HIT_COST : 0);
                return (
                  <motion.li key={`${s.outId}:${s.inId}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-line py-4 first:border-t-0 first:pt-0">
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
                    <ul className="mt-2 space-y-0.5 pl-[92px] text-[12px] text-muted max-sm:pl-0">
                      {s.why.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2 pl-[92px] max-sm:pl-0">
                      <PillButton size="sm" onClick={() => review(s.outId, s.inId, s.gain)}>Review</PillButton>
                      <PillButton size="sm" tone="ghost" onClick={() => setDismissed((d) => new Set(d).add(`${s.outId}:${s.inId}`))}>Dismiss</PillButton>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </Panel>

        <Panel className="lg:self-start">
          <PanelHeader title="Readiness" actions={<Delta tone={analysis.readiness === 3 ? "green" : analysis.readiness === 0 ? "red" : "orange"}>{READINESS[analysis.readiness]}</Delta>} />
          <div className="grid grid-cols-4 gap-1" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={analysis.readiness} aria-valuetext={READINESS[analysis.readiness]} aria-label="Squad readiness">
            {READINESS.map((label, i) => (
              <div key={label} className={cx("h-1 rounded-full", i <= analysis.readiness ? (analysis.readiness === 3 ? "bg-green" : analysis.readiness === 0 ? "bg-red" : "bg-orange") : "bg-panel-strong")} />
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
