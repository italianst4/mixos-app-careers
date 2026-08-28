import { z } from "zod";
import { defineRoute, AppError } from "@/lib/apps/route";

import { RoleInputSchema, RoleSchema } from "../../../../lib/shared/schemas";
import { requireDb, unwrap } from "../../../../lib/server/db";
import { mapRole, roleColumns, type RoleRow } from "../../../../lib/server/writes";

/**
 * Edit or remove one role.
 *
 * Both verbs carry `user_id` in the predicate as well as `id`. A row that is
 * not yours matches nothing and comes back as NOT FOUND — never FORBIDDEN,
 * because the two responses would differ and the difference is what tells a
 * prober which ids exist.
 */
export const PUT = defineRoute({
  summary: "Replace one role.",
  auth: ["session"],
  input: RoleInputSchema.extend({ id: z.string().uuid() }),
  output: RoleSchema,
  handler: async (context, input) => {
    const db = requireDb(context);

    const rows = unwrap(
      await db
        .table("roles")
        .update({ ...roleColumns(input), updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", context.user.id)
        .select(),
      "updateRole",
    ) as RoleRow[];

    const row = rows[0];
    if (!row) throw AppError.notFound("No such role.");
    return mapRole(row);
  },
});

export const DELETE = defineRoute({
  summary: "Remove a role. The accomplishments beneath it go with it.",
  auth: ["session"],
  input: z.object({ id: z.string().uuid() }),
  output: z.object({ deleted: z.number().int() }),
  handler: async (context, input) => {
    const db = requireDb(context);

    // The accomplishments cascade, which is the honest behaviour: an
    // accomplishment is a claim about work done in a role, and orphaning one
    // would leave a bullet on a resume with no employer under it.
    const rows = unwrap(
      await db
        .table("roles")
        .delete()
        .eq("id", input.id)
        .eq("user_id", context.user.id)
        .select(),
      "deleteRole",
    ) as unknown[];

    if (rows.length === 0) throw AppError.notFound("No such role.");
    return { deleted: rows.length };
  },
});
