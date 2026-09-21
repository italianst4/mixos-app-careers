# Convert `project-career` → MixOS app `career`

**Status:** Phase 1 planned, awaiting approval. No app code written.
**Source:** `/Users/amontalbano/git/project-career` (read in place, never modified).

---

## Context

`project-career` is a private, single-user Next.js 16 tool that turns a pasted job
posting into two documents — an ATS-safe resume and a short cover letter — which you
then edit as Markdown, export as PDFs, and track through to an outcome. Roughly
13,700 lines across 60 source files.

Its one load-bearing design decision: **the model never writes a claim.** A
hand-authored career library (`lib/career/`, 39 accomplishments across 9 roles) is
the only source of fact; the pipeline retrieves, ranks and lightly rephrases, and
every rephrase is verified against its source entry before a human sees it. That
guarantee, and the two-tier guard that enforces it, is the thing the conversion has
to carry over intact. Everything else is scaffolding.

**Provenance and license.** Written by Anthony Montalbano (`amontalbano@gmail.com`),
`github.com/italianst4/project-career`, last commit `b38fe3d`. **No LICENSE file** —
but it is the same author converting their own work into their own platform, so
there is no third-party licensing question to resolve.

**Secrets scan.** `.env.local` exists and holds live-looking values
(`ANTHROPIC_API_KEY` 108 chars, `DATABASE_URL`, `ADMIN_PASSWORD_HASH`,
`AUTH_SECRET`). It is **untracked and covered by `.gitignore` (`.env*`)**, so nothing
leaked and nothing needs rotating on account of this conversion. No secret value is
reproduced anywhere in this repo — only setting *names* appear below. `.import/`
holds personal source documents and is likewise gitignored.

**Why convert.** The tool solves a real problem and currently runs as a standalone
deployment with its own auth, its own database, its own hosting. On MixOS it gets
session auth, a scoped database, the design system and multi-user grants for free,
and it becomes the first real app on this platform.

---

## Decisions

### Slug and name

- **Slug `career`** (folder `apps/career`, served at `/apps/career`). Matches the
  source's own `lib/career/` naming and covers both halves of the app — the durable
  library and the per-posting tracker.
- **Name "Career"**, icon `briefcase` (Lucide).

### One app, not several

One app. The library and the tracker are two screens over one domain that share the
guard corpus, the profile and the seed generator — splitting them would put an App
Services broker hop in the middle of the fabrication check. The source's own split
(`lib/career/` vs Postgres) is a storage boundary, not a domain boundary.

### Per-user ownership (locked with the user)

The source is emphatically single-user — `lib/auth.ts:9` "There is exactly one
account", and `lib/career/overrides.ts:36` says the mutable singleton "is NOT safe
for: multiple tenants… If this ever served two people it would need to be torn out."
MixOS is multi-user.

**Every row carries `user_id` from `context.user.id`.** Each user granted the app
gets their own career library, their own applications, their own documents. This is
ordinary domain ownership, not a tenancy column — the MixOS deployment is the tenant
and there is no `org_id` anywhere.

The consequence that matters: **the entire file-default/override layer is deleted.**
`lib/career/hydrate.ts`, `lib/career/overrides.ts`, `fileDefaults()`,
`libraryVersion()`, `EDITABLE_PROFILE_FIELDS`, `applyOverrides()` and the
`library_overrides` table all exist to layer a database over TypeScript constants.
With the library database-native there is nothing to layer over: the database *is*
the library. The README's own "The failure mode this design has" section — 75
synchronous reads of a process-wide mutable singleton, and routes that silently
serve file values when they forget to hydrate — stops being expressible.

The cost is real and named under **Not converted**: "revert this field to what the
file says" has no meaning any more, and the library editor grows from an
evidence-and-summary field editor into full CRUD over accomplishments, roles, skills
and education.

### Model access: an `anthropic` connector (locked with the user)

The pipeline calls the Anthropic API with an API key. Per `apps/AGENTS.md` #12 and
the `/mixos convert` mapping table, a credentialed outbound integration is a
**connector**, not `context.http` + `env`. `ls connectors/` shows only `_template`
and `_template-oauth` — **no `anthropic` connector exists.**

It is a **blocking dependency for phase 3** and is deliberately **not built here**: a
connector is shared, tenant-scoped and security-sensitive, and deserves its own plan
and review. Run `/mixos connector create anthropic` before phase 3.

The alternative (`env: ANTHROPIC_API_KEY` + `egress: api.anthropic.com` +
`context.http`) is legal and was considered. Rejected because it re-hand-rolls the
SDK's structured-output (`output_config.format`) and prompt-cache handling over raw
HTTP, and the next AI app on this platform repeats the work.

### PDF: add `@react-pdf/renderer` to the root `package.json` (locked with the user)

Apps share the root dependency set — there is no per-app `package.json`. The platform
has neither `@react-pdf/renderer` nor `unpdf`. Adding the renderer is a
platform-wide change, taken deliberately because **the length measurement depends on
it**: the source measures length by rendering and reading page counts off the bytes
(`lib/pdf/render.ts:48`, `:109`), not by counting words, and the README argues at
length that word counting measures the wrong thing. Dropping the renderer would
silently downgrade the feature the README defends hardest.

`unpdf` is **not** added — it exists only inside `npm run check:ats`, which does not
come over (see **Not converted**).

### No app roles

The source has exactly one role: `admin`, meaning "holds the password"
(`lib/auth.ts:28`, `proxy.ts:12`). That maps entirely onto the platform session plus
per-user ownership. Declaring a single role every user receives would be noise, so
`app.json` declares no `roles` and no `defaultRole` — `roles.md` explicitly says to
omit them for apps with no permission tiers. Authorization is `user_id = context.user.id`
on every query, enforced in the route handler.

