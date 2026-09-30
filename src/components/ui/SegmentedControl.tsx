"use client";

import { cx } from "@/lib/format";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Fey's two selectors:
 * - "pills": range/section pills where the active one sits on a raised chip (1M · 3M · YTD).
 * - "tabs": plain text tabs (News · KPIs · About).
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, variant = "pills", size = "md" }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  variant?: "tabs" | "pills";
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("no-scrollbar flex max-w-full overflow-x-auto", variant === "tabs" ? "gap-4" : "gap-1")}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "shrink-0 font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "text-[12px]" : "text-[13px]",
              variant === "tabs" ? (active ? "text-fg" : "text-muted hover:text-fg") : cx("rounded-md px-2.5 py-1", active ? "bg-panel-strong text-fg" : "text-muted hover:text-fg"),
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
