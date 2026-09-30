"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PercentileBar } from "@/components/ui/primitives";

export interface PercentileRow {
  label: string;
  per90: string;
  total: string;
  percentile: number;
}

export function PercentilePanel({ rows, positionLabel }: { rows: PercentileRow[]; positionLabel: string }) {
  const [mode, setMode] = useState<"per90" | "total">("per90");
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted">vs {positionLabel}, 180+ min</p>
        <SegmentedControl
          size="sm"
          label="Stat basis"
          value={mode}
          onChange={setMode}
          options={[
            { value: "per90", label: "Per 90" },
            { value: "total", label: "Season" },
          ]}
        />
      </div>
      <dl className="space-y-3.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
            <dt className="text-[13px]">{r.label}</dt>
            <dd className="text-right text-[13px] font-semibold tnum">
              {mode === "per90" ? r.per90 : r.total}
              <span className="ml-2 inline-block w-9 text-right text-[12px] font-normal text-muted">{r.percentile}th</span>
            </dd>
            <div className="col-span-2">
              <PercentileBar value={r.percentile} />
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
