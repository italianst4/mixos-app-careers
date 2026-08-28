"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { AddRow, SaveRow, SectionCard } from "@/components/ui/section-card";

import type { SummaryVariant } from "../../lib/shared/schemas";
import { client, messageOf } from "../client";
import { useServerDraft } from "../use-server-draft";

const DEFAULT_KEY = "default";

/**
 * Opening summaries, one per angle.
 *
 * A whole-list save because a key can be renamed, which a per-row update cannot
 * express without a delete-then-insert the caller would have to sequence itself.
 */
export function SummariesCard({
  variants,
  onSaved,
}: {
  variants: SummaryVariant[];
  onSaved: () => void;
}) {
  // `default` is the fallback every resume lands on. If the library has none
  // yet, seed an empty one rather than presenting a card with no way to create
  // the one variant that is required.
  const seeded = useMemo(() => withDefault(variants), [variants]);

  const { draft, setDraft, dirty } = useServerDraft(seeded, (v) => v);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function edit(index: number, patch: Partial<SummaryVariant>) {
    setDraft((d) => d.map((v, i) => (i === index ? { ...v, ...patch } : v)));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      const { summaryVariants } = await client.call("PUT /library/summary-variants", {
        variants: draft.map((v) => ({ key: v.key.trim(), body: v.body })),
      });
      setDraft(withDefault(summaryVariants));
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
      title="Summaries"
      hint="The selector picks the variant that best fits a posting and falls back to “default”. Write one per angle you actually apply for; an empty variant is never chosen."
      footer={<SaveRow onSave={save} saving={busy} dirty={dirty} saved={saved} />}
    >
      <div className="space-y-5">
        {draft.map((variant, i) => {
          const required = variant.key === DEFAULT_KEY;
          return (
            <div key={i} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-end gap-2">
                <Field
                  label="Key"
                  className="w-56 shrink-0"
                  hint={
                    required
                      ? "The fallback. Every resume lands here when no other variant fits."
                      : "Lowercase letters, digits and hyphens."
                  }
                >
                  {(f) => (
                    <Input
                      {...f}
                      value={variant.key}
                      // The one key that cannot be renamed, because the routes
                      // and the selector both look it up by name.
                      readOnly={required}
                      aria-readonly={required || undefined}
                      onChange={(e) => edit(i, { key: e.target.value })}
                    />
                  )}
                </Field>
                {/*
                  Omitted rather than disabled for the required variant. A
                  greyed-out control advertises a capability that does not exist
                  and sends someone hunting for why.
                */}
                {!required && (
                  <IconButton
                    label={`Remove ${variant.key || "variant"}`}
                    icon={<Trash2 className="h-4 w-4" />}
                    variant="ghost"
                    onClick={() => {
                      setDraft((d) => d.filter((_, j) => j !== i));
                      setSaved(false);
                    }}
                  />
                )}
              </div>

              <Field label="Summary">
                {(f) => (
                  <Textarea
                    {...f}
                    rows={4}
                    value={variant.body}
                    onChange={(e) => edit(i, { body: e.target.value })}
                    placeholder="Engineer who has spent twenty years…"
                  />
                )}
              </Field>
            </div>
          );
        })}

        <AddRow
          onAdd={() => {
            setDraft((d) => [...d, { key: "", body: "", required: false }]);
            setSaved(false);
          }}
          label="Add variant"
        />

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </SectionCard>
  );
}

/** `default` first, then the rest as given. */
function withDefault(variants: SummaryVariant[]): SummaryVariant[] {
  const rest = variants.filter((v) => v.key !== DEFAULT_KEY);
  const existing = variants.find((v) => v.key === DEFAULT_KEY);
  return [existing ?? { key: DEFAULT_KEY, body: "", required: true }, ...rest];
}
