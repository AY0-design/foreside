import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { Confidence, Status } from "@/lib/types";
import { cx, pct } from "@/lib/format";
import { Headshot } from "./Headshot";

// ─────────────────────────── Page structure (Fey) ───────────────────────────

/** Fey page bar: title left, segmented tabs / actions right. */
export function PageBar({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Fey panel: large rounded surface on the page background. */
export function Panel({ children, className, as: Tag = "section", id }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; id?: string }) {
  return (
    <Tag aria-labelledby={id} className={cx("min-w-0 rounded-2xl bg-panel p-5 sm:p-6", className)}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, sub, actions, id }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="mt-1 text-[13px] leading-snug text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Fey's sentiment line: muted sentence with one emphasised word. */
export function Headline({ lead, emphasis, tone = "fg" }: { lead: string; emphasis: string; tone?: "fg" | "green" | "red" | "pink" | "blue" }) {
  const color = { fg: "text-fg", green: "text-green", red: "text-red", pink: "text-pink", blue: "text-blue" }[tone];
  return (
    <p className="text-[15px] font-semibold text-muted">
      {lead} <span className={color}>{emphasis}</span>
    </p>
  );
}

/** Big number with the decimals muted, as Fey does prices. */
export function HeroNumber({ value, digits = 1, unit, className }: { value: number; digits?: number; unit?: string; className?: string }) {
  const [int, dec] = value.toFixed(digits).split(".");
  return (
    <span className={cx("text-[40px] leading-none font-semibold tracking-[-0.03em] tnum", className)}>
      {int}
      {dec !== undefined && <span className="text-muted">.{dec}</span>}
      {unit && <span className="ml-1.5 text-[16px] font-medium tracking-normal text-muted">{unit}</span>}
    </span>
  );
}

/** Fey stat strip: one row, vertical dividers between cells. */
export function StatStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-panel sm:flex sm:divide-x sm:divide-line">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 flex-1 px-4 py-4 text-center">
          <div className="truncate text-[12px] text-muted">{i.label}</div>
          <div className="mt-1 truncate text-[15px] font-semibold tnum">{i.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── Tables (Fey) ───────────────────────────

export const TH = "px-3 py-2 text-[12px] font-medium text-muted whitespace-nowrap";
export const TD = "px-3 py-2.5 text-[13px] whitespace-nowrap";
export const ROW = "group border-t border-line transition-colors hover:bg-panel-strong/60";

export function GroupRow({ label, span }: { label: ReactNode; span: number }) {
  return (
    <tr>
      <th colSpan={span} scope="colgroup" className="px-3 pt-6 pb-2 text-left text-[13px] font-semibold">
        {label}
      </th>
    </tr>
  );
}

// ─────────────────────────── Marks ───────────────────────────

export type DeltaTone = "green" | "red" | "orange" | "pink" | "blue" | "neutral";
const DELTA: Record<DeltaTone, string> = {
  green: "bg-green-soft text-green",
  red: "bg-red-soft text-red",
  orange: "bg-orange-soft text-orange",
  pink: "bg-pink-soft text-pink",
  blue: "bg-blue-soft text-blue",
  neutral: "bg-panel-strong text-muted",
};

/** Fey's small tinted rectangle for changes and scores. */
export function Delta({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: DeltaTone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center rounded px-1.5 py-px text-[12px] font-medium whitespace-nowrap tnum", DELTA[tone], className)}>
      {children}
    </span>
  );
}

/** Tiny trend line (form, xG by match). Colour follows the direction of travel. */
export function Sparkline({ values, width = 64, height = 20, tone }: { values: number[]; width?: number; height?: number; tone?: "blue" | "pink" | "green" | "red" | "muted" }) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(" ");
  const trend = tone ?? (values[values.length - 1] >= values[0] ? "green" : "red");
  const stroke = { blue: "var(--blue)", pink: "var(--pink)", green: "var(--green)", red: "var(--red)", muted: "var(--muted)" }[trend];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Horizontal share bar used in Fey's sector list. */
export function ShareBar({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "pink" | "green" | "red" }) {
  const fill = { blue: "bg-blue", pink: "bg-pink", green: "bg-green", red: "bg-red" }[tone];
  return (
    <span className="block h-1.5 w-full rounded-full bg-panel-strong" aria-hidden>
      <span className={cx("block h-full rounded-full", fill)} style={{ width: `${Math.max(4, Math.min(100, (value / max) * 100))}%` }} />
    </span>
  );
}

// ─────────────────────────── Actions ───────────────────────────

type ButtonTone = "primary" | "secondary" | "ghost";
const BUTTON: Record<ButtonTone, string> = {
  primary: "bg-inverse text-inverse-fg hover:opacity-85",
  secondary: "bg-panel-strong text-fg hover:bg-line",
  ghost: "text-muted hover:text-fg hover:bg-panel-strong",
};
const buttonClass = (tone: ButtonTone, size: "sm" | "md" | "lg") =>
  cx(
    "inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40",
    size === "sm" ? "h-7 px-3 text-[13px]" : size === "md" ? "h-9 px-4 text-[14px]" : "h-11 px-5 text-[15px]",
    BUTTON[tone],
  );

export function PillButton({ tone = "primary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: "sm" | "md" | "lg" }) {
  return <button type="button" className={cx(buttonClass(tone, size), className)} {...props} />;
}

export function PillLink({ tone = "primary", size = "md", className, href, children }: { tone?: ButtonTone; size?: "sm" | "md" | "lg"; className?: string; href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(buttonClass(tone, size), className)}>
      {children}
    </Link>
  );
}

/** Fey header tab as a link (e.g. "Holdings · Watchlist"). */
export function TabLinks({ items, active }: { items: { href: string; label: ReactNode; icon?: LucideIcon }[]; active: string }) {
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active === href ? "page" : undefined}
          className={cx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors", active === href ? "bg-panel-strong text-fg" : "text-muted hover:text-fg")}
        >
          {Icon && <Icon size={14} />}
          {label}
        </Link>
      ))}
    </nav>
  );
}

