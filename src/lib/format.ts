export const pts = (n: number) => n.toFixed(1);
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const price = (n: number) => `£${n.toFixed(1)}m`;
export const own = (n: number) => `${n < 1 ? n.toFixed(1) : n.toFixed(n < 10 ? 1 : 0)}%`;
export const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
