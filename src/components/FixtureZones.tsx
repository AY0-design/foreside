"use client";

import { useState } from "react";
import type { ZoneGrid } from "@/lib/types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ZoneMap, type ZonePlayer } from "@/components/ZoneMap";

export interface ZoneSide {
  key: "home" | "away";
  attackingShort: string;
  defendingShort: string;
  vulnerability: ZoneGrid;
  players: ZonePlayer[];
}

export function FixtureZones({ sides, league }: { sides: [ZoneSide, ZoneSide]; league: ZoneGrid }) {
  const [side, setSide] = useState<"home" | "away">("home");
  const current = sides.find((s) => s.key === side)!;
  return (
    <div className="space-y-6">
      <SegmentedControl
        label="Attacking team"
        value={side}
        onChange={setSide}
        options={sides.map((s) => ({ value: s.key, label: `${s.attackingShort} attacking` }))}
      />
      <ZoneMap
        key={side}
        grid={current.vulnerability}
        league={league}
        players={current.players}
        valueLabel={`${current.defendingShort} concede here`}
        attackingLabel={`${current.attackingShort} attacking`}
      />
    </div>
  );
}
