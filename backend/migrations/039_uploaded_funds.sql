-- Uploaded fact sheets: a person's own funds, read by Gemini and confirmed by them.
--
-- The catalogue (024) covers the funds we chose and transcribed. A reader who
-- follows a fund it does not cover can now upload that fund's fact sheet:
-- src/funds/reading.py reads it with Gemini, a review screen shows every figure
-- with the line it was read from and marks what the person must check, and only
-- what the person confirms is saved here. The person is the human in the loop
-- that D-210 asks for; nothing here is ever written without them.
--
-- Three guarantees this schema is built around:
--
--   * PRIVATE. Every row belongs to one reader and is read only through the
--     backend, which takes the reader from their token. RLS is on with no
--     policies, so anon and authenticated are denied outright and only
--     service_role reaches these tables, as for every other funds table.
--   * SEPARATE FROM THE CATALOGUE. These are not rows in `funds` or
--     `fund_factsheet_snapshots`, so the matcher, the browse grid, the dashboard
--     tile and other readers can never see them (D-153: no AI selects funds).
--   * NO DOCUMENT KEPT. The PDF is read and discarded; only its SHA-256 is
--     stored, as the document's identity. The figures and the quoted lines are
--     enough to trace every value back to the sheet.
--
-- Run this in the Supabase SQL editor before deploying the backend that serves
-- /api/fund-uploads. Safe to re-run (idempotent).


-- ── uploaded_funds: one fund a reader has added ────────────────────────────
-- Identity only. The figures live on the sheet rows below, one per confirmed
-- fact sheet, so a reader who uploads next month's sheet adds a row there and
-- keeps the history, the way the catalogue keeps its snapshots.
create table if not exists public.uploaded_funds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  name            text not null,
  fund_house      text,
  isin            text,
  jse_code        text,
  vehicle         text,
  asisa_category  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uploaded_funds_vehicle_check check (vehicle is null or vehicle in ('unit_trust', 'etf'))
);

-- A reader's list, newest first.
create index if not exists uploaded_funds_user_idx
  on public.uploaded_funds (user_id, updated_at desc);

-- One entry per fund per reader: a second upload of the same fund adds a sheet
-- to the fund they already have instead of a duplicate in their list. Partial,
-- because many sheets print no ISIN (no Allan Gray sheet does).
create unique index if not exists uploaded_funds_user_isin_key
  on public.uploaded_funds (user_id, isin) where isin is not null;


-- ── uploaded_fund_sheets: one confirmed fact sheet ─────────────────────────
-- `figures` holds the confirmed values under the same names as the columns of
-- fund_factsheet_snapshots (ter, tic, risk_indicator_raw, risk_indicator_1to5,
-- objective, ...), so the fund page and its components read an uploaded sheet
-- exactly as they read a catalogue one. JSON rather than columns because the
-- values are validated in Python (src/funds/validators.py) before any write, and
-- the field list grows as the reader learns new fields.
--
-- `provenance` records how each figure got here, per field:
--   {"ter": {"read": "confirmed" | "check" | "missing",   -- what the reader said
--            "by": "model" | "person",                     -- who set the saved value
--            "quote": "...", "page": 2,                    -- where on the sheet
--            "reasons": ["..."]}}                          -- why it was flagged
-- so a figure can always be traced to the line it came from, and a reviewer can
-- tell a value the person typed from one they accepted.
create table if not exists public.uploaded_fund_sheets (
  id                uuid primary key default gen_random_uuid(),
  uploaded_fund_id  uuid not null references public.uploaded_funds (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete cascade,  -- denormalised: every read filters by owner
  as_of             date not null,          -- the sheet's own as-at date
  file_sha256       text not null,          -- the document's identity; the PDF itself is not kept
  figures           jsonb not null,
  provenance        jsonb not null,
  model             text,                   -- the Gemini model that read it
  prompt_version    text,                   -- src/funds/reading.py PROMPT_VERSION at the time
  confirmed_at      timestamptz not null default now(),
  constraint uploaded_fund_sheets_document_key unique (uploaded_fund_id, as_of, file_sha256)
);

-- Every read wants a fund's newest sheet.
create index if not exists uploaded_fund_sheets_latest_idx
  on public.uploaded_fund_sheets (uploaded_fund_id, as_of desc, confirmed_at desc);


-- ── fact_sheet_readings: the model's answer, by document ────────────────────
-- A cache, so the same public fact sheet uploaded by ten readers costs one
-- model call. Keyed by the document's hash, the model and the prompt version, so
-- a better prompt or a new model reads afresh. No user_id: this is a reading of
-- a published document, not anyone's data. A document the model judged NOT to
-- be a fact sheet keeps only that verdict, with no payload, so nothing read from
-- someone's private document is stored.
create table if not exists public.fact_sheet_readings (
  file_sha256     text not null,
  model           text not null,
  prompt_version  text not null,
  is_fact_sheet   boolean not null,
  payload         jsonb,                    -- the model's raw answer; null when not a fact sheet
  tokens          jsonb,                    -- {"input", "output", "thinking"} for cost
  created_at      timestamptz not null default now(),
  constraint fact_sheet_readings_pkey primary key (file_sha256, model, prompt_version)
);


-- ── fact_sheet_reads: one row per upload, for the daily limit ──────────────
-- Counted per reader per day by the upload endpoint. In the database rather
-- than in memory because Cloud Run can run several instances, and a limit each
-- instance keeps alone is a limit multiplied by however many are up.
create table if not exists public.fact_sheet_reads (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.users (id) on delete cascade,
  file_sha256  text not null,
  cached       boolean not null,            -- true when it cost no model call
  created_at   timestamptz not null default now()
);

create index if not exists fact_sheet_reads_user_idx
  on public.fact_sheet_reads (user_id, created_at desc);


-- ── grants and RLS ─────────────────────────────────────────────────────────
-- Backend-only, like every funds table: RLS on with no policies denies anon and
-- authenticated while service_role bypasses it. Deletes are allowed here, unlike
-- the catalogue: these are a reader's own records, and removing a fund from
-- their list removes it.
grant select, insert, update, delete on public.uploaded_funds to service_role;
grant select, insert, update, delete on public.uploaded_fund_sheets to service_role;
grant select, insert, update, delete on public.fact_sheet_readings to service_role;
grant select, insert, delete on public.fact_sheet_reads to service_role;

alter table public.uploaded_funds enable row level security;
alter table public.uploaded_fund_sheets enable row level security;
alter table public.fact_sheet_readings enable row level security;
alter table public.fact_sheet_reads enable row level security;
