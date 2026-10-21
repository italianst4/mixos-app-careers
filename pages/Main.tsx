import Link from "next/link";

import { callAppRoute } from "@/lib/apps/call";
import { ErrorState } from "@/components/ui/app-states";
import AppPageHeader from "@/components/ui/app-page-header";

import { isClosed } from "../lib/shared/statuses";
import type { ApplicationSummary } from "../lib/shared/schemas";
import { Tracker } from "./tracker";

interface Result {
  applications: ApplicationSummary[];
  profileCompTarget: number | null;
  blockingIssues: number;
  quietDays: Record<string, number>;
}

/**
 * The tracker.
 *
 * A server component that gets its data through its own declared route rather
 * than by importing the database. `callAppRoute` runs the identical gateway
 * pipeline in-process — same session, same validation — so there is no second
 * authorization surface for this page to get wrong.
 */
export default async function CareerPage() {
  let result: Result | null = null;
  let failure: string | null = null;

  try {
    result = await callAppRoute<Result>("careers", "GET /applications");
  } catch {
    // Degrade rather than fail. `callAppRoute` throws `AppError`, and its
    // message is written for a caller — but a server component has no retry
    // handler to offer, so the honest affordance is a reload link.
    failure = "The tracker could not be loaded.";
  }

  if (!result) {
    return (
      <div className="p-6">
        <ErrorState
          title="Applications are unavailable"
          message={failure ?? "The tracker could not be loaded."}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/apps/careers" className="underline underline-offset-2">
            Try again
          </Link>
        </p>
      </div>
    );
  }

  const open = result.applications.filter((a) => !isClosed(a.status)).length;
  const closed = result.applications.length - open;

  return (
    <div className="p-6">
      <AppPageHeader
        title="Applications"
        subtitle={
          result.applications.length === 0
            ? "Nothing tracked yet."
            : `${open} open${closed > 0 ? ` · ${closed} closed` : ""}`
        }
        actions={[{ label: "Library", href: "/apps/careers/library", variant: "secondary" }]}
      />

      <Tracker
        applications={result.applications}
        profileCompTarget={result.profileCompTarget}
        blockingIssues={result.blockingIssues}
        quietDays={result.quietDays}
      />
    </div>
  );
}
