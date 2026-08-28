import { defineRoute } from "@/lib/apps/route";

import { ProfileInputSchema, ProfileSchema } from "../../../lib/shared/schemas";
import { firstRow, requireDb, unwrap } from "../../../lib/server/db";
import { loadProfile } from "../../../lib/server/library";

/**
 * Save the identity that prints on every document, plus the number you measure
 * a posting against.
 *
 * A whole-object PUT rather than a field-at-a-time PATCH: these are edited
 * together on one card, and a partial write would make "I cleared my phone
 * number" indistinguishable from "I did not touch my phone number".
 *
 * Blanking a field is allowed, which is a deliberate change from the app this
 * replaced. That app refused an empty string so "put it back" and "make it
 * blank" stayed distinguishable — but "put it back" meant reverting to a value
 * in a TypeScript file, and there is no file any more. With nothing to revert
 * to, refusing the blank would only stop you clearing a field.
 */
export const PUT = defineRoute({
  summary: "Replace the profile: identity, where you work from, links, and your comp target.",
  auth: ["session"],
  input: ProfileInputSchema,
  output: ProfileSchema,
  handler: async (context, input) => {
    const db = requireDb(context);
    const userId = context.user.id;

    const trim = (v: string) => v.trim();
    const nullable = (v: string | null) => (v?.trim() ? v.trim() : null);

    const rows = unwrap(
      await db
        .table("profile")
        .upsert(
          {
            user_id: userId,
            name: trim(input.name),
            headline: trim(input.headline),
            headline_descriptor: trim(input.headlineDescriptor),
            email: trim(input.email),
            phone: nullable(input.phone),
            location: trim(input.location),
            base_city: trim(input.baseCity),
            base_state: nullable(input.baseState),
            base_country: trim(input.baseCountry),
            links: input.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
            comp_target: input.compTarget,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .select(),
      "saveProfile",
    ) as unknown[];

    firstRow(rows, "saveProfile");
    // Re-read rather than mapping the returned row, so the caller sees exactly
    // what a later GET will say — including any column default the write did
    // not set.
    return loadProfile(db, userId);
  },
});
