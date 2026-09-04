-- Funds catalogue: South African unit trusts and JSE-listed ETFs.
--
-- Why this exists: coverage today is discretionary US equities, and the honest
-- limit of that was raised from three directions — a conservative saver wanting
-- surety and access wants a money market fund, not equities; a reader of an asset
-- page could not tell which market or currency it was in; and retail interest is
-- in funds more than single stocks. This adds one second asset class properly
-- rather than five superficially.
--
-- Why these tables and not columns on `assets`: `assets` is the scored-equity
-- table. Its `universe` is NOT NULL, `TickerScoper` selects from it by universe,
-- `rec_writer` requires a row for every recommendation, and every dashboard query
-- assumes a nightly score. A fund has no StockTwits stream, so the sentiment
-- phase would hand it a neutral 50, which convergence reads as quant-vs-sentiment
-- conflict and penalises; and cross-sectional percentiles would rank a Top-40
-- tracker against Nvidia. Funds are therefore a separate store that the nightly
-- pipeline never touches.
--
-- Why snapshots rather than current values: every collective investment scheme
-- must publish a Minimum Disclosure Document (MDD), updated at least quarterly
-- under Board Notice 92 of 2014 and in practice monthly. Keeping one row per
-- published sheet gives provenance from day one (every figure is attributable to
-- a dated document), makes a stale catalogue visible instead of silent, and
-- accumulates the history that rand-denominated unit trusts have no free price
-- feed for.
--
-- Note on constraints: this is the first migration here to use `check`. The
-- matcher reads `vehicle` and `risk_indicator_1to5` as closed sets — a stray
-- value would not error, it would quietly change which funds a user is shown.
-- `src/funds/validators.py` enforces the same rules with readable messages
-- before any write; these are the backstop for a hand-edit that bypasses it.
--
-- Run this in the Supabase SQL editor BEFORE deploying the backend with
-- FUNDS_ENABLED=true. Safe to re-run (idempotent).

-- ── asisa_categories: the published classification, versioned ───────────────
-- ASISA's standard classifies a portfolio in three tiers: where it invests
-- (geography), what it holds (asset class), and its focus within that. The
-- matcher works in these categories rather than any grouping of our own, which
-- is what keeps fund selection a lookup over published labels instead of a
-- judgement we are not licensed to make.
--
-- Versioned because the standard changes: the current revision took effect on
-- 1 October 2025, so a stored category has to say which revision it belongs to
-- or a future re-classification silently rewrites history.
--
-- The seeded rows are the SUBSET the catalogue covers, not the whole standard.
-- Reconcile against the published document before the copy review:
-- https://www.asisa.org.za (Fund Classification Standard).
create table if not exists public.asisa_categories (
  version     text not null,                          -- effective date of the standard revision
  code        text not null,                          -- stable slug used in code and rules
  tier1       text not null,                          -- geography: South African | Worldwide | Global | Regional
  tier2       text not null,                          -- asset class: Equity | Multi Asset | Interest Bearing | Real Estate
  tier3       text not null,                          -- focus within the class
  name        text not null,                          -- canonical display name, as printed on fact sheets
  created_at  timestamptz not null default now(),
  constraint asisa_categories_pkey primary key (version, code)
);

insert into public.asisa_categories (version, code, tier1, tier2, tier3, name) values
  ('2025-10-01', 'sa_ib_money_market',  'South African', 'Interest Bearing', 'Money Market',  'South African - Interest Bearing - Money Market'),
  ('2025-10-01', 'sa_ib_short_term',    'South African', 'Interest Bearing', 'Short Term',    'South African - Interest Bearing - Short Term'),
  ('2025-10-01', 'sa_ib_variable_term', 'South African', 'Interest Bearing', 'Variable Term', 'South African - Interest Bearing - Variable Term'),
  ('2025-10-01', 'sa_ma_income',        'South African', 'Multi Asset',      'Income',        'South African - Multi Asset - Income'),
  ('2025-10-01', 'sa_ma_low_equity',    'South African', 'Multi Asset',      'Low Equity',    'South African - Multi Asset - Low Equity'),
  ('2025-10-01', 'sa_ma_medium_equity', 'South African', 'Multi Asset',      'Medium Equity', 'South African - Multi Asset - Medium Equity'),
  ('2025-10-01', 'sa_ma_high_equity',   'South African', 'Multi Asset',      'High Equity',   'South African - Multi Asset - High Equity'),
  ('2025-10-01', 'sa_ma_flexible',      'South African', 'Multi Asset',      'Flexible',      'South African - Multi Asset - Flexible'),
  ('2025-10-01', 'sa_eq_general',       'South African', 'Equity',           'SA General',    'South African - Equity - SA General'),
  ('2025-10-01', 'sa_re_general',       'South African', 'Real Estate',      'General',       'South African - Real Estate - General'),
  ('2025-10-01', 'gl_eq_general',       'Global',        'Equity',           'General',       'Global - Equity - General'),
  ('2025-10-01', 'gl_ma_high_equity',   'Global',        'Multi Asset',      'High Equity',   'Global - Multi Asset - High Equity'),
  ('2025-10-01', 'gl_re_general',       'Global',        'Real Estate',      'General',       'Global - Real Estate - General'),
  ('2025-10-01', 'ww_ma_flexible',      'Worldwide',     'Multi Asset',      'Flexible',      'Worldwide - Multi Asset - Flexible')
