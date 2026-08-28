import { z } from "zod";
import { defineRoute } from "@/lib/apps/route";

import { compVerdict, effectiveTarget } from "../../lib/shared/comp";
import { APPLICATION_STATUSES, isClosed, isStale } from "../../lib/shared/statuses";
import { requireDb } from "../../lib/server/db";
import { loadApplications } from "../../lib/server/applications";
import { loadProfile } from "../../lib/server/library";

/**
 * The counts a dashboard tile needs, and nothing else.
 *
 * Its own route rather than a slice of `GET /applications` because a widget
 * that fetched the full tracker to render three numbers would pay for every
 * posting body it never shows. The lightweight endpoint is also what keeps the
 * dashboard responsive when the tracker gets long.
 */
export const GET = defineRoute({
  summary: "Open/closed counts, per-status counts, and what has gone quiet.",
  auth: ["session"],
  output: z.object({
    open: z.number().int(),
    closed: z.number().int(),
    byStatus: z.array(z.object({ status: z.enum(APPLICATION_STATUSES), count: z.number().int() })),
    /**
     * Open applications untouched for two weeks — roughly when a polite
     * follow-up stops being early and starts being useful.
     */
    stale: z.array(
      z.object({
        id: z.string(),
        company: z.string(),
        roleTitle: z.string(),
        quietDays: z.number().int(),
      }),
    ),
    /**
     * Open applications whose posted range cannot reach your target. Null-free:
     * a posting that printed no range has not failed your bar, and counting it
     * as short would be a claim the data does not support.
     */
    belowTarget: z.number().int(),
  }),
  handler: async (context) => {
    const db = requireDb(context);
    const userId = context.user.id;

    const [applications, profile] = await Promise.all([
      loadApplications(db, userId),
      loadProfile(db, userId),
    ]);

    const now = Date.now();
    const open = applications.filter((a) => !isClosed(a.status));

    const counts = new Map<string, number>();
    for (const a of applications) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);

    const stale = open
      .filter((a) => isStale(a.lastActivityAt, a.status, now))
      .map((a) => ({
        id: a.id,
        company: a.company,
        roleTitle: a.roleTitle,
        quietDays: Math.floor((now - new Date(a.lastActivityAt).getTime()) / 86_400_000),
      }))
      .sort((a, b) => b.quietDays - a.quietDays);

    const belowTarget = open.filter((a) => {
      const verdict = compVerdict(
        a.compMax,
        effectiveTarget(a.compTarget, profile.compTarget),
        a.compCurrency ?? "USD",
      );
      // `clears === false` only. A null verdict means one side is unknown, and
      // that is not the same as falling short.
      return verdict.clears === false;
    }).length;

    return {
      open: open.length,
      closed: applications.length - open.length,
      byStatus: APPLICATION_STATUSES.map((status) => ({
        status,
        count: counts.get(status) ?? 0,
      })),
      stale,
      belowTarget,
    };
  },
});
