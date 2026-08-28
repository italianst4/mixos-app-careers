"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/app-states";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { AddRow, SectionCard } from "@/components/ui/section-card";

import { MonthSchema, formatMonth, type Role } from "../../lib/shared/schemas";
import { client, messageOf } from "../client";

type Editing = { mode: "create" } | { mode: "edit"; role: Role };

/**
 * Employment history.
 *
 * Per-row CRUD rather than a whole-list replace, which is the shape the routes
 * take: a role carries accomplishments beneath it, so replacing the list would
 * mean deleting and recreating rows that other rows point at.
 */
export function RolesCard({
  roles,
  onSaved,
}: {
  roles: Role[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  return (
    <SectionCard
      title="Employment history"
      hint="History is fixed on a resume: every role renders on every document, in full, because dropping one to make room reads as an employment gap. Only the accomplishments beneath a role vary between applications."
    >
      {roles.length === 0 ? (
        <EmptyState
          cause="no-data"
          title="No roles yet"
          body="Every document prints this list in full, so it has to exist before anything else does. Add the positions you would put on a resume."
          action={{ label: "Add a role", onClick: () => setEditing({ mode: "create" }) }}
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {roles.map((role) => (
              <li key={role.id} className="flex items-start gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {role.title} — {role.org}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatMonth(role.startMonth)} – {formatMonth(role.endMonth)}
                    {role.location ? ` · ${role.location}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Edit ${role.title} at ${role.org}`}
                    icon={<Pencil aria-hidden className="h-4 w-4" />}
                    onClick={() => setEditing({ mode: "edit", role })}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Delete ${role.title} at ${role.org}`}
                    icon={<Trash2 aria-hidden className="h-4 w-4" />}
                    onClick={() => setDeleting(role)}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <AddRow onAdd={() => setEditing({ mode: "create" })} label="Add role" />
          </div>
        </>
      )}

      {editing && (
        <RoleDialog
          // Remount when the target changes, so the form never opens holding
          // the previous role's values.
          key={editing.mode === "edit" ? editing.role.id : "create"}
          role={editing.mode === "edit" ? editing.role : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}

      {deleting && (
        <DeleteRoleDialog
          key={deleting.id}
          role={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            onSaved();
          }}
        />
      )}
    </SectionCard>
  );
}

interface RoleErrors {
  org?: string;
  title?: string;
  startMonth?: string;
  endMonth?: string;
}

function RoleDialog({
  role,
  onClose,
  onSaved,
}: {
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [org, setOrg] = useState(role?.org ?? "");
  const [title, setTitle] = useState(role?.title ?? "");
  const [location, setLocation] = useState(role?.location ?? "");
  const [startMonth, setStartMonth] = useState(role?.startMonth ?? "");
  const [endMonth, setEndMonth] = useState(role?.endMonth ?? "");
  const [context, setContext] = useState(role?.context ?? "");

  const [errors, setErrors] = useState<RoleErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const next: RoleErrors = {};
    if (!org.trim()) next.org = "An organisation is required.";
    if (!title.trim()) next.title = "A title is required.";
    if (!MonthSchema.safeParse(startMonth).success) {
      next.startMonth = "A start month is required.";
    }
    if (endMonth && !MonthSchema.safeParse(endMonth).success) {
      next.endMonth = "Leave this empty for a role you still hold.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const input = {
      org: org.trim(),
      title: title.trim(),
      location: location.trim() || null,
      startMonth,
      // Empty means present, which the schema spells as null.
      endMonth: endMonth || null,
      context: context.trim() || null,
    };

    setSaving(true);
    setFailure(null);
    try {
      if (role) {
        await client.call("PUT /library/roles/[id]", { id: role.id, ...input });
      } else {
        await client.call("POST /library/roles", input);
      }
      onSaved();
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={role ? "Edit role" : "Add role"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={saving} busyLabel="Saving…" onClick={save}>
            {role ? "Save role" : "Add role"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Organisation" required error={errors.org}>
          {(props) => (
            <Input
              {...props}
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="Acme"
            />
          )}
        </Field>

        <Field label="Title" required error={errors.title}>
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Staff Engineer"
            />
          )}
        </Field>

        <Field label="Location">
          {(props) => (
            <Input
              {...props}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Chicago, IL"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* type="month" produces exactly the YYYY-MM the route validates,
              which is why the schema uses that shape rather than a full date. */}
          <Field label="Start month" required error={errors.startMonth}>
            {(props) => (
              <Input
                {...props}
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="End month"
            hint="Leave empty for a role you still hold. It prints as “Present”."
            error={errors.endMonth}
          >
            {(props) => (
              <Input
                {...props}
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Context" hint="One line on what the org or team was.">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Series B logistics platform, 40 engineers."
            />
          )}
        </Field>

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  onClose,
  onDeleted,
}: {
  role: Role;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setFailure(null);
    try {
      await client.call("DELETE /library/roles/[id]", { id: role.id });
      onDeleted();
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Delete role"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            busy={deleting}
            busyLabel="Deleting…"
            onClick={remove}
          >
            Delete role
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">
        Delete{" "}
        <span className="font-medium">
          {role.title} — {role.org}
        </span>
        ?
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Every accomplishment beneath this role is deleted with it. An
        accomplishment is a claim about work done in a role, so there is nothing
        to reattach it to once the role is gone.
      </p>
      {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
    </Dialog>
  );
}
