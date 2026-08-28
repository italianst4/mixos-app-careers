-- One row per job you are chasing, and one row per saved revision of each of
-- its two documents.
--
-- PDFs are not stored. They render on demand from the current revision, so
-- there is exactly one representation of a document and no way for the bytes
-- you downloaded to disagree with the text you are editing.

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  company text not null,
  role_title text not null,

  -- The posting's own URL. Metadata only — nothing fetches it. Greenhouse and
  -- Lever would fetch fine; LinkedIn and Workday block server-side requests, so
  -- a fetch would work for some postings and mysteriously fail for others.
  -- Stored so the tracker can link back to a listing months later.
  job_url text,

  jd_raw text not null,

  -- What the model read out of the posting. Null until phase 3 runs — phase 1
  -- creates an application with no model call at all, which is why this is
  -- nullable where the source had it NOT NULL.
  jd_analysis jsonb,

  -- Your own first draft of the cover letter, in your own words. Kept apart
  -- from the document revisions on purpose: revisions are a history of the
  -- artifact, this is the source the artifact was refined from, and it has to
  -- stay readable next to every later version so that "is this still what I
  -- said" is answerable at a glance.
  cover_letter_draft text not null default '',

  -- Which library entries a generated draft drew on, and the guard result from
  -- that generation. Null until phase 3, same reason as jd_analysis.
  provenance jsonb,

  -- Hand-set past 'draft'. The pipeline only ever writes 'draft'; everything
  -- after it is you recording what happened, which is the point of a tracker.
  -- 'ghosted' earns its own name: folding it into 'rejected' loses the
  -- difference between "they said no" and "nobody ever replied", and only one
  -- of those is worth a follow-up.
  status text not null default 'draft'
    check (status in ('draft', 'applied', 'screen', 'interview', 'offer', 'rejected', 'ghosted')),

  -- Where the role is based and how it is worked, as the posting frames it.
  -- Free text because "Remote (US), ~25% travel" is one fact to a reader and
  -- three columns to a schema, and nothing queries on it.
  location text,

  -- The posted range, annualised, so an hourly contract rate and a salary are
  -- the same kind of number and the column can be sorted and compared.
  comp_min integer,
  comp_max integer,

  -- ISO 4217. A number without a unit is worse than no number: 95000 is a good
  -- offer in GBP and a mediocre one in USD.
  comp_currency text
    check (comp_currency is null or char_length(comp_currency) = 3),

  -- How the range was arrived at — "single stated range", or which geographic
  -- band was used and why. A figure with no provenance is a figure you cannot
  -- act on, and geo-banded postings make it load bearing.
  comp_basis text,

  -- Verbatim, as printed. "plus equity and a performance bonus" does not fit in
  -- an integer and is often the part that decides it.
  comp_posted text,

  -- What YOU want from this role, annual, in the posting's currency. Null means
  -- "use my usual number" from profile.comp_target. Per-application because a
  -- role can be worth taking for less, and an exceptional one can be worth
  -- holding out on.
  comp_target integer,

  notes text not null default '',
  contact_name text,
  contact_email text,

  created_at timestamptz not null default now(),

  -- Set by hand when you actually submit. Null while it is still a draft.
  applied_at timestamptz,

  -- Bumped on every save and status change. The tracker sorts on it, so the
  -- thing you touched last sits on top and a search that has gone quiet for
  -- three weeks is visible as one.
  last_activity_at timestamptz not null default now()
);

create index if not exists idx_applications_user_activity
  on applications(user_id, last_activity_at desc);
create index if not exists idx_applications_user_status
  on applications(user_id, status);

-- Every save is a new row, never an update.
--
-- Append-only because the alternative — one mutable row per document — makes
-- Regenerate a destructive act on work you may have spent an hour on. The
-- highest `revision` for an (application, kind) pair is current, and every
-- earlier one stays readable. Restoring is itself an append, so even undoing an
-- undo is non-destructive.
--
-- `user_id` is denormalised onto this table because the scoped client has no
-- joins: without it, authorizing a document read means a second query for its
-- application on every path that touches one.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  user_id uuid not null,

  kind text not null check (kind in ('resume', 'cover_letter')),

  -- 1-based, per (application, kind). The highest is what renders.
  revision integer not null,

  markdown text not null,

  -- How this revision came to exist. Shown in the revision picker, because
  -- "which of these did I write" is the question you actually have when looking
  -- at a list of six.
  source text not null check (source in ('generated', 'edited', 'restored')),

  created_at timestamptz not null default now(),

  -- Makes "next revision" safe under a double-submit: the second insert
  -- collides rather than silently creating a second rev 4. The scoped client
  -- cannot express the source's `select max(revision) + 1` subquery, so the
  -- number is computed in the route and this constraint is what keeps it
  -- honest — the loser retries against the new maximum.
  unique (application_id, kind, revision)
);

create index if not exists idx_documents_current
  on documents(application_id, kind, revision desc);
