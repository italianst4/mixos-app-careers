/**
 * Compensation as numbers.
 *
 * A posted range is prose — "$195,000 to $240,000, plus equity", "£95k–£120k",
 * "$95/hour" — and prose cannot be sorted, filtered, or compared against your
 * own bar. So the range is stored as two integers, and everything that makes
 * that safe lives here.
 *
 * Two rules the rest of the app depends on:
 *
 * ANNUALISED. Every figure is converted to a yearly amount before storage, so
 * an hourly contract rate and a salary are the same kind of number. Without it
 * "$95" and "$195,000" sit in the same column meaning wildly different things,
 * and the first sort you run is nonsense.
 *
 * CURRENCY IS CARRIED. A number without a unit is worse than no number. 95000
 * is a good offer in GBP and a mediocre one in USD, and nothing downstream can
 * tell them apart on its own.
 *
 * The verbatim string is kept alongside, because "plus equity and a performance
 * bonus" does not fit in an integer and is often the part that matters.
 *
 * This module is pure and client-safe on purpose: the tracker renders a verdict
 * and the route validates the figures behind it, and the two must not be able
 * to disagree about what a number means.
 */

export type CompPeriod = "year" | "month" | "week" | "day" | "hour";

export const COMP_PERIODS: readonly CompPeriod[] = [
  "year",
  "month",
  "week",
  "day",
  "hour",
];

/**
 * Hours and days per year, for converting a rate into a salary.
 *
 * 2080 is 40 hours across 52 weeks — the US convention, and what a posting
 * quoting an hourly rate means by it. 260 is five days a week across 52. Both
 * ignore holidays on purpose: a contract rate is quoted as though every working
 * day is billed, and adjusting for leave would produce a number that matches
 * nothing anyone else calculates.
 */
const PERIODS_PER_YEAR: Record<CompPeriod, number> = {
  year: 1,
  month: 12,
  week: 52,
  day: 260,
  hour: 2080,
};

export function annualize(amount: number, period: CompPeriod): number {
  return Math.round(amount * PERIODS_PER_YEAR[period]);
}

/**
 * A figure that is almost certainly not an annual salary.
 *
 * Guards the case where a period is misread: a posting saying "$95/hour" that
 * arrives marked `year` would store 95, and a range of 95 to 120 looks like a
 * filled-in field rather than a broken one. Anything under this is treated as
 * unparseable rather than stored, because a wrong number that looks right is
 * worse than an empty column.
 */
export const MIN_PLAUSIBLE_ANNUAL = 10_000;

/** Above this, someone has pasted a phone number or a share count. */
export const MAX_PLAUSIBLE_ANNUAL = 10_000_000;

export function isPlausibleAnnual(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_ANNUAL &&
    value <= MAX_PLAUSIBLE_ANNUAL
  );
}

export interface CompRange {
  min: number | null;
  max: number | null;
  currency: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "£": "GBP",
  "€": "EUR",
  "¥": "JPY",
  "₹": "INR",
};

/** The currencies the range editor offers. Anything else can be typed verbatim. */
export const COMMON_CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "CAD",
  "AUD",
  "JPY",
  "INR",
  "CHF",
  "SEK",
] as const;

/**
 * Parse a printed range into numbers.
 *
 * The fallback for when a posting is read but no structured figures exist —
 * which in phase 1 is every application, since the extractor arrives with the
 * model in phase 3. Runs on the derivation path and costs nothing.
 *
 * Deliberately conservative. It recognises the shapes postings actually use and
 * returns nulls for anything else, because the alternative — a clever parser
 * that always finds *a* number — turns "401k match" and "SOC 2" into salaries.
 */
export function parseCompRange(raw: string | null | undefined): CompRange | null {
  if (!raw?.trim()) return null;

  // US benefits boilerplate contains numbers shaped exactly like abbreviated
  // salaries. "401k match" reads as 401 with a thousands suffix, which is
  // $401,000 — a plausible-looking figure, so no amount of range checking
  // catches it. The plan identifiers are a small closed set, so they are
  // removed before anything else looks at the string.
  const text = raw.replace(/\b(?:401\s*\(?k\)?|403\s*\(?b\)?|457\s*\(?b\)?|529)\b/gi, " ");

  const currency = detectCurrency(text);
  const period = detectPeriod(text);

  // Numbers with a magnitude suffix or thousands separators. A bare "40" is
  // ignored unless it carries "k" or a currency marker, so "401k match" and
  // "25% travel" cannot become compensation.
  const found: number[] = [];
  const pattern = /([$£€¥₹])?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?\b/gi;

  for (const match of text.matchAll(pattern)) {
    const [, symbol, digits, suffix] = match;
    const value = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;

    const magnitude =
      suffix?.toLowerCase() === "k"
        ? 1_000
        : suffix?.toLowerCase() === "m"
          ? 1_000_000
          : 1;
    const scaled = value * magnitude;

    // A bare small number with no symbol, no suffix and no separator is not a
    // salary — it is a year count, a percentage, or a team size.
    const qualified = Boolean(symbol) || Boolean(suffix) || digits.includes(",");
    if (!qualified) continue;

    found.push(annualize(scaled, period));
  }

  const plausible = [...new Set(found.filter(isPlausibleAnnual))];
  if (plausible.length === 0) return null;

  // More than two figures is not one range. It is a geo-banded posting listing
  // a band per state, or a range with a bonus figure beside it, and taking the
  // outer bounds produces a span that is wrong everywhere — a real posting read
  // this way came out as $195k-$247k when the band that actually applied was
  // $195k-$206k. Disambiguating needs to know where the candidate lives, which
  // is a judgement this parser has no access to, so it declines instead.
  if (plausible.length > 2) return null;

  const min = Math.min(...plausible);
  const max = Math.max(...plausible);

  // A single figure is a point, not a range. Both ends carry it so that a
  // filter on "pays at least X" behaves, rather than skipping the row.
  return { min, max, currency };
}

