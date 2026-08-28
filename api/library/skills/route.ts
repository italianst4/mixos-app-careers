import { z } from "zod";
import { defineRoute } from "@/lib/apps/route";

import { SkillGroupInputSchema, SkillGroupSchema } from "../../../lib/shared/schemas";
import { requireDb, unwrap } from "../../../lib/server/db";
import { loadSkillGroups } from "../../../lib/server/library";
import { skillGroupColumns } from "../../../lib/server/writes";

/**
 * Replace the whole set of skill groups.
 *
 * Order is part of the value: a resume's skills block is read top-down and the
 * first group is the one that gets read, so the array index IS the sort order.
 * A per-row PATCH could not express a reorder without the caller sequencing
 * several writes and hoping none of them failed halfway.
 */
export const PUT = defineRoute({
  summary: "Replace the skill groups, in the order given.",
  auth: ["session"],
  input: z.object({ groups: z.array(SkillGroupInputSchema).max(20) }),
  output: z.object({ skillGroups: z.array(SkillGroupSchema) }),
  handler: async (context, input) => {
    const db = requireDb(context);
    const userId = context.user.id;

    const cleared = await db.table("skill_groups").delete().eq("user_id", userId);
    if (cleared.error) {
      throw new Error(`[career] replaceSkillGroups (clear): ${cleared.error.message}`);
    }

    if (input.groups.length > 0) {
      unwrap(
        await db
          .table("skill_groups")
          .insert(input.groups.map((g, i) => skillGroupColumns(g, i, userId)))
          .select(),
        "replaceSkillGroups",
      );
    }

    return { skillGroups: await loadSkillGroups(db, userId) };
  },
});
