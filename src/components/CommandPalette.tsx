"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { NAV } from "@/components/Nav";
import { cx } from "@/lib/format";

export interface SearchItem {
  kind: "player" | "team" | "page";
  label: string;
  sub: string;
  href: string;
  /** Pre-lowered text to match against. */
  terms: string;
}

/** Fey's command search: ⌘K or the dock button, type, arrow, enter. */
export function CommandPalette({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo<SearchItem[]>(() => [...NAV.map((n) => ({ kind: "page" as const, label: n.label, sub: "Page", href: n.href, terms: n.label.toLowerCase() })), ...items], [items]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((i) => i.kind === "page");
    return all.filter((i) => i.terms.includes(q)).slice(0, 12);
  }, [all, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("foreside:search", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("foreside:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const go = (item: SearchItem | undefined) => {
    if (!item) return;
    setOpen(false);
    setQuery("");
    router.push(item.href);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="fixed top-[14vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl bg-panel shadow-pop"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
          >
            <label className="flex items-center gap-3 border-b border-line px-4">
              <Search size={16} className="text-muted" aria-hidden />
              <span className="sr-only">Search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(results.length - 1, c + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (e.key === "Enter") go(results[cursor]);
                }}
                placeholder="Search players, teams, pages…"
                className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                aria-controls="search-results"
              />
              <kbd className="rounded bg-panel-strong px-1.5 py-0.5 text-[11px] text-muted">esc</kbd>
            </label>
            <ul id="search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches</li>}
              {results.map((r, i) => (
                <li key={r.href} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r)}
                    className={cx("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left", i === cursor ? "bg-panel-strong" : "")}
                  >
                    <span className="truncate text-[14px] font-medium">{r.label}</span>
                    <span className="shrink-0 text-[12px] text-muted">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
