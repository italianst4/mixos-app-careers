"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AddRow, SaveRow, SectionCard } from "@/components/ui/section-card";

import type { Education } from "../../lib/shared/schemas";
import { client, messageOf } from "../client";
import { useServerDraft } from "../use-server-draft";

interface Draft {
  institution: string;
  credential: string;
  yearLabel: string;
}

/** Same ordered whole-list shape as skills, with three fields instead of two. */
export function EducationCard({
  entries,
  onSaved,
}: {
  entries: Education[];
  onSaved: () => void;
}) {
  const { draft, setDraft, dirty } = useServerDraft(entries, toDraft);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function update(next: Draft[]) {
    setDraft(next);
    setSaved(false);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update(next);
  }

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      await client.call("PUT /library/education", {
        entries: draft
          .map((e) => ({
            institution: e.institution.trim(),
            credential: e.credential.trim(),
            yearLabel: e.yearLabel.trim() || null,
          }))
          // Both halves are required to print a line, so a half-filled row is
          // dropped rather than saved as a fragment.
          .filter((e) => e.institution && e.credential),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Education"
      hint="Printed in the order given."
      footer={<SaveRow onSave={save} saving={busy} dirty={dirty} saved={saved} />}
    >
      <div className="space-y-4">
        {draft.map((entry, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-4">
            <Field label="Institution" className="min-w-48 flex-1">
              {(f) => (
                <Input
                  {...f}
                  value={entry.institution}
                  onChange={(e) =>
                    update(
                      draft.map((v, j) => (j === i ? { ...v, institution: e.target.value } : v)),
                    )
                  }
                />
              )}
            </Field>
            <Field label="Credential" className="min-w-48 flex-1">
              {(f) => (
                <Input
                  {...f}
                  value={entry.credential}
                  onChange={(e) =>
                    update(
                      draft.map((v, j) => (j === i ? { ...v, credential: e.target.value } : v)),
                    )
                  }
                />
              )}
            </Field>
            <Field
              label="Year"
              className="w-40 shrink-0"
              hint="Free text — “2004”, “expected 2027”."
            >
              {(f) => (
                <Input
                  {...f}
                  value={entry.yearLabel}
                  onChange={(e) =>
                    update(
                      draft.map((v, j) => (j === i ? { ...v, yearLabel: e.target.value } : v)),
                    )
                  }
                />
              )}
            </Field>
            <div className="flex items-center gap-1">
              <IconButton
                label={`Move ${entry.institution || "entry"} up`}
                icon={<ArrowUp className="h-4 w-4" />}
                variant="ghost"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              />
              <IconButton
                label={`Move ${entry.institution || "entry"} down`}
                icon={<ArrowDown className="h-4 w-4" />}
                variant="ghost"
                disabled={i === draft.length - 1}
                onClick={() => move(i, i + 1)}
              />
              <IconButton
                label={`Remove ${entry.institution || "entry"}`}
                icon={<Trash2 className="h-4 w-4" />}
                variant="ghost"
                onClick={() => update(draft.filter((_, j) => j !== i))}
              />
            </div>
          </div>
        ))}

        <AddRow
          onAdd={() => update([...draft, { institution: "", credential: "", yearLabel: "" }])}
          label="Add entry"
        />

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </SectionCard>
  );
}

function toDraft(entries: Education[]): Draft[] {
  return entries.map((e) => ({
    institution: e.institution,
    credential: e.credential,
    yearLabel: e.yearLabel ?? "",
  }));
}
