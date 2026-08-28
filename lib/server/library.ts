import type { ScopedClient } from "@/lib/apps/scoped-db";

import { coerceThemes } from "../shared/themes";
import {
  toMonth,
  type Accomplishment,
  type Education,
  type Library,
  type LibraryIssue,
  type Profile,
  type Role,
  type SkillGroup,
  type SummaryVariant,
} from "../shared/schemas";
import { intOrNull, stringArray, unwrap, unwrapMaybe } from "./db";

/**
 * Reading a user's career library out of the scoped database.
 *
 * In the source this was TypeScript constants with a `library_overrides` table
 * layered over them at read time — a process-wide mutable singleton, hydrated
 * per request, whose documented failure mode was a route that forgot to hydrate
 * and silently served the file values. None of that exists here: the database
 * is the library, so there is nothing to hydrate and nothing to forget.
 */

export const DEFAULT_SUMMARY_KEY = "default";

/**
 * What a user who has never opened the editor sees.
 *
 * Empty strings rather than a null profile, so every consumer can render the
 * shape without a branch, and `issues` is what tells them the library is not
 * ready. A missing profile row and an unfilled one are the same problem to a
 * reader, and collapsing them here keeps that true everywhere downstream.
 */
export function emptyProfile(): Profile {
  return {
    name: "",
    headline: "",
    headlineDescriptor: "",
    email: "",
    phone: null,
    location: "",
    baseCity: "",
    baseState: null,
    baseCountry: "",
    links: [],
    compTarget: null,
  };
}

interface ProfileRow {
  name: string | null;
  headline: string | null;
  headline_descriptor: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  base_city: string | null;
  base_state: string | null;
  base_country: string | null;
  links: unknown;
  comp_target: unknown;
}

function mapProfile(row: ProfileRow | null): Profile {
  if (!row) return emptyProfile();
  return {
    name: row.name ?? "",
    headline: row.headline ?? "",
    headlineDescriptor: row.headline_descriptor ?? "",
    email: row.email ?? "",
    phone: row.phone,
    location: row.location ?? "",
    baseCity: row.base_city ?? "",
    baseState: row.base_state,
    baseCountry: row.base_country ?? "",
    links: mapLinks(row.links),
    compTarget: intOrNull(row.comp_target),
  };
}

/**
 * A malformed `links` value falls back to an empty list rather than propagating
 * into a rendered contact line. The column is the only non-scalar on the
 * profile, so it is the only one that can be shaped wrong.
 */
function mapLinks(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { label, url } = entry as { label?: unknown; url?: unknown };
    if (typeof label !== "string" || typeof url !== "string") return [];
    if (!label.trim() || !url.trim()) return [];
    return [{ label, url }];
  });
}

export async function loadProfile(db: ScopedClient, userId: string): Promise<Profile> {
  const row = unwrapMaybe(
    await db.table("profile").select("*").eq("user_id", userId).maybeSingle(),
    "loadProfile",
  );
  return mapProfile(row as ProfileRow | null);
}

export async function loadSummaryVariants(
  db: ScopedClient,
  userId: string,
): Promise<SummaryVariant[]> {
  const rows = unwrap(
    await db
      .table("summary_variants")
      .select("*")
      .eq("user_id", userId)
      .order("variant_key", { ascending: true }),
    "loadSummaryVariants",
  ) as { variant_key: string; body: string }[];

  return rows.map((row) => ({
    key: row.variant_key,
    body: row.body ?? "",
    required: row.variant_key === DEFAULT_SUMMARY_KEY,
  }));
}

