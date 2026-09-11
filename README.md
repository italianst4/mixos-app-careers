# Career

A job search you can actually see: a career library you author once, and a
tracker for every application you are chasing — what you applied to, where each
one stands, how its posted compensation compares to what you want, and which of
them have gone quiet.

Everything is per-user. Your library and your applications are yours; nobody else
using the instance can read them.

## The career library

The library is the single source of fact about you. It holds your profile and
contact line, your employment history, the accomplishments beneath each role,
your education, your skill groups, and a set of summary variants you can pick
between for different kinds of role.

It is deliberately opinionated about what is *missing*. The editor spends as much
space on unfinished entries as on complete ones — a role with no accomplishments,
a profile with no contact line, an empty summary — because those are the gaps
that show up later as a document with a blank where something important should
be.

## The application tracker

One row per job you are chasing. You paste the posting, name the company and the
role, and the app keeps the posting text verbatim alongside everything you record
afterwards.

**Status is yours to set.** The seven stages are draft, applied, screen,
interview, offer, rejected, and ghosted. Only `draft` is ever written for you;
everything past it is you recording what happened, which is the point of a
tracker. Ghosted earns its own name rather than folding into rejected — "they
said no" and "nobody ever replied" are different outcomes, and only one of them
is worth a follow-up.

**Compensation is compared, not just stored.** The posted range is read out of
the text while it is in front of you and annualised, so an hourly contract rate
and a salary become the same kind of number. Currency is recorded, because 95,000
is a good offer in one and a mediocre one in another. You set a usual target on
your profile and can override it per application — a role can be worth taking for
less, and an exceptional one can be worth holding out on. The verbatim posted
string is kept too, since "plus equity and a performance bonus" is often the part
that decides it.

**Quiet applications surface themselves.** An open application untouched for two
weeks is flagged as quiet, on the tracker and on the dashboard widget. Closed
ones are never flagged — there is nothing to follow up on.

## The widget

**Application Pipeline** — open and closed counts, a chip per status, how many
are below your compensation target, and anything that has gone quiet long enough
to be worth a note. It is the one thing here that asks for an action, which is
what earns it a slot on a dashboard.

## What it needs

**A scoped database.** That is all. No connectors, no `env` settings, no
`egress` hosts, no scheduled jobs, no notifications, and no declared `escapes`.
Nothing leaves the instance — in particular, nothing fetches the job posting URL
you save. It is stored so you can find the listing again months later.

## Worth knowing

**Document generation is not built yet.** The name promises an ATS-safe resume
and cover letter per posting, and that is where this is going, but what ships
today is the library and the tracker: author your library, log applications,
compare posted compensation against your target, and see what has gone quiet.
The Markdown document editor with append-only revisions and PDF export is the
next phase, and the drafting pipeline that reads a posting and selects from your
library is the one after it — it needs a model connector this instance does not
have yet. The database schema for all of it already exists, so nothing you record
now is thrown away.

**Deleting an application deletes its documents.** The posting text and every
saved revision go with it. Your career library is untouched.
