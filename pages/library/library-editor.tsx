"use client";

import { useCallback, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

import type { Library, LibraryIssue } from "../../lib/shared/schemas";
import { client, messageOf } from "../client";
import { AccomplishmentsCard } from "./accomplishments-card";
import { EducationCard } from "./education-card";
import { ProfileCard } from "./profile-card";
import { RolesCard } from "./roles-card";
import { SkillsCard } from "./skills-card";
import { SummariesCard } from "./summaries-card";

/**
 * Holds the library and re-reads it after every mutation.
 *
 * The issues list is computed on the server from the whole library at once —
 * an accomplishment pointing at a deleted role is only visible with both lists
 * in hand — so a card that saved without triggering a re-read would leave the
 * panel above it describing a library that no longer exists. Every card calls
 * `onSaved`, and `onSaved` is this refetch.
 */
export function LibraryEditor({ initial }: { initial: Library }) {
  const [library, setLibrary] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setFailure(null);
    try {
      setLibrary(await client.call("GET /library"));
    } catch (err) {
      // The write already succeeded; only the re-read failed. Say so, and leave
      // the previous state on screen rather than blanking work that is saved.
      setFailure(`${messageOf(err)} Your change was saved — reload to see it reflected.`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div className="mt-6 space-y-6">
      <IssuesPanel issues={library.issues} />

      {/*
        A note rather than a skeleton. The user just clicked something they
        watched succeed; replacing the page with a shimmer would read as the
        work being undone.
      */}
      {refreshing && (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          Rechecking the library…
        </p>
      )}
      {failure && <p className="text-sm text-destructive">{failure}</p>}

      <ProfileCard profile={library.profile} onSaved={refresh} />
      <SummariesCard variants={library.summaryVariants} onSaved={refresh} />
      <RolesCard roles={library.roles} onSaved={refresh} />
      <AccomplishmentsCard
        accomplishments={library.accomplishments}
        roles={library.roles}
        onSaved={refresh}
      />
      <SkillsCard groups={library.skillGroups} onSaved={refresh} />
      <EducationCard entries={library.education} onSaved={refresh} />
    </div>
  );
}

/**
 * What is unfinished, and what it costs you.
 *
 * "Something is unfinished" is useless without "and here is exactly what". The
 * split matters: a blocking issue would print blank on a document you send,
 * while a warning is private or optional and is a note to yourself.
 */
function IssuesPanel({ issues }: { issues: LibraryIssue[] }) {
  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
            Your library is complete. Every field a document prints has something in it.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {blocking.length > 0 && (
        <IssueList
          issues={blocking}
          title={
            <>
              <span className="text-destructive">{blocking.length}</span> thing
              {blocking.length === 1 ? "" : "s"} would print blank on a document
            </>
          }
          note="A document assembled right now would have a gap where each of these belongs."
        />
      )}

      {warnings.length > 0 && (
        <IssueList
          issues={warnings}
          title={
            <>
              <span className="text-warning">{warnings.length}</span> thing
              {warnings.length === 1 ? "" : "s"} worth finishing
            </>
          }
          note="None of these blocks a document. An unwritten evidence note in particular is private and never rendered — it is where you record how you would prove a claim in a room."
        />
      )}
    </div>
  );
}

/** More than a handful of these is a list to work through, not a banner to read. */
const COLLAPSE_AFTER = 6;

function IssueList({
  issues,
  title,
  note,
}: {
  issues: LibraryIssue[];
  title: React.ReactNode;
  note: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? issues : issues.slice(0, COLLAPSE_AFTER);
  const hidden = issues.length - shown.length;

  return (
    <Card>
      <CardHeader title={title} />
      <CardBody divided>
        <p className="text-sm text-muted-foreground">{note}</p>
        <ul className="mt-3 space-y-2">
          {shown.map((issue) => (
            <li key={`${issue.severity}:${issue.field}`} className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">{issue.field}</span>
              <span className="mt-0.5 block text-card-foreground">{issue.detail}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
              Show {hidden} more
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
