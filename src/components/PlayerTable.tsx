"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PlayerSummary, Position } from "@/lib/types";
import { budgetPicks, captainPicks, DIFFERENTIAL_RULES, differentials, type RiskAppetite } from "@/lib/engine/picks";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Delta, EmptyState, FDR_BG, FixtureChip, GroupRow, ROW, Sparkline, TD, TH } from "@/components/ui/primitives";
import { PlayerIdentity, ProjectionValue } from "@/components/PlayerBits";
import { cx, own, pct, price, pts } from "@/lib/format";

export type View = "all" | "captain" | "differentials" | "budget";
type SortKey = "xPts" | "horizonTotal" | "pStartEff" | "matchup" | "ownership" | "price";
type OwnBucket = "any" | "lt1" | "1to5" | "5to10" | "gt10";

const OWN_BUCKETS: Record<OwnBucket, [number, number]> = { any: [0, 101], lt1: [0, 1], "1to5": [1, 5], "5to10": [5, 10], gt10: [10, 101] };
const GROUPS: { position: Position; label: string }[] = [
  { position: "FWD", label: "Forwards" },
  { position: "MID", label: "Midfielders" },
  { position: "DEF", label: "Defenders" },
  { position: "GK", label: "Goalkeepers" },
];
const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "xPts", label: "xPts", title: "Expected points this gameweek, with confidence" },
  { key: "matchup", label: "Zone fit", title: "Opponent weakness × player footprint" },
  { key: "pStartEff", label: "Start", title: "Probability of starting" },
  { key: "horizonTotal", label: "Next 5", title: "Expected points over the next five gameweeks" },
  { key: "ownership", label: "Own", title: "Selected by" },
  { key: "price", label: "Price", title: "Current price" },
];
const PER_GROUP = 12;

