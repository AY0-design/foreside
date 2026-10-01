import type { Metadata } from "next";
import { getModel } from "@/lib/data/source";
import { summarize } from "@/lib/data/summaries";
import { SquadAnalyzer } from "@/components/squad/SquadAnalyzer";
import { PageBar } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Recommended squad" };

export default async function SquadPage() {
  const model = await getModel();
  return (
    <div className="space-y-6">
      <PageBar title="Recommended squad" sub={`Gameweek ${model.currentGw} · saved in this browser`} />
      <SquadAnalyzer players={summarize(model)} />
    </div>
  );
}
