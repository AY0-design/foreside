"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cx } from "@/lib/format";

const subscribe = (cb: () => void) => {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
};
const isScrolled = () => window.scrollY > 4;
const serverScrolled = () => false;

/**
 * Stacked blur layers, each masked to its own band: the blur is strongest at the top edge and
 * falls off smoothly below the bar, so there is no hard edge. Only on once content is underneath.
 */
const LAYERS = [
  { blur: 1, from: 0, to: 100 },
  { blur: 2, from: 0, to: 75 },
  { blur: 4, from: 0, to: 55 },
  { blur: 8, from: 0, to: 40 },
  { blur: 16, from: 0, to: 25 },
];

export function ScrollHeader({ children }: { children: ReactNode }) {
  const scrolled = useSyncExternalStore(subscribe, isScrolled, serverScrolled);
  return (
    <header className="sticky top-0 z-30">
      <div aria-hidden className={cx("pointer-events-none absolute inset-x-0 top-0 h-24 transition-opacity duration-300", scrolled ? "opacity-100" : "opacity-0")}>
        {LAYERS.map((l) => (
          <div
            key={l.blur}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${l.blur}px)`,
              WebkitBackdropFilter: `blur(${l.blur}px)`,
              maskImage: `linear-gradient(to bottom, black ${l.from}%, transparent ${l.to}%)`,
              WebkitMaskImage: `linear-gradient(to bottom, black ${l.from}%, transparent ${l.to}%)`,
            }}
          />
        ))}
        {/* A soft darkening under the blur keeps the wordmark legible over busy content. */}
        <div className="absolute inset-0 bg-linear-to-b from-bg/80 via-bg/40 to-transparent" />
      </div>
      <div className="relative">{children}</div>
    </header>
  );
}
