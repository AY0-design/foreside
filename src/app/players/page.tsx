import type { Metadata } from "next";
import { getModel } from "@/lib/data/source";
import { summarize } from "@/lib/data/summaries";
import { PlayerTable, type View } from "@/components/PlayerTable";
import { PageBar } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Players" };

const VIEWS: View[] = ["all", "captain", "differentials", "budget"];

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const { view } = await searchParams;
  const initialView = VIEWS.includes(view as View) ? (view as View) : "all";
  const model = await getModel();
  return (
    <div className="space-y-6">
      <PageBar title="Players" sub={`Gameweek ${model.currentGw} projections, confidence and zone fit`} />
      <PlayerTable players={summarize(model)} initialView={initialView} />
    </div>
  );
}
