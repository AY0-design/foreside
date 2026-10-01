import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after } from "next/server";
import type { Model } from "@/lib/types";
import { buildModel } from "@/lib/engine/project";
import { fromSnapshot, type Snapshot } from "./fpl";
import { fetchLive, overlayLive, type LiveFpl } from "./live";
import { generateDemoData } from "./demo";

const SNAPSHOT = path.join(process.cwd(), "data", "snapshot.json");
/** How long live FPL data is served before a background refresh. */
const LIVE_TTL_MS = 5 * 60_000;
/** After a failed refresh, wait this long before trying FPL again. */
const RETRY_MS = 60_000;
/** The longest a page waits on FPL before rendering with what it has. */
const WAIT_MS = 6000;

let base: { mtime: number; snapshot: Snapshot } | null = null;
let live: LiveFpl | null = null;
let lastAttempt = 0;
let nextAttempt = 0;
let refreshing: Promise<void> | null = null;
let built: { key: string; model: Model } | null = null;

function loadSnapshot(): typeof base {
  let mtime: number;
  try {
    mtime = statSync(SNAPSHOT).mtimeMs;
  } catch {
    return null;
  }
  if (base?.mtime !== mtime) {
    base = { mtime, snapshot: JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot };
    live = null; // a fresh sync supersedes whatever was overlaid
    nextAttempt = 0;
  }
  return base;
}

function refresh(snapshot: Snapshot): Promise<void> {
  refreshing ??= (async () => {
    lastAttempt = Date.now();
    try {
      live = await fetchLive(snapshot);
      nextAttempt = Date.now() + LIVE_TTL_MS;
    } catch (err) {
      console.error("[foreside] live FPL refresh failed; serving the last good data", err);
      nextAttempt = Date.now() + RETRY_MS;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const within = (p: Promise<void>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

/** Next open deadline at a moment, so a model built from stale data still plans for the right round. */
const openGw = (s: Snapshot, at: number) => [...s.events].sort((a, b) => a.id - b.id).find((e) => Date.parse(e.deadline) > at)?.id ?? 0;

function currentModel(snapshot: { mtime: number; snapshot: Snapshot }): Model {
  const now = Date.now();
  let data: Snapshot;
  let key: string;
  if (live) {
    data = overlayLive(snapshot.snapshot, live);
    key = `${snapshot.mtime}:live:${live.fetchedAt}`;
  } else {
    // FPL unreachable: plan from the snapshot, but against the clock rather than the sync time.
    data = { ...snapshot.snapshot, fetchedAt: new Date(Math.max(now, Date.parse(snapshot.snapshot.fetchedAt))).toISOString() };
    key = `${snapshot.mtime}:snapshot:${openGw(snapshot.snapshot, now)}`;
  }
  if (built?.key !== key) built = { key, model: buildModel(fromSnapshot(data)) };
  return built.model;
}

/**
 * The model for this request: the synced snapshot (Understat zones and history, refreshed by
 * `npm run sync` or the scheduled sync) with live FPL laid over it. Live data refreshes in the
 * background every few minutes, and straight away once a deadline passes, so the site moves to
 * the next gameweek on its own. If FPL is down the last good data is served.
 */
export async function getModel(): Promise<Model> {
  const snapshot = loadSnapshot();
  if (!snapshot) {
    built ??= { key: "demo", model: buildModel(generateDemoData()) };
    return built.model;
  }

  const now = Date.now();
  const deadline = built?.model.deadline ? Date.parse(built.model.deadline) : Infinity;
  const crossedDeadline = live !== null && deadline <= now && lastAttempt < deadline;
  if ((lastAttempt === 0 || crossedDeadline) && now >= nextAttempt) {
    await within(refresh(snapshot.snapshot), WAIT_MS);
  } else if (now >= nextAttempt) {
    after(async () => {
      await refresh(snapshot.snapshot);
      currentModel(snapshot); // build here so the next visitor doesn't pay for it
    });
  }
  return currentModel(snapshot);
}
