import { z } from "zod";
import { defineRoute } from "@/lib/apps/route";

import { EducationInputSchema, EducationSchema } from "../../../lib/shared/schemas";
import { requireDb, unwrap } from "../../../lib/server/db";
import { loadEducation } from "../../../lib/server/library";
import { educationColumns } from "../../../lib/server/writes";

/** Replace the education entries, in the order given. Same shape as skills. */
export const PUT = defineRoute({
  summary: "Replace the education entries, in the order given.",
  auth: ["session"],
  input: z.object({ entries: z.array(EducationInputSchema).max(20) }),
  output: z.object({ education: z.array(EducationSchema) }),
  handler: async (context, input) => {
    const db = requireDb(context);
    const userId = context.user.id;

    const cleared = await db.table("education").delete().eq("user_id", userId);
    if (cleared.error) {
      throw new Error(`[career] replaceEducation (clear): ${cleared.error.message}`);
    }

    if (input.entries.length > 0) {
      unwrap(
        await db
          .table("education")
          .insert(input.entries.map((e, i) => educationColumns(e, i, userId)))
          .select(),
        "replaceEducation",
      );
    }

    return { education: await loadEducation(db, userId) };
  },
});
