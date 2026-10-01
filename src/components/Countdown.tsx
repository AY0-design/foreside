"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const subscribe = (tick: () => void) => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
};
const getSecond = () => Math.floor(Date.now() / 1000) * 1000;
const getServerSecond = () => null;

/**
 * Live countdown to the FPL deadline, to the second. When it reaches zero the page refreshes,
 * and the server (which re-checks FPL once a deadline passes) moves on to the next gameweek.
 */
export function Countdown({ deadline, className }: { deadline: string; className?: string }) {
  const router = useRouter();
  const now = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const target = new Date(deadline).getTime();
  const s = now === null ? null : Math.max(0, Math.floor((target - now) / 1000));

  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (s === 0 && refreshedFor.current !== deadline) {
      refreshedFor.current = deadline;
      router.refresh();
    }
  }, [s, deadline, router]);

  if (s === null) return <span className={className}>—</span>;
  if (s === 0) return <span className={className}>Deadline passed</span>;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(h)}h ${pad(m)}m ${pad(s % 60)}s`;
  return (
    <time dateTime={deadline} className={className}>
      {d > 0 ? `${d}d ${clock}` : clock}
    </time>
  );
}