// ─────────────────────────── Identity ───────────────────────────

const ICON = {
  blue: "bg-blue text-white",
  pink: "bg-pink text-white",
  green: "bg-green text-white",
  orange: "bg-orange text-white",
  red: "bg-red text-white",
  grey: "bg-panel-strong text-muted",
} as const;
export type IconTone = keyof typeof ICON;

/** Family's coloured icon circle. */
export function IconCircle({ icon: Icon, tone, size = 28 }: { icon: LucideIcon; tone: IconTone; size?: number }) {
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full", ICON[tone])} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.4} />
    </span>
  );
}

export function TeamBadge({ src, short, size = 20, className }: { src: string | null; short: string; size?: number; className?: string }) {
  if (!src) {
    return (
      <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full bg-panel-strong text-[9px] font-semibold", className)} style={{ width: size, height: size }}>
        {short.slice(0, 1)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- SVG badges don't need optimisation
  return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className={cx("shrink-0 object-contain", className)} loading="lazy" />;
}

export function PlayerAvatar({ photo, badge, short, name, size = 32 }: { photo: string | null; badge: string | null; short: string; name: string; size?: number }) {
  const badgeSize = Math.max(12, Math.round(size * 0.4));
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="block size-full overflow-hidden rounded-full bg-panel-strong">
        <Headshot src={photo} name={name} size={size} />
      </span>
      <span className="absolute -right-1 -bottom-0.5 grid place-items-center rounded-full bg-bg p-[1.5px]" style={{ width: badgeSize + 3, height: badgeSize + 3 }}>
        <TeamBadge src={badge} short={short} size={badgeSize} />
      </span>
    </span>
  );
}

// ─────────────────────────── Status ───────────────────────────

export function Pill({ tone = "neutral", children, className, title }: { tone?: DeltaTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap", DELTA[tone], className)}>
      {children}
    </span>
  );
}

const CONFIDENCE: Record<Confidence, DeltaTone> = { High: "green", Medium: "orange", Low: "red" };
export function ConfidenceDelta({ level }: { level: Confidence }) {
  return <Delta tone={CONFIDENCE[level]}>{level}</Delta>;
}

export function StatusPill({ status, chance }: { status: Status; chance: number }) {
  if (status === "available") return null;
  if (status === "doubtful") return <Delta tone="orange">{chance}%</Delta>;
  return <Delta tone="red">{status === "injured" ? "Out" : "Banned"}</Delta>;
}

export const FDR_BG = { 1: "bg-fdr-1", 2: "bg-fdr-2", 3: "bg-fdr-3", 4: "bg-fdr-4", 5: "bg-fdr-5" } as const;
const FDR_CHIP = { 1: "bg-fdr-1 text-white", 2: "bg-fdr-2 text-fg", 3: "bg-fdr-3 text-fg", 4: "bg-fdr-4 text-fg", 5: "bg-fdr-5 text-white" } as const;

export function FixtureChip({ opponent, home, difficulty, className }: { opponent: string | null; home: boolean; difficulty: 1 | 2 | 3 | 4 | 5 | null; className?: string }) {
  if (!opponent || !difficulty) return <span className={cx("inline-flex rounded bg-panel-strong px-1.5 py-px text-[12px] font-medium text-muted", className)}>Blank</span>;
  return (
    <span className={cx("inline-flex justify-center rounded px-1.5 py-px text-[12px] font-medium whitespace-nowrap tnum", FDR_CHIP[difficulty], className)} title={`Difficulty ${difficulty} of 5`}>
      {opponent}
      {opponent.includes("+") ? "" : home ? " (H)" : " (A)"}
    </span>
  );
}

// ─────────────────────────── Data marks ───────────────────────────

export function RangeBar({ floor, mean, ceiling, max, label }: { floor: number; mean: number; ceiling: number; max: number; label?: string }) {
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className="w-full" role="img" aria-label={label ?? `Range ${floor} to ${ceiling}, expected ${mean.toFixed(1)}`}>
      <div className="relative h-1.5 rounded-full bg-panel-strong">
        <div className="absolute inset-y-0 rounded-full bg-blue/35" style={{ left: at(floor), width: `calc(${at(ceiling)} - ${at(floor)})` }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue ring-4 ring-blue/20" style={{ left: at(mean) }} />
      </div>
    </div>
  );
}

export function PercentileBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-panel-strong" role="img" aria-label={`${value}th percentile`}>
      <div className={cx("h-full rounded-full", value >= 70 ? "bg-green" : value >= 35 ? "bg-faint" : "bg-red")} style={{ width: `${Math.max(3, value)}%` }} />
    </div>
  );
}

