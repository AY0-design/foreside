/**
 * Saves the current gameweek's recommendations to data/recommendations/gw-N.json.
 *
 *   npm run record
 *
 * Runs after every sync. While the deadline is open it refreshes the file, so the record is the
 * last one made before the deadline; once the deadline has passed it leaves the file alone, so
 * what we said can't be revised after seeing what happened.
 *
 * The engine imports through the "@/" alias, which plain Node can't resolve, so it is loaded
 * through Vite's SSR loader with the same alias the tests use.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "data", "recommendations");
const SNAPSHOT = path.join(ROOT, "data", "snapshot.json");

async function main() {
  if (!existsSync(SNAPSHOT)) throw new Error("data/snapshot.json is missing; run `npm run sync` first");
  const server = await createServer({ root: ROOT, configFile: false, resolve: { alias: { "@": path.join(ROOT, "src") } }, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  try {
    const { fromSnapshot } = await server.ssrLoadModule("/src/lib/data/fpl.ts");
    const { buildModel } = await server.ssrLoadModule("/src/lib/engine/project.ts");
    const { buildRecommendation, isFrozen } = await server.ssrLoadModule("/src/lib/data/record.ts");

    const model = buildModel(fromSnapshot(JSON.parse(await readFile(SNAPSHOT, "utf8"))));
    const file = path.join(OUT, `gw-${model.currentGw}.json`);
    const existing = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : null;
    if (isFrozen(existing)) {
      console.log(`GW${model.currentGw}: deadline passed, record left as it was`);
      return;
    }
    const record = buildRecommendation(model);
    if (!record) throw new Error(`GW${model.currentGw} has no deadline, so there is nothing to record against`);
    await mkdir(OUT, { recursive: true });
    await writeFile(file, JSON.stringify(record, null, 1).replace(/\[\s+([\d.,\s-]+?)\s+\]/g, (_, xs: string) => `[${xs.replace(/\s+/g, " ")}]`) + "\n");
    console.log(`Recorded GW${record.gw}: ${record.squad.formation}, captain ${record.squad.captainId}, expected XI ${record.squad.expectedXI} pts (deadline ${record.deadline})`);
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
