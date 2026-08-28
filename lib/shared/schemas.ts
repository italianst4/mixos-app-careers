import { z } from "zod";

import { ACCOMPLISHMENT_SCOPES, APPLICATION_STATUSES } from "./statuses";
import { THEMES } from "./themes";

/**
 * The wire shapes, in one place.
 *
 * Routes declare these as their `output`, and pages and widgets take their prop
 * types from the same schemas — so a field renamed here is a compile error at
 * both ends rather than a runtime `undefined` at one of them. Zod is safe on the
 * client, which is what lets this module sit in `lib/shared` instead of being
 * duplicated on either side of the gateway.
 */

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/**
 * Employment dates are months, not days — nobody puts "March 14th" on a resume.
 * Postgres stores a `date` and PostgREST returns `YYYY-MM-DD`, so the wire
 * format is the month and the day is pinned to the first.
 */
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: "Expected a month as YYYY-MM.",
});

/** `2016-03-01` (or a full timestamp) → `2016-03`. */
export function toMonth(value: string): string {
  return value.slice(0, 7);
}

/** `2016-03` → `2016-03-01`, the day Postgres will store. */
export function fromMonth(value: string): string {
  return `${value}-01`;
}

/** `2016-03` → `Mar 2016`. `null` → `Present`. */
export function formatMonth(value: string | null): string {
  if (!value) return "Present";
  const [year, month] = value.split("-");
  const index = Number(month) - 1;
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[index] ?? month} ${year}`;
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const LinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

export const ProfileSchema = z.object({
  name: z.string(),
  headline: z.string(),
  headlineDescriptor: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string(),
  baseCity: z.string(),
  baseState: z.string().nullable(),
  baseCountry: z.string(),
  links: z.array(LinkSchema),
  compTarget: z.number().int().nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SummaryVariantSchema = z.object({
  key: z.string(),
  body: z.string(),
  /** `default` is the fallback every resume falls back to. It cannot be deleted. */
  required: z.boolean(),
});
export type SummaryVariant = z.infer<typeof SummaryVariantSchema>;

export const RoleSchema = z.object({
  id: z.string(),
  org: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  startMonth: MonthSchema,
  /** Null means present. */
  endMonth: MonthSchema.nullable(),
  context: z.string().nullable(),
});
export type Role = z.infer<typeof RoleSchema>;

export const CaseStudySchema = z.object({
  situation: z.string(),
  action: z.string(),
  result: z.string(),
});

export const AccomplishmentSchema = z.object({
  id: z.string(),
  roleId: z.string(),
  claim: z.string(),
  how: z.string().nullable(),
  metrics: z.array(z.string()),
  tech: z.array(z.string()),
  themes: z.array(z.enum(THEMES)),
  /** PRIVATE. Never rendered on a document; shown only in the library editor. */
  evidence: z.string(),
  scope: z.enum(ACCOMPLISHMENT_SCOPES),
  caseStudy: CaseStudySchema.nullable(),
});
export type Accomplishment = z.infer<typeof AccomplishmentSchema>;

export const SkillGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  items: z.array(z.string()),
  sortOrder: z.number().int(),
});
export type SkillGroup = z.infer<typeof SkillGroupSchema>;

export const EducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  credential: z.string(),
  yearLabel: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type Education = z.infer<typeof EducationSchema>;

/**
 * Something unfinished in the library, and what it costs you.
 *
 * `blocking` entries would print blank on a document. `warning` entries are
 * private or optional — an unwritten `evidence` note blocks nothing, because it
 * means you have not written down where the proof is, not that the claim is
 * false.
 *
 * The source scanned runtime values for `TODO`/`EXAMPLE` markers left by
 * scaffolded TypeScript. A database-native library has no scaffold, so the test
 * is simply whether the field is empty — same job, simpler question.
 */
export const LibraryIssueSchema = z.object({
  severity: z.enum(["blocking", "warning"]),
  field: z.string(),
  detail: z.string(),
});
export type LibraryIssue = z.infer<typeof LibraryIssueSchema>;

export const LibrarySchema = z.object({
  profile: ProfileSchema,
  summaryVariants: z.array(SummaryVariantSchema),
  roles: z.array(RoleSchema),
  accomplishments: z.array(AccomplishmentSchema),
  skillGroups: z.array(SkillGroupSchema),
  education: z.array(EducationSchema),
  issues: z.array(LibraryIssueSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const StatusSchema = z.enum(APPLICATION_STATUSES);

/** What a tracker row needs, and nothing more. `jd_raw` is deliberately absent. */
export const ApplicationSummarySchema = z.object({
  id: z.string(),
  company: z.string(),
  roleTitle: z.string(),
  status: StatusSchema,
  jobUrl: z.string().nullable(),
  location: z.string().nullable(),
  compMin: z.number().int().nullable(),
  compMax: z.number().int().nullable(),
  compCurrency: z.string().nullable(),
  compBasis: z.string().nullable(),
  compPosted: z.string().nullable(),
  compTarget: z.number().int().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  notes: z.string(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
});
export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>;

/** The summary plus the posting itself, for the detail view. */
export const ApplicationDetailSchema = ApplicationSummarySchema.extend({
  jdRaw: z.string(),
  coverLetterDraft: z.string(),
});
export type ApplicationDetail = z.infer<typeof ApplicationDetailSchema>;

// ---------------------------------------------------------------------------
// Mutation inputs
// ---------------------------------------------------------------------------

/**
 * A figure the user typed. Empty string clears it; a negative or absurd number
 * is refused rather than stored, because a wrong number that looks right is
 * worse than an empty column.
 */
export const OptionalMoneySchema = z
  .number()
  .int()
  .min(0)
  .max(100_000_000)
  .nullable()
  .optional();

/** Trimmed, and an empty string becomes null so "cleared" and "unset" agree. */
export const OptionalTextSchema = z
  .string()
  .max(4_000)
  .nullable()
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const trimmed = v?.trim();
    return trimmed ? trimmed : null;
  });

/**
 * Under a couple of hundred characters there is not enough of a posting to work
 * from — the same floor the source set on its create endpoint, kept because it
 * is what makes the stored `jd_raw` worth re-reading three weeks later.
 */
export const MIN_POSTING_CHARS = 200;

// ---------------------------------------------------------------------------
// Write shapes
//
// The input side of every mutation, declared here beside the read shapes so a
// route's `input` and the editor's form state come from one definition. A field
// added to a form without a home here is a compile error rather than a value
// the route silently discards.
// ---------------------------------------------------------------------------

export const ProfileInputSchema = z.object({
  name: z.string().max(200),
  headline: z.string().max(200),
  headlineDescriptor: z.string().max(300),
  email: z.string().max(320),
  phone: z.string().max(64).nullable(),
  location: z.string().max(200),
  baseCity: z.string().max(120),
  baseState: z.string().max(120).nullable(),
  baseCountry: z.string().max(120),
  links: z.array(LinkSchema).max(12),
  /**
   * Null clears it, and the tracker then stays silent about compensation
   * instead of judging every posting against a number you never gave it.
   */
  compTarget: z.number().int().min(1).max(100_000_000).nullable(),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

/**
 * Variant keys are matched against a posting by the selector, so they are
 * identifiers rather than prose. Free-form within that shape: they are your
 * vocabulary, not the platform's.
 */
export const SummaryVariantInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, {
      message: "A variant key is lowercase letters, digits and hyphens.",
    }),
  body: z.string().max(4_000),
});
export type SummaryVariantInput = z.infer<typeof SummaryVariantInputSchema>;

export const RoleInputSchema = z.object({
  org: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  location: z.string().max(200).nullable(),
  startMonth: MonthSchema,
  /** Null means present. */
  endMonth: MonthSchema.nullable(),
  context: z.string().max(1_000).nullable(),
});
export type RoleInput = z.infer<typeof RoleInputSchema>;

export const AccomplishmentInputSchema = z.object({
  roleId: z.string().uuid(),
  claim: z.string().min(1).max(600),
  /**
   * The mechanism. Not printed directly, but part of the source text a rephrase
   * is checked against, so a claim can be reworded using detail that lives only
   * here.
   */
  how: z.string().max(2_000).nullable(),
  /**
   * Verbatim, verifiable figures — and the set a rephrase is allowed to draw
   * from. An entry with no metrics is an entry a rephrase has no numbers for.
   */
  metrics: z.array(z.string().min(1).max(200)).max(24),
  tech: z.array(z.string().min(1).max(80)).max(40),
  themes: z.array(z.enum(THEMES)).max(THEMES.length),
  /** PRIVATE. Never rendered. Where you could prove this. */
  evidence: z.string().max(2_000),
  scope: z.enum(ACCOMPLISHMENT_SCOPES),
  caseStudy: CaseStudySchema.nullable(),
});
export type AccomplishmentInput = z.infer<typeof AccomplishmentInputSchema>;

export const SkillGroupInputSchema = z.object({
  label: z.string().min(1).max(120),
  items: z.array(z.string().min(1).max(120)).max(60),
});
export type SkillGroupInput = z.infer<typeof SkillGroupInputSchema>;

export const EducationInputSchema = z.object({
  institution: z.string().min(1).max(200),
  credential: z.string().min(1).max(200),
  /** Free text: "2004", "expected 2027". Not a number, and never sorted on. */
  yearLabel: z.string().max(60).nullable(),
});
export type EducationInput = z.infer<typeof EducationInputSchema>;

/**
 * Creating an application.
 *
 * `company` and `roleTitle` are typed rather than extracted: the model that
 * read them out of the posting arrives in phase 3, and defaulting them to
 * "Unknown company" — as the source did when extraction failed — produces a
 * tracker you cannot scan.
 */
export const CreateApplicationSchema = z.object({
  jobPosting: z.string().min(MIN_POSTING_CHARS).max(200_000),
  company: z.string().min(1).max(200),
  roleTitle: z.string().min(1).max(200),
  /** Stored for linking back to the listing later. Nothing fetches it. */
  jobUrl: z.string().max(2_000).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  /** Verbatim, as printed. The numeric range is derived from it when blank. */
  compPosted: z.string().max(1_000).nullable().optional(),
});
export type CreateApplication = z.infer<typeof CreateApplicationSchema>;

/**
 * Editing one. Every field is optional and an absent key means "leave it
 * alone", which is what lets one form save a status change and a note edit in
 * the same request without either clobbering the other.
 */
export const UpdateApplicationSchema = z.object({
  id: z.string().uuid(),
  company: z.string().min(1).max(200).optional(),
  roleTitle: z.string().min(1).max(200).optional(),
  status: StatusSchema.optional(),
  jobUrl: z.string().max(2_000).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  compPosted: z.string().max(1_000).nullable().optional(),
  compMin: OptionalMoneySchema,
  compMax: OptionalMoneySchema,
  compCurrency: z
    .string()
    .length(3)
    .regex(/^[A-Za-z]{3}$/, { message: "A currency is a three-letter ISO 4217 code." })
    .nullable()
    .optional(),
  compTarget: OptionalMoneySchema,
  notes: z.string().max(20_000).optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactEmail: z.string().max(320).nullable().optional(),
  /** ISO date. Null clears it back to "not applied". */
  appliedAt: z.string().datetime().nullable().optional(),
});
export type UpdateApplication = z.infer<typeof UpdateApplicationSchema>;
