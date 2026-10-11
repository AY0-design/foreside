import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fromSnapshot, type Snapshot } from "./fpl";
import { buildModel } from "@/lib/engine/project";
import { summarize } from "./summaries";
import { validateSquad } from "@/lib/engine/squad";
import { buildRecommendation, isFrozen } from "./record";

describe("isFrozen", () => {
  const record = { deadline: "2026-10-17T10:00:00Z" };
  const at = (iso: string) => Date.parse(iso);

  it("lets a sync rewrite the record while the deadline is open, or when there is none yet", () => {
    expect(isFrozen(null, at("2026-10-20T00:00:00Z"))).toBe(false);
    expect(isFrozen(record, at("2026-10-17T09:59:59Z"))).toBe(false);
  });

  it("never lets a sync rewrite a record once its deadline has passed", () => {
    expect(isFrozen(record, at("2026-10-17T10:00:00Z"))).toBe(true);
    expect(isFrozen(record, at("2026-10-25T00:00:00Z"))).toBe(true);
  });
});

const file = path.join(process.cwd(), "data", "snapshot.json");

describe.skipIf(!existsSync(file))("buildRecommendation on the real snapshot", () => {
  const model = buildModel(fromSnapshot(JSON.parse(readFileSync(file, "utf8")) as Snapshot));
  const record = buildRecommendation(model, new Date("2026-10-11T12:00:00Z"))!;
  const byId = new Map(summarize(model).map((p) => [p.id, p]));

  it("records the open gameweek against its deadline", () => {
    expect(record.gw).toBe(model.currentGw);
    expect(record.deadline).toBe(model.deadline);
    expect(record.recordedAt).toBe("2026-10-11T12:00:00.000Z");
  });

  it("saves a valid 15-man squad with a coherent XI, bench and armbands", () => {
    const { ids, starters, bench, captainId, viceId } = record.squad;
    expect(ids).toHaveLength(15);
    expect(validateSquad(ids, byId).filter((m) => m.length)).toEqual([]);
    expect(starters).toHaveLength(11);
    expect(bench).toHaveLength(4);
    expect([...starters, ...bench].sort()).toEqual([...ids].sort());
    expect(starters).toContain(captainId);
    expect(starters).toContain(viceId);
    expect(captainId).not.toBe(viceId);
  });

  it("saves ranked picks and projections that match the model", () => {
    expect(record.captains).toHaveLength(5);
    expect(record.topPicks).toHaveLength(10);
    for (const id of record.squad.starters) expect(record.xPts[id]).toBeCloseTo(byId.get(id)!.xPts, 1);
    expect(Object.values(record.xPts).every((x) => Number.isFinite(x) && x >= 0.3)).toBe(true);
  });

  it("round-trips through JSON unchanged", () => {
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it("records nothing when the gameweek has no deadline", () => {
    expect(buildRecommendation({ ...model, deadline: null })).toBeNull();
  });
});
