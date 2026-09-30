"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Crosshair, Minus, ShieldAlert, Shirt, Sparkles } from "lucide-react";
import type { PlayerSummary } from "@/lib/types";
import { canAfford, explainSelection, horizonScore, isEligibleReplacement, type Horizon, type Lineup, type Lookup } from "@/lib/engine/squad";
import { Delta, IconCircle, PillButton, PlayerAvatar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { pct, price, pts } from "@/lib/format";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[12px] font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Tap a player → the full reasoning: why they're in the squad, why they start or sit,
 * what drives their projection, the zone matchup, the risks, and any better options.
 */
export function PlayerSheet({ player, origin, lineup, ids, all, byId, bank, horizon, onClose, onReplace, onSwap }: {
  player: PlayerSummary | null;
  origin: string | undefined;
  lineup: Lineup;
  ids: number[];
  all: PlayerSummary[];
  byId: Lookup;
  bank: number;
  horizon: Horizon;
  onClose: () => void;
  onReplace: (id: number) => void;
  onSwap: (outId: number, inId: number) => void;
}) {
  const selection = player ? explainSelection(player.id, lineup, byId) : null;
  const alternatives = player
    ? all
        .filter((c) => c.status !== "injured" && c.status !== "suspended" && isEligibleReplacement(ids, byId, player, c) && canAfford(player, c, bank))
        .map((c) => ({ c, delta: horizonScore(c, horizon) - horizonScore(player, horizon) }))
        .filter((x) => x.delta > 0.2)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3)
    : [];
  const captain = player?.id === lineup.captainId;

  return (
    <Sheet open={player !== null} onClose={onClose} title="Why this pick" labelledBy="player-sheet-title">
      {player && selection && (
        <div className="space-y-6 pb-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar photo={player.photo} badge={player.teamBadge} short={player.teamShort} name={player.webName} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{player.name}</p>
              <p className="text-[12px] text-muted">
                {player.teamShort} · {player.position} · {price(player.price)}
              </p>
            </div>
            <Delta tone={captain ? "blue" : selection.role.startsWith("Bench") ? "neutral" : "green"}>{selection.role}</Delta>
          </div>

          <div className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-xl bg-panel text-center">
            {[
              [captain ? "xPts (C)" : "xPts", pts(player.xPts * (captain ? 2 : 1))],
              ["Start", pct(player.pStartEff)],
              ["Next 5", pts(player.horizonTotal)],
              ["Zone fit", `${player.matchup.toFixed(2)}×`],
            ].map(([label, value]) => (
              <div key={label} className="px-2 py-3">
                <div className="text-[11px] text-muted">{label}</div>
                <div className="mt-0.5 text-[14px] font-semibold tnum">{value}</div>
              </div>
            ))}
          </div>

          <Block title="Why they’re in your squad">
            <div className="flex gap-3">
              <IconCircle icon={Sparkles} tone="pink" size={22} />
              <p className="text-[13px] leading-relaxed">{origin ?? "Your own pick — not part of the recommended squad."}</p>
            </div>
          </Block>

          <Block title={selection.role.startsWith("Bench") ? "Why they’re on the bench" : "Why they start"}>
            <ul className="space-y-2.5">
              {selection.lines.map((l) => (
                <li key={l} className="flex gap-3">
                  <IconCircle icon={Shirt} tone="grey" size={22} />
                  <p className="text-[13px] leading-relaxed">{l}</p>
                </li>
              ))}
            </ul>
          </Block>

          <Block title={`What drives the projection · ${player.opponentShort ? `${player.home || player.opponentShort.includes("+") ? "vs" : "at"} ${player.opponentShort}` : "blank"}`}>
            <ul className="space-y-2.5">
              {player.reasons.map((r) => (
                <li key={r.label} className="flex gap-3">
                  <IconCircle icon={r.impact === "positive" ? ArrowUpRight : r.impact === "negative" ? ArrowDownRight : Minus} tone={r.impact === "positive" ? "green" : r.impact === "negative" ? "red" : "grey"} size={22} />
                  <div>
                    <p className="text-[13px] font-semibold">{r.label}</p>
                    <p className="text-[12px] leading-snug text-muted">{r.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          {player.keyZone && (
            <div className="flex gap-3 rounded-xl bg-pink-soft p-3.5">
              <IconCircle icon={Crosshair} tone="pink" size={22} />
              <p className="text-[13px] leading-relaxed">
                {player.opponentShort} are open in the <span className="font-semibold">{player.keyZone}</span>, where {player.webName} does a lot of damage — zone fit {player.matchup.toFixed(2)}×.
              </p>
            </div>
          )}

          {player.risks.length > 0 && (
            <Block title="Risks">
              <ul className="space-y-2.5">
                {player.risks.map((r) => (
                  <li key={r} className="flex gap-3">
                    <IconCircle icon={ShieldAlert} tone="orange" size={22} />
                    <p className="text-[13px] leading-relaxed">{r}</p>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title={`Better options · ${horizon === 1 ? "this gameweek" : "next five"}`}>
            {alternatives.length === 0 ? (
              <p className="rounded-xl bg-panel px-3.5 py-3 text-[13px] text-muted">None — this is the best {player.position} you can afford here.</p>
            ) : (
              <ul>
                {alternatives.map(({ c, delta }) => (
                  <li key={c.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                    <PlayerAvatar photo={c.photo} badge={c.teamBadge} short={c.teamShort} name={c.webName} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{c.webName}</p>
                      <p className="text-[12px] text-muted">{c.teamShort} · {price(c.price)}</p>
                    </div>
                    <Delta tone="green">+{pts(delta)}</Delta>
                    <PillButton size="sm" tone="secondary" onClick={() => onSwap(player.id, c.id)}>
                      Review
                    </PillButton>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <div className="flex gap-2">
            <PillButton onClick={() => onReplace(player.id)}>Replace…</PillButton>
            <Link href={`/players/${player.id}`} className="inline-flex h-9 items-center rounded-full bg-panel-strong px-4 text-[14px] font-medium hover:bg-line">
              Player page
            </Link>
          </div>
        </div>
      )}
    </Sheet>
  );
}