export function PlayerTable({ players, initialView }: { players: PlayerSummary[]; initialView: View }) {
  const [view, setView] = useState<View>(initialView);
  const [appetite, setAppetite] = useState<RiskAppetite>("balanced");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState(16);
  const [ownBucket, setOwnBucket] = useState<OwnBucket>("any");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [expanded, setExpanded] = useState<Set<Position>>(new Set());

  const rows = useMemo(() => {
    const base =
      view === "captain" ? captainPicks(players, Infinity) : view === "differentials" ? differentials(players, appetite, Infinity) : view === "budget" ? budgetPicks(players, Infinity) : [...players].sort((a, b) => b.xPts - a.xPts);
    const q = query.trim().toLowerCase();
    const [minOwn, maxOwn] = OWN_BUCKETS[ownBucket];
    const filtered = base.filter(
      (p) =>
        (position === "ALL" || p.position === position) &&
        p.price <= maxPrice &&
        p.ownership >= minOwn &&
        p.ownership < maxOwn &&
        p.status !== "injured" &&
        p.status !== "suspended" &&
        (q === "" || p.name.toLowerCase().includes(q) || p.webName.toLowerCase().includes(q) || p.teamShort.toLowerCase() === q),
    );
    if (sort) filtered.sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
    return filtered;
  }, [players, view, appetite, position, query, maxPrice, ownBucket, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s?.key === key ? { key, dir: s.dir === -1 ? 1 : -1 } : { key, dir: -1 }));
  const toggleGroup = (pos: Position) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<View>
          label="Preset"
          value={view}
          onChange={(v) => {
            setView(v);
            setSort(null);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "captain", label: "Captaincy" },
            { value: "differentials", label: "Differentials" },
            { value: "budget", label: "Budget" },
          ]}
        />
        <label className="flex h-8 w-full items-center gap-2 rounded-full bg-panel px-3 sm:w-64">
          <Search size={14} className="text-muted" aria-hidden />
          <span className="sr-only">Filter players</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or club" className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
        <SegmentedControl<Position | "ALL">
          size="sm"
          label="Position"
          value={position}
          onChange={setPosition}
          options={[
            { value: "ALL", label: "All positions" },
            { value: "GK", label: "GK" },
            { value: "DEF", label: "DEF" },
            { value: "MID", label: "MID" },
            { value: "FWD", label: "FWD" },
          ]}
        />
        <SegmentedControl<OwnBucket>
          size="sm"
          label="Ownership"
          value={ownBucket}
          onChange={setOwnBucket}
          options={[
            { value: "any", label: "Any ownership" },
            { value: "lt1", label: "<1%" },
            { value: "1to5", label: "1–5%" },
            { value: "5to10", label: "5–10%" },
            { value: "gt10", label: "10%+" },
          ]}
        />
        {view === "differentials" && (
          <SegmentedControl<RiskAppetite> size="sm" label="Risk appetite" value={appetite} onChange={setAppetite} options={(Object.keys(DIFFERENTIAL_RULES) as RiskAppetite[]).map((k) => ({ value: k, label: DIFFERENTIAL_RULES[k].label }))} />
        )}
        <label className="flex items-center gap-2">
          Max <span className="w-11 font-medium text-fg tnum">{price(maxPrice)}</span>
          <input type="range" min={4} max={16} step={0.5} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-24 accent-[var(--blue)]" />
        </label>
      </div>
      {view === "differentials" && <p className="text-[12px] text-muted">{DIFFERENTIAL_RULES[appetite].describe}.</p>}

      {rows.length === 0 ? (
        <EmptyState title="No players match" body="Widen the price or ownership range." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-panel px-2 pb-2 sm:px-3">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr>
                <th scope="col" className={cx(TH, "pt-4")}>Player</th>
                <th scope="col" className={cx(TH, "pt-4")}>Fixture</th>
                <th scope="col" className={cx(TH, "pt-4 text-center")}>Form</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={cx(TH, "pt-4 text-right")} aria-sort={sort?.key === c.key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
                    <button type="button" title={c.title} onClick={() => toggleSort(c.key)} className={cx("inline-flex items-center gap-1 hover:text-fg", sort?.key === c.key && "text-fg")}>
                      {c.label}
                      <span aria-hidden className="w-2">{sort?.key === c.key ? (sort.dir === -1 ? "↓" : "↑") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(({ position: pos, label }) => {
                const group = rows.filter((p) => p.position === pos);
                if (!group.length) return null;
                const open = expanded.has(pos);
                const shown = open ? group : group.slice(0, PER_GROUP);
                return [
                  <GroupRow key={`${pos}-h`} label={<span>{label} <span className="font-normal text-muted">{group.length}</span></span>} span={9} />,
                  ...shown.map((p) => (
                    <tr key={p.id} className={ROW}>
                      <td className={TD}>
                        <PlayerIdentity p={p} sub={p.teamShort} />
                      </td>
                      <td className={TD}>
                        <span className="flex items-center gap-1.5">
                          <FixtureChip opponent={p.opponentShort} home={p.home} difficulty={p.difficulty} />
                          <span className="flex gap-0.5" aria-label="Following fixture difficulties">
                            {p.horizon.slice(1).map((h) => (
                              <span key={h.gw} title={`GW${h.gw}: ${h.opponentShort ?? "blank"}`} className={cx("h-1.5 w-2.5 rounded-full", h.difficulty ? FDR_BG[h.difficulty] : "bg-panel-strong")} />
                            ))}
                          </span>
                        </span>
                      </td>
                      <td className={cx(TD, "text-center")}>
                        <Sparkline values={p.form} />
                      </td>
                      <td className={cx(TD, "text-right")}>
                        <ProjectionValue p={p} multiplier={view === "captain" ? 2 : 1} />
                      </td>
                      <td className={cx(TD, "text-right")}>
                        <Delta tone={p.matchup >= 1.05 ? "pink" : "neutral"}>{p.matchup.toFixed(2)}×</Delta>
                      </td>
                      <td className={cx(TD, "text-right tnum", p.pStartEff < 0.7 && "text-orange")}>{pct(p.pStartEff)}</td>
                      <td className={cx(TD, "text-right tnum")}>{pts(p.horizonTotal)}</td>
                      <td className={cx(TD, "text-right tnum")}>{own(p.ownership)}</td>
                      <td className={cx(TD, "text-right tnum")}>{price(p.price)}</td>
                    </tr>
                  )),
                  group.length > PER_GROUP ? (
                    <tr key={`${pos}-more`}>
                      <td colSpan={9} className="px-3 py-2">
                        <button type="button" onClick={() => toggleGroup(pos)} className="text-[12px] font-medium text-muted hover:text-fg">
                          {open ? "Show fewer" : `Show all ${group.length}`}
                        </button>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
