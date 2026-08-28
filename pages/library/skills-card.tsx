"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { AddRow, SaveRow, SectionCard } from "@/components/ui/section-card";

import type { SkillGroup } from "../../lib/shared/schemas";
import { client, messageOf } from "../client";
import { useServerDraft } from "../use-server-draft";

interface Draft {
  label: string;
  /** Edited as one-per-line text; split on save. */
  items: string;
}

/**
 * Skills, as ordered groups.
 *
 * Order is part of the value: a resume's skills block is read top-down and the
 * first group is the one that actually gets read. So the array position IS the
 * sort order, and the whole list is saved at once — a per-row update could not
 * express a reorder without the caller sequencing several writes and hoping
 * none of them failed halfway.
 */
export function SkillsCard({
  groups,
  onSaved,
}: {
  groups: SkillGroup[];
  onSaved: () => void;
}) {
  const { draft, setDraft, dirty } = useServerDraft(groups, toDraft);
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
      await client.call("PUT /library/skills", {
        groups: draft
          .map((g) => ({
            label: g.label.trim(),
            items: g.items
              .split("\n")
              .map((i) => i.trim())
              .filter(Boolean),
          }))
          // A group with no label has nothing to print as a heading, so it is
          // dropped rather than saved as a blank row on a resume.
          .filter((g) => g.label),
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
      title="Skills"
      hint="Grouped, and the order is the order they print in. A resume's skills block is read top-down, so the first group is the one that actually gets read."
      footer={<SaveRow onSave={save} saving={busy} dirty={dirty} saved={saved} />}
    >
      <div className="space-y-4">
        {draft.map((group, i) => (
          <div key={i} className="rounded-md border border-border p-4">
            <div className="flex items-end gap-2">
              <Field label="Group" className="min-w-0 flex-1">
                {(f) => (
                  <Input
                    {...f}
                    value={group.label}
                    placeholder="Languages and frameworks"
                    onChange={(e) =>
                      update(draft.map((g, j) => (j === i ? { ...g, label: e.target.value } : g)))
                    }
                  />
                )}
              </Field>
              <IconButton
                label={`Move ${group.label || "group"} up`}
                icon={<ArrowUp className="h-4 w-4" />}
                variant="ghost"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              />
              <IconButton
                label={`Move ${group.label || "group"} down`}
                icon={<ArrowDown className="h-4 w-4" />}
                variant="ghost"
                disabled={i === draft.length - 1}
                onClick={() => move(i, i + 1)}
              />
              <IconButton
                label={`Remove ${group.label || "group"}`}
                icon={<Trash2 className="h-4 w-4" />}
                variant="ghost"
                onClick={() => update(draft.filter((_, j) => j !== i))}
              />
            </div>

            <div className="mt-3">
              <Field label="Items" hint="One per line.">
                {(f) => (
                  <Textarea
                    {...f}
                    rows={3}
                    value={group.items}
                    onChange={(e) =>
                      update(draft.map((g, j) => (j === i ? { ...g, items: e.target.value } : g)))
                    }
                  />
                )}
              </Field>
            </div>
          </div>
        ))}

        <AddRow
          onAdd={() => update([...draft, { label: "", items: "" }])}
          label="Add group"
        />

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </SectionCard>
  );
}

function toDraft(groups: SkillGroup[]): Draft[] {
  return groups.map((g) => ({ label: g.label, items: g.items.join("\n") }));
}
