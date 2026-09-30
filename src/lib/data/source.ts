import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Model } from "@/lib/types";
import { buildModel } from "@/lib/engine/project";
import { fromSnapshot, type Snapshot } from "./fpl";
import { generateDemoData } from "./demo";

const SNAPSHOT = path.join(process.cwd(), "data", "snapshot.json");

/**
 * Real data from data/snapshot.json (refresh with `npm run sync`). The model is rebuilt whenever
 * the snapshot file changes, so a re-sync shows up without restarting the server. Falls back to
 * the demo league only when no snapshot exists yet.
 */
let cached: { mtime: number; model: Model } | null = null;

export function getModel(): Model {
  let mtime: number;
  try {
    mtime = statSync(SNAPSHOT).mtimeMs;
  } catch {
    cached ??= { mtime: 0, model: buildModel(generateDemoData()) };
    return cached.model;
  }
  if (cached?.mtime !== mtime) {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;
    cached = { mtime, model: buildModel(fromSnapshot(snapshot)) };
  }
  return cached.model;
}
