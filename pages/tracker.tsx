"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/app-states";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";

import {
  COMMON_CURRENCIES,
  compVerdict,
  effectiveTarget,
  formatCompRange,
} from "../lib/shared/comp";
import {
  APPLICATION_STATUSES,
  isClosed,
  statusLabel,
  statusTone,
  type ApplicationStatus,
} from "../lib/shared/statuses";
import { MIN_POSTING_CHARS, type ApplicationSummary } from "../lib/shared/schemas";
import { displayHost } from "../lib/shared/url";
import { client, messageOf } from "./client";

interface Props {
  applications: ApplicationSummary[];
  profileCompTarget: number | null;
  blockingIssues: number;
  /**
   * Application id to days quiet, for the open rows that have gone quiet.
   * Decided on the server: staleness reads the clock, and two clocks rendering
   * the same list is a hydration mismatch waiting to happen.
   */
  quietDays: Record<string, number>;
}

export function Tracker({
  applications,
  profileCompTarget,
  blockingIssues,
  quietDays,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApplicationSummary | null>(null);
  const [deleting, setDeleting] = useState<ApplicationSummary | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // An absent param means "all" and has to stay distinguishable from an
  // explicit choice — otherwise "show me everything" and "I have not chosen"
  // become the same URL and the Back button stops meaning anything.
  const statusFilter = params.get("status");

  const setStatusFilter = useCallback(
    (next: string) => {
      const query = new URLSearchParams(params.toString());
      if (next) query.set("status", next);
      else query.delete("status");
      const qs = query.toString();
      router.replace(qs ? `/apps/careers?${qs}` : "/apps/careers");
    },
    [params, router],
  );

  const filtered = useMemo(
    () => (statusFilter ? applications.filter((a) => a.status === statusFilter) : applications),
    [applications, statusFilter],
  );

  const open = useMemo(() => filtered.filter((a) => !isClosed(a.status)), [filtered]);
  const closed = useMemo(() => filtered.filter((a) => isClosed(a.status)), [filtered]);

  const changeStatus = useCallback(
    async (row: ApplicationSummary, status: ApplicationStatus) => {
      setBusyRow(row.id);
      setRowError(null);
      try {
        await client.call("PATCH /applications/[id]", { id: row.id, status });
        router.refresh();
      } catch (err) {
        setRowError(messageOf(err));
      } finally {
        setBusyRow(null);
      }
    },
    [router],
  );

  const columns: Column<ApplicationSummary>[] = useMemo(
    () => [
      {
        key: "company",
        header: "Company",
        cell: (row) => {
          const quiet = quietDays[row.id];
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.company}</p>
              <p className="truncate text-xs text-muted-foreground">{row.roleTitle}</p>
              {quiet !== undefined && (
                <p className="mt-0.5 text-xs text-warning">
                  Quiet for {quiet} days — worth a follow-up.
                </p>
              )}
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
            <Select
              aria-label={`Status for ${row.company}`}
              value={row.status}
              disabled={busyRow === row.id}
              onChange={(e) => changeStatus(row, e.target.value as ApplicationStatus)}
              options={APPLICATION_STATUSES.map((s) => ({ label: statusLabel(s), value: s }))}
              className="h-8 w-32 text-xs"
            />
          </div>
        ),
      },
      {
        key: "comp",
        header: "Compensation",
        cell: (row) => {
          const range = formatCompRange(row.compMin, row.compMax, row.compCurrency ?? "USD");
          if (!range) {
            return <span className="text-xs text-muted-foreground">Not stated</span>;
          }
          const verdict = compVerdict(
            row.compMax,
            effectiveTarget(row.compTarget, profileCompTarget),
            row.compCurrency ?? "USD",
          );
          return (
            <div className="min-w-0">
              <p className="font-mono text-xs text-foreground">{range}</p>
              {/*
                `clears === false` only. A null verdict means one side is
                unknown — a posting that printed no range has not failed your
                bar, and showing it as short would be a claim the data does not
                support.
              */}
              {verdict.clears === false && verdict.label && (
                <p className="mt-0.5 text-xs text-warning">{verdict.label}</p>
              )}
            </div>
          );
        },
      },
      {
        key: "applied",
        header: "Applied",
        cell: (row) =>
          row.appliedAt ? (
            <span className="text-xs text-foreground">
              {new Date(row.appliedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not applied</span>
          ),
      },
      {
        key: "source",
        header: "Source",
        cell: (row) => {
          const host = displayHost(row.jobUrl);
          if (!host || !row.jobUrl) return null;
          return (
            <a
              href={row.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {host}
            </a>
          );
        },
      },
      {
        key: "actions",
        header: "",
        align: "right",
        cell: (row) => (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              label={`Edit ${row.company}`}
              icon={<Pencil className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={() => setEditing(row)}
            />
            <IconButton
              label={`Delete ${row.company}`}
              icon={<Trash2 className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={() => setDeleting(row)}
            />
          </div>
        ),
      },
    ],
    [busyRow, changeStatus, profileCompTarget, quietDays],
  );

  const nothingAtAll = applications.length === 0;
  const filterMatchedNothing = !nothingAtAll && filtered.length === 0;

  return (
    <div className="mt-6 space-y-6">
      {blockingIssues > 0 && (
        <Card>
          <CardHeader
            title={
              <>
                <span className="text-destructive">{blockingIssues}</span> thing
                {blockingIssues === 1 ? "" : "s"} in your library would print blank
              </>
            }
          />
          <CardBody divided>
            <p className="text-sm text-muted-foreground">
              A document assembled now would have a gap where these belong.{" "}
              <Link
                href="/apps/careers/library"
                className="text-foreground underline underline-offset-2"
              >
                Fix them in the library
              </Link>
              .
            </p>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Status" className="w-48">
          {(field) => (
            <Select
              {...field}
              value={statusFilter ?? ""}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { label: "All", value: "" },
                ...APPLICATION_STATUSES.map((s) => ({ label: statusLabel(s), value: s })),
              ]}
            />
          )}
        </Field>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New application
        </Button>
      </div>

      {rowError && <p className="text-sm text-destructive">{rowError}</p>}

      {nothingAtAll ? (
        <EmptyState
          cause="no-data"
          title="Nothing tracked yet"
          body="Paste a job posting and it becomes the first application here, with whatever the posting states about pay read out of it."
          action={{ label: "New application", onClick: () => setCreating(true) }}
        />
      ) : filterMatchedNothing ? (
        <EmptyState
          cause="no-filter"
          title={`No ${statusFilter} applications`}
          body="Nothing you are tracking is at that stage right now."
          action={{ label: "Show all", onClick: () => setStatusFilter("") }}
        />
      ) : (
        <div className="space-y-8">
          {open.length > 0 ? (
            <DataTable
              rows={open}
              columns={columns}
              rowKey={(row) => row.id}
              caption="Open applications"
            />
          ) : (
            <EmptyState
              cause="no-data"
              title="Nothing open"
              body="Everything you are tracking is closed out. Paste a posting to start another."
              action={{ label: "New application", onClick: () => setCreating(true) }}
            />
          )}

          {closed.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Closed ({closed.length})
              </h2>
              <DataTable
                rows={closed}
                columns={columns}
                rowKey={(row) => row.id}
                caption="Closed applications"
              />
            </div>
          )}
        </div>
      )}

      {creating && <NewApplicationDialog onClose={() => setCreating(false)} />}
      {editing && (
        <EditApplicationDialog application={editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeleteDialog application={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

/**
 * Starting one.
 *
 * Pasting rather than fetching is deliberate and is not a missing feature.
 * Greenhouse and Lever pages fetch fine; LinkedIn and Workday block
 * server-side requests, so a URL field that fetched would work for some
 * postings and mysteriously fail for others.
 */
function NewApplicationDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [compPosted, setCompPosted] = useState("");
  const [jobPosting, setJobPosting] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const short = jobPosting.trim().length < MIN_POSTING_CHARS;
  const ready = company.trim() && roleTitle.trim() && !short;

  async function submit() {
    setBusy(true);
    setFailure(null);
    try {
      await client.call("POST /applications", {
        jobPosting,
        company,
        roleTitle,
        jobUrl: jobUrl.trim() || null,
        location: location.trim() || null,
        compPosted: compPosted.trim() || null,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setFailure(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New application"
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
            Start tracking
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company" required>
            {(field) => (
              <Input
                {...field}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label="Role title" required>
            {(field) => (
              <Input
                {...field}
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          label="Job URL"
          hint="Stored so you can reopen the listing later. Nothing fetches it — postings get taken down, and the tracker is more useful with a dead link in it than with nothing."
        >
          {(field) => (
            <Input
              {...field}
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://jobs.example.com/senior-solutions-architect"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" hint="As the posting frames it: “Remote (US), ~25% travel”.">
            {(field) => (
              <Input
                {...field}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Posted compensation"
            hint="Verbatim, as printed. The range is read out of it; the words around it are kept, because “plus equity” is often the part that decides it."
          >
            {(field) => (
              <Input
                {...field}
                value={compPosted}
                onChange={(e) => setCompPosted(e.target.value)}
                placeholder="$195,000 – $206,000 plus equity"
              />
            )}
          </Field>
        </div>

        <Field
          label="Posting text"
          required
          hint="Pasting is deliberate: Greenhouse and Lever fetch fine, but LinkedIn and Workday block server-side fetching, so a fetch would work for some postings and mysteriously fail for others."
        >
          {(field) => (
            <Textarea
              {...field}
              rows={14}
              value={jobPosting}
              onChange={(e) => setJobPosting(e.target.value)}
              placeholder="Paste the full job posting here…"
              className="font-mono text-xs"
            />
          )}
        </Field>

        {short && jobPosting.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {jobPosting.trim().length} of {MIN_POSTING_CHARS} characters. Below that there is
            not enough of a posting to be worth re-reading three weeks from now.
          </p>
        )}

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </Dialog>
  );
}

function DeleteDialog({
  application,
  onClose,
}: {
  application: ApplicationSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      await client.call("DELETE /applications/[id]", { id: application.id });
      router.refresh();
      onClose();
    } catch (err) {
      setFailure(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Stop tracking this application?"
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
      <p className="text-sm text-foreground">
        Delete{" "}
        <span className="font-medium">
          {application.company} — {application.roleTitle}
        </span>
        ?
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        The posting text and every saved revision of its documents go with it. Your career
        library is untouched.
      </p>
      {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
    </Dialog>
  );
}

/**
 * Correcting what the tracker holds.
 *
 * Every one of these is a field a posting either got wrong or never stated.
 * Titles in particular are mangled often enough that correcting one is routine,
 * which is why the re-derivation rules elsewhere only ever fill a blank: once
 * you have typed something here, nothing overwrites it.
 */
function EditApplicationDialog({
  application,
  onClose,
}: {
  application: ApplicationSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState({
    company: application.company,
    roleTitle: application.roleTitle,
    location: application.location ?? "",
    jobUrl: application.jobUrl ?? "",
    compPosted: application.compPosted ?? "",
    compMin: application.compMin === null ? "" : String(application.compMin),
    compMax: application.compMax === null ? "" : String(application.compMax),
    compCurrency: application.compCurrency ?? "",
    compTarget: application.compTarget === null ? "" : String(application.compTarget),
    contactName: application.contactName ?? "",
    contactEmail: application.contactEmail ?? "",
    // <input type="date"> speaks YYYY-MM-DD; the column is a timestamptz.
    appliedAt: application.appliedAt ? application.appliedAt.slice(0, 10) : "",
    notes: application.notes,
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function set<K extends keyof typeof d>(key: K, value: string) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  const money = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  async function submit() {
    setBusy(true);
    setFailure(null);
    try {
      await client.call("PATCH /applications/[id]", {
        id: application.id,
        company: d.company,
        roleTitle: d.roleTitle,
        location: d.location.trim() || null,
        jobUrl: d.jobUrl.trim() || null,
        compPosted: d.compPosted.trim() || null,
        compMin: money(d.compMin),
        compMax: money(d.compMax),
        compCurrency: d.compCurrency.trim() ? d.compCurrency.trim().toUpperCase() : null,
        compTarget: money(d.compTarget),
        contactName: d.contactName.trim() || null,
        contactEmail: d.contactEmail.trim() || null,
        // Midday UTC, so the date a reader sees is the date they picked no
        // matter which side of UTC they are on.
        appliedAt: d.appliedAt ? new Date(`${d.appliedAt}T12:00:00Z`).toISOString() : null,
        notes: d.notes,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setFailure(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${application.company} — ${application.roleTitle}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!d.company.trim() || !d.roleTitle.trim()}
            busy={busy}
            busyLabel="Saving…"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company" required>
            {(f) => (
              <Input {...f} value={d.company} onChange={(e) => set("company", e.target.value)} />
            )}
          </Field>
          <Field
            label="Role title"
            required
            hint="Postings mangle their own titles often enough that correcting one is routine."
          >
            {(f) => (
              <Input
                {...f}
                value={d.roleTitle}
                onChange={(e) => set("roleTitle", e.target.value)}
              />
            )}
          </Field>
          <Field label="Location">
            {(f) => (
              <Input {...f} value={d.location} onChange={(e) => set("location", e.target.value)} />
            )}
          </Field>
          <Field label="Job URL">
            {(f) => (
              <Input {...f} value={d.jobUrl} onChange={(e) => set("jobUrl", e.target.value)} />
            )}
          </Field>
        </div>

        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Compensation</legend>
          {application.compBasis && (
            <p className="mb-3 text-xs text-muted-foreground">{application.compBasis}</p>
          )}
          <div className="space-y-4">
            <Field
              label="As printed"
              hint="Verbatim. Kept alongside the numbers because “plus equity and a performance bonus” does not fit in an integer and is often the part that decides it."
            >
              {(f) => (
                <Input
                  {...f}
                  value={d.compPosted}
                  onChange={(e) => set("compPosted", e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Minimum" hint="Annualised.">
                {(f) => (
                  <Input
                    {...f}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={d.compMin}
                    onChange={(e) => set("compMin", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Maximum" hint="Measured against your target.">
                {(f) => (
                  <Input
                    {...f}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={d.compMax}
                    onChange={(e) => set("compMax", e.target.value)}
                  />
                )}
              </Field>
              <Field label="Currency" hint="A number without a unit is worse than no number.">
                {(f) => (
                  <Select
                    {...f}
                    value={d.compCurrency}
                    onChange={(e) => set("compCurrency", e.target.value)}
                    options={[
                      { label: "—", value: "" },
                      ...COMMON_CURRENCIES.map((c) => ({ label: c, value: c })),
                    ]}
                  />
                )}
              </Field>
            </div>
            <Field
              label="Target for this role"
              hint="Overrides your usual number, both ways: a role can be worth taking for less, and an exceptional one can be worth holding out on. Empty means use your usual target."
            >
              {(f) => (
                <Input
                  {...f}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={d.compTarget}
                  onChange={(e) => set("compTarget", e.target.value)}
                  className="sm:w-64"
                />
              )}
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact name">
            {(f) => (
              <Input
                {...f}
                value={d.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            )}
          </Field>
          <Field label="Contact email">
            {(f) => (
              <Input
                {...f}
                value={d.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            )}
          </Field>
          <Field label="Applied on" hint="Stamped for you the first time you set the status to applied.">
            {(f) => (
              <Input
                {...f}
                type="date"
                value={d.appliedAt}
                onChange={(e) => set("appliedAt", e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Notes">
          {(f) => (
            <Textarea
              {...f}
              rows={5}
              value={d.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          )}
        </Field>

        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    </Dialog>
  );
}