### One widget (a deliberate addition, not a parity row)

The source has no dashboard and therefore no widgets. The tracker's own header line
(`app/admin/page.tsx:48` — "3 open · 12 closed") and its staleness nudge
(`:160` — "Quiet for N days — worth a follow-up") are exactly the standalone,
glanceable facts a dashboard tile is for. Phase 1 ships **one** widget,
`application-pipeline`, reading a dedicated lightweight `GET /summary` route. Flagged
here as an addition so it is not mistaken for something the source had.

### Phase slicing

Three phases, sequenced so **phase 1 depends on nothing that does not exist yet**.

| Phase | Contents | Blocked on |
| --- | --- | --- |
| **1 — build now** | Complete data model (all three phases' tables). Manifest. Career library editor. Application tracker. Comp arithmetic. One widget. | Nothing |
| **2** | Application editor: Markdown documents, append-only revisions, restore, the Markdown parser + subset warnings, the tier-2 fabrication guard, the deterministic seed assembler, PDF export, render-based length measurement. | `@react-pdf/renderer` in root `package.json` |
| **3** | The AI pipeline: analyze-jd, select-bullets, draft-cover-letter, refine, regenerate, tier-1 guards, provenance, compensation extraction and geographic banding. | `anthropic` connector + the `budget.ms` problem below |

Phase 1 is a walking skeleton, not a random subset: the library is what everything
else reads from (the README's own "Before anything works, fill in `lib/career/`"),
and the tracker is the screen with the most traffic. Together they are usable on day
one — author your library, log applications, compare posted comp against your target,
see what has gone quiet.

### Data: schema only

**Moving your existing library is out of scope for this command**, per `/mixos convert`
§1.7. Your 39 accomplishments, 9 roles, 6 skill groups, 5 philosophies and profile
live in TypeScript files in the source repo. They are *your personal data* — your
email, your phone, and 39 private `evidence` notes — and they do not belong in a
migration seed in a shared platform repo.

What moving them would involve: ~900 lines of `lib/career/accomplishments.ts` plus
`roles.ts`, `skills.ts`, `profile.ts`, `philosophy.ts`; no ordering constraints
beyond `accomplishments.role_id → roles.id`; heavily PII-bearing. See
**Dependencies & gaps** for the suggested route (a paste-JSON import), which is a
*feature decision for you*, not something this command should assume.

### Type honesty, fixed while translating

| Source | Becomes | Why |
| --- | --- | --- |
| `status varchar(16)` (`schema.ts:74`) | `text` + `CHECK` | A varchar holding a 7-value enum. Same for `kind`, `source`, `scope`, `comp_currency`. |
| `Role.start` / `.end` — `'YYYY-MM'` strings, `'present'` as a sentinel (`types.ts:60`) | `start_month date`, `end_month date NULL` (NULL = present) | A string holding a date, and a magic value holding a null. Fixing it makes `rolesNewestFirst()` an `ORDER BY`. |
| `library_overrides.value jsonb` — "one shape per key, validated on read" (`schema.ts:213`) | **Deleted.** Each value gets its own typed column. | A jsonb column whose shape depended on a sibling column's value. |
| `Accomplishment.metrics/tech/themes` — TS arrays, never stored | `jsonb` arrays | First time they have storage; jsonb rather than `text[]` because the scoped client is PostgREST. |
| `jd_analysis` / `provenance` `NOT NULL` (`schema.ts:47`, `:66`) | nullable | Phase 1 creates applications with no model run. Flagged as a behaviour change. |
| `compTarget` in `library_overrides` under a `preference` scope (`preferences.ts:12`) | `profile.comp_target integer` | The source itself calls this a hack: "a separate table for one row is a migration nobody needed". With a per-user profile row it is just a column. |

Dropped outright: `org_id`-style tenancy (none existed), `user_password_hash`,
`session_token` (never existed as columns — the source stores no user at all).

---

## Structure

### `apps/career/app.json` (phase 1)

```json
{
  "name": "Career",
  "description": "An ATS-safe resume and cover letter for each posting, grounded in a career library you author, tracked through to an outcome.",
  "icon": "briefcase",
  "authors": [{ "name": "Anthony Montalbano", "email": "amontalbano@gmail.com" }],
  "connectors": [],
  "database": true,
  "notifications": false,
  "widgets": [
    {
      "name": "Application Pipeline",
      "description": "Open applications by status, and anything quiet long enough to be worth a follow-up.",
      "component": "widgets/application-pipeline.tsx",
      "defaultSize": { "w": 4, "h": 3 },
      "minSize": { "w": 3, "h": 2 }
    }
  ]
}
```

No `slug`, no `hasPages`, no `hookCounts`, no hand-written `lastUpdated`. No `roles`,
`env`, `egress` or `escapes` in phase 1. Phase 2 adds
`"escapes": [{ "rule": "raw-response", "reason": "Resume and cover letter PDFs stream from @react-pdf/renderer; there is no JSON body to validate." }]`.
Phase 3 adds `"connectors": ["anthropic"]`.

### Migrations — the complete data model, all three phases

`migrations/001_profile.sql`

```sql
create table if not exists profile (
  user_id uuid primary key,
  name text not null default '',
  headline text not null default '',
  headline_descriptor text not null default '',
  email text not null default '',
  phone text,
  location text not null default '',          -- printed on documents
  base_city text not null default '',         -- reasoned over, never printed
  base_state text,
  base_country text not null default '',
  links jsonb not null default '[]'::jsonb,   -- [{ label, url }]
  comp_target integer,                        -- was library_overrides scope='preference'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists summary_variants (
  user_id uuid not null,
  key text not null,                          -- 'default' is required and is the fallback
  text text not null,
  primary key (user_id, key)
);
```

`migrations/002_library.sql`

```sql
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org text not null,
  title text not null,
  location text,
  start_month date not null,
  end_month date,                             -- null means present
  context text,
  created_at timestamptz not null default now()
);
create index if not exists idx_roles_user on roles(user_id, start_month desc);

create table if not exists accomplishments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_id uuid not null references roles(id) on delete cascade,
  claim text not null,
  how text,
  metrics jsonb not null default '[]'::jsonb,
  tech jsonb not null default '[]'::jsonb,
  themes jsonb not null default '[]'::jsonb,  -- keys from lib/shared/themes.ts
  evidence text not null default '',          -- PRIVATE. Never rendered.
  scope text not null default 'resume' check (scope in ('resume','page','both')),
  case_study jsonb,                           -- { situation, action, result }
  created_at timestamptz not null default now()
);
create index if not exists idx_acc_user on accomplishments(user_id);
create index if not exists idx_acc_role on accomplishments(role_id);

create table if not exists skill_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, label text not null,
  items jsonb not null default '[]'::jsonb, position integer not null default 0
);

create table if not exists education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, institution text not null,
  credential text not null, year text, position integer not null default 0
);

-- Phase 3 readers. Tables ship now; schema churn later is the expensive kind.
create table if not exists philosophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, text text not null,  -- rendered verbatim, never rephrased
  elaboration text, position integer not null default 0
);

create table if not exists screener_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, question text not null,
  answer text not null, detail text, position integer not null default 0
);
```

`migrations/003_applications.sql`

```sql
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company text not null,
  role_title text not null,
  job_url text,                               -- metadata only; nothing fetches it
  jd_raw text not null,
  jd_analysis jsonb,                          -- null until phase 3 runs
  cover_letter_draft text not null default '',
  provenance jsonb,                           -- null until phase 3 runs
  status text not null default 'draft'
    check (status in ('draft','applied','screen','interview','offer','rejected','ghosted')),
  location text,
  comp_min integer, comp_max integer,         -- annualised; see lib/shared/comp.ts
  comp_currency text check (comp_currency is null or char_length(comp_currency) = 3),
  comp_basis text, comp_posted text,
  comp_target integer,                        -- per-application override of profile.comp_target
  notes text not null default '',
  contact_name text, contact_email text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  last_activity_at timestamptz not null default now()
);
create index if not exists idx_app_user_activity on applications(user_id, last_activity_at desc);
create index if not exists idx_app_user_status on applications(user_id, status);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  user_id uuid not null,                      -- denormalised: the scoped client has no joins
  kind text not null check (kind in ('resume','cover_letter')),
  revision integer not null,                  -- 1-based per (application, kind); highest is current
  markdown text not null,
  source text not null check (source in ('generated','edited','restored')),
  created_at timestamptz not null default now(),
  unique (application_id, kind, revision)
);
create index if not exists idx_doc_current on documents(application_id, kind, revision desc);
```

### Directory layout

```
apps/career/
  app.json
  migrations/            001_profile.sql  002_library.sql  003_applications.sql
  lib/
    shared/              # pure — importable from pages, widgets and routes
      themes.ts          # THEMES const              ← lib/career/types.ts:35
      statuses.ts        # APPLICATION_STATUSES, CLOSED_STATUSES, DOCUMENT_KINDS
                         #                           ← lib/db/constants.ts
      comp.ts            # annualize, parseCompRange, compVerdict, formatCompRange,
                         # looksMultiBand, effectiveTarget
                         #                           ← lib/comp.ts + lib/preferences.ts:47
      url.ts             # normalizeUrl, displayHost ← lib/url.ts
      types.ts           # Profile, Role, Accomplishment, … (no storage concerns)
                         #                           ← lib/career/types.ts
    server/              # server-only; pages and widgets may not import this
      library.ts         # load/validate the library for a user
                         #   ← lib/career/index.ts (validateLibrary, getAccomplishment,
                         #     usableSummaryVariants, rolesNewestFirst, unfilled-field scan)
      applications.ts    # derivedComp, fillEmptyFrom, trackerFacts
                         #                           ← lib/applications.ts
      documents.ts       # currentDocument(s), listRevisions, appendRevision,
                         # appendIfChanged           ← lib/documents.ts   [phase 2]
  api/
    summary/route.ts             GET     — widget-sized counts
    applications/route.ts        GET     — the tracker list
                                 POST    — create (phase 1: hand-entered; phase 3: pipeline)
    applications/[id]/route.ts   GET PATCH DELETE
    library/route.ts             GET     — the whole library, resolved
    library/profile/route.ts     PUT
    library/roles/route.ts       POST
    library/roles/[id]/route.ts  PUT DELETE
    library/accomplishments/route.ts       POST
    library/accomplishments/[id]/route.ts  PUT DELETE
    library/skills/route.ts      PUT     — whole-list replace; order is part of the value
    library/education/route.ts   PUT     — same
  pages/
    Main.tsx                     the tracker
    library/Main.tsx             the career library editor
  widgets/
    application-pipeline.tsx
```

Phase 2 adds `api/applications/[id]/revisions`, `.../restore`, `.../resume.pdf`,
`.../cover-letter.pdf`, `pages/applications/[id]/Main.tsx`, and
`lib/server/{markdown,pdf,review,guards}`. Phase 3 adds `lib/server/ai/*`,
`api/applications/[id]/{refine,regenerate}`.

### Routes — the contract shape

Every route is `defineRoute({ auth, input, output, budget, handler })`, handler
returns plain data, failures thrown as `AppError`. `auth: ["session"]` throughout —
nothing here is public. **Every handler scopes by `context.user.id`**, and a row
belonging to someone else is `AppError.notFound()`, never `.forbidden()`, so probing
cannot distinguish "exists but yours isn't" from "no such row".

```ts
// apps/career/api/applications/route.ts  ← app/api/applications/route.ts:21,29
export const GET = defineRoute({
  auth: ["session"],
  output: z.object({ applications: z.array(ApplicationSummary) }),
  handler: async (context) => { /* .eq("user_id", context.user.id).order("last_activity_at") */ },
});
```

### Pages

Server components calling `await callAppRoute("career", "GET /applications")`, with
the interactive halves as client components using `useAppQuery` + `AsyncView` and
`createAppClient<"career">(appSlug)`. Filter state (open/closed, status) goes in the
URL, per `app-shell.md`.

Every raw element is replaced: `<button>` → `Button` (`busy` for the pending state
that `editor.tsx` currently hand-rolls with a `busy` string), `<input>`/`<textarea>`/
`<select>` → `Input`/`Textarea`/`Select` inside `Field`, the tracker list → `DataTable`
with its matching `TableSkeleton`, the hand-rolled `Callout` (`editor.tsx:828`) →
`Card`/`SectionCard` + `Badge`. Every empty state names its `cause` — the tracker has
three genuinely different empties (no applications yet; everything closed; a status
filter matched nothing) and the source renders roughly one.

Colour: the source's `bg-band-grey`, `text-ink`, `text-muted`, `bg-blue-50`,
`text-amber-700`, `text-red-600` and the seven-entry `STATUS_STYLES` palette map
onto semantic tokens. Status badges use `Badge` tones; the six application statuses
that merely *distinguish* (draft/applied/screen/interview) use `cat-1`…`cat-6`, while
`offer` and `rejected` are the only two that legitimately *grade* and get
`success`/`destructive`. Borrowing `destructive` for "rejected" is correct; borrowing
it for "interview" would tell the user an interview is an error.

---

## Dependencies & gaps

1. **`anthropic` connector — blocking for phase 3.** Does not exist. Needs:
   `messages.parse`-equivalent structured output (`output_config.format` + a Zod
   schema), a cacheable system-block prefix with `cache_control: ephemeral`, an
   `effort` parameter, and `stop_reason: "refusal"` surfaced rather than swallowed
   (it arrives as a 200 with empty content — `lib/ai/client.ts:86`). Credential: one
   API key. Run `/mixos connector create anthropic`.

2. **`@react-pdf/renderer` in the root `package.json` — blocking for phase 2.**
   Approved above. One dependency, added to every MixOS build.

3. **The 300-second pipeline does not fit in a request — unresolved, phase 3.**
   `app/api/applications/route.ts:19` sets `maxDuration = 300` for three Opus 5 calls,
   two concurrent, at `medium`/`high` effort. A MixOS route's `budget.ms` defaults to
   30 s and bounds *latency* — the handler keeps running after the 504 but the caller
   is gone. The two honest options are (a) sweep effort down and fit inside a raised
   `budget.ms`, or (b) make generation a job: `POST /applications` returns
   immediately with `status: 'drafting'`, a scheduled job drains the queue, the page
   polls. **(b) is the right shape and is a phase-3 design decision, not something to
   assume now.** Flagged so it is not discovered mid-build.

4. **Importing your existing library — a feature decision for you.** Out of scope per
   §1.7, and your 39 accomplishments plus private evidence notes should not be seeded
   into this repo. Suggested route, if you want it: a `POST /library/import` taking a
   JSON blob you paste, plus a throwaway script in the *source* repo that dumps
   `lib/career/` to that shape. That keeps your data on your machine and out of git
   history. Not planned into any phase until you say so.

5. **No file storage.** Nothing in the source needs it — PDFs render on demand and are
   never stored, which is a property the conversion keeps. Noted only to confirm it
   was checked.

6. **No notifications, telemetry, schedules, syncs, hooks, MCP tools or egress** in
   the source. None are added in phase 1. The README's unbuilt "Ask my career
   anything" is a natural MCP tool later, but it is a future feature, not a parity row.

### Open questions

- **`summary_variants` keys.** The source keys them by theme (`forward-deployed`,
  `ai-ml`) and three of four are still `TODO`. Free-text keys, or constrained to the
  `THEMES` list? Free text is planned; say if you want them constrained.
- **`scope: 'page'`** on accomplishments points at a landing page the source deleted.
  The column ships (phase 3 reads it), but nothing renders `page`-scoped entries.
  Confirm that is still what you want.

---

## Not converted

These are dropped deliberately, not lost. Every one solves a problem the platform
already solves:

| Dropped | Source | Replaced by |
| --- | --- | --- |
| Authentication and session handling | `lib/auth.ts`, `lib/auth-password.ts`, `scripts/hash-password.ts` | Platform session; `context.user` |
| The login/logout endpoints and screen | `app/api/login/route.ts`, `app/login/page.tsx` | Platform sign-in |
| The routing/middleware gate | `proxy.ts` | `defineRoute({ auth })` + the gateway |
| The HTTP client wrapper | `fetch(...)` calls throughout `editor.tsx`, `library-editor.tsx` | `createAppClient` / `callAppRoute` |
| State management and loading flags | `editor.tsx:65-76` — 11 `useState`, a `busy` string, hand-rolled error/message | `useAppQuery` + `AsyncView` |
| CSS, theme, fonts, design tokens | `app/globals.css`, `postcss.config.mjs`, `app/layout.tsx:13` (Inter), `tailwind` config | Platform design system |
| The component library | `app/_components/band.tsx`, `editor.tsx:819` `Field`, `:828` `Callout`, `library-editor.tsx:399,417,484` | `Button`/`Input`/`Field`/`Card`/`DataTable`/`Badge` |
| The config/secrets loader | `.env.example`, `.env.local`, `process.env.*`, `scripts/check-env.ts` | Nothing to load in phase 1; connector credentials in phase 3 |
| The ORM and its config | `drizzle.config.ts`, `lib/db/index.ts`, `lib/db/schema.ts`, `drizzle-orm`, `postgres` | `context.db` + `migrations/*.sql` |
| The file-default / override layer | `lib/career/hydrate.ts`, `lib/career/overrides.ts`, the `library_overrides` table | Nothing — the database *is* the library |
| Build tooling and test harness | `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `.prettierrc.json`, 9 `*.test.ts` files | Platform build; `npm run typecheck` |
| Operational check scripts | `scripts/check-{env,library,ats,cache}.ts`, `scripts/smoke.ts` | Platform verification (see below). `check:library`'s referential integrity moves into the route's Zod schemas and the FK constraint. |
| Dead code | `app/page.tsx` (redirect to a gate that no longer exists), `app/_components/band.tsx` (a deleted landing page), `public/*.svg` (Next.js defaults), `*.ts.bak` (importer backups), `NEXT_PUBLIC_SITE_URL` (read nowhere) | — |
| The one-off importer | `scripts/import-profile.ts`, `lib/ai/import-profile.ts` (349 lines) | Ran once, against `.import/Profile.pdf`. Its output is already in `lib/career/`. |

### User-visible behaviour changes

1. **Anyone granted the app can use it, each with their own data.** The source was one
   password for one person. Nobody can see anyone else's library or applications.
2. **"Revert this field to what the file says" no longer exists.** The source
   deliberately distinguished "put it back" from "make it blank"
   (`app/api/library/route.ts:98`) and refused an empty string on those grounds. With
   no file layer there is nothing to revert *to*, so blanking a field is now simply
   allowed. This is a genuine capability loss, and it is the direct cost of the
   ownership decision above.
3. **The placeholder-blocker banner changes shape.** `draftBlockers()` /
   `publishBlockers()` scan runtime values for `TODO`/`EXAMPLE` markers left by the
   scaffolded TypeScript (`lib/career/index.ts:91`). A database-native library has no
   scaffold — a field is filled or empty — so the banner becomes "these fields are
   empty and would print blank", which does the same job with a simpler test.
4. **Revision numbering moves out of SQL.** `appendRevision` computes the next
   revision inside the `INSERT` with a `select coalesce(max(revision),0)+1` subquery
   (`lib/documents.ts:110`). The scoped client is a PostgREST builder with no raw SQL,
   so it becomes read-max-then-insert, with the `unique (application_id, kind,
   revision)` constraint still rejecting the loser of a double-submit — plus one
   retry, so the losing save lands as the next revision rather than being dropped.
   Same guarantee, different mechanism. *(Phase 2.)*
5. **Applications can exist with no analysis.** `jd_analysis` and `provenance` become
   nullable so phase 1 can create an application without a model call.

---

## Parity checklist

`todo` rows are scheduled work with a phase; `deferred` and `dropped` carry reasons.

### Screens

| Source | What it is | MixOS destination | Phase | Status |
| --- | --- | --- | --- | --- |
| `app/page.tsx:9` | Root redirect to `/admin` | — | — | dropped: redirects to a gate the platform replaced |
| `app/layout.tsx:31` | Root layout, Inter font, metadata | Platform shell | — | dropped: platform owns chrome and type |
| `app/login/page.tsx:64` | Password form | — | — | dropped: platform session |
| `app/admin/page.tsx:30` | Tracker — open/closed groups, sorted by activity | `pages/Main.tsx` + `pages/tracker.tsx` | 1 | done |
| `app/admin/page.tsx:104` | Comp verdict per row, gap not a boolean | `pages/tracker.tsx` + `lib/shared/comp.ts` | 1 | done |
| `app/admin/page.tsx:160` | Staleness nudge, 14 days | `api/applications` (`quietDays`) + tracker + widget | 1 | done — moved into the route; see build note 1 |
| `app/admin/page.tsx:186` | Placeholder/blocker banner | `pages/library/library-editor.tsx` + a tracker banner | 1 | done (shape changed as planned — behaviour change 3) |
| `app/admin/new/page.tsx:6` | New application — paste posting + URL | `pages/tracker.tsx` → `NewApplicationDialog` | 1 | done (hand-entered; phase 3 runs the pipeline) |
| `app/admin/[id]/page.tsx:16` | Application detail, server: backfill + reviews | `pages/applications/[id]/Main.tsx` | 2 | deferred: needs the Markdown/PDF layer |
| `app/admin/[id]/editor.tsx:351` | `DraftPane` — your own first draft | `pages/applications/[id]/` | 3 | deferred: only meaningful next to Refine |
| `app/admin/[id]/editor.tsx:414` | `RefineReport` — changes, suggestions, retention | `pages/applications/[id]/` | 3 | deferred: needs the connector |
| `app/admin/[id]/editor.tsx:462` | `DocumentPane` + revision history dropdown | `pages/applications/[id]/` | 2 | deferred |
| `app/admin/[id]/editor.tsx:572` | `ReviewNotes` — length, fabrication, syntax | `pages/applications/[id]/` | 2 | deferred |
| `app/admin/[id]/editor.tsx:603` | `Tracker` — editable tracker fields | `pages/tracker.tsx` → `EditApplicationDialog` | 1 | done — all 13 fields editable from the tracker row |
| `app/admin/[id]/editor.tsx:724` | `CompRange` — posted vs target | `pages/Main.tsx` + `pages/tracker.tsx` | 1 | done |
| `app/admin/library/page.tsx:24` + `library-editor.tsx:52` | Library editor — evidence, summaries, identity, base, links, target | `pages/library/` — shell + 6 cards | 1 | done (full CRUD, as the ownership decision required) |
| `app/_components/band.tsx:22,48` | `Band` / `SectionHeading` | — | — | dropped: dead code from a landing page the source deleted |

### Endpoints

| Source | Method + path | MixOS destination | Phase | Status |
| --- | --- | --- | --- | --- |
| `app/api/applications/route.ts:21` | `GET /api/applications` | `api/applications/route.ts` GET | 1 | done |
| `app/api/applications/route.ts:29` | `POST /api/applications` — pipeline + derive | `api/applications/route.ts` POST | 1 / 3 | done for phase 1 (create); pipeline deferred to 3 |
| `app/api/applications/[id]/route.ts:54` | `PATCH` — save documents + fields, return reviews | `api/applications/[id]/route.ts` PATCH | 1 / 2 | done for phase 1 (fields); documents + reviews deferred to 2 |
| `app/api/applications/[id]/route.ts:166` | `DELETE` — cascades to documents | `api/applications/[id]/route.ts` DELETE | 1 | done |
| `app/api/applications/[id]/revisions/route.ts:14` | `GET` revision list | `api/applications/[id]/revisions/route.ts` | 2 | deferred |
| `app/api/applications/[id]/restore/route.ts:20` | `POST` restore-by-append | `api/applications/[id]/restore/route.ts` | 2 | deferred |
| `app/api/applications/[id]/resume.pdf/route.ts:19` | `GET` resume PDF | `raw: true` route + `raw-response` escape | 2 | deferred: `@react-pdf/renderer` |
| `app/api/applications/[id]/cover-letter.pdf/route.ts:20` | `GET` letter PDF, date stamped at render | `raw: true` route | 2 | deferred: same |
| `app/api/applications/[id]/refine/route.ts:25` | `POST` refine your draft | `api/applications/[id]/refine/route.ts` | 3 | deferred: `anthropic` connector |
| `app/api/applications/[id]/regenerate/route.ts:34` | `POST` re-run the pipeline | `api/applications/[id]/regenerate/route.ts` | 3 | deferred: `anthropic` connector |
| `app/api/library/route.ts:33` | `GET` resolved library + defaults + issues | `api/library/route.ts` GET | 1 | done (no `fileDefault`/`overridden` fields, as decided) |
| `app/api/library/route.ts:102` | `PATCH` batch override edits | `api/library/{profile,summary-variants,roles,accomplishments,skills,education}` | 1 | done — 10 typed routes replace one batch PATCH |
| `app/api/login/route.ts:9,30` | `POST` / `DELETE` session | — | — | dropped: platform session |
| — | — | `api/summary/route.ts` GET | 1 | done (**new** — backs the widget) |

### Data model

| Source | What it is | MixOS destination | Phase | Status |
| --- | --- | --- | --- | --- |
| `lib/db/schema.ts:27` | `applications` — 21 columns | `migrations/003` `applications` + `user_id` | 1 | done |
| `lib/db/schema.ts:143` | `documents` — append-only revisions | `migrations/003` `documents` + `user_id` | 1 (schema) / 2 (reads) | done for phase 1 (table exists); reads deferred to 2 |
| `lib/db/schema.ts:205` | `library_overrides` | — | — | dropped: the database *is* the library now |
| `lib/career/profile.ts:8` | `profile` — identity, base, links, summaries | `migrations/001` `profile` + `summary_variants` | 1 | done |
| `lib/career/roles.ts` | 9 employment roles | `migrations/002` `roles` | 1 | done |
| `lib/career/accomplishments.ts` | 39 accomplishments | `migrations/002` `accomplishments` | 1 | done |
| `lib/career/skills.ts` | 6 skill groups | `migrations/002` `skill_groups` | 1 | done |
| `lib/career/index.ts:125` (`education`) | Education entries | `migrations/002` `education` | 1 | done |
| `lib/career/philosophy.ts` | 5 philosophies, rendered verbatim | `migrations/002` `philosophies` | 1 (schema) / 3 (editor + reader) | done for phase 1 (table exists); editor deferred to 3 |
| `lib/career/screener.ts:23` | 8 screener answers | `migrations/002` `screener_answers` | 1 (schema) only | deferred: the source has no reader either (README "Not built yet") |
| `lib/career/types.ts:35` | `THEMES` — 11-key vocabulary | `lib/shared/themes.ts` (const, not a table) | 1 | done — structure, not data |
| `lib/db/constants.ts:22,44,52` | Status / kind / scope enums | `lib/shared/statuses.ts` + SQL `CHECK` | 1 | done |
| `lib/preferences.ts:12` | `compTarget` via the `preference` scope | `profile.comp_target` column | 1 | done |

### Logic modules

| Source | What it is | MixOS destination | Phase | Status |
| --- | --- | --- | --- | --- |
| `lib/comp.ts` (249 lines) | Annualisation, range parsing, verdict, formatting | `lib/shared/comp.ts` | 1 | done — ported nearly verbatim; pure |
| `lib/url.ts` | `normalizeUrl`, `displayHost` | `lib/shared/url.ts` | 1 | done |
| `lib/preferences.ts:47` | `effectiveTarget` | `lib/shared/comp.ts` | 1 | done |
| `lib/applications.ts` (189 lines) | `derivedFields`, `derivedComp`, `fillEmptyFrom`, `trackerFacts` | `lib/server/applications.ts` | 1 / 3 | done for phase 1 (`fillCompFromPosted`); the analysis-driven half deferred to 3 |
| `lib/career/index.ts:188` | `validateLibrary` — referential integrity, theme hygiene | Zod schemas + the `role_id` FK + `computeIssues` | 1 | done |
| `lib/career/index.ts:105` | `usableSummaryVariants` | `lib/server/library.ts` | 3 | deferred: it filters variants for the *selector*, which arrives with the model |
| `lib/career/index.ts:167` | `rolesNewestFirst` | `ORDER BY start_month desc` | 1 | done — became a query |
| `lib/career/index.ts:29,91,96` | `placeholderFields`, `draftBlockers`, `publishBlockers` | `lib/server/library.ts` → `computeIssues` | 1 | done — shape changed as planned |
| `lib/career/overrides.ts`, `hydrate.ts` | The override layer | — | — | dropped: no file layer to override |
| `lib/documents.ts` (147 lines) | Revision read/append, `appendIfChanged`, `previewOf` | `lib/server/documents.ts` | 2 | deferred (see behaviour change 4) |
| `lib/markdown/parse.ts` (310 lines) | The closed Markdown subset + warnings | `lib/server/markdown/parse.ts` | 2 | deferred |
| `lib/markdown/seed.ts` (284 lines) | Deterministic document assembly | `lib/server/markdown/seed.ts` | 2 | deferred |
| `lib/pdf/render.ts` (294) + `MarkdownDocument.tsx` (201) | ATS-safe PDF, page count, fill ladder, date stamp | `lib/server/pdf/` | 2 | deferred: `@react-pdf/renderer` |
| `lib/review.ts` | Everything checked on save, in one place | `lib/server/review.ts` | 2 | deferred |
| `lib/ai/guards.ts:861` | TIER 2 `checkDocument` — whole-document, warn-only | `lib/server/guards.ts` | 2 | deferred — pure code, no model |
| `lib/ai/guards.ts:538` | TIER 1 `checkRephrase` — hard reject | `lib/server/guards.ts` | 3 | deferred: only runs on model output |
| `lib/ai/guards.ts:135,313` | `extractNumericTokens`, `extractProperNouns` | `lib/server/guards.ts` | 2 | deferred |
| `lib/ai/client.ts` | Anthropic client, cached prefix, effort, refusals | The `anthropic` connector | 3 | deferred: connector does not exist |
| `lib/ai/analyze-jd.ts` | Posting → structured facts, geo pay banding | `lib/server/ai/analyze-jd.ts` | 3 | deferred |
| `lib/ai/select-bullets.ts` | Rank and lightly rephrase | `lib/server/ai/select-bullets.ts` | 3 | deferred |
| `lib/ai/draft-cover-letter.ts` | Generate a letter from the library | `lib/server/ai/draft-cover-letter.ts` | 3 | deferred |
| `lib/ai/refine-cover-letter.ts` | Refine your draft; `draftRetention` | `lib/server/ai/refine-cover-letter.ts` | 3 | deferred — the better path |
| `lib/ai/tailor.ts` | The 3-stage orchestration | `lib/server/ai/tailor.ts` | 3 | deferred (see gap 3 — may become a job) |
| `lib/ai/run-guarded.ts` | Retry once with violations fed back | `lib/server/ai/run-guarded.ts` | 3 | deferred |
| `lib/ai/schemas.ts` | Zod schemas; ids as a literal enum | `lib/server/ai/schemas.ts` | 3 | deferred |
| `lib/ai/provenance.ts` | What a draft was built from | `applications.provenance` jsonb | 3 | deferred |
| `lib/ai/import-profile.ts`, `scripts/import-profile.ts` | One-off PDF → library importer | — | — | dropped: ran once; its output is the library |

### Roles, config, integrations, notifications, background work, assets

| Source | What it is | MixOS destination | Phase | Status |
| --- | --- | --- | --- | --- |
| `lib/auth.ts:28`, `proxy.ts:12` | One role, `admin` = holds the password | Platform session + `user_id` scoping | 1 | done — no app `roles` declared; isolation verified with a second user |
| `ANTHROPIC_API_KEY` (`lib/ai/client.ts:24`) | Model credential | `anthropic` connector credential | 3 | deferred |
| `DATABASE_URL` (`lib/db/index.ts`) | Postgres connection | `context.db` | 1 | dropped: platform owns the connection |
| `ADMIN_PASSWORD_HASH`, `AUTH_SECRET` | Single-user auth | — | — | dropped with auth |
| `SMOKE_BASE_URL` (`scripts/smoke.ts`) | Smoke test target | — | — | dropped with the script |
| `NEXT_PUBLIC_SITE_URL` (`.env.local`) | — | — | — | dropped: read nowhere in the source |
| Anthropic API (`lib/ai/client.ts:106`) | The only outbound call | `anthropic` connector | 3 | deferred |
| — | Notifications | — | — | dropped: the source sends none |
| `app/admin/page.tsx:176` | Staleness — computed at render, no job | `api/applications` + the widget | 1 | done — no schedule needed |
| `app/favicon.ico`, `public/*.svg` | Assets | — | — | dropped: platform chrome; the SVGs are unused Next.js defaults |
| `.import/Profile.pdf`, `profile.txt` | Personal source documents (gitignored) | — | — | dropped: importer input, already consumed |
| `lib/career/*.ts.bak` | Importer backups (gitignored) | — | — | dropped |

**Counts:** 83 rows — **35 done** (phase 1, each exercised against the running app), 32 deferred to phases 2–3 each with a named blocker, 16 dropped with a reason. No blanks, no `todo` left in a shipped phase.

---

## Build notes — phase 1, as built

Five things came out differently from the plan. All are recorded here rather than
discovered later.

1. **Staleness moved from the page into the route.** The plan put the 14-day nudge in
   `pages/Main.tsx`, mirroring where the source computed it. React's `react-hooks/purity`
   rule bans `Date.now()` during render, and computing it in the browser instead would have
   made the server render and the hydration disagree about what "today" is. It is now decided
   once, in `GET /applications`, and returned as a `quietDays` map. This is the same place
   `GET /summary` already reads the clock.

2. **`GET /applications` returns three extra fields.** `profileCompTarget` (so the tracker can
   measure every row against your target without a second round trip), `blockingIssues` (so the
   banner has a count without loading the whole library), and `quietDays` per note 1.

3. **One more route than planned: `PUT /library/summary-variants`.** The plan's route list
   omitted it. Summary variants are a whole-list replace like skills and education, and without
   the route the `default` variant — the fallback every resume lands on — would have been
   uneditable. Final count is **12 route files / 17 methods**, not the 9 / 16 the plan estimated.

4. **Two files the plan did not name.** `pages/client.ts` holds the typed client and the single
   sanctioned error-message helper, so nine components cannot each invent their own.
   `pages/use-server-draft.ts` keeps a card's local draft in step with refetched server data
   *by value*, which the obvious `useEffect(() => setDraft(props), [props])` cannot do: it is a
   cascading render the lint rule rejects, and an identity comparison would discard an
   in-progress edit every time a sibling card saved.

5. **`usableSummaryVariants` moved to phase 3.** It filters variants down to the ones the
   *selector* may choose from, and the selector arrives with the model. Nothing in phase 1
   reads it.

### What was verified, and how

Everything below ran against the dev stack at `localhost:3000` through the real gateway with a
real session cookie — not by reading the code.

- **Golden path**: profile → summaries → role → accomplishment → three applications created from
  pasted postings → status change → edit → delete. Both pages and the dashboard widget rendered
  at every step with no error markers in the HTML.
- **The comp rules, which are the ones with teeth**: `$195,000 - $206,000 plus equity and a 401k
  match` parsed to 195000/206000 and *not* to 401000; a four-band posting declined and returned
  the explanatory basis instead of a confident span; a posting with no stated range rendered
  "Not stated" with **no** verdict line, because `clears === null` is not `false`; a role paying
  170k against a 220k target rendered "$50k short of your target"; a hand-typed range survived a
  later `compPosted` edit untouched.
- **Cross-user isolation**: a second signed-in user saw an empty library and an empty tracker, and
  every attempt to GET, PATCH or DELETE the first user's rows returned **404 NOT_FOUND**, never
  403 — so probing cannot distinguish "exists but not yours" from "no such row". Attaching an
  accomplishment to another user's role was refused. The first user's data was untouched afterwards.
- **Every one of the 25 `.table()` calls in the app is scoped by `user_id`**, audited
  mechanically rather than by eye.
- **Empty states**: all three of the tracker's causes were rendered — nothing tracked yet, a
  status filter that matched nothing (with its required "Show all" action), and everything closed.
- **The issues panel and its banner**: blanking the profile name and the default summary produced
  exactly two blocking issues on the library page and the matching count on the tracker.
- `npx tsx scripts/generate-project-registry.ts`, `npm run typecheck`, `npx eslint apps/career`
  and `npm run migrate:apps` all clean.

**Not verified visually.** There is no browser automation on this machine, so every page was
checked by fetching its rendered HTML and reading the extracted text. Server rendering, routing,
data and the absence of error boundaries are all confirmed; how it *looks* is not. The widget's
numbers in particular arrive client-side via `useAppQuery`, so only its skeleton and its data
source were observed, never the hydrated tile.

**Verification data was deleted afterwards.** The app is registered, granted to you and installed,
with the widget on your dashboard, and every career table is empty and ready for your own library.

---

## Verification

Before phase 1 is reported done:

1. `npx tsx scripts/generate-project-registry.ts` — `career` appears with the
   `application-pipeline` widget and all 9 phase-1 route files (16 methods). The
   generator schema-validates `app.json` and rejects a bare handler export, a JSON
   route with no `output`, or a role the app never declared.
2. `npm run typecheck`.
3. `npm run migrate:apps` — all three migrations apply; confirm the tables exist as
   `_app_career_*` and that no migration writes a prefixed name itself.
4. **Browser pass, golden path:** grant yourself the app → `/apps/career/library` →
   fill in profile, one role, two accomplishments, one skill group → `/apps/career` →
   create an application from a pasted posting → set comp figures → watch the comp
   verdict appear against your target → move it to `applied` and confirm `applied_at`
   stamps itself → add the widget to a dashboard and confirm the counts match.
5. **Browser pass, edge cases:** an application with no posted range shows *nothing*
   rather than "short of target" (null is not false — `lib/comp.ts:229`); a paste of
   `"$195,000 – $206,000 · 401k match"` parses to 195000/206000 and not to 401000
   (`lib/comp.ts:104`); a posting listing four bands refuses rather than producing a
   confident span (`lib/comp.ts:139`); the three empty states each name a different
   cause.
6. **Ownership:** sign in as a second user, confirm an empty library and an empty
   tracker, and confirm a direct `GET /api/apps/career/applications/<other-user-id>`
   returns 404 and not 403.
7. **No connectors declared**, so `scripts/smoke-test-app.ts` does not apply in
   phase 1. No `schedules` and no `sync`, so the double-tick job check does not apply.
8. **No legacy leakage:** `npx eslint apps/career` clean, plus
   `grep -rnE "process\.env|[^a-zA-Z]fetch\(|dark:|#[0-9a-fA-F]{3,6}|org_id|tenant_id|pc_session|AUTH_SECRET|drizzle" apps/career` returns nothing.
9. **Parity audit:** every phase-1 `todo` row above moves to `done` only after its
   behaviour is exercised in the browser, and each `dropped` row is re-checked against
   the running app.
