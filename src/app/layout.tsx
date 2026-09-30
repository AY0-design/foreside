import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Geist_Mono } from "next/font/google";
import { Dock } from "@/components/Nav";
import { Countdown } from "@/components/Countdown";
import { CommandPalette, type SearchItem } from "@/components/CommandPalette";
import { ScrollHeader } from "@/components/ScrollHeader";
import { getModel } from "@/lib/data/source";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Data comes from data/snapshot.json, which `npm run sync` refreshes at any time — never prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Foreside", template: "%s · Foreside" },
  description: "FPL decision intelligence: fixture → opponent weakness → tactical zone → player matchup → squad decision.",
};

const POS = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" } as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const model = getModel();
  const { currentGw, deadline } = model;
  const teamById = new Map(model.teams.map((t) => [t.id, t]));
  const search: SearchItem[] = [
    ...model.teams.map((t) => ({ kind: "team" as const, label: t.name, sub: "Team", href: `/teams/${t.id}`, terms: `${t.name} ${t.short}`.toLowerCase() })),
    ...model.players
      .filter((p) => p.history.some((h) => h.minutes > 0) || p.pStart > 0.2)
      .map((p) => ({
        kind: "player" as const,
        label: p.webName,
        sub: `${teamById.get(p.teamId)!.short} · ${POS[p.position]}`,
        href: `/players/${p.id}`,
        terms: `${p.name} ${p.webName} ${teamById.get(p.teamId)!.short}`.toLowerCase(),
      })),
  ];

  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Pinned bar: no stroke; a progressive blur fades in once content scrolls underneath. */}
        <ScrollHeader>
          <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
            <Link href="/" className="text-[17px] font-semibold tracking-[-0.03em]">
              Foreside
            </Link>
            <div className="flex items-center gap-3 text-[13px] text-muted">
              {deadline && (
                <span className="hidden sm:inline">
                  GW{currentGw} deadline in <Countdown deadline={deadline} className="font-medium text-fg tnum" />
                </span>
              )}
            </div>
          </div>
        </ScrollHeader>
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pt-6 pb-32 sm:px-8">{children}</main>
        <Dock />
        <CommandPalette items={search} />
      </body>
    </html>
  );
}
