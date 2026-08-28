import { z } from "zod";
import { defineRoute, AppError } from "@/lib/apps/route";

import {
  SummaryVariantInputSchema,
  SummaryVariantSchema,
} from "../../../lib/shared/schemas";
import { requireDb, unwrap } from "../../../lib/server/db";
import { DEFAULT_SUMMARY_KEY, loadSummaryVariants } from "../../../lib/server/library";

/**
 * The opening summary options, replaced as a set.
 *
 * A whole-list PUT because the editor shows them together and a key can be
 * renamed, which a per-row PATCH cannot express without a delete-then-insert
 * the caller would have to sequence itself.
 *
 * `default` is the fallback every resume lands on when no variant fits the
 * posting, so a payload without it is refused — dropping it would leave
 * documents printing nothing where the summary should be, and the failure would
 * surface only on the next PDF.
 */
export const PUT = defineRoute({
  summary: "Replace the whole set of summary variants.",
  auth: ["session"],
  input: z.object({ variants: z.array(SummaryVariantInputSchema).max(24) }),
  output: z.object({ summaryVariants: z.array(SummaryVariantSchema) }),
  handler: async (context, input) => {
    const db = requireDb(context);
    const userId = context.user.id;

    const keys = input.variants.map((v) => v.key);
    if (new Set(keys).size !== keys.length) {
      throw AppError.invalidInput("Two variants share a key. Each one needs its own.");
    }
    if (!keys.includes(DEFAULT_SUMMARY_KEY)) {
      throw AppError.invalidInput(
        `The "${DEFAULT_SUMMARY_KEY}" variant is the fallback every resume uses when no other fits, so it cannot be removed.`,
      );
    }

    // The delete and the insert carry the same `user_id` predicate, so a
    // replace can never reach across the boundary even for a moment.
    const cleared = await db.table("summary_variants").delete().eq("user_id", userId);
    if (cleared.error) {
      throw new Error(`[career] replaceSummaryVariants (clear): ${cleared.error.message}`);
    }

    if (input.variants.length > 0) {
      // One multi-row INSERT rather than a statement per variant.
      unwrap(
        await db
          .table("summary_variants")
          .insert(
            input.variants.map((v) => ({
              user_id: userId,
              variant_key: v.key,
              body: v.body,
              updated_at: new Date().toISOString(),
            })),
          )
          .select(),
        "replaceSummaryVariants",
      );
    }

    return { summaryVariants: await loadSummaryVariants(db, userId) };
  },
});
