-- Who you are, and the numbers you measure a posting against.
--
-- One row per user. In the source this was TypeScript constants in lib/career/
-- with a library_overrides table layered over them at read time; here the
-- database is the library, so the override layer does not exist.
--
-- `base_*` is where you actually work, and is reasoned over rather than
-- printed: US postings band pay by geography and the headline range is usually
-- the top band, so which band applies is decided by this value. `location` is
-- the line that prints on a document, which is a different question.

create table if not exists profile (
  user_id uuid primary key,

  name text not null default '',

  -- The fallback role title, used when no posting title is available. Also the
  -- only headline the fabrication guard will trust, so a posting's own title
  -- must never be written back here.
  headline text not null default '',

  -- The constant half of the header, printed as "{role title} · {descriptor}".
  -- Never posting-specific: the title already adapts, and a descriptor that
  -- also moved would leave nothing constant across applications.
  headline_descriptor text not null default '',

  email text not null default '',
  phone text,

  -- Printed on documents. A metro area reads better on a resume than a street.
  location text not null default '',

  -- Structured, for reasoning. See the note above.
  base_city text not null default '',
  base_state text,
  base_country text not null default '',

  -- [{ label, url }]. Rendered as plain text on a resume, never as a hyperlink
  -- on a word like "portfolio" — many ATS parsers strip the anchor and keep
  -- only the visible word, leaving a resume with no URL in it at all.
  links jsonb not null default '[]'::jsonb,

  -- The annual figure you want a role to be able to reach. Null means unset,
  -- and the tracker stays silent about compensation rather than judging every
  -- posting against a number you never gave it.
  --
  -- In the source this lived in library_overrides under a 'preference' scope,
  -- which that file itself called a hack ("a separate table for one row is a
  -- migration nobody needed"). With a per-user profile row it is a column.
  comp_target integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Opening summary options. The selector picks one by key for a given posting;
-- 'default' is the fallback and must always exist.
--
-- `variant_key` rather than `key`, and `body` rather than `text`, to keep every
-- column name clear of a SQL keyword.
create table if not exists summary_variants (
  user_id uuid not null,
  variant_key text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_key)
);
