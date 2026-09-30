import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getModel } from "@/lib/data/source";
import { summarize } from "@/lib/data/summaries";
import type { PlayerSummary, Status } from "@/lib/types";
import { PlayerIdentity } from "@/components/PlayerBits";
import { EmptyState, FixtureChip, GroupRow, PageBar, ROW, StatStrip, TD, TH } from "@/components/ui/primitives";
import { cx, own, price } from "@/lib/format";

export const metadata: Metadata = { title: "Availability" };

const GROUPS: { status: Exclude<Status, "available">; label: string }[] = [
  { status: "doubtful", label: "Doubtful" },
  { status: "injured", label: "Out" },
  { status: "suspended", label: "Suspended" },
];

export default function AvailabilityPage() {
  const model = getModel();
  const flagged = summarize(model)
    .filter((p) => p.status !== "available")
    .sort((a, b) => b.ownership - a.ownership);
  const byStatus = (s: Status) => flagged.filter((p) => p.status === s);
  const ownedWidely = flagged.filter((p) => p.ownership >= 10).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Back to home" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel hover:text-fg">
          <ArrowLeft size={16} />
        </Link>
        <PageBar title="Availability" sub={`Every flagged player going into Gameweek ${model.currentGw}, most owned first`} />
      </div>

      <StatStrip
        items={[
          { label: "Doubtful", value: byStatus("doubtful").length },
          { label: "Out", value: byStatus("injured").length },
          { label: "Suspended", value: byStatus("suspended").length },
          { label: "Owned by 10%+", value: ownedWidely },
        ]}
      />

      {flagged.length === 0 ? (
        <EmptyState title="Nobody is flagged" body="Every player is fit for this gameweek." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-panel px-2 pb-2 sm:px-3">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr>
                <th scope="col" className={cx(TH, "pt-4")}>Player</th>
                <th scope="col" className={cx(TH, "pt-4")}>News</th>
                <th scope="col" className={cx(TH, "pt-4")}>Fixture</th>
                <th scope="col" className={cx(TH, "pt-4 text-right")}>Own</th>
                <th scope="col" className={cx(TH, "pt-4 text-right")}>Price</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(({ status, label }) => {
                const group = byStatus(status);
                if (!group.length) return null;
                return [
                  <GroupRow key={`${status}-h`} label={<span>{label} <span className="font-normal text-muted">{group.length}</span></span>} span={5} />,
                  ...group.map((p) => <AvailabilityRow key={p.id} p={p} />),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AvailabilityRow({ p }: { p: PlayerSummary }) {
  return (
    <tr className={ROW}>
      <td className={TD}>
        <PlayerIdentity p={p} sub={`${p.teamShort} · ${p.position}`} />
      </td>
      <td className={cx(TD, "max-w-[360px] whitespace-normal text-muted")}>{p.news ?? "No details from the club"}</td>
      <td className={TD}>
        <FixtureChip opponent={p.opponentShort} home={p.home} difficulty={p.difficulty} />
      </td>
      <td className={cx(TD, "text-right tnum")}>{own(p.ownership)}</td>
      <td className={cx(TD, "text-right tnum")}>{price(p.price)}</td>
    </tr>
  );
}