on conflict (version, code) do nothing;

-- ── funds: one row per investable product ──────────────────────────────────
-- Keyed on ISIN rather than a ticker or a name. A unit trust has no ticker at
-- all, names carry the management company's brand and change when a fund moves
-- house, and share classes multiply — the ISIN is the one identifier that
-- survives all three. (A fund found during design was still named for its
-- previous management company on a platform months after the move.)
create table if not exists public.funds (
  id                 uuid primary key default gen_random_uuid(),
  isin               text not null,                   -- primary identifier; unique below
  name               text not null,                   -- as printed on the fact sheet, share class included
  fund_house         text not null,                   -- the brand a user recognises, e.g. 'Satrix'
  manco              text not null,                   -- CISCA-registered manager that ISSUES the MDD; often
                                                      -- not the branded house (boutiques are co-named)
  vehicle            text not null,                   -- 'unit_trust' | 'etf'
  is_index_tracker   boolean not null default false,  -- published objective is to track an index; makes the
                                                      -- 'broad-market tracker' bracket a fact, not a judgement
  jse_code           text,                            -- ETFs only; unit trusts are not listed
  yahoo_symbol       text,                            -- ETFs only, '<code>.JO'; the only free price feed
  asisa_geography    text not null,                   -- tier 1, denormalised for filtering
  asisa_asset_class  text not null,                   -- tier 2
  asisa_category     text not null,                   -- canonical tier-3 name, joins asisa_categories.name
  tfsa_eligible      boolean not null default false,  -- available inside a tax-free account
  platforms          text[] not null default '{}',    -- where a user can actually buy it
  mdd_page_url       text,                            -- manager's page the current MDD is resolved from
  curation_rule      text,                            -- why this fund is in the catalogue, shown in the UI
  is_active          boolean not null default true,   -- soft-retire, never delete: snapshots are evidence
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint funds_isin_key unique (isin),
  constraint funds_vehicle_check check (vehicle in ('unit_trust', 'etf'))
);

-- The catalogue reads active funds and filters by category; the admin view and
-- the extractor group by manager.
create index if not exists funds_active_category_idx on public.funds (is_active, asisa_category);
create index if not exists funds_manco_idx on public.funds (manco);

