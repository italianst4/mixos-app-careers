-- The career library: the single source of truth for every factual claim this
-- app can make. Nothing generated — a resume bullet, a cover letter paragraph —
-- originates anywhere else.
--
-- The pipeline may SELECT, ORDER and lightly REPHRASE these entries. It may
-- never invent one.

-- A position held. Employment history is FIXED — every role renders on every
-- resume, in full. Dropping one to make room reads as an employment gap. Only
-- the accomplishments beneath a role vary between applications.
--
-- `start_month` / `end_month` are real dates. The source stored 'YYYY-MM'
-- strings with 'present' as a sentinel; a null end_month says the same thing
-- without a magic value, and makes "newest first" an ORDER BY.
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org text not null,
  title text not null,
  location text,
  start_month date not null,
  end_month date,
  -- One line of context for what the org or team was. Optional on the resume.
  context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roles_user on roles(user_id, start_month desc);

-- One verified accomplishment. Every field except `evidence` may reach a
-- reader, so they are written the way you would say them in an interview.
create table if not exists accomplishments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_id uuid not null references roles(id) on delete cascade,

  -- The headline: one sentence, past tense, outcome first.
  claim text not null,

  -- The mechanism. Not printed directly, but part of the source text a
  -- rephrase is checked against, so a claim can be reworded using detail that
  -- lives only here.
  how text,

  -- Verbatim, verifiable figures — the guardrail the fabrication check runs
  -- against. A number in a rephrase that does not appear here is rejected.
  metrics jsonb not null default '[]'::jsonb,

  tech jsonb not null default '[]'::jsonb,

  -- Keys from lib/shared/themes.ts. Validated in the route rather than by a
  -- CHECK, so adding a theme does not need a migration.
  themes jsonb not null default '[]'::jsonb,

  -- PRIVATE. Where you can prove this — a deck, a dashboard, a commit, someone
  -- who would vouch. Never rendered anywhere. Its purpose is to make you
  -- confront, while writing, whether the claim is actually defensible.
  evidence text not null default '',

  -- Where this entry may appear. 'page' refers to a landing page the source
  -- deleted; nothing renders those today, and the value is kept so an entry
  -- marked page-only stays marked.
  scope text not null default 'resume'
    check (scope in ('resume', 'page', 'both')),

  -- { situation, action, result }. Nothing renders it, but the letter drafter
  -- is told which entries have one: an entry written out as situation/action/
  -- result is one you have already worked out how to tell as a story.
  case_study jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accomplishments_user on accomplishments(user_id);
create index if not exists idx_accomplishments_role on accomplishments(role_id);

create table if not exists skill_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  label text not null,
  items jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_skill_groups_user on skill_groups(user_id, sort_order);

create table if not exists education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  institution text not null,
  credential text not null,
  -- Free text: "2004", "expected 2027". Not a number, and never sorted on.
  year_label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_education_user on education(user_id, sort_order);

-- A stated belief about how the work should be done.
--
-- Rendered verbatim, never rephrased, never summarized, never merged. An
-- aphorism survives exactly one wording, and a model asked to adapt one returns
-- a sentence that means roughly the same thing and lands like nothing at all.
-- The table ships now; its editor and its only reader arrive with the letter
-- drafter in phase 3.
create table if not exists philosophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  body text not null,
  -- One or two sentences on what it looks like in practice.
  elaboration text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_philosophies_user on philosophies(user_id, sort_order);

-- The qualification checklist a recruiter works through before scheduling.
--
-- The source had no reader for these either — the page that showed them was
-- deleted (README, "Not built yet"). The table ships so the data has somewhere
-- to live if a screener surface is ever built; nothing in phase 1 reads it.
create table if not exists screener_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question text not null,
  answer text not null,
  detail text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_screener_answers_user on screener_answers(user_id, sort_order);
