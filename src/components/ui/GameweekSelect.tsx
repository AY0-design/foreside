"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/lib/format";

const STEP = "grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-fg";

/**
 * Gameweek picker: a native select (so it works well on a phone) between previous/next steppers.
 * Navigates to `${path}?gw=N`. Gameweeks before `currentGw` are grouped as played.
 */
export function GameweekSelect({ path, gw, currentGw, first, last }: { path: string; gw: number; currentGw: number; first: number; last: number }) {
  const router = useRouter();
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const href = (g: number) => `${path}?gw=${g}`;
  const option = (g: number) => (
    <option key={g} value={g}>
      Gameweek {g}
      {g === currentGw ? " · current" : ""}
    </option>
  );

  return (
    <div className="flex items-center gap-1">
      {gw > first ? (
        <Link href={href(gw - 1)} aria-label={`Gameweek ${gw - 1}`} className={STEP}>
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <span aria-hidden className={cx(STEP, "opacity-30")}>
          <ChevronLeft size={16} />
        </span>
      )}
      <label className="relative">
        <span className="sr-only">Gameweek</span>
        <select
          value={gw}
          onChange={(e) => router.push(href(Number(e.target.value)))}
          className="h-8 cursor-pointer appearance-none rounded-full bg-panel-strong pr-8 pl-3.5 text-[13px] font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
        >
          {first < currentGw && <optgroup label="Played">{range(first, currentGw - 1).map(option)}</optgroup>}
          <optgroup label={first < currentGw ? "Upcoming" : "Gameweeks"}>{range(currentGw, last).map(option)}</optgroup>
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </label>
      {gw < last ? (
        <Link href={href(gw + 1)} aria-label={`Gameweek ${gw + 1}`} className={STEP}>
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span aria-hidden className={cx(STEP, "opacity-30")}>
          <ChevronRight size={16} />
        </span>
      )}
    </div>
  );
}
