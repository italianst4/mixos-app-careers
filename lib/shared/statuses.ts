/**
 * The enumerations, with no server imports, so a client page can build a status
 * dropdown from the same list the route validates against.
 */

/**
 * Hand-set past `draft`. The pipeline only ever writes `draft`; everything
 * after it is you recording what happened, which is the point of a tracker.
 *
 * `ghosted` is a real outcome and deserves its own name — folding it into
 * `rejected` loses the difference between "they said no" and "nobody ever
 * replied", and only one of those is worth a follow-up.
 */
export const APPLICATION_STATUSES = [
  "draft",
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected",
  "ghosted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Statuses that mean this one is over. Groups the tracker and skips staleness. */
export const CLOSED_STATUSES: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  "rejected",
  "ghosted",
]);

export function isClosed(status: ApplicationStatus): boolean {
  return CLOSED_STATUSES.has(status);
}

export const DOCUMENT_KINDS = ["resume", "cover_letter"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const ACCOMPLISHMENT_SCOPES = ["resume", "page", "both"] as const;
export type AccomplishmentScope = (typeof ACCOMPLISHMENT_SCOPES)[number];

/**
 * How long an open application can sit untouched before it wants attention.
 * Two weeks is roughly when a polite follow-up stops being early and starts
 * being useful.
 */
export const STALE_DAYS = 14;

export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

export function isStale(
  lastActivityIso: string,
  status: ApplicationStatus,
  now = Date.now(),
): boolean {
  if (isClosed(status)) return false;
  return daysSince(lastActivityIso, now) >= STALE_DAYS;
}

/**
 * The badge tone for a status.
 *
 * Only two of the seven legitimately *grade*: an offer is good news and a
 * rejection is bad, so `success` and `danger` say something true. The rest only
 * *distinguish* one stage from another, and borrowing `danger` for "interview"
 * would tell the reader an interview is an error — so they take the categorical
 * ramp, assigned by position rather than by meaning.
 *
 * Typed as the literal union rather than importing `BadgeTone`, so this module
 * stays free of any component import and remains usable from a route.
 */
export type StatusTone =
  | "neutral"
  | "success"
  | "danger"
  | "cat-1"
  | "cat-2"
  | "cat-3";

const TONE_BY_STATUS: Record<ApplicationStatus, StatusTone> = {
  draft: "neutral",
  applied: "cat-1",
  screen: "cat-2",
  interview: "cat-3",
  offer: "success",
  rejected: "danger",
  // Not `danger`: nobody said no. A ghosted search is over the way an unread
  // letter is over, and the muted tone is the honest one.
  ghosted: "neutral",
};

export function statusTone(status: ApplicationStatus): StatusTone {
  return TONE_BY_STATUS[status];
}

/** Title case for display. The stored value stays lowercase. */
export function statusLabel(status: ApplicationStatus): string {
  return status[0].toUpperCase() + status.slice(1);
}
