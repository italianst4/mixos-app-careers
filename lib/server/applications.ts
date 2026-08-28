import { AppError } from "@/lib/apps/route";
import type { ScopedClient } from "@/lib/apps/scoped-db";

import { looksMultiBand, parseCompRange } from "../shared/comp";
import type { ApplicationDetail, ApplicationSummary } from "../shared/schemas";
import type { ApplicationStatus } from "../shared/statuses";
import { intOrNull, iso, isoOrNull, unwrap, unwrapMaybe } from "./db";

/**
 * Reading and shaping application rows.
 *
 * Everything here is scoped by `user_id`. There is no ambient "current user" —
 * it is a parameter on every function, so a handler cannot forget to pass one
 * and read someone else's tracker.
 */

interface ApplicationRow {
  id: string;
  company: string;
  role_title: string;
  status: ApplicationStatus;
  job_url: string | null;
  jd_raw: string;
  cover_letter_draft: string | null;
  location: string | null;
  comp_min: unknown;
  comp_max: unknown;
  comp_currency: string | null;
  comp_basis: string | null;
  comp_posted: string | null;
  comp_target: unknown;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  applied_at: string | null;
  created_at: string;
  last_activity_at: string;
}

export function mapSummary(row: ApplicationRow): ApplicationSummary {
  return {
    id: row.id,
    company: row.company,
    roleTitle: row.role_title,
    status: row.status,
    jobUrl: row.job_url,
    location: row.location,
    compMin: intOrNull(row.comp_min),
    compMax: intOrNull(row.comp_max),
    compCurrency: row.comp_currency,
    compBasis: row.comp_basis,
    compPosted: row.comp_posted,
    compTarget: intOrNull(row.comp_target),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    notes: row.notes ?? "",
    appliedAt: isoOrNull(row.applied_at),
    createdAt: iso(row.created_at),
    lastActivityAt: iso(row.last_activity_at),
  };
}

export function mapDetail(row: ApplicationRow): ApplicationDetail {
  return {
    ...mapSummary(row),
    jdRaw: row.jd_raw,
    coverLetterDraft: row.cover_letter_draft ?? "",
  };
}

export async function loadApplications(
  db: ScopedClient,
  userId: string,
): Promise<ApplicationSummary[]> {
  const rows = unwrap(
    await db
      .table("applications")
      .select("*")
      .eq("user_id", userId)
      // The thing you touched last sits on top, which is what makes a search
      // that has gone quiet for three weeks visible as one.
      .order("last_activity_at", { ascending: false }),
    "loadApplications",
  ) as ApplicationRow[];

  return rows.map(mapSummary);
}

/**
 * One application, or a 404.
 *
 * Scoped to the user as well as the id, and a row belonging to someone else is
 * reported as NOT FOUND rather than FORBIDDEN — otherwise the two responses
 * differ, and the difference tells a prober which ids exist.
 */
export async function loadApplication(
  db: ScopedClient,
  userId: string,
  id: string,
): Promise<ApplicationDetail> {
  const row = unwrapMaybe(
    await db
      .table("applications")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle(),
    "loadApplication",
  ) as ApplicationRow | null;

  if (!row) throw AppError.notFound("No such application.");
  return mapDetail(row);
}

/**
 * What a posted range says, read as numbers.
 *
 * The verbatim string is what you paste out of a posting; these are the columns
 * that can be sorted and compared. Deliberately conservative — see
 * `parseCompRange`, which declines rather than guessing.
 *
 * `basis` records how the figures were arrived at, because a figure with no
 * provenance is a figure you cannot act on. When the parser declines on a
 * multi-band posting it says so, since an empty range invites a shrug while
 * naming the cause points at the fix.
 */
export interface DerivedComp {
  comp_min: number | null;
  comp_max: number | null;
  comp_currency: string | null;
  comp_basis: string | null;
}

export function deriveCompFromPosted(compPosted: string | null): DerivedComp {
  const parsed = parseCompRange(compPosted);

  if (!parsed || (parsed.min === null && parsed.max === null)) {
    return {
      comp_min: null,
      comp_max: null,
      comp_currency: null,
      comp_basis: looksMultiBand(compPosted)
        ? "This posting lists a different range per location, and none could be read " +
          "automatically. Type the band that applies to where you work from."
        : null,
    };
  }

  return {
    comp_min: parsed.min,
    comp_max: parsed.max,
    comp_currency: parsed.currency,
    comp_basis: "Read from the posted range you pasted.",
  };
}

/**
 * Fill the numeric range from the verbatim string, and nothing else.
 *
 * The rule that makes this safe to run on every save: it only ever fills a
 * blank. Both ends move together or neither does — filling `comp_min` while
 * leaving a stale `comp_max` from a different paste would produce a range that
 * never existed.
 *
 * Once you have typed a figure by hand, this cannot overwrite it. That is the
 * right way round: your edit is evidence, the parser's is a guess.
 */
export function fillCompFromPosted(
  current: { compMin: number | null; compMax: number | null },
  compPosted: string | null,
): Partial<DerivedComp> {
  if (current.compMin !== null || current.compMax !== null) return {};
  const derived = deriveCompFromPosted(compPosted);
  if (derived.comp_min === null && derived.comp_max === null) {
    // Still worth recording *why* there is no range, when the cause is knowable.
    return derived.comp_basis ? { comp_basis: derived.comp_basis } : {};
  }
  return derived;
}

/** Every write bumps activity; the tracker's ordering depends on it. */
export function touch(): { last_activity_at: string } {
  return { last_activity_at: new Date().toISOString() };
}
