"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

import { AsyncView } from "@/components/ui/async-view";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppQuery } from "@/lib/apps/use-app-query";
import type { WidgetProps } from "@/lib/hooks/types";

import { statusTone, type ApplicationStatus } from "../lib/shared/statuses";

/** The `GET /summary` payload. Counts a tile can render without a second fetch. */
interface Summary {
  open: number;
  closed: number;
  byStatus: { status: ApplicationStatus; count: number }[];
  stale: { id: string; company: string; roleTitle: string; quietDays: number }[];
  belowTarget: number;
}

/**
 * Shared by the skeleton and the loaded state so a padding change to one cannot
 * reintroduce the layout shift the other was shaped to avoid.
 */
const CONTENT = "flex min-h-0 min-w-0 flex-1 flex-col gap-2";

/**
 * The pipeline at a glance.
 *
 * Ordered by what a dashboard tile is actually used for: it is looked at, not
 * read. The open count is the one number worth a whole line, the status chips
 * answer "where are they" in one scan, and the quiet line is the only thing here
 * that asks for an action — which is what earns the tile its slot.
 */
export default function ApplicationPipeline({ appSlug }: WidgetProps) {
  const query = useAppQuery<Summary>(appSlug, "GET /summary");

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <AsyncView
        query={query}
        skeleton={
          <div className={CONTENT}>
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-3 w-10" />
            <div className="flex flex-wrap gap-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        }
        empty={{
          cause: "no-data",
          title: "Nothing tracked yet",
          body: "Paste a job posting into Career and it becomes the first application tracked here.",
          action: { label: "Open Career", href: `/apps/${appSlug}` },
        }}
        // The payload is counts, not a list, so AsyncView has no array to read
        // emptiness off. Both halves matter: "0 open, 12 closed" is a search
        // that finished, and hiding it behind "nothing tracked yet" would erase
        // the record.
        isEmpty={(data) => data.open === 0 && data.closed === 0}
      >
        {(data) => {
          // A zero is not a status the pipeline is in. Rendering the full
          // seven-chip enumeration would bury the two or three that are true.
          const active = data.byStatus.filter((entry) => entry.count > 0);
          // The route sorts `stale` by quiet days descending.
          const stalest = data.stale[0];

          return (
            <div className={CONTENT}>
              <div>
                <p className="text-3xl font-semibold leading-none tabular-nums text-foreground">
                  {data.open}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">open</p>
              </div>

              {active.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {active.map((entry) => (
                    // Lowercase on purpose: in a chip this reads as a phrase
                    // ("4 interview"), where a title-cased label would read as
                    // a heading sitting on top of a number.
                    <Badge key={entry.status} tone={statusTone(entry.status)}>
                      {entry.count} {entry.status}
                    </Badge>
                  ))}
                </div>
              )}

              {stalest && (
                <div className="text-xs">
                  <p className="flex items-center gap-1 font-medium text-warning">
                    <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    {data.stale.length} quiet for 2+ weeks
                  </p>
                  {/* One name, not a list. The tile is pointing at a next
                      action, and a column of names is not one. */}
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {stalest.company} &mdash; {stalest.quietDays} days
                  </p>
                </div>
              )}

              {data.belowTarget > 0 && (
                <p className="text-xs text-muted-foreground">
                  {data.belowTarget} can&apos;t reach your target
                </p>
              )}
            </div>
          );
        }}
      </AsyncView>

      <Link
        href={`/apps/${appSlug}`}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Open
      </Link>
    </div>
  );
}
