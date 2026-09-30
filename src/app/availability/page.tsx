import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { getModel } from "@/lib/data/source";
import { summarize } from "@/lib/data/summaries";
import type { PlayerSummary, Status } from "@/lib/types";
import { PlayerIdentity } from "@/components/PlayerBits";
import { EmptyState, FixtureChip, ROW, TabLinks, TD, TH } from "@/components/ui/primitives";
import { cx, own, price } from "@/lib/format";

export const metadata: Metadata = { title: "Availability" };

type Flag = Exclude<Status, "available">;

const TABS: { status: Flag; label: string; empty: string }[] = [
  { status: "doubtful", label: "Doubtful", empty: "No doubts this gameweek." },
  { status: "injured", label: "Out", empty: "Nobody is ruled out." },
  { status: "suspended", label: "Suspended", empty: "Nobody is suspended." },
];

export default async function AvailabilityPage({ searchParams }: PageProps<"/availability">) {
  const { status } = await searchParams;
  const tab = TABS.find((t) => t.status === status) ?? TABS[0];
  const model = getModel();
  const flagged = summarize(model).filter((p) => p.status !== "available");
  const count = (s: Flag) => flagged.filter((p) => p.status === s).length;
  const rows = flagged.filter((p) => p.status === tab.status).sort((a, b) => b.ownership - a.ownership);

  return (
    // No top bar on this view (see ScrollHeader), so it carries its own top spacing.
    <div className="space-y-6 pt-5">
      {/* Fey header: close on the left, section tabs on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        {/* Fey's close sits in the left gutter, just above the title line; inline when there's no gutter. */}
        <div className="relative flex min-w-0 items-start gap-3">
          <Link
            href="/"
            aria-label="Close and go back home"
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-panel text-muted transition-colors hover:bg-panel-strong hover:text-fg min-[1260px]:absolute min-[1260px]:-top-2.5 min-[1260px]:-left-[59px] min-[1260px]:mt-0"
          >
            <X size={12} strokeWidth={2.25} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Availability</h1>
            <p className="mt-0.5 text-[13px] text-muted">Gameweek {model.currentGw} · most owned first</p>
          </div>
        </div>
        <TabLinks
          active={`/availability?status=${tab.status}`}
          items={TABS.map((t) => ({
            href: `/availability?status=${t.status}`,
            label: (
              <>
                {t.label} <span className="text-faint tnum">{count(t.status)}</span>
              </>
            ),
          }))}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-panel">
          <EmptyState title={tab.empty} body="Check back after the next team news." />
        </div>
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
              {rows.map((p) => (
                <AvailabilityRow key={p.id} p={p} />
              ))}
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
