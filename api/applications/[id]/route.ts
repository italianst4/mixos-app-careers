import { z } from "zod";
import { defineRoute, AppError } from "@/lib/apps/route";

import {
  ApplicationDetailSchema,
  UpdateApplicationSchema,
} from "../../../lib/shared/schemas";
import { normalizeUrl } from "../../../lib/shared/url";
import { requireDb, unwrap } from "../../../lib/server/db";
import {
  fillCompFromPosted,
  loadApplication,
  mapDetail,
  touch,
} from "../../../lib/server/applications";

/**
 * One application: read it, edit it, delete it.
 *
 * Every verb is scoped to `user_id` as well as `id`, and a row that is not
 * yours is reported as NOT FOUND rather than FORBIDDEN — the two responses
 * would otherwise differ, and the difference tells a prober which ids exist.
 */
export const GET = defineRoute({
  summary: "One application, including the posting it was created from.",
  auth: ["session"],
  input: z.object({ id: z.string().uuid() }),
  output: ApplicationDetailSchema,
  handler: async (context, input) => {
    const db = requireDb(context);
    return loadApplication(db, context.user.id, input.id);
  },
});

/**
 * Save.
 *
 * An absent key means "leave it alone", so one form can change a status and
 * edit a note in the same request without either clobbering the other. Only
 * input this endpoint genuinely cannot act on is refused — an unparseable URL,
 * a comp range whose ends are the wrong way round. Those are typos in a form,
 * not judgements about your search.
 */
export const PATCH = defineRoute({
  summary: "Update an application's tracker fields.",
  auth: ["session"],
  input: UpdateApplicationSchema,
  output: ApplicationDetailSchema,
  handler: async (context, input) => {
    const db = requireDb(context);
    const userId = context.user.id;

    // Read first so the derived-comp rule has the current values to compare
    // against, and so a missing row fails before any write happens.
    const existing = await loadApplication(db, userId, input.id);

    const patch: Record<string, unknown> = {};

    for (const field of ["company", "roleTitle"] as const) {
      const value = input[field];
      if (value !== undefined) {
        patch[field === "roleTitle" ? "role_title" : field] = value.trim();
      }
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    if (input.status !== undefined) {
      patch.status = input.status;
      // Moving to `applied` without a date stamps one, because the date is the
      // part you want later and the part you will not remember to set.
      if (input.status === "applied" && !existing.appliedAt && input.appliedAt === undefined) {
        patch.applied_at = new Date().toISOString();
      }
    }
    if (input.appliedAt !== undefined) {
      patch.applied_at = input.appliedAt;
    }

    if (input.jobUrl !== undefined) {
      const url = normalizeUrl(input.jobUrl);
      if (input.jobUrl?.trim() && !url) {
        throw AppError.invalidInput("That job URL is not a valid http(s) address.");
      }
      patch.job_url = url;
    }

    for (const field of ["location", "compPosted", "contactName", "contactEmail"] as const) {
      const value = input[field];
      if (value === undefined) continue;
      const column = { location: "location", compPosted: "comp_posted", contactName: "contact_name", contactEmail: "contact_email" }[field];
      patch[column] = value?.trim() || null;
    }

    for (const field of ["compMin", "compMax", "compTarget"] as const) {
      const value = input[field];
      if (value === undefined) continue;
      const column = { compMin: "comp_min", compMax: "comp_max", compTarget: "comp_target" }[field];
      patch[column] = value;
    }

    if (input.compCurrency !== undefined) {
      patch.comp_currency = input.compCurrency ? input.compCurrency.toUpperCase() : null;
    }

    // A range with its ends the wrong way round is a typo, and storing it would
    // make every comparison against it wrong in a way nothing on screen shows.
    const nextMin = (patch.comp_min as number | null | undefined) ?? existing.compMin;
    const nextMax = (patch.comp_max as number | null | undefined) ?? existing.compMax;
    if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
      throw AppError.invalidInput(
        "The bottom of the range is above the top. Check which figure went in which box.",
      );
    }

    // Fill the numeric range from the verbatim string, and ONLY into a blank.
    // Once you have typed a figure by hand this cannot overwrite it: your edit
    // is evidence, the parser's is a guess.
    if (input.compPosted !== undefined) {
      Object.assign(
        patch,
        fillCompFromPosted(
          { compMin: nextMin, compMax: nextMax },
          (patch.comp_posted as string | null) ?? existing.compPosted,
        ),
      );
    }

    Object.assign(patch, touch());

    const rows = unwrap(
      await db
        .table("applications")
        .update(patch)
        .eq("id", input.id)
        .eq("user_id", userId)
        .select(),
      "updateApplication",
    ) as Parameters<typeof mapDetail>[0][];

    const row = rows[0];
    if (!row) throw AppError.notFound("No such application.");
    return mapDetail(row);
  },
});

export const DELETE = defineRoute({
  summary: "Stop tracking an application. Its saved documents go with it.",
  auth: ["session"],
  input: z.object({ id: z.string().uuid() }),
  output: z.object({ deleted: z.number().int() }),
  handler: async (context, input) => {
    const db = requireDb(context);

    // Document rows cascade on the foreign key.
    const rows = unwrap(
      await db
        .table("applications")
        .delete()
        .eq("id", input.id)
        .eq("user_id", context.user.id)
        .select(),
      "deleteApplication",
    ) as unknown[];

    if (rows.length === 0) throw AppError.notFound("No such application.");
    return { deleted: rows.length };
  },
});