export async function loadRoles(db: ScopedClient, userId: string): Promise<Role[]> {
  const rows = unwrap(
    await db
      .table("roles")
      .select("*")
      .eq("user_id", userId)
      // Newest first. In the source this was a hand-written comparator over
      // 'YYYY-MM' strings with 'present' as a sentinel; a real date column and
      // a null end make it an ORDER BY.
      .order("start_month", { ascending: false }),
    "loadRoles",
  ) as {
    id: string;
    org: string;
    title: string;
    location: string | null;
    start_month: string;
    end_month: string | null;
    context: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    org: row.org,
    title: row.title,
    location: row.location,
    startMonth: toMonth(row.start_month),
    endMonth: row.end_month ? toMonth(row.end_month) : null,
    context: row.context,
  }));
}

export async function loadAccomplishments(
  db: ScopedClient,
  userId: string,
): Promise<Accomplishment[]> {
  const rows = unwrap(
    await db
      .table("accomplishments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    "loadAccomplishments",
  ) as {
    id: string;
    role_id: string;
    claim: string;
    how: string | null;
    metrics: unknown;
    tech: unknown;
    themes: unknown;
    evidence: string | null;
    scope: Accomplishment["scope"];
    case_study: unknown;
  }[];

  return rows.map((row) => ({
    id: row.id,
    roleId: row.role_id,
    claim: row.claim,
    how: row.how,
    metrics: stringArray(row.metrics),
    tech: stringArray(row.tech),
    themes: coerceThemes(row.themes),
    evidence: row.evidence ?? "",
    scope: row.scope,
    caseStudy: mapCaseStudy(row.case_study),
  }));
}

function mapCaseStudy(value: unknown): Accomplishment["caseStudy"] {
  if (!value || typeof value !== "object") return null;
  const { situation, action, result } = value as Record<string, unknown>;
  if (typeof situation !== "string" || typeof action !== "string" || typeof result !== "string") {
    return null;
  }
  return { situation, action, result };
}

export async function loadSkillGroups(
  db: ScopedClient,
  userId: string,
): Promise<SkillGroup[]> {
  const rows = unwrap(
    await db
      .table("skill_groups")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    "loadSkillGroups",
  ) as { id: string; label: string; items: unknown; sort_order: unknown }[];

  return rows.map((row, index) => ({
    id: row.id,
    label: row.label,
    items: stringArray(row.items),
    sortOrder: intOrNull(row.sort_order) ?? index,
  }));
}

export async function loadEducation(db: ScopedClient, userId: string): Promise<Education[]> {
  const rows = unwrap(
    await db
      .table("education")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    "loadEducation",
  ) as {
    id: string;
    institution: string;
    credential: string;
    year_label: string | null;
    sort_order: unknown;
  }[];

  return rows.map((row, index) => ({
    id: row.id,
    institution: row.institution,
    credential: row.credential,
    yearLabel: row.year_label,
    sortOrder: intOrNull(row.sort_order) ?? index,
  }));
}

/**
 * The whole library, in six queries.
 *
 * Issued concurrently because none depends on another — the scoped client has
 * no joins, so this is what a join would have been, and serialising them would
 * make the editor pay six round trips for no reason.
 */
export async function loadLibrary(db: ScopedClient, userId: string): Promise<Library> {
  const [profile, summaryVariants, roles, accomplishments, skillGroups, education] =
    await Promise.all([
      loadProfile(db, userId),
      loadSummaryVariants(db, userId),
      loadRoles(db, userId),
      loadAccomplishments(db, userId),
      loadSkillGroups(db, userId),
      loadEducation(db, userId),
    ]);

  const library = {
    profile,
    summaryVariants,
    roles,
    accomplishments,
    skillGroups,
    education,
    issues: [] as LibraryIssue[],
  };

  return { ...library, issues: computeIssues(library) };
}

/**
 * What is unfinished, and what it costs you.
 *
 * "Something is unfinished" is useless without "and here is exactly what". Two
 * severities, and the split is the source's: `blocking` is anything that would
 * print blank on a document, and `warning` is private or optional.
 *
 * Unfilled `evidence` is deliberately only a warning. It is never rendered, so
 * it cannot embarrass you in front of an employer — its whole purpose is to
 * make you confront, while writing, whether you could prove the claim in a
 * room, and an unwritten note means you have not written it down, not that the
 * claim is false.
 */
export function computeIssues(library: Omit<Library, "issues">): LibraryIssue[] {
  const issues: LibraryIssue[] = [];
  const blank = (value: string | null | undefined) => !value?.trim();

  const { profile, summaryVariants, roles, accomplishments } = library;

  if (blank(profile.name)) {
    issues.push({
      severity: "blocking",
      field: "profile.name",
      detail: "Your name prints at the top of every document. Without it the resume has no heading.",
    });
  }
  if (blank(profile.email)) {
    issues.push({
      severity: "blocking",
      field: "profile.email",
      detail: "The contact line prints on both documents, and an employer has no way to reply without it.",
    });
  }
  if (blank(profile.location)) {
    issues.push({
      severity: "warning",
      field: "profile.location",
      detail: "The printed location line is blank. A metro area reads better on a resume than nothing at all.",
    });
  }
  if (blank(profile.headline)) {
    issues.push({
      severity: "warning",
      field: "profile.headline",
      detail: "The fallback role title is blank, so a document drafted with no posting has no title under your name.",
    });
  }
  if (blank(profile.baseCity) || blank(profile.baseCountry)) {
    issues.push({
      severity: "warning",
      field: "profile.base",
      detail:
        "Where you work from decides which geographic pay band applies to a posting. Unset, the headline range is taken at face value — usually the top band.",
    });
  }

  const defaultVariant = summaryVariants.find((v) => v.key === DEFAULT_SUMMARY_KEY);
  if (!defaultVariant || blank(defaultVariant.body)) {
    issues.push({
      severity: "blocking",
      field: "summaryVariants.default",
      detail:
        "Every resume falls back to the default summary. Without it the document prints nothing where the summary should be.",
    });
  }
  for (const variant of summaryVariants) {
    if (variant.key !== DEFAULT_SUMMARY_KEY && blank(variant.body)) {
      issues.push({
        severity: "warning",
        field: `summaryVariants.${variant.key}`,
        detail: "This variant is empty, so it will never be chosen over the default.",
      });
    }
  }

  if (roles.length === 0) {
    issues.push({
      severity: "blocking",
      field: "roles",
      detail:
        "Employment history is fixed — every role prints on every resume. With none, the document has no history section.",
    });
  }
  if (accomplishments.length === 0) {
    issues.push({
      severity: "blocking",
      field: "accomplishments",
      detail:
        "Accomplishments are the only source of fact a draft may draw on. With none, there is nothing to select from.",
    });
  }

  const roleIds = new Set(roles.map((r) => r.id));
  for (const entry of accomplishments) {
    if (!roleIds.has(entry.roleId)) {
      issues.push({
        severity: "blocking",
        field: `accomplishments.${entry.id}`,
        detail: `"${truncate(entry.claim)}" points at a role that no longer exists.`,
      });
    }
    if (blank(entry.evidence)) {
      issues.push({
        severity: "warning",
        field: `accomplishments.${entry.id}.evidence`,
        detail: `"${truncate(entry.claim)}" has no evidence note. It is private and blocks nothing, but it is where you record how you would prove this.`,
      });
    }
    if (entry.metrics.length === 0) {
      issues.push({
        severity: "warning",
        field: `accomplishments.${entry.id}.metrics`,
        detail: `"${truncate(entry.claim)}" has no figures. A rephrase can only use numbers that appear here, so it has none to work with.`,
      });
    }
    if (entry.themes.length === 0) {
      issues.push({
        severity: "warning",
        field: `accomplishments.${entry.id}.themes`,
        detail: `"${truncate(entry.claim)}" has no themes, so ranking has nothing to match it against a posting on.`,
      });
    }
  }

  return issues;
}

function truncate(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Does anything block a document from printing correctly? */
export function hasBlockingIssues(issues: LibraryIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocking");
}
