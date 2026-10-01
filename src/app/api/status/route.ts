import { dataStatus } from "@/lib/data/source";

export const dynamic = "force-dynamic";

/** Data health: whether live FPL is being served or the snapshot fallback, and how fresh each is. */
export async function GET() {
  return Response.json(await dataStatus(), { headers: { "Cache-Control": "no-store" } });
}
