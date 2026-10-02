"use client";

import type { PlayerSummary, Position } from "@/lib/types";
import { PlayerAvatar } from "@/components/ui/primitives";
import { cx, own, pct, pts } from "@/lib/format";

export type Lens = "xPts" | "start" | "own" | "fixture" | "matchup";

export const LENSES: { value: Lens; label: string }[] = [
  { value: "xPts", label: "xPts" },
  { value: "start", label: "Start" },
  { value: "own", label: "Owned" },
  { value: "fixture", label: "Fixture" },
  { value: "matchup", label: "Zone fit" },
];

function lensValue(p: PlayerSummary, lens: Lens, captain: boolean): { text: string; tone?: string } {
  switch (lens) {
    case "xPts":
      return { text: pts(p.xPts * (captain ? 2 : 1)) };
    case "start":
      return { text: pct(p.pStartEff), tone: p.pStartEff < 0.75 ? "text-orange" : undefined };
    case "own":
      return { text: own(p.ownership) };
    case "matchup":
      return { text: `${p.matchup.toFixed(2)}×`, tone: p.matchup >= 1.05 ? "text-pink" : undefined };
    case "fixture":
      return {
        text: p.opponentShort ? `${p.opponentShort}${p.opponentShort.includes("+") ? "" : p.home ? " (H)" : " (A)"}` : "Blank",
        tone: p.difficulty && p.difficulty <= 2 ? "text-green" : p.difficulty && p.difficulty >= 4 ? "text-red" : undefined,
      };
  }
}

function Token({ p, lens, captain, vice, arrived, onSelect }: { p: PlayerSummary; lens: Lens; captain: boolean; vice: boolean; arrived: boolean; onSelect: (id: number) => void }) {
  const value = lensValue(p, lens, captain);
  return (
    <button
      type="button"
      onClick={() => onSelect(p.id)}
      className="press group flex max-w-[84px] min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1"
      aria-label={`${p.name}, ${p.position}, ${pts(p.xPts)} expected points${captain ? ", captain" : vice ? ", vice-captain" : ""}${p.status !== "available" ? `, ${p.status}` : ""}. Why this pick`}
    >
      <span className={cx("relative transition-transform group-hover:-translate-y-0.5", arrived && "arrive")}>
        <PlayerAvatar photo={p.photo} badge={p.teamBadge} short={p.teamShort} name={p.webName} size={38} />
        {(captain || vice) && (
          <span className={cx("absolute -top-1 -left-1.5 grid size-4 place-items-center rounded-full text-[9px] font-bold ring-2 ring-panel", captain ? "bg-inverse text-inverse-fg" : "bg-bg text-fg")}>{captain ? "C" : "V"}</span>
        )}
        {p.status !== "available" && <span aria-hidden className={cx("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-panel", p.status === "doubtful" ? "bg-orange" : "bg-red")} />}
      </span>
      <span className="max-w-full truncate text-[11px] font-semibold">{p.webName}</span>
      <span className={cx("text-[11px] text-muted tnum", value.tone)}>{value.text}</span>
    </button>
  );
}

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export function Pitch({ starters, bench, captainId, viceId, lens, arrivedId = null, onSelect }: {
  starters: PlayerSummary[];
  bench: PlayerSummary[];
  captainId: number;
  viceId: number;
  lens: Lens;
  /** The player who just came in via a transfer: fades in once on arrival. */
  arrivedId?: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-bg px-1 py-5">
        <div aria-hidden className="pointer-events-none absolute inset-2.5 rounded-lg border border-line" />
        <div aria-hidden className="pointer-events-none absolute inset-x-2.5 top-1/2 h-px bg-line" />
        <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" />
        <div aria-hidden className="pointer-events-none absolute top-2.5 left-1/2 h-12 w-2/5 -translate-x-1/2 border border-t-0 border-line" />
        <div className="relative space-y-4">
          {ORDER.map((pos) => (
            <div key={pos} className="flex justify-center gap-0.5 sm:gap-2">
              {starters
                .filter((p) => p.position === pos)
                .map((p) => (
                  <Token key={p.id} p={p} lens={lens} captain={p.id === captainId} vice={p.id === viceId} arrived={p.id === arrivedId} onSelect={onSelect} />
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-0.5 rounded-xl bg-bg py-2 sm:gap-2">
        <span className="px-2 text-[11px] font-medium text-muted">Bench</span>
        {bench.map((p) => (
          <Token key={p.id} p={p} lens={lens} captain={false} vice={false} arrived={p.id === arrivedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
