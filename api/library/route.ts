import { defineRoute } from "@/lib/apps/route";

import { LibrarySchema } from "../../lib/shared/schemas";
import { requireDb } from "../../lib/server/db";
import { loadLibrary } from "../../lib/server/library";

/**
 * The whole career library for the signed-in user, resolved.
 *
 * One route rather than six because the editor renders all of it at once and
 * the referential checks in `computeIssues` need every part in hand — an
 * accomplishment pointing at a deleted role is only visible with both lists.
 *
 * Note what is NOT here, compared to the app this was converted from: there is
 * no `fileDefault` beside each value and no `overridden` flag. Those existed to
 * answer "is this mine or the repository's" when the library lived in
 * TypeScript and the database only held overrides. The database is the library
 * now, so the question has no meaning and the field would be noise.
 */
export const GET = defineRoute({
  summary: "The signed-in user's career library, with everything unfinished listed.",
  auth: ["session"],
  output: LibrarySchema,
  handler: async (context) => {
    const db = requireDb(context);
    return loadLibrary(db, context.user.id);
  },
});
