"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AddRow, SaveRow, SectionCard } from "@/components/ui/section-card";

import type { Profile } from "../../lib/shared/schemas";
import { client, messageOf } from "../client";
import { useServerDraft } from "../use-server-draft";

/**
 * Who you are, and the number you measure a posting against.
 *
 * A whole-object save rather than a field-at-a-time one: these are edited
 * together, and a partial write would make "I cleared my phone number"
 * indistinguishable from "I did not touch my phone number".
 */
export function ProfileCard({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: () => void;
}) {
  // The parent refetches after every save, so `profile` changes under us.
  const { draft, setDraft, dirty } = useServerDraft(profile, (p) => p);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      await client.call("PUT /library/profile", {
        name: draft.name,
        headline: draft.headline,
        headlineDescriptor: draft.headlineDescriptor,
        email: draft.email,
        phone: draft.phone,
        location: draft.location,
        baseCity: draft.baseCity,
        baseState: draft.baseState,
        baseCountry: draft.baseCountry,
        links: draft.links,
        compTarget: draft.compTarget,
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
      title="You"
      hint="What prints at the top of every document, plus the two facts that are reasoned over rather than printed: where you work from, and what you want a role to reach."
      footer={<SaveRow onSave={save} saving={busy} dirty={dirty} saved={saved} />}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            {(f) => (
              <Input {...f} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            )}
          </Field>
          <Field label="Email" required>
            {(f) => (
              <Input {...f} value={draft.email} onChange={(e) => set("email", e.target.value)} />
            )}
          </Field>
          <Field label="Phone">
            {(f) => (
              <Input
                {...f}
                value={draft.phone ?? ""}
                onChange={(e) => set("phone", e.target.value || null)}
              />
            )}
          </Field>
          <Field
            label="Printed location"
            hint="What a reader sees. A metro area reads better on a resume than a street address."
          >
            {(f) => (
              <Input
                {...f}
                value={draft.location}
                onChange={(e) => set("location", e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Fallback role title"
            hint="Used when there is no posting to take a title from. A posting's own title must never be written back here — it would make that job ad's keywords permanently quotable."
          >
            {(f) => (
              <Input
                {...f}
                value={draft.headline}
                onChange={(e) => set("headline", e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Headline descriptor"
            hint="The constant half of the header, printed after the role title. Never posting-specific — the title already adapts."
          >
            {(f) => (
              <Input
                {...f}
                value={draft.headlineDescriptor}
                onChange={(e) => set("headlineDescriptor", e.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            Where you work from
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Reasoned over, never printed. US postings increasingly band pay by geography and the
            headline range is usually the top band, so this is what decides which band applies to
            you rather than which one is most attractive.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City">
              {(f) => (
                <Input
                  {...f}
                  value={draft.baseCity}
                  onChange={(e) => set("baseCity", e.target.value)}
                />
              )}
            </Field>
            <Field label="State or region">
              {(f) => (
                <Input
                  {...f}
                  value={draft.baseState ?? ""}
                  onChange={(e) => set("baseState", e.target.value || null)}
                />
              )}
            </Field>
            <Field label="Country">
              {(f) => (
                <Input
                  {...f}
                  value={draft.baseCountry}
                  onChange={(e) => set("baseCountry", e.target.value)}
                />
              )}
            </Field>
          </div>
        </fieldset>

        <Field
          label="Your target"
          hint="The annual figure you want a role to be able to reach. Leave it empty and the tracker stays silent about compensation rather than judging every posting against a number you never gave it."
        >
          {(f) => (
            <Input
              {...f}
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.compTarget ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = Number(raw);
                set("compTarget", raw && Number.isFinite(n) && n > 0 ? Math.round(n) : null);
              }}
              placeholder="220000"
              className="sm:w-64"
            />
          )}
        </Field>

        <LinksEditor
          links={draft.links}
          onChange={(links) => set("links", links)}
        />

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </SectionCard>
  );
}

function LinksEditor({
  links,
  onChange,
}: {
  links: Profile["links"];
  onChange: (links: Profile["links"]) => void;
}) {
  return (
    <fieldset className="rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">Links</legend>
      <p className="mb-3 text-xs text-muted-foreground">
        Rendered as plain text on a resume, never as a hyperlink on a word like “portfolio” —
        many ATS parsers strip the anchor and keep only the visible word, so a resume linking
        that word extracts with no URL in it at all.
      </p>

      <div className="space-y-3">
        {links.map((link, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label="Label" className="w-40 shrink-0">
              {(f) => (
                <Input
                  {...f}
                  value={link.label}
                  onChange={(e) =>
                    onChange(links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))
                  }
                />
              )}
            </Field>
            <Field label="URL" className="min-w-0 flex-1">
              {(f) => (
                <Input
                  {...f}
                  value={link.url}
                  onChange={(e) =>
                    onChange(links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))
                  }
                />
              )}
            </Field>
            <IconButton
              label={`Remove ${link.label || "link"}`}
              icon={<Trash2 className="h-4 w-4" />}
              variant="ghost"
              onClick={() => onChange(links.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </div>

      <div className="mt-3">
        <AddRow onAdd={() => onChange([...links, { label: "", url: "" }])} label="Add link" />
      </div>
    </fieldset>
  );
}
