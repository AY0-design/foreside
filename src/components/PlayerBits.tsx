import type { ReactNode } from "react";
import Link from "next/link";
import type { PlayerSummary } from "@/lib/types";
import { Delta, PlayerAvatar, StatusPill } from "@/components/ui/primitives";
import { cx, price, pts } from "@/lib/format";

/** Fey ticker cell: logo, bold short name, muted long name. */
export function PlayerIdentity({ p, size = 28, sub, link = true }: { p: PlayerSummary; size?: number; sub?: ReactNode; link?: boolean }) {
  const name = link ? (
    <Link href={`/players/${p.id}`} className="truncate text-[13px] font-semibold hover:underline">
      {p.webName}
    </Link>
  ) : (
    <span className="truncate text-[13px] font-semibold">{p.webName}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PlayerAvatar photo={p.photo} badge={p.teamBadge} short={p.teamShort} name={p.webName} size={size} />
      <div className="flex min-w-0 items-baseline gap-1.5">
        {name}
        <span className="truncate text-[12px] text-muted">{sub ?? `${p.teamShort} · ${p.position} · ${price(p.price)}`}</span>
        <StatusPill status={p.status} chance={p.chance} />
      </div>
    </div>
  );
}

export const fixtureText = (p: PlayerSummary) => (p.opponentShort ? `${p.opponentShort.includes("+") ? "" : p.home ? "vs " : "at "}${p.opponentShort}` : "Blank");

/** A compact Fey list row: identity left, value and a tinted delta right. */
export function PlayerRow({ p, value, delta, sub }: { p: PlayerSummary; value?: ReactNode; delta?: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
      <PlayerIdentity p={p} sub={sub} />
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[13px] font-semibold tnum">{value ?? pts(p.xPts)}</span>
        {delta}
      </div>
    </li>
  );
}

const CONF: Record<PlayerSummary["confidence"], "green" | "orange" | "red"> = { High: "green", Medium: "orange", Low: "red" };

/** Expected points + confidence as a tinted delta, never a bare number. */
export function ProjectionValue({ p, multiplier = 1 }: { p: PlayerSummary; multiplier?: number }) {
  return (
    <span className="inline-flex items-center gap-2" title={`${p.confidence} confidence · main uncertainty: ${p.mainUncertainty} · range ${p.floor * multiplier}–${p.ceiling * multiplier}`}>
      <span className={cx("text-[13px] font-semibold tnum")}>{pts(p.xPts * multiplier)}</span>
      <Delta tone={CONF[p.confidence]}>{p.confidence[0]}</Delta>
    </span>
  );
}
