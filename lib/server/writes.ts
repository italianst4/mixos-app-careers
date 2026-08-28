import { AppError } from "@/lib/apps/route";
import type { ScopedClient } from "@/lib/apps/scoped-db";

import { coerceThemes } from "../shared/themes";
import {
  fromMonth,
  toMonth,
  type Accomplishment,
  type AccomplishmentInput,
  type Education,
  type EducationInput,
  type Role,
  type RoleInput,
  type SkillGroup,
  type SkillGroupInput,
} from "../shared/schemas";
import { intOrNull, stringArray, unwrapMaybe } from "./db";

/**
 * Turning validated input into columns, and rows back into wire shapes.
 *
 * These live here rather than in the route files because a route file is a
 * declaration: everything above its `handler` is read by the build, the
 * gateway, the proxy and the generated client, and a route that also serves as
 * a module other routes import from makes that surface harder to read than it
 * needs to be.
 */

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * The role must be one of yours.
 *
 * The foreign key proves the row exists; it says nothing about whose it is.
 * Without this check an id lifted from someone else's history would be accepted
 * and quietly attach your claim to their employer.
 */
export async function assertOwnsRole(
  db: ScopedClient,
  userId: string,
  roleId: string,
): Promise<void> {
  const row = unwrapMaybe(
    await db
      .table("roles")
      .select("id")
      .eq("id", roleId)
      .eq("user_id", userId)
      .maybeSingle(),
    "assertOwnsRole",
  );
  if (!row) throw AppError.invalidInput("That role is not in your employment history.");
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RoleRow {
  id: string;
  org: string;
  title: string;
  location: string | null;
  start_month: string;
  end_month: string | null;
  context: string | null;
}

export function roleColumns(input: RoleInput) {
  return {
    org: input.org.trim(),
    title: input.title.trim(),
    location: input.location?.trim() || null,
    start_month: fromMonth(input.startMonth),
    // Null means present. The source used the literal string 'present'; a null
    // says the same thing without a value the ORDER BY has to special-case.
    end_month: input.endMonth ? fromMonth(input.endMonth) : null,
    context: input.context?.trim() || null,
  };
}

export function mapRole(row: RoleRow): Role {
  return {
    id: row.id,
    org: row.org,
    title: row.title,
    location: row.location,
    startMonth: toMonth(row.start_month),
    endMonth: row.end_month ? toMonth(row.end_month) : null,
    context: row.context,
  };
}

// ---------------------------------------------------------------------------
// Accomplishments
// ---------------------------------------------------------------------------

export interface AccomplishmentRow {
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
}

export function accomplishmentColumns(input: AccomplishmentInput) {
  return {
    role_id: input.roleId,
    claim: input.claim.trim(),
    how: input.how?.trim() || null,
    metrics: input.metrics.map((m) => m.trim()).filter(Boolean),
    tech: input.tech.map((t) => t.trim()).filter(Boolean),
    themes: input.themes,
    evidence: input.evidence.trim(),
    scope: input.scope,
    case_study: input.caseStudy,
  };
}

export function mapAccomplishment(row: AccomplishmentRow): Accomplishment {
  const cs = row.case_study as Record<string, unknown> | null;
  const complete =
    cs != null &&
    typeof cs.situation === "string" &&
    typeof cs.action === "string" &&
    typeof cs.result === "string";

  return {
    id: row.id,
    roleId: row.role_id,
    claim: row.claim,
    how: row.how,
    metrics: stringArray(row.metrics),
    tech: stringArray(row.tech),
    themes: coerceThemes(row.themes),
    evidence: row.evidence ?? "",
    scope: row.scope,
    caseStudy: complete
      ? {
          situation: cs.situation as string,
          action: cs.action as string,
          result: cs.result as string,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Skills and education
//
// Both are whole-list replaces. Order is part of the value on a resume — skills
// are read top-down and the first group is the one that gets read — so the
// array index IS the sort order, and a per-row PATCH could not express a
// reorder without the caller sequencing several writes itself.
// ---------------------------------------------------------------------------

export interface SkillGroupRow {
  id: string;
  label: string;
  items: unknown;
  sort_order: unknown;
}

export function skillGroupColumns(input: SkillGroupInput, index: number, userId: string) {
  return {
    user_id: userId,
    label: input.label.trim(),
    items: input.items.map((i) => i.trim()).filter(Boolean),
    sort_order: index,
  };
}

export function mapSkillGroup(row: SkillGroupRow, index: number): SkillGroup {
  return {
    id: row.id,
    label: row.label,
    items: stringArray(row.items),
    sortOrder: intOrNull(row.sort_order) ?? index,
  };
}

export interface EducationRow {
  id: string;
  institution: string;
  credential: string;
  year_label: string | null;
  sort_order: unknown;
}

export function educationColumns(input: EducationInput, index: number, userId: string) {
  return {
    user_id: userId,
    institution: input.institution.trim(),
    credential: input.credential.trim(),
    year_label: input.yearLabel?.trim() || null,
    sort_order: index,
  };
}

export function mapEducation(row: EducationRow, index: number): Education {
  return {
    id: row.id,
    institution: row.institution,
    credential: row.credential,
    yearLabel: row.year_label,
    sortOrder: intOrNull(row.sort_order) ?? index,
  };
}
