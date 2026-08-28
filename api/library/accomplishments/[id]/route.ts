import { z } from "zod";
import { defineRoute, AppError } from "@/lib/apps/route";

import {
  AccomplishmentInputSchema,
  AccomplishmentSchema,
} from "../../../../lib/shared/schemas";
import { requireDb, unwrap } from "../../../../lib/server/db";
import {
  accomplishmentColumns,
  assertOwnsRole,
  mapAccomplishment,
  type AccomplishmentRow,
} from "../../../../lib/server/writes";

/**
 * Edit or remove one accomplishment.
 *
 * Both verbs match on `user_id` as well as `id`, and a row that is not yours
 * comes back as NOT FOUND rather than FORBIDDEN — see the note on the roles
 * route for why the two must not be distinguishable.
 */
export const PUT = defineRoute({
  summary: "Replace one accomplishment.",
  auth: ["session"],
  input: AccomplishmentInputSchema.extend({ id: z.string().uuid() }),
  output: AccomplishmentSchema,
  handler: async (context, input) => {
    const db = requireDb(context);
    // Re-checked on every edit, not only on create: `roleId` is part of the
    // payload, so an edit is another chance to point a claim at a role that is
    // not yours.
    await assertOwnsRole(db, context.user.id, input.roleId);

    const rows = unwrap(
      await db
        .table("accomplishments")
        .update({ ...accomplishmentColumns(input), updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", context.user.id)
        .select(),
      "updateAccomplishment",
    ) as AccomplishmentRow[];

    const row = rows[0];
    if (!row) throw AppError.notFound("No such accomplishment.");
    return mapAccomplishment(row);
  },
});

export const DELETE = defineRoute({
  summary: "Remove an accomplishment.",
  auth: ["session"],
  input: z.object({ id: z.string().uuid() }),
  output: z.object({ deleted: z.number().int() }),
  handler: async (context, input) => {
    const db = requireDb(context);

    const rows = unwrap(
      await db
        .table("accomplishments")
        .delete()
        .eq("id", input.id)
        .eq("user_id", context.user.id)
        .select(),
      "deleteAccomplishment",
    ) as unknown[];

    if (rows.length === 0) throw AppError.notFound("No such accomplishment.");
    return { deleted: rows.length };
  },
});
