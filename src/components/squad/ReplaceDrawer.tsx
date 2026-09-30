"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { PlayerSummary } from "@/lib/types";
import { canAfford, horizonScore, isEligibleReplacement, type Horizon, type Lookup } from "@/lib/engine/squad";
import { Delta, FixtureChip, PlayerAvatar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { cx, own, price, pts } from "@/lib/format";

export function ReplaceDrawer({ player, ids, all, byId, bank, horizon, onClose, onPick }: {
  player: PlayerSummary | null;
  ids: number[];
  all: PlayerSummary[];
  byId: Lookup;
  bank: number;
  horizon: Horizon;
  onClose: () => void;
  onPick: (outId: number, inId: number) => void;
}) {
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [query, setQuery] = useState("");

  const candidates = useMemo(() => {
    if (!player) return [];
    const q = query.trim().toLowerCase();
    return all
      .filter((c) => isEligibleReplacement(ids, byId, player, c))
      .filter((c) => q === "" || c.name.toLowerCase().includes(q) || c.webName.toLowerCase().includes(q) || c.teamShort.toLowerCase() === q)
      .map((c) => ({ c, affordable: canAfford(player, c, bank) }))
      .filter(({ affordable }) => !affordableOnly || affordable)
      .sort((a, b) => horizonScore(b.c, horizon) - horizonScore(a.c, horizon))
      .slice(0, 60);
  }, [player, all, ids, byId, bank, affordableOnly, query, horizon]);

  return (
    <Sheet open={player !== null} onClose={onClose} title={player ? `Replace ${player.webName}` : "Replace"} labelledBy="replace-title">
      {player && (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            {player.teamShort} · {player.position} · {price(player.price)} · {pts(horizonScore(player, horizon))} xPts {horizon === 1 ? "this GW" : "next 5"} · budget {price(bank + player.price)}
          </p>
          <label className="flex h-9 items-center gap-2 rounded-full bg-panel pr-1.5 pl-3">
            <Search size={14} className="text-muted" aria-hidden />
            <span className="sr-only">Search replacements</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or club" className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-6 place-items-center rounded-full bg-panel-strong">
                <X size={12} />
              </button>
            )}
          </label>
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted">
            <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)} className="size-3.5 accent-[var(--blue)]" />
            Only affordable
          </label>
          <ul>
            {candidates.length === 0 && <li className="py-8 text-center text-[13px] text-muted">No eligible {player.position}s match.</li>}
            {candidates.map(({ c, affordable }) => {
              const score = horizonScore(c, horizon);
              const delta = score - horizonScore(player, horizon);
              return (
                <li key={c.id} className="border-t border-line first:border-t-0">
                  <button type="button" disabled={!affordable} onClick={() => onPick(player.id, c.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40" aria-label={affordable ? `Bring in ${c.name}` : `${c.name} is over budget`}>
                    <PlayerAvatar photo={c.photo} badge={c.teamBadge} short={c.teamShort} name={c.webName} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{c.webName}</span>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        <FixtureChip opponent={c.opponentShort} home={c.home} difficulty={c.difficulty} />
                        <span className={cx(!affordable && "text-red")}>{price(c.price)}</span> · {own(c.ownership)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-semibold tnum">{pts(score)}</span>
                      <Delta tone={delta > 0 ? "green" : delta < 0 ? "red" : "neutral"}>
                        {delta > 0 ? "+" : ""}
                        {pts(delta)}
                      </Delta>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