export function ProbabilityCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 rounded-full bg-panel-strong" aria-hidden>
        <div className="h-full rounded-full bg-blue" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-[13px] tnum">{pct(value)}</span>
    </div>
  );
}

export function SplitBar({ label, left, right, format = (n: number) => n.toFixed(2), higherIsBetter = true }: { label: string; left: number; right: number; format?: (n: number) => string; higherIsBetter?: boolean }) {
  const total = left + right || 1;
  const leftWins = higherIsBetter ? left > right : left < right;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px] tnum">
        <span className={cx(leftWins ? "font-semibold" : "text-muted")}>{format(left)}</span>
        <span className="text-[12px] text-muted">{label}</span>
        <span className={cx(!leftWins && left !== right ? "font-semibold" : "text-muted")}>{format(right)}</span>
      </div>
      <div className="flex h-1.5 gap-1" aria-hidden>
        <div className="flex flex-1 justify-end rounded-full bg-panel-strong">
          <div className="h-full rounded-full bg-blue" style={{ width: `${(left / total) * 100}%` }} />
        </div>
        <div className="flex-1 rounded-full bg-panel-strong">
          <div className="h-full rounded-full bg-pink" style={{ width: `${(right / total) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-line py-3 text-[14px] not-last:border-b">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium tnum">{value}</span>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>}
    </div>
  );
}
