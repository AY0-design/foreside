"use client";

import { useSyncExternalStore } from "react";

const subscribe = (tick: () => void) => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
};
const getSecond = () => Math.floor(Date.now() / 1000) * 1000;
const getServerSecond = () => null;

/** Live countdown to the FPL deadline. Renders a stable placeholder on the server. */
export function Countdown({ deadline, className }: { deadline: string; className?: string }) {
  const now = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const target = new Date(deadline).getTime();
  if (now === null) return <span className={className}>—</span>;

  const s = Math.max(0, Math.floor((target - now) / 1000));
  if (s === 0) return <span className={className}>Deadline passed</span>;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <time dateTime={deadline} className={className}>
      {d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m ${pad(s % 60)}s`}
    </time>
  );
}
