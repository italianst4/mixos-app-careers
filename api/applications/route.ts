import { z } from "zod";
import { defineRoute } from "@/lib/apps/route";

import {
  ApplicationSummarySchema,
  CreateApplicationSchema,
} from "../../lib/shared/schemas";
import { isStale, daysSince } from "../../lib/shared/statuses";
import { normalizeUrl } from "../../lib/shared/url";
import { firstRow, requireDb, unwrap } from "../../lib/server/db";
import { deriveCompFromPosted, loadApplications, mapSummary } from "../../lib/server/applications";
import { loadLibrary } from "../../lib/server/library";

/**
 * The tracker list, and the way a new application gets into it.
 */
export const GET = defineRoute({
  summary: "Every application you are tracking, most recently touched first.",
  auth: ["session"],
  output: z.object({
    applications: z.array(ApplicationSummarySchema),
    /**
     * Your usual target, so the tracker can measure every row against it
     * without a second round trip. Null when unset, and the comparison then
     * stays silent rather than judging a posting against a number you never
     * gave it.
     */
    profileCompTarget: z.number().int().nullable(),
    /**
     * How many things in the library would print blank on a document. The
     * tracker shows a compact banner rather than the full list — the list
     * belongs on the page that can fix it.
     */
    blockingIssues: z.number().int(),
    /**
     * Application id to days quiet, for open rows untouched for two weeks —
     * roughly when a polite follow-up stops being early and starts being useful.
     *
     * Decided here rather than in the page or the browser. It reads the clock,
     * and a clock consulted during a React render is both impure and, across a
     * server render and a hydration, two different answers to one question.
     */
    quietDays: z.record(z.string(), z.number().int()),
  }),
  handler: async (context) => {
    const db = requireDb(context);
    const userId = context.user.id;

    const [applications, library] = await Promise.all([
      loadApplications(db, userId),
      loadLibrary(db, userId),
    ]);

    const now = Date.now();
    const quietDays: Record<string, number> = {};
    for (const application of applications) {
      if (isStale(application.lastActivityAt, application.status, now)) {
        quietDays[application.id] = daysSince(application.lastActivityAt, now);
      }
    }

    return {
      applications,
      profileCompTarget: library.profile.compTarget,
      blockingIssues: library.issues.filter((i) => i.severity === "blocking").length,
      quietDays,
    };
  },
});

/**
 * Create one from a pasted posting.
 *
 * Pasting rather than fetching is deliberate and is not a missing feature:
 * Greenhouse and Lever pages fetch fine, but LinkedIn and Workday block
 * server-side requests, so a URL field that fetched would work for some
 * postings and mysteriously fail for others. The URL is stored so you can
 * reopen the listing months later, which is the actual need.
 *
 * `company` and `roleTitle` are typed here rather than extracted. The model
 * that reads them out of the posting arrives in phase 3 with the `anthropic`
 * connector; until then, typing them beats the source's fallback of "Unknown
 * company", which produces a tracker you cannot scan.
 */
export const POST = defineRoute({
  summary: "Start tracking an application from a pasted job posting.",
  auth: ["session"],
  input: CreateApplicationSchema,
  output: ApplicationSummarySchema,
  handler: async (context, input) => {
    const db = requireDb(context);

    const compPosted = input.compPosted?.trim() || null;

    const rows = unwrap(
      await db
        .table("applications")
        .insert({
          user_id: context.user.id,
          company: input.company.trim(),
          role_title: input.roleTitle.trim(),
          // `normalizeUrl` refuses anything that is not a real address, so a
          // mistyped link fails here rather than sitting in the tracker looking
          // clickable.
          job_url: normalizeUrl(input.jobUrl ?? null),
          jd_raw: input.jobPosting,
          location: input.location?.trim() || null,
          comp_posted: compPosted,
          // Read the range out of the verbatim string while it is in front of
          // us. A salary range is much harder to find again three weeks later.
          ...deriveCompFromPosted(compPosted),
          status: "draft",
        })
        .select(),
      "createApplication",
    ) as Parameters<typeof mapSummary>[0][];

    return mapSummary(firstRow(rows, "createApplication"));
  },
});