-- ── fund_factsheet_snapshots: one row per published fact sheet ─────────────
-- Append-only. A correction re-issued for the same month arrives as another row
-- (a different document hash), so the earlier figures stay visible rather than
-- being overwritten — which is the whole point of showing an as-at date.
--
-- `risk_indicator_raw` keeps the manager's own wording and `risk_indicator_1to5`
-- the normalised form the ceiling rule compares. Both are stored because the UI
-- quotes the manager ("classified as Low to Moderate") while the rule needs a
-- number, and a normalisation that silently guessed would be invisible.
create table if not exists public.fund_factsheet_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  fund_id                     uuid not null references public.funds (id) on update cascade on delete cascade,
  as_of                       date not null,          -- the sheet's own as-at date, NOT when we read it
  mdd_url                     text not null,          -- the manager's URL, fetched from origin
  mdd_sha256                  text not null,          -- document identity; also the re-issue discriminator
  risk_indicator_raw          text,                   -- the manager's wording, e.g. 'Low to Moderate'
  risk_indicator_1to5         smallint,               -- 1 Low .. 5 High; null = unpublished, never matched
  recommended_min_term_years  numeric,                -- the sheet's recommended minimum investment term
  objective                   text,                   -- the fund's stated objective, quoted not paraphrased
  asset_allocation            jsonb,                  -- {equity, bonds, cash, property, offshore, ...} percent
  benchmark                   text,
  ter                         numeric,                -- total expense ratio, percent
  tc                          numeric,                -- transaction costs, percent
  tic                         numeric,                -- total investment charge = ter + tc, percent
  performance                 jsonb,                  -- annualised returns vs benchmark, by horizon
  top_holdings                jsonb,
  min_lump_sum                numeric,                -- manager minimums; a platform may waive them
  min_debit_order             numeric,
  distribution_frequency      text,                   -- e.g. 'Quarterly', 'Semi-annually (March & September)'
  fund_size_zar               numeric,                -- drives the published inclusion rule
  source                      text not null default 'manual',    -- 'manual' | 'extracted_unreviewed' | 'extracted_verified'
  entered_by                  text,                   -- who transcribed or approved it
  reviewed_by                 text,
  review_status               text not null default 'approved',  -- 'pending' | 'approved' | 'rejected'
  mdd_pdf_ref                 text,                   -- storage path of the archived PDF
  extracted_text_ref          text,                   -- storage path of the extracted text, for audit
  created_at                  timestamptz not null default now(),
  constraint fund_snapshots_document_key unique (fund_id, as_of, mdd_sha256),
  constraint fund_snapshots_risk_check check (risk_indicator_1to5 is null or risk_indicator_1to5 between 1 and 5),
  constraint fund_snapshots_source_check check (source in ('manual', 'extracted_unreviewed', 'extracted_verified')),
  constraint fund_snapshots_review_check check (review_status in ('pending', 'approved', 'rejected'))
);

-- Every read wants the newest approved sheet per fund. `created_at` breaks the
-- tie when a correction lands for a month that already has one.
create index if not exists fund_snapshots_latest_idx
  on public.fund_factsheet_snapshots (fund_id, as_of desc, created_at desc);

-- ── fund_prices: ETF closes only ───────────────────────────────────────────
-- ETFs are listed, so a free daily close exists (yfinance, '<code>.JO', quoted
-- in rand cents). Unit trusts are not listed and have no free history feed, so
-- they have no rows here and the UI shows the sheet's own performance table
-- instead of a chart. Deliberately not backfilled from anywhere: an invented
-- series on a fund page would be the one number a reader would most trust.
create table if not exists public.fund_prices (
  fund_id     uuid not null references public.funds (id) on update cascade on delete cascade,
  price_date  date not null,
  close_zar   numeric not null,
  fetched_at  timestamptz not null default now(),
  constraint fund_prices_pkey primary key (fund_id, price_date)
);

-- ── grants and RLS ─────────────────────────────────────────────────────────
-- Backend-only, like every other table here: RLS on with no policies denies
-- anon and authenticated while service_role bypasses it. The frontend reads
-- this data through /api/fund-catalogue, which is also where the matcher runs —
-- the rules stay on the server so a client cannot lift its own risk ceiling.
--
-- No delete on funds or snapshots: funds soft-retire via is_active, and a
-- snapshot is the evidence behind a figure that has already been shown.
grant select, insert, update on public.asisa_categories to service_role;
grant select, insert, update on public.funds to service_role;
grant select, insert, update on public.fund_factsheet_snapshots to service_role;
grant select, insert, update, delete on public.fund_prices to service_role;

alter table public.asisa_categories enable row level security;
alter table public.funds enable row level security;
alter table public.fund_factsheet_snapshots enable row level security;
alter table public.fund_prices enable row level security;

-- ── storage: the archived fact sheets ──────────────────────────────────────
-- Private bucket holding one PDF per snapshot at '<isin>/<as_of>.pdf'. Private
-- because these are the managers' documents: users are linked to the manager's
-- own URL, and the stored copy is the fallback for when that link rots. The API
-- hands out short-lived signed URLs, so no storage.objects policy is needed.
--
-- If this insert is refused on your project, create the bucket in the Supabase
-- dashboard instead (private, application/pdf) — that is how the badges bucket
-- was made, and nothing else here depends on the SQL path.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('mdd', 'mdd', false, array['application/pdf'])
on conflict (id) do nothing;
