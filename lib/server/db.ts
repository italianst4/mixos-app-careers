import { AppError } from "@/lib/apps/route";
import type { ScopedClient } from "@/lib/apps/scoped-db";

/**
 * The two things every handler in this app does before it touches a table.
 *
 * Kept here rather than repeated per route so that "the database is missing"
 * and "the query failed" each have exactly one spelling, and neither can be
 * silently skipped.
 */

/** The shape a route handler's context presents to this tier. */
export interface DbBearer {
  db: ScopedClient | null;
}

export function requireDb(context: DbBearer): ScopedClient {
  if (!context.db) {
    // Unreachable while app.json says `"database": true`, but a manifest edit
    // that flipped it would otherwise surface as a null dereference deep in a
    // mapper rather than as the configuration problem it is.
    throw AppError.unavailable("This app has no database configured.");
  }
  return context.db;
}

/**
 * Unwrap a PostgREST result, or fail loudly.
 *
 * The driver's message is deliberately NOT an `AppError`: an `AppError` message
 * reaches the caller verbatim, and a driver error names tables and columns.
 * Throwing a plain `Error` routes it through the pipeline's `safeErrorMessage`,
 * which is what keeps a constraint name out of the browser in production. The
 * `what` prefix is for the server log, which does get the detail.
 */
export function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error) {
    throw new Error(`[career] ${what}: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`[career] ${what}: query returned no data`);
  }
  return result.data;
}

/** Same, for a query whose zero-row case is legitimate. */
export function unwrapMaybe<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T | null {
  if (result.error) {
    throw new Error(`[career] ${what}: ${result.error.message}`);
  }
  return result.data;
}

/**
 * A row that came back from a write, where the caller needs the row it wrote.
 * PostgREST returns an array from `.select()` even for a single insert.
 */
export function firstRow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`[career] ${what}: write returned no row`);
  return row;
}

/**
 * A `jsonb` array of strings, as it comes back from the driver.
 *
 * Anything that is not a string is dropped rather than coerced: a number that
 * found its way into `metrics` would render as a figure on a resume, and the
 * fabrication guard would then have to defend a claim nobody wrote.
 */
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * `integer` columns arrive as numbers; `numeric`, `decimal` and `bigint` arrive
 * as STRINGS, which is the single most expensive surprise in this layer. This
 * app uses `integer` throughout for exactly that reason, and this guard is the
 * belt to that braces — `Number("")` is 0, so the empty case is checked first.
 */
export function intOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** A timestamptz column as an ISO string the wire can carry. */
export function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  return new Date(value as string).toISOString();
}

export function iso(value: unknown, fallback = new Date(0)): string {
  return isoOrNull(value) ?? fallback.toISOString();
}
