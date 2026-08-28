"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * A local draft that re-seeds when the server data behind it actually changes.
 *
 * The obvious spelling — `useEffect(() => setDraft(props), [props])` — is a
 * cascading render, and React's lint rule rejects it. This is the pattern the
 * React docs point at instead: compare during render and adjust, so the reset
 * happens in the same pass rather than in a second one.
 *
 * Compared by VALUE, not identity. Every refetch hands these cards a freshly
 * parsed object, so an identity check would fire on every refresh — including
 * one triggered by a sibling card — and throw away edits the user had in
 * progress in a card they never touched.
 */
export function useServerDraft<TServer, TDraft>(
  server: TServer,
  toDraft: (server: TServer) => TDraft,
): {
  draft: TDraft;
  setDraft: Dispatch<SetStateAction<TDraft>>;
  /** True when the draft differs from what the server last said. */
  dirty: boolean;
} {
  const snapshot = JSON.stringify(server);
  const [seenSnapshot, setSeenSnapshot] = useState(snapshot);
  const [draft, setDraft] = useState<TDraft>(() => toDraft(server));

  if (seenSnapshot !== snapshot) {
    setSeenSnapshot(snapshot);
    setDraft(toDraft(server));
  }

  return {
    draft,
    setDraft,
    dirty: JSON.stringify(draft) !== JSON.stringify(toDraft(server)),
  };
}
