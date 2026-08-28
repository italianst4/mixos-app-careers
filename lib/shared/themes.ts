/**
 * The vocabulary the bullet selector ranks against.
 *
 * Structure, not data: unlike everything else in the career library this is the
 * same list for every user, so it stays a constant rather than becoming a table.
 * Adding one needs a deploy, not a migration — which is the right trade for a
 * list whose whole value is being short and stable.
 *
 * Keep it short. A large or drifting theme set makes ranking noisy, because the
 * model has to guess which near-synonym you meant. The source arrived at these
 * eleven after a thinning pass over 39 entries found the distribution too flat
 * to rank anything: `platform-engineering` had become a residue bucket holding
 * 16 of them, so `product-engineering` was split out, and `turnaround` was
 * retired for `technical-presales`.
 */
export const THEMES = [
  "forward-deployed",
  "solutions-architecture",
  "customer-success",
  "ai-ml",
  "technical-presales",
  "platform-engineering",
  "product-engineering",
  "scale-performance",
  "leadership",
  "process-automation",
  "data-integration",
] as const;

export type Theme = (typeof THEMES)[number];

const THEME_SET: ReadonlySet<string> = new Set(THEMES);

export function isTheme(value: string): value is Theme {
  return THEME_SET.has(value);
}

/** Drop anything that is not a known theme. Used when reading a stored array. */
export function coerceThemes(value: unknown): Theme[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Theme => typeof entry === "string" && isTheme(entry));
}

/** "forward-deployed" → "Forward deployed". For a checkbox label. */
export function themeLabel(theme: Theme): string {
  const words = theme.split("-");
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
