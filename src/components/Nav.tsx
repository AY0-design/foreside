"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Crosshair, House, Search, Shield, Shirt, Users, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/format";

export const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/matchups", label: "Matchups", icon: Crosshair },
  { href: "/teams", label: "Teams", icon: Shield },
  { href: "/players", label: "Players", icon: Users },
  { href: "/fixtures", label: "Fixtures", icon: CalendarDays },
  { href: "/squad", label: "Squad", icon: Shirt },
];

/** Fey's floating dock, in Family black; search sits in its own circle beside it. */
export function Dock() {
  const pathname = usePathname();
  const open = () => window.dispatchEvent(new CustomEvent("foreside:search"));
  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2">
      <nav aria-label="Main">
        <ul className="flex items-center gap-0.5 rounded-full bg-[#1c1c1e] p-1.5 shadow-pop ring-1 ring-white/10">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  title={label}
                  aria-current={active ? "page" : undefined}
                  className={cx("grid size-9 place-items-center rounded-full transition-colors", active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white")}
                >
                  <Icon size={17} strokeWidth={2} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={open}
        aria-label="Search players, teams and pages (⌘K)"
        title="Search (⌘K)"
        className="grid size-12 place-items-center rounded-full bg-[#1c1c1e] text-white/70 shadow-pop ring-1 ring-white/10 transition-colors hover:text-white"
      >
        <Search size={17} />
      </button>
    </div>
  );
}