/**
 * Does this text list several ranges rather than one?
 *
 * Used to explain a refusal. An empty range invites a shrug; "this posting
 * lists a different range per location" names the cause and points at the fix,
 * which is to type the band that applies to you — or, from phase 3, to let the
 * extractor pick it, since it knows where you live and the parser does not.
 */
export function looksMultiBand(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const figures = [...text.matchAll(/[$£€¥₹]\s*\d{1,3}(?:,\d{3})+|\d+\s*k\b/gi)];
  return new Set(figures.map((m) => m[0])).size > 2;
}

function detectCurrency(text: string): string {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return code;
  }
  const explicit = /\b(USD|GBP|EUR|CAD|AUD|JPY|INR|CHF|SEK)\b/i.exec(text);
  return explicit ? explicit[1].toUpperCase() : "USD";
}

function detectPeriod(text: string): CompPeriod {
  const lower = text.toLowerCase();
  if (/\b(per hour|\/\s*hour|hourly|an hour|\/hr|per hr)\b/.test(lower)) return "hour";
  if (/\b(per day|\/\s*day|daily|day rate)\b/.test(lower)) return "day";
  if (/\b(per week|\/\s*week|weekly)\b/.test(lower)) return "week";
  if (/\b(per month|\/\s*month|monthly|a month)\b/.test(lower)) return "month";
  return "year";
}

/**
 * A range, written the way you would say it.
 *
 * Thousands are abbreviated because a tracker row is scanned rather than read,
 * and "$195k – $240k" is legible at a glance where the full figures are a wall
 * of zeros. Millions keep one decimal, since the difference between 1.2m and
 * 1.8m is the whole story.
 */
export function formatCompRange(
  min: number | null,
  max: number | null,
  currency = "USD",
): string | null {
  if (min === null && max === null) return null;

  const symbol = Object.entries(CURRENCY_SYMBOLS).find(([, code]) => code === currency)?.[0];
  const prefix = symbol ?? `${currency} `;

  const short = (value: number) =>
    value >= 1_000_000
      ? `${prefix}${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
      : `${prefix}${Math.round(value / 1_000)}k`;

  if (min !== null && max !== null) {
    return min === max ? short(min) : `${short(min)} – ${short(max)}`;
  }
  return min !== null ? `${short(min)}+` : `up to ${short(max as number)}`;
}

/** Does a posted range clear a number you would accept? */
export function clearsTarget(max: number | null, target: number | null): boolean | null {
  if (max === null || target === null) return null;
  return max >= target;
}

/**
 * How a posted range measures against what you would accept.
 *
 * Returns the gap, not just a verdict, because the gap is what you act on. A
 * posting $8k under your number is a conversation; one $60k under is a decline,
 * and a boolean cannot tell them apart.
 *
 * Compares the TOP of the posted range against the target. A range is what a
 * company is willing to pay across a level, and the question is whether the
 * role can reach your number at all — not whether its floor already does.
 */
export interface CompVerdict {
  /** null when either side is unknown. Not false: they lead to different decisions. */
  clears: boolean | null;
  /** Signed distance from the target to the top of the range. */
  gap: number | null;
  label: string | null;
}

export function compVerdict(
  max: number | null,
  target: number | null,
  currency = "USD",
): CompVerdict {
  const clears = clearsTarget(max, target);
  if (clears === null || max === null || target === null) {
    return { clears: null, gap: null, label: null };
  }

  const gap = max - target;
  if (gap === 0) return { clears, gap, label: "meets your target exactly" };

  const magnitude = (formatCompRange(Math.abs(gap), null, currency) ?? "").replace("+", "");
  return {
    clears,
    gap,
    label: gap > 0 ? `${magnitude} above your target` : `${magnitude} short of your target`,
  };
}

/**
 * Which target applies to a given application.
 *
 * The per-application number wins when set, because a role can be worth taking
 * for less and an exceptional one can be worth holding out on. Otherwise your
 * usual number applies, which is what makes the comparison show up without
 * being retyped on every row.
 */
export function effectiveTarget(
  applicationTarget: number | null,
  profileTarget: number | null,
): number | null {
  return applicationTarget ?? profileTarget;
}
