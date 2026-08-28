import { defineRoute } from "@/lib/apps/route";

import { RoleInputSchema, RoleSchema } from "../../../lib/shared/schemas";
import { firstRow, requireDb, unwrap } from "../../../lib/server/db";
import { mapRole, roleColumns, type RoleRow } from "../../../lib/server/writes";

/**
 * Add a position to the employment history.
 *
 * History is FIXED on a resume — every role renders on every document, in full.
 * Dropping one to make room reads as an employment gap, which is why nothing in
 * this app filters roles and why only the accomplishments beneath them vary
 * between applications.
 */
export const POST = defineRoute({
  summary: "Add a role to the employment history.",
  auth: ["session"],
  input: RoleInputSchema,
  output: RoleSchema,
  handler: async (context, input) => {
    const db = requireDb(context);

    const rows = unwrap(
      await db
        .table("roles")
        .insert({ user_id: context.user.id, ...roleColumns(input) })
        .select(),
      "createRole",
    ) as RoleRow[];

    return mapRole(firstRow(rows, "createRole"));
  },
});
