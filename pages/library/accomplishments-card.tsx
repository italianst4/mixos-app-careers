"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/app-states";
import { Badge, categoricalTone } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { AddRow, SectionCard } from "@/components/ui/section-card";

import type { Accomplishment, Role } from "../../lib/shared/schemas";
import { ACCOMPLISHMENT_SCOPES, type AccomplishmentScope } from "../../lib/shared/statuses";
import { THEMES, themeLabel, type Theme } from "../../lib/shared/themes";
import { client, messageOf } from "../client";

/**
 * The only place a factual claim enters this app.
 *
 * Everything a document asserts is selected, ordered and at most lightly
 * reworded from these rows. Which is why `metrics` carries more weight than its
 * type suggests: it is the complete set of figures a rephrase is permitted to
 * use, so an entry with no metrics is one a rephrase has no numbers for.
 */
export function AccomplishmentsCard({
  accomplishments,
  roles,
  onSaved,
}: {
  accomplishments: Accomplishment[];
  roles: Role[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<
    { mode: "create" } | { mode: "edit"; entry: Accomplishment } | null
  >(null);
  const [deleting, setDeleting] = useState<Accomplishment | null>(null);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  /** Grouped under their role, in the order the roles render (newest first). */
  const grouped = useMemo(() => {
    const groups = roles.map((role) => ({
      role,
      entries: accomplishments.filter((a) => a.roleId === role.id),
    }));
    // An entry whose role is gone is a real referential problem, not a display
    // quirk — the issues panel reports it too, and hiding it here would make
    // that report unactionable.
    const orphans = accomplishments.filter((a) => !roleById.has(a.roleId));
    return { groups: groups.filter((g) => g.entries.length > 0), orphans };
  }, [accomplishments, roleById, roles]);

  return (
    <SectionCard
      title="Accomplishments"
      hint="The only source of fact a document may draw on. Entries are selected, ordered and at most lightly reworded — never invented, and never enlarged."
    >
      {roles.length === 0 ? (
        <EmptyState
          cause="no-data"
          title="Add a role first"
          body="An accomplishment is a claim about work done in a particular role, so there is nowhere to attach one until your employment history has at least one entry."
        />
      ) : accomplishments.length === 0 ? (
        <EmptyState
          cause="no-data"
          title="Nothing to select from yet"
          body="A document is assembled by picking from these, so with none there is nothing for it to say."
          action={{ label: "Add an accomplishment", onClick: () => setEditing({ mode: "create" }) }}
        />
      ) : (
        <div className="space-y-6">
          {grouped.groups.map(({ role, entries }) => (
            <div key={role.id}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {role.title} — {role.org}
              </h4>
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => setEditing({ mode: "edit", entry })}
                    onDelete={() => setDeleting(entry)}
                  />
                ))}
              </ul>
            </div>
          ))}

          {grouped.orphans.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
                No matching role
              </h4>
              <p className="mb-2 text-xs text-muted-foreground">
                These point at a role that no longer exists. Edit each one to reattach it, or
                delete it.
              </p>
              <ul className="space-y-2">
                {grouped.orphans.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => setEditing({ mode: "edit", entry })}
                    onDelete={() => setDeleting(entry)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {roles.length > 0 && (
        <div className="mt-4">
          <AddRow onAdd={() => setEditing({ mode: "create" })} label="Add accomplishment" />
        </div>
      )}

      {editing && (
        <EntryDialog
          roles={roles}
          entry={editing.mode === "edit" ? editing.entry : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          entry={deleting}
          onClose={() => setDeleting(null)}
          onSaved={() => {
            setDeleting(null);
            onSaved();
          }}
        />
      )}
    </SectionCard>
  );
}

function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: Accomplishment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-card-foreground">{entry.claim}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {entry.themes.map((theme) => (
            // Themes DISTINGUISH; they do not grade. The categorical ramp keyed
            // by position is what keeps a theme the same colour everywhere
            // without any of them reading as an error.
            <Badge key={theme} tone={categoricalTone(THEMES.indexOf(theme))}>
              {themeLabel(theme)}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            {entry.metrics.length} figure{entry.metrics.length === 1 ? "" : "s"}
            {entry.tech.length > 0 && ` · ${entry.tech.length} tech`}
            {!entry.evidence.trim() && " · no evidence note"}
          </span>
        </div>
      </div>
      <IconButton
        label={`Edit "${entry.claim.slice(0, 40)}"`}
        icon={<Pencil className="h-4 w-4" />}
        variant="ghost"
        size="sm"
        onClick={onEdit}
      />
      <IconButton
        label={`Delete "${entry.claim.slice(0, 40)}"`}
        icon={<Trash2 className="h-4 w-4" />}
        variant="ghost"
        size="sm"
        onClick={onDelete}
      />
    </li>
  );
}

interface DraftState {
  roleId: string;
  claim: string;
  how: string;
  metrics: string[];
  tech: string[];
  themes: Theme[];
  evidence: string;
  scope: AccomplishmentScope;
  hasCaseStudy: boolean;
  situation: string;
  action: string;
  result: string;
}

function toDraft(entry: Accomplishment | null, roles: Role[]): DraftState {
  return {
    roleId: entry?.roleId ?? roles[0]?.id ?? "",
    claim: entry?.claim ?? "",
    how: entry?.how ?? "",
    metrics: entry?.metrics ?? [],
    tech: entry?.tech ?? [],
    themes: entry?.themes ?? [],
    evidence: entry?.evidence ?? "",
    scope: entry?.scope ?? "resume",
    hasCaseStudy: entry?.caseStudy != null,
    situation: entry?.caseStudy?.situation ?? "",
    action: entry?.caseStudy?.action ?? "",
    result: entry?.caseStudy?.result ?? "",
  };
}

function EntryDialog({
  entry,
  roles,
  onClose,
  onSaved,
}: {
  entry: Accomplishment | null;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<DraftState>(() => toDraft(entry, roles));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  const caseStudyIncomplete =
    d.hasCaseStudy && !(d.situation.trim() && d.action.trim() && d.result.trim());
  const ready = d.roleId && d.claim.trim() && !caseStudyIncomplete;

  async function submit() {
    setBusy(true);
    setFailure(null);
    const payload = {
      roleId: d.roleId,
      claim: d.claim,
      how: d.how.trim() || null,
      metrics: d.metrics.map((m) => m.trim()).filter(Boolean),
      tech: d.tech.map((t) => t.trim()).filter(Boolean),
      themes: d.themes,
      evidence: d.evidence,
      scope: d.scope,
      caseStudy: d.hasCaseStudy
        ? { situation: d.situation, action: d.action, result: d.result }
        : null,
    };
    try {
      if (entry) {
        await client.call("PUT /library/accomplishments/[id]", { id: entry.id, ...payload });
      } else {
        await client.call("POST /library/accomplishments", payload);
      }
      onSaved();
    } catch (err) {
      setFailure(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? "Edit accomplishment" : "Add accomplishment"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!ready}
            busy={busy}
            busyLabel="Saving…"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role" required>
          {(f) => (
            <Select
              {...f}
              value={d.roleId}
              onChange={(e) => set("roleId", e.target.value)}
              options={roles.map((r) => ({ label: `${r.title} — ${r.org}`, value: r.id }))}
            />
          )}
        </Field>

        <Field
          label="Claim"
          required
          hint="One sentence, past tense, outcome first. “Cut enterprise onboarding from 6 weeks to 9 days”, not “Responsible for improving onboarding”."
        >
          {(f) => (
            <Textarea
              {...f}
              rows={2}
              value={d.claim}
              onChange={(e) => set("claim", e.target.value)}
            />
          )}
        </Field>

        <Field
          label="How"
          hint="The mechanism. Not printed directly, but it is part of the source text a rephrase is checked against, so a claim can be reworded using detail that lives only here."
        >
          {(f) => (
            <Textarea {...f} rows={3} value={d.how} onChange={(e) => set("how", e.target.value)} />
          )}
        </Field>

        <StringList
          label="Figures"
          hint="Verbatim and verifiable — and the only numbers a rephrase is allowed to use. Write them exactly as you would defend them."
          placeholder="97 clients"
          values={d.metrics}
          onChange={(v) => set("metrics", v)}
        />

        <StringList
          label="Technology"
          hint="Named tools and systems this entry can legitimately claim."
          placeholder="TypeScript"
          values={d.tech}
          onChange={(v) => set("tech", v)}
        />

        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Themes</legend>
          <p className="mb-3 text-xs text-muted-foreground">
            What this entry is ranked against when a posting arrives. An entry with no themes has
            nothing to match on.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {THEMES.map((theme) => (
              <Checkbox
                key={theme}
                label={themeLabel(theme)}
                checked={d.themes.includes(theme)}
                onChange={(e) =>
                  set(
                    "themes",
                    e.target.checked
                      ? [...d.themes, theme]
                      : d.themes.filter((t) => t !== theme),
                  )
                }
              />
            ))}
          </div>
        </fieldset>

        <Field
          label="Evidence"
          hint="Private, and never rendered anywhere. A deck, a dashboard, a commit, someone who would vouch. It blocks nothing — it exists so you confront, while writing, whether you could prove this in a room."
        >
          {(f) => (
            <Textarea
              {...f}
              rows={2}
              value={d.evidence}
              onChange={(e) => set("evidence", e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Scope"
          hint="“page” refers to a landing page that no longer exists, so only “resume” and “both” render today. It is kept so an entry marked page-only stays marked."
        >
          {(f) => (
            <Select
              {...f}
              value={d.scope}
              onChange={(e) => set("scope", e.target.value as AccomplishmentScope)}
              options={ACCOMPLISHMENT_SCOPES.map((s) => ({ label: s, value: s }))}
              className="sm:w-48"
            />
          )}
        </Field>

        <div className="rounded-md border border-border p-4">
          <Checkbox
            label="Add a case study"
            hint="An entry written out as situation, action and result is one you have already worked out how to tell as a story — which is what a cover letter needs."
            checked={d.hasCaseStudy}
            onChange={(e) => set("hasCaseStudy", e.target.checked)}
          />
          {d.hasCaseStudy && (
            <div className="mt-4 space-y-3">
              <Field label="Situation">
                {(f) => (
                  <Textarea
                    {...f}
                    rows={2}
                    value={d.situation}
                    onChange={(e) => set("situation", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Action">
                {(f) => (
                  <Textarea
                    {...f}
                    rows={2}
                    value={d.action}
                    onChange={(e) => set("action", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Result">
                {(f) => (
                  <Textarea
                    {...f}
                    rows={2}
                    value={d.result}
                    onChange={(e) => set("result", e.target.value)}
                  />
                )}
              </Field>
              {caseStudyIncomplete && (
                <p className="text-xs text-warning">
                  All three parts are needed, or the case study is half a story. Clear the
                  checkbox to leave it out entirely.
                </p>
              )}
            </div>
          )}
        </div>

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </Dialog>
  );
}

function StringList({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">{label}</legend>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <div className="space-y-2">
        {values.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`${label} ${i + 1}`}
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <IconButton
              label={`Remove ${label} ${i + 1}`}
              icon={<Trash2 className="h-4 w-4" />}
              variant="ghost"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <AddRow onAdd={() => onChange([...values, ""])} label={`Add ${label.toLowerCase()}`} />
      </div>
    </fieldset>
  );
}

function DeleteDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: Accomplishment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      await client.call("DELETE /library/accomplishments/[id]", { id: entry.id });
      onSaved();
    } catch (err) {
      setFailure(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete this accomplishment?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} busy={busy} busyLabel="Deleting…">
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">{entry.claim}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Documents you have already generated keep whatever text they were assembled with. This
        only changes what a future draft can draw on.
      </p>
      {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
    </Dialog>
  );
}
