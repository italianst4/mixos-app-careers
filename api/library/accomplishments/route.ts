import { defineRoute } from "@/lib/apps/route";

import { AccomplishmentInputSchema, AccomplishmentSchema } from "../../../lib/shared/schemas";
import { firstRow, requireDb, unwrap } from "../../../lib/server/db";
import {
  accomplishmentColumns,
  assertOwnsRole,
  mapAccomplishment,
  type AccomplishmentRow,
} from "../../../lib/server/writes";

/**
 * Add an accomplishment.
 *
 * This is the only place a factual claim enters the app. Everything a document
 * can later assert is selected, ordered and at most lightly reworded from these
 * rows — the pipeline may never invent one, and from phase 3 every rephrase is
 * checked against the entry it came from before a human sees it.
 */
export const POST = defineRoute({
  summary: "Add an accomplishment beneath one of your roles.",
  auth: ["session"],
  input: AccomplishmentInputSchema,
  output: AccomplishmentSchema,
  handler: async (context, input) => {
    const db = requireDb(context);
    await assertOwnsRole(db, context.user.id, input.roleId);

    const rows = unwrap(
      await db
        .table("accomplishments")
        .insert({ user_id: context.user.id, ...accomplishmentColumns(input) })
        .select(),
      "createAccomplishment",
    ) as AccomplishmentRow[];

    return mapAccomplishment(firstRow(rows, "createAccomplishment"));
  },
});
